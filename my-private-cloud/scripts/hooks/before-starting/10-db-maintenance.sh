#!/bin/sh
# Hook officiel de l'image Nextcloud : exécuté à CHAQUE démarrage du conteneur.
#  1. Réécrit trusted_domains dans config.php depuis .env (local <-> VPS, LAN)
#  2. Ajoute les index BDD manquants (utile après une mise à jour de Nextcloud)
# Aucune réinitialisation : la base et les fichiers sont conservés.
set -eu

occ() { php /var/www/html/occ "$@"; }

# Fichiers config/*.config.php de l'image (Redis, SMTP, proxy…) s'ils manquent
sh /opt/scripts/default-configs.sh

if occ status --output=json 2>/dev/null | grep -q '"installed":true'; then
  sh /opt/scripts/trusted-domains.sh

  echo "==> [before-starting] Vérification des index / clés BDD"
  occ db:add-missing-indices      || true
  occ db:add-missing-columns      || true
  occ db:add-missing-primary-keys || true
fi
