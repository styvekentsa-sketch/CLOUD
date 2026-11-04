#!/bin/sh
# Création de compte par les utilisateurs eux-mêmes (app "registration").
# Lien « Créer un compte » sur la page de connexion. Réglages lus dans .env :
#   REGISTRATION_ENABLED            true | false
#   REGISTRATION_GROUP              groupe des nouveaux comptes (ex. Clients)
#   REGISTRATION_EMAIL_VERIFICATION true = lien de confirmation envoyé par e-mail
#   REGISTRATION_ADMIN_APPROVAL     true = le compte attend l'accord d'un admin
# Idempotent.
set -eu

occ() { php /var/www/html/occ "$@"; }
bool() { occ config:app:set registration "$1" --value="$2" --type=boolean >/dev/null; }

echo "==> [inscription] Création de compte en libre-service"
if [ "${REGISTRATION_ENABLED:-false}" != "true" ]; then
  occ app:disable registration >/dev/null 2>&1 || true
  echo "    désactivée (REGISTRATION_ENABLED=false)"
  exit 0
fi

occ app:enable registration >/dev/null 2>&1 || occ app:install registration >/dev/null

group=${REGISTRATION_GROUP:-Clients}
occ group:add "$group" >/dev/null 2>&1 || true
occ config:app:set registration registered_user_group --value="$group" >/dev/null

verify=${REGISTRATION_EMAIL_VERIFICATION:-true}
approval=${REGISTRATION_ADMIN_APPROVAL:-false}
if [ "$verify" = "true" ]; then bool disable_email_verification false; else bool disable_email_verification true; fi
bool admin_approval_required "$approval"

# L'utilisateur choisit son propre identifiant ; nom complet demandé, e-mail obligatoire
bool email_is_optional false
bool email_is_login false
bool show_fullname true
bool enforce_fullname true
bool show_phone false
bool enforce_phone false
occ config:app:set registration additional_hint \
  --value="Choisissez un identifiant (sans espace) et un mot de passe d'au moins ${PASSWORD_MIN_LENGTH:-12} caractères." >/dev/null
occ config:app:set registration email_verification_hint \
  --value="Un lien de confirmation vient de vous être envoyé. Pensez à vérifier le dossier Spam." >/dev/null

echo "    activée : groupe « $group », vérification e-mail=$verify, accord admin=$approval"
