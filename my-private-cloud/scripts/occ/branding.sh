#!/bin/sh
# Identité visuelle S-Drive (app Theming + app Custom CSS). Idempotent.
#  - Nom, slogan, couleur : .env (BRAND_NAME, BRAND_SLOGAN, BRAND_COLOR)
#  - Logos, favicon, fond, CSS : config/branding/ (monté dans /opt/branding)
set -eu

occ() { php /var/www/html/occ "$@"; }
assets=/opt/branding

name=${BRAND_NAME:-S-Drive}
slogan=${BRAND_SLOGAN:-Votre cloud privé et sécurisé}
color=${BRAND_COLOR:-#4338CA}

echo "==> [branding] $name — couleur $color"
occ theming:config name "$name" >/dev/null
occ theming:config slogan "$slogan" >/dev/null
occ theming:config primary_color "$color" >/dev/null
occ theming:config background_color "#1E1B4B" >/dev/null
[ -z "${OVERWRITECLIURL:-}" ] || occ theming:config url "$OVERWRITECLIURL" >/dev/null

# Images (seulement si présentes dans config/branding/)
for key in logo logoheader favicon background; do
  f="$assets/$key.svg"
  if [ -f "$f" ]; then
    occ theming:config "$key" "$f" >/dev/null && echo "    $key : $key.svg"
  fi
done

# CSS personnalisé (app theming_customcss, installée si besoin)
if [ -f "$assets/custom.css" ]; then
  occ app:list --output=json 2>/dev/null | grep -q '"theming_customcss"' \
    || occ app:install theming_customcss >/dev/null 2>&1 || true
  if occ app:enable theming_customcss >/dev/null 2>&1; then
    occ config:app:set theming_customcss customcss --value="$(cat "$assets/custom.css")" >/dev/null
    occ config:app:set theming_customcss cachebuster --value="$(date +%s)" >/dev/null
    echo "    CSS personnalisé appliqué"
  else
    echo "    (app Custom CSS indisponible : CSS ignoré)"
  fi
fi

# Langue par défaut + pas de fichiers d'exemple "Welcome to Nextcloud" pour les nouveaux comptes
occ config:system:set default_language --value="${BRAND_LANGUAGE:-fr}" >/dev/null
occ config:system:set default_locale --value="${BRAND_LOCALE:-fr_FR}" >/dev/null
occ config:system:set skeletondirectory --value="" >/dev/null
echo "    Langue ${BRAND_LANGUAGE:-fr}, nouveaux comptes sans fichiers d'exemple"

occ maintenance:theme:update >/dev/null 2>&1 || true
