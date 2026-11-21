@echo off
chcp 65001 >nul
title LEONIDA FM - Ultimo rescate
cd /d "%~dp0"
echo LEONIDA FM - Reintento profundo con fuentes alternativas
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESCARGAR_CANCIONES.ps1" -ActualizarEnlaces -BusquedaProfunda
if errorlevel 1 echo Revisa el motivo del error mostrado arriba.
echo.
pause
