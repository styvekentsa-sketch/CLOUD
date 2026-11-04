#!/bin/sh
# Identité visuelle (app Theming) : nom, slogan, couleur principale.
# Valeurs lues dans .env (BRAND_NAME, BRAND_SLOGAN, BRAND_COLOR, NEXTCLOUD_URL).
# Logo et fond d'écran : inchangés (ceux de Nextcloud). Idempotent.
set -eu

occ() { php /var/www/html/occ "$@"; }

name=${BRAND_NAME:-S-Drive}
slogan=${BRAND_SLOGAN:-Votre cloud privé et sécurisé}
color=${BRAND_COLOR:-#4338CA}

echo "==> [branding] $name — couleur $color"
occ theming:config name "$name" >/dev/null
occ theming:config slogan "$slogan" >/dev/null
occ theming:config primary_color "$color" >/dev/null
[ -z "${OVERWRITECLIURL:-}" ] || occ theming:config url "$OVERWRITECLIURL" >/dev/null
