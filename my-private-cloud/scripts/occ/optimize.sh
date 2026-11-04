#!/bin/sh
# =============================================================================
#  Optimisation Nextcloud — exécuté DANS le conteneur "app" en tant que www-data
#  - automatiquement après la première installation (hook post-installation)
#  - manuellement via scripts/optimize.ps1 ou scripts/optimize.sh (hôte)
#  Idempotent : peut être relancé sans risque.
# =============================================================================
set -eu

occ() { php /var/www/html/occ "$@"; }

echo "==> [optimize] Tâches de fond : mode cron (conteneur dédié)"
occ background:cron

echo "==> [optimize] Caches : APCu (local) + Redis (distribué + verrous)"
occ config:system:set memcache.local       --value='\OC\Memcache\APCu'
occ config:system:set memcache.distributed --value='\OC\Memcache\Redis'
occ config:system:set memcache.locking     --value='\OC\Memcache\Redis'
occ config:system:set filelocking.enabled  --value=true --type=boolean

echo "==> [optimize] Gros fichiers : morceaux de 50 Mo (compatible Cloudflare < 100 Mo)"
occ config:app:set files max_chunk_size --value=52428800

echo "==> [optimize] Réglages système"
occ config:system:set default_phone_region     --value="${DEFAULT_PHONE_REGION:-FR}"
occ config:system:set maintenance_window_start --value=1 --type=integer   # 01h-05h UTC
occ config:system:set loglevel                 --value=2 --type=integer   # warnings+
occ config:system:set log_rotate_size          --value=104857600 --type=integer
occ config:system:set trashbin_retention_obligation --value='auto, 30'
occ config:system:set versions_retention_obligation --value='auto, 90'

echo "==> [optimize] Aperçus : Preview Generator, 2048x2048 max, formats"
sh /opt/scripts/previews.sh

# Groupes AVANT la sécurité (la 2FA obligatoire cible des groupes existants)
sh /opt/scripts/groups.sh
sh /opt/scripts/security.sh
sh /opt/scripts/admin-dashboard.sh
sh /opt/scripts/mail-notifications.sh

echo "==> [optimize] Base de données : index / colonnes / clés manquants"
occ db:add-missing-indices
occ db:add-missing-columns
occ db:add-missing-primary-keys

echo "==> [optimize] Types MIME personnalisés (.crypt14, .db, .bak, .tar.gz…)"
occ maintenance:mimetype:update-db --repair-filecache
occ maintenance:mimetype:update-js

echo "==> [optimize] Réparation"
occ maintenance:repair --include-expensive

echo "==> [optimize] Terminé."
