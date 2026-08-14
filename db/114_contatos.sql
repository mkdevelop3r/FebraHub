-- ============================================================
-- 114 — CONTATOS DO SALESFORCE
--
-- NÃO APLICADO. Rodar por blocos.
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A tela de inscritos da turma mostrava CPF no lugar do nome. Medido
-- na FCIS37: 33 de 41 inscritos não existem em dim_alunos, e 16 dos
-- 38 da CIS-GL252 aparecem como "sem telefone nem e-mail".
--
-- O dado existe — vive na planilha do pedagógico, que sai de um
-- relatório do Salesforce. 19.889 linhas, 9.381 CPFs distintos, com
-- nome em 100%, celular em 99,6% e e-mail em 99,9%.
--
-- Metade dessas pessoas não está em dim_alunos hoje (medido em
-- amostra de 100): a carga dobra a cobertura de contatos.
--
-- SEM ESTE DADO, NADA DA CENTRAL FUNCIONA
--
-- Uma lista de CPFs não serve para ligar. E não adianta ajustar
-- layout sobre dado vazio — a tela ficaria bonita e inútil.
--
-- COMO O RELATÓRIO É
--
-- Uma linha por VENDA, não por pessoa: quem comprou cinco cursos
-- aparece cinco vezes. A promoção deduplica por CPF, mantendo o
-- registro de aprovação mais recente — é o contato mais atual.
--
-- Não filtra curso. Chegou a proposta de tirar CI, Mentoria e afins,
-- mas o objetivo aqui é CADASTRO, não matrícula: o telefone da
-- pessoa é o mesmo tenha ela comprado Coaching Individual ou CIS
-- Global. Filtrar cursos só reduziria a cobertura sem ganho.
-- Os filtros de curso continuam onde já estão, nas views de fila.
-- ============================================================


-- ------------------------------------------------------------
-- Staging: tudo text, truncada a cada carga
-- ------------------------------------------------------------
create table if not exists stg_contatos (
  nome             text,
  celular          text,
  cpf              text,
  email            text,
  sexo             text,
  proprietario     text,
  turma            text,
  curso            text,
  unidade          text,
  nome_venda       text,
  data_aprovacao   text,
  fase             text,
  tipo_matricula   text
);

comment on table stg_contatos is
  'Área de pouso do relatório de contatos do Salesforce. Uma linha por
   venda. Truncar antes de cada carga.';


-- ------------------------------------------------------------
-- Fato: uma linha por PESSOA
-- ------------------------------------------------------------
create table if not exists fato_contatos (
  cpf            text primary key,
  nome           text not null,
  celular        text,
  email          text,
  ultima_compra  date,
  carregado_em   timestamptz not null default now()
);

create index if not exists fato_contatos_nome on fato_contatos (nome);

comment on table fato_contatos is
  'Cadastro de contato por CPF, do relatório do Salesforce. Fonte de
   nome e telefone para as telas do pedagógico.

   Separada de dim_alunos de propósito: dim_alunos vem de outra carga
   e tem aluno_id do Salesforce como chave. Aqui a chave é o CPF, que
   é o que fato_base_alunos e fato_presenca usam. Juntar as duas numa
   só exigiria reescrever a outra carga — e o ganho seria nenhum.';


