#Requires -RunAsAdministrator
# =============================================================================
#  Installe Docker Desktop avec PROGRAMME ET DONNÉES SUR D: (rien de lourd sur C:)
#    - Programme          : D:\Docker\Program
#    - Disque WSL (images, conteneurs, volumes, base PostgreSQL) : D:\Docker\wsl
#  Prérequis : ~3 Go libres sur C: (WSL et quelques composants restent sur C:).
#  Lancer en ADMINISTRATEUR :  D:\CLOUD\maintenance\2-installer-docker-sur-D.ps1
# =============================================================================
$ErrorActionPreference = "Stop"
$installer = "D:\Docker\installer\Docker Desktop Installer.exe"

if (-not (Test-Path $installer)) { throw "Installeur absent : $installer" }
$sig = Get-AuthenticodeSignature $installer
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Docker Inc') {
    throw "Signature de l'installeur invalide ($($sig.Status)) : ne pas l'exécuter."
}
$free = (Get-PSDrive C).Free / 1GB
if ($free -lt 3) { throw ("Seulement {0:N1} Go libres sur C: : lancez d'abord 1-nettoyage-admin.ps1" -f $free) }

Write-Host "==> 1. WSL déjà installé (3.0.3)" -ForegroundColor Cyan
# (WSL déjà installé : étape sautée)


Write-Host "==> 2. Docker Desktop -> D:\Docker (5 à 10 min)" -ForegroundColor Cyan
New-Item -ItemType Directory -Force D:\Docker\Program, D:\Docker\wsl | Out-Null
$p = Start-Process -FilePath $installer -Wait -PassThru -ArgumentList @(
    'install', '--quiet', '--accept-license', '--backend=wsl-2',
    '--installation-dir=D:\Docker\Program',
    '--wsl-default-data-root=D:\Docker\wsl'
)
if ($p.ExitCode -ne 0) { throw "L'installation a échoué (code $($p.ExitCode)). Journal : %LOCALAPPDATA%\Docker\install-log.txt" }

Write-Host "==> 3. Accès à Docker pour votre compte" -ForegroundColor Cyan
$me = "$env:USERDOMAIN\$env:USERNAME"
try { Add-LocalGroupMember -Group "docker-users" -Member $me -ErrorAction Stop; Write-Host "    $me ajouté au groupe docker-users" }
catch { Write-Host "    $me est déjà membre de docker-users (ou groupe absent)" }

Write-Host ""
Write-Host "Installation terminée." -ForegroundColor Green
Write-Host "  1. REDÉMARREZ Windows (obligatoire pour WSL et le groupe docker-users)."
Write-Host "  2. Lancez 'Docker Desktop' depuis le menu Démarrer, acceptez les conditions."
Write-Host "  3. Vérifiez : Settings > Resources > Advanced > Disk image location = D:\Docker\wsl"
Write-Host "  4. Dans un terminal :  docker version   puis revenez vers Claude."
