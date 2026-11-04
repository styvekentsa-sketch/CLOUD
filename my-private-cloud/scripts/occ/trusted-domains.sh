#!/bin/sh
# =============================================================================
#  Écrit 'trusted_domains' dans config.php à partir du .env (sans toucher la BDD)
#  - NEXTCLOUD_TRUSTED_DOMAINS : liste explicite (localhost, IP détectée, nom du PC…)
#  - NEXTCLOUD_TRUSTED_LAN=true : ajoute TOUTES les plages d'IP privées (RFC 1918)
#    en wildcard -> l'accès continue de fonctionner si l'IP du PC change.
#
#  Nextcloud accepte le joker "*" dans trusted_domains (ex. 192.168.*) ; le port
#  (":8080") est ignoré lors de la comparaison.
#
#  Exécuté automatiquement à chaque démarrage (hook before-starting), ou à la main :
#    docker compose exec -u www-data app sh /opt/scripts/trusted-domains.sh
# =============================================================================
set -eu
set -f   # IMPORTANT : pas d'expansion de "*" par le shell

occ() { php /var/www/html/occ "$@"; }

domains="${NEXTCLOUD_TRUSTED_DOMAINS:-localhost 127.0.0.1}"

case "${NEXTCLOUD_TRUSTED_LAN:-false}" in
  true|1|yes|on)
    lan="192.168.* 10.*"
    i=16
    while [ "$i" -le 31 ]; do lan="$lan 172.$i.*"; i=$((i + 1)); done
    # Noms mDNS / DNS locaux de box (ex. mon-pc.local, mon-pc.lan, mon-pc.home)
    lan="$lan *.local *.lan *.home"
    domains="$domains $lan"
    ;;
esac

# Dédoublonnage en conservant l'ordre
domains="$(printf '%s\n' $domains | awk 'NF && !seen[$0]++')"

occ config:system:delete trusted_domains >/dev/null 2>&1 || true
i=0
for d in $domains; do
  occ config:system:set trusted_domains "$i" --value="$d" >/dev/null
  i=$((i + 1))
done

echo "==> [trusted-domains] $i entrées : $(printf '%s ' $domains)"
