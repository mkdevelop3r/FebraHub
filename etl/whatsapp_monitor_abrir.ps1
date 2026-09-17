$ErrorActionPreference = 'Stop'
$cdp = 'http://127.0.0.1:9222'
$whatsapp = 'https://web.whatsapp.com/'

try {
    $tabs = @(Invoke-RestMethod "$cdp/json/list" -TimeoutSec 3)
    if ($tabs | Where-Object { $_.type -eq 'page' -and $_.url.StartsWith($whatsapp) }) { return }
    $target = [uri]::EscapeDataString($whatsapp)
    Invoke-RestMethod -Method Put -Uri "$cdp/json/new?$target" -TimeoutSec 5 | Out-Null
    return
} catch {
    # O Chrome de monitoramento ainda nao esta em execucao.
}

$browser = @("${env:ProgramFiles}/Google/Chrome/Application/chrome.exe", "${env:ProgramFiles(x86)}/Microsoft/Edge/Application/msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) { throw 'Chrome ou Edge nao encontrado.' }
$profile = Join-Path $env:LOCALAPPDATA 'FebraHub/whatsapp-browser'
Start-Process -FilePath $browser -ArgumentList @('--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9222', ('--user-data-dir="{0}"' -f $profile), $whatsapp)

$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Seconds 1
    try {
        $tabs = @(Invoke-RestMethod "$cdp/json/list" -TimeoutSec 3)
        if ($tabs | Where-Object { $_.type -eq 'page' -and $_.url.StartsWith($whatsapp) }) { return }
        $target = [uri]::EscapeDataString($whatsapp)
        Invoke-RestMethod -Method Put -Uri "$cdp/json/new?$target" -TimeoutSec 5 | Out-Null
        return
    } catch {}
} while ((Get-Date) -lt $deadline)
throw 'Chrome de monitoramento nao abriu a porta 9222 em 30 segundos.'
