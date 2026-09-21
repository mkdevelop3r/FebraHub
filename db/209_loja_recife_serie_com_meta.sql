-- ============================================================
-- FebraHub · Migration 209 — vw_loja_recife_serie ganha a meta
--
-- Agora que meta_loja_recife (db/208) tem os valores sazonais, a série de
-- Recife junta a meta mínima do mês — a linha/traço-alvo aparece no gráfico
-- (o front já lê meta_minima). Mantém a forma da vw_loja_serie do Salvador.
-- ============================================================
create or replace view public.vw_loja_recife_serie as
with r as (
  select date_trunc('month', data_emissao)::date as mes,
         sum(valor) as receita
    from public.fato_loja_cupom_recife
   where not cancelado and data_emissao is not null
   group by 1
)
select r.mes,
       extract(year from r.mes)::int as ano,
       round(r.receita)              as receita,
       m.minima                      as meta_minima,
       m.basica                      as meta_basica,
       m.master                      as meta_master,
       (r.mes = date_trunc('month', current_date)::date) as em_curso
  from r
  left join public.meta_loja_recife m on m.mes_ref = r.mes
 where pode_ver('loja')
 order by r.mes;

notify pgrst, 'reload schema';
