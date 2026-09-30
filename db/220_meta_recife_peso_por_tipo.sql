-- ============================================================
-- FebraHub · Migration 220 — Meta Recife: cursos PONDERADOS por tipo + peso 1,2
--
-- Antes (db/218): o modulador contava todo evento igual (count) e peso 0,6.
-- O gestor apontou que (a) o peso amortecia demais e (b) um FCIS/Master enche
-- a loja MUITO mais que uma palestra — o count achatava essa diferença.
--
-- Agora cada tipo de evento tem um PESO relativo (quanto enche a loja), o
-- modulador usa a SOMA dos pesos do mês (não a contagem), e peso_cursos sobe
-- para 1,2 (cursos dominam a meta). Os pesos NÃO saem dos dados (2026 é ano
-- em queda, amostra minúscula e ruidosa — o FCIS aparecia baixo, o que é
-- falso); vêm do conhecimento do negócio e ficam EDITÁVEIS na tabela
-- evento_recife_peso.
--
-- Também entra o MASTER COACHING como tipo (peso 5). Em 2026 o calendário de
-- Recife tem 1 imersão de Master (Dulce, 29/09→03/10); lançada em outubro
-- (3 dos 5 dias caem em out; set já foi realizado).
-- ============================================================

create table if not exists public.evento_recife_peso (
  tipo text primary key,
  peso numeric not null default 1
);
alter table public.evento_recife_peso enable row level security;
create policy "leitura autenticada" on public.evento_recife_peso for select to authenticated using (true);

insert into public.evento_recife_peso (tipo, peso) values
  ('FCIS',5),('MASTER',5),('IF',4),('FGPC',3),('FOP',3),('BHP',3),
  ('CURSO',2),('TV',2),('CIS',2),('WORKSHOP',1.5),('PALESTRA',1)
on conflict (tipo) do update set peso = excluded.peso;

-- Master Coaching de Recife (imersão 29/09-03/10/2026), lançado em outubro
insert into public.evento_recife (dia, tipo, obs) values
  ('2026-10-01','MASTER','Master Coaching - Dulce (imersao 29/09-03/10)')
on conflict (dia) do update set tipo = excluded.tipo, obs = excluded.obs;

-- função: score ponderado por tipo + peso_cursos default 1,2
create or replace function public.sugerir_meta_loja_recife(
  p_mes date, p_crescimento numeric default 0.05, p_peso_cursos numeric default 1.2)
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
    'fator_cursos',     round((select m from fator_cursos), 3)
  )
);
$function$;

grant execute on function public.sugerir_meta_loja_recife(date, numeric, numeric) to authenticated, service_role;

-- re-aplica set-dez/2026 com o cálculo novo
insert into public.meta_setor (setor, indicador, mes_ref, minima, basica, master, sentido, unidade, memoria)
select 'loja_recife','faturamento', (s->>'mes')::date,
       (s->>'minima')::numeric, (s->>'basica')::numeric, (s->>'master')::numeric,
       'maior_melhor','reais',
       (s->'memoria') || jsonb_build_object('calculado_em', current_date, 'peso_cursos', 1.2)
from (select public.sugerir_meta_loja_recife(make_date(2026, m, 1)) as s
      from generate_series(9, 12) m) x
on conflict (setor, indicador, mes_ref) do update
  set minima=excluded.minima, basica=excluded.basica, master=excluded.master,
      memoria=excluded.memoria, atualizado_em=now();

notify pgrst, 'reload schema';
