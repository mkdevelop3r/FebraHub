-- ============================================================
-- FebraHub · Migration 218 — Peso dos cursos na meta de Recife = 0,6
--
-- Sobe o peso do modulador de cursos de 0,4 para 0,6 (default), pra os cursos
-- do mês pesarem mais na meta. Re-aplica set–dez/2026 com o novo peso.
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
  select date_trunc('month', dia)::date as mes, count(*)::numeric as peso
    from evento_recife group by 1
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
    'metodo',           'run-rate sazonal + crescimento + cursos do mês',
    'ref_ano_anterior', round((select ref_ant from calc)),
    'fator_tendencia',  round((select f from calc), 4),
    'base_runrate',     (select base_runrate from calc),
    'crescimento',      p_crescimento,
    'cursos_no_mes',    (select v from peso_alvo),
    'cursos_media_mes', (select v from peso_base),
    'fator_cursos',     round((select m from fator_cursos), 3)
  )
);
$function$;

grant execute on function public.sugerir_meta_loja_recife(date, numeric, numeric) to authenticated, service_role;

-- re-aplica set–dez/2026 com o peso novo
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
