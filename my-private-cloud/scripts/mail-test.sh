#!/bin/sh
# =============================================================================
#  Test d'envoi d'e-mail (SMTP Gmail) — Linux / macOS / VPS
#    ./scripts/mail-test.sh                  # e-mail de test vers ADMIN_EMAIL
#    ./scripts/mail-test.sh autre@exemple.fr # vers une autre adresse
#    ./scripts/mail-test.sh --alert          # exemple d'alerte de sécurité
# =============================================================================
set -eu
cd "$(dirname "$0")/.."
if docker compose exec -T -u www-data app php occ list mail 2>/dev/null | grep -q 'mail:send-test'; then
  echo "Info : 'occ mail:send-test' est disponible sur cette version (voir : occ mail:send-test --help)."
fi
case "${1:-}" in
  --alert) exec docker compose exec -u www-data app php /opt/scripts/notify.php test-alert ;;
  "")      exec docker compose exec -u www-data app php /opt/scripts/notify.php test ;;
  *)       exec docker compose exec -u www-data app php /opt/scripts/notify.php test "$1" ;;
esac
