@echo off
rem ============================================================
rem  FebraHub - sync diario da agenda do Google
rem
rem  Chamado pela tarefa do Windows "FebraHub - Sync Agenda",
rem  todo dia as 15:00. Existe como .cmd, e nao como comando solto
rem  dentro da tarefa, por tres motivos:
rem    - guarda log (tarefa agendada que falha em silencio nao
rem      serve para nada);
rem    - deixa o caminho do Python num lugar so, facil de trocar;
rem    - da para rodar na mao, com dois cliques, para testar.
rem
rem  O script Python resolve .env e service_account.json pela
rem  propria pasta, entao o diretorio de trabalho nao importa.
rem ============================================================
setlocal

set "PASTA=%~dp0"
set "LOG=%PASTA%agenda_sync.log"

rem Python da Microsoft Store. O executavel "de verdade" mora em
rem Program Files\WindowsApps com a versao no caminho -- serve para
rem hoje e quebra na proxima atualizacao. Este atalho e estavel.
set "PY=%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe"
if not exist "%PY%" set "PY=python"

rem Rotacao pobre: acima de ~1 MB o log vira .old e recomeca.
for %%A in ("%LOG%") do if %%~zA GTR 1048576 move /y "%LOG%" "%LOG%.old" >nul 2>&1

>>"%LOG%" echo.
>>"%LOG%" echo ===================== %date% %time% =====================
"%PY%" "%PASTA%agenda_sync.py" --sync >>"%LOG%" 2>&1
>>"%LOG%" echo (codigo de saida: %ERRORLEVEL%)

endlocal
