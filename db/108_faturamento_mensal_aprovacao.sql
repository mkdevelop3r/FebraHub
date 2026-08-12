-- ============================================================
-- FebraHub · Migration 89 — Faturamento mensal por aprovação (deduplicado)
--
-- PROBLEMA: Executivo e Comercial mostravam faturamentos diferentes para
-- agosto (R$ 647 mil vs R$ 278 mil) porque usavam critérios de data
-- distintos: aprovação (vendido) vs pagamento (pago/caixa).
--
-- REGRA DE ARQUITETURA: "faturamento" = o que foi VENDIDO no mês, por
-- data_aprovacao, deduplicado por venda (max valor_bruto por original_id_venda).
-- "caixa/recebido" = o que foi PAGO, é outra métrica (Financeiro).
--
-- Esta view dá o faturamento mensal canônico, para os dois hubs lerem o
-- MESMO número. Dedup por venda embutido — o front não precisa deduplicar.
-- ============================================================

drop view if exists public.vw_faturamento_mensal cascade;
create view public.vw_faturamento_mensal as
with venda as (
  -- uma linha por venda: valor deduplicado (max), data de aprovação
  select
    original_id_venda,
    max(valor_bruto)                                   as valor_bruto,
    max(valor)                                         as valor_liquido,
    min(coalesce(data_aprovacao, data_pagamento))      as data_ref
  from public.vw_venda_faturamento
  group by original_id_venda
)
select
  date_trunc('month', data_ref)::date as mes,
  count(*)                            as vendas,
  round(sum(valor_bruto))             as faturamento_bruto,
  round(sum(valor_liquido))           as faturamento_liquido
from venda
where public.pode_ver('comercial')
group by date_trunc('month', data_ref)::date
order by mes;
grant select on public.vw_faturamento_mensal to authenticated;

notify pgrst, 'reload schema';
