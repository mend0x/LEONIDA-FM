# LEONIDA FM — buscador y organizador de canciones (Windows PowerShell)
# Uso: .\DESCARGAR_CANCIONES.ps1 -Limite 5
# Uso: .\DESCARGAR_CANCIONES.ps1 (procesa todo el catálogo)
[CmdletBinding()]
param(
    [switch]$SoloEstado,
    [switch]$SoloEnlaces,
    [switch]$ActualizarEnlaces,
    [switch]$BusquedaProfunda,
    [switch]$PermitirDudosas,
    [string]$Emisora = '',
    [ValidateRange(0, 10000)][int]$Limite = 0
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $raiz
try {
    $node = Get-Command node -ErrorAction Stop
    $motor = Join-Path $raiz 'scripts\buscar-y-descargar.mjs'
    if (-not (Test-Path -LiteralPath $motor)) { throw "No existe el motor de búsqueda: $motor" }
    $argsMotor = @($motor)
    if ($SoloEstado) { $argsMotor += '--status' }
    if ($SoloEnlaces) { $argsMotor += '--links-only' }
    if ($ActualizarEnlaces) { $argsMotor += '--refresh' }
    if ($BusquedaProfunda) { $argsMotor += '--deep-search' }
    if ($PermitirDudosas) { $argsMotor += '--force-candidates' }
    if ($Emisora) { $argsMotor += @('--only-folder', $Emisora) }
    if ($Limite -gt 0) { $argsMotor += @('--limit', [string]$Limite) }
    if (-not $SoloEstado) {
        $bin = Join-Path $raiz 'tools\yt-dlp.exe'
        if (-not (Test-Path -LiteralPath $bin)) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bin) | Out-Null
            Write-Host 'Instalando yt-dlp desde GitHub oficial...' -ForegroundColor Cyan
            $url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
            $temp = $bin + '.download'
            Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing
            if ((Get-Item -LiteralPath $temp).Length -lt 1000000) { throw 'La descarga de yt-dlp parece incompleta.' }
            Move-Item -LiteralPath $temp -Destination $bin -Force
        }
        $argsMotor += @('--yt-dlp', $bin)
    }
    Write-Host 'LEONIDA FM - Busqueda automatica y descarga por emisora' -ForegroundColor Cyan
    & $node.Source @argsMotor
    exit $LASTEXITCODE
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally { Pop-Location }
