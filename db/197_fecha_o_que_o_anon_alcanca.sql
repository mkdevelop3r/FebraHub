-- ============================================================
-- FebraHub · Migration 197 — Fecha o que o `anon` alcanca
--
-- O aviso do Supabase apontava UMA tabela sem RLS. Conferindo, a tabela era o
-- menor dos dois problemas.
--
-- ------------------------------------------------------------
-- O QUE O AVISO DIZIA: crm_usuario_depara
--
-- 9 linhas (nome_clint, nome_crm, user_id), sem RLS, e com SELECT, INSERT,
-- UPDATE, DELETE e TRUNCATE concedidos ao `anon`. Qualquer um com a URL do
-- projeto e a chave publica podia ler -- e apagar.
--
-- Nenhuma view e nenhum codigo do repositorio a referenciam: e tabela orfa,
-- provavelmente criada a mao na migracao do Clint. Trancar nao quebra nada.
--
-- ------------------------------------------------------------
-- O QUE O AVISO NAO DIZIA, E E MAIOR: 71 VIEWS
--
-- O aviso so olha TABELAS, porque view nao tem RLS. Mas view tambem e exposta
-- pelo PostgREST, e neste projeto ela e a unica via de leitura -- a protecao
-- mora no `pode_ver()` dentro do proprio WHERE.
--
-- Das 179 views que o `anon` pode selecionar, 108 tem `pode_ver` e se
-- defendem sozinhas: sem sessao, `auth.uid()` e nulo, `pode_ver` e falso, e
-- nao volta linha. As outras 71 NAO TEM, e por isso estavam abertas.
--
-- E nao adianta a tabela por baixo ter RLS: as 71 rodam como DONO
-- (`security_invoker` nao esta setado, e o padrao do Postgres e falso), entao
-- o acesso as tabelas acontece como `postgres` e a RLS e ignorada. Conferido:
-- 71 de 71.
--
-- Entre elas estavam `vw_pedagogico_prazo_pessoa` (nome e contato de aluno),
-- `vw_venda_faturamento`, `vw_receita_consultora_mes` e
-- `vw_conversa_auditavel`.
--
-- ------------------------------------------------------------
-- POR QUE REVOGAR, E NAO ACRESCENTAR `pode_ver` NAS 71
--
-- Porque a permissao e o problema, e o `pode_ver` seria remendo. Nenhuma tela
-- le dado antes do login -- conferido em `web/src/lib/dados.js`, que so busca
-- com sessao -- entao o `anon` nao precisa de leitura NENHUMA aqui. Tirar o
-- acesso resolve as 71 de uma vez e continua valendo para a view 72.
--
-- Acrescentar `pode_ver` em 71 views seria 71 chances de errar, e deixaria a
-- proxima view nascer aberta de novo. A causa raiz e o privilegio padrao do
-- Supabase, que concede SELECT ao anon em objeto novo -- ja foi o que motivou
-- a db/165, para uma view so. Esta migration trata a classe.
--
-- ------------------------------------------------------------
-- O QUE ESTA MIGRATION NAO FAZ
--
-- Nao mexe nas 108 com `pode_ver`. Elas estao defendidas, e revoga-las junto
-- misturaria "estava aberto" com "esta fechado mas o privilegio sobra" -- duas
-- conversas diferentes. Fica registrado como divida: revogar `anon` de tudo
-- seria defesa em profundidade, e o dia em que alguem escrever uma view sem
-- `pode_ver` por engano, o privilegio padrao entrega ela de novo.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A tabela do aviso
-- ------------------------------------------------------------
alter table public.crm_usuario_depara enable row level security;

comment on table public.crm_usuario_depara is
  'De-para de nomes de consultor entre o Clint e o Black CRM. RLS ligada com
   ZERO policies, como as demais fato/dim: leitura so por view. Nenhuma view a
   usa hoje -- se for mesmo orfa, o certo e apagar, mas isso e decisao de quem
   sabe por que ela existe.';

revoke all on public.crm_usuario_depara from anon;
revoke insert, update, delete, truncate on public.crm_usuario_depara from authenticated;


-- ------------------------------------------------------------
-- 2. As 71 views abertas
--
-- Bloco dinamico com o MESMO criterio da investigacao, e nao uma lista de 71
-- nomes: lista se desatualiza e convida a erro de digitacao; o criterio
-- continua verdadeiro. Ele revoga apenas de quem o `anon` alcanca E que nao
-- tem `pode_ver` -- roda de novo sem efeito.
-- ------------------------------------------------------------
do $$
declare
  v record;
  n integer := 0;
begin
  for v in
    select distinct c.oid::regclass as nome
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
     where g.table_schema = 'public'
       and g.grantee = 'anon'
       and g.privilege_type = 'SELECT'
       and c.relkind = 'v'
       and pg_get_viewdef(c.oid, true) not ilike '%pode_ver%'
  loop
    execute format('revoke all on %s from anon', v.nome);
    n := n + 1;
  end loop;
  raise notice 'anon revogado de % view(s)', n;
end $$;

notify pgrst, 'reload schema';

-- conferir: deve voltar zero
--   select count(*)
--     from information_schema.role_table_grants g
--     join pg_class c on c.relname = g.table_name
--     join pg_namespace n on n.oid = c.relnamespace and n.nspname='public'
--    where g.grantee='anon' and g.privilege_type='SELECT' and c.relkind='v'
--      and pg_get_viewdef(c.oid, true) not ilike '%pode_ver%';
