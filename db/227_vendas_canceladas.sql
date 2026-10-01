-- ============================================================
-- FebraHub · Migration 227 — vendas canceladas/perdidas (Central Financeira)
--
-- O sync principal só traz vendas Aprovadas. Esta tabela guarda as de
-- StageName 'Cancelado' e 'Perdida' (Salvador 2), puxadas pelo
-- etl/cancelados_sync.py, pra aba "Cancelados" da Central Financeira.
-- data_ref = coalesce(data_cancelamento, data_fechamento) — o mês que conta.
-- ============================================================

create table if not exists public.fato_venda_cancelada (
  venda_id           text primary key,
  nome               text,
  cpf                text,
  curso              text,
  valor              numeric,
  etapa              text,            -- 'Cancelado' | 'Perdida'
  loss_reason        text,
  data_cancelamento  date,
  data_fechamento    date,
  data_ref           date,
  consultor          text,
  unidade            text,
  sincronizado_em    timestamptz default now()
);
create index if not exists fato_venda_cancelada_dataref_idx on public.fato_venda_cancelada(data_ref desc);

alter table public.fato_venda_cancelada enable row level security;
do $$ begin
  create policy "leitura financeiro" on public.fato_venda_cancelada
    for select to authenticated using (pode_ver('financeiro'));
exception when duplicate_object then null; end $$;

create or replace view public.vw_financeiro_cancelados as
select venda_id, nome, cpf, curso, valor, etapa, loss_reason,
       data_cancelamento, data_fechamento, data_ref, consultor, unidade
  from public.fato_venda_cancelada
 where pode_ver('financeiro');

notify pgrst, 'reload schema';
