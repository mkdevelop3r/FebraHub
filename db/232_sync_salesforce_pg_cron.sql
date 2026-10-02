-- ============================================================
-- FebraHub · Migration 232 — Sync do Salesforce por pg_cron (confiavel)
--
-- PROBLEMA: o agendador do GitHub estrangula o cron */15 do workflow
-- "Sync Salesforce API" (roda so algumas vezes/dia). Resultado: vendas
-- aprovadas demoram horas a aparecer no hub.
--
-- SOLUCAO: tirar o agendamento das maos do GitHub. Um pg_cron (confiavel,
-- roda no banco) chama esta funcao a cada 15 min, que dispara o workflow via
-- GitHub workflow_dispatch. Mesmo padrao do invocar_mensagens_pedagogico
-- (segredo no Vault + net.http_post), mas apontando pro GitHub.
--
-- PRE-REQUISITO (fazer no SQL Editor, NAO commitar o token):
--   1) Crie um PAT fine-grained do repo FebraHub com Actions = Read and write.
--   2) select vault.create_secret(
--        '<COLE_O_PAT_AQUI>', 'github_dispatch_token',
--        'PAT p/ disparar workflows do GitHub via pg_cron');
--   3) Rode esta migration.
--
-- O workflow do GitHub pode MANTER o schedule */15 como backup fraco; a
-- concorrencia (group salesforce-data-sync) evita duas cargas simultaneas.
-- ============================================================

create or replace function public.invocar_sync_salesforce()
returns bigint
language plpgsql
security definer
set search_path to 'public','vault','extensions'
as $function$
declare
  token text;
  request_id bigint;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'github_dispatch_token'
  order by created_at desc limit 1;

  if token is null then
    raise notice 'Vault secret github_dispatch_token nao configurado; sync nao disparado';
    return null;
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/mkdevelop3r/FebraHub/actions/workflows/sync-salesforce-api.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'febrahub-pg-cron',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object(
        'gravar_alunos', 'true',
        'gravar_pagamentos', 'true'
      )
    ),
    timeout_milliseconds := 30000
  ) into request_id;
  return request_id;
end;
$function$;

-- Agendamento a cada 15 min (idempotente).
do $$ begin
  perform cron.unschedule('sync-salesforce-15m');
exception when others then null;
end $$;

select cron.schedule(
  'sync-salesforce-15m',
  '*/15 * * * *',
  $$select public.invocar_sync_salesforce();$$
);
