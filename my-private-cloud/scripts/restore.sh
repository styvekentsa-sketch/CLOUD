#!/usr/bin/env bash
# =============================================================================
#  restore.sh — Restaure une sauvegarde de backup.sh (typiquement sur le VPS)
# -----------------------------------------------------------------------------
#  Pré-requis : dossier my-private-cloud copié sur le VPS, Docker installé,
#               AUCUNE instance Nextcloud déjà installée (installation vierge).
#
#  Usage :
#    ./scripts/restore.sh backups/nc-backup-AAAAMMJJ-HHMMSS
#
#  - Si .env est absent, il est recréé depuis env.backup (mêmes mots de passe).
#    Passez-le ensuite en mode VPS :  ./scripts/init-env.sh vps cloud.mondomaine.fr
#    (le script conserve les mots de passe). Vous pouvez aussi le faire AVANT.
#  - Si data.tar est absent (backup --no-data), les fichiers doivent déjà être
#    présents dans NEXTCLOUD_DATA_DIR (copiés avec rsync).
# =============================================================================
set -euo pipefail
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

SRC="${1:?Usage: restore.sh <dossier-de-sauvegarde>}"
[ -f "$SRC/db.dump" ] && [ -f "$SRC/html.tar.gz" ] || { echo "ERREUR : sauvegarde incomplète dans $SRC" >&2; exit 1; }

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
DC="docker compose"

log "Vérification des empreintes"
( cd "$SRC" && sha256sum -c SHA256SUMS )

if [ ! -f .env ]; then
  log ".env absent : restauration depuis env.backup"
  cp "$SRC/env.backup" .env && chmod 600 .env
fi
set -a; . ./.env; set +a
DATA_DIR="${NEXTCLOUD_DATA_DIR:-./cloud_data}"

if $DC run --rm --no-deps -T --entrypoint sh app -c 'test -f /var/www/html/config/config.php' 2>/dev/null; then
  echo "ERREUR : une instance Nextcloud existe déjà (volume nextcloud_html)." >&2
  echo "         Pour écraser : docker compose down -v  (DÉTRUIT la base et l'appli)" >&2
  exit 1
fi

log "Arrêt des services éventuels"
$DC down

mkdir -p "$DATA_DIR"

log "Démarrage de PostgreSQL et Redis"
$DC up -d --wait db redis

log "Restauration de la base de données"
$DC exec -T db pg_restore -U "${POSTGRES_USER:-nextcloud}" -d "${POSTGRES_DB:-nextcloud}" \
  --clean --if-exists --no-owner --role="${POSTGRES_USER:-nextcloud}" < "$SRC/db.dump"

log "Restauration de /var/www/html (config, apps, version)"
# (les fichiers montés en lecture seule depuis ./config sont exclus)
$DC run --rm --no-deps -T -u root --entrypoint sh app -c '
  tar -C /var/www/html \
      --exclude=./config/zz-mode.config.php \
      --exclude=./config/mimetypemapping.json \
      --exclude=./config/mimetypealiases.json -xzf - &&
  find /var/www/html -path /var/www/html/data -prune \
       -o -path /var/www/html/config/zz-mode.config.php -prune \
       -o -path /var/www/html/config/mimetypemapping.json -prune \
       -o -path /var/www/html/config/mimetypealiases.json -prune \
       -o -exec chown www-data:www-data {} +' < "$SRC/html.tar.gz"

if [ -f "$SRC/data.tar" ]; then
  log "Restauration des fichiers utilisateurs -> $DATA_DIR"
  $DC run --rm --no-deps -T -u root --entrypoint sh app \
    -c 'tar -C /var/www/html/data -xf -' < "$SRC/data.tar"
else
  log "Pas de data.tar : utilisation des fichiers déjà présents dans $DATA_DIR"
fi

log "Correction des droits (www-data, 0770)"
rm -f "$DATA_DIR/.perms-initialized" 2>/dev/null || true
$DC run --rm --no-deps -T -u root --entrypoint sh app \
  -c 'rm -f /var/www/html/data/.perms-initialized; chown -R www-data:www-data /var/www/html/data && chmod 0770 /var/www/html/data'

log "Démarrage complet de la stack"
PROFILE_ARGS=()
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] && PROFILE_ARGS=(--profile cloudflare)
$DC "${PROFILE_ARGS[@]}" up -d

log "Attente de Nextcloud..."
for _ in $(seq 1 60); do
  $DC exec -T -u www-data app php occ status >/dev/null 2>&1 && break
  sleep 5
done

OCC="$DC exec -T -u www-data app php occ"
log "Finalisation : maintenance off, empreinte, rescan, optimisations"
$OCC maintenance:mode --off || true
$OCC maintenance:data-fingerprint
$OCC files:scan --all
$DC exec -T -u www-data app sh /opt/scripts/optimize.sh

log "Restauration terminée."
echo "Mode actuel : CLOUD_MODE=${CLOUD_MODE:-local} — URL : ${NEXTCLOUD_URL:-?}"
echo "Si besoin : ./scripts/init-env.sh vps <domaine> && docker compose --profile npm up -d"
