-- ============================================================
-- Migration 134 — Formas de pagamento por período
--
-- A view anterior era acumulada por toda a história e não expunha data;
-- por isso o donut ignorava Ano/Mês/7 dias. A granularidade passa a ser
-- diária, por data de pagamento, e o front reagrega o intervalo escolhido.
-- Uma venda com mais de uma forma continua no bucket "Múltiplas formas".
-- ============================================================

drop view if exists public.vw_financeiro_formas_pagamento;

create view public.vw_financeiro_formas_pagamento as
with formas_da_venda as (
  select original_id_venda,
         count(distinct forma_pagamento) as n_formas,
         min(forma_pagamento)            as forma_unica
  from public.fato_pagamento_base
  group by original_id_venda
)
select
  f.data_pagamento::date as data,
  case
    when fv.n_formas > 1 then 'Múltiplas formas'
    when fv.forma_unica ilike '%pix%'       then 'PIX'
    when fv.forma_unica ilike '%cispay%'
      or fv.forma_unica ilike '%cielo%'     then 'Cartão CisPay'
    when fv.forma_unica ilike '%boleto%'    then 'Boleto'
    when fv.forma_unica ilike '%transfer%'  then 'Transferência'
    when fv.forma_unica ilike '%dinheiro%'  then 'Dinheiro'
    when fv.forma_unica ilike '%cheque%'    then 'Cheque'
    when fv.forma_unica ilike '%credito de curso%'
      or fv.forma_unica ilike '%credito em curso%'
      or fv.forma_unica ilike '%pontos%'    then 'Crédito/Bônus interno'
    when fv.forma_unica ilike '%getnet%' or fv.forma_unica ilike '%rede%'
      or fv.forma_unica ilike '%stone%' or fv.forma_unica ilike '%pagseguro%'
                                            then 'Adquirente legada'
    else 'Outras'
  end                         as forma,
  count(*)::bigint            as vendas,
  round(sum(f.valor))         as receita
from public.vw_venda_faturamento f
join formas_da_venda fv on fv.original_id_venda = f.original_id_venda
where public.pode_ver('financeiro')
  and f.data_pagamento is not null
group by 1, 2;

grant select on public.vw_financeiro_formas_pagamento to authenticated;

notify pgrst, 'reload schema';
