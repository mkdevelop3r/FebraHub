-- ============================================================
-- FebraHub · Migration 181 — A meta da Loja se calcula sozinha
--
-- Automatiza o metodo de docs/METODO_META_LOJA.md, que ate aqui era feito na
-- mao em SQL e digitado na tela.
--
-- A FUNCAO SUGERE, NUNCA GRAVA. Devolve os tres niveis MAIS a memoria de
-- calculo -- "3 dias de IF x 12.883 = 38.649". Sem a memoria vira caixa-preta,
-- que e o oposto do que a tela de metas existe para ser: o numero tem que ser
-- defensavel na primeira vez que alguem perguntar "por que 49 mil?".
--
-- AS REGRAS, todas ja validadas contra o banco em 04/09/2026:
--
-- 1. So evento CURTO conta (data_fim - data_inicio <= 7 dias). Coaching
--    Individual, Maestria, Team Coaching e Business Evolution duram meses e
--    aparecem em quase todo dia do calendario sem por ninguem no predio. Com
--    eles dentro, fevereiro parecia cheio de curso e a previsao errava +182%.
--
-- 2. Cada dia conta UMA vez, pelo evento de maior peso.
--
-- 3. Dia comum se separa por dia da semana. Domingo vende zero em 89% das
--    vezes, sabado em 65%, dia util em 33%. Media unica para os tres foi o
--    maior erro isolado do metodo.
--
-- 4. MEDIA nos dias de curso, MEDIANA nos dias comuns -- ali um terco dos
--    dias vende zero e a media mente.
--
-- 5. FEVEREIRO/2026 FICA FORA. A loja esteve parada de 13 a 23/02, onze dias
--    corridos sem um cupom (confirmado pelo Bruno em 04/09). Os onze zeros
--    rebaixavam a mediana de TODOS os dias comuns; tirados, o erro medio do
--    metodo caiu de 43% para 24%.
--
--    Esta na funcao como constante, e nao como regra automatica, de proposito:
--    "loja parada" e fato que alguem sabe, nao padrao que se detecta. Se
--    houver outro mes assim, acrescente aqui -- com a data e o motivo.
--
-- O QUE ELA NAO RESOLVE, e avisa em vez de esconder:
--
--   - Palestra e workshop da Central nao tem medida nenhuma. O calendario so
--     existe desde 19/08/2026. Entram como constante arbitrada, marcada
--     `estimado = true`, ate haver historico. Os parametros existem para voce
--     mudar o palpite sem mexer na funcao.
--
--   - Tipo inedito nao tem o que multiplicar. Foi o que fez marco errar 69%:
--     o workshop de 8h que fez R$ 17 mil num sabado era o primeiro do ano. A
--     funcao devolve o dia com valor zero e um aviso dizendo quantos dias
--     estao nessa situacao -- em vez de prever pouco em silencio.
-- ============================================================

