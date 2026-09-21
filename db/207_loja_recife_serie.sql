-- ============================================================
-- FebraHub · Migration 207 — Receita mensal da loja de Recife
--
-- Série mensal de receita de Recife, a partir dos cupons próprios
-- (fato_loja_cupom_recife). Mesma "forma" da vw_loja_serie do Salvador
-- (mes, ano, receita, meta_minima, em_curso) pro front reusar o mesmo gráfico
-- (BarrasEvolucao) — mas SIMPLES: Recife só tem cupom do Omio, sem planilha de
-- fechamento nem histórico pré-2025. `meta_minima` fica NULL até a Fase 2
-- (meta pelo calendário de Recife). pode_ver('loja') mantém o controle de acesso.
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
       null::numeric                 as meta_minima,
       null::numeric                 as meta_basica,
       null::numeric                 as meta_master,
       (r.mes = date_trunc('month', current_date)::date) as em_curso
  from r
 where pode_ver('loja')
 order by r.mes;

notify pgrst, 'reload schema';
