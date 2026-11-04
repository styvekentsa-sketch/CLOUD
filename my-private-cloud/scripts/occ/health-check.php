<?php
// =============================================================================
//  Bilan de performance & santé — exécuté DANS le conteneur "app" (www-data)
//    docker compose exec -u www-data app php /opt/scripts/health-check.php
//  Code retour : 0 = aucune erreur critique, 1 = au moins une erreur.
// =============================================================================

$counts = ['OK' => 0, 'WARN' => 0, 'ERR' => 0, 'INFO' => 0];
$localMode = getenv('OVERWRITEPROTOCOL') !== 'https';

function out(string $status, string $label, string $detail = ''): void {
    global $counts;
    $tags = ['OK' => "\033[32m[ OK ]\033[0m", 'WARN' => "\033[33m[WARN]\033[0m",
             'ERR' => "\033[31m[ERR ]\033[0m", 'INFO' => "\033[36m[INFO]\033[0m"];
    $counts[$status]++;
    printf("%s %-34s %s\n", $tags[$status], $label, $detail);
}
function section(string $t): void { echo "\n\033[1m== $t ==\033[0m\n"; }
function occ(string $args): string {
    return trim((string) shell_exec('php /var/www/html/occ ' . $args . ' 2>/dev/null'));
}
function check(bool $cond, string $label, string $detail, string $failStatus = 'ERR'): void {
    out($cond ? 'OK' : $failStatus, $label, $detail);
}
function bytes(string $v): float {
    $v = trim($v); $n = (float) $v; $u = strtoupper(substr($v, -1));
    return match ($u) { 'G' => $n * 1073741824, 'M' => $n * 1048576, 'K' => $n * 1024, default => $n };
}

// --- 1. Tâches de fond --------------------------------------------------------
section('Tâches de fond (cron)');
$mode = occ('config:app:get core backgroundjobs_mode');
check($mode === 'cron', 'Mode des tâches de fond', $mode ?: 'inconnu');
$last = (int) occ('config:app:get core lastcron');
$age = $last ? time() - $last : -1;
if ($age < 0) out('WARN', 'Dernière exécution de cron.php', 'jamais (attendre 5 min après le démarrage)');
else check($age <= 900, 'Dernière exécution de cron.php', sprintf('il y a %d s', $age), 'WARN');

// --- 2. PHP -----------------------------------------------------------------------
section('PHP');
$mem = ini_get('memory_limit');
check($mem === '-1' || bytes($mem) >= 512 * 1048576, 'memory_limit', $mem);
check(bytes(ini_get('upload_max_filesize')) >= 16 * 1073741824, 'upload_max_filesize', ini_get('upload_max_filesize'), 'WARN');
check(bytes(ini_get('post_max_size')) >= 16 * 1073741824, 'post_max_size', ini_get('post_max_size'), 'WARN');
check((bool) ini_get('opcache.enable'), 'OPcache', 'mémoire ' . ini_get('opcache.memory_consumption') . ' Mo, chaînes ' . ini_get('opcache.interned_strings_buffer') . ' Mo');
check(extension_loaded('apcu') && (bool) ini_get('apc.enable_cli'), 'APCu (cache local)', 'shm ' . ini_get('apc.shm_size'));

// --- 3. Caches Nextcloud ---------------------------------------------------------
section('Caches & verrouillage Nextcloud');
$local = occ('config:system:get memcache.local');
$dist  = occ('config:system:get memcache.distributed');
$lock  = occ('config:system:get memcache.locking');
check(str_contains($local, 'APCu'), 'memcache.local', $local ?: 'non défini');
check(str_contains($dist, 'Redis'), 'memcache.distributed', $dist ?: 'non défini', 'WARN');
check(str_contains($lock, 'Redis'), 'memcache.locking (verrous)', $lock ?: 'non défini → verrous en BDD (lent)');
$handler = ini_get('session.save_handler');
check($handler === 'redis', 'Sessions PHP', "save_handler = $handler", 'WARN');

// --- 4. Redis --------------------------------------------------------------------
section('Redis');
try {
    $r = new Redis();
    $r->connect(getenv('REDIS_HOST') ?: 'redis', (int) (getenv('REDIS_HOST_PORT') ?: 6379), 2.0);
    if ($pw = getenv('REDIS_HOST_PASSWORD')) $r->auth($pw);
    $m = $r->info('memory'); $s = $r->info('stats'); $k = $r->info('keyspace');
    out('OK', 'Connexion', 'PONG');
    $used = (float) $m['used_memory']; $max = (float) ($m['maxmemory'] ?? 0);
    $pct = $max > 0 ? $used / $max * 100 : 0;
    check($pct < 90, 'Mémoire', sprintf('%s / %s (%.0f %%), politique %s', $m['used_memory_human'],
        $max > 0 ? $m['maxmemory_human'] : 'illimitée', $pct, $m['maxmemory_policy'] ?? '?'), 'WARN');
    $hits = (int) $s['keyspace_hits']; $miss = (int) $s['keyspace_misses'];
    $ratio = ($hits + $miss) > 0 ? $hits / ($hits + $miss) * 100 : 100;
    check($ratio >= 80 || ($hits + $miss) < 1000, 'Taux de succès du cache', sprintf('%.1f %% (%d hits)', $ratio, $hits), 'WARN');
    check((int) $s['evicted_keys'] === 0 || $pct < 90, 'Clés évincées', (string) $s['evicted_keys'], 'WARN');
    out('INFO', 'Clés', implode(' ', array_map(fn($db, $v) => "$db: $v", array_keys($k), $k)) ?: 'aucune');
} catch (Throwable $e) {
    out('ERR', 'Redis', $e->getMessage());
}

