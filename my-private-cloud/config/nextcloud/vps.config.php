<?php
// =============================================================================
//  Réglages Nextcloud — MODE VPS (Linux, HTTPS via NPM ou Cloudflare Tunnel)
//  Monté en lecture seule dans /var/www/html/config/zz-mode.config.php
// =============================================================================
$CONFIG = array (
  // Sur Linux, les droits 0770 sont appliqués : contrôle de sécurité actif.
  'check_data_directory_permissions' => true,

  // Verrouillage transactionnel des fichiers via Redis
  'filelocking.enabled' => true,
  'memcache.locking' => '\\OC\\Memcache\\Redis',
  'filelocking.ttl' => 7200,
);
