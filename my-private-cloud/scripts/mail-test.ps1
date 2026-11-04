# =============================================================================
#  Test d'envoi d'e-mail (SMTP Gmail) — Windows / PowerShell
#    .\scripts\mail-test.ps1                      # e-mail de test vers ADMIN_EMAIL
#    .\scripts\mail-test.ps1 -To autre@exemple.fr # vers une autre adresse
#    .\scripts\mail-test.ps1 -Alert               # exemple d'alerte de sécurité
#  Utilise exactement le moteur d'envoi et la configuration SMTP de Nextcloud.
# =============================================================================
param([string]$To = "", [switch]$Alert)
Set-Location (Split-Path -Parent $PSScriptRoot)

# Si la version de Nextcloud fournit la commande native, on la signale
$native = docker compose exec -T -u www-data app php occ list mail 2>$null | Select-String 'mail:send-test'
if ($native) { Write-Host "Info : 'occ mail:send-test' est disponible sur cette version (voir : occ mail:send-test --help)." -ForegroundColor DarkGray }

$cmdArgs = if ($Alert) { @("test-alert") } elseif ($To) { @("test", $To) } else { @("test") }
docker compose exec -u www-data app php /opt/scripts/notify.php @cmdArgs
exit $LASTEXITCODE
