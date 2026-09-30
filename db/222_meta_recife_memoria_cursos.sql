-- ============================================================
-- FebraHub · Migration 222 — Memória do cálculo de Recife: quebra por tipo
--
-- A memória de Salvador (MemoriaCalculo) lista cada tipo de curso e o quanto
-- contribui. A de Recife só mostrava o score agregado; o gestor pediu para o
-- MÉTODO aparecer na memória do cálculo. Agora a memoria carrega um array
-- `cursos` com os eventos do mês: tipo, quantidade, peso e subtotal (qtd×peso).
-- Só adiciona esse campo — o cálculo do master é idêntico ao db/221.
-- ============================================================

create or replace function public.sugerir_meta_loja_recife(
  p_mes date, p_crescimento numeric default 0.05, p_peso_cursos numeric default 0.6)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
with rec as (
  select date_trunc('month', data_emissao)::date as mes, sum(valor) as receita
    from fato_loja_cupom_recife
   where not cancelado and data_emissao is not null
   group by 1
),
ult6 as (
  select mes, receita from rec
   where mes < date_trunc('month', current_date)::date
   order by mes desc limit 6
),
fator as (
  select case when sum(a.receita) > 0 then sum(u.receita)::numeric / sum(a.receita) else 1 end as f
    from ult6 u
    join rec a on a.mes = (u.mes - interval '1 year')::date
),
base as (
  select receita as ref_ant from rec
   where mes = (date_trunc('month', p_mes) - interval '1 year')::date
),
cur as (
  select date_trunc('month', e.dia)::date as mes, sum(coalesce(w.peso, 1))::numeric as peso
    from evento_recife e
    left join evento_recife_peso w on w.tipo = e.tipo
   group by 1
),
peso_alvo as (
  select coalesce((select peso from cur where mes = date_trunc('month', p_mes)::date), 0) as v
),
peso_base as (
  select coalesce(round(avg(peso), 2), 0) as v
    from cur where mes < date_trunc('month', current_date)::date
),
fator_cursos as (
  select case when (select v from peso_base) > 0
              then 1 + p_peso_cursos * ((select v from peso_alvo) / (select v from peso_base) - 1)
              else 1 end as m
),
cursos_alvo as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', x.tipo, 'qtd', x.qtd, 'peso', x.peso, 'subtotal', x.qtd * x.peso
         ) order by x.qtd * x.peso desc, x.tipo), '[]'::jsonb) as arr
    from (
      select e.tipo, count(*)::int as qtd, coalesce(w.peso, 1) as peso
        from evento_recife e
        left join evento_recife_peso w on w.tipo = e.tipo
       where date_trunc('month', e.dia)::date = date_trunc('month', p_mes)::date
       group by e.tipo, coalesce(w.peso, 1)
    ) x
),
calc as (
  select coalesce((select ref_ant from base), 0)                                as ref_ant,
         (select f from fator)                                                  as f,
         round(coalesce((select ref_ant from base), 0) * (select f from fator)) as base_runrate,
         round(coalesce((select ref_ant from base), 0) * (select f from fator)
               * (1 + p_crescimento) * (select m from fator_cursos))            as master
)
select jsonb_build_object(
  'mes',    date_trunc('month', p_mes)::date,
  'master', (select master from calc),
  'basica', round((select master from calc) * 0.8),
  'minima', round((select master from calc) * 0.72),
  'memoria', jsonb_build_object(
    'metodo',           'run-rate sazonal + crescimento + cursos ponderados por tipo',
    'ref_ano_anterior', round((select ref_ant from calc)),
    'fator_tendencia',  round((select f from calc), 4),
    'base_runrate',     (select base_runrate from calc),
    'crescimento',      p_crescimento,
    'peso_cursos',      p_peso_cursos,
    'score_no_mes',     (select v from peso_alvo),
    'score_media_mes',  (select v from peso_base),
    'fator_cursos',     round((select m from fator_cursos), 3),
    'cursos',           (select arr from cursos_alvo)
  )
);
$function$;

grant execute on function public.sugerir_meta_loja_recife(date, numeric, numeric) to authenticated, service_role;

-- re-aplica set-dez/2026 para gravar a quebra por tipo na memória
insert into public.meta_setor (setor, indicador, mes_ref, minima, basica, master, sentido, unidade, memoria)
select 'loja_recife','faturamento', (s->>'mes')::date,
       (s->>'minima')::numeric, (s->>'basica')::numeric, (s->>'master')::numeric,
       'maior_melhor','reais',
       (s->'memoria') || jsonb_build_object('calculado_em', current_date, 'peso_cursos', 0.6)
from (select public.sugerir_meta_loja_recife(make_date(2026, m, 1)) as s
      from generate_series(9, 12) m) x
on conflict (setor, indicador, mes_ref) do update
  set minima=excluded.minima, basica=excluded.basica, master=excluded.master,
      memoria=excluded.memoria, atualizado_em=now();

notify pgrst, 'reload schema';
