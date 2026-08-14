-- ============================================================
-- 115 — SÓ TURMA DE VERDADE NA CENTRAL
--
-- Aplicado em 15/08/2026.
--
-- PROBLEMA
--
-- A lista de turmas mostrava LL Networking Business, Team Coaching
-- Business, Team Coaching Life, Livrão Método CIS, Business
-- Evolution e Palestra In Company. Nenhuma delas é turma: são
-- atendimento individual, produto de livro, networking e evento
-- corporativo. Não têm credenciamento, não têm confirmação de
-- presença, não têm grupo de WhatsApp.
--
-- A Elis abriria qualquer uma dessas e veria uma tela de turma que
-- não faz sentido para aquele produto.
--
-- POR QUE NÃO É LISTA DE EXCLUSÃO NO CÓDIGO
--
-- A primeira ideia foi um `not in (...)` com os seis nomes. Ruim:
-- todo produto novo entraria por padrão, e alguém descobriria o
-- problema quando a Elis disparasse confirmação para uma palestra
-- in company.
--
-- E `dim_cursos.grade_pedagogico` já existe e já faz isso. Dos seis
-- que precisavam sair, cinco já estavam como false. Só o Livrão
-- estava marcado como true por engano.
--
-- Criar uma coluna nova para a mesma ideia seria como os números
-- começam a divergir entre telas: duas marcações, duas verdades.
-- ============================================================

update dim_cursos
   set grade_pedagogico = false
 where nome_curso = 'LIVRÃO MÉTODO CIS';

comment on column dim_cursos.grade_pedagogico is
  'Curso com turma presencial de verdade: credenciamento, confirmação
   de presença, grupo de WhatsApp. É o filtro oficial da Central
   Pedagógica — falso para atendimento individual (Coaching
   Individual, Team Coaching), produtos de livro, networking e evento
   corporativo.

   ATENÇÃO: produto novo do Salesforce nasce com o default da carga.
   Se uma turma nova não aparecer na Central, é aqui que se olha.';


-- ------------------------------------------------------------
-- A view passa a filtrar por grade_pedagogico
-- ------------------------------------------------------------
create or replace view vw_turma_inscritos as
select t.turma_id,
       t.curso,
       t.data_inicio,
       m.aluno_id,
       coalesce(c.nome, a.nome, m.aluno_id)                    as nome,
       coalesce(c.celular,
                nullif(m.telefone_cliente, ''), a.telefone)     as telefone,
       coalesce(c.email,
                nullif(m.email_cliente, ''), a.email)           as email,
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
       (coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone,
                 c.email,   nullif(m.email_cliente, ''),    a.email) is null) as sem_contato
  from fato_base_alunos m
  join dim_turmas t  on t.turma_id = m.turma
  join dim_cursos dc on norm_curso(dc.nome_curso) = norm_curso(t.curso)
                    and dc.grade_pedagogico
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join fato_contatos c on c.cpf      = lpad(m.aluno_id, 11, '0')
  left join dim_alunos    a on a.doc_norm = lpad(m.aluno_id, 11, '0')
  left join pedagogico_envios e
         on e.aluno_id = m.aluno_id
        and e.turma_id = m.turma
        and e.tipo     = tipos.tipo
 where m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and pode_ver('pedagogico');


-- ============================================================
-- RESULTADO MEDIDO
--
-- Turmas futuras na Central, depois do filtro: 7
--   BHP26 · CIS-GL252 · CIS-GL253 · FCIS37 · FOP20 · IF36 · IF37
--
-- UMA A CONFERIR: o TOUR PV SALVADOR (421 inscritos) saiu, porque
-- 'TOUR CRESCIMENTO EMPRESARIAL' está como grade_pedagogico = false.
-- Se ele tiver credenciamento e grupo de WhatsApp, precisa voltar:
--
--   update dim_cursos set grade_pedagogico = true
--    where nome_curso = 'TOUR CRESCIMENTO EMPRESARIAL';
--
-- Se for evento aberto, sem confirmação individual, está certo como
-- está.
-- ============================================================
