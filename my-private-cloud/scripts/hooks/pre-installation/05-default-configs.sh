#!/bin/sh
# Hook officiel de l'image : exécuté AVANT la première installation.
# Ajoute les config/*.config.php de l'image (Redis, SMTP, proxy…) — voir le script.
exec sh /opt/scripts/default-configs.sh
