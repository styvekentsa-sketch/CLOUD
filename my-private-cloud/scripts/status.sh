#!/bin/sh
# =============================================================================
#  État global du cloud — Linux / macOS / VPS
#  Usage : ./scripts/status.sh   |   ./scripts/status.sh --full  (+ bilan santé)
# =============================================================================
set -u
cd "$(dirname "$0")/.."
title() { printf '\n\033[1;36m=== %s ===\033[0m\n' "$1"; }

title "Conteneurs"
docker compose ps --all --format "table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}"
bad="$(docker compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' | grep -E 'exited|dead|restarting|unhealthy' | grep -v '^init-perms ' || true)"
if [ -n "$bad" ]; then printf '\033[31mATTENTION :\n%s\033[0m\n' "$bad"; else printf '\033[32mTous les services sont sains.\033[0m\n'; fi

title "Ressources (instantané)"
ids="$(docker compose ps -q)"
# shellcheck disable=SC2086
[ -n "$ids" ] && docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" $ids

title "Disque des données"
DATA_DIR="$(grep -E '^NEXTCLOUD_DATA_DIR=' .env 2>/dev/null | cut -d= -f2-)"
df -h "${DATA_DIR:-./cloud_data}"
docker system df

title "Stockage par compte et par groupe"
docker compose exec -T -u www-data app php /opt/scripts/storage-report.php

if [ "${1:-}" = "--full" ]; then
  title "Bilan de performance et de santé"
  docker compose exec -T -u www-data app php /opt/scripts/health-check.php
fi
