-- ============================================================
-- FebraHub · Migration 186 — Mes com calendario por lancar passa a avisar
--
-- Rodei a funcao para NOVEMBRO e ela devolveu R$ 10.994 -- um terco de
-- outubro, com memoria de calculo bonita e nenhum sinal de problema.
--
-- Nao era erro de conta. Novembro tem CINCO dias com curso ou evento; todos os
-- outros meses de 2026 tem entre 8 e 19. O calendario nao esta vazio, esta por
-- lancar. Mas a funcao nao sabe a diferenca entre "mes fraco" e "mes que
-- ninguem preencheu ainda" -- e as duas coisas produzem o mesmo numero baixo.
--
-- Isso e o mesmo tipo de falha da IF37 cancelada (db/182), so que ao contrario:
-- la um dado velho INFLAVA a meta; aqui um dado ausente a ESVAZIA. Nos dois
-- casos a conta fecha, a memoria de calculo aparece completa, e o numero esta
-- errado por um motivo que nao esta em lugar nenhum da tela.
--
-- A REGRA
--
-- Conta os dias com curso ou evento do mes alvo e compara com a MEDIANA dos
-- meses ja fechados. Abaixo de 60% dela, avisa.
--
-- Mediana, e nao media, porque marco (18 dias) e julho (19) puxariam a media
-- para cima e fariam ate um mes normal parecer ralo.
--
-- So MESES FECHADOS entram na mediana. Calculando outubro no dia 4 de
-- setembro, setembro tem 3 dias de historico -- nao porque foi fraco, mas
-- porque ainda nao aconteceu. Contar o mes corrente rebaixaria a mediana e
-- desarmaria justamente o aviso que esta migration existe para dar. E a mesma
-- licao do `least(a.ini - 1, max(data_emissao))` da db/181: dia sem dado nao e
-- dia sem venda, e mes incompleto nao e mes fraco.
--
-- O aviso NAO impede salvar. Novembro pode ser fraco de verdade. O que ele
-- impede e escrever a meta sem saber que a pergunta existe.
--
-- Vai junto a correcao da string do aviso do Sympla, que estava quebrada em
-- tres linhas no arquivo e chegava picotada na tela. Como esta migration
-- reescreve a funcao inteira, NAO precisa rodar a 185 de novo.
-- ============================================================

