-- ============================================================
-- FebraHub · Migration 208 — Meta da loja de Recife (histórico, sazonal)
--
-- Recife NÃO usa o método do calendário (a receita de lá é picada: metade dos
-- dias vende zero, a mediana do dia é ~R$15 mas a média ~R$734 — o método do
-- Salvador, que usa a mediana do dia comum, dá meta ~10x menor que o real).
--
-- Aqui a meta vem do HISTÓRICO da própria Recife, SAZONAL: pega a receita do
-- MESMO mês do ano anterior (a forma da sazonalidade) e calibra pro nível atual
-- por um fator de tendência = soma dos últimos 6 meses fechados / soma dos mesmos
-- 6 meses do ano anterior. Máster = esse valor (run-rate, não é teto aspiracional
-- — decisão do usuário: "na média"); básica = −20%; mínima = −10% da básica.
--
-- É SUGESTÃO: os valores são gravados em meta_loja_recife e podem ser editados.
-- ============================================================

create table if not exists public.meta_loja_recife (
  mes_ref       date primary key,
  minima        numeric,
  basica        numeric,
  master        numeric,
  memoria       jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.meta_loja_recife enable row level security;
create policy "leitura autenticada" on public.meta_loja_recife for select to authenticated using (true);

create or replace function public.sugerir_meta_loja_recife(p_mes date)
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
ult6 as (   -- últimos 6 meses fechados (exclui o mês corrente)
  select mes, receita from rec
   where mes < date_trunc('month', current_date)::date
   order by mes desc limit 6
),
fator as (  -- tendência: 6m fechados vs os mesmos 6m do ano anterior
  select case when sum(a.receita) > 0
              then sum(u.receita)::numeric / sum(a.receita)
              else 1 end as f
    from ult6 u
    join rec a on a.mes = (u.mes - interval '1 year')::date
),
base as (   -- mesmo mês do ano anterior (a sazonalidade)
  select receita as ref_ant
    from rec
   where mes = (date_trunc('month', p_mes) - interval '1 year')::date
),
calc as (
  select round(coalesce((select ref_ant from base), 0) * (select f from fator)) as master
)
select jsonb_build_object(
  'mes',    date_trunc('month', p_mes)::date,
  'master', (select master from calc),
  'basica', round((select master from calc) * 0.8),
  'minima', round((select master from calc) * 0.72),
  'memoria', jsonb_build_object(
    'metodo',           'run-rate sazonal: mesmo mês do ano anterior x fator de tendência',
    'ref_ano_anterior', (select ref_ant from base),
    'fator',            round((select f from fator), 4)
  )
);
$function$;

-- Backfill 2026 (jan–dez) com a sugestão sazonal.
insert into public.meta_loja_recife (mes_ref, minima, basica, master, memoria)
select (s->>'mes')::date,
       (s->>'minima')::numeric,
       (s->>'basica')::numeric,
       (s->>'master')::numeric,
       s->'memoria'
  from (select public.sugerir_meta_loja_recife(make_date(2026, m, 1)) as s
          from generate_series(1, 12) m) x
on conflict (mes_ref) do update
  set minima = excluded.minima, basica = excluded.basica, master = excluded.master,
      memoria = excluded.memoria, atualizado_em = now();

notify pgrst, 'reload schema';
