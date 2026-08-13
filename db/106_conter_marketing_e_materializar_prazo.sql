-- ============================================================
-- 106 — CONTER A VIEW DE MARKETING E MATERIALIZAR A FILA DE PRAZO
--
-- APLICADO. Conferido no banco em 13/08/2026. Foi rodado a PARTE 1 primeiro, sozinha.
--
-- ============================================================
-- PARTE 1 — URGENTE: a view de marketing derruba o banco
--
-- Evidência nos logs do Postgres, 10 e 11/08/2026:
--
--   database system was not properly shut down;
--   automatic recovery in progress
--
-- Três vezes em 24 horas. E logo antes de cada queda:
--
--   duration: 11028 ms
--   Query Text: SELECT vw_marketing_atribuicao_campanha.* ... LIMIT 1000
--   Aggregate (cost=73547439.32) rows=64444285
--
-- Custo estimado de 73 MILHÕES e 64 milhões de linhas planejadas,
-- sobre um banco com 20 mil matrículas. Isso é produto cartesiano:
-- a view junta dim_alunos com fato_negocio_lead por e-mail e por
-- telefone, com filtro apenas de data (`l.data_criacao <=
-- ac.data_fechamento_venda`), o que casa cada lead com quase todas
-- as vendas posteriores.
--
-- Ela é chamada pelo FRONT, via PostgREST. Ou seja: qualquer pessoa
-- que abrir o hub de marketing pode derrubar o banco inteiro — e
-- levar junto a carga de presença das 17h, as mensagens do
-- pedagógico e a fila da Elis.
--
-- Esta linha não conserta a view. Ela impede que a view continue
-- derrubando tudo enquanto não for reescrita. O hub de marketing
-- vai mostrar erro naquela tela — o que é infinitamente melhor que
-- um banco fora do ar.
--
-- REVERTER, depois de reescrever a view:
--   grant select on vw_marketing_atribuicao_campanha to authenticated;
-- ============================================================

revoke select on vw_marketing_atribuicao_campanha from anon, authenticated;

comment on view vw_marketing_atribuicao_campanha is
  'ACESSO REVOGADO EM 11/08/2026 — esta view derrubou o banco três
   vezes em 24h. Plano com custo de 73 milhões e 64 milhões de linhas
   por produto cartesiano na junção lead x venda por e-mail/telefone
   com filtro só de data. Reescrever antes de devolver o grant.';


-- ============================================================
-- PARTE 2 — MATERIALIZAR A FILA DE PRAZO
--
-- Os índices do 105 não bastaram: a view continua estourando o
-- statement timeout do PostgREST. O motivo é `norm_curso()` nas
-- junções — função sobre coluna não usa índice comum, então cada
-- leitura reprocessa 3 anos de matrículas.
--
-- Em vez de índice funcional (que resolveria só metade), a fila
-- vira TABELA, recalculada pelo ETL. A leitura fica instantânea e o
-- custo sai para o sync, que roda 3x ao dia e tem tempo de sobra.
--
-- Tabela e não `materialized view` de propósito: o REFRESH de uma
-- matview trava a leitura enquanto roda, e o front da Elis leria
-- justamente durante o sync. Com tabela + delete/insert numa
-- transação, a troca é atômica e a leitura nunca vê o meio.
-- ============================================================

create table if not exists fila_prazo (
  cpf              text not null,
  nome             text,
  telefone         text,
  email            text,
  curso            text not null,
  comprou_em       date,
  vence_em         date,
  dias_restantes   int,
  consultor        text,
  turma_da_venda   text,
  tipos            text,
  ja_transferiu    boolean,
  proxima_turma    text,
  proxima_turma_em date,
  situacao         text,
  atualizado_em    timestamptz not null default now(),
  primary key (cpf, curso)
);

create index if not exists fila_prazo_situacao on fila_prazo (situacao, dias_restantes);

comment on table fila_prazo is
  'Fila de prazo materializada. Recalculada por atualizar_fila_prazo()
   no fim de cada sync. Ler daqui, nunca de vw_pedagogico_prazo — a
   view leva mais que o timeout do PostgREST.
   `atualizado_em` diz a idade do dado e precisa aparecer na tela:
   número velho sem aviso é pior que número ausente.';


