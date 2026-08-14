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
-- SEGUNDA CAUSA: A MATRÍCULA REPETIDA
--
-- `exists` mata o leque do join, não a matrícula repetida. Em
-- fato_base_alunos há 1.990 pares (aluno, turma) com mais de uma
-- matrícula aprovada, em 232 turmas — um deles com 100 linhas para a
-- mesma pessoa na mesma turma.
--
-- A maior parte não chega aqui: 1.788 dessas linhas são COMPRADOR DE
-- VAGAS e 79 são BÔNUS - COMPRADOR DE VAGAS, e o WHERE já exclui os
-- dois. Quem compra 40 vagas gera 40 linhas, e nenhuma delas é aluno.
--
-- O que sobra depois do filtro é real e é aluno: 1.630 CONSUMIDOR DE
-- VAGAS, 395 Matrícula, 224 Bônus.
--
-- E aí a leitura certa é UMA pessoa, não duas. Esta view alimenta a tela
-- de confirmação: a mensagem é uma só, então não importa qual das duas
-- matrículas "manda". A prova está no comportamento que já existe —
-- disparar_turma() usa `select distinct m.aluno_id` desde sempre, e
-- ninguém recebeu mensagem repetida. A view é que estava contando
-- diferente da função que dispara.
--
-- Seria decisão de operação se as duas matrículas significassem duas
-- vagas de verdade. Não significam.
--
-- `distinct on (aluno_id, turma, tipo)` ordenado pela matrícula mais
-- recente. De quebra, cobre a única linha duplicada de dim_alunos por
-- doc_norm — conferido: fato_contatos não tem CPF repetido e
-- pedagogico_envios não tem (aluno, turma, tipo) repetido, então essas
-- duas junções não multiplicam.
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
-- VARREDURA NAS IRMÃS (15/08/2026)
--
-- O padrão apareceu em duas views, então procurei em todas. Cinco usam
-- norm_curso() numa junção:
--
--   vw_turmas_central     dim_cursos   JÁ corrigida (exists)
--   vw_turma_inscritos    dim_cursos   é esta aqui
--   vw_boas_vindas_fila   fato_presenca  norm_curso só dentro de NOT
--                                      EXISTS — não multiplica
--   vw_matricula_presenca fato_credenciamento  LATERAL com group by —
--                                      devolve 1 linha
--   vw_pedagogico_prazo   cursos_com_registro / dim_turmas  o join é
--                                      seguido de group by, e
--                                      proxima_turma agrega por
--                                      norm_curso — absorve
--
-- Só as duas de dim_cursos multiplicavam. As outras três estão limpas.
--
-- A CORREÇÃO
--
-- `exists` responde a pergunta certa — "este curso está na grade?" — sem
-- multiplicar a linha. Uma linha por (aluno, tipo), como sempre foi a
-- intenção. As duas views que dependem daqui se corrigem junto, sem
-- precisar recriar nenhuma.
--
-- Depois de aplicar, uma linha por pessoa em TODA turma:
--   select turma_id, count(*) linhas, count(distinct aluno_id) pessoas
--     from vw_turma_inscritos where tipo = 'confirmacao'
--    group by 1 having count(*) <> count(distinct aluno_id);
--   -- tem que voltar vazio.
--
-- E os contadores da vw_turmas_central passam a bater com a realidade
-- sozinhos: ela conta sobre esta view.
-- ============================================================

create or replace view public.vw_turma_inscritos as
select distinct on (m.aluno_id, m.turma, tipos.tipo)
       t.turma_id,
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
   and public.pode_ver('pedagogico')
 -- O ORDER BY é obrigatório para o DISTINCT ON e precisa começar pelas
 -- mesmas expressões. `data_matricula desc` escolhe a matrícula mais
 -- recente; `nulls last` evita que uma linha sem data ganhe a disputa.
 order by m.aluno_id, m.turma, tipos.tipo, m.data_matricula desc nulls last;

comment on view public.vw_turma_inscritos is
  'UMA linha por (aluno, turma, tipo de mensagem) das turmas da grade
   pedagógica. Duas defesas contra contar a mesma pessoa duas vezes:
   (1) o corte de grade usa `exists`, nunca `join` — dim_cursos repete o
   mesmo curso normalizado e o join triplicava os inscritos das 39 turmas
   de MÉTODO CIS GLOBAL; (2) `distinct on` resolve a matrícula repetida
   na mesma turma (1.630 CONSUMIDOR DE VAGAS, 395 Matrícula, 224 Bônus),
   que é uma pessoa só para quem vai receber a mensagem — mesma leitura
   que disparar_turma() já fazia com `select distinct`.';

notify pgrst, 'reload schema';
