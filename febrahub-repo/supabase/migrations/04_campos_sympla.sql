-- ============================================================
-- FebraHub · Migration 04 — Campos que o Sympla manda e a
-- carga estava jogando fora.
-- Rodar ANTES do `python sympla_sync.py --sync`.
-- ============================================================

begin;

-- ---------- fato_pedidos ----------
alter table public.fato_pedidos
  add column if not exists comprador_sobrenome text,

  -- Bruto x liquido. R$19,90 vendido = R$17,40 recebido (~12,5% Sympla).
  -- Sem esta coluna o Hub Financeiro conta receita que nunca
  -- entrou no caixa, e a margem sai 12% otimista.
  add column if not exists valor_liquido numeric(12,2),

  add column if not exists forma_pagamento text,   -- PIX, CREDIT_CARD...

  -- CPF do comprador (66% de cobertura). Chave mais forte do banco
  -- para ligar comprador de evento (R$19,90) -> aluno GGB (R$1.900).
  add column if not exists comprador_documento text,
  add column if not exists comprador_documento_tipo text,

  -- Atribuicao de marketing do evento (23%)
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

-- Taxa efetiva do Sympla, calculada pelo banco. Nunca a mao.
alter table public.fato_pedidos
  add column if not exists taxa_plataforma numeric(12,2)
    generated always as (valor_total - valor_liquido) stored;

-- CPF e e-mail normalizados: sao as chaves de junçao.
alter table public.fato_pedidos
  add column if not exists doc_norm text
    generated always as (
      regexp_replace(coalesce(comprador_documento,''), '\D', '', 'g')
    ) stored,
  add column if not exists email_comprador_norm text
    generated always as (lower(trim(coalesce(comprador_email,'')))) stored;

create index if not exists ix_pedidos_doc
  on public.fato_pedidos (doc_norm) where doc_norm <> '';
create index if not exists ix_pedidos_email
  on public.fato_pedidos (email_comprador_norm) where email_comprador_norm <> '';
create index if not exists ix_pedidos_utm
  on public.fato_pedidos (utm_source, data_pedido_dia);


-- ---------- fato_participantes ----------
alter table public.fato_participantes
  -- Comprou != compareceu. Metrica de no-show do evento.
  add column if not exists check_in boolean,
  add column if not exists desconto numeric(12,2);

create index if not exists ix_part_checkin
  on public.fato_participantes (evento_id, check_in);


-- ---------- dim_alunos: CPF normalizado (o outro lado da ponte) ----------
alter table public.dim_alunos
  add column if not exists doc_norm text
    generated always as (
      regexp_replace(coalesce(cpf,''), '\D', '', 'g')
    ) stored;

create index if not exists ix_alunos_doc
  on public.dim_alunos (doc_norm) where doc_norm <> '';

commit;


-- ============================================================
-- DEPOIS do --sync, medir a ponte real:
-- quantos compradores de evento viraram aluno GGB/CIS?
-- ============================================================

with compradores as (
  select distinct doc_norm
  from public.fato_pedidos
  where doc_norm <> '' and length(doc_norm) = 11
),
alunos as (
  select distinct doc_norm
  from public.dim_alunos
  where doc_norm <> '' and length(doc_norm) = 11
)
select
  (select count(*) from compradores)                          as compradores_evento,
  (select count(*) from alunos)                               as alunos_com_cpf,
  (select count(*) from compradores join alunos using (doc_norm)) as viraram_aluno,
  round(100.0 * (select count(*) from compradores join alunos using (doc_norm))
        / nullif((select count(*) from compradores), 0), 1)   as pct_conversao_evento_curso;
