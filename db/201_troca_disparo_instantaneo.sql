-- ============================================================
-- FebraHub · Migration 201 — Troca de consultor executa na hora (sem cron)
--
-- A escrita no CRM é da Edge Function `troca-consultor`. Faltava QUEM a chama.
-- Em vez de cron (a cada N min), um gatilho no banco a dispara no INSTANTE em
-- que uma solicitação fica pronta para execução — status 'aprovada':
--   · passar_adiante nasce 'aprovada' (o INSERT dispara);
--   · puxar_para_si vira 'aprovada' quando o gestor aprova (o UPDATE dispara).
--
-- Server-side (pg_net), então não depende do navegador ficar aberto. A função
-- está com verify_jwt=false (é um executor de fila: só processa o que já foi
-- aprovado, não devolve dado sensível), por isso o POST vai sem segredo.
--
-- Sem laço infinito: quando a função marca a linha 'executada'/'erro', o
-- trigger reavalia, mas o guard exige status='aprovada' e pula.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.disparar_troca_consultor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'aprovada' and new.executado_em is null then
    perform net.http_post(
      url := 'https://bcorkfhfjfurlvggzgco.supabase.co/functions/v1/troca-consultor',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  end if;
  return new;
end
$function$;

drop trigger if exists trg_disparar_troca on public.troca_consultor_solicitacao;
create trigger trg_disparar_troca
after insert or update of status on public.troca_consultor_solicitacao
for each row execute function public.disparar_troca_consultor();
