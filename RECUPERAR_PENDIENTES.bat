@echo off
setlocal
cd /d "%~dp0"
echo LEONIDA FM - Recuperacion de canciones pendientes
echo Se mantienen intactos todos los archivos de audio existentes.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESCARGAR_CANCIONES.ps1" -ActualizarEnlaces -BusquedaProfunda
pause
