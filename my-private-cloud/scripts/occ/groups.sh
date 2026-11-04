#!/bin/sh
# =============================================================================
#  Crée les groupes d'utilisateurs (idempotent) — conteneur "app", www-data
#  Liste dans .env : USER_GROUPS="Entreprises Clients Equipe" (noms sans espace)
# =============================================================================
set -eu
occ() { php /var/www/html/occ "$@"; }

echo "==> [groups] Groupes d'utilisateurs"
existing="$(occ group:list --output=json 2>/dev/null || echo '{}')"
for g in ${USER_GROUPS:-Entreprises Clients Equipe}; do
  if printf '%s' "$existing" | grep -q "\"$g\":"; then
    echo "    $g : existe déjà"
  else
    occ group:add "$g" >/dev/null && echo "    $g : créé"
  fi
done
