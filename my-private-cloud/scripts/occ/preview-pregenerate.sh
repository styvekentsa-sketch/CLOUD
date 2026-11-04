#!/bin/sh
# Lancé par le conteneur cron toutes les 10 min : génère les vignettes des
# fichiers récemment ajoutés. Verrou flock = jamais deux exécutions simultanées.
set -eu
occ() { php /var/www/html/occ "$@"; }

occ app:list --enabled --output=json 2>/dev/null | grep -q '"previewgenerator"' || exit 0

exec flock -n /tmp/preview-pregenerate.lock php /var/www/html/occ preview:pre-generate
