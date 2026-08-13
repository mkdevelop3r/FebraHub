-- ============================================================
-- FebraHub · Migration 109 — Qualidade "sem status" por período
--
-- PROBLEMA: o card "Sem status" mostrava um número fixo (15,3% histórico,
-- da vw_financeiro_qualidade) que não reagia ao seletor de ano.
--
-- SOLUÇÃO: view com a taxa de "sem status" POR MÊS, para o card filtrar
-- pelo ano/período selecionado. Mantém a mesma lógica da view original:
-- deduplica por venda (max por original_id_venda) antes de contar, para
-- os números baterem com o que o card já mostrava.
--
-- CONTEXTO: o "sem status" é passivo histórico (2022:13,5% 2023:25,3%
-- 2024:15,4% 2025:4,5% 2026:0%). O sync atual traz status 100%.
-- ============================================================

drop view if exists public.vw_financeiro_qualidade_periodo cascade;
create view public.vw_financeiro_qualidade_periodo as
with venda as (
  select
    original_id_venda,
    max(data_pagamento)   as data_pagamento,
    max(data_aprovacao)   as data_aprovacao,
    max(status_pagamento) as status_pagamento
  from public.fato_pagamento_base
  group by original_id_venda
)
select
  date_trunc('month', coalesce(data_pagamento, data_aprovacao))::date as mes,
  count(*)                                                             as total,
  count(*) filter (where status_pagamento is null or status_pagamento = '') as sem_status,
  round(
    100.0 * count(*) filter (where status_pagamento is null or status_pagamento = '')
    / nullif(count(*), 0)
  , 1)                                                                 as pct_sem_status
from venda
where public.pode_ver('financeiro')
group by date_trunc('month', coalesce(data_pagamento, data_aprovacao))::date
order by mes;
grant select on public.vw_financeiro_qualidade_periodo to authenticated;

notify pgrst, 'reload schema';
