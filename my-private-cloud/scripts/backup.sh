#!/usr/bin/env bash
# =============================================================================
#  backup.sh — Sauvegarde complète et MIGRABLE de my-private-cloud
# -----------------------------------------------------------------------------
#  Contenu de la sauvegarde (backups/nc-backup-AAAAMMJJ-HHMMSS/) :
#    db.dump            Base PostgreSQL (format custom pg_dump, compressé)
#    html.tar.gz        /var/www/html sans les données (config.php, apps, version)
#    data.tar           Fichiers utilisateurs (sauf --no-data)
#    env.backup         Copie du .env (mots de passe : à protéger !)
#    MANIFEST.txt       Versions, tailles, date
#    SHA256SUMS         Empreintes pour vérifier le transfert
#
#  Usage (dans le dossier my-private-cloud ; Windows : via Git Bash) :
#    ./scripts/backup.sh                  # sauvegarde complète
#    ./scripts/backup.sh --no-data        # sans les fichiers (à copier via rsync)
#    ./scripts/backup.sh --dest /mnt/usb  # dossier de destination
#    ./scripts/backup.sh --keep 7         # ne garder que les 7 dernières
#
#  Restauration sur le VPS : ./scripts/restore.sh <dossier-de-sauvegarde>
# =============================================================================
set -euo pipefail

# Git Bash (Windows) : empêche la conversion des chemins /var/... en C:/...
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"

cd "$(dirname "$0")/.."

WITH_DATA=1
DEST="./backups"
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-data) WITH_DATA=0 ;;
    --dest)    DEST="$2"; shift ;;
    --keep)    KEEP="$2"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
  shift
done

[ -f .env ] || { echo "ERREUR : .env introuvable" >&2; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

DC="docker compose"
OCC="$DC exec -T -u www-data app php occ"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${DEST%/}/nc-backup-${STAMP}"
mkdir -p "$OUT"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

$DC ps --status running --services | grep -qx app \
  || { echo "ERREUR : le conteneur 'app' n'est pas démarré (docker compose up -d)" >&2; exit 1; }

# --- 1. Mode maintenance (garantit une sauvegarde cohérente) ------------------
log "Activation du mode maintenance"
$OCC maintenance:mode --on
trap 'log "Désactivation du mode maintenance"; $OCC maintenance:mode --off >/dev/null || true' EXIT

# --- 2. Base de données --------------------------------------------------------
log "Dump PostgreSQL -> db.dump"
$DC exec -T db pg_dump -U "${POSTGRES_USER:-nextcloud}" -d "${POSTGRES_DB:-nextcloud}" -Fc -Z 6 > "$OUT/db.dump"
[ -s "$OUT/db.dump" ] || { echo "ERREUR : dump vide" >&2; exit 1; }

# --- 3. Application (config.php, apps tierces, thèmes, version) --------------
log "Archive de /var/www/html (sans data) -> html.tar.gz"
#  (les fichiers montés depuis ./config sont exclus : ils voyagent avec le projet)
$DC exec -T app tar -C /var/www/html --exclude=./data \
  --exclude=./config/zz-mode.config.php \
  --exclude=./config/mimetypemapping.json \
  --exclude=./config/mimetypealiases.json \
  -czf - . > "$OUT/html.tar.gz"

# --- 4. Données utilisateurs ---------------------------------------------------
if [ "$WITH_DATA" = 1 ]; then
  log "Archive des fichiers utilisateurs -> data.tar (peut être long)"
  # Lu depuis le conteneur : droits corrects quel que soit l'OS hôte
  $DC exec -T app tar -C /var/www/html/data --exclude=./.perms-initialized -cf - . > "$OUT/data.tar"
else
  log "Données NON incluses (--no-data) : copiez ${NEXTCLOUD_DATA_DIR:-./cloud_data} avec rsync"
fi

# --- 5. Configuration ----------------------------------------------------------
cp .env "$OUT/env.backup"
chmod 600 "$OUT/env.backup" 2>/dev/null || true

NC_VERSION="$($OCC status --output=json 2>/dev/null | sed -n 's/.*"versionstring":"\([^"]*\)".*/\1/p')"
{
  echo "date=$(date -Iseconds)"
  echo "source_host=$(hostname)"
  echo "cloud_mode=${CLOUD_MODE:-local}"
  echo "nextcloud_version=${NC_VERSION:-inconnue}"
  echo "nextcloud_image=my-private-cloud/nextcloud:${NEXTCLOUD_IMAGE_TAG:-32-apache} (base nextcloud:${NEXTCLOUD_IMAGE_TAG:-32-apache} + ffmpeg/imagick)"
  echo "postgres_image=postgres:${POSTGRES_IMAGE_TAG:-17-alpine}"
  echo "with_data=${WITH_DATA}"
} > "$OUT/MANIFEST.txt"

# --- 6. Fin de maintenance + empreintes ---------------------------------------
$OCC maintenance:mode --off >/dev/null
trap - EXIT
log "Mode maintenance désactivé"

log "Calcul des empreintes SHA256"
( cd "$OUT" && sha256sum db.dump html.tar.gz env.backup MANIFEST.txt $( [ -f data.tar ] && echo data.tar ) > SHA256SUMS )

# --- 7. Rotation ---------------------------------------------------------------
if [ "$KEEP" -gt 0 ]; then
  ls -1d "${DEST%/}"/nc-backup-* 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
    log "Suppression ancienne sauvegarde : $old"; rm -rf "$old"
  done
fi

log "Sauvegarde terminée : $OUT"
du -sh "$OUT"/* 2>/dev/null || true
cat <<EOF

Migration vers le VPS :
  scp -r "$OUT" utilisateur@vps:/srv/my-private-cloud/backups/
  (ou, avec --no-data : rsync -aP ${NEXTCLOUD_DATA_DIR:-./cloud_data}/ utilisateur@vps:/srv/cloud_data/)
Puis sur le VPS :  ./scripts/restore.sh backups/$(basename "$OUT")
EOF
