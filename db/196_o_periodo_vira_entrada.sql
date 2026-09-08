-- ============================================================
-- FebraHub · Migration 196 — O periodo vira entrada, e o total para de dobrar
--
-- A Dulce perguntou se os numeros eram fidedignos. Medindo, dois nao eram.
--
-- ------------------------------------------------------------
-- 1. O GASTO MOSTRADO ERA O DA VIDA INTEIRA DA CAMPANHA
--
-- A view somava `gasto` de toda a campanha e a tela apenas ESCOLHIA quais
-- campanhas exibir. Entao `[CIS 252 SALVADOR][LP]` aparecia com R$ 3.109
-- olhando agosto ou setembro -- sendo que em setembro gastou R$ 1.496.
--
-- Uma view nao recebe parametro, e foi por isso que eu escrevi assim. Mas a
-- pergunta que a pessoa faz TEM um periodo dentro ("quanto gastei em setembro
-- e quanto voltou"), entao o periodo tem que ser entrada, nao filtro aplicado
-- depois. Vira funcao.
--
-- ------------------------------------------------------------
-- 2. A RECEITA NAO SOMAVA, E O TOPO DA TELA SOMAVA
--
-- Medido: 194 pares campanha x matricula para 145 matriculas DISTINTAS. Quem
-- foi lead de duas campanhas tem a venda creditada as duas.
--
-- Por linha isso esta certo e e assim que se mede atribuicao: as duas
-- campanhas tocaram aquela pessoa. O erro foi o topo da tela SOMAR a coluna --
-- R$ 308.301 onde a receita real e R$ 219.930. Quarenta por cento.
--
-- A correcao nao e mudar a linha, e dar ao topo um numero proprio, contado por
-- matricula distinta. Por isso sao DUAS funcoes: uma por campanha, que pode
-- repetir, e uma de total, que nao repete. Elas discordam de proposito, e a
-- tela precisa dizer isso.
-- ============================================================


-- ------------------------------------------------------------
-- Base comum. Ficaria melhor como funcao propria, mas duas SQL functions
-- lendo a mesma CTE materializam duas vezes; repetir aqui custa menos que a
-- indirecao, e as duas mudam juntas quando o metodo mudar.
-- ------------------------------------------------------------

create or replace function public.mkt_campanha_resultado(
  p_ini date,
  p_fim date,
  p_janela_venda integer default 180   -- ver db/194: escolha, nao fato
)
returns table (
  campanha_nome   text,
  comecou         date,
  terminou        date,
  anuncios        bigint,
  gasto           numeric,
  leads           bigint,
  vendas          bigint,
  receita         numeric,
  cpl             numeric,
  cac             numeric,
  retorno         numeric,
  sem_de_para     boolean,
  ja_eram_alunos  bigint
)
language sql
stable
security definer
set search_path = public
as $FN$
with janela as (
  -- A veiculacao inteira decide o RECORTE da atribuicao (landing page vive
  -- mais que a campanha); o gasto abaixo e so o do periodo pedido.
  select campanha_nome,
         min(data) as comecou,
         max(data) as terminou,
         max(data) + 3 as vale_ate,
         count(distinct anuncio_id) as anuncios
    from fato_meta_insights
   where gasto > 0
   group by campanha_nome
),
gasto_no_periodo as (
  select campanha_nome, sum(gasto) as gasto
    from fato_meta_insights
   where gasto > 0 and data between p_ini and p_fim
   group by campanha_nome
),
anuncio_da_campanha as (select distinct anuncio_id, campanha_nome from fato_meta_insights),
lead_crm as (
  select o.campanha_nome,
         lower(btrim(l.email)) as email,
         "right"(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 8) as tel8,
         l.criado_em::date as quando
    from fato_crm_lead l
    join mkt_origem_campanha o on o.fonte = l.fonte
    join janela j on j.campanha_nome = o.campanha_nome
   where l.criado_em::date between j.comecou and j.vale_ate
     and l.criado_em::date between p_ini and p_fim
),
lead_clint as (
  select a.campanha_nome,
         lower(btrim(n.email_contato)) as email,
         null::text as tel8,
         n.data_criacao::date as quando
    from fato_negocio_lead n
    join anuncio_da_campanha a on a.anuncio_id = n.id_anuncio
   where n.id_anuncio is not null
     and n.data_criacao::date between p_ini and p_fim
),
lead as (
  select campanha_nome, nullif(email,'') as email, nullif(tel8,'') as tel8, min(quando) as quando
    from (select * from lead_crm union all select * from lead_clint) u
   where nullif(email,'') is not null or nullif(tel8,'') is not null
   group by 1, 2, 3
),
venda as (
  select matricula_id,
         lower(btrim(email_cliente)) as email,
         "right"(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8) as tel8,
         data_matricula::date as quando, valor
    from fato_base_alunos where data_matricula is not null
),
par as (
  select l.campanha_nome, coalesce(l.email, l.tel8) as pessoa,
         v.matricula_id, v.quando, v.valor
    from lead l join venda v on v.email = l.email where l.email is not null
  union
  select l.campanha_nome, coalesce(l.email, l.tel8), v.matricula_id, v.quando, v.valor
    from lead l join venda v on v.tel8 = l.tel8
   where l.tel8 is not null and length(l.tel8) = 8
),
casado as (
  select l.campanha_nome, coalesce(l.email, l.tel8) as pessoa,
         bool_or(p.quando < l.quando) as ja_era_aluno,
         sum(p.valor) filter (
           where p.quando between l.quando and l.quando + p_janela_venda) as valor_venda
    from lead l
    left join par p on p.campanha_nome = l.campanha_nome
                   and p.pessoa = coalesce(l.email, l.tel8)
   group by 1, 2
)
select j.campanha_nome, j.comecou, j.terminou, j.anuncios,
       round(g.gasto)                                   as gasto,
       count(c.pessoa)                                  as leads,
       count(c.valor_venda)                             as vendas,
       round(coalesce(sum(c.valor_venda), 0))           as receita,
       round(g.gasto / nullif(count(c.pessoa), 0))      as cpl,
       round(g.gasto / nullif(count(c.valor_venda), 0)) as cac,
       round(coalesce(sum(c.valor_venda), 0) / nullif(g.gasto, 0), 2) as retorno,
       (count(c.pessoa) = 0
        and not exists (select 1 from mkt_origem_campanha o
                         where o.campanha_nome = j.campanha_nome)) as sem_de_para,
       count(*) filter (where c.ja_era_aluno)           as ja_eram_alunos
  from gasto_no_periodo g
  join janela j on j.campanha_nome = g.campanha_nome
  left join casado c on c.campanha_nome = j.campanha_nome
 where pode_ver('marketing') or pode_ver('geral')
 group by j.campanha_nome, j.comecou, j.terminou, j.anuncios, g.gasto;
$FN$;

comment on function public.mkt_campanha_resultado(date, date, integer) is
  'Resultado por campanha DENTRO do periodo: gasto do periodo, leads criados no
   periodo, e a venda deles. A receita desta funcao NAO SOMA entre campanhas --
   quem foi lead de duas tem a venda creditada as duas. Para o total, use
   mkt_marketing_total, que conta matricula distinta. Ver db/196.';


-- ------------------------------------------------------------
-- O total, que nao repete matricula
-- ------------------------------------------------------------
create or replace function public.mkt_marketing_total(
  p_ini date,
  p_fim date,
  p_janela_venda integer default 180
)
returns table (
  gasto              numeric,
  leads              bigint,
  matriculas         bigint,
  receita            numeric,
  retorno            numeric,
  gasto_sem_de_para  numeric
)
language sql
stable
security definer
set search_path = public
as $FN$
with janela as (
  select campanha_nome, min(data) as comecou, max(data) + 3 as vale_ate
    from fato_meta_insights where gasto > 0 group by campanha_nome
),
anuncio_da_campanha as (select distinct anuncio_id, campanha_nome from fato_meta_insights),
lead as (
  select campanha_nome, email, tel8, min(quando) as quando from (
    select o.campanha_nome,
           nullif(lower(btrim(l.email)), '') as email,
           nullif("right"(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 8), '') as tel8,
           l.criado_em::date as quando
      from fato_crm_lead l
      join mkt_origem_campanha o on o.fonte = l.fonte
      join janela j on j.campanha_nome = o.campanha_nome
     where l.criado_em::date between j.comecou and j.vale_ate
       and l.criado_em::date between p_ini and p_fim
    union all
    select a.campanha_nome, nullif(lower(btrim(n.email_contato)), ''), null::text,
           n.data_criacao::date
      from fato_negocio_lead n
      join anuncio_da_campanha a on a.anuncio_id = n.id_anuncio
     where n.id_anuncio is not null and n.data_criacao::date between p_ini and p_fim
  ) u
   where email is not null or tel8 is not null
   group by 1, 2, 3
),
venda as (
  select matricula_id, lower(btrim(email_cliente)) as email,
         "right"(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8) as tel8,
         data_matricula::date as quando, valor
    from fato_base_alunos where data_matricula is not null
),
-- DISTINCT na matricula: e o ponto inteiro desta funcao. A mesma venda
-- alcancada por duas campanhas entra UMA vez aqui e duas na outra funcao.
-- UNION de duas igualdades, e nao um OR no join. Eu escrevi com OR aqui na
-- primeira versao, logo depois de tirar exatamente isso da view na db/195, e o
-- teste estourou o tempo. O planejador nao usa indice para OR entre colunas
-- diferentes -- vale para funcao como valia para view.
matricula as (
  select distinct matricula_id, valor from (
    select v.matricula_id, v.valor
      from lead l join venda v on v.email = l.email
     where l.email is not null
       and v.quando between l.quando and l.quando + p_janela_venda
    union
    select v.matricula_id, v.valor
      from lead l join venda v on v.tel8 = l.tel8
     where l.tel8 is not null and length(l.tel8) = 8
       and v.quando between l.quando and l.quando + p_janela_venda
  ) m
),
pessoa as (select distinct coalesce(email, tel8) as quem from lead),
gasto as (
  select sum(i.gasto) as total,
         sum(i.gasto) filter (
           where not exists (select 1 from mkt_origem_campanha o
                              where o.campanha_nome = i.campanha_nome)
             and not exists (select 1 from mkt_campanha_evento e
                              where e.campanha_nome = i.campanha_nome)) as sem_mapa
    from fato_meta_insights i
   where i.gasto > 0 and i.data between p_ini and p_fim
)
select round(g.total),
       (select count(*) from pessoa),
       (select count(*) from matricula),
       round(coalesce((select sum(valor) from matricula), 0)),
       round(coalesce((select sum(valor) from matricula), 0) / nullif(g.total, 0), 2),
       round(coalesce(g.sem_mapa, 0))
  from gasto g
 where pode_ver('marketing') or pode_ver('geral');
$FN$;

comment on function public.mkt_marketing_total(date, date, integer) is
  'Total do periodo com matricula DISTINTA -- de proposito diferente da soma da
   coluna por campanha, que credita a mesma venda a cada campanha que tocou a
   pessoa. Em 09/2026 a diferenca era 40%: R$ 308.301 somando por campanha
   contra R$ 219.930 reais. Ver db/196.';

revoke execute on function public.mkt_campanha_resultado(date, date, integer) from anon;
revoke execute on function public.mkt_marketing_total(date, date, integer) from anon;
grant execute on function public.mkt_campanha_resultado(date, date, integer) to authenticated;
grant execute on function public.mkt_marketing_total(date, date, integer) to authenticated;

notify pgrst, 'reload schema';

-- conferir:
--   select * from mkt_marketing_total('2026-01-01','2026-12-31');
--   select campanha_nome, gasto, leads, vendas, receita, retorno
--     from mkt_campanha_resultado('2026-09-01','2026-09-30') order by gasto desc;
