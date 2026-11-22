@echo off
rem Arrete le serveur Revente (il redemarrera au prochain allumage du PC, ou en ouvrant l'icone Revente).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>&1
echo Revente est arrete.
timeout /t 3
