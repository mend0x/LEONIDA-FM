@echo off
setlocal
cd /d "%~dp0"
title LEONIDA FM - GTA VI y radio online
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Necesitas Node.js 22.13 o posterior. Visita https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  echo Instalando las dependencias del proyecto...
  call npm ci
  if errorlevel 1 goto :error
)
set "ENABLE_LOCAL_YTDLP=0"
set "HOST=127.0.0.1"
set "PORT=3000"
echo Compilando LEONIDA FM - modo canciones y radios reales...
call npm run build
if errorlevel 1 goto :error
echo.
echo LEONIDA FM: http://127.0.0.1:3000/
echo MODO GTA VI: carpeta canciones, una subcarpeta por emisora
echo MODO RADIOS REALES: Radio Browser (gratis)
 echo No requiere yt-dlp, YouTube ni suscripcion de pago.
echo.
node server/node.mjs
pause
exit /b 0
:error
echo ERROR: No se pudo instalar o compilar. Comprueba Internet y Node.js.
pause
exit /b 1
