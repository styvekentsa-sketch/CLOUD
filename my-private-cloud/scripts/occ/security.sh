#!/bin/sh
# =============================================================================
#  Durcissement des accès — conteneur "app", www-data. Idempotent.
#  Ne modifie QUE la configuration (config.php / oc_appconfig) : aucun compte,
#  fichier ou partage existant n'est supprimé.
#
#  Variables (.env) :
#    SECURITY_ALLOW_PUBLIC_LINKS   false = aucun lien public (accès anonyme fermé)
#    SECURITY_2FA_ENFORCED_GROUPS  "admin Entreprises Equipe" | all | none
#    PASSWORD_MIN_LENGTH           longueur minimale (défaut 12)
#    DEFAULT_QUOTA                 quota par défaut des nouveaux comptes ("none" = illimité)
# =============================================================================
set -eu
occ() { php /var/www/html/occ "$@"; }
yn() { case "$1" in true|1|yes|on) echo yes ;; *) echo no ;; esac; }
app_on() {
  if occ app:enable "$1" >/dev/null 2>&1 || occ app:install "$1" >/dev/null 2>&1; then
    echo "    app $1 : activée"
  else
    echo "    ATTENTION : app $1 indisponible (App Store injoignable ou incompatible)"; return 1
  fi
}
app_off() { if occ app:disable "$1" >/dev/null 2>&1; then echo "    app $1 : désactivée"; fi; }
enabled() { occ app:list --enabled --output=json | grep -q "\"$1\""; }

# --- 1. Portail de connexion ------------------------------------------------------
echo "==> [security] Portail de connexion"
# Après connexion : tableau de bord puis fichiers. Sans session -> page de login.
occ config:system:set defaultapp --value="dashboard,files"
# Clients (WebDAV, CalDAV, FolderSync…) : mots de passe d'APPLICATION obligatoires,
# le mot de passe principal ne fonctionne que sur la page de connexion web.
occ config:system:set token_auth_enforced --value=true --type=boolean
occ config:system:set auth.bruteforce.protection.enabled --value=true --type=boolean
occ config:system:set login_form_autocomplete --value=false --type=boolean
occ config:system:set session_lifetime --value=86400 --type=integer              # 24 h
occ config:system:set remember_login_cookie_lifetime --value=1296000 --type=integer  # 15 j
occ config:system:set session_keepalive --value=true --type=boolean
# Comptes neufs vides (pas de fichiers d'exemple) : stockage propre dès la création
occ config:system:set skeletondirectory --value=""
occ config:system:set templatedirectory --value=""
app_on bruteforcesettings || true

# --- 2. Accès anonyme / invités -----------------------------------------------------
echo "==> [security] Accès anonyme et invités"
LINKS="$(yn "${SECURITY_ALLOW_PUBLIC_LINKS:-false}")"
occ config:app:set core shareapi_allow_links --value="$LINKS"
occ config:app:set core shareapi_allow_public_upload --value=no
# Si les liens sont réautorisés : mot de passe + expiration obligatoires
occ config:app:set core shareapi_enforce_links_password --value=yes
occ config:app:set core shareapi_default_expire_date --value=yes
occ config:app:set core shareapi_expire_after_n_days --value=14
occ config:app:set core shareapi_enforce_expire_date --value=yes
echo "    liens publics anonymes : $LINKS"
app_off guests
if [ "$LINKS" = no ]; then app_off sharebymail; fi
# Pas de partage fédéré (comptes d'autres serveurs) ni d'annuaire public
for k in outgoing_server2server_share_enabled incoming_server2server_share_enabled \
         outgoing_server2server_group_share_enabled incoming_server2server_group_share_enabled \
         lookupServerEnabled lookupServerUploadEnabled; do
  occ config:app:set files_sharing "$k" --value=no >/dev/null
done
echo "    partage fédéré / annuaire public : désactivés"

# --- 3. Isolation entre comptes et entreprises --------------------------------------
echo "==> [security] Isolation des comptes"
# Partage uniquement avec les membres de SES groupes (une entreprise ne voit pas l'autre)
occ config:app:set core shareapi_only_share_with_group_members --value=yes
# L'autocomplétion ne révèle que les comptes des mêmes groupes (ou saisie exacte)
occ config:app:set core shareapi_allow_share_dialog_user_enumeration --value=yes
occ config:app:set core shareapi_restrict_user_enumeration_to_group --value=yes
occ config:app:set core shareapi_restrict_user_enumeration_full_match --value=yes
occ config:app:set files default_quota --value="${DEFAULT_QUOTA:-none}"
echo "    partage limité aux groupes ; quota par défaut : ${DEFAULT_QUOTA:-none}"

# --- 4. Mots de passe complexes -------------------------------------------------------
echo "==> [security] Politique de mots de passe"
if app_on password_policy; then
  occ config:app:set password_policy minLength                --value="${PASSWORD_MIN_LENGTH:-12}"
  occ config:app:set password_policy enforceUpperLowerCase    --value=1
  occ config:app:set password_policy enforceNumericCharacters --value=1
  occ config:app:set password_policy enforceSpecialCharacters --value=1
  occ config:app:set password_policy enforceNonCommonPassword --value=1
  occ config:app:set password_policy enforceHaveIBeenPwned    --value=1   # mots de passe ayant fuité
  occ config:app:set password_policy historySize              --value=5
  occ config:app:set password_policy expiration               --value=0   # pas d'expiration forcée
  # 0 = pas de blocage du compte après N échecs (le ralentissement anti-force brute
  # suffit ; un FolderSync mal configuré ne doit pas désactiver le compte)
  occ config:app:set password_policy maximumLoginAttempts     --value=0
fi

# --- 5. Double authentification (2FA) ---------------------------------------------------
echo "==> [security] Double authentification"
app_on twofactor_backupcodes || true
app_on twofactor_totp || true        # Google Authenticator, Aegis, 2FAS, Bitwarden…
app_on twofactor_webauthn || true    # clés de sécurité / passkeys
G="${SECURITY_2FA_ENFORCED_GROUPS:-admin}"
if ! enabled twofactor_totp && ! enabled twofactor_webauthn; then
  echo "    ATTENTION : aucun fournisseur 2FA actif -> obligation NON appliquée (évite le blocage)"
  occ twofactorauth:enforce --off >/dev/null
elif [ "$G" = none ] || [ -z "$G" ]; then
  occ twofactorauth:enforce --off >/dev/null; echo "    2FA facultative pour tous"
elif [ "$G" = all ]; then
  occ twofactorauth:enforce --on >/dev/null; echo "    2FA OBLIGATOIRE pour tous les comptes"
else
  set --
  for g in $G; do set -- "$@" --group="$g"; done
  occ twofactorauth:enforce --on "$@" >/dev/null
  echo "    2FA OBLIGATOIRE pour les groupes : $G (facultative pour les autres)"
fi
