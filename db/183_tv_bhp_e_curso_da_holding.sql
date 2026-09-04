-- ============================================================
-- FebraHub · Migration 183 — TV e BHP ganham sigla, e curso da holding sai
--
-- Duas correcoes no `sugerir_meta_loja`, e a ORDEM entre elas importa.
--
-- 1. TECNICAS DE VENDAS e BUSINESS HIGH PERFORMANCE nao tinham sigla e caiam
--    no balde 'OUTRO', que e a media de tudo que sobrou (R$ 1.519/dia, n=44)
--    -- cursos que nada tem a ver entre si. Em outubro sao 6 dias, R$ 9.114
--    do master: peso demais para um balde generico.
--
--    Medidos separados, ficam:
--      TECNICAS DE VENDAS            R$ 2.042/dia   (n=2, TV08)
--      BUSINESS HIGH PERFORMANCE     R$ 1.692/dia   (n=8, BHP24 e BHP25)
--
-- 2. `BUSINESS HIGH PERFORMANCE COM PAULO VIEIRA GLOBAL` (BHPPV-GL, 2025) e
--    curso da HOLDING, nao da unidade. Tres dias, receita ZERO nos tres --
--    coerente com um evento que nao acontece aqui. Fica fora da amostra pelo
--    mesmo motivo que fevereiro: nao e mes fraco, e dia que nao pertence a
--    esta loja.
--
-- POR QUE A ORDEM IMPORTA
--
-- O nome da holding CONTEM "BUSINESS HIGH". Se eu criasse a sigla BHP sem
-- excluir a holding ANTES, os tres dias zerados dela entrariam na media do
-- BHP -- 8 dias a 1.692 virariam 11 dias a 1.230, uma queda de 27% na
-- unica sigla que esta migration existe para tornar mais precisa. A correcao
-- envenenaria a si mesma.
--
-- Por isso a exclusao e a PRIMEIRA condicao do CASE, antes de qualquer
-- classificacao. `%PAULO VIEIRA%` e especifico de proposito: `%GLOBAL%`
-- pegaria "CIS GLOBAL", que e curso legitimo da unidade e o terceiro maior
-- gerador de venda da loja.
--
-- Conferido: BHPPV-GL e o unico curso curto com receita zero em todos os
-- dias. O IAPN-ON01 (IA para Negocios, online) tem R$ 2.569 em 2 dias e nao
-- se enquadra.
-- ============================================================

create or replace function public.sugerir_meta_loja(
  p_mes       date,
  p_palestra  numeric default 544,
  p_workshop  numeric default 2363,
  p_dias_velho integer default 30
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
turma_dia as (
  select generate_series(t.data_inicio, coalesce(t.data_fim, t.data_inicio), '1 day')::date as dia,
         case
           -- PRIMEIRO: o que nao pertence a esta loja. Ver cabecalho -- o nome
           -- da holding contem "BUSINESS HIGH", e classificar antes de excluir
           -- envenenaria a media do BHP.
           when t.curso ilike '%PAULO VIEIRA%'           then 'HOLDING'
           when t.curso ilike '%INTELIG%FINANC%'         then 'IF'
           when t.curso ilike '%WORKSHOP%'
             or t.curso ilike '%ALTA PERFORMANCE%'       then 'WORKSHOP-CURSO'
           when t.curso ilike '%COACHING INTEGRAL SIST%' then 'FCIS'
           when t.curso ilike '%CIS GLOBAL%'
             or t.curso ilike '%CIS FAMILIA%'            then 'CIS'
           when t.curso ilike '%ORADORES%'               then 'FOP'
           when t.curso ilike '%TOUR CRESCIMENTO%'       then 'TCE'
           when t.curso ilike '%T%CNICAS DE VENDAS%'     then 'TV'
           when t.curso ilike '%BUSINESS HIGH%'          then 'BHP'
           else 'OUTRO'
         end as tipo
    from dim_turmas t
   where (coalesce(t.data_fim, t.data_inicio) - t.data_inicio + 1) <= 7
     and coalesce(t.status, 'aberta') <> 'cancelada'
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
           when 'CIS' then 4 when 'FOP' then 5 when 'TCE' then 6
           when 'TV' then 7 when 'BHP' then 8 when 'OUTRO' then 9
           when 'WORKSHOP-EVENTO' then 10 when 'PALESTRA' then 11
           when 'HOLDING' then 99 end as ordem
    from (select dia, tipo from turma_dia union all select dia, tipo from evento_dia) u
),
escolhido as (select distinct on (dia) dia, tipo from peso order by dia, ordem),
receita as (
  select data_emissao::date as dia, sum(valor) as receita
    from fato_loja_cupom where not cancelado group by 1
),
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
   where date_trunc('month', d) <> '2026-02-01'
),
medido as (
  select tipo, count(*)::int as n,
         round(case when tipo in ('UTIL','SAB','DOM')
                    then percentile_cont(0.5) within group (order by receita)
                    else avg(receita) end) as valor
    from hist
   where tipo <> 'HOLDING'          -- dia da holding nao entra na medicao
   group by tipo
),
alvo_dias as (
  select d::date as dia,
         coalesce(e.tipo, case extract(dow from d) when 0 then 'DOM'
                                                   when 6 then 'SAB' else 'UTIL' end) as tipo
    from alvo a, generate_series(a.ini, a.fim, '1 day') d
    left join escolhido e on e.dia = d::date
),
contagem as (
  select tipo, count(*)::int as dias from alvo_dias
   where tipo <> 'HOLDING'          -- nem na previsao
   group by tipo
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
total as (select sum(dias * valor_dia) as master from linhas),
velhas as (
  select t.turma_id, (current_date - t.atualizado_em::date) as dias_parada
    from dim_turmas t, alvo a
   where t.data_inicio <= a.fim and coalesce(t.data_fim, t.data_inicio) >= a.ini
     and (coalesce(t.data_fim, t.data_inicio) - t.data_inicio + 1) <= 7
     and coalesce(t.status, 'aberta') <> 'cancelada'
     and t.curso not ilike '%PAULO VIEIRA%'
     and t.atualizado_em is not null
     and (current_date - t.atualizado_em::date) > p_dias_velho
)
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
      union all
      select 'CALENDARIO VELHO: ' || string_agg(turma_id || ' (parada ha ' ||
             dias_parada || ' dias)', '; ') ||
             '. dim_turmas e mantida a mao -- confirme que ainda vao acontecer.'
        from velhas
       having count(*) > 0
    ) x)
);
$FN$;

notify pgrst, 'reload schema';

-- conferir:
--   select public.sugerir_meta_loja('2026-09-01');  -- 61.366, inalterado
--   select public.sugerir_meta_loja('2026-10-01');  -- ~34.199, com TV e BHP proprios
