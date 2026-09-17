param([int]$IntervaloMinutos = 5)
$ErrorActionPreference = 'Stop'
if ($IntervaloMinutos -lt 1) { throw 'Intervalo deve ser positivo.' }
$node = (Get-Command node -ErrorAction Stop).Source
$runner = Join-Path $PSScriptRoot 'whatsapp_monitor_rodar.ps1'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}"' -f $runner, $node
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervaloMinutos)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'FebraHub - WhatsApp Grupos' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Abre e monitora os grupos das turmas ativas pelo link_grupo; IF36 e FCIS formam o portao piloto.' -Force | Select-Object TaskName,State