-- ------------------------------------------------------------
-- Promoção stg -> fato
-- ------------------------------------------------------------
create or replace function promover_contatos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lidas int;
  v_gravadas int;
  v_sem_cpf int;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) is distinct from 'service_role'
     and coalesce(meu_papel(), '') <> 'admin' then
    raise exception 'Sem permissão';
  end if;

  select count(*) into v_lidas from stg_contatos;

  select count(*) into v_sem_cpf from stg_contatos
   where length(regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) <> 11;

  insert into fato_contatos (cpf, nome, celular, email, ultima_compra)
  select distinct on (cpf) * from (
    select lpad(regexp_replace(cpf, '\D', '', 'g'), 11, '0')      as cpf,
           btrim(nome)                                            as nome,
           nullif(btrim(coalesce(celular, '')), '')                as celular,
           nullif(btrim(coalesce(email, '')), '')                  as email,
           to_date(nullif(btrim(coalesce(data_aprovacao,'')), ''), 'DD/MM/YYYY') as ultima_compra
      from stg_contatos
     where length(regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) = 11
       and nullif(btrim(coalesce(nome, '')), '') is not null
  ) x
   -- o registro mais recente vence: é o contato mais atual
   order by cpf, ultima_compra desc nulls last
  on conflict (cpf) do update
    set nome          = excluded.nome,
        celular       = coalesce(excluded.celular, fato_contatos.celular),
        email         = coalesce(excluded.email, fato_contatos.email),
        ultima_compra = greatest(excluded.ultima_compra, fato_contatos.ultima_compra),
        carregado_em  = now();

  get diagnostics v_gravadas = row_count;

  return jsonb_build_object('lidas', v_lidas, 'gravadas', v_gravadas,
                            'descartadas_sem_cpf', v_sem_cpf);
end $$;

revoke execute on function promover_contatos from anon;

grant select on fato_contatos to authenticated;


-- ============================================================
-- AS VIEWS PASSAM A USAR fato_contatos COMO PRIMEIRA FONTE
--
-- Ordem de precedência do contato:
--   1. fato_contatos   (relatório dedicado, mais completo e recente)
--   2. matrícula       (telefone_cliente / email_cliente)
--   3. dim_alunos      (carga antiga, cobertura menor)
-- ============================================================

create or replace view vw_turma_inscritos as
select t.turma_id,
       t.curso,
       t.data_inicio,
       m.aluno_id,
       coalesce(c.nome, a.nome, m.aluno_id)                     as nome,
       coalesce(c.celular,
                nullif(m.telefone_cliente, ''), a.telefone)      as telefone,
       coalesce(c.email,
                nullif(m.email_cliente, ''), a.email)            as email,
       m.tipo_matricula,
       tipos.tipo,
       e.status,
       e.enviado_em,
       e.resposta,
       e.respondido_em,
       e.resposta_origem,
       case
         when e.aluno_id is null          then 'nao enfileirado'
         when e.status   = 'pendente'     then 'aguardando envio'
         when e.status   = 'erro'         then 'erro no envio'
         when e.resposta = 'sim'          then 'confirmado'
         when e.resposta = 'nao'          then 'nao vem'
         when e.resposta = 'sem_resposta' then 'sem resposta'
         else 'aguardando resposta'
       end as situacao,
       (coalesce(c.celular, nullif(m.telefone_cliente,''), a.telefone,
                 c.email, nullif(m.email_cliente,''), a.email) is null) as sem_contato
  from fato_base_alunos m
  join dim_turmas t on t.turma_id = m.turma
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join fato_contatos c on c.cpf = lpad(m.aluno_id, 11, '0')
  left join dim_alunos    a on a.doc_norm = lpad(m.aluno_id, 11, '0')
  left join pedagogico_envios e
         on e.aluno_id = m.aluno_id
        and e.turma_id = m.turma
        and e.tipo     = tipos.tipo
 where m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and pode_ver('pedagogico');


-- ============================================================
-- COMO CARREGAR
--
--   1. Table editor -> stg_contatos -> Import CSV
--      (converter de latin1 para utf8 antes)
--   2. select promover_contatos();
--   3. truncate stg_contatos;
--
-- Conferir o ganho:
--   select count(*) from fato_contatos;                    -- ~9.381
--   select count(*) filter (where nome !~ '^\d{11}$')
--     from vw_turma_inscritos where turma_id='2026 - FCIS37';
--
-- DEPOIS: agendar no GitHub Actions, no mesmo padrão da presença.
-- Enquanto a carga for manual, a cobertura envelhece — e quem
-- comprar amanhã volta a aparecer como CPF.
-- ============================================================
