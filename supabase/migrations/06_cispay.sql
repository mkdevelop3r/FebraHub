-- ============================================================
-- FebraHub · Migration 06 — CisPay (schedules-ex)
--
-- DUAS CORREÇÕES em relação à primeira tentativa:
--
-- 1. valor_bruto AQUI É POR PARCELA (105,35 de uma venda de 1.264),
--    não o total da venda como no /services/payments. Soma
--    livremente. Deduplicar era o bug que "sumia" com 25% da receita.
--
-- 2. cod_salesforce vem 100% preenchido — é o ID da venda no
--    Salesforce, o mesmo original_id_venda de fato_pagamento_base.
--    O Table.SelectColumns do Power Query o descartava, e por isso
--    ninguém sabia que ele existia.
--    Liquidação -> venda -> matrícula -> curso -> consultor.
--    Ponte EXATA. Nada de estatística.
-- ============================================================

drop table if exists public.fato_liquidacao_cartao;

begin;

create table public.fato_liquidacao_cartao (
  parcela_id            text primary key,        -- schedule_id
  pagamento_cartao_id   text not null,           -- PaymentId (a venda)

  -- A PONTE. Liga em fato_pagamento_base.original_id_venda.
  cod_salesforce        text,
  link_salesforce       text,

  subseller_id          text,
  data_venda            date,
  data_liquidacao       date not null,           -- quando o dinheiro cai

  forma_pagamento       text,                    -- "Cartão Online - Crédito"
  tipo_transacao        text,                    -- Credit / Refund / Chargeback
  bandeira              text,
  cartao_mascarado      text,

  numero_parcela        int,
  total_parcelas        int,

  -- Todos POR PARCELA. Somam livremente.
  valor_bruto           numeric(12,2),
  valor_liquido         numeric(12,2),
  taxa_cispay           numeric(12,2),
  pct_mdr               numeric(6,2),            -- percentual, não somar

  nsu                   text,
  autorizacao           text,

  -- Ponte secundária (91%): CPF do portador.
  documento             text,
  doc_norm              text,
  nome_portador         text
);

alter table public.fato_liquidacao_cartao enable row level security;

create index ix_liq_liquidacao on public.fato_liquidacao_cartao (data_liquidacao);
create index ix_liq_venda      on public.fato_liquidacao_cartao (data_venda);
create index ix_liq_sf         on public.fato_liquidacao_cartao (cod_salesforce);
create index ix_liq_doc        on public.fato_liquidacao_cartao (doc_norm) where doc_norm is not null;

-- Extrato bancário: a fonte de verdade. ~172 lançamentos.
create table if not exists public.fato_extrato_cispay (
  lancamento_id     text primary key,
  subseller_id      text,
  data_lancamento   timestamptz,
  descricao         text,
  valor_bruto       numeric(12,2),
  valor_liquido     numeric(12,2)
);
alter table public.fato_extrato_cispay enable row level security;

commit;


-- ============================================================
-- VALIDAR A PONTE (rode depois do --sync)
-- Se a cobertura for alta, a CisPay deixa de ser ilha e passa a
-- atribuir cada real liquidado a um curso e a um consultor.
-- ============================================================

select
  count(*)                                     as parcelas,
  count(distinct l.cod_salesforce)             as vendas_cispay,
  count(*) filter (where p.original_id_venda is not null) as casaram,
  round(100.0 * count(*) filter (where p.original_id_venda is not null)
        / nullif(count(*), 0), 1)              as pct_ponte
from public.fato_liquidacao_cartao l
left join (select distinct original_id_venda from public.fato_pagamento_base) p
       on p.original_id_venda = l.cod_salesforce;


-- ============================================================
-- FLUXO DE CAIXA PROJETADO
-- O KPI que a Febracis nunca teve: quanto entra, e quando.
-- Direto da adquirente. Sem modelo, sem estatística.
-- ============================================================

create or replace view public.vw_financeiro_caixa_horizonte as
select
  case
    when data_liquidacao <= current_date + 30 then '1 · até 30 dias'
    when data_liquidacao <= current_date + 60 then '2 · 31 a 60 dias'
    when data_liquidacao <= current_date + 90 then '3 · 61 a 90 dias'
    else '4 · além de 90 dias'
  end                        as horizonte,
  count(*)                   as parcelas,
  sum(valor_liquido)         as a_receber
from public.fato_liquidacao_cartao
where public.pode_ver('financeiro')
  and data_liquidacao > current_date
  and tipo_transacao = 'Credit'          -- exclui estorno e chargeback
group by 1
order by 1;


-- ============================================================
-- CUSTO REAL DA MAQUININHA
-- fato_pagamento_base conta o BRUTO. A margem está otimista pela
-- taxa de cartão inteira. Aqui ela aparece.
-- ============================================================

create or replace view public.vw_financeiro_mdr as
select
  date_trunc('month', data_venda)::date as mes,
  bandeira,
  forma_pagamento,
  count(*)                              as parcelas,
  sum(valor_bruto)                      as bruto,
  sum(valor_liquido)                    as liquido,
  sum(taxa_cispay)                      as taxa,
  round(100.0 * sum(taxa_cispay)
        / nullif(sum(valor_bruto), 0), 2) as pct_efetivo
from public.fato_liquidacao_cartao
where public.pode_ver('financeiro')
  and data_venda is not null
  and tipo_transacao = 'Credit'
group by 1, 2, 3;


-- ============================================================
-- PERDAS: estorno e chargeback. Número que a Dulce nunca viu.
-- ============================================================

create or replace view public.vw_financeiro_perdas_cartao as
select
  date_trunc('month', data_liquidacao)::date as mes,
  tipo_transacao,
  count(*)                                   as ocorrencias,
  abs(sum(valor_liquido))                    as valor
from public.fato_liquidacao_cartao
where public.pode_ver('financeiro')
  and tipo_transacao <> 'Credit'
group by 1, 2;


-- ============================================================
-- RECEITA LÍQUIDA POR CURSO — só possível graças ao cod_salesforce.
-- Cada real que a maquininha depositou, atribuído a um curso.
-- ============================================================

create or replace view public.vw_financeiro_liquido_por_curso as
select
  date_trunc('month', l.data_venda)::date   as mes,
  coalesce(c.nome_curso, 'nao_determinado') as curso,
  count(*)                                  as parcelas,
  sum(l.valor_bruto)                        as bruto,
  sum(l.valor_liquido)                      as liquido,
  sum(l.taxa_cispay)                        as taxa_cartao
from public.fato_liquidacao_cartao l
left join public.fato_pagamento_base p on p.original_id_venda = l.cod_salesforce
left join public.mv_venda_curso v      on v.original_id_venda = p.original_id_venda
left join public.dim_cursos c          on c.curso_id = v.curso_id
where public.pode_ver('financeiro')
  and l.tipo_transacao = 'Credit'
  and l.data_venda is not null
group by 1, 2;

grant select on
  public.vw_financeiro_caixa_horizonte,
  public.vw_financeiro_mdr,
  public.vw_financeiro_perdas_cartao,
  public.vw_financeiro_liquido_por_curso
to authenticated;
