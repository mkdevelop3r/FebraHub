-- Mensagens do Pedagógico sem depender de GitHub Actions ou PC dedicado.
-- Pré-requisito: deploy da Edge Function `mensagens-pedagogico` e o mesmo
-- PEDAGOGICO_CRON_SECRET salvo no Edge Functions Secrets e no Vault.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.integracao_lock (
  fonte text primary key,
  token uuid not null,
  locked_at timestamptz not null default now(),
  locked_until timestamptz not null
);

alter table public.integracao_lock enable row level security;
revoke all on public.integracao_lock from public, anon, authenticated;

create or replace function public.adquirir_lock_mensagens_pedagogico(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare adquirido boolean := false;
begin
  insert into public.integracao_lock(fonte, token, locked_at, locked_until)
  values ('mensagens_pedagogico', p_token, now(), now() + interval '12 minutes')
  on conflict (fonte) do update
    set token = excluded.token,
        locked_at = excluded.locked_at,
        locked_until = excluded.locked_until
    where integracao_lock.locked_until < now()
  returning true into adquirido;
  return coalesce(adquirido, false);
end;
$$;

create or replace function public.liberar_lock_mensagens_pedagogico(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.integracao_lock
  where fonte = 'mensagens_pedagogico' and token = p_token;
$$;

revoke all on function public.adquirir_lock_mensagens_pedagogico(uuid) from public, anon, authenticated;
revoke all on function public.liberar_lock_mensagens_pedagogico(uuid) from public, anon, authenticated;
grant execute on function public.adquirir_lock_mensagens_pedagogico(uuid) to service_role;
grant execute on function public.liberar_lock_mensagens_pedagogico(uuid) to service_role;

-- Salve antes o segredo no Vault (uma única vez), trocando pelo valor real:
-- select vault.create_secret('SEGREDO_FORTE', 'pedagogico_cron_secret');
-- O mesmo valor deve ser configurado na Edge Function:
-- supabase secrets set PEDAGOGICO_CRON_SECRET=SEGREDO_FORTE CRM_TOKEN=... CRM_LOCATION_ID=...

create or replace function public.invocar_mensagens_pedagogico()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  segredo text;
  request_id bigint;
begin
  select decrypted_secret into segredo
  from vault.decrypted_secrets
  where name = 'pedagogico_cron_secret'
  order by created_at desc limit 1;

  if segredo is null then
    raise exception 'Vault secret pedagogico_cron_secret não configurado';
  end if;

  select net.http_post(
    url := 'https://bcorkfhfjfurlvggzgco.supabase.co/functions/v1/mensagens-pedagogico',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', segredo),
    body := '{"origem":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.invocar_mensagens_pedagogico() from public, anon, authenticated;

do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname = 'mensagens-pedagogico-15m'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'mensagens-pedagogico-15m',
  '*/15 * * * *',
  $cron$select public.invocar_mensagens_pedagogico();$cron$
);

comment on function public.invocar_mensagens_pedagogico() is
  'Invoca a Edge Function de mensagens. Agendada a cada 15 minutos pelo pg_cron.';
