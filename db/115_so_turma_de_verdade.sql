-- ============================================================
-- 115 — SÓ TURMA DE VERDADE NA CENTRAL
--
-- APLICADO em 15/08/2026. O QUE SOBROU EXECUTÁVEL AQUI É SÓ O COMENTÁRIO
-- DA COLUNA — as outras duas partes saíram do arquivo, e a razão de cada
-- uma está registrada abaixo. Rodar este arquivo de novo é seguro.
--
-- O PROBLEMA ORIGINAL
--
-- A lista de turmas mostrava LL Networking Business, Team Coaching
-- Business, Team Coaching Life, Livrão Método CIS, Business Evolution e
-- Palestra In Company. Nenhuma delas é turma: são atendimento
-- individual, produto de livro, networking e evento corporativo. Não têm
-- credenciamento, não têm confirmação de presença, não têm grupo.
--
-- POR QUE NÃO É LISTA DE EXCLUSÃO NO CÓDIGO
--
-- A primeira ideia foi um `not in (...)` com os seis nomes. Ruim: todo
-- produto novo entraria por padrão, e alguém descobriria o problema
-- quando a Elis disparasse confirmação para uma palestra in company.
-- `dim_cursos.grade_pedagogico` já existe e já faz isso.
--
--
-- ============================================================
-- PARTE QUE SAIU 1 — o update do LIVRÃO
--
-- O arquivo trazia:
--     update dim_cursos set grade_pedagogico = false
--      where nome_curso = 'LIVRÃO MÉTODO CIS';
--
-- Foi aplicado. Mas o banco HOJE tem LIVRÃO MÉTODO CIS com
-- grade_pedagogico = TRUE — e TOUR CRESCIMENTO EMPRESARIAL também, que
-- este arquivo dava como false (é por isso que o TOUR PV, com 421
-- inscritos, aparece na Central). Ou a carga do Salesforce sobrescreveu,
-- ou a operação reverteu de propósito.
--
-- O update saiu do executável em vez de virar nota: mantido, rodar o
-- arquivo de novo desfaria silenciosamente uma decisão da operação. E a
-- decisão é dela — quais produtos entram na grade não é escolha do
-- código. Se algum dia LIVRÃO precisar sair, que seja por uma migration
-- nova, com a razão escrita, não por reexecução de arquivo antigo.
--
-- ============================================================
-- PARTE QUE SAIU 2 — o create or replace de vw_turma_inscritos
--
-- Este arquivo criou a view com:
--     join dim_cursos dc on norm_curso(...) and dc.grade_pedagogico
--
-- Esse join TRIPLICA os inscritos das 39 turmas de MÉTODO CIS GLOBAL,
-- que tem três linhas em dim_cursos colapsando no mesmo norm_curso().
-- A CIS-GL250 mostrava 246 linhas para 82 pessoas.
--
-- A definição corrigida (com `exists`) vive na **migration 118**, que é
-- a que vale. A cópia com join saiu daqui porque reexecutar este arquivo
-- depois da 118 reintroduziria o bug sem aviso.
--
-- Histórico: o mesmo padrão estava na vw_turmas_central e foi corrigido
-- lá primeiro. Quando um bug aparece numa view, vale procurar o mesmo
-- padrão nas irmãs.
-- ============================================================


comment on column dim_cursos.grade_pedagogico is
  'Curso com turma presencial de verdade: credenciamento, confirmação
   de presença, grupo de WhatsApp. É o filtro oficial da Central
   Pedagógica — falso para atendimento individual (Coaching
   Individual, Team Coaching), produtos de livro, networking e evento
   corporativo.

   ATENÇÃO: produto novo do Salesforce nasce com o default da carga.
   Se uma turma nova não aparecer na Central, é aqui que se olha.';
