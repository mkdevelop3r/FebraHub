-- ============================================================
-- FebraHub · Migration 180 — Conserta o full join da 179
--
-- ERRO MEU, e ele anulava exatamente o que a 179 existia para fazer.
--
-- Na parte 3 da 179 eu escrevi:
--
--     select f.mes_ref, coalesce(m.minima, f.meta_minima), ...
--       from fato_loja_fechamento f
--       full join (... meta_setor ...) m on m.mes_ref = f.mes_ref
--
-- `full join` com `select f.mes_ref`. Para um mes que existe SO em
-- `meta_setor` -- 09/2026 e todo mes que o Bruno definir daqui para frente,
-- porque a planilha nao tem futuro -- o `f.mes_ref` e NULO. A linha nunca
-- casa com a serie, e a meta simplesmente nao aparece.
--
-- O sintoma seria o pior tipo: nada quebra, nenhum erro, e o Hub da Loja
-- mostra "Sem meta" para um mes que TEM meta gravada. Quem olhasse ia
-- concluir que a tela nova nao funciona.
--
-- Conferido no banco antes e depois:
--   com `f.mes_ref`              -> 09/2026 ausente
--   com `coalesce(f.mes_ref, m.mes_ref)` -> 44164 / 49071 / 61339
--
-- Em full join, a chave e sempre o coalesce dos dois lados. Nao ha caso em
-- que um lado sozinho sirva -- se servisse, o join nao precisaria ser full.
-- ============================================================

create or replace view public.vw_loja_serie as
with historico as (
  select mes_ref as mes, extract(year from mes_ref)::int as ano,
         faturamento as receita, 'Planilha de fechamento'::text as fonte
    from public.fato_loja_fechamento
   where mes_ref < '2025-01-01' and faturamento is not null
), atual as (
  select mes, extract(year from mes)::int as ano,
         sum(valor)::numeric as receita, 'Omie + fontes'::text as fonte
    from public.vw_loja_receita_consolidada group by 1
), serie as (
  select * from historico union all select * from atual
), meta as (
  -- A meta definida na tela vence a da planilha (169: quem digitou olhou o
  -- caso). O coalesce e por NIVEL: quem preencher so a basica no meta_setor
  -- mantem minima e master da planilha em vez de perde-las.
  --
  -- E a CHAVE tambem e coalesce -- foi o defeito da 179.
  select coalesce(f.mes_ref, m.mes_ref) as mes_ref,
         coalesce(m.minima, f.meta_minima) as meta_minima,
         coalesce(m.basica, f.meta_basica) as meta_basica,
         coalesce(m.master, f.meta_master) as meta_master
    from public.fato_loja_fechamento f
    full join (select mes_ref, minima, basica, master
                 from public.meta_setor
                where setor = 'loja' and indicador = 'faturamento') m
      on m.mes_ref = f.mes_ref
)
select s.mes, s.ano, round(s.receita) as receita, s.fonte,
       f.meta_minima, f.meta_basica, f.meta_master,
       case when coalesce(f.meta_minima,0) > 0
            then round(100.0 * s.receita / f.meta_minima, 1) end as pct_minima,
       case
         when coalesce(f.meta_minima,0)=0 and coalesce(f.meta_basica,0)=0
          and coalesce(f.meta_master,0)=0                              then 'Sem meta'
         when coalesce(f.meta_master,0) > 0 and s.receita >= f.meta_master then 'Máster'
         when coalesce(f.meta_basica,0) > 0 and s.receita >= f.meta_basica then 'Básica'
         when coalesce(f.meta_minima,0) > 0 and s.receita >= f.meta_minima then 'Mínima'
         else 'Abaixo'
       end as nivel_atingido,
       round(case
         when coalesce(f.meta_master,0) > 0 and s.receita >= f.meta_master then null
         when coalesce(f.meta_basica,0) > 0 and s.receita >= f.meta_basica then f.meta_master - s.receita
         when coalesce(f.meta_minima,0) > 0 and s.receita >= f.meta_minima then f.meta_basica - s.receita
         else f.meta_minima - s.receita
       end) as falta_proximo,
       (s.mes = date_trunc('month', current_date)::date) as em_curso
  from serie s
  left join meta f on f.mes_ref = s.mes
 where public.pode_ver('loja')
 order by s.mes;

notify pgrst, 'reload schema';

-- conferir (com sessao que enxergue a loja):
--   select mes, meta_minima, meta_basica, meta_master from public.vw_loja_serie
--    where mes >= '2026-08-01' order by mes;
--   -- 09/2026 deve trazer 44164 / 49071 / 61339
