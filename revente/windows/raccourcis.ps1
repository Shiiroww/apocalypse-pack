# Cree l'icone Revente sur le Bureau et le demarrage automatique du serveur avec Windows.
$dossier = Split-Path -Parent $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell

function Raccourci($chemin, $script) {
  $l = $shell.CreateShortcut($chemin)
  $l.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $l.Arguments = '"' + (Join-Path $dossier "windows\$script") + '"'
  $l.WorkingDirectory = $dossier
  $l.IconLocation = (Join-Path $dossier 'windows\revente.ico')
  $l.Save()
}

Raccourci (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Revente.lnk') 'Revente.vbs'
Raccourci (Join-Path ([Environment]::GetFolderPath('Startup')) 'Revente (serveur).lnk') 'serveur.vbs'
Write-Host '   Icone Revente ajoutee sur le Bureau.'
