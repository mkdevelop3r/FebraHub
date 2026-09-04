-- ============================================================
-- FebraHub · Migration 182 — Turma cancelada sai da conta, e calendario
--                            velho passa a avisar
--
-- A IF37 (09 a 11/10) estava em dim_turmas como "aberta", parada desde
-- 29/07. Foi CANCELADA, e ninguem tinha como saber pelo banco.
--
-- O estrago era grande: 3 dias de IF a R$ 12.883 sao R$ 38.649 de um master
-- de R$ 70.999 -- mais da metade da meta de outubro apoiada numa turma que
-- nao vai acontecer. E a conta sairia bonita, com memoria de calculo e tudo.
--
-- DOIS BURACOS, NAO UM
--
-- 1. NAO HAVIA CONVENCAO DE CANCELAMENTO. As 234 turmas tem status
--    'aberta'; a coluna nunca foi usada para marcar outra coisa.
--
-- 2. `sugerir_meta_loja` IGNORAVA STATUS. Marcar a turma sem corrigir a
--    funcao nao resolveria nada -- ela continuaria contando.
--
-- POR QUE NAO APAGAR A LINHA
--
-- Turma cancelada e informacao, nao lixo: mes que vem alguem vai perguntar
-- por que outubro nao teve IF, e a resposta tem que estar no banco. Apagar
-- tambem perderia o vinculo com quem ja estava matriculado nela.
--
-- O QUE ESTA MIGRATION NAO RESOLVE
--
-- `dim_turmas` nao tem sincronizacao nenhuma: `sincronizado_em` e NULO nas
-- 234 linhas, e as 166 com `sf_turma_id` vieram de carga manual do relatorio
-- do Salesforce. Enquanto for manual, TODA turma futura e suspeita -- nao so
-- esta. Por isso o aviso de calendario velho abaixo: ele nao conserta o
-- processo, so impede que a meta seja escrita sem que alguem veja a idade do
-- calendario que a sustenta. (O Bruno vai automatizar; ate la, o aviso e a
-- unica defesa.)
--
-- OUTRO CONSUMIDOR AFETADO, REGISTRADO E NAO CORRIGIDO AQUI
--
-- `vw_pedagogico_prazo` monta `proxima_turma` com `data_inicio >
-- current_date` e TAMBEM nao filtra status. Uma turma cancelada continua
-- sendo oferecida como "proxima turma" a quem esta represado. Hoje nao ha
-- caso (os represados apontam para IF36, de setembro), mas havera. Fica para
-- migration propria, com o teste de quantos represados sao afetados.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A convencao
-- ------------------------------------------------------------
comment on column public.dim_turmas.status is
  'aberta | cancelada. Turma cancelada NAO e apagada -- e informacao: alguem
   vai perguntar por que o mes nao teve aquele curso. Quem consome dim_turmas
   para PREVER ou OFERECER algo precisa filtrar `cancelada`.';

update public.dim_turmas
   set status = 'cancelada',
       atualizado_em = now()
 where turma_id = '2026 - IF37';


-- ------------------------------------------------------------
-- 2. A funcao passa a respeitar o status e a avisar sobre calendario velho
--
-- So o CTE `turma_dia`, o `alvo_dias` e o bloco de avisos mudam; o resto e
-- identico a 181.
-- ------------------------------------------------------------
create or replace function public.sugerir_meta_loja(
  p_mes       date,
  p_palestra  numeric default 544,
  p_workshop  numeric default 2363,
  p_dias_velho integer default 30      -- a partir de quantos dias o calendario vira aviso
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
   where (coalesce(t.data_fim, t.data_inicio) - t.data_inicio + 1) <= 7
     -- coalesce, e nao `= 'aberta'`: status nulo numa carga futura nao pode
     -- sumir com a turma. So o cancelamento explicito exclui.
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
           when 'CIS' then 4 when 'FOP' then 5 when 'TCE' then 6 when 'OUTRO' then 7
           when 'WORKSHOP-EVENTO' then 8 when 'PALESTRA' then 9 end as ordem
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
    from hist group by tipo
),
alvo_dias as (
  select d::date as dia,
         coalesce(e.tipo, case extract(dow from d) when 0 then 'DOM'
                                                   when 6 then 'SAB' else 'UTIL' end) as tipo
    from alvo a, generate_series(a.ini, a.fim, '1 day') d
    left join escolhido e on e.dia = d::date
),
contagem as (select tipo, count(*)::int as dias from alvo_dias group by tipo),
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
-- As turmas do mes alvo e ha quanto tempo cada uma nao e tocada. `dim_turmas`
-- e mantida a mao; turma parada ha semanas sustentando metade de uma meta
-- merece um olhar antes de salvar.
velhas as (
  select t.turma_id, (current_date - t.atualizado_em::date) as dias_parada
    from dim_turmas t, alvo a
   where t.data_inicio <= a.fim and coalesce(t.data_fim, t.data_inicio) >= a.ini
     and (coalesce(t.data_fim, t.data_inicio) - t.data_inicio + 1) <= 7
     and coalesce(t.status, 'aberta') <> 'cancelada'
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

-- A assinatura mudou (ganhou p_dias_velho), entao a de tres argumentos sai --
-- senao `sugerir_meta_loja(p_mes)` casaria com as duas: 42725, a licao da
-- 130/131.
drop function if exists public.sugerir_meta_loja(date, numeric, numeric);

revoke execute on function public.sugerir_meta_loja(date, numeric, numeric, integer) from anon;
grant execute on function public.sugerir_meta_loja(date, numeric, numeric, integer) to authenticated;

notify pgrst, 'reload schema';

-- conferir:
--   select public.sugerir_meta_loja('2026-09-01');  -- master 61.366, inalterado
--   select public.sugerir_meta_loja('2026-10-01');  -- sem IF: ~32 mil, com aviso
