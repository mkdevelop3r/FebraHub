-- ============================================================
-- FebraHub · Migration 146 — Hub de Marketing: investimento e captação
--
-- CONTEXTO (investigação de 21/08/2026):
-- A atribuição lead->venda trava em 4-8% e não tem conserto por código —
-- lead e venda não compartilham chave estável (CPF vazio no lead, contato
-- diferente entre cadastro e compra). Testado: email, telefone, ponte via
-- dim_alunos, tabela nova com 99% de contato. Teto real.
-- Por isso este bloco do hub usa SÓ dados que NÃO dependem de atribuição:
-- gasto (Meta) e leads captados. São dados completos e confiáveis.
--
-- ATENÇÃO: fato_meta_insights.leads e .cpl vêm VAZIOS do ETL do Meta
-- (0 linhas preenchidas de 46.532). Por isso o CPL é calculado cruzando
-- o gasto do Meta com a contagem de leads da fato_negocio_lead pelo nome
-- da campanha. Só 31 de 72 campanhas de lead casam com o Meta (13.850
-- leads = 23% do total; R$ 77.545 de gasto = 17%). A coluna `cobertura`
-- marca cada linha para o front não exibir CPL onde falta um dos lados.
-- ============================================================

-- 1) Investimento mensal por campanha
drop view if exists public.vw_mkt_investimento_mensal cascade;
create view public.vw_mkt_investimento_mensal as
select
  date_trunc('month', data)::date as mes,
  campanha_nome,
  substring(campanha_nome from '^\[([A-Za-z$]+)\]') as prefixo,
  round(sum(gasto)::numeric, 2) as gasto,
  sum(impressoes)               as impressoes,
  sum(cliques)                  as cliques
from public.fato_meta_insights
where public.pode_ver('marketing')
group by 1, 2, 3;
grant select on public.vw_mkt_investimento_mensal to authenticated;

-- 2) Leads captados por mês / campanha / anúncio
drop view if exists public.vw_mkt_leads_mensal cascade;
create view public.vw_mkt_leads_mensal as
select
  date_trunc('month', data_criacao)::date as mes,
  coalesce(nullif(nome_campanha, ''), '(sem campanha)') as campanha_nome,
  coalesce(nullif(nome_anuncio, ''), '(sem anuncio)')   as anuncio_nome,
  count(*) as leads
from public.fato_negocio_lead
where public.pode_ver('marketing') and data_criacao is not null
group by 1, 2, 3;
grant select on public.vw_mkt_leads_mensal to authenticated;

-- 3) CPL por campanha/mês — full join para expor os dois lados
drop view if exists public.vw_mkt_cpl_campanha cascade;
create view public.vw_mkt_cpl_campanha as
with gasto as (
  select date_trunc('month', data)::date as mes, campanha_nome,
         sum(gasto)::numeric as gasto
  from public.fato_meta_insights
  where campanha_nome is not null
  group by 1, 2
),
leads as (
  select date_trunc('month', data_criacao)::date as mes, nome_campanha as campanha_nome,
         count(*) as leads
  from public.fato_negocio_lead
  where nome_campanha is not null and data_criacao is not null
  group by 1, 2
)
select
  coalesce(g.mes, l.mes)                     as mes,
  coalesce(g.campanha_nome, l.campanha_nome) as campanha_nome,
  round(coalesce(g.gasto, 0), 2)             as gasto,
  coalesce(l.leads, 0)                       as leads,
  case when coalesce(l.leads,0) > 0 and coalesce(g.gasto,0) > 0
       then round(g.gasto / l.leads, 2) end  as cpl,
  case when g.campanha_nome is not null and l.campanha_nome is not null then 'gasto+leads'
       when g.campanha_nome is not null then 'so gasto'
       else 'so leads' end                   as cobertura
from gasto g
full join leads l on l.mes = g.mes and l.campanha_nome = g.campanha_nome
where public.pode_ver('marketing');
grant select on public.vw_mkt_cpl_campanha to authenticated;

notify pgrst, 'reload schema';