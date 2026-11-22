@echo off
rem Autorise le telephone (meme Wi-Fi) a se connecter a Revente, dans le pare-feu Windows.
rem Demande les droits administrateur si besoin.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
rem Si on a clique "Annuler" a la fenetre du pare-feu, Windows a cree des regles qui BLOQUENT Node.js.
rem Une regle de blocage passe avant toute autorisation : on les supprime.
powershell -NoProfile -Command "Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*node.exe' } | Get-NetFirewallRule | Where-Object { $_.Action -eq 'Block' } | Remove-NetFirewallRule" >nul 2>&1
netsh advfirewall firewall delete rule name="Revente" >nul 2>&1
netsh advfirewall firewall add rule name="Revente" dir=in action=allow protocol=TCP localport=3000 remoteip=localsubnet profile=any
echo.
echo   C'est fait : le telephone peut se connecter a Revente sur le meme Wi-Fi.
echo   Seuls les appareils de ton reseau local sont autorises, et l'app reste protegee par ton mot de passe.
echo.
pause
