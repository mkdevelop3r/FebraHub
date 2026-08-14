-- ============================================================
-- 113 — INSCRITOS DA TURMA, INCLUINDO QUEM NÃO FOI ENFILEIRADO
--
-- APLICADO. Conferido no banco em 13/08/2026.
--
-- PROBLEMA
--
-- `vw_turma_status` (108) parte de pedagogico_envios, ou seja, só
-- enxerga quem JÁ foi enfileirado. Medido em 13/08/2026:
--
--   turmas futuras ................ 9
--   matriculados nelas ............ 872
--   turmas com algum envio ........ 2
--   linhas em pedagogico_envios ... 48
--
-- A Elis abriria a Central e veria 7 das 9 turmas vazias, e 48 de
-- 872 pessoas nas outras duas. A tela que deveria substituir a
-- planilha mostraria menos que a planilha.
--
-- O erro de desenho foi meu: escrevi a view pensando no registro de
-- envio, não na lista de trabalho. Quem opera precisa ver a turma
-- inteira e enxergar quem falta — o vazio é justamente a informação
-- mais útil.
--
-- CORREÇÃO
--
-- Parte de fato_base_alunos (a matrícula) e faz left join com
-- pedagogico_envios. Quem não tem envio aparece como
-- 'nao enfileirado'.
-- ============================================================

create or replace view vw_turma_inscritos as
select t.turma_id,
       t.curso,
       t.data_inicio,
       m.aluno_id,
       coalesce(a.nome, m.aluno_id)                          as nome,
       coalesce(nullif(m.telefone_cliente, ''), a.telefone)  as telefone,
       coalesce(nullif(m.email_cliente, ''), a.email)        as email,
       m.tipo_matricula,
       tipos.tipo,
       e.status,
       e.enviado_em,
       e.resposta,
       e.respondido_em,
       e.resposta_origem,
       case
         when e.aluno_id is null              then 'nao enfileirado'
         when e.status   = 'pendente'         then 'aguardando envio'
         when e.status   = 'erro'             then 'erro no envio'
         when e.resposta = 'sim'              then 'confirmado'
         when e.resposta = 'nao'              then 'nao vem'
         when e.resposta = 'sem_resposta'     then 'sem resposta'
         else 'aguardando resposta'
       end as situacao,
       -- a tela precisa distinguir "não mandei" de "não tem como mandar"
       (coalesce(nullif(m.telefone_cliente, ''), a.telefone,
                 nullif(m.email_cliente, ''), a.email) is null) as sem_contato
  from fato_base_alunos m
  join dim_turmas t on t.turma_id = m.turma
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join dim_alunos a on a.doc_norm = lpad(m.aluno_id, 11, '0')
  left join pedagogico_envios e
         on e.aluno_id = m.aluno_id
        and e.turma_id = m.turma
        and e.tipo     = tipos.tipo
 where m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and pode_ver('pedagogico');

comment on view vw_turma_inscritos is
  'A turma inteira, uma linha por pessoa × tipo de mensagem
   (confirmacao e grupo). Quem ainda não foi enfileirado aparece como
   ''nao enfileirado'' — é a informação mais útil da tela, porque diz
   quem falta disparar.

   COMPRADOR DE VAGAS fora: é terceiro pagador, não aluno. `sem_contato`
   separa "não mandei ainda" de "não tem como mandar", que são duas
   conversas diferentes.';


create or replace view vw_turma_inscritos_resumo as
select turma_id, curso, data_inicio, tipo,
       count(*)                                              as matriculados,
       count(*) filter (where situacao = 'nao enfileirado')    as nao_enfileirados,
       count(*) filter (where situacao = 'aguardando envio')   as aguardando_envio,
       count(*) filter (where situacao = 'aguardando resposta') as aguardando_resposta,
       count(*) filter (where situacao = 'confirmado')         as confirmados,
       count(*) filter (where situacao = 'nao vem')            as nao_vem,
       count(*) filter (where situacao = 'sem resposta')       as sem_resposta,
       count(*) filter (where sem_contato)                     as sem_contato
  from vw_turma_inscritos
 group by turma_id, curso, data_inicio, tipo;

comment on view vw_turma_inscritos_resumo is
  'Contadores por turma e tipo de mensagem, para o topo da tela.
   `nao_enfileirados` é o número de ação: quantas pessoas ainda não
   receberam. `sem_contato` é fila de trabalho — alguém precisa achar
   o telefone.';

grant select on vw_turma_inscritos, vw_turma_inscritos_resumo to authenticated;


-- ============================================================
-- vw_turma_status (108) continua existindo
--
-- Ela responde outra pergunta: "o que foi enviado". Serve para
-- histórico e auditoria. A tela de operação usa esta aqui.
-- ============================================================
