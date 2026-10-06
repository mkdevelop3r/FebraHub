-- ============================================================
-- 235 - Ritmo diário dos leads por campanha
--
-- O acumulado responde quanto a campanha trouxe, mas nao se ela continua
-- trazendo. Esta view abre a mesma atribuicao da db/194 por dia, preservando
-- a deduplicacao por pessoa entre Clint e Black CRM.
-- ============================================================

create or replace view public.vw_mkt_campanha_leads_diario as
with janela as (
  select campanha_nome,
         min(data) as comecou,
         max(data) + 3 as vale_ate
    from public.fato_meta_insights
   where gasto > 0
   group by campanha_nome
),
lead_crm as (
  select o.campanha_nome,
         l.criado_em::date as dia,
         lower(nullif(btrim(l.email), '')) as email,
         nullif(right(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 8), '') as tel8
    from public.fato_crm_lead l
    join public.mkt_origem_campanha o on o.fonte = l.fonte
    join janela j on j.campanha_nome = o.campanha_nome
   where l.criado_em::date between j.comecou and j.vale_ate
),
lead_clint as (
  select a.campanha_nome,
         n.data_criacao::date as dia,
         lower(nullif(btrim(n.email_contato), '')) as email,
         null::text as tel8
    from public.fato_negocio_lead n
    join (select distinct anuncio_id, campanha_nome
            from public.fato_meta_insights) a
      on a.anuncio_id = n.id_anuncio
   where n.id_anuncio is not null
),
pessoa_dia as (
  select campanha_nome, dia,
         coalesce(email, tel8) as pessoa
    from (select * from lead_crm union all select * from lead_clint) x
   where email is not null or tel8 is not null
   group by campanha_nome, dia, coalesce(email, tel8)
)
select campanha_nome, dia, count(*)::bigint as leads
  from pessoa_dia
 where public.pode_ver('marketing') or public.pode_ver('geral')
 group by campanha_nome, dia;

comment on view public.vw_mkt_campanha_leads_diario is
  'Leads unicos por campanha e dia, com a mesma atribuicao e deduplicacao de vw_mkt_campanha_resultado.';

revoke all on public.vw_mkt_campanha_leads_diario from anon;
grant select on public.vw_mkt_campanha_leads_diario to authenticated;
notify pgrst, 'reload schema';

