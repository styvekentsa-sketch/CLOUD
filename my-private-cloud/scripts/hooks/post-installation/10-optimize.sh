#!/bin/sh
# Hook officiel de l'image Nextcloud : exécuté UNE fois, juste après l'installation.
set -eu
exec sh /opt/scripts/optimize.sh
