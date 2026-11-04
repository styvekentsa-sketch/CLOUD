#Requires -Version 7
# =============================================================================
#  webdav-setup.ps1 — Prépare un compte Nextcloud pour les sauvegardes WebDAV
#  (FolderSync, rclone, applications tierces)
#
#   1. Construit l'URL WebDAV exacte à partir de NEXTCLOUD_URL (.env)
#   2. Vérifie identifiant + mot de passe d'application (PROPFIND) et l'espace libre
#   3. Teste l'écriture (PUT + DELETE d'un petit fichier)
#   4. Crée les dossiers cibles (MKCOL), sans toucher à ceux qui existent déjà
#   5. Affiche le récapitulatif à recopier dans FolderSync
#
#  Usage :
#    .\scripts\webdav-setup.ps1 -User alice
#    .\scripts\webdav-setup.ps1 -User alice -Folders "Sauvegardes/Notes","Sauvegardes/SMS"
#    .\scripts\webdav-setup.ps1 -User alice -Url https://cloud.mondomaine.fr
# =============================================================================
param(
    [Parameter(Mandatory)] [string]$User,
    [string]$Url = "",
    [securestring]$AppPassword,   # facultatif : sinon demandé de façon masquée
    [string[]]$Folders = @(
        "Sauvegardes/WhatsApp/Databases",
        "Sauvegardes/WhatsApp/Backups",
        "Sauvegardes/WhatsApp/Media",
        "Sauvegardes/Notes",
        "Sauvegardes/Telechargements",
        "Sauvegardes/Applications"
    )
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# --- URL du serveur ------------------------------------------------------------
if (-not $Url) {
    $envFile = Join-Path $root ".env"
    if (Test-Path $envFile) {
        $line = Select-String -Path $envFile -Pattern '^NEXTCLOUD_URL=(.+)$' | Select-Object -First 1
        if ($line) { $Url = $line.Matches[0].Groups[1].Value.Trim() }
    }
    if (-not $Url) { $Url = "http://localhost:8080" }
}
$Url = $Url.TrimEnd('/')
$userEsc = [uri]::EscapeDataString($User)
$davRoot = "$Url/remote.php/dav/files/$userEsc"

Write-Host "URL WebDAV : $davRoot/" -ForegroundColor Cyan
Write-Host "Utilisez un MOT DE PASSE D'APPLICATION (Paramètres personnels > Sécurité)," -ForegroundColor DarkGray
Write-Host "pas le mot de passe principal du compte." -ForegroundColor DarkGray
$sec = if ($AppPassword) { $AppPassword } else { Read-Host "Mot de passe d'application pour '$User'" -AsSecureString }
$pass = [System.Net.NetworkCredential]::new("", $sec).Password
$auth = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${User}:${pass}"))

function Invoke-Dav([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [string]$Body = $null) {
    $h = @{ Authorization = $auth } + $Headers
    $p = @{ Uri = $Uri; CustomMethod = $Method; Headers = $h; SkipHttpErrorCheck = $true; TimeoutSec = 30 }
    if ($Body) { $p.Body = $Body; $p.ContentType = "application/xml; charset=utf-8" }
    try { Invoke-WebRequest @p } catch {
        Write-Host "ERREUR : serveur injoignable ($Uri)" -ForegroundColor Red
        Write-Host "  -> docker compose ps ; vérifiez l'IP/le port et le pare-feu Windows." -ForegroundColor Red
        exit 1
    }
}

# --- 1. Authentification + quota -----------------------------------------------
$propfind = @'
<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:quota-available-bytes/><d:quota-used-bytes/></d:prop>
</d:propfind>
'@
$r = Invoke-Dav "PROPFIND" "$davRoot/" @{ Depth = "0" } $propfind
switch ([int]$r.StatusCode) {
    207 { Write-Host "[OK] Authentification réussie" -ForegroundColor Green }
    401 { Write-Host "[ÉCHEC] 401 : identifiant ou mot de passe d'application incorrect." -ForegroundColor Red
          Write-Host "        L'identifiant est l'ID de connexion (pas le nom affiché ni l'e-mail)." ; exit 1 }
    404 { Write-Host "[ÉCHEC] 404 : utilisateur '$User' inconnu dans l'URL." -ForegroundColor Red; exit 1 }
    default { Write-Host "[ÉCHEC] Réponse HTTP $($r.StatusCode)" -ForegroundColor Red; exit 1 }
}
[xml]$x = $r.Content
$ns = @{ d = "DAV:" }
$free = (Select-Xml -Xml $x -XPath "//d:quota-available-bytes" -Namespace $ns).Node.InnerText
$used = (Select-Xml -Xml $x -XPath "//d:quota-used-bytes" -Namespace $ns).Node.InnerText
function Format-Size($b) { if (-not $b -or [double]$b -lt 0) { return "illimité" }; "{0:N1} Go" -f ([double]$b / 1GB) }
Write-Host "     Utilisé : $(Format-Size $used)   Disponible : $(Format-Size $free)"

# --- 2. Test d'écriture -----------------------------------------------------------
$testUri = "$davRoot/.webdav-test-$([guid]::NewGuid().ToString('N').Substring(0,8)).txt"
$put = Invoke-Dav "PUT" $testUri @{} "test webdav $(Get-Date -Format o)"
if ([int]$put.StatusCode -in 201, 204) {
    [void](Invoke-Dav "DELETE" $testUri)
    Write-Host "[OK] Écriture / suppression autorisées" -ForegroundColor Green
} else {
    Write-Host "[ÉCHEC] Écriture refusée (HTTP $($put.StatusCode))" -ForegroundColor Red; exit 1
}

# --- 3. Création des dossiers cibles -------------------------------------------------
foreach ($f in $Folders) {
    $acc = ""
    foreach ($seg in ($f.Trim('/') -split '/')) {
        $acc += "/" + [uri]::EscapeDataString($seg)
        $m = Invoke-Dav "MKCOL" "$davRoot$acc"
        if ([int]$m.StatusCode -notin 201, 405) {   # 405 = existe déjà
            Write-Host "[ÉCHEC] MKCOL $f (HTTP $($m.StatusCode))" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "[OK] Dossier prêt : /$($f.Trim('/'))" -ForegroundColor Green
}

# --- 4. Récapitulatif FolderSync ---------------------------------------------------
$uri = [uri]$Url
Write-Host ""
Write-Host "================ À recopier dans FolderSync (compte WebDAV) ================" -ForegroundColor Cyan
Write-Host "  Adresse du serveur : $davRoot/"
Write-Host "  Identifiant        : $User"
Write-Host "  Mot de passe       : (le mot de passe d'application saisi)"
Write-Host "  HTTPS              : $(if ($uri.Scheme -eq 'https') { 'oui' } else { 'non (mode local HTTP)' })"
Write-Host "  Dossiers distants  :"
$Folders | ForEach-Object { Write-Host "     /$($_.Trim('/'))" }
Write-Host "=============================================================================" -ForegroundColor Cyan
