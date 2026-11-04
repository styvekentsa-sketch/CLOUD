<?php
// =============================================================================
//  E-mails de test et alertes de sécurité centralisées (moteur d'envoi Nextcloud)
//  À lancer en www-data dans le conteneur app ou cron :
//    php /opt/scripts/notify.php test [destinataire]   -> e-mail de test SMTP
//    php /opt/scripts/notify.php test-alert             -> exemple d'alerte
//    php /opt/scripts/notify.php alerts                 -> analyse + envoi (cron, 5 min)
//
//  Événements surveillés (journal nextcloud.log, alimenté par admin_audit) :
//    - connexion réussie depuis un NOUVEL appareil / une NOUVELLE IP
//    - échecs de connexion répétés (seuil configurable) = tentative d'intrusion
//    - comptes : création, suppression, activation, groupes, rôles (admin, sous-admin)
//    - stockage : disque des données / disque Docker / quotas presque pleins
//  Plusieurs alertes d'un même passage sont regroupées dans UN e-mail.
//  En cas d'échec SMTP, les alertes sont conservées et renvoyées au passage suivant.
// =============================================================================
declare(strict_types=1);

$mode = $argv[1] ?? 'alerts';
if (!in_array($mode, ['test', 'test-alert', 'alerts'], true)) {
    fwrite(STDERR, "Usage : php notify.php test [e-mail] | test-alert | alerts\n");
    exit(2);
}

// Initialise Nextcloud (comme occ). NC_BASE_PHP : uniquement pour les tests hors conteneur.
require_once getenv('NC_BASE_PHP') ?: '/var/www/html/lib/base.php';

$cfg = \OC::$server->getConfig();
if (!$cfg->getSystemValueBool('installed', false) || $cfg->getSystemValueBool('maintenance', false)) {
    if ($mode === 'alerts') exit(0);   // pas encore installé / sauvegarde en cours : on réessaiera
    fwrite(STDERR, "Nextcloud n'est pas installé ou est en mode maintenance.\n");
    exit(1);
}
$ADMIN_EMAIL = getenv('ALERT_EMAIL') ?: (getenv('ADMIN_EMAIL') ?: '');
$HOST = parse_url((string) $cfg->getSystemValue('overwrite.cli.url', ''), PHP_URL_HOST) ?: gethostname();
$env = fn(string $k, $d) => (($v = getenv($k)) === false || $v === '') ? $d : $v;
$on = fn(string $k, bool $d = true) => in_array(strtolower((string) $env($k, $d ? 'true' : 'false')), ['true', '1', 'yes', 'on'], true);

/** Envoie un e-mail HTML + texte via le mailer Nextcloud (config SMTP du .env). */
function nc_send(string $to, string $subject, string $heading, array $lines, string $footer): void {
    $mailer = \OC::$server->get(\OCP\Mail\IMailer::class);
    $tpl = $mailer->createEMailTemplate('mpc.notify', []);
    $tpl->setSubject($subject);
    $tpl->addHeader();
    $tpl->addHeading($heading);
    foreach ($lines as $l) {
        $tpl->addBodyText(nl2br(htmlspecialchars($l)), $l);
    }
    $tpl->addFooter($footer);
    $msg = $mailer->createMessage();
    $msg->setTo([$to]);
    $msg->useTemplate($tpl);
    $failed = $mailer->send($msg);
    if (!empty($failed)) {
        throw new RuntimeException('destinataire refusé : ' . implode(', ', $failed));
    }
}

function smtp_hint(Throwable $e): string {
    $m = $e->getMessage();
    return match (true) {
        str_contains($m, '535') || stripos($m, 'Username and Password not accepted') !== false
            => "Gmail refuse l'identification : SMTP_PASSWORD doit être un MOT DE PASSE D'APPLICATION Gmail (16 lettres, sans espaces), pas le mot de passe du compte Google.",
        stripos($m, 'Connection could not be established') !== false || stripos($m, 'timed out') !== false
            => 'Connexion impossible à smtp.gmail.com:587 : vérifier l\'accès Internet du conteneur et le pare-feu (port 587 sortant).',
        stripos($m, 'Expected response code') !== false && str_contains($m, '530')
            => 'Authentification requise : SMTP_NAME / SMTP_PASSWORD manquants dans .env.',
        default => 'Vérifier les variables SMTP_* dans .env puis : docker compose up -d',
    };
}

