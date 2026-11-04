# =============================================================================
#  Génère / met à jour .env pour le mode LOCAL ou VPS.
#  Les mots de passe d'un .env existant sont CONSERVÉS (indispensable : ils
#  sont aussi inscrits dans config.php et dans la base PostgreSQL).
#
#  Usage :
#    .\scripts\init-env.ps1                                   # local, IP auto
#    .\scripts\init-env.ps1 -DataDir "E:/NextcloudData"       # autre disque
#    .\scripts\init-env.ps1 -Mode vps -Domain cloud.mondomaine.fr
# =============================================================================
#  Toutes les autres valeurs d'un .env existant (SMTP, quotas, PostgreSQL,
#  alertes…) sont CONSERVÉES : seules les variables liées au mode sont recalculées.
param(
    [ValidateSet("local", "vps")] [string]$Mode = "local",
    [string]$Domain = "",      # défaut : valeur actuelle du .env
    [string]$DataDir = "",     # défaut : valeur actuelle du .env, sinon ./cloud_data
    [string]$LanIp = "",
    [int]$Port = 8080
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$example = Join-Path $root ".env.example"
$target = Join-Path $root ".env"

function New-Secret([int]$Length = 32) {
    $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($Length)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

# --- Récupère les secrets existants ------------------------------------------
$old = @{}
if (Test-Path $target) {
    Copy-Item $target "$target.bak" -Force
    Get-Content $target | Where-Object { $_ -match '^([A-Z0-9_]+)=(.*)$' } |
        ForEach-Object { $old[$Matches[1]] = $Matches[2] }
    Write-Host ".env existant sauvegardé en .env.bak (mots de passe conservés)" -ForegroundColor Yellow
}
function Keep([string]$key, [string]$fallback) {
    if ($old[$key] -and $old[$key] -ne 'CHANGE_ME') { $old[$key] } else { $fallback }
}
if (-not $Domain)  { $Domain  = Keep 'NEXTCLOUD_DOMAIN' 'cloud.example.com' }
if (-not $DataDir) { $DataDir = Keep 'NEXTCLOUD_DATA_DIR' './cloud_data' }
if ($Mode -eq 'vps' -and $Domain -eq 'cloud.example.com') {
    Write-Error "Mode VPS : indiquez votre domaine, ex. -Domain cloud.mondomaine.fr"
}

# --- Détection de l'IP locale (interface avec passerelle par défaut) ----------
if ($Mode -eq "local" -and -not $LanIp) {
    try {
        $LanIp = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
                  Select-Object -First 1).IPv4Address.IPAddress
    } catch { }
}

if ($Mode -eq "local") {
    $hostName = $env:COMPUTERNAME.ToLower()
    $values = @{
        NEXTCLOUD_URL             = if ($LanIp) { "http://${LanIp}:$Port" } else { "http://localhost:$Port" }
        NEXTCLOUD_TRUSTED_DOMAINS = "localhost 127.0.0.1 $LanIp $hostName".Trim() -replace '\s+', ' '
        NEXTCLOUD_TRUSTED_LAN     = "true"
        OVERWRITE_PROTOCOL        = ""
        OVERWRITE_HOST            = ""
        APP_BIND                  = "0.0.0.0"
    }
} else {
    $values = @{
        NEXTCLOUD_URL             = "https://$Domain"
        NEXTCLOUD_TRUSTED_DOMAINS = $Domain
        NEXTCLOUD_TRUSTED_LAN     = "false"
        OVERWRITE_PROTOCOL        = "https"
        OVERWRITE_HOST            = $Domain
        APP_BIND                  = "127.0.0.1"
    }
}
$values += @{
    CLOUD_MODE               = $Mode
    NEXTCLOUD_DOMAIN         = $Domain
    APP_PORT                 = "$Port"
    NEXTCLOUD_DATA_DIR       = $DataDir -replace '\\', '/'
    NEXTCLOUD_ADMIN_PASSWORD = Keep 'NEXTCLOUD_ADMIN_PASSWORD' (New-Secret 24)
    POSTGRES_PASSWORD        = Keep 'POSTGRES_PASSWORD' (New-Secret 40)
    REDIS_PASSWORD           = Keep 'REDIS_PASSWORD' (New-Secret 40)
    CLOUDFLARE_TUNNEL_TOKEN  = Keep 'CLOUDFLARE_TUNNEL_TOKEN' ''
}

$content = Get-Content $example -Raw
# 1. Valeurs conservées de l'ancien .env (tout sauf les variables liées au mode)
$extras = @()
foreach ($k in $old.Keys) {
    if ($values.ContainsKey($k) -or $old[$k] -eq 'CHANGE_ME') { continue }
    $v = [string]$old[$k]
    if ($content -match "(?m)^$k=") {
        $content = [regex]::Replace($content, "(?m)^$k=.*$", { param($m) "$k=$v" })
    } else {
        $extras += "$k=$v"     # variable personnalisée absente du modèle
    }
}
if ($extras) { $content = $content.TrimEnd() + "`n`n# --- Variables personnalisées conservées ---`n" + ($extras -join "`n") + "`n" }
# 2. Variables calculées pour le mode choisi
foreach ($k in $values.Keys) {
    $v = [string]$values[$k]
    $content = [regex]::Replace($content, "(?m)^$k=.*$", { param($m) "$k=$v" })
}
# Fins de ligne LF + UTF-8 sans BOM
[System.IO.File]::WriteAllText($target, ($content -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))

# --- Dossier de données -----------------------------------------------------
$dataPath = if ([System.IO.Path]::IsPathRooted($DataDir)) { $DataDir } else { Join-Path $root $DataDir }
New-Item -ItemType Directory -Force $dataPath | Out-Null

Write-Host ""
Write-Host ".env généré — mode $Mode" -ForegroundColor Green
Write-Host "  URL           : $($values.NEXTCLOUD_URL)"
Write-Host "  Domaines      : $($values.NEXTCLOUD_TRUSTED_DOMAINS)"
Write-Host "  Données       : $dataPath"
Write-Host "  Admin         : admin / (voir NEXTCLOUD_ADMIN_PASSWORD dans .env)"
