-- ============================================================
-- FebraHub · Migration 226 — setor 'metas' pode ver o Hub de Metas inteiro
--
-- Antes, o Hub de Metas era só da diretoria (gated por 'geral'), e dar 'geral'
-- a alguém o torna admin no front (vê TUDO). Para liberar SÓ o Metas a um perfil
-- (ex.: Bruna Souza), criamos o setor dedicado 'metas': a view de leitura passa
-- a aceitá-lo (vê todas as metas), e o hub abre pra ele no front. Editar segue
-- exigindo papel 'admin' (RLS de meta_setor) — quem tem 'metas' só VÊ.
-- ============================================================

create or replace view public.vw_meta_realizado_setor as
 WITH realizado AS (
         SELECT 'comercial'::text AS setor,
            'faturamento'::text AS indicador,
            date_trunc('month'::text, v.data_ref::timestamp with time zone)::date AS mes_ref,
            sum(v.valor_bruto) AS valor
           FROM ( SELECT vw_venda_faturamento.original_id_venda,
                    max(vw_venda_faturamento.valor_bruto) AS valor_bruto,
                    min(COALESCE(vw_venda_faturamento.data_aprovacao, vw_venda_faturamento.data_pagamento)) AS data_ref
                   FROM vw_venda_faturamento
                  GROUP BY vw_venda_faturamento.original_id_venda) v
          GROUP BY 'comercial'::text, 'faturamento'::text, (date_trunc('month'::text, v.data_ref::timestamp with time zone)::date)
        UNION ALL
         SELECT 'loja'::text AS text,
            'faturamento'::text AS text,
            vw_loja_receita_mensal.mes,
            vw_loja_receita_mensal.receita
           FROM vw_loja_receita_mensal
        UNION ALL
         SELECT 'loja_recife'::text AS text,
            'faturamento'::text AS text,
            x.mes,
            sum(x.valor) AS sum
           FROM ( SELECT date_trunc('month'::text, fato_loja_cupom_recife.data_emissao::timestamp with time zone)::date AS mes,
                    fato_loja_cupom_recife.valor
                   FROM fato_loja_cupom_recife
                  WHERE NOT fato_loja_cupom_recife.cancelado AND fato_loja_cupom_recife.data_emissao IS NOT NULL
                UNION ALL
                 SELECT fato_loja_receita_extra_recife.mes_ref,
                    fato_loja_receita_extra_recife.valor
                   FROM fato_loja_receita_extra_recife) x
          GROUP BY x.mes
        UNION ALL
         SELECT 'marketing'::text AS text,
            'leads'::text AS text,
            date_trunc('month'::text, fato_crm_lead.criado_em)::date AS date_trunc,
            count(*)::numeric AS count
           FROM fato_crm_lead
          WHERE fato_crm_lead.criado_em IS NOT NULL AND fato_crm_lead.criado_em::date <> '2026-07-16'::date
          GROUP BY 'marketing'::text, 'leads'::text, (date_trunc('month'::text, fato_crm_lead.criado_em)::date)
        UNION ALL
         SELECT 'pedagogico'::text AS text,
            'comparecimento'::text AS text,
            date_trunc('month'::text, vw_turmas_mensuraveis.data_inicio::timestamp with time zone)::date AS date_trunc,
            round(100.0 * sum(vw_turmas_mensuraveis.compareceram) / NULLIF(sum(vw_turmas_mensuraveis.matriculados), 0::numeric), 1) AS round
           FROM vw_turmas_mensuraveis
          GROUP BY 'pedagogico'::text, 'comparecimento'::text, (date_trunc('month'::text, vw_turmas_mensuraveis.data_inicio::timestamp with time zone)::date)
        UNION ALL
         SELECT 'financeiro'::text AS text,
            'inadimplencia'::text AS text,
            date_trunc('month'::text, fato_contas_receber.data_vencimento::timestamp with time zone)::date AS date_trunc,
            sum(fato_contas_receber.valor) AS sum
           FROM fato_contas_receber
          WHERE fato_contas_receber.data_vencimento IS NOT NULL AND COALESCE(fato_contas_receber.status, ''::text) !~~* '%receb%'::text AND fato_contas_receber.data_vencimento < CURRENT_DATE
          GROUP BY 'financeiro'::text, 'inadimplencia'::text, (date_trunc('month'::text, fato_contas_receber.data_vencimento::timestamp with time zone)::date)
        )
 SELECT m.setor,
    m.indicador,
    m.mes_ref,
    m.unidade,
    m.sentido,
    m.minima,
    m.basica,
    m.master,
    r.valor AS realizado,
        CASE
            WHEN r.valor IS NULL THEN 'sem_dado'::text
            WHEN m.sentido = 'menor_melhor'::text THEN
            CASE
                WHEN r.valor <= m.minima THEN 'master'::text
                WHEN r.valor <= m.basica THEN 'basica'::text
                WHEN r.valor <= m.master THEN 'minima'::text
                ELSE 'abaixo'::text
            END
            ELSE
            CASE
                WHEN r.valor >= m.master THEN 'master'::text
                WHEN r.valor >= m.basica THEN 'basica'::text
                WHEN r.valor >= m.minima THEN 'minima'::text
                ELSE 'abaixo'::text
            END
        END AS nivel_atingido,
        CASE
            WHEN m.basica IS NULL OR m.basica = 0::numeric OR r.valor IS NULL THEN NULL::numeric
            WHEN m.sentido = 'menor_melhor'::text THEN round(100.0 * m.basica / NULLIF(r.valor, 0::numeric), 1)
            ELSE round(100.0 * r.valor / m.basica, 1)
        END AS atingido_pct,
    m.observacao,
    p.nome AS definido_por,
    m.atualizado_em,
    m.memoria
   FROM meta_setor m
     LEFT JOIN realizado r ON r.setor = m.setor AND r.indicador = m.indicador AND r.mes_ref = m.mes_ref
     LEFT JOIN perfis p ON p.id = m.definido_por
  WHERE pode_ver(m.setor) OR pode_ver('geral'::text) OR pode_ver('metas'::text);

notify pgrst, 'reload schema';
