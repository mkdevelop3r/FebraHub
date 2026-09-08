-- ============================================================
-- FebraHub · Migration 195 — A tela de Marketing para de estourar o tempo
--
-- "Nao foi possivel carregar / canceling statement due to statement timeout".
--
-- A `vw_mkt_campanha_resultado` ficou pesada quando ganhou o caminho do Clint
-- na db/194. Duas causas, e a segunda vale mais que a primeira.
--
-- ------------------------------------------------------------
-- 1. FALTAVAM OS INDICES DAS COLUNAS DE JUNCAO
--
-- `fato_negocio_lead` (59.613 linhas) nao tinha indice em `id_anuncio`, e
-- `fato_meta_insights` (47.373) nao tinha em `anuncio_id` -- justamente as duas
-- pontas do vinculo que a 194 criou. So esse trecho levava 2,8 s, com Seq Scan
-- nas duas tabelas.
--
-- ------------------------------------------------------------
-- 2. O `OR` NO JOIN, QUE E O CARO DE VERDADE
--
-- O casamento estava escrito assim:
--
--     left join venda v on (v.email = l.email) or (v.tel8 = l.tel8)
--
-- Le bem e roda mal: o planejador nao consegue usar indice para um OR entre
-- colunas DIFERENTES. Ele desiste e faz produto quase cartesiano entre ~15 mil
-- leads e ~21 mil matriculas.
--
-- Reescrito como UNION de duas juncoes de igualdade -- uma por e-mail, outra
-- por telefone -- cada uma passa a usar seu indice. E `union`, nao `union all`:
-- quem casa pelos DOIS caminhos apareceria duas vezes e dobraria a receita.
--
-- A chave da matricula (`matricula_id`) entra na projecao de proposito. Sem
-- ela, duas matriculas iguais no mesmo dia e valor -- que existem -- virariam
-- uma so no `union`, e a receita sairia menor sem ninguem notar. O dedup tem
-- que ser por identidade do registro, nao por semelhanca dos campos.
--
-- ------------------------------------------------------------
-- O QUE ESTA MIGRATION NAO MUDA
--
-- Nenhum numero. E reescrita de desempenho: a janela de 180 dias, a contagem
-- por pessoa e o `ja_eram_alunos` seguem identicos. Conferido comparando o
-- resultado antes e depois campanha a campanha.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Os indices
-- ------------------------------------------------------------
create index if not exists ix_negocio_lead_anuncio
  on public.fato_negocio_lead (id_anuncio) where id_anuncio is not null;

create index if not exists ix_meta_insights_anuncio
  on public.fato_meta_insights (anuncio_id);

-- Indices de EXPRESSAO: precisam repetir a expressao exata usada na view,
-- caractere a caractere, senao o planejador nao os reconhece. E o motivo de a
-- normalizacao estar centralizada em CTEs na view -- para haver uma unica
-- forma de escrever isto.
create index if not exists ix_crm_lead_email_norm
  on public.fato_crm_lead (lower(btrim(email))) where email is not null;

create index if not exists ix_negocio_lead_email_norm
  on public.fato_negocio_lead (lower(btrim(email_contato))) where email_contato is not null;

create index if not exists ix_base_alunos_email_norm
  on public.fato_base_alunos (lower(btrim(email_cliente))) where email_cliente is not null;

create index if not exists ix_base_alunos_tel8
  on public.fato_base_alunos ("right"(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8));

create index if not exists ix_crm_lead_tel8
  on public.fato_crm_lead ("right"(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8));

analyze public.fato_negocio_lead;
analyze public.fato_meta_insights;
analyze public.fato_crm_lead;
analyze public.fato_base_alunos;


