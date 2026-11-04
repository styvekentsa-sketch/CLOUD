# =============================================================================
#  Crée un compte Nextcloud (particulier ou entreprise) — Windows / PowerShell
#    .\scripts\new-user.ps1 -User alice -Name "Alice Martin" -Email alice@exemple.fr `
#                           -Group Entreprises -Quota "50 GB"
#    .\scripts\new-user.ps1 -User bob -Name "Bob" -Group Equipe,Clients
#  Un mot de passe temporaire conforme à la politique est généré et affiché.
# =============================================================================
param(
    [Parameter(Mandatory)] [ValidatePattern('^[A-Za-z0-9._@-]+$')] [string]$User,
    [string]$Name = "",
    [string]$Email = "",
    [string[]]$Group = @(),
    [string]$Quota = ""
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$argsList = @("compose", "exec", "-u", "www-data", "app", "sh", "/opt/scripts/user-add.sh", "--uid", $User)
if ($Name)  { $argsList += @("--name", $Name) }
if ($Email) { $argsList += @("--email", $Email) }
foreach ($g in $Group) { if ($g) { $argsList += @("--group", $g) } }
if ($Quota) { $argsList += @("--quota", $Quota) }

& docker @argsList
exit $LASTEXITCODE
