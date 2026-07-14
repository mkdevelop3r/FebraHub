-- ============================================================
-- FebraHub · Migration 01 — Padronização de nomes
-- Rodar no SQL Editor do Supabase, dentro de uma transação.
-- Renomear é seguro: o Postgres carrega as FKs/índices junto.
-- ============================================================

begin;

-- ---------- 1. Prefixos fora do padrão ----------
alter table if exists public.d_eventos        rename to dim_eventos;
alter table if exists public.f_pedidos        rename to fato_pedidos;
alter table if exists public.f_participantes  rename to fato_participantes;

-- ---------- 2. Clareza de negócio ----------
-- "ggb" é jargão da fonte (Salesforce), não do domínio.
alter table if exists public.dim_cursos_ggb   rename to dim_cursos;

-- "cliente_lead" mistura dois conceitos. Se a tabela guarda o
-- lead (pessoa ainda não convertida), o nome certo é dim_leads.
-- >>> CONFIRME antes de rodar esta linha. <<<
alter table if exists public.dim_cliente_lead rename to dim_leads;

commit;

-- ============================================================
-- 3. RLS: ligar em TUDO agora, antes do deploy.
-- Com a anon key no browser, tabela sem RLS = tabela pública.
-- Sem policy nenhuma, RLS ligado bloqueia 100% dos SELECTs —
-- é o default seguro. As policies vêm na migration 03.
-- ============================================================

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and (tablename like 'dim_%' or tablename like 'fato_%')
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================
-- 4. Checagem: o que ficou sem PK e sem RLS
-- ============================================================

select
  t.tablename,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_constraint
    where conrelid = c.oid and contype = 'p') as tem_pk,
  (select count(*) from pg_constraint
    where conrelid = c.oid and contype = 'f') as qtd_fks
from pg_tables t
join pg_class c on c.relname = t.tablename
where t.schemaname = 'public'
order by t.tablename;
