$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$envFile = $env:FEBRAHUB_ENV_FILE
if (-not $envFile) { $envFile = Join-Path $PSScriptRoot '.env' }
if (-not (Test-Path -LiteralPath $envFile)) {
    # Durante a publicacao por worktree, reutiliza o .env do workspace principal.
    $workspace = Split-Path -Parent $repo
    $envFile = Join-Path $workspace 'etl\.env'
}
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Arquivo de ambiente nao encontrado: $envFile"
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $parts = $line.Split('=', 2)
        $value = $parts[1].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $value, 'Process')
    }
}

& node (Join-Path $PSScriptRoot 'whatsapp_grupo_confirmacoes.mjs') `
    --turmas '2026 - IF36' `
    --write

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
