#!/bin/sh
# =============================================================================
#  Aperçus / vignettes : installation de Preview Generator + tailles optimisées
#  Exécuté dans le conteneur "app" (www-data) par optimize.sh. Idempotent.
#
#  Principe : au lieu de générer les vignettes À LA DEMANDE (lent quand on ouvre
#  une galerie sur smartphone), Preview Generator les pré-calcule en tâche de
#  fond (conteneur cron, toutes les 10 min) dans un nombre réduit de tailles.
# =============================================================================
set -eu
occ() { php /var/www/html/occ "$@"; }

echo "==> [previews] Application Preview Generator"
if occ app:list --output=json | grep -q '"previewgenerator"'; then
  occ app:enable previewgenerator >/dev/null && echo "    déjà installée (activée)"
else
  occ app:install previewgenerator \
    || echo "    ATTENTION : installation impossible (pas d'accès à l'App Store ou version incompatible)"
fi

echo "==> [previews] Taille maximale 2048x2048, qualité JPEG 70"
occ config:system:set preview_max_x              --value=2048 --type=integer
occ config:system:set preview_max_y              --value=2048 --type=integer
occ config:system:set preview_max_memory         --value=256  --type=integer  # Mo par image source
occ config:system:set preview_max_filesize_image --value=50   --type=integer  # Mo : au-delà, pas d'aperçu
occ config:system:set jpeg_quality               --value=70   --type=integer
occ config:app:set preview jpeg_quality          --value=70

echo "==> [previews] Tailles pré-générées (grille mobile/web + vue détaillée)"
# 32/256 carrés = icônes + grille Photos ; 256/384 en largeur = listes ; 256 en hauteur
occ config:app:set previewgenerator squareSizes --value="32 256"
occ config:app:set previewgenerator widthSizes  --value="256 384"
occ config:app:set previewgenerator heightSizes --value="256"

echo "==> [previews] Formats pris en charge"
occ config:system:delete enabledPreviewProviders >/dev/null 2>&1 || true
i=0
for p in PNG JPEG GIF BMP XBitmap WebP HEIC TIFF Krita MarkDown TXT OpenDocument MP3 Movie; do
  if [ "$p" = Movie ] && ! command -v ffmpeg >/dev/null 2>&1; then
    echo "    (ffmpeg absent : pas de vignettes vidéo)"; continue
  fi
  occ config:system:set enabledPreviewProviders "$i" --value="OC\\Preview\\$p" >/dev/null
  i=$((i + 1))
done
if command -v ffmpeg >/dev/null 2>&1; then
  occ config:system:set preview_ffmpeg_path --value="$(command -v ffmpeg)"
fi
echo "    $i fournisseurs d'aperçus actifs"

echo "==> [previews] Terminé. Génération initiale des vignettes existantes (longue) :"
echo "    docker compose exec -d -u www-data app php occ preview:generate-all"
