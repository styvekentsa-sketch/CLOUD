#!/bin/sh
# =============================================================================
#  Tableau de bord d'administration & audit — conteneur "app", www-data
#   - activity     : flux d'activité de chaque compte (web + mobile + e-mail)
#   - serverinfo   : Administration > Système (CPU, RAM, disque, stockage, BDD)
#   - admin_audit  : journal GLOBAL "qui a fait quoi" (connexions, envois,
#                    modifications, suppressions, partages, comptes)
#   - logreader    : Administration > Journalisation (lecture en direct)
# =============================================================================
set -eu
occ() { php /var/www/html/occ "$@"; }
app_on() {
  if occ app:enable "$1" >/dev/null 2>&1 || occ app:install "$1" >/dev/null 2>&1; then
    echo "    app $1 : activée"
  else
    echo "    ATTENTION : app $1 indisponible"
  fi
}

echo "==> [admin] Applications de suivi"
for a in dashboard activity serverinfo admin_audit logreader user_status sdrive_users; do app_on "$a"; done

echo "==> [admin] Journal d'audit -> journal principal (visible dans l'interface)"
DATADIR="$(occ config:system:get datadirectory)"
occ config:system:set log_type   --value=file
occ config:system:set logfile    --value="$DATADIR/nextcloud.log"
# Les entrées d'audit sont écrites dans nextcloud.log : elles apparaissent dans
# Administration > Journalisation (filtrer sur l'app "admin_audit").
occ config:system:set logfile_audit --value="$DATADIR/nextcloud.log"
# Toujours journaliser l'audit, même si loglevel = 2 (avertissements seulement)
occ config:system:set log.condition apps 0 --value=admin_audit

echo "==> [admin] Flux d'activité : conservation 1 an"
occ config:system:set activity_expire_days --value=365 --type=integer
echo "    OK"
