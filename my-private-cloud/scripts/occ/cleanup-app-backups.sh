#!/bin/sh
# =============================================================================
#  Purge des sauvegardes d'applications DATÉES (anti-saturation du disque)
# -----------------------------------------------------------------------------
#  WhatsApp crée chaque nuit (~2h) un fichier courant + une copie datée :
#      msgstore.db.crypt14                 <- écrasé chaque jour (règle "Remplacer")
#      msgstore-2026-11-03.1.db.crypt14    <- NOUVEAU fichier chaque jour
#  Le téléphone n'en garde que 7, mais le serveur les accumulerait indéfiniment.
#  Ce script supprime, dans les dossiers configurés, les fichiers dont le NOM
#  contient une date AAAA-MM-JJ plus ancienne que APP_BACKUP_RETENTION_DAYS,
#  puis resynchronise l'index Nextcloud (occ files:scan).
#
#  Variables (.env) :
#    APP_BACKUP_CLEANUP_DIRS   chemins relatifs aux fichiers de CHAQUE utilisateur,
#                              séparés par ";"  (ex. "Sauvegardes/WhatsApp/Databases")
#    APP_BACKUP_RETENTION_DAYS nombre de jours conservés (défaut 14)
#    APP_BACKUP_DRY_RUN=true   affiche sans supprimer
#
#  Planifié dans le conteneur cron (config/cron/www-data), ou à la main :
#    docker compose exec -u www-data cron sh /opt/scripts/cleanup-app-backups.sh
# =============================================================================
set -eu

DATA="${CLEANUP_DATA_ROOT:-/var/www/html/data}"
DIRS="${APP_BACKUP_CLEANUP_DIRS:-}"
DAYS="${APP_BACKUP_RETENTION_DAYS:-14}"
DRY="${APP_BACKUP_DRY_RUN:-false}"

occ() { php /var/www/html/occ "$@"; }
log() { echo "[cleanup-app-backups] $*"; }

[ -n "$DIRS" ] || { log "APP_BACKUP_CLEANUP_DIRS vide : rien à faire"; exit 0; }
case "$DAYS" in ''|*[!0-9]*) log "APP_BACKUP_RETENTION_DAYS invalide : $DAYS"; exit 1 ;; esac

CUTOFF="$(date -d "-${DAYS} days" +%Y%m%d)"
log "Suppression des fichiers datés d'avant le ${CUTOFF} (conservation ${DAYS} j)"

TMP="$(mktemp)"; DIRLIST="$(mktemp)"
trap 'rm -f "$TMP" "$DIRLIST"' EXIT
# Un dossier par ligne, espaces et "/" superflus retirés
printf '%s\n' "$DIRS" | tr ';' '\n' | sed 's#^ *##; s# *$##; s#^/*##; s#/*$##' | grep -v '^$' > "$DIRLIST" || true
total=0

while IFS= read -r rel; do
  for udir in "$DATA"/*/files; do
    [ -d "$udir" ] || continue
    user="$(basename "$(dirname "$udir")")"
    target="$udir/$rel"
    [ -d "$target" ] || continue

    : > "$TMP"
    find "$target" -type f -name '*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' | while IFS= read -r f; do
      d="$(basename "$f" | sed -n 's/.*\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\).*/\1\2\3/p')"
      if [ -n "$d" ] && [ "$d" -lt "$CUTOFF" ]; then printf '%s\n' "$f" >> "$TMP"; fi
    done

    n="$(wc -l < "$TMP" | tr -d ' ')"
    [ "$n" -gt 0 ] || continue

    while IFS= read -r f; do
      if [ "$DRY" = true ]; then log "[dry-run] $f"; else rm -f -- "$f"; fi
    done < "$TMP"

    log "$user/$rel : $n fichier(s) $( [ "$DRY" = true ] && echo 'à supprimer' || echo 'supprimé(s)')"
    total=$((total + n))
    [ "$DRY" = true ] || occ files:scan --path="/$user/files/$rel" >/dev/null
  done
done < "$DIRLIST"

log "Terminé : $total fichier(s) traité(s)"
