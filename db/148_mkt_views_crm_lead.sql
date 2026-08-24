-- ============================================================
-- FebraHub · Migration 148 — Hub de Marketing: captação (Black CRM)
--
-- CONTEXTO: o Clint saiu em 13/07/2026 e a fato_negocio_lead congelou
-- (59.613 leads, out/2024–jul/2026, vira histórico). A fato_crm_lead
-- recebe o dado novo do Black CRM via etl/blackcrm_leads_sync.py.
--
-- CUIDADO CENTRAL: em 16/07/2026 foram importados 24.081 registros num
-- único dia — é a MIGRAÇÃO da base antiga, sem origem preenchida. Nos
-- dias em volta o fluxo é de 8 a 38 leads/dia com fonte em ~100%.
-- Misturar os dois faz o painel mostrar "3% de cobertura de origem"
-- quando a captação real tem ~80%. Por isso todas as views de captação
-- filtram criado_em >= 2026-07-17 e a migração fica isolada na
-- vw_mkt_base_migrada.
--
-- NOTA sobre meio_id: o CRM guarda o id do post/conversa do Instagram
-- (16 dígitos, ex 1013886315034832), NÃO o id do anúncio do Meta
-- (18 dígitos, padrão 1202...0540). Testado: 0 de 82 ids casam com
-- anuncio_id, campanha_id ou adset_id. Não há CPL por anúncio por aqui.
--
-- Distribuição na criação (17/07 a 21/08, 811 leads):
--   WhatsApp 332 · Formulário Facebook 209 · Sem origem 124
--   Instagram Direct 85 · Landing page 47 · Facebook 7 · Outros 7
-- ============================================================

-- 1) Captação diária (exclui a importação de 16/07)
drop view if exists public.vw_mkt_captacao_diaria cascade;
create view public.vw_mkt_captacao_diaria as
select
  criado_em::date                                          as dia,
  count(*)                                                 as leads,
  count(*) filter (where fonte is not null)                as com_origem,
  count(*) filter (where telefone is not null)             as com_telefone,
  count(*) filter (where email is not null)                as com_email
from public.fato_crm_lead
where public.pode_ver('marketing')
  and criado_em >= date '2026-07-17'
group by 1;
grant select on public.vw_mkt_captacao_diaria to authenticated;

-- 2) Leads por canal — agrupa as fontes cruas em canais de negócio
drop view if exists public.vw_mkt_leads_canal cascade;
create view public.vw_mkt_leads_canal as
select
  date_trunc('month', criado_em)::date as mes,
  case
    when fonte ilike '%whatsapp%'                          then 'WhatsApp'
    when fonte ilike 'forms%' or fonte ilike '%leads ads%' then 'Formulário Facebook'
    when fonte ilike 'lp %'   or fonte ilike '%lp_%'       then 'Landing page'
    when fonte ilike '%instagram%'                         then 'Instagram Direct'
    when fonte ilike '%facebook%'                          then 'Facebook'
    when fonte is null                                     then 'Sem origem'
    else 'Outros'
  end                                   as canal,
  count(*)                              as leads,
  count(*) filter (where telefone is not null) as com_telefone,
  count(*) filter (where email is not null)    as com_email,
  count(distinct pipeline_id)           as pipelines
from public.fato_crm_lead
where public.pode_ver('marketing')
  and criado_em >= date '2026-07-17'
group by 1, 2;
grant select on public.vw_mkt_leads_canal to authenticated;

-- 3) Fontes cruas — a nomenclatura real que o marketing usa
drop view if exists public.vw_mkt_leads_fonte cascade;
create view public.vw_mkt_leads_fonte as
select
  coalesce(fonte, '(sem origem)')              as fonte,
  count(*)                                     as leads,
  count(*) filter (where telefone is not null) as com_telefone,
  min(criado_em)::date                         as primeiro,
  max(criado_em)::date                         as ultimo
from public.fato_crm_lead
where public.pode_ver('marketing')
  and criado_em >= date '2026-07-17'
group by 1;
grant select on public.vw_mkt_leads_fonte to authenticated;

-- 4) Saúde da captação — alimenta o alerta de sync parado no topo do hub
drop view if exists public.vw_mkt_saude_captacao cascade;
create view public.vw_mkt_saude_captacao as
select
  max(criado_em)                                              as ultimo_lead,
  (current_date - max(criado_em)::date)                       as dias_sem_lead,
  (current_date - max(criado_em)::date) > 2                   as alerta,
  count(*) filter (where criado_em >= current_date - 7)       as leads_7d,
  count(*) filter (where criado_em >= current_date - 30)      as leads_30d,
  (select max(sincronizado_em) from public.fato_crm_lead)     as ultimo_sync
from public.fato_crm_lead
where public.pode_ver('marketing')
  and criado_em >= date '2026-07-17';
grant select on public.vw_mkt_saude_captacao to authenticated;

-- 5) A migração isolada — consulta, fora dos painéis de captação
drop view if exists public.vw_mkt_base_migrada cascade;
create view public.vw_mkt_base_migrada as
select
  count(*)                                     as registros,
  count(*) filter (where telefone is not null) as com_telefone,
  count(*) filter (where email is not null)    as com_email,
  count(*) filter (where fonte is not null)    as com_origem,
  min(criado_em)::date                         as de,
  max(criado_em)::date                         as ate
from public.fato_crm_lead
where public.pode_ver('marketing')
  and criado_em < date '2026-07-17';
grant select on public.vw_mkt_base_migrada to authenticated;

notify pgrst, 'reload schema';
