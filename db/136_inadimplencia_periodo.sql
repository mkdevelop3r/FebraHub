-- ============================================================
-- Migration 136 — Inadimplência por período de vencimento
--
-- Preserva a view acumulada consumida pelo front publicado e cria uma view
-- diária para o novo front responder a Ano/Mês/7 dias/Hoje. A métrica é um
-- recorte da posição atual: parcelas ainda vencidas, agrupadas pela data em
-- que venceram; não reconstrói o status histórico que tinham naquele dia.
-- ============================================================

create or replace view public.vw_financeiro_inadimplencia_origem_periodo as
select
  data_vencimento::date as data,
  case
    when categoria ilike '%centro conceito%' then 'Loja'
    when categoria ilike '%comiss%' then 'Comissão'
    when categoria ilike '%empréstimo%'
      or categoria ilike '%emprestimo%' then 'Empréstimo'
    else 'Cursos e outros'
  end                         as origem,
  count(*)::bigint            as parcelas_vencidas,
  sum(valor)                  as valor_vencido
from public.fato_contas_receber
where public.pode_ver('financeiro')
  and status = 'Vencido'
  and data_vencimento is not null
group by 1, 2;

grant select on public.vw_financeiro_inadimplencia_origem_periodo to authenticated;

notify pgrst, 'reload schema';
