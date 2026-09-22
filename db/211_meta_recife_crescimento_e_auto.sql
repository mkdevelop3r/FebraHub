-- ============================================================
-- FebraHub · Migration 211 — Meta Recife: crescimento + memória + auto mensal
--
-- Recife não tem calendário, então a "memória de cálculo" é o run-rate sazonal:
--   máster = (faturamento do MESMO mês do ano anterior × fator de tendência)
--            × (1 + crescimento)
--   básica = máster × 0,8 ; mínima = máster × 0,72
--
-- fator de tendência = soma dos últimos 6 meses fechados / mesmos 6 do ano
-- anterior (Recife roda ~0,69 hoje = abaixo de 2025). Ancorar no run-rate (e não
-- no ano anterior cru) mantém a meta realista; o `crescimento` (default 5% ~=
-- reposição da inflação + leve esticada) é o empurrão. É SUGESTÃO — o gestor
-- valida e salva.
--
-- aplicar_meta_loja_recife: preenche o mês em meta_setor SÓ se ainda não existir
-- (não sobrescreve edição manual) — serve pro recálculo automático mensal.
-- ============================================================

drop function if exists public.sugerir_meta_loja_recife(date);

create or replace function public.sugerir_meta_loja_recife(p_mes date, p_crescimento numeric default 0.05)
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
  select receita as ref_ant
    from rec
   where mes = (date_trunc('month', p_mes) - interval '1 year')::date
),
calc as (
  select coalesce((select ref_ant from base), 0)                                as ref_ant,
         (select f from fator)                                                  as f,
         round(coalesce((select ref_ant from base), 0) * (select f from fator)) as base_runrate,
         round(coalesce((select ref_ant from base), 0) * (select f from fator) * (1 + p_crescimento)) as master
)
select jsonb_build_object(
  'mes',    date_trunc('month', p_mes)::date,
  'master', (select master from calc),
  'basica', round((select master from calc) * 0.8),
  'minima', round((select master from calc) * 0.72),
  'memoria', jsonb_build_object(
    'metodo',           'run-rate sazonal + crescimento',
    'ref_ano_anterior', round((select ref_ant from calc)),
    'fator_tendencia',  round((select f from calc), 4),
    'base_runrate',     (select base_runrate from calc),
    'crescimento',      p_crescimento
  )
);
$function$;

grant execute on function public.sugerir_meta_loja_recife(date, numeric) to authenticated, service_role;

create or replace function public.aplicar_meta_loja_recife(
  p_mes date default (date_trunc('month', current_date) + interval '1 month')::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes   date := date_trunc('month', p_mes)::date;
  v_existe boolean;
  s        jsonb;
begin
  select exists(select 1 from meta_setor
                 where setor = 'loja_recife' and indicador = 'faturamento' and mes_ref = v_mes)
    into v_existe;
  if v_existe then
    return jsonb_build_object('mes', v_mes, 'aplicado', false,
                             'motivo', 'ja existe (nao sobrescreve edicao manual)');
  end if;

  s := sugerir_meta_loja_recife(v_mes);
  insert into meta_setor (setor, indicador, mes_ref, minima, basica, master, sentido, unidade, memoria)
  values ('loja_recife', 'faturamento', v_mes,
          (s->>'minima')::numeric, (s->>'basica')::numeric, (s->>'master')::numeric,
          'maior_melhor', 'reais',
          (s->'memoria') || jsonb_build_object('calculado_em', current_date, 'automatico', true));

  return jsonb_build_object('mes', v_mes, 'aplicado', true, 'valores', s);
end $function$;

grant execute on function public.aplicar_meta_loja_recife(date) to authenticated, service_role;

notify pgrst, 'reload schema';
