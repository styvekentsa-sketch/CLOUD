#Requires -RunAsAdministrator
# =============================================================================
#  Nettoyage du disque C: — partie nécessitant les droits ADMINISTRATEUR
#  Lancer depuis un PowerShell ouvert avec "Exécuter en tant qu'administrateur" :
#
#    D:\CLOUD\maintenance\1-nettoyage-admin.ps1
#        -> nettoyage standard (Temp Windows, cache Windows Update, Delivery
#           Optimization, composants WinSxS)
#
#    D:\CLOUD\maintenance\1-nettoyage-admin.ps1 -DesactiverHibernation
#        -> + supprime hiberfil.sys (~6,3 Go). Désactive la veille prolongée
#           et le démarrage rapide. Réversible : powercfg /h on
#
#    D:\CLOUD\maintenance\1-nettoyage-admin.ps1 -DeplacerFichierEchangeSurD
#        -> + déplace l'essentiel de pagefile.sys (~23 Go) vers D:
#           (petit fichier de 1-2 Go conservé sur C: pour les rapports de
#           plantage). REDÉMARRAGE NÉCESSAIRE. Réversible : voir fin de script.
#
#  Aucun document personnel n'est touché. Les journaux d'événements ne sont PAS
#  vidés (0,27 Go seulement : gain négligeable, perte de l'historique).
# =============================================================================
param(
    [switch]$DesactiverHibernation,
    [switch]$DeplacerFichierEchangeSurD
)
$ErrorActionPreference = "Continue"
function Libre { (Get-PSDrive C).Free }
function Go($b) { "{0:N2} Go" -f ($b / 1GB) }
function Etape($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
$depart = Libre
Write-Host "C: libre AVANT : $(Go $depart)" -ForegroundColor Yellow

# --- 1. Fichiers temporaires de Windows -------------------------------------------
Etape "C:\Windows\Temp"
$a = Libre
Get-ChildItem C:\Windows\Temp -Force -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "    libéré : $(Go ((Libre) - $a)) (fichiers en cours d'utilisation ignorés)"

# --- 2. Cache de téléchargement Windows Update -----------------------------------------
Etape "Cache Windows Update (SoftwareDistribution\Download)"
$a = Libre
Stop-Service wuauserv, bits -Force -ErrorAction SilentlyContinue
Get-ChildItem C:\Windows\SoftwareDistribution\Download -Force -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Start-Service bits, wuauserv -ErrorAction SilentlyContinue
Write-Host "    libéré : $(Go ((Libre) - $a)) (Windows Update re-téléchargera si besoin)"

# --- 3. Cache Delivery Optimization ----------------------------------------------------
Etape "Cache d'optimisation de la distribution"
$a = Libre
try { Delete-DeliveryOptimizationCache -Force -ErrorAction Stop } catch { Write-Host "    (non disponible)" }
Write-Host "    libéré : $(Go ((Libre) - $a))"

# --- 4. Magasin de composants WinSxS ---------------------------------------------------
Etape "Composants WinSxS superflus (DISM, 5 à 30 min)"
Write-Host "    Note : /ResetBase rend les mises à jour DÉJÀ installées non désinstallables." -ForegroundColor DarkYellow
$a = Libre
Dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase
Write-Host "    libéré : $(Go ((Libre) - $a))"

# --- 5. Hibernation (option) -------------------------------------------------------------
if ($DesactiverHibernation) {
    Etape "Désactivation de la veille prolongée (hiberfil.sys)"
    $a = Libre
    powercfg /h off
    Write-Host "    libéré : $(Go ((Libre) - $a))  —  pour réactiver : powercfg /h on"
}

# --- 6. Fichier d'échange vers D: (option, redémarrage requis) ---------------------------
if ($DeplacerFichierEchangeSurD) {
    Etape "Fichier d'échange : C: 1-2 Go + D: 4-16 Go"
    $cs = Get-CimInstance Win32_ComputerSystem
    if ($cs.AutomaticManagedPagefile) { $cs | Set-CimInstance -Property @{ AutomaticManagedPagefile = $false } }
    Get-CimInstance Win32_PageFileSetting | Remove-CimInstance
    # WMI refuse parfois les tailles à la création ("Value out of range") :
    # on crée l'entrée avec son nom seul, puis on fixe les tailles.
    foreach ($pf in @(@{ N = 'C:\pagefile.sys'; I = 1024; M = 2048 }, @{ N = 'D:\pagefile.sys'; I = 4096; M = 16384 })) {
        if (-not (Get-CimInstance Win32_PageFileSetting | Where-Object Name -eq $pf.N)) {
            try { New-CimInstance -ClassName Win32_PageFileSetting -Property @{ Name = $pf.N } -ErrorAction Stop | Out-Null } catch { }
        }
        Get-CimInstance Win32_PageFileSetting | Where-Object Name -eq $pf.N |
            Set-CimInstance -Property @{ InitialSize = [uint32]$pf.I; MaximumSize = [uint32]$pf.M }
    }
    Get-CimInstance Win32_PageFileSetting | ForEach-Object { Write-Host ("    {0} : {1}-{2} Mo" -f $_.Name, $_.InitialSize, $_.MaximumSize) }
    Write-Host "    ~21 Go seront libérés sur C: APRÈS LE REDÉMARRAGE." -ForegroundColor Yellow
    Write-Host "    Pour revenir à la gestion automatique :" -ForegroundColor DarkGray
    Write-Host "      Get-CimInstance Win32_PageFileSetting | Remove-CimInstance" -ForegroundColor DarkGray
    Write-Host "      Get-CimInstance Win32_ComputerSystem | Set-CimInstance -Property @{AutomaticManagedPagefile=`$true}" -ForegroundColor DarkGray
}

# --- Bilan -------------------------------------------------------------------------------
$fin = Libre
Write-Host "`nC: libre APRÈS : $(Go $fin)  (gain immédiat : $(Go ($fin - $depart)))" -ForegroundColor Green
if ($DeplacerFichierEchangeSurD) { Write-Host "Redémarrez maintenant pour récupérer l'espace du fichier d'échange." -ForegroundColor Yellow }
