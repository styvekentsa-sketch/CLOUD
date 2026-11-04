# =============================================================================
#  État global du cloud — Windows / PowerShell
#   1. Santé des conteneurs Docker (état + healthcheck)
#   2. Ressources par conteneur (CPU, RAM, réseau, disque)
#   3. Espace disque du dossier de données
#   4. Consommation de stockage par compte / groupe (Nextcloud)
#  Usage : .\scripts\status.ps1   |   .\scripts\status.ps1 -Full  (+ bilan santé)
# =============================================================================
param([switch]$Full)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
function Title($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

Title "Conteneurs"
docker compose ps --all --format "table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}"
$bad = docker compose ps --all --format "{{.Service}} {{.State}} {{.Health}}" |
       Where-Object { $_ -match 'exited|dead|restarting|unhealthy' -and $_ -notmatch '^init-perms ' }
if ($bad) { Write-Host "ATTENTION :`n$($bad -join "`n")" -ForegroundColor Red } else { Write-Host "Tous les services sont sains." -ForegroundColor Green }

Title "Ressources (instantané)"
$ids = docker compose ps -q
if ($ids) { docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" $ids }

Title "Disque des données"
$dataDir = (Select-String -Path .env -Pattern '^NEXTCLOUD_DATA_DIR=(.+)$' -ErrorAction SilentlyContinue | Select-Object -First 1).Matches.Groups[1].Value
if (-not $dataDir) { $dataDir = "./cloud_data" }
$full = if ([IO.Path]::IsPathRooted($dataDir)) { $dataDir } else { Join-Path $root $dataDir }
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot((Resolve-Path $full)).Substring(0, 1))
$pct = [math]::Round($drive.Used / ($drive.Used + $drive.Free) * 100, 1)
$color = if ($pct -ge 90) { "Red" } elseif ($pct -ge 75) { "Yellow" } else { "Green" }
Write-Host ("{0}  ->  {1:N1} Go libres / {2:N1} Go ({3} % utilisé)" -f $full, ($drive.Free / 1GB), (($drive.Used + $drive.Free) / 1GB), $pct) -ForegroundColor $color
docker system df

Title "Stockage par compte et par groupe"
docker compose exec -T -u www-data app php /opt/scripts/storage-report.php

if ($Full) {
    Title "Bilan de performance et de santé"
    docker compose exec -T -u www-data app php /opt/scripts/health-check.php
}
