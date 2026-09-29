param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '.env')
)

$ErrorActionPreference = 'Stop'
$taskName = 'FebraHub - Mensagens Pedagogico'
$runner = Join-Path $PSScriptRoot 'pedagogico_mensagens_task.ps1'
$requirements = Join-Path $PSScriptRoot 'requirements.txt'

if (-not (Test-Path -LiteralPath $runner)) { throw "Runner não encontrado: $runner" }
if (-not (Test-Path -LiteralPath $EnvFile)) { throw "Crie $EnvFile com os quatro secrets antes de instalar." }

$names = Get-Content -LiteralPath $EnvFile -Encoding utf8 | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)\s*=') { $matches[1].Trim() }
}
foreach ($required in 'SUPABASE_URL','SUPABASE_SERVICE_KEY','CRM_TOKEN','CRM_LOCATION_ID') {
  if ($names -notcontains $required) { throw "Variável ausente em ${EnvFile}: $required" }
}

$python = Get-Command python.exe -ErrorAction SilentlyContinue
if ($python) {
  & $python.Source -m pip install -r $requirements
} else {
  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if (-not $py) { throw 'Python 3 não foi encontrado no PATH.' }
  & $py.Source -3 -m pip install -r $requirements
}
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências Python.' }

$resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -EnvFile `"$resolvedEnv`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 12)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Envia boas-vindas, confirmações e links de grupo do Pedagógico a cada 15 minutos.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Output "Tarefa instalada: $taskName"
Write-Output "Primeira execução iniciada. Consulte: Get-ScheduledTaskInfo -TaskName '$taskName'"
Write-Output "Log: $(Join-Path $PSScriptRoot 'pedagogico_mensagens_task.log')"
