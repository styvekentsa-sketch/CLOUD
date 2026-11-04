<?php
// =============================================================================
//  Réglages Nextcloud — MODE LOCAL (PC personnel, HTTP sur le réseau local)
//  Monté en lecture seule dans /var/www/html/config/zz-mode.config.php
// =============================================================================
$CONFIG = array (
  // Docker Desktop (Windows/macOS) ne sait pas appliquer les droits Unix 0770
  // sur un dossier de l'hôte : on désactive ce contrôle en local uniquement.
  'check_data_directory_permissions' => false,

  // Verrouillage transactionnel des fichiers via Redis (anti-corruption lors
  // des transferts concurrents / gros fichiers).
  'filelocking.enabled' => true,
  'memcache.locking' => '\\OC\\Memcache\\Redis',
  'filelocking.ttl' => 7200,   // 2 h : couvre les très gros transferts

  // HTTP local : aucune redirection HTTPS n'est forcée, car OVERWRITE_PROTOCOL
  // est vide dans .env (il passera à "https" en mode VPS).
);
