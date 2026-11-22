@echo off
chcp 65001 >nul
title Installation de Revente
cd /d "%~dp0"
echo.
echo   ==============================
echo     Installation de Revente
echo   ==============================
echo.

rem --- 1. Node.js ---
set "NODE=node"
where node >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE=%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo   [1/5] Installation de Node.js ^(le moteur de l'app^)...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if exist "%ProgramFiles%\nodejs\node.exe" (
      set "NODE=%ProgramFiles%\nodejs\node.exe"
    ) else (
      echo.
      echo   Node.js n'a pas pu etre installe automatiquement.
      echo   Installe-le depuis https://nodejs.org ^(bouton LTS^), puis relance ce fichier.
      pause
      exit /b 1
    )
  )
) else (
  echo   [1/5] Node.js deja present.
)
for %%I in ("%NODE%") do set "NODEDIR=%%~dpI"
if not "%NODEDIR%"=="" set "PATH=%NODEDIR%;%PATH%"

"%NODE%" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo   Node.js est trop ancien. Installe la version LTS depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

rem --- 2. Dependances ---
echo   [2/5] Installation des composants...
call npm install --omit=dev --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo   Erreur pendant l'installation des composants. Verifie la connexion internet et relance.
  pause
  exit /b 1
)

rem --- 3. Mot de passe ---
if not exist ".env" (
  echo   [3/5] Choisis le mot de passe pour ouvrir l'app ^(PC et telephone^) :
  set /p "PW=   Mot de passe : "
  call :writeenv
) else (
  echo   [3/5] Reglages deja presents ^(.env^).
)

rem --- 4. Raccourcis : Bureau + demarrage automatique avec Windows ---
echo   [4/5] Creation de l'icone sur le Bureau et du demarrage automatique...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\raccourcis.ps1"

rem --- 5. Pas de mise en veille quand le PC est branche ---
echo   [5/5] Desactivation de la mise en veille sur secteur...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1

echo.
echo   Termine ! Revente demarre...
echo   Si Windows demande l'autorisation pour le pare-feu, coche "Reseaux prives" et clique Autoriser
echo   ^(c'est ce qui permet au telephone de s'y connecter en Wi-Fi^).
echo.
wscript.exe "%~dp0windows\Revente.vbs"
timeout /t 8
exit /b 0

:writeenv
> ".env" echo APP_PASSWORD=%PW%
>> ".env" echo PORT=3000
>> ".env" echo ANTHROPIC_API_KEY=
exit /b 0
