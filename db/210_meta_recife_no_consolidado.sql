-- ============================================================
-- FebraHub · Migration 210 — Meta de Recife entra no Hub de Metas
--
-- A meta de Recife estava em meta_loja_recife (tabela à parte), então NÃO
-- aparecia no Hub de Metas, que lê o consolidado vw_meta_realizado_setor
-- (dirigido por meta_setor). Aqui unificamos numa fonte só:
--   - a meta de Recife vira setor 'loja_recife' em meta_setor;
--   - o consolidado ganha o realizado de 'loja_recife' (cupons de Recife);
--   - vw_loja_recife_serie passa a ler a meta de meta_setor (não mais da
--     tabela própria), que é então descartada.
-- Assim o Hub de Metas e o bloco da Loja mostram o MESMO número, e editar a
-- meta de Recife no Hub de Metas (upsert em meta_setor) reflete nos dois.
-- ============================================================

-- 1) Migra os valores de meta_loja_recife -> meta_setor (setor loja_recife)
insert into public.meta_setor (setor, indicador, mes_ref, minima, basica, master, sentido, unidade, memoria)
select 'loja_recife', 'faturamento', mes_ref, minima, basica, master,
       'maior_melhor', 'reais', memoria
  from public.meta_loja_recife
on conflict (setor, indicador, mes_ref) do update
  set minima = excluded.minima, basica = excluded.basica, master = excluded.master,
      memoria = excluded.memoria;

-- 2) Consolidado ganha o realizado de Recife (cupons próprios)
create or replace view public.vw_meta_realizado_setor as
 WITH realizado AS (
         SELECT 'comercial'::text AS setor, 'faturamento'::text AS indicador,
            date_trunc('month'::text, v.data_ref::timestamp with time zone)::date AS mes_ref,
            sum(v.valor_bruto) AS valor
           FROM ( SELECT vw_venda_faturamento.original_id_venda,
                    max(vw_venda_faturamento.valor_bruto) AS valor_bruto,
                    min(COALESCE(vw_venda_faturamento.data_aprovacao, vw_venda_faturamento.data_pagamento)) AS data_ref
                   FROM vw_venda_faturamento
                  GROUP BY vw_venda_faturamento.original_id_venda) v
          GROUP BY 1, 2, (date_trunc('month'::text, v.data_ref::timestamp with time zone)::date)
        UNION ALL
         SELECT 'loja'::text, 'faturamento'::text, vw_loja_receita_mensal.mes, vw_loja_receita_mensal.receita
           FROM vw_loja_receita_mensal
        UNION ALL
         SELECT 'loja_recife'::text, 'faturamento'::text,
            date_trunc('month'::text, fato_loja_cupom_recife.data_emissao::timestamp with time zone)::date,
            sum(fato_loja_cupom_recife.valor)
           FROM fato_loja_cupom_recife
          WHERE NOT fato_loja_cupom_recife.cancelado AND fato_loja_cupom_recife.data_emissao IS NOT NULL
          GROUP BY (date_trunc('month'::text, fato_loja_cupom_recife.data_emissao::timestamp with time zone)::date)
        UNION ALL
         SELECT 'marketing'::text, 'leads'::text,
            date_trunc('month'::text, fato_crm_lead.criado_em)::date, count(*)::numeric
           FROM fato_crm_lead
          WHERE fato_crm_lead.criado_em IS NOT NULL AND fato_crm_lead.criado_em::date <> '2026-07-16'::date
          GROUP BY 1, 2, (date_trunc('month'::text, fato_crm_lead.criado_em)::date)
        UNION ALL
         SELECT 'pedagogico'::text, 'comparecimento'::text,
            date_trunc('month'::text, vw_turmas_mensuraveis.data_inicio::timestamp with time zone)::date,
            round(100.0 * sum(vw_turmas_mensuraveis.compareceram) / NULLIF(sum(vw_turmas_mensuraveis.matriculados), 0::numeric), 1)
           FROM vw_turmas_mensuraveis
          GROUP BY 1, 2, (date_trunc('month'::text, vw_turmas_mensuraveis.data_inicio::timestamp with time zone)::date)
        UNION ALL
         SELECT 'financeiro'::text, 'inadimplencia'::text,
            date_trunc('month'::text, fato_contas_receber.data_vencimento::timestamp with time zone)::date,
            sum(fato_contas_receber.valor)
           FROM fato_contas_receber
          WHERE fato_contas_receber.data_vencimento IS NOT NULL AND COALESCE(fato_contas_receber.status, ''::text) !~~* '%receb%'::text AND fato_contas_receber.data_vencimento < CURRENT_DATE
          GROUP BY 1, 2, (date_trunc('month'::text, fato_contas_receber.data_vencimento::timestamp with time zone)::date)
        )
 SELECT m.setor, m.indicador, m.mes_ref, m.unidade, m.sentido, m.minima, m.basica, m.master,
    r.valor AS realizado,
        CASE
            WHEN r.valor IS NULL THEN 'sem_dado'::text
            WHEN m.sentido = 'menor_melhor'::text THEN
              CASE WHEN r.valor <= m.minima THEN 'master'::text
                   WHEN r.valor <= m.basica THEN 'basica'::text
                   WHEN r.valor <= m.master THEN 'minima'::text
                   ELSE 'abaixo'::text END
            ELSE
              CASE WHEN r.valor >= m.master THEN 'master'::text
                   WHEN r.valor >= m.basica THEN 'basica'::text
                   WHEN r.valor >= m.minima THEN 'minima'::text
                   ELSE 'abaixo'::text END
        END AS nivel_atingido,
        CASE
            WHEN m.basica IS NULL OR m.basica = 0::numeric OR r.valor IS NULL THEN NULL::numeric
            WHEN m.sentido = 'menor_melhor'::text THEN round(100.0 * m.basica / NULLIF(r.valor, 0::numeric), 1)
            ELSE round(100.0 * r.valor / m.basica, 1)
        END AS atingido_pct,
    m.observacao, p.nome AS definido_por, m.atualizado_em, m.memoria
   FROM meta_setor m
     LEFT JOIN realizado r ON r.setor = m.setor AND r.indicador = m.indicador AND r.mes_ref = m.mes_ref
     LEFT JOIN perfis p ON p.id = m.definido_por
  WHERE pode_ver(m.setor) OR pode_ver('geral'::text);

-- 3) A série de Recife passa a ler a meta de meta_setor (fonte única)
create or replace view public.vw_loja_recife_serie as
with r as (
  select date_trunc('month', data_emissao)::date as mes, sum(valor) as receita
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
  left join public.meta_setor m
         on m.setor = 'loja_recife' and m.indicador = 'faturamento' and m.mes_ref = r.mes
 where pode_ver('loja')
 order by r.mes;

-- 4) tabela própria não é mais fonte de nada
drop table if exists public.meta_loja_recife;

notify pgrst, 'reload schema';
