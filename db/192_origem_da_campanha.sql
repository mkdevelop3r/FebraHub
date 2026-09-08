-- ============================================================
-- FebraHub · Migration 192 — Landing page volta a ter campanha
--
-- Par da db/191, e a parte que pega o dinheiro grande. A 191 recupera o
-- ANUNCIO para as campanhas de formulario do Meta -- que sao 5,2% do
-- investimento. Esta recupera a CAMPANHA para as de landing page, que sao 55%.
--
-- Medido em 08/09/2026, desde a virada do CRM (10/07):
--
--     landing page [LP] ......... R$ 16.188   55,0%
--     engajamento [EG] .......... R$  9.096   30,9%
--     WhatsApp .................. R$  1.894    6,4%
--     formulario do Meta [LEADS]  R$  1.535    5,2%
--
-- ------------------------------------------------------------
-- POR QUE A LANDING PAGE NAO TEM ANUNCIO, E NAO VAI TER SEM MUDANCA FORA DAQUI
--
-- O lead de LP chega ao CRM criado por um WORKFLOW, nao por uma sessao de
-- navegador. Conferido na API:
--
--     "source": "LP Metodo CIS Global",
--     "createdBy": { "source": "WORKFLOW_NEW" },
--     "attributionSource": { "sessionSource": "CRM Workflows",
--                            "medium": "Manual", "mediumId": null }
--
-- Nao ha UTM sendo descartada pelo ETL: a sessao nao chega. A LP entrega nome,
-- e-mail e telefone por webhook e a origem se perde no caminho. Recuperar o
-- ANUNCIO exige que a LP passe `utm_campaign` e `utm_content` adiante -- e
-- trabalho de quem monta a LP e os links, nao de migration.
--
-- O que sobra, e nao e pouco: o `source` NOMEIA a landing page, e cada LP
-- pertence a uma campanha. Isso da nivel de CAMPANHA para 55% do gasto.
--
-- ------------------------------------------------------------
-- A ARMADILHA: LANDING PAGE VIVE MAIS QUE A CAMPANHA
--
-- "LP IF SALVADOR" tem leads desde 10/07. A unica campanha de IF do periodo,
-- `[IF][vendas][LP] SETEMBRO`, rodou de 14/08 a 31/08. Os leads de julho NAO
-- vieram dela -- vieram de organico, link compartilhado, WhatsApp.
--
-- Atribuir todo lead de uma LP a campanha dela inflaria o resultado e baixaria
-- o CPL de mentira. Por isso o de-para NAO e `fonte -> campanha` e ponto: a
-- atribuicao so vale DENTRO DA JANELA em que a campanha teve gasto, com uma
-- folga de 3 dias no fim para quem converte com atraso.
--
-- E por isso a chave e (fonte, campanha), nao so `fonte`: a mesma LP serve
-- edicoes diferentes ao longo do ano -- CIS 251, 252, 253 -- e cada uma tem sua
-- janela. O tempo desempata.
--
-- ------------------------------------------------------------
-- O QUE FICA VISIVEL EM VEZ DE SUMIR
--
-- Campanha sem de-para APARECE no resultado, com leads em branco. Origem sem
-- de-para aparece em `vw_mkt_origem_sem_mapa`, ordenada por volume. Um painel
-- de marketing que so mostra o que ja esta mapeado esconde exatamente o que
-- falta mapear -- e o buraco cresce em silencio, que foi como a
-- rastreabilidade se perdeu em julho sem ninguem notar.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O de-para, que e de gente e nao de maquina
-- ------------------------------------------------------------
create table if not exists public.mkt_origem_campanha (
  fonte         text not null,
  campanha_nome text not null,
  observacao    text,
  criado_em     timestamptz not null default now(),
  primary key (fonte, campanha_nome)
);

comment on table public.mkt_origem_campanha is
  'De-para entre o `source` do Black CRM e o nome da campanha no Meta. E
   MANTIDO A MAO de proposito: so quem monta a campanha sabe qual landing page
   pertence a qual. A chave e (fonte, campanha) porque a mesma LP serve varias
   edicoes ao longo do ano; a janela de veiculacao desempata -- ver o cabecalho
   de db/192.';

comment on column public.mkt_origem_campanha.campanha_nome is
  'Nome EXATO como aparece em fato_meta_insights.campanha_nome. Nome que nao
   casa nao da erro -- a campanha simplesmente aparece sem leads no resultado,
   que e o sintoma a procurar quando o numero vier zerado.';

alter table public.mkt_origem_campanha enable row level security;

-- Escrita so pela direcao e pelo marketing; leitura pela view.
drop policy if exists mkt_origem_campanha_escrita on public.mkt_origem_campanha;
create policy mkt_origem_campanha_escrita on public.mkt_origem_campanha
  for all to authenticated
  using (pode_ver('marketing') or pode_ver('geral'))
  with check (pode_ver('marketing') or pode_ver('geral'));


