# =============================================================================
#  Applique les optimisations Nextcloud (idempotent) puis affiche le bilan de
#  performance et de santé — Windows / PowerShell
#    .\scripts\optimize.ps1              # optimiser + bilan
#    .\scripts\optimize.ps1 -CheckOnly   # bilan seulement
# =============================================================================
param([switch]$CheckOnly)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not $CheckOnly) {
    docker compose exec -u www-data app sh /opt/scripts/optimize.sh
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
docker compose exec -u www-data app php /opt/scripts/health-check.php
exit $LASTEXITCODE
