@echo off
cd /d "%~dp0"
title LEONIDA FM - Descarga automatica por emisoras
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESCARGAR_CANCIONES.ps1" %*
pause
