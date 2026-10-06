-- 236 - Operacao das campanhas em veiculacao
-- Guarda a primeira resposta humana e expoe o funil lead a lead.

create table if not exists public.fato_crm_primeiro_atendimento (
  oportunidade_id text primary key references public.fato_crm_lead(oportunidade_id) on delete cascade,
  conversa_id text,
  primeiro_atendimento_em timestamptz,
  responsavel_id text,
  canal text,
  verificado_em timestamptz not null default now()
);

create index if not exists idx_crm_primeiro_atendimento_pendente
  on public.fato_crm_primeiro_atendimento (verificado_em)
  where primeiro_atendimento_em is null;

alter table public.fato_crm_primeiro_atendimento enable row level security;
revoke all on public.fato_crm_primeiro_atendimento from anon, authenticated;

-- Uso exclusivo do ETL com service role. "Em veiculacao" significa gasto
-- real nos ultimos sete dias; nao confunde isso com uma data planejada.
create or replace view public.vw_mkt_atendimento_candidatos as
with ativas as (
  select campanha_nome, min(data) as comecou, max(data) as ultimo_gasto
    from public.fato_meta_insights
   where gasto > 0
   group by campanha_nome
  having max(data) >= current_date - 7
)
select l.oportunidade_id, l.contato_id, l.criado_em, l.responsavel_id,
       o.campanha_nome, p.primeiro_atendimento_em, p.verificado_em
  from public.fato_crm_lead l
  join public.mkt_origem_campanha o on o.fonte = l.fonte
  join ativas a on a.campanha_nome = o.campanha_nome
               and l.criado_em::date >= a.comecou
  left join public.fato_crm_primeiro_atendimento p
         on p.oportunidade_id = l.oportunidade_id
 where l.contato_id is not null
   and l.criado_em >= now() - interval '90 days';

revoke all on public.vw_mkt_atendimento_candidatos from anon, authenticated;

create or replace view public.vw_mkt_leads_campanhas_ativas as
with ativas as (
  select campanha_nome, min(data) as comecou, max(data) as ultimo_gasto,
         sum(gasto) filter (where data >= current_date - 7) as gasto_7d
    from public.fato_meta_insights
   where gasto > 0
   group by campanha_nome
  having max(data) >= current_date - 7
)
select o.campanha_nome, a.comecou, a.ultimo_gasto, round(a.gasto_7d) as gasto_7d,
       l.oportunidade_id, l.nome, l.criado_em, l.status,
       case
         when lower(coalesce(l.status, '')) = 'won' then 'Convertido'
         when lower(coalesce(l.status, '')) in ('lost', 'abandoned') then 'Perdido'
         when p.primeiro_atendimento_em is not null then 'Em atendimento'
         else 'Aguardando atendimento'
       end as situacao,
       p.primeiro_atendimento_em,
       case when p.primeiro_atendimento_em >= l.criado_em
            then floor(extract(epoch from (p.primeiro_atendimento_em - l.criado_em)) / 60)::integer
       end as minutos_primeiro_atendimento
  from public.fato_crm_lead l
  join public.mkt_origem_campanha o on o.fonte = l.fonte
  join ativas a on a.campanha_nome = o.campanha_nome
               and l.criado_em::date >= a.comecou
  left join public.fato_crm_primeiro_atendimento p
         on p.oportunidade_id = l.oportunidade_id
 where public.pode_ver('marketing') or public.pode_ver('geral');

revoke all on public.vw_mkt_leads_campanhas_ativas from anon;
grant select on public.vw_mkt_leads_campanhas_ativas to authenticated;

comment on view public.vw_mkt_leads_campanhas_ativas is
  'Leads das campanhas com gasto nos ultimos 7 dias, estagio e tempo real ate a primeira mensagem humana.';

notify pgrst, 'reload schema';
