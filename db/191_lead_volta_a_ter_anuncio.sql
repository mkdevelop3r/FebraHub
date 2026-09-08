-- ============================================================
-- FebraHub · Migration 191 — O lead volta a saber de que anuncio veio
--
-- A rastreabilidade anuncio -> lead -> venda esta quebrada no PRIMEIRO elo
-- desde 13/07/2026, e o motivo estava escondido atras de uma frase errada.
--
-- ------------------------------------------------------------
-- O QUE ACONTECEU
--
-- Ate 13/07 o Clint trazia `id_anuncio`, `nome_anuncio` e `nome_campanha`
-- (26.059 leads em `fato_negocio_lead`, hoje congelada). A operacao migrou
-- para o Black CRM, e o cabecalho do `blackcrm_leads_sync.py` justificou a
-- troca assim:
--
--     "traz attributions com o mediumId -- o ID do anuncio no Meta. Isso
--      permite ligar lead -> anuncio -> gasto e calcular CPL por anuncio,
--      o que o Clint nao permitia."
--
-- A frase esta errada, e por isso ninguem percebeu que a rastreabilidade
-- tinha PIORADO. Conferido na API em 08/09/2026, o contato traz:
--
--     "formId": "1268691287887869",  "formName": "FCIS",
--     "adId": null,  "adSetId": null,  "campaignId": null,
--     "utmCampaign": null
--
-- `mediumId` E O `formId` -- o formulario, nao o anuncio. Os campos de
-- anuncio existem no esquema e vem NULOS: a integracao nativa Meta -> GHL nao
-- esta entregando atribuicao de anuncio.
--
-- A prova nos numeros: 657 `meio_id` distintos no CRM contra 565 `id_anuncio`
-- do historico do Clint, com ZERO em comum. E os formatos nem batem -- id de
-- anuncio do Meta tem 18 digitos e comeca em `120...`; o `mediumId` tem 15 a
-- 17 e, no Instagram, muda quase a cada lead (539 valores distintos para 597
-- leads: e o id da PESSOA que mandou a DM).
--
-- ------------------------------------------------------------
-- POR QUE NAO INTEGRAR O SALESFORCE COM O META, QUE FOI A PRIMEIRA IDEIA
--
-- Porque o Salesforce nao tem onde guardar isso: das 5.433 oportunidades de
-- 2026 desta unidade, 104 tem `utm_campaign__c` preenchido. Dois por cento. E
-- o lead nao nasce la -- nasce no CRM. Ligar as duas pontas nao cria o meio.
--
-- ------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ
--
-- Nada disso precisa de dado novo do Meta alem do que ja temos: o
-- `meta_sync.py` ja traz 3.755 anuncios com nome, campanha e GASTO
-- (`fato_meta_insights`, R$ 483 mil desde 2024, atualizado hoje). O que falta
-- e a lista de LEADS por anuncio, que a Marketing API entrega em
-- `/{ad_id}/leads` -- e que `etl/meta_leads_sync.py` passa a buscar.
--
-- Esta tabela recebe esses leads. A view fecha a corrente inteira.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O lead como o Meta o conhece
-- ------------------------------------------------------------
create table if not exists public.fato_meta_lead (
  lead_id        text primary key,
  anuncio_id     text not null,
  adset_id       text,
  campanha_id    text,
  form_id        text,
  form_nome      text,
  plataforma     text,
  criado_em      timestamptz not null,
  -- Chaves de casamento com o CRM e com a venda. Guardadas normalizadas
  -- porque e assim que sao comparadas -- normalizar na consulta impede
  -- indice e convida a divergencia entre um lugar e outro.
  email          text,
  telefone       text,
  tel8           text,
  nome           text,
  sincronizado_em timestamptz not null default now()
);

comment on table public.fato_meta_lead is
  'Leads de formulario do Meta, com o anuncio que os gerou. Preenchida por
   etl/meta_leads_sync.py a partir de /{ad_id}/leads. Existe porque a
   integracao nativa Meta -> Black CRM entrega o FORMULARIO e nao o ANUNCIO --
   ver o cabecalho de db/191.';

comment on column public.fato_meta_lead.tel8 is
  'Ultimos 8 digitos do telefone. E a chave de casamento que funciona: o CRM,
   o Salesforce e o Meta gravam DDI e DDD de jeitos diferentes, e os 8 finais
   sao a parte que nenhum dos tres mexe.';

