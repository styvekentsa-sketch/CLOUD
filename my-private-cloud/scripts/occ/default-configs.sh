#!/bin/sh
# Copie les fichiers config/*.config.php fournis par l'image Nextcloud
# (redis, apcu, smtp, reverse-proxy, apps, s3…) s'ils sont absents.
#
# Pourquoi : l'entrypoint de l'image ne les copie que si config/ est VIDE.
# Or docker-compose y monte nos propres fichiers (zz-mode.config.php,
# mimetype*.json) : sans ce script, Nextcloud ignore REDIS_HOST/REDIS_HOST_PASSWORD,
# SMTP_*, TRUSTED_PROXIES… ("Redis server went away").
# Idempotent : n'écrase jamais un fichier existant.
set -eu

src=/usr/src/nextcloud/config
dst=/var/www/html/config

for f in "$src"/*.config.php; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  if [ ! -e "$dst/$name" ]; then
    cp "$f" "$dst/$name"
    echo "    config/$name ajouté (fichier par défaut de l'image)"
  fi
done
