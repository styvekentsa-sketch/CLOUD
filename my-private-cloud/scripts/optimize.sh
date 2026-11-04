#!/bin/sh
# =============================================================================
#  Applique les optimisations Nextcloud (idempotent) puis affiche le bilan de
#  performance et de santé — Linux / macOS
#    ./scripts/optimize.sh               # optimiser + bilan
#    ./scripts/optimize.sh --check-only  # bilan seulement
# =============================================================================
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" != "--check-only" ]; then
  docker compose exec -u www-data app sh /opt/scripts/optimize.sh
fi
exec docker compose exec -u www-data app php /opt/scripts/health-check.php
