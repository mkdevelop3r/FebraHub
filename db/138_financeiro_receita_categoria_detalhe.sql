-- FebraHub · Migration 138
-- Detalhamento auditável da receita financeira por categoria e produto/evento.
-- Mantém o mesmo critério do painel: receita_unidade = valor que fica na Febracis.

create or replace view public.vw_financeiro_receita_categoria_detalhe as
select
  f.categoria_curso                            as categoria,
  f.curso,
  f.curso_curto,
  f.data_pagamento                             as data,
  count(*)                                     as vendas,
  sum(f.valor_bruto)                           as receita_bruta,
  sum(f.valor)                                 as receita_unidade,
  sum(f.valor_bruto - f.valor)                 as repasse
from public.vw_venda_faturamento f
where public.pode_ver('financeiro')
group by 1, 2, 3, 4;

grant select on public.vw_financeiro_receita_categoria_detalhe to authenticated;

