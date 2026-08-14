-- ============================================================
-- 118 — INSCRITOS SEM TRIPLICAR
--
-- NÃO APLICADO. Rodar no SQL Editor do Supabase.
--
-- O MESMO BUG, NA OUTRA VIEW
--
-- A vw_turmas_central já teve o `join dim_cursos` trocado por `exists`,
-- porque ele multiplicava a turma na tela. A vw_turma_inscritos (migration
-- 115_so_turma_de_verdade) ficou com o join.
--
-- ESCOPO, MEDIDO EM 15/08/2026
--
-- `MÉTODO CIS GLOBAL - INTELIGÊNCIA EMOCIONAL` tem TRÊS linhas em
-- dim_cursos que colapsam no mesmo norm_curso(). O join casa as três, e
-- cada inscrito vira três. É o ÚNICO curso da grade nessa situação —
-- conferido curso a curso — mas pega **39 turmas**, não só as futuras:
--
--   turma              linhas na view   pessoas reais   fator
--   2026 - CIS-GL250        246              82          3x
--   2026 - CIS-GL251        279              93          3x
--   2026 - CIS-GL252         18               6          3x
--   2026 - CIS-GL253          6               2          3x
--   ... e mais 35 turmas de CIS Global
--
-- O QUE ESTA CORREÇÃO **NÃO** RESOLVE
--
-- Depois de aplicar sobram 40 turmas (de 136 na grade) com mais linhas
-- que pessoas: 97 linhas a mais no total, pior caso 20. Isso é outro
-- problema — a MESMA pessoa com duas matrículas aprovadas na MESMA
-- turma, em fato_base_alunos. `exists` mata o leque do join, não a
-- matrícula repetida. Se incomodar, o conserto é a montante (na carga)
-- ou um distinct aqui — mas aí é preciso decidir qual das duas
-- matrículas manda, e isso é decisão de operação.
--
-- O QUE ISSO ESTÁ FAZENDO NA TELA HOJE
--
-- 1. A lista de inscritos da CIS-GL252 mostra cada pessoa três vezes.
-- 2. Os contadores da vw_turmas_central contam sobre esta view, então a
--    linha da turma diz "18 inscritos" onde há 6.
-- 3. A vw_turma_inscritos_resumo tem o mesmo problema, pela mesma razão.
--
-- O que NÃO está afetado: disparar_turma() lê `fato_base_alunos` com
-- `select distinct`, não passa por aqui. Ninguém recebeu mensagem em
-- triplicata.
--
-- A CORREÇÃO
--
-- `exists` responde a pergunta certa — "este curso está na grade?" — sem
-- multiplicar a linha. Uma linha por (aluno, tipo), como sempre foi a
-- intenção. As duas views que dependem daqui se corrigem junto, sem
-- precisar recriar nenhuma.
--
-- Depois de aplicar, conferir que o fator 3x sumiu:
--   select turma_id, count(*) linhas, count(distinct aluno_id) pessoas
--     from vw_turma_inscritos where tipo = 'confirmacao'
--    group by 1 having count(*) >= 2 * count(distinct aluno_id);
--   -- tem que voltar vazio.
--
-- (A consulta com `<>` no lugar do `>= 2 *` volta as 40 turmas da
--  matrícula repetida, que não é o que esta migration trata.)
-- ============================================================

create or replace view public.vw_turma_inscritos as
select t.turma_id,
       t.curso,
       t.data_inicio,
       m.aluno_id,
       coalesce(c.nome, a.nome, m.aluno_id)                        as nome,
       coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone) as telefone,
       coalesce(c.email,   nullif(m.email_cliente, ''),    a.email)    as email,
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
  from public.fato_base_alunos m
  join public.dim_turmas t on t.turma_id = m.turma
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join public.fato_contatos c on c.cpf      = lpad(m.aluno_id, 11, '0')
  left join public.dim_alunos    a on a.doc_norm = lpad(m.aluno_id, 11, '0')
  left join public.pedagogico_envios e
         on e.aluno_id = m.aluno_id
        and e.turma_id = m.turma
        and e.tipo     = tipos.tipo
 where m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   -- era `join dim_cursos ... and dc.grade_pedagogico`, que triplicava
   and exists (
     select 1 from public.dim_cursos dc
      where norm_curso(dc.nome_curso) = norm_curso(t.curso)
        and dc.grade_pedagogico
   )
   and public.pode_ver('pedagogico');

comment on view public.vw_turma_inscritos is
  'Uma linha por (aluno, tipo de mensagem) das turmas da grade pedagógica.
   O corte de grade usa `exists`, nunca `join`: dim_cursos repete o mesmo
   curso normalizado e o join multiplicava cada inscrito — CIS-GL252
   chegou a mostrar 18 pessoas onde havia 6.';

notify pgrst, 'reload schema';
