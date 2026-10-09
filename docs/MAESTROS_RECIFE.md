# Maestros Recife na Central Pedagógica

Em **Central Pedagógica → Maestros**, o seletor Salvador/Recife reutiliza a
mesma lista, os mesmos indicadores, o filtro de validade e o formulário de
anotações (nome preferido, cargo, empresa, faturamento e observações).

Recife é extraída diretamente do Salesforce, unidade `FEBRACIS RECIFE 2`.
Maestro é quem possui matrícula aprovada de `MAESTRIA`, dentro dos tipos de
matrícula aceitos pelo relatório de alunos já usado em Salvador. Todas as
compras elegíveis da unidade para esses clientes entram no histórico. A
compra mais recente de Maestria determina a validade de 12 meses; a janela
perto de vencer continua em 60 dias.

O CPF normalizado identifica cada pessoa; e-mail e AccountId são alternativas
quando o CPF não existe. Dados pessoais não são impressos pelo diagnóstico.
A presença usa credenciamentos elegíveis ligados às compras do aluno e os
registros de `Presenca__c`; cada turma conta uma vez. Sem credenciamento
mensurável, a taxa fica sem valor, sem inventar ausências. Credenciamento de
outro participante não é atribuído ao comprador de vagas.

As anotações ficam em `maestro_anotacao_recife`, separadas das de Salvador.
O snapshot `fato_maestro_recife` é exclusivo do serviço; a tela lê views
restritas a `pode_ver('pedagogico')`. A troca é atômica e recusa extração
vazia, chaves duplicadas, campos obrigatórios inválidos ou queda de mais de
20% no número de pessoas. A atualização preserva as anotações manuais.

## Ativação

1. Aplicar `db/210_maestros_recife.sql` no Supabase.
2. Executar a primeira carga com a sessão Salesforce local:

   ```powershell
   python etl/maestros_recife_sync.py --org FebraHub --write
   ```

3. Publicar o front e o workflow `.github/workflows/maestros-recife.yml`.
   O workflow reutiliza os secrets Salesforce/Supabase existentes e atualiza
   Recife às 07h30 e 15h30 de Brasília. O disparo manual começa em diagnóstico.

Para conferir sem gravar:

```powershell
python etl/maestros_recife_sync.py --org FebraHub
python -m unittest discover -s etl/tests -p test_maestros_recife_sync.py
```

Validação de 08/10/2026: 12 compras de Maestria, **9 Maestros**, 125 compras
no histórico, 112 credenciamentos e 139 registros de presença. Uma pessoa
sem e-mail; todos com telefone; os campos permanecem vazios quando a fonte
não fornece o contato.

**Estado atualizado em 09/10/2026:** migrations aplicadas no Supabase; primeira carga concluída com 9 Maestros. Consulta autenticada da Central Pedagógica validada (9 linhas), testes SQL e 8 testes Python aprovados, build aprovado. Campos de aniversário compatíveis com Salvador; nascimento vem de Account.Data_de_Nascimento__c, telefone usa alternativas da fonte. Snapshot usa DELETE com condição explícita para compatibilidade com a proteção do Supabase. Front disponível em http://127.0.0.1:5173/. Sem navegador conectado para QA visual. Front e workflow incluídos nesta branch; cron entra em funcionamento após integração à main.

