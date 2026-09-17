-- FebraHub · Migration 204 — Status do monitor de grupos do WhatsApp
-- Uma linha por turma e tipo de leitura, sem armazenar telefones.

create table if not exists public.pedagogico_whatsapp_status (
  turma_id text not null references public.dim_turmas(turma_id)
    on update cascade on delete cascade,
  monitor text not null check (monitor in ('participantes', 'solicitacoes')),
  ultima_execucao timestamptz not null default now(),
  status text not null check (status in ('ok', 'erro')),
  identificados integer not null default 0 check (identificados >= 0),
  novos integer not null default 0 check (novos >= 0),
  desconhecidos integer not null default 0 check (desconhecidos >= 0),
  ambiguos integer not null default 0 check (ambiguos >= 0),
  total_pendente integer not null default 0 check (total_pendente >= 0),
  aprovaria_automaticamente integer not null default 0 check (aprovaria_automaticamente >= 0),
  revisao_manual integer not null default 0 check (revisao_manual >= 0),
  nao_elegivel integer not null default 0 check (nao_elegivel >= 0),
  motivos jsonb not null default '{}'::jsonb,
  erro text,
  grupo text,
  modo text not null check (modo in ('gravacao', 'diagnostico')),
  duracao_segundos numeric(10, 1) not null default 0 check (duracao_segundos >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (turma_id, monitor)
);

comment on table public.pedagogico_whatsapp_status is
  'Último resultado do monitor automático de participantes e solicitações por turma; nunca armazena telefones.';
comment on column public.pedagogico_whatsapp_status.motivos is
  'Contagens agregadas por motivo da simulação de solicitações de entrada.';

alter table public.pedagogico_whatsapp_status enable row level security;

drop policy if exists sel_pedagogico_whatsapp_status on public.pedagogico_whatsapp_status;
create policy sel_pedagogico_whatsapp_status
  on public.pedagogico_whatsapp_status
  for select
  to authenticated
  using (public.pode_ver('pedagogico'));

revoke all on table public.pedagogico_whatsapp_status from anon;
grant select on table public.pedagogico_whatsapp_status to authenticated;
grant select, insert, update, delete on table public.pedagogico_whatsapp_status to service_role;

notify pgrst, 'reload schema';
