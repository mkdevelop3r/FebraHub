-- ============================================================
-- FebraHub · Migration 217 — Meta Recife modulada pelos CURSOS DO MÊS
--
-- Snapshot do calendário FEBRACIS RECIFE (Google Calendar), só os eventos que
-- enchem a loja (palestra/workshop/curso/IF/FCIS/CIS-local/BHP/FOP/TV) — fora
-- lives/webinars/mentorias/café e CIS de OUTRA cidade (SP/RJ/BH/Curitiba/Goiânia).
--
-- A meta NÃO usa o método puro do calendário (a venda de Recife é picada e daria
-- ~10x menos). Os cursos entram como MODULADOR do run-rate sazonal:
--   fator_cursos = 1 + peso_cursos × (cursos_no_mês / média_mensal − 1)
--   master = mesmo_mês_ano_anterior × fator_tendência × (1+crescimento) × fator_cursos
-- peso_cursos (default 0,4) amortece: mês com mais cursos sobe a meta, sem exagero.
--
-- Snapshot manual (via calendário lido nesta sessão). Atualização automática
-- depende de conta de serviço Google — por ora, relançar/editar esta tabela.
-- ============================================================

create table if not exists public.evento_recife (
  dia   date primary key,
  tipo  text not null,
  obs   text
);
alter table public.evento_recife enable row level security;
create policy "leitura autenticada" on public.evento_recife for select to authenticated using (true);

insert into public.evento_recife (dia, tipo) values
  ('2026-01-10','WORKSHOP'),('2026-01-13','FCIS'),('2026-01-21','FGPC'),('2026-01-24','CIS'),('2026-01-29','PALESTRA'),
  ('2026-02-10','PALESTRA'),
  ('2026-03-03','PALESTRA'),('2026-03-10','PALESTRA'),('2026-03-12','IF'),
  ('2026-04-07','PALESTRA'),('2026-04-08','FGPC'),('2026-04-14','PALESTRA'),('2026-04-23','BHP'),
  ('2026-05-05','PALESTRA'),('2026-05-06','FCIS'),('2026-05-12','PALESTRA'),('2026-05-22','TV'),('2026-05-28','CURSO'),
  ('2026-06-02','PALESTRA'),('2026-06-09','IF'),('2026-06-17','FCIS'),
  ('2026-07-01','PALESTRA'),('2026-07-09','BHP'),('2026-07-16','FGPC'),('2026-07-21','PALESTRA'),('2026-07-28','PALESTRA'),
  ('2026-08-04','PALESTRA'),('2026-08-11','PALESTRA'),('2026-08-15','WORKSHOP'),('2026-08-18','PALESTRA'),('2026-08-20','PALESTRA'),
  ('2026-09-08','CURSO'),('2026-09-15','PALESTRA'),('2026-09-16','BHP'),('2026-09-22','WORKSHOP'),
  ('2026-10-09','WORKSHOP'),('2026-10-22','FGPC'),('2026-10-28','FCIS'),
  ('2026-11-07','TV'),('2026-11-12','FOP'),('2026-11-18','FCIS'),
  ('2026-12-03','IF'),('2026-12-09','BHP')
on conflict (dia) do update set tipo = excluded.tipo;

drop function if exists public.sugerir_meta_loja_recife(date, numeric);

create or replace function public.sugerir_meta_loja_recife(
  p_mes date, p_crescimento numeric default 0.05, p_peso_cursos numeric default 0.4)
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

notify pgrst, 'reload schema';
