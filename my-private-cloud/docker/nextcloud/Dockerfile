# =============================================================================
#  Image Nextcloud enrichie pour les aperçus (vignettes) :
#   - ffmpeg                 -> vignettes des VIDÉOS (galeries smartphone)
#   - ImageMagick "extra"    -> HEIC/HEIF (photos iPhone), TIFF, SVG
#                               (supprime l'avertissement "php-imagick: no SVG support")
#  Construite automatiquement par "docker compose up -d" (ou "docker compose build").
# =============================================================================
ARG NEXTCLOUD_IMAGE_TAG=32-apache
FROM nextcloud:${NEXTCLOUD_IMAGE_TAG}

RUN set -eux; \
    apt-get update; \
    # Le nom du paquet dépend de la version Debian (ImageMagick 6 ou 7)
    magick_extra="$(apt-cache search --names-only '^libmagickcore-.*-extra$' | awk '{print $1}' | sort | tail -n1)"; \
    apt-get install -y --no-install-recommends ffmpeg ${magick_extra}; \
    rm -rf /var/lib/apt/lists/*; \
    ffmpeg -version | head -n1; \
    php -r 'echo "Imagick formats: ", count(Imagick::queryFormats()), " (HEIC: ", in_array("HEIC", Imagick::queryFormats()) ? "oui" : "non", ")\n";'
