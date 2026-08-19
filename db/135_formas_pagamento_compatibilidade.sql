-- ============================================================
-- Migration 135 — Compatibilidade das formas de pagamento
--
-- Mantém a view histórica agregada para o front já publicado e cria uma
-- view separada, diária, para o front novo filtrar Ano/Mês/7 dias.
-- ============================================================

alter view public.vw_financeiro_formas_pagamento
  rename to vw_financeiro_formas_pagamento_periodo;

create view public.vw_financeiro_formas_pagamento as
select
  forma,
  sum(vendas)::bigint as vendas,
  round(sum(receita)) as receita
from public.vw_financeiro_formas_pagamento_periodo
group by forma
order by receita desc;

grant select on public.vw_financeiro_formas_pagamento to authenticated;
grant select on public.vw_financeiro_formas_pagamento_periodo to authenticated;

notify pgrst, 'reload schema';
