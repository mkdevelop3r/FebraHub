-- ============================================================
-- FebraHub · Migration 206 — Loja Recife (tabelas isoladas)
--
-- Recife é uma CONTA Omie separada. A cadeia de views/meta do Salvador é toda
-- acoplada ao que só existe lá (planilha de fechamento, fato_loja_fechamento,
-- histórico < 2025). Em vez de retrofitar tudo com uma coluna `unidade` e
-- arriscar o dashboard vivo do Salvador, Recife ganha TABELAS PRÓPRIAS —
-- clones das do Salvador — e views próprias (nas próximas migrações). O
-- Salvador não é tocado.
--
-- omie_sync.py --unidade recife grava aqui (nomes com sufixo _recife).
-- ============================================================

create table if not exists public.fato_loja_cupom_recife     (like public.fato_loja_cupom     including all);
create table if not exists public.fato_loja_item_recife       (like public.fato_loja_item       including all);
create table if not exists public.fato_loja_pagamento_recife  (like public.fato_loja_pagamento  including all);
create table if not exists public.fato_loja_estoque_recife    (like public.fato_loja_estoque    including all);

-- RLS igual às originais: leitura para autenticado (o filtro de acesso real
-- fica nas views, via pode_ver('loja')). O ETL grava com service_role (ignora RLS).
alter table public.fato_loja_cupom_recife     enable row level security;
alter table public.fato_loja_item_recife      enable row level security;
alter table public.fato_loja_pagamento_recife enable row level security;
alter table public.fato_loja_estoque_recife   enable row level security;

create policy "leitura autenticada" on public.fato_loja_cupom_recife     for select to authenticated using (true);
create policy "leitura autenticada" on public.fato_loja_item_recife      for select to authenticated using (true);
create policy "leitura autenticada" on public.fato_loja_pagamento_recife for select to authenticated using (true);
create policy "leitura autenticada" on public.fato_loja_estoque_recife   for select to authenticated using (true);
