param(
    [string]$NodePath = 'node',
    [switch]$Diagnostico,
    [ValidateSet('gated', 'pilot', 'all')][string]$Modo = 'gated'
)
$ErrorActionPreference = 'Stop'
$logDir = Join-Path $env:LOCALAPPDATA 'FebraHub/whatsapp-monitor'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'execucoes.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Move-Item -LiteralPath $log -Destination "$log.old" -Force }
try {
    & (Join-Path $PSScriptRoot 'whatsapp_monitor_abrir.ps1')
    $envFile = $env:FEBRAHUB_ENV_FILE
    if (-not $envFile) { $envFile = Join-Path $PSScriptRoot '.env' }
    if (-not (Test-Path -LiteralPath $envFile)) { $envFile = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'etl/.env' }
    if (-not (Test-Path -LiteralPath $envFile)) { throw 'Arquivo etl/.env ausente.' }
    Get-Content -LiteralPath $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $parts = $line.Split('=', 2)
            [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), 'Process')
        }
    }
    $params = @((Join-Path $PSScriptRoot 'whatsapp_grupo_confirmacoes.mjs'), "--$Modo")
    if (-not $Diagnostico) { $params += '--write' }
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Iniciando leitura"
    # Windows PowerShell trata stderr nativo como ErrorRecord; preserve o erro completo.
    $ErrorActionPreference = 'Continue'
    $output = & $NodePath @params 2>&1
    $result = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $logText = ($output | Out-String -Width 240)
    [System.IO.File]::AppendAllText($log, $logText, [System.Text.UTF8Encoding]::new($false))
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Resultado=$result"
    exit $result
} catch {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Falha: $($_.Exception.Message)"
    exit 1
}
