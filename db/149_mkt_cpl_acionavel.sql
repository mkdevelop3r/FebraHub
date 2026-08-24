-- ============================================================
-- FebraHub · Migration 149 — CPL acionável por objetivo
--
-- Amplia o contrato criado na migration 146. A classificação usa o nome
-- normalizado das campanhas porque a carga histórica do Meta não possui
-- uma coluna de objetivo. Campanhas de alcance/tráfego são explicitamente
-- não mensuráveis por lead; nunca mostramos CPL vazio sem explicação.
-- ============================================================

drop view if exists public.vw_mkt_cpl_campanha;
create view public.vw_mkt_cpl_campanha as
with gasto as (
  select
    date_trunc('month', data)::date as mes,
    campanha_nome,
    sum(gasto)::numeric as gasto
  from public.fato_meta_insights
  where campanha_nome is not null
  group by 1, 2
),
leads as (
  select
    date_trunc('month', data_criacao)::date as mes,
    nome_campanha as campanha_nome,
    count(*) as leads
  from public.fato_negocio_lead
  where nome_campanha is not null and data_criacao is not null
  group by 1, 2
),
base as (
  select
    coalesce(g.mes, l.mes) as mes,
    coalesce(g.campanha_nome, l.campanha_nome) as campanha_nome,
    round(coalesce(g.gasto, 0), 2) as gasto,
    coalesce(l.leads, 0) as leads
  from gasto g
  full join leads l
    on l.mes = g.mes and l.campanha_nome = g.campanha_nome
),
classificada as (
  select b.*,
    case
      when campanha_nome ~* 'whats|mensag' then 'WhatsApp'
      when campanha_nome ~* 'alcance' then 'Alcance'
      when campanha_nome ~* 'tr[aá]fego' then 'Tráfego'
      when campanha_nome ~* 'lead|capta|cadastro|formul' then 'Captação'
      else 'Outro'
    end as objetivo,
    campanha_nome ~* 'whats|mensag|lead|capta|cadastro|formul' as gera_lead
  from base b
)
select
  mes,
  campanha_nome,
  gasto,
  leads,
  case
    when gera_lead and leads > 0 and gasto > 0 then round(gasto / leads, 2)
  end as cpl,
  objetivo,
  gera_lead,
  case
    when not gera_lead then 'Objetivo não gera lead mensurável'
    when gasto <= 0 then 'Sem investimento registrado no período'
    when leads <= 0 then 'Sem lead identificado para calcular o CPL'
    else null
  end as explicacao
from classificada
where public.pode_ver('marketing');

grant select on public.vw_mkt_cpl_campanha to authenticated;
notify pgrst, 'reload schema';