-- `set safeupdate.enabled = 'off'` e o `where true` no delete: o
-- Supabase habilita a extensão pg_safeupdate no PostgREST, que recusa
-- DELETE sem WHERE com o erro 21000 "DELETE requires a WHERE clause".
-- A proteção existe para impedir que alguém apague uma tabela inteira
-- por engano — só que aqui apagar tudo É a intenção.
--
-- Sintoma que leva a isso: a função roda pelo editor do Supabase (onde
-- a extensão não está ativa) e falha pelo GitHub Actions.
--
-- E não é `truncate` de propósito: truncate pega lock exclusivo, e quem
-- estiver lendo a fila durante o sync ficaria travado esperando. Com
-- delete + insert na mesma transação, a leitura continua vendo a versão
-- anterior até o commit.
create or replace function atualizar_fila_prazo()
returns jsonb
language plpgsql
security definer
set search_path = public
set safeupdate.enabled = 'off'
as $$
declare
  v_linhas int;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) is distinct from 'service_role'
     and coalesce(meu_papel(), '') <> 'admin' then
    raise exception 'Sem permissão';
  end if;

  -- delete + insert na mesma transação: a troca é atômica e quem
  -- estiver lendo nunca vê a tabela vazia
  delete from fila_prazo where true;

  insert into fila_prazo (cpf, nome, telefone, email, curso, comprou_em,
                          vence_em, dias_restantes, consultor, turma_da_venda,
                          tipos, ja_transferiu, proxima_turma, proxima_turma_em,
                          situacao)
  select cpf, nome, telefone, email, curso, comprou_em, vence_em,
         dias_restantes, consultor, turma_da_venda, tipos, ja_transferiu,
         proxima_turma, proxima_turma_em, situacao
    from vw_pedagogico_prazo;

  get diagnostics v_linhas = row_count;

  return jsonb_build_object('linhas', v_linhas, 'em', now());
end $$;

revoke execute on function atualizar_fila_prazo from anon;


-- ------------------------------------------------------------
-- As views de leitura passam a ler da TABELA
-- ------------------------------------------------------------
drop view if exists vw_prazo_fila_envio;

create view vw_prazo_fila_envio as
select f.cpf as aluno_id, f.nome, f.telefone, f.curso, f.vence_em,
       f.dias_restantes, f.proxima_turma as turma_id,
       f.proxima_turma_em, f.ja_transferiu
  from fila_prazo f
 where coalesce(f.turma_da_venda, '') not ilike '%LISBOA%'
   and f.curso not ilike '%MAESTRIA%'
   and f.situacao = 'vencendo'
   and f.telefone is not null
   and f.proxima_turma is not null
   and f.proxima_turma_em <= f.vence_em
   and not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = f.cpf
        and e.turma_id = f.proxima_turma
        and e.tipo = 'prazo_vencendo'
   );

grant select on fila_prazo, vw_prazo_fila_envio to authenticated;


-- ============================================================
-- COMO LIGAR NO ETL
--
-- No sync-salesforce.yml, entre o step do Salesforce e o das
-- mensagens, acrescentar:
--
--   - name: Atualizar fila de prazo
--     if: steps.sf.outcome == 'success'
--     run: |
--       curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/atualizar_fila_prazo" \
--         -H "apikey: $SUPABASE_SERVICE_KEY" \
--         -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
--         -H "Content-Type: application/json" -d '{}'
--
-- A ordem importa: sync -> recalcula a fila -> manda mensagem.
-- Invertida, o script trabalha sobre a fila da rodada anterior.
--
-- PRIMEIRA CARGA, pelo editor (pode levar um tempo, é a mesma
-- consulta pesada — só que uma vez). Precisa forjar a sessão, porque
-- no editor auth.uid() é nulo e meu_papel() volta vazio:
--
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<uuid do perfil admin>')::text, true);
--   select atualizar_fila_prazo();
--   select count(*), max(atualizado_em) from fila_prazo;
--
-- Medido em 11/08/2026: 1.702 linhas.
-- ============================================================


-- ============================================================
-- O QUE ISTO NÃO RESOLVE
--
-- A `vw_pedagogico_prazo` continua lenta. Ela só deixou de estar no
-- caminho crítico. Se um dia precisar ser consultada ao vivo, o
-- caminho é índice funcional:
--
--   create index on fato_base_alunos (norm_curso(curso_id));
--   create index on fato_presenca (norm_curso(curso));
--
-- Exige que norm_curso() seja IMMUTABLE. Conferir antes:
--   select provolatile from pg_proc where proname = 'norm_curso';
--   ('i' = immutable, 's' = stable, 'v' = volatile)
--
-- E a view de marketing continua quebrada — só contida. Reescrevê-la
-- é o próximo trabalho de verdade neste banco.
-- ============================================================