// --- 5. PostgreSQL ------------------------------------------------------------------
section('PostgreSQL');
try {
    $pdo = new PDO(sprintf('pgsql:host=%s;dbname=%s', getenv('POSTGRES_HOST') ?: 'db', getenv('POSTGRES_DB') ?: 'nextcloud'),
        getenv('POSTGRES_USER') ?: 'nextcloud', getenv('POSTGRES_PASSWORD') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $show = fn(string $p) => $pdo->query("SHOW $p")->fetchColumn();
    out('OK', 'Connexion', 'PostgreSQL ' . strtok((string) $show('server_version'), ' '));
    $sb = $show('shared_buffers');
    check(bytes(str_replace('B', '', $sb)) >= 256 * 1048576, 'shared_buffers', $sb, 'WARN');
    out('INFO', 'effective_cache_size / work_mem', $show('effective_cache_size') . ' / ' . $show('work_mem'));
    out('INFO', 'random_page_cost / io_concurrency', $show('random_page_cost') . ' / ' . $show('effective_io_concurrency'));
    $row = $pdo->query("SELECT blks_hit, blks_read, pg_size_pretty(pg_database_size(current_database())) AS size
                        FROM pg_stat_database WHERE datname = current_database()")->fetch(PDO::FETCH_ASSOC);
    $tot = $row['blks_hit'] + $row['blks_read'];
    $hr = $tot > 0 ? $row['blks_hit'] / $tot * 100 : 100;
    check($hr >= 95 || $tot < 10000, 'Taux de cache (blocs en mémoire)', sprintf('%.2f %%', $hr), 'WARN');
    out('INFO', 'Taille de la base', $row['size']);
} catch (Throwable $e) {
    out('ERR', 'PostgreSQL', $e->getMessage());
}

// --- 6. Aperçus -----------------------------------------------------------------------
section('Aperçus (vignettes)');
$apps = json_decode(occ('app:list --enabled --output=json'), true) ?: [];
check(isset($apps['enabled']['previewgenerator']), 'Preview Generator', $apps['enabled']['previewgenerator'] ?? 'non installée', 'WARN');
$px = occ('config:system:get preview_max_x'); $py = occ('config:system:get preview_max_y');
check((int) $px > 0 && (int) $px <= 2048 && (int) $py <= 2048, 'Taille max des aperçus', "{$px}x{$py}", 'WARN');
$ff = trim((string) shell_exec('command -v ffmpeg'));
check($ff !== '', 'ffmpeg (vignettes vidéo)', $ff ?: 'absent', 'WARN');
if (class_exists('Imagick')) {
    $f = Imagick::queryFormats();
    check(in_array('SVG', $f, true), 'Imagick : SVG', in_array('SVG', $f, true) ? 'oui' : 'non', 'WARN');
    check(in_array('HEIC', $f, true), 'Imagick : HEIC (photos iPhone)', in_array('HEIC', $f, true) ? 'oui' : 'non', 'WARN');
} else {
    out('WARN', 'Imagick', 'extension absente');
}

// --- 7. Sécurité des accès & administration ---------------------------------------------
section('Sécurité & administration');
$en = $apps['enabled'] ?? [];
$appCfg = fn(string $app, string $key) => occ("config:app:get $app $key");
check(isset($en['password_policy']), 'Politique de mots de passe',
    isset($en['password_policy']) ? 'min. ' . $appCfg('password_policy', 'minLength') . ' caractères, complexité imposée' : 'app désactivée', 'WARN');
$tfa = array_values(array_intersect(['twofactor_totp', 'twofactor_webauthn'], array_keys($en)));
check($tfa !== [], 'Fournisseurs 2FA', $tfa ? implode(', ', $tfa) : 'aucun (TOTP indisponible ?)', 'WARN');
$enf = occ('twofactorauth:enforce');
out($enf === '' || str_contains(strtolower($enf), 'not enforced') ? 'WARN' : 'OK',
    '2FA obligatoire', mb_strimwidth(preg_replace('/\s+/', ' ', $enf), 0, 90, '…'));
$links = $appCfg('core', 'shareapi_allow_links');
$wantLinks = in_array(strtolower((string) getenv('SECURITY_ALLOW_PUBLIC_LINKS')), ['true', '1', 'yes', 'on'], true);
check(($links === 'no') !== $wantLinks, 'Liens publics (accès anonyme)', $links === 'no' ? 'désactivés' : 'autorisés (mot de passe + expiration)', 'WARN');
check(!isset($en['guests']), 'App invités (guests)', isset($en['guests']) ? 'ACTIVE' : 'désactivée', 'WARN');
check($appCfg('core', 'shareapi_only_share_with_group_members') === 'yes', 'Isolation : partage par groupe', $appCfg('core', 'shareapi_only_share_with_group_members') ?: 'no', 'WARN');
check(occ('config:system:get token_auth_enforced') === 'true', 'Clients : mots de passe d\'appli', occ('config:system:get token_auth_enforced') ?: 'false', 'WARN');
foreach (['activity' => 'Flux d\'activité', 'serverinfo' => 'Infos système (serverinfo)', 'admin_audit' => 'Journal d\'audit', 'logreader' => 'Lecteur de journaux'] as $a => $label) {
    check(isset($en[$a]), $label, $en[$a] ?? 'désactivée', 'WARN');
}

// --- 8. E-mail & alertes -------------------------------------------------------------------
section('E-mail & alertes');
$smtpHost = (string) getenv('SMTP_HOST');
check($smtpHost !== '', 'Serveur SMTP', $smtpHost !== '' ? "$smtpHost:" . getenv('SMTP_PORT') . ' (' . getenv('SMTP_SECURE') . '), ' . getenv('SMTP_NAME') : 'non configuré (SMTP_HOST vide)', 'WARN');
check((string) getenv('SMTP_PASSWORD') !== '', 'Mot de passe SMTP', getenv('SMTP_PASSWORD') ? 'défini (' . strlen((string) getenv('SMTP_PASSWORD')) . ' caractères)' : 'VIDE -> aucun e-mail ne part', 'WARN');
$adminUid = getenv('NEXTCLOUD_ADMIN_USER') ?: 'admin';
$adminMail = occ('user:setting ' . escapeshellarg($adminUid) . ' settings email');
check($adminMail !== '', "E-mail du compte $adminUid", $adminMail ?: 'non défini', 'WARN');
$alertTo = getenv('ALERT_EMAIL') ?: getenv('ADMIN_EMAIL');
check((bool) $alertTo, 'Destinataire des alertes', $alertTo ?: 'ADMIN_EMAIL vide', 'WARN');
check(occ('config:app:get core emailTestSuccessful') === '1', 'Test d\'envoi réussi', occ('config:app:get core emailTestSuccessful') === '1' ? 'oui' : 'pas encore -> .\\scripts\\mail-test.ps1', 'WARN');
check(isset($en['notifications']), 'App notifications', $en['notifications'] ?? 'désactivée', 'WARN');

// --- 9. Bilan officiel Nextcloud (Administration > Vue d'ensemble) ----------------------
section('Contrôles Nextcloud (occ setupchecks)');
$json = json_decode(occ('setupchecks --output=json'), true);
if (!is_array($json)) {
    out('WARN', 'setupchecks', 'sortie illisible — lancer : occ setupchecks');
} else {
    // Avertissements attendus en mode local HTTP (disparaissent en mode VPS/HTTPS)
    // (les avertissements e-mail ne sont "attendus" que si aucun SMTP n'est configuré)
    $expectedLocal = getenv('SMTP_PASSWORD') ? '/https|secure|hsts|transport|ssl|tls|certificate/i'
                                             : '/https|secure|hsts|transport|ssl|tls|certificate|mail|email/i';
    $walk = function ($node, string $cat) use (&$walk, $localMode, $expectedLocal) {
        if (!is_array($node)) return;
        if (isset($node['severity'])) {
            $sev = $node['severity'];
            $name = $node['name'] ?? $cat;
            $desc = preg_replace('/\s+/', ' ', strip_tags((string) ($node['description'] ?? '')));
            $desc = mb_strimwidth($desc, 0, 110, '…');
            if ($sev === 'success') { out('OK', mb_strimwidth($name, 0, 34, '…'), ''); return; }
            if ($sev === 'info') { out('INFO', mb_strimwidth($name, 0, 34, '…'), $desc); return; }
            if ($localMode && preg_match($expectedLocal, $name . ' ' . $desc)) {
                out('INFO', mb_strimwidth($name, 0, 34, '…'), '(attendu en mode local HTTP) ' . $desc); return;
            }
            out($sev === 'error' ? 'ERR' : 'WARN', mb_strimwidth($name, 0, 34, '…'), $desc);
            return;
        }
        foreach ($node as $k => $child) $walk($child, is_string($k) ? $k : $cat);
    };
    $walk($json, '');
}

// --- Bilan ----------------------------------------------------------------------------------
printf("\n\033[1mBilan : %d OK, %d avertissement(s), %d erreur(s), %d info(s)\033[0m\n",
    $counts['OK'], $counts['WARN'], $counts['ERR'], $counts['INFO']);
exit($counts['ERR'] > 0 ? 1 : 0);