$footer = "my-private-cloud ($HOST) — alertes configurées dans .env (ALERT_*)";

// --- Mode test --------------------------------------------------------------------
if ($mode === 'test') {
    $to = $argv[2] ?? $ADMIN_EMAIL;
    if ($to === '') { fwrite(STDERR, "Aucun destinataire (ADMIN_EMAIL vide)\n"); exit(2); }
    printf("Serveur SMTP : %s:%s (%s), compte %s\nExpéditeur   : %s@%s\nDestinataire : %s\n",
        $cfg->getSystemValue('mail_smtphost', '?'), $cfg->getSystemValue('mail_smtpport', '?'),
        $cfg->getSystemValue('mail_smtpsecure', '') ?: 'STARTTLS auto', $cfg->getSystemValue('mail_smtpname', '?'),
        $cfg->getSystemValue('mail_from_address', '?'), $cfg->getSystemValue('mail_domain', '?'), $to);
    try {
        nc_send($to, "[Cloud] E-mail de test — $HOST", 'La configuration e-mail fonctionne ✅',
            ['Cet e-mail de test a été envoyé par votre Nextcloud via ' . $cfg->getSystemValue('mail_smtphost', 'SMTP') . '.',
             'Les alertes de sécurité (connexions, intrusions, comptes, stockage) seront envoyées à : ' . ($ADMIN_EMAIL ?: $to),
             'Date : ' . date('Y-m-d H:i:s T')], $footer);
        $cfg->setAppValue('core', 'emailTestSuccessful', '1');   // supprime l'avertissement du bilan
        echo "OK : e-mail envoyé à $to (vérifiez aussi le dossier Spam).\n";
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, "ÉCHEC : " . $e->getMessage() . "\n→ " . smtp_hint($e) . "\n");
        exit(1);
    }
}

// --- Alertes ---------------------------------------------------------------------------
$datadir = rtrim((string) $cfg->getSystemValue('datadirectory', '/var/www/html/data'), '/');
$logfile = (string) $cfg->getSystemValue('logfile', "$datadir/nextcloud.log");
$stateFile = "$datadir/.security-alerts.json";
$state = is_file($stateFile) ? (json_decode((string) file_get_contents($stateFile), true) ?: []) : [];
$state += ['offset' => null, 'known' => [], 'fails' => [], 'last' => [], 'pending' => []];
$now = time();
$alerts = [];

$THRESH = (int) $env('ALERT_FAILED_LOGIN_THRESHOLD', 5);
$WINDOW = (int) $env('ALERT_FAILED_LOGIN_WINDOW', 900);
$STORAGE_PCT = (float) $env('ALERT_STORAGE_PERCENT', 90);
$REPEAT = 3600;   // une même alerte d'intrusion au plus 1x/heure

$throttled = function (string $key, int $every) use (&$state, $now): bool {
    if (($state['last'][$key] ?? 0) > $now - $every) return true;
    $state['last'][$key] = $now;
    return false;
};
$uaShort = fn(string $ua) => mb_strimwidth(trim(preg_replace('/\s+/', ' ', $ua)), 0, 110, '…');
$uaKey = fn(string $ua) => substr(md5(preg_replace('/[\d._]+/', '', strtolower($ua))), 0, 12);   // ignore les numéros de version

