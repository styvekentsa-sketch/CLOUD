#!/bin/sh
# =============================================================================
#  Génère / met à jour .env pour le mode LOCAL ou VPS (Linux / macOS / Git Bash)
#  Toutes les valeurs d'un .env existant (mots de passe, SMTP, quotas,
#  PostgreSQL, alertes…) sont CONSERVÉES : seules les variables liées au mode
#  sont recalculées.
#
#  Usage :  ./scripts/init-env.sh local [DATA_DIR]
#           ./scripts/init-env.sh vps cloud.mondomaine.fr [DATA_DIR]
# =============================================================================
set -eu
cd "$(dirname "$0")/.."

OLDF=""
if [ -f .env ]; then cp .env .env.bak; OLDF=.env.bak; echo ".env existant sauvegardé en .env.bak (valeurs conservées)"; fi
old() { [ -n "$OLDF" ] && grep -E "^$1=" "$OLDF" | head -n1 | cut -d= -f2- | grep -v '^CHANGE_ME$' || true; }
keep() { v="$(old "$1")"; if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "$2"; fi; }
secret() { LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c "$1"; }

MODE="${1:-local}"
case "$MODE" in
  local) DOMAIN="$(keep NEXTCLOUD_DOMAIN cloud.example.com)"; DATA_DIR="${2:-$(keep NEXTCLOUD_DATA_DIR ./cloud_data)}" ;;
  vps)   DOMAIN="${2:?Usage: init-env.sh vps <domaine> [DATA_DIR]}"; DATA_DIR="${3:-$(keep NEXTCLOUD_DATA_DIR ./cloud_data)}" ;;
  *)     echo "Mode inconnu: $MODE (local|vps)" >&2; exit 1 ;;
esac
PORT="${APP_PORT:-8080}"

ADMIN_PW="$(keep NEXTCLOUD_ADMIN_PASSWORD "$(secret 24)")"
PG_PW="$(keep POSTGRES_PASSWORD "$(secret 40)")"
REDIS_PW="$(keep REDIS_PASSWORD "$(secret 40)")"

if [ "$MODE" = local ]; then
  LAN_IP="${LAN_IP:-$( (hostname -I 2>/dev/null | awk '{print $1}') || true)}"
  [ -n "$LAN_IP" ] || LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
  HOST="$(hostname | tr '[:upper:]' '[:lower:]')"
  URL="http://${LAN_IP:-localhost}:${PORT}"
  TRUSTED="$(echo "localhost 127.0.0.1 ${LAN_IP} ${HOST}" | tr -s ' ')"
  OPROTO=""; OHOST=""; BIND="0.0.0.0"; LAN="true"
else
  URL="https://${DOMAIN}"; TRUSTED="${DOMAIN}"
  OPROTO="https"; OHOST="${DOMAIN}"; BIND="127.0.0.1"; LAN="false"
fi

# Variables recalculées pour le mode (toutes les autres viennent de l'ancien .env)
MODE_KEYS="CLOUD_MODE NEXTCLOUD_URL NEXTCLOUD_TRUSTED_DOMAINS NEXTCLOUD_TRUSTED_LAN NEXTCLOUD_DOMAIN OVERWRITE_PROTOCOL OVERWRITE_HOST APP_BIND APP_PORT NEXTCLOUD_DATA_DIR"
TMP="$(mktemp)"
{
  echo "CLOUD_MODE=${MODE}"; echo "NEXTCLOUD_URL=${URL}"; echo "NEXTCLOUD_TRUSTED_DOMAINS=${TRUSTED}"
  echo "NEXTCLOUD_TRUSTED_LAN=${LAN}"; echo "NEXTCLOUD_DOMAIN=${DOMAIN}"; echo "OVERWRITE_PROTOCOL=${OPROTO}"
  echo "OVERWRITE_HOST=${OHOST}"; echo "APP_BIND=${BIND}"; echo "APP_PORT=${PORT}"; echo "NEXTCLOUD_DATA_DIR=${DATA_DIR}"
  echo "NEXTCLOUD_ADMIN_PASSWORD=${ADMIN_PW}"; echo "POSTGRES_PASSWORD=${PG_PW}"; echo "REDIS_PASSWORD=${REDIS_PW}"
} > "$TMP"

# Fusion : modèle .env.example <- ancien .env (sauf mode) <- valeurs calculées
awk -v modekeys="$MODE_KEYS" '
  BEGIN { n = split(modekeys, a, " "); for (i = 1; i <= n; i++) mk[a[i]] = 1 }
  FILENAME == ARGV[1] { k = substr($0, 1, index($0, "=") - 1); calc[k] = substr($0, index($0, "=") + 1); next }
  FILENAME == ARGV[2] {
    if ($0 ~ /^[A-Z0-9_]+=/) { k = substr($0, 1, index($0, "=") - 1); v = substr($0, index($0, "=") + 1)
      if (!(k in mk) && v != "CHANGE_ME") { old[k] = v; order[++no] = k } }
    next }
  /^[A-Z0-9_]+=/ { k = substr($0, 1, index($0, "=") - 1); seen[k] = 1
    if (k in calc) { print k "=" calc[k]; next }
    if (k in old)  { print k "=" old[k]; next } }
  { print }
  END { hdr = 0
    for (i = 1; i <= no; i++) { k = order[i]; if (!(k in seen)) {
      if (!hdr) { print ""; print "# --- Variables personnalisées conservées ---"; hdr = 1 }
      print k "=" old[k] } } }
' "$TMP" "${OLDF:-/dev/null}" .env.example > .env
rm -f "$TMP"
chmod 600 .env

mkdir -p "$DATA_DIR" 2>/dev/null \
  || echo "ATTENTION : impossible de créer $DATA_DIR -> sudo mkdir -p $DATA_DIR" >&2
chmod +x scripts/*.sh scripts/occ/*.sh scripts/hooks/*/*.sh 2>/dev/null || true

echo ".env généré — mode ${MODE}"
echo "  URL      : ${URL}"
echo "  Domaines : ${TRUSTED}"
echo "  Données  : ${DATA_DIR}"
