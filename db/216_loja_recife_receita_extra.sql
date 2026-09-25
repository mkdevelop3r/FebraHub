-- ============================================================
-- FebraHub · Migration 216 — Receita extra da loja de Recife
--
-- Além dos produtos (cupons do Omie), a loja de Recife tem receitas extras que
-- não saem no Omie: sala de atendimento (aluguel) e workshops. Espelha o
-- fato_loja_receita_extra do Salvador, mas na trilha isolada de Recife.
-- Some no faturamento de Recife: bloco da Loja (vw_loja_recife_serie) e
-- realizado do Hub de Metas (vw_meta_realizado_setor, setor loja_recife).
--
-- Valores informados pela gestão:
--   jun/2026: R$250 sala   | jul/2026: R$150 sala
--   ago/2026: R$100 sala + R$247 workshop (PDA)
-- ============================================================

create table if not exists public.fato_loja_receita_extra_recife (
  id        bigint generated always as identity primary key,
  mes_ref   date    not null,
  fonte     text    not null,   -- 'sala_atendimento' | 'workshop' | ...
  valor     numeric not null,
  obs       text,
  criado_em timestamptz not null default now(),
  unique (mes_ref, fonte)
);
alter table public.fato_loja_receita_extra_recife enable row level security;
create policy "leitura autenticada" on public.fato_loja_receita_extra_recife for select to authenticated using (true);

insert into public.fato_loja_receita_extra_recife (mes_ref, fonte, valor, obs) values
  ('2026-06-01', 'sala_atendimento', 250, 'Sala de atendimento'),
  ('2026-07-01', 'sala_atendimento', 150, 'Sala de atendimento'),
  ('2026-08-01', 'sala_atendimento', 100, 'Sala de atendimento'),
  ('2026-08-01', 'workshop',         247, 'Workshop PDA')
on conflict (mes_ref, fonte) do update set valor = excluded.valor, obs = excluded.obs;

-- Receita de Recife = produtos (cupom) + extras
create or replace view public.vw_loja_recife_serie as
with r as (
  select date_trunc('month', data_emissao)::date as mes, sum(valor) as receita
    from public.fato_loja_cupom_recife
   where not cancelado and data_emissao is not null
   group by 1
),
ex as (
  select mes_ref as mes, sum(valor) as extra
    from public.fato_loja_receita_extra_recife
   group by 1
),
tot as (
  select coalesce(r.mes, ex.mes) as mes,
         coalesce(r.receita, 0) + coalesce(ex.extra, 0) as receita
    from r full join ex on ex.mes = r.mes
)
select tot.mes,
       extract(year from tot.mes)::int as ano,
       round(tot.receita)              as receita,
       m.minima                        as meta_minima,
       m.basica                        as meta_basica,
       m.master                        as meta_master,
       (tot.mes = date_trunc('month', current_date)::date) as em_curso
  from tot
  left join public.meta_setor m
         on m.setor = 'loja_recife' and m.indicador = 'faturamento' and m.mes_ref = tot.mes
 where pode_ver('loja')
 order by tot.mes;

-- Consolidado de metas: realizado de Recife passa a incluir os extras
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
         SELECT 'loja_recife'::text, 'faturamento'::text, x.mes, sum(x.valor)
           FROM ( SELECT date_trunc('month'::text, fato_loja_cupom_recife.data_emissao::timestamp with time zone)::date AS mes,
                         fato_loja_cupom_recife.valor
                    FROM fato_loja_cupom_recife
                   WHERE NOT fato_loja_cupom_recife.cancelado AND fato_loja_cupom_recife.data_emissao IS NOT NULL
                  UNION ALL
                  SELECT fato_loja_receita_extra_recife.mes_ref, fato_loja_receita_extra_recife.valor
                    FROM fato_loja_receita_extra_recife ) x
          GROUP BY x.mes
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

notify pgrst, 'reload schema';