if ($mode === 'test-alert') {
    $state['pending'] = [];   // n'envoie que l'exemple
    $alerts[] = ['🔐 Nouvelle connexion (exemple)', "Compte : admin\nIP : 192.168.1.42\nAppareil : Mozilla/5.0 (Android 15) Nextcloud-android/3.30\nHeure : " . date('Y-m-d H:i:s')];
} else {
    // 1. Lecture incrémentale du journal --------------------------------------------------
    if (is_file($logfile)) {
        $size = filesize($logfile);
        if ($state['offset'] === null) {
            $state['offset'] = $size;            // 1er passage : on ne remonte pas l'historique
        } else {
            if ($size < $state['offset']) $state['offset'] = 0;   // journal tourné
            $fh = fopen($logfile, 'rb');
            fseek($fh, (int) $state['offset']);
            $read = 0;
            while (($line = fgets($fh)) !== false && $read < 50 * 1048576) {
                $read += strlen($line);
                $e = json_decode($line, true);
                if (!is_array($e) || !is_string($e['message'] ?? null)) continue;
                $msg = $e['message']; $app = (string) ($e['app'] ?? '');
                $ip = (string) ($e['remoteAddr'] ?? '?'); $ua = (string) ($e['userAgent'] ?? '');
                $actor = (string) ($e['user'] ?? '--'); $t = strtotime((string) ($e['time'] ?? '')) ?: $now;
                $when = date('Y-m-d H:i:s', $t);

                // a) Connexion réussie : nouvel appareil / nouvelle IP
                if ($app === 'admin_audit' && preg_match('/^Login successful: "?([^"]+)"?/', $msg, $m)) {
                    $uid = $m[1];
                    $k = "$uid|$ip|" . $uaKey($ua);
                    if (!isset($state['known'][$k])) {
                        $first = !preg_grep('/^' . preg_quote($uid, '/') . '\|/', array_keys($state['known']));
                        if ($on('ALERT_NEW_LOGIN')) {
                            $alerts[] = [$first ? "🔐 Première connexion connue du compte « $uid »" : "🔐 Nouvelle connexion : appareil ou IP inconnu(e) pour « $uid »",
                                "Compte : $uid\nIP : $ip\nAppareil : " . $uaShort($ua) . "\nHeure : $when"];
                        }
                    }
                    $state['known'][$k] = $t;
                    continue;
                }
                // b) Échec de connexion (audit + message noyau "Login failed: … (Remote IP: …)")
                if (preg_match('/Login failed:\s*["\']?([^"\'\s(]+)["\']?(?:\s*\(Remote IP:\s*["\']?([^"\')]+))?/i', $msg, $m)) {
                    $uid = $m[1]; $fip = $m[2] ?? $ip;
                    $id = "$t|$uid";                                  // évite le double comptage audit + noyau
                    $state['fails'][$id] = ['t' => $t, 'u' => $uid, 'ip' => $fip, 'ua' => $ua];
                    continue;
                }
                if (preg_match('/Bruteforce attempt from "([^"]+)" detected for action "([^"]+)"/', $msg, $m)) {
                    if (!$throttled("bf|{$m[1]}", $REPEAT)) {
                        $alerts[] = ["🚨 Attaque par force brute détectée", "IP : {$m[1]}\nAction visée : {$m[2]}\nHeure : $when\nNextcloud ralentit désormais cette adresse."];
                    }
                    continue;
                }
                // c) Comptes et rôles
                if ($app === 'admin_audit' && $on('ALERT_ACCOUNT_CHANGES')
                    && preg_match('/(User created|User deleted|User .*(enabled|disabled)|added to group|removed from group|subadmin|Group created|Group deleted|Password of user|Two-factor .* (disabled|removed))/i', $msg)) {
                    $priv = preg_match('/added to group "admin"|subadmin|granted/i', $msg);
                    $alerts[] = [($priv ? '⚠️ Élévation de privilèges' : '👤 Modification de compte'),
                        "$msg\nEffectué par : $actor\nIP : $ip\nHeure : $when"];
                }
            }
            $state['offset'] = ftell($fh);
            fclose($fh);
        }
    }

    // 2. Échecs répétés (fenêtre glissante) ---------------------------------------------------
    $state['fails'] = array_filter($state['fails'], fn($f) => $f['t'] > $now - $WINDOW);
    $byIp = $byUser = [];
    foreach ($state['fails'] as $f) { $byIp[$f['ip']][] = $f; $byUser[$f['u']][] = $f; }
    $alertedIps = [];
    foreach (['ip' => $byIp, 'compte' => $byUser] as $kind => $groups) {
        foreach ($groups as $key => $list) {
            // Alerte "compte" redondante si toutes ses tentatives viennent d'IP déjà signalées
            if ($kind === 'compte' && !array_diff(array_unique(array_column($list, 'ip')), $alertedIps)) continue;
            if ($kind === 'ip' && count($list) >= $THRESH) $alertedIps[] = $key;   // couverte, même si l'alerte est en silence
            if (count($list) >= $THRESH && !$throttled("fail|$kind|$key", $REPEAT)) {
                $users = implode(', ', array_unique(array_column($list, 'u')));
                $ips = implode(', ', array_unique(array_column($list, 'ip')));
                $alerts[] = ["🚨 Échecs de connexion répétés (" . count($list) . " en " . round($WINDOW / 60) . " min) — $kind $key",
                    "Comptes visés : $users\nIP : $ips\nDernier appareil : " . $uaShort((string) end($list)['ua']) .
                    "\nSi ce n'est pas vous : vérifiez Administration > Journalisation, changez le mot de passe, activez la 2FA."];
            }
        }
    }

    // 3. Stockage ------------------------------------------------------------------------------
    foreach (["Disque des données ($datadir)" => $datadir, 'Disque Docker (base, applications)' => '/var/www/html'] as $label => $path) {
        $tot = @disk_total_space($path); $free = @disk_free_space($path);
        if ($tot > 0) {
            $pct = 100 - $free / $tot * 100;
            if ($pct >= $STORAGE_PCT && !$throttled("disk|$path", 86400)) {
                $alerts[] = ["💾 Stockage saturé : $label",
                    sprintf("Utilisé : %.1f %%\nLibre : %.1f Go sur %.1f Go\nSeuil d'alerte : %d %%\nAction : libérer de l'espace, vider les corbeilles (occ trashbin:cleanup --all-users) ou agrandir le disque.",
                        $pct, $free / 1073741824, $tot / 1073741824, $STORAGE_PCT)];
            }
        }
    }
    try {
        $db = \OC::$server->getDatabaseConnection();
        $used = $db->executeQuery("SELECT substr(s.id, 7) AS uid, f.size FROM *PREFIX*storages s
            JOIN *PREFIX*filecache f ON f.storage = s.numeric_id AND f.path = 'files' WHERE s.id LIKE 'home::%'")->fetchAll();
        $quotas = [];
        foreach ($db->executeQuery("SELECT userid, configvalue FROM *PREFIX*preferences WHERE appid = 'files' AND configkey = 'quota'")->fetchAll() as $r) {
            $quotas[$r['userid']] = $r['configvalue'];
        }
        $default = $cfg->getAppValue('files', 'default_quota', 'none');
        foreach ($used as $r) {
            $q = $quotas[$r['uid']] ?? $default;
            if ($q === 'none' || $q === 'default') continue;
            $qb = (float) \OCP\Util::computerFileSize($q);
            if ($qb > 0 && $r['size'] / $qb * 100 >= $STORAGE_PCT && !$throttled("quota|{$r['uid']}", 86400)) {
                $alerts[] = ["💾 Quota presque atteint : {$r['uid']}",
                    sprintf("Utilisé : %.1f Go sur %s (%.0f %%)", $r['size'] / 1073741824, $q, $r['size'] / $qb * 100)];
            }
        }
    } catch (Throwable $e) {
        fwrite(STDERR, '[alerts] quotas : ' . $e->getMessage() . "\n");
    }
}

// --- 4. Envoi groupé (avec reprise en cas d'échec) ------------------------------------------
$state['pending'] = array_slice(array_merge($state['pending'], $alerts), -100);
if (count($state['known']) > 5000) { asort($state['known']); $state['known'] = array_slice($state['known'], -5000, null, true); }

if ($state['pending'] && $ADMIN_EMAIL !== '') {
    $n = count($state['pending']);
    $lines = [];
    foreach ($state['pending'] as [$title, $body]) $lines[] = "■ $title\n$body";
    try {
        nc_send($ADMIN_EMAIL, "[Cloud] $n alerte" . ($n > 1 ? 's' : '') . " de sécurité — $HOST",
            $n > 1 ? "$n événements à vérifier" : $state['pending'][0][0], $lines, $footer);
        // Notification dans Nextcloud (cloche + push sur le téléphone de l'admin)
        $admin = getenv('NEXTCLOUD_ADMIN_USER') ?: 'admin';
        if (\OC::$server->getAppManager()->isInstalled('notifications')) {
            @shell_exec('php /var/www/html/occ notification:generate ' . escapeshellarg($admin) . ' '
                . escapeshellarg(mb_strimwidth("$n alerte(s) de sécurité — voir l'e-mail", 0, 255)) . ' >/dev/null 2>&1');
        }
        echo "[alerts] $n alerte(s) envoyée(s) à $ADMIN_EMAIL\n";
        $state['pending'] = [];
    } catch (Throwable $e) {
        fwrite(STDERR, "[alerts] ÉCHEC d'envoi (" . $e->getMessage() . ") — nouvel essai au prochain passage. " . smtp_hint($e) . "\n");
    }
}

if ($mode === 'alerts') {
    file_put_contents($stateFile, json_encode($state), LOCK_EX);
}
exit(0);