-- ------------------------------------------------------------
-- 2. A view, sem o OR
-- ------------------------------------------------------------
create or replace view public.vw_mkt_campanha_resultado as
with janela as (
  select campanha_nome,
         min(data)                  as comecou,
         max(data)                  as terminou,
         max(data) + 3              as vale_ate,
         sum(gasto)                 as gasto,
         count(distinct anuncio_id) as anuncios
    from fato_meta_insights
   where gasto > 0
   group by campanha_nome
),
anuncio_da_campanha as (
  select distinct anuncio_id, campanha_nome from fato_meta_insights
),
lead_crm as (
  select o.campanha_nome,
         lower(btrim(l.email)) as email,
         "right"(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 8) as tel8,
         l.criado_em::date as quando
    from fato_crm_lead l
    join mkt_origem_campanha o on o.fonte = l.fonte
    join janela j on j.campanha_nome = o.campanha_nome
   where l.criado_em::date between j.comecou and j.vale_ate
),
lead_clint as (
  select a.campanha_nome,
         lower(btrim(n.email_contato)) as email,
         null::text                    as tel8,
         n.data_criacao::date          as quando
    from fato_negocio_lead n
    join anuncio_da_campanha a on a.anuncio_id = n.id_anuncio
   where n.id_anuncio is not null
),
lead as (
  select campanha_nome,
         nullif(email, '') as email,
         nullif(tel8, '')  as tel8,
         min(quando)       as quando
    from (select * from lead_crm union all select * from lead_clint) u
   where nullif(email, '') is not null or nullif(tel8, '') is not null
   group by 1, 2, 3
),
venda as (
  select matricula_id,
         lower(btrim(email_cliente)) as email,
         "right"(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8) as tel8,
         data_matricula::date as quando,
         valor
    from fato_base_alunos
   where data_matricula is not null
),
-- Duas igualdades em vez de um OR. Ver o cabecalho: `union` para nao dobrar
-- quem casa pelos dois caminhos, e `matricula_id` na projecao para nao fundir
-- duas matriculas de mesmo dia e valor.
par as (
  select l.campanha_nome, coalesce(l.email, l.tel8) as pessoa,
         v.matricula_id, v.quando, v.valor, l.quando as lead_em
    from lead l
    join venda v on v.email = l.email
   where l.email is not null
  union
  select l.campanha_nome, coalesce(l.email, l.tel8),
         v.matricula_id, v.quando, v.valor, l.quando
    from lead l
    join venda v on v.tel8 = l.tel8
   where l.tel8 is not null and length(l.tel8) = 8
),
casado as (
  select l.campanha_nome,
         coalesce(l.email, l.tel8) as pessoa,
         bool_or(p.quando < l.quando) as ja_era_aluno,
         sum(p.valor) filter (
           where p.quando between l.quando and l.quando + 180) as valor_venda
    from lead l
    left join par p on p.campanha_nome = l.campanha_nome
                   and p.pessoa = coalesce(l.email, l.tel8)
   group by 1, 2
)
select j.campanha_nome,
       j.comecou,
       j.terminou,
       j.anuncios,
       round(j.gasto)                                   as gasto,
       count(c.pessoa)                                  as leads,
       count(c.valor_venda)                             as vendas,
       round(coalesce(sum(c.valor_venda), 0))           as receita,
       round(j.gasto / nullif(count(c.pessoa), 0))      as cpl,
       round(j.gasto / nullif(count(c.valor_venda), 0)) as cac,
       round(coalesce(sum(c.valor_venda), 0) / nullif(j.gasto, 0), 2) as retorno,
       (count(c.pessoa) = 0
        and not exists (select 1 from mkt_origem_campanha o
                         where o.campanha_nome = j.campanha_nome))    as sem_de_para,
       count(*) filter (where c.ja_era_aluno)                         as ja_eram_alunos
  from janela j
  left join casado c on c.campanha_nome = j.campanha_nome
 where pode_ver('marketing') or pode_ver('geral')
 group by j.campanha_nome, j.comecou, j.terminou, j.anuncios, j.gasto;

notify pgrst, 'reload schema';

-- conferir: tempo e numeros iguais aos de antes
--   explain (analyze, timing off) select * from vw_mkt_campanha_resultado;