create or replace function public.sugerir_meta_loja(
  p_mes       date,
  -- Agora sao SOBRESCRITAS, nao valores padrao: nulo significa "meca". Quem
  -- quiser testar um cenario passa o numero e a linha volta a sair marcada
  -- como arbitrada na tela.
  p_palestra  numeric default null,
  p_workshop  numeric default null,
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
-- PASSADO: Sympla. Tem local, e vai a 2025.
evento_sympla as (
  select data_inicio::date as dia,
         case when nome_evento ilike '%WORKSHOP%' then 'WORKSHOP-EVENTO'
              else 'PALESTRA' end as tipo
    from dim_eventos
   where local_evento = 'Febracis'
),
-- FUTURO: calendario da Central, menos o que o Sympla ja explica melhor.
evento_hub as (
  select e.data_evento as dia,
         case when te.nome = 'Workshop' then 'WORKSHOP-EVENTO' else 'PALESTRA' end as tipo
    from mkt_eventos e
    join mkt_tipos_evento te on te.id = e.tipo_evento_id
   where e.cancelado_em is null and e.status = 'ativo'
     and te.nome in ('Palestra','Workshop')
     and not exists (select 1 from dim_eventos d
                      where d.id_referencia = e.sympla_evento_id)
),
peso as (
  select dia, tipo, case tipo
           when 'IF' then 1 when 'WORKSHOP-CURSO' then 2 when 'FCIS' then 3
           when 'CIS' then 4 when 'FOP' then 5 when 'TCE' then 6
           when 'TV' then 7 when 'BHP' then 8 when 'OUTRO' then 9
           when 'WORKSHOP-EVENTO' then 10 when 'PALESTRA' then 11
           when 'HOLDING' then 99 end as ordem
    from (select dia, tipo from turma_dia
          union all select dia, tipo from evento_sympla
          union all select dia, tipo from evento_hub) u
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
   where tipo <> 'HOLDING'
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
   where tipo <> 'HOLDING'
   group by tipo
),
linhas as (
  select c.tipo, c.dias,
         case when c.tipo = 'PALESTRA'        and p_palestra is not null then p_palestra
              when c.tipo = 'WORKSHOP-EVENTO' and p_workshop is not null then p_workshop
              else coalesce(m.valor, 0) end as valor_dia,
         coalesce(m.n, 0) as n,
         ((c.tipo = 'PALESTRA'        and p_palestra is not null) or
          (c.tipo = 'WORKSHOP-EVENTO' and p_workshop is not null)) as estimado,
         (coalesce(m.n, 0) = 0
          and not (c.tipo = 'PALESTRA'        and p_palestra is not null)
          and not (c.tipo = 'WORKSHOP-EVENTO' and p_workshop is not null)) as sem_historico
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
),
-- Quantos dias do mes alvo tem curso ou evento, contra a mediana dos meses JA
-- FECHADOS. Ver cabecalho: mes incompleto nao e mes fraco.
densidade as (
  select (select count(*) from alvo_dias where tipo not in ('UTIL','SAB','DOM')) as dias_alvo,
         -- ::numeric para o aviso sair "13" e nao "13.0": percentile_cont
         -- devolve double precision.
         (select round(percentile_cont(0.5) within group (order by c))::numeric
            from (select count(*) filter (where tipo not in ('UTIL','SAB','DOM')) as c
                    from hist
                   where date_trunc('month', dia)
                       < date_trunc('month', (select dia from ultimo_dia))
                   group by date_trunc('month', dia)) m) as mediana
),
-- Eventos do mes alvo cujo TIPO contradiz o proprio NOME. Nao corrijo (ver
-- cabecalho); aponto para quem pode corrigir na origem.
tipo_suspeito as (
  select e.data_evento, e.nome, te.nome as tipo
    from mkt_eventos e
    join mkt_tipos_evento te on te.id = e.tipo_evento_id, alvo a
   where e.data_evento between a.ini and a.fim
     and e.cancelado_em is null and e.status = 'ativo'
     and te.nome in ('Palestra','Workshop')
     and ((te.nome = 'Workshop' and e.nome ilike '%palestra%'
                               and e.nome not ilike '%workshop%')
       or (te.nome = 'Palestra' and e.nome ilike '%workshop%'
                               and e.nome not ilike '%palestra%'))
),
-- Eventos do mes sem vinculo com o Sympla: local desconhecido, entram como se
-- fossem na loja. E o buraco que deixou o evento de Feira de Santana passar.
sem_local as (
  select count(*)::int as qtd
    from mkt_eventos e
    join mkt_tipos_evento te on te.id = e.tipo_evento_id, alvo a
   where e.data_evento between a.ini and a.fim
     and e.cancelado_em is null and e.status = 'ativo'
     and te.nome in ('Palestra','Workshop')
     and (e.sympla_evento_id is null
          or not exists (select 1 from dim_eventos d where d.id_referencia = e.sympla_evento_id))
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
      select 'Valor SOBRESCRITO a mao em ' || sum(dias) || ' dia(s): ' ||
             string_agg(distinct tipo, ', ') || '. A medicao foi ignorada.'
        from linhas where estimado
       having sum(dias) > 0
      union all
      select 'TIPO SUSPEITO: ' || string_agg(to_char(data_evento,'DD/MM') || ' "' ||
             nome || '" esta como ' || tipo, '; ') ||
             '. Confira na Central -- palestra e workshop valem valores bem diferentes.'
        from tipo_suspeito
       having count(*) > 0
      union all
      select qtd || ' evento(s) do mes sem vinculo com o Sympla: nao da para conferir se acontecem NA LOJA, e entram como se acontecessem. Foi assim que um workshop em Feira de Santana entrou na meta de outubro.'
        from sem_local where qtd > 0
      union all
      select 'CALENDARIO PARECE INCOMPLETO: o mes tem ' || dias_alvo ||
             ' dia(s) com curso ou evento, contra ' || mediana ||
             ' de mediana nos meses fechados. Ou o mes e fraco mesmo, ou falta lancar -- a meta sai baixa nos dois casos, e so num deles esta certa.'
        from densidade
       where mediana > 0 and dias_alvo < mediana * 0.6
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
--   select public.sugerir_meta_loja('2026-10-01') -> 'master';   -- 32020, sem aviso novo
--   select public.sugerir_meta_loja('2026-11-01') -> 'avisos';   -- deve acusar 5 vs 13