create or replace function public.sugerir_meta_loja(
  p_mes       date,
  p_palestra  numeric default 544,     -- arbitrado: sem historico ate 09/2026
  p_workshop  numeric default 2363     -- idem
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $FN$
with alvo as (
  select date_trunc('month', p_mes)::date as ini,
         (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim
),
-- ---------- classificacao de um dia qualquer ----------
turma_dia as (
  select generate_series(t.data_inicio, coalesce(t.data_fim, t.data_inicio), '1 day')::date as dia,
         case
           when t.curso ilike '%INTELIG%FINANC%'        then 'IF'
           when t.curso ilike '%WORKSHOP%'
             or t.curso ilike '%ALTA PERFORMANCE%'      then 'WORKSHOP-CURSO'
           when t.curso ilike '%COACHING INTEGRAL SIST%' then 'FCIS'
           when t.curso ilike '%CIS GLOBAL%'
             or t.curso ilike '%CIS FAMILIA%'           then 'CIS'
           when t.curso ilike '%ORADORES%'              then 'FOP'
           when t.curso ilike '%TOUR CRESCIMENTO%'      then 'TCE'
           else 'OUTRO'
         end as tipo
    from dim_turmas t
   where (coalesce(t.data_fim, t.data_inicio) - t.data_inicio + 1) <= 7    -- regra 1
),
evento_dia as (
  select e.data_evento::date as dia,
         case when te.nome = 'Workshop' then 'WORKSHOP-EVENTO' else 'PALESTRA' end as tipo
    from mkt_eventos e
    join mkt_tipos_evento te on te.id = e.tipo_evento_id
   where e.cancelado_em is null and e.status = 'ativo'
     and te.nome in ('Palestra','Workshop')
),
peso as (
  select dia, tipo, case tipo
           when 'IF' then 1 when 'WORKSHOP-CURSO' then 2 when 'FCIS' then 3
           when 'CIS' then 4 when 'FOP' then 5 when 'TCE' then 6 when 'OUTRO' then 7
           when 'WORKSHOP-EVENTO' then 8 when 'PALESTRA' then 9 end as ordem
    from (select dia, tipo from turma_dia union all select dia, tipo from evento_dia) u
),
escolhido as (   -- regra 2: um dia, um tipo
  select distinct on (dia) dia, tipo from peso order by dia, ordem
),
receita as (
  select data_emissao::date as dia, sum(valor) as receita
    from fato_loja_cupom where not cancelado group by 1
),
-- ---------- historico ----------
--
-- A JANELA TERMINA NO ULTIMO DIA COM CARGA, nao na vespera do mes alvo.
--
-- Parecia obvio ir ate `a.ini - 1`, e estava errado: calculando OUTUBRO no
-- dia 4 de setembro, os dias de 5 a 30/09 ainda nao aconteceram e entravam
-- como dias que venderam zero. Os tres dias de IF de setembro (17 a 19) sao
-- futuro, e puxavam a media de IF de 12.883 para 8.589 -- e junto com ela
-- FCIS (4.548 -> 3.032) e o dia util (111 -> 73). A meta sairia ~25% menor
-- sem nenhum sinal de erro.
--
-- Dia sem dado NAO e dia sem venda. `max(data_emissao)` e o unico limite
-- honesto: alem dele nao ha informacao, so ausencia dela.
ultimo_dia as (
  select max(data_emissao)::date as dia from fato_loja_cupom where not cancelado
),
hist as (
  select d::date as dia,
         coalesce(e.tipo, case extract(dow from d) when 0 then 'DOM'
                                                   when 6 then 'SAB' else 'UTIL' end) as tipo,
         coalesce(r.receita, 0) as receita
    from alvo a, ultimo_dia u,
         generate_series('2026-01-01'::date, least(a.ini - 1, u.dia), '1 day') d
    left join escolhido e on e.dia = d::date
    left join receita r on r.dia = d::date
   where date_trunc('month', d) <> '2026-02-01'          -- regra 5
),
medido as (   -- regra 4: media no curso, mediana no dia comum
  select tipo, count(*)::int as n,
         round(case when tipo in ('UTIL','SAB','DOM')
                    then percentile_cont(0.5) within group (order by receita)
                    else avg(receita) end) as valor
    from hist group by tipo
),
-- ---------- o mes alvo ----------
alvo_dias as (
  select d::date as dia,
         coalesce(e.tipo, case extract(dow from d) when 0 then 'DOM'
                                                   when 6 then 'SAB' else 'UTIL' end) as tipo
    from alvo a, generate_series(a.ini, a.fim, '1 day') d
    left join escolhido e on e.dia = d::date
),
contagem as (
  select tipo, count(*)::int as dias from alvo_dias group by tipo
),
linhas as (
  select c.tipo, c.dias,
         case c.tipo when 'PALESTRA' then p_palestra
                     when 'WORKSHOP-EVENTO' then p_workshop
                     else coalesce(m.valor, 0) end as valor_dia,
         coalesce(m.n, 0) as n,
         (c.tipo in ('PALESTRA','WORKSHOP-EVENTO')) as estimado,
         (c.tipo not in ('PALESTRA','WORKSHOP-EVENTO') and coalesce(m.n,0) = 0) as sem_historico
    from contagem c left join medido m on m.tipo = c.tipo
),
total as (select sum(dias * valor_dia) as master from linhas)
select jsonb_build_object(
  'mes', (select ini from alvo),
  'master', round((select master from total)),
  'basica', round((select master from total) * 0.8),
  'minima', round((select master from total) * 0.8 * 0.9),
  'linhas', (select jsonb_agg(jsonb_build_object(
                'tipo', tipo, 'dias', dias, 'valor_dia', valor_dia,
                'subtotal', round(dias * valor_dia),
                'n', n, 'estimado', estimado, 'sem_historico', sem_historico)
                order by dias * valor_dia desc) from linhas),
  -- HAVING sem GROUP BY, e nao `group by 1`: a expressao do select contem
  -- agregados, e agrupar por ela da 42803. Sem GROUP BY o bloco ja e uma
  -- linha so; o HAVING existe para SUPRIMI-LA quando nao ha dia na situacao
  -- -- senao o aviso sairia com "null dia(s)" toda vez que estivesse tudo bem.
  'avisos', (select coalesce(jsonb_agg(txt), '[]'::jsonb) from (
      select 'Sem historico para ' || sum(dias) || ' dia(s) de tipo ' ||
             string_agg(distinct tipo, ', ') ||
             ' -- entram como zero. Arbitre o valor antes de salvar.' as txt
        from linhas where sem_historico
       having sum(dias) > 0
      union all
      select 'Palestra e workshop da Central sao valores ARBITRADOS (' ||
             sum(dias) || ' dia(s)): nao ha historico ate 09/2026.'
        from linhas where estimado
       having sum(dias) > 0
    ) x)
);
$FN$;

revoke execute on function public.sugerir_meta_loja(date, numeric, numeric) from anon;
grant execute on function public.sugerir_meta_loja(date, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';

-- conferir: setembro deve bater com o que foi gravado a mao
--   select public.sugerir_meta_loja('2026-09-01');
--   -- esperado master ~61.366, basica ~49.093, minima ~44.184
