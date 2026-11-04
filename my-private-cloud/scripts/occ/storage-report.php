<?php
// =============================================================================
//  Rapport de consommation de stockage par COMPTE et par GROUPE (lecture seule)
//    docker compose exec -u www-data app php /opt/scripts/storage-report.php
//    … --write            écrit aussi le rapport (Markdown) dans les fichiers de
//                         l'admin : /Administration/Rapport-stockage.md
//    … --write=<compte>   idem dans les fichiers d'un autre compte
//  Source : index Nextcloud (oc_filecache) — mis à jour à chaque envoi ;
//  après une copie manuelle sur le disque, lancer d'abord "occ files:scan --all".
// =============================================================================

$opts = getopt('', ['write::']);
$CONFIG = [];
@include getenv('REPORT_CONFIG_PHP') ?: '/var/www/html/config/config.php';
if (!$CONFIG) { fwrite(STDERR, "config.php introuvable (à lancer dans le conteneur app)\n"); exit(1); }
$p = $CONFIG['dbtableprefix'] ?? 'oc_';

try {
    // REPORT_DSN : uniquement pour les tests hors conteneur
    $pdo = new PDO(getenv('REPORT_DSN') ?: sprintf('pgsql:host=%s;dbname=%s', getenv('POSTGRES_HOST') ?: 'db', getenv('POSTGRES_DB') ?: 'nextcloud'),
        getenv('POSTGRES_USER') ?: 'nextcloud', getenv('POSTGRES_PASSWORD') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Throwable $e) { fwrite(STDERR, 'BDD : ' . $e->getMessage() . "\n"); exit(1); }

function human(float $b): string {
    if ($b < 0) return '—';
    foreach (['o', 'Ko', 'Mo', 'Go', 'To'] as $u) { if ($b < 1024) return sprintf($u === 'o' ? '%d %s' : '%.1f %s', $b, $u); $b /= 1024; }
    return sprintf('%.1f Po', $b);
}

// --- Comptes : fichiers, versions, corbeille --------------------------------------
$rows = $pdo->query("
    SELECT substr(s.id, 7) AS uid, f.path, f.size
    FROM {$p}storages s
    JOIN {$p}filecache f ON f.storage = s.numeric_id AND f.path IN ('files', 'files_versions', 'files_trashbin')
    WHERE s.id LIKE 'home::%'")->fetchAll(PDO::FETCH_ASSOC);
$users = [];
foreach ($rows as $r) {
    $users[$r['uid']] ??= ['files' => 0, 'files_versions' => 0, 'files_trashbin' => 0];
    $users[$r['uid']][$r['path']] = max(0, (float) $r['size']);
}
$names = $pdo->query("SELECT uid, COALESCE(NULLIF(displayname, ''), uid) FROM {$p}users")->fetchAll(PDO::FETCH_KEY_PAIR);
foreach (array_keys($names) as $uid) $users[$uid] ??= ['files' => 0, 'files_versions' => 0, 'files_trashbin' => 0];
$pref = fn(string $app, string $key) => $pdo->query("SELECT userid, configvalue FROM {$p}preferences WHERE appid = '$app' AND configkey = '$key'")->fetchAll(PDO::FETCH_KEY_PAIR);
$quotas = $pref('files', 'quota');
$logins = $pref('login', 'lastLogin');
$enabled = $pref('core', 'enabled');
$defaultQuota = $pdo->query("SELECT configvalue FROM {$p}appconfig WHERE appid = 'files' AND configkey = 'default_quota'")->fetchColumn() ?: 'none';

$members = [];
foreach ($pdo->query("SELECT gid, uid FROM {$p}group_user ORDER BY gid") as $r) $members[$r['gid']][] = $r['uid'];
$groupsOf = [];
foreach ($members as $g => $uids) foreach ($uids as $u) $groupsOf[$u][] = $g;

uasort($users, fn($a, $b) => array_sum($b) <=> array_sum($a));
$total = array_sum(array_map('array_sum', $users));
$disk = @disk_total_space($CONFIG['datadirectory']) ?: 0; $free = @disk_free_space($CONFIG['datadirectory']) ?: 0;

// --- Mise en forme (Markdown, lisible aussi en console) ---------------------------------
$md = [];
$md[] = '# Rapport de stockage — ' . date('Y-m-d H:i');
$md[] = '';
$md[] = sprintf('**Total utilisé par les comptes : %s** — disque des données : %s libres sur %s — quota par défaut : %s',
    human($total), human($free), human($disk), $defaultQuota);
$md[] = '';
$md[] = '## Par compte';
$md[] = '';
$md[] = '| Compte | Nom | Groupes | Fichiers | Versions | Corbeille | **Total** | Quota | Dernière connexion |';
$md[] = '|---|---|---|---:|---:|---:|---:|---|---|';
foreach ($users as $uid => $u) {
    $last = isset($logins[$uid]) && (int) $logins[$uid] > 0 ? date('Y-m-d', (int) $logins[$uid]) : 'jamais';
    $state = ($enabled[$uid] ?? 'true') === 'false' ? ' (désactivé)' : '';
    $md[] = sprintf('| %s%s | %s | %s | %s | %s | %s | **%s** | %s | %s |', $uid, $state, $names[$uid] ?? $uid,
        implode(', ', $groupsOf[$uid] ?? []) ?: '—', human($u['files']), human($u['files_versions']),
        human($u['files_trashbin']), human(array_sum($u)), $quotas[$uid] ?? "défaut ($defaultQuota)", $last);
}
$md[] = '';
$md[] = '## Par groupe';
$md[] = '';
$md[] = '| Groupe | Comptes | Fichiers | Versions + corbeille | **Total** | Part |';
$md[] = '|---|---:|---:|---:|---:|---:|';
foreach ($members as $g => $uids) {
    $f = $o = 0;
    foreach ($uids as $u) { $f += $users[$u]['files'] ?? 0; $o += ($users[$u]['files_versions'] ?? 0) + ($users[$u]['files_trashbin'] ?? 0); }
    $md[] = sprintf('| %s | %d | %s | %s | **%s** | %.1f %% |', $g, count($uids), human($f), human($o), human($f + $o),
        $total > 0 ? ($f + $o) / $total * 100 : 0);
}
$md[] = '';
$md[] = '_Un compte membre de plusieurs groupes est compté dans chacun d\'eux._';
$text = implode("\n", $md) . "\n";
echo $text;

// --- Écriture dans les fichiers d'un compte (visible dans l'interface web) -----------------
if (array_key_exists('write', $opts)) {
    $target = $opts['write'] ?: (getenv('NEXTCLOUD_ADMIN_USER') ?: 'admin');
    $dir = rtrim($CONFIG['datadirectory'], '/') . "/$target/files/Administration";
    if (!is_dir(dirname($dir))) { fwrite(STDERR, "Compte '$target' introuvable dans les données\n"); exit(1); }
    @mkdir($dir, 0770, true);
    file_put_contents("$dir/Rapport-stockage.md", $text);
    shell_exec('php /var/www/html/occ files:scan --path=' . escapeshellarg("/$target/files/Administration") . ' >/dev/null 2>&1');
    fwrite(STDERR, "Rapport écrit dans /$target/files/Administration/Rapport-stockage.md\n");
}
