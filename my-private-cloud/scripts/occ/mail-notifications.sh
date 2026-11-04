#!/bin/sh
# =============================================================================
#  E-mail administrateur & notifications — conteneur "app", www-data. Idempotent.
#  Le SMTP (Gmail) est fourni par les variables SMTP_* du .env : l'image Nextcloud
#  les lit à chaque requête (config/smtp.config.php) -> le mot de passe n'est
#  jamais écrit dans config.php.
# =============================================================================
set -eu
occ() { php /var/www/html/occ "$@"; }
app_on() {
  if occ app:enable "$1" >/dev/null 2>&1 || occ app:install "$1" >/dev/null 2>&1; then
    echo "    app $1 : activée"
  else
    echo "    app $1 : indisponible pour cette version${2:+ ($2)}"
  fi
}

ADMIN="${NEXTCLOUD_ADMIN_USER:-admin}"

echo "==> [mail] Adresse e-mail du compte administrateur"
if [ -n "${ADMIN_EMAIL:-}" ]; then
  occ user:setting "$ADMIN" settings email "$ADMIN_EMAIL"
  echo "    $ADMIN -> $ADMIN_EMAIL"
else
  echo "    ADMIN_EMAIL vide dans .env : ignoré"
fi

echo "==> [mail] Serveur SMTP"
if [ -n "${SMTP_HOST:-}" ]; then
  echo "    $SMTP_HOST:${SMTP_PORT:-?} (${SMTP_SECURE:-auto}), compte ${SMTP_NAME:-?}, expéditeur ${MAIL_FROM_ADDRESS:-?}@${MAIL_DOMAIN:-?}"
  [ -n "${SMTP_PASSWORD:-}" ] || echo "    ATTENTION : SMTP_PASSWORD vide -> aucun e-mail ne partira (voir README)"
else
  echo "    SMTP_HOST vide : envoi d'e-mails désactivé"
fi

echo "==> [mail] Applications de notification"
app_on notifications
app_on activity
app_on admin_notifications "fonction reprise par 'occ notification:generate' de l'app notifications"

echo "==> [mail] Flux d'activité de l'admin : e-mail immédiat pour la sécurité"
occ config:app:set activity enable_email --value=yes
for t in security personal_settings; do
  occ user:setting "$ADMIN" activity "notify_email_$t" 1
  occ user:setting "$ADMIN" activity "notify_notification_$t" 1
done
occ user:setting "$ADMIN" activity notify_setting_batchtime 0     # 0 = dès que possible
echo "    OK (connexions 2FA, mots de passe d'application créés, changements de mot de passe/e-mail)"
