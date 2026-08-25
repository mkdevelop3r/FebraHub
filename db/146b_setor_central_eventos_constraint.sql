-- ============================================================
-- 146b_setor_central_eventos_constraint.sql — o setor novo passa a existir
--
-- A 146 abriu as policies para `central-eventos`, mas gravar o setor no
-- perfil falhava: `perfis.setor` tem CHECK com lista fechada, e o valor
-- novo não estava nela.
--
-- DUAS RESTRIÇÕES PARA A MESMA COLUNA
-- ------------------------------------
-- Havia duas, com listas DIFERENTES, e ambas precisavam passar:
--
--   chk_perfis_setor   geral, financeiro, comercial, marketing,
--                      pedagogico, loja, eventos, estoque
--   perfis_setor_check geral, financeiro, marketing, comercial,
--                      pedagogico, loja
--
-- Na prática valia a interseção, e `eventos` e `estoque` eram letra morta:
-- a primeira lista os aceita, a segunda recusa. Quem fosse acrescentar um
-- setor corrigiria a que o erro apontou e continuaria falhando pela outra
-- — foi o que aconteceu comigo aqui.
--
-- Fica UMA, com a lista real mais `central-eventos`. `eventos` e
-- `estoque` entram porque são hubs de verdade no HUBS do front; se nunca
-- forem usados como setor de alguém, não custam nada, e o custo de
-- descobrir isso na hora de cadastrar é maior.
--
-- MESMO DEFEITO EM `papel`, NÃO CORRIGIDO AQUI
-- ---------------------------------------------
--   chk_perfis_papel   admin, gestor, membro
--   perfis_papel_check admin, membro
--
-- Ou seja, `papel = 'gestor'` é impossível hoje: a primeira lista promete
-- e a segunda recusa. Não mexi porque não faz parte deste pedido e porque
-- decidir se 'gestor' deve existir é do produto, não da migration. Fica
-- registrado para quem for tratar.
-- ============================================================

alter table perfis drop constraint if exists perfis_setor_check;
alter table perfis drop constraint if exists chk_perfis_setor;

alter table perfis add constraint chk_perfis_setor check (
  setor = any (array[
    'geral', 'financeiro', 'comercial', 'marketing',
    'pedagogico', 'loja', 'eventos', 'estoque',
    'central-eventos'          -- opera evento sem ver lead/campanha (146)
  ])
);

-- ---------- conferência ----------
-- Nenhuma linha existente pode violar a lista nova:
--   select setor, count(*) from perfis group by setor;