-- ------------------------------------------------------------
-- 2. O que da para afirmar hoje
--
-- So o que as datas sustentam. As duas de CIS batem quase dia a dia com a
-- veiculacao (leads 24/08-08/09 contra campanha 23/08-08/09), e por isso vao
-- com confianca. As tres de IF vao porque a JANELA protege: os leads de julho
-- ficam de fora sozinhos, sem ninguem precisar lembrar.
--
-- O resto -- LP CEOP, FORMS, Instagram Direct -- fica em branco de proposito,
-- para aparecer em vw_mkt_origem_sem_mapa e ser decidido por quem sabe.
-- ------------------------------------------------------------
insert into public.mkt_origem_campanha (fonte, campanha_nome, observacao) values
  ('LP CIS 252 SSA',      '[CIS 252 SALVADOR][LP]',
   'Leads 18/08-08/09 contra veiculacao 23/08-08/09. Conferido em 08/09.'),
  ('LP CIS 252 Jequié',   '[CIS 252 JEQUIE][LP]',
   'Leads 24/08-08/09 contra veiculacao 23/08-08/09. Conferido em 08/09.'),
  ('LP IF SALVADOR',      '[IF][vendas][LP] SETEMBRO',
   'A LP existe desde antes da campanha; a janela recorta. Ver cabecalho.'),
  ('LP IF EMPRESÁRIOS',   '[IF][vendas][LP] SETEMBRO',
   'Publico segmentado da mesma campanha.'),
  ('LP IF MULHERES',      '[IF][vendas][LP] SETEMBRO',
   'Publico segmentado da mesma campanha.')
on conflict (fonte, campanha_nome) do nothing;


-- ------------------------------------------------------------
-- 3. O resultado por campanha
--
-- Gasto, leads, vendas e receita, com a janela mandando na atribuicao.
-- Campanha SEM de-para aparece, com leads em branco.
-- ------------------------------------------------------------
create or replace view public.vw_mkt_campanha_resultado as
with janela as (
  -- A veiculacao real, nao a que alguem planejou: primeiro e ultimo dia com
  -- gasto. A folga de 3 dias no fim e para quem clica hoje e preenche depois.
  select campanha_nome,
         min(data)                as comecou,
         max(data)                as terminou,
         max(data) + 3            as vale_ate,
         sum(gasto)               as gasto,
         count(distinct anuncio_id) as anuncios
    from fato_meta_insights
   where gasto > 0
   group by campanha_nome
),
lead as (
  select o.campanha_nome,
         l.oportunidade_id,
         lower(trim(l.email)) as email,
         right(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 8) as tel8
    from fato_crm_lead l
    join mkt_origem_campanha o on o.fonte = l.fonte
    join janela j on j.campanha_nome = o.campanha_nome
   where l.criado_em::date between j.comecou and j.vale_ate
),
venda as (
  select lower(trim(email_cliente)) as email,
         right(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8) as tel8,
         sum(valor) as valor
    from fato_base_alunos
   group by 1, 2
),
casado as (
  select l.campanha_nome, l.oportunidade_id,
         max(v.valor) as valor_venda
    from lead l
    left join venda v
           on (l.email is not null and l.email <> '' and v.email = l.email)
           or (length(l.tel8) = 8 and v.tel8 = l.tel8)
   group by 1, 2
)
select j.campanha_nome,
       j.comecou,
       j.terminou,
       j.anuncios,
       round(j.gasto)                                   as gasto,
       count(c.oportunidade_id)                         as leads,
       count(c.valor_venda)                             as vendas,
       round(coalesce(sum(c.valor_venda), 0))           as receita,
       -- CPL e CAC so quando ha o que dividir; zero no divisor vira nulo em
       -- vez de erro, e nulo na tela le-se "nao da para calcular", que e a
       -- verdade.
       round(j.gasto / nullif(count(c.oportunidade_id), 0))     as cpl,
       round(j.gasto / nullif(count(c.valor_venda), 0))         as cac,
       round(coalesce(sum(c.valor_venda), 0) / nullif(j.gasto, 0), 2) as retorno,
       (not exists (select 1 from mkt_origem_campanha o
                     where o.campanha_nome = j.campanha_nome)) as sem_de_para
  from janela j
  left join casado c on c.campanha_nome = j.campanha_nome
 where pode_ver('marketing') or pode_ver('geral')
 group by j.campanha_nome, j.comecou, j.terminou, j.anuncios, j.gasto;

comment on view public.vw_mkt_campanha_resultado is
  'Gasto, leads, vendas e retorno por campanha do Meta. A atribuicao so vale
   dentro da janela de veiculacao (+3 dias) -- landing page vive mais que a
   campanha. `sem_de_para` marca campanha que ninguem mapeou ainda: ela aparece
   com leads zerados, e o zero ali nao significa fracasso, significa falta de
   mapa.';


-- ------------------------------------------------------------
-- 4. O buraco, visivel e ordenado por tamanho
-- ------------------------------------------------------------
create or replace view public.vw_mkt_origem_sem_mapa as
select l.fonte,
       count(*)                                             as leads,
       count(*) filter (where l.email is not null and l.email <> '') as com_email,
       min(l.criado_em)::date                               as desde,
       max(l.criado_em)::date                               as ate
  from fato_crm_lead l
 where l.fonte is not null
   and l.criado_em >= current_date - 180
   and not exists (select 1 from mkt_origem_campanha o where o.fonte = l.fonte)
   and (pode_ver('marketing') or pode_ver('geral'))
 group by l.fonte
 order by count(*) desc;

comment on view public.vw_mkt_origem_sem_mapa is
  'Origens que trazem lead e ainda nao tem campanha mapeada, maiores primeiro.
   Nem toda origem daqui DEVE ser mapeada -- Instagram Direct e WhatsApp nao
   tem campanha de LP correspondente -- mas toda decisao de nao mapear deve ser
   de alguem, e nao do esquecimento.';

revoke all on public.vw_mkt_campanha_resultado, public.vw_mkt_origem_sem_mapa from anon;
grant select on public.vw_mkt_campanha_resultado, public.vw_mkt_origem_sem_mapa to authenticated;

notify pgrst, 'reload schema';

-- conferir:
--   select campanha_nome, gasto, leads, vendas, receita, cpl, cac, sem_de_para
--     from vw_mkt_campanha_resultado order by gasto desc limit 12;
--   select * from vw_mkt_origem_sem_mapa limit 10;