comment on column public.fato_meta_lead.form_id is
  'O mesmo valor que o Black CRM grava como `meio_id` em fato_crm_lead. E por
   ele que da para conferir se o casamento por e-mail esta coerente.';

create index if not exists ix_meta_lead_email    on public.fato_meta_lead (email);
create index if not exists ix_meta_lead_tel8     on public.fato_meta_lead (tel8);
create index if not exists ix_meta_lead_anuncio  on public.fato_meta_lead (anuncio_id);
create index if not exists ix_meta_lead_criado   on public.fato_meta_lead (criado_em);

-- Mesmo padrao das outras fato: RLS ligada, ZERO policies, leitura so por view.
alter table public.fato_meta_lead enable row level security;


-- ------------------------------------------------------------
-- 2. A corrente inteira, num lugar so
--
-- anuncio (com gasto) -> lead do Meta -> lead do CRM -> matricula
--
-- CADA ELO PODE FALHAR, E A VIEW MOSTRA ONDE. Nao ha `inner join` nenhum
-- depois do lead: um lead sem venda continua aparecendo, com a venda em
-- branco. Uma view que so mostra a corrente completa esconde exatamente a
-- pergunta que a pessoa foi fazer -- "quanto do que gastei nao virou nada".
--
-- O casamento e por E-MAIL ou por TELEFONE (8 finais), nao pelos dois: exigir
-- os dois derrubaria a taxa; aceitar qualquer um a levanta. Medido em 08/09,
-- so por e-mail, 564 de 1.435 matriculas desde 10/07 acham o lead -- 39%.
-- ------------------------------------------------------------
create or replace view public.vw_mkt_lead_anuncio_venda as
with venda as (
  select lower(trim(email_cliente)) as email,
         right(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8) as tel8,
         min(data_matricula) as data_matricula,
         sum(valor)          as valor
    from fato_base_alunos
   group by 1, 2
),
gasto as (
  select anuncio_id,
         max(anuncio_nome)  as anuncio_nome,
         max(campanha_nome) as campanha_nome,
         sum(gasto)         as gasto_total
    from fato_meta_insights
   group by anuncio_id
)
select m.lead_id,
       m.criado_em                       as lead_em,
       m.anuncio_id,
       g.anuncio_nome,
       g.campanha_nome,
       g.gasto_total                     as gasto_do_anuncio,
       m.form_nome,
       m.plataforma,
       c.oportunidade_id                 as lead_no_crm,
       c.fonte                           as fonte_no_crm,
       c.status                          as status_no_crm,
       v.data_matricula,
       v.valor                           as valor_da_venda,
       (v.data_matricula is not null)    as virou_venda,
       -- Por onde o lead foi reconhecido. Serve para medir a qualidade do
       -- casamento, nao so o resultado: se "so telefone" crescer, o e-mail
       -- esta chegando sujo em algum ponto.
       case
         when v.data_matricula is null                      then 'sem venda'
         when m.email is not null and m.email = v.email     then 'e-mail'
         else 'telefone'
       end as casou_por
  from fato_meta_lead m
  left join gasto g on g.anuncio_id = m.anuncio_id
  left join fato_crm_lead c
         on (m.email is not null and lower(trim(c.email)) = m.email)
         or (m.tel8 is not null and length(m.tel8) = 8
             and right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = m.tel8)
  left join venda v
         on (m.email is not null and v.email = m.email)
         or (m.tel8 is not null and length(m.tel8) = 8 and v.tel8 = m.tel8)
 where pode_ver('marketing') or pode_ver('geral');

comment on view public.vw_mkt_lead_anuncio_venda is
  'A corrente anuncio -> lead -> venda, um lead por linha. Lead sem venda
   APARECE, com a venda em branco -- e a pergunta principal de quem olha isto.
   `casou_por` diz como o lead foi reconhecido, para medir a qualidade do
   casamento e nao so o resultado.';

revoke all on public.vw_mkt_lead_anuncio_venda from anon;
grant select on public.vw_mkt_lead_anuncio_venda to authenticated;

notify pgrst, 'reload schema';

-- conferir, depois da primeira carga do ETL:
--   select virou_venda, casou_por, count(*), round(sum(valor_da_venda))
--     from vw_mkt_lead_anuncio_venda group by 1,2 order by 1,2;
