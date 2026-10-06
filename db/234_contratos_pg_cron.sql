-- ============================================================
-- 234 - Contratos pelo pg_cron, 5 min depois do Salesforce
--
-- O schedule do GitHub pulou a rodada de 10h em 06/10/2026. O Supabase ja
-- dispara o sync Salesforce a cada 15 min (db/232); esta rotina dispara os
-- contratos em 05,20,35,50, dando cinco minutos para a venda chegar primeiro.
-- Usa o mesmo PAT github_dispatch_token guardado no Vault pela migration 232.
-- ============================================================

create or replace function public.invocar_contratos_autentique()
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
   order by created_at desc
   limit 1;

  if token is null then
    raise notice 'Vault secret github_dispatch_token nao configurado; contratos nao disparados';
    return null;
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/mkdevelop3r/FebraHub/actions/workflows/disparar-contrato.yml/dispatches',
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
        'dry_run', 'false',
        'limite', '50',
        'venda_id', '',
        'email_teste', '',
        'telefone_teste', ''
      )
    ),
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$function$;

do $$ begin
  perform cron.unschedule('contratos-autentique-15m');
exception when others then null;
end $$;

select cron.schedule(
  'contratos-autentique-15m',
  '5,20,35,50 * * * *',
  $$select public.invocar_contratos_autentique();$$
);

