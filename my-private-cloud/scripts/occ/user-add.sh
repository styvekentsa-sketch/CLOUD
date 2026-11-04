#!/bin/sh
# =============================================================================
#  Création d'un compte — conteneur "app", www-data
#  Usage :
#    sh /opt/scripts/user-add.sh --uid alice --name "Alice Martin" \
#       [--email alice@exemple.fr] [--group Entreprises] [--group Equipe] [--quota "50 GB"]
#  Un mot de passe TEMPORAIRE conforme à la politique est généré et affiché :
#  à transmettre par un canal sûr, l'utilisateur le change à sa 1re connexion.
# =============================================================================
set -eu
occ() { php /var/www/html/occ "$@"; }

uid=""; name=""; email=""; quota=""; groups=""
while [ $# -gt 0 ]; do
  case "$1" in
    --uid)   uid="$2"; shift ;;
    --name)  name="$2"; shift ;;
    --email) email="$2"; shift ;;
    --group) groups="$groups $2"; shift ;;
    --quota) quota="$2"; shift ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$uid" ] || { echo "Usage : user-add.sh --uid <id> --name \"Nom\" [--email] [--group]… [--quota]" >&2; exit 2; }
case "$uid" in *[!A-Za-z0-9._@-]*) echo "Identifiant invalide (lettres, chiffres, . _ @ - uniquement)" >&2; exit 2 ;; esac
[ -n "$name" ] || name="$uid"

if occ user:info "$uid" >/dev/null 2>&1; then echo "Le compte '$uid' existe déjà." >&2; exit 1; fi

# Mot de passe temporaire : 16 car. + majuscule, minuscule, chiffre, spécial
OC_PASS="$(php -r '$c="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";$s="";for($i=0;$i<16;$i++){$s.=$c[random_int(0,strlen($c)-1)];}echo $s."-".random_int(10,99)."Kq";')"
export OC_PASS

set --
for g in $groups; do set -- "$@" --group="$g"; done
occ user:add --password-from-env --display-name="$name" "$@" "$uid"

[ -z "$email" ] || occ user:setting "$uid" settings email "$email"
[ -z "$quota" ] || occ user:setting "$uid" files quota "$quota"

echo ""
echo "Compte créé : $uid ($name)"
echo "  Groupes  :${groups:- aucun}"
echo "  Quota    : ${quota:-par défaut}"
echo "  Mot de passe temporaire : $OC_PASS"
echo "  -> à transmettre par un canal sûr ; à changer dès la 1re connexion"
echo "     (Paramètres personnels > Sécurité), puis configurer la 2FA."
