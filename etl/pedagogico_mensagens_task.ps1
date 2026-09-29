param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '.env')
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $PSScriptRoot 'pedagogico_mensagens_task.log'
$lockPath = Join-Path ([System.IO.Path]::GetTempPath()) 'febrahub-pedagogico-mensagens.lock'
$lock = $null

function Write-TaskLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
  Write-Output $line
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo de secrets não encontrado: $Path"
  }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
    $parts = $trimmed.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Find-Python {
  $python = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($python) { return @($python.Source) }
  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($py) { return @($py.Source, '-3') }
  throw 'Python 3 não foi encontrado no PATH.'
}

function Invoke-Queue([string]$Queue, [int]$Limit, [string[]]$Python) {
  $env:MSG_FILA = $Queue
  $env:MSG_LIMITE = [string]$Limit
  $env:MSG_TURMAS_BLOQUEADAS = '2026 - IF36'
  $script = Join-Path $PSScriptRoot 'pedagogico_mensagens.py'
  if ($Python.Count -eq 1) {
    & $Python[0] $script 2>&1 | ForEach-Object { Write-TaskLog "[$Queue] $_" }
  } else {
    & $Python[0] $Python[1] $script 2>&1 | ForEach-Object { Write-TaskLog "[$Queue] $_" }
  }
  if ($LASTEXITCODE -ne 0) { throw "Fila $Queue terminou com código $LASTEXITCODE" }
}

function Save-IntegrationStatus([string]$Status, [string]$Detail) {
  $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $headers = @{
    apikey = $env:SUPABASE_SERVICE_KEY
    Authorization = "Bearer $($env:SUPABASE_SERVICE_KEY)"
    Prefer = 'resolution=merge-duplicates'
  }
  $body = @{
    fonte = 'mensagens_pedagogico'
    nome_exibicao = 'Mensagens Pedagogico'
    ultima_sync = $now
    status = $Status
    mensagem = $Detail
    atualizado_em = $now
  } | ConvertTo-Json -Compress
  $uri = "$($env:SUPABASE_URL.TrimEnd('/'))/rest/v1/integracao_status?on_conflict=fonte"
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
}

try {
  # FileShare.None impede uma segunda rodada enquanto a anterior ainda roda.
  try {
    $lock = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
  } catch [System.IO.IOException] {
    Write-TaskLog 'Outra execução ainda está ativa; esta rodada foi ignorada.'
    exit 0
  }

  Import-DotEnv $EnvFile
  foreach ($required in 'SUPABASE_URL','SUPABASE_SERVICE_KEY','CRM_TOKEN','CRM_LOCATION_ID') {
    if (-not [Environment]::GetEnvironmentVariable($required, 'Process')) {
      throw "Variável obrigatória ausente no .env: $required"
    }
  }

  $python = Find-Python
  Write-TaskLog 'Iniciando boas-vindas, confirmações e links de grupo.'
  Invoke-Queue 'boas_vindas' 5 $python
  Invoke-Queue 'turma' 10 $python
  Save-IntegrationStatus 'ok' 'Tarefa local: boas-vindas e fila de turma concluídas.'
  Write-TaskLog 'Execução concluída com sucesso.'
  exit 0
} catch {
  Write-TaskLog "ERRO: $($_.Exception.Message)"
  try { Save-IntegrationStatus 'erro' $_.Exception.Message } catch { Write-TaskLog "ERRO AO REGISTRAR STATUS: $($_.Exception.Message)" }
  exit 1
} finally {
  if ($lock) { $lock.Dispose() }
}
