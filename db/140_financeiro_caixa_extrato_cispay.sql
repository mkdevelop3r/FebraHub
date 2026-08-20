-- ============================================================
-- FebraHub · Migration 140 — Caixa CisPay pelo extrato real
--
-- `schedules-ex` contém liquidações futuras e serve para projeção.
-- O KPI "Caixa recebido" deve usar `checking-account`, persistido em
-- fato_extrato_cispay, que representa dinheiro efetivamente movimentado.
-- Mantém o contrato esperado pelo frontend: { mes, caixa }.
-- ============================================================

create or replace view public.vw_financeiro_caixa_mensal as
select
  date_trunc('month', e.data_lancamento)::date as mes,
  sum(e.valor_liquido)                         as caixa
from public.fato_extrato_cispay e
where public.pode_ver('financeiro')
  and e.data_lancamento is not null
  and e.data_lancamento <= now()
  and e.valor_liquido is not null
group by 1
order by 1;

grant select on public.vw_financeiro_caixa_mensal to authenticated;

notify pgrst, 'reload schema';
