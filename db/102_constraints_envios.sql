-- ============================================================
-- 102 — CONSTRAINTS DE pedagogico_envios
--
-- Aplicado em 11/08/2026, em duas partes (uma de cada vez, conforme
-- o ETL foi esbarrando nelas).
--
-- A tabela já existia com dois checks, criados quando só havia as
-- mensagens de confirmação e de link do grupo:
--
--   tipo   aceitava apenas 'confirmacao' e 'grupo'
--   origem aceitava apenas 'venda' e 'alocacao'
--
-- As mensagens novas — boas_vindas e prazo_vencendo — batiam nos
-- dois, com erro 23514, DEPOIS de a tag já ter sido aplicada no CRM.
-- Ou seja: a pessoa recebia a mensagem e não ficava registrada, e
-- receberia de novo na execução seguinte. Aconteceu duas vezes até
-- o script passar a registrar por pessoa dentro do loop.
--
-- Os checks estavam certos em existir: foi por causa deles que dado
-- fora do vocabulário não entrou silenciosamente. O que faltava era
-- ampliar o vocabulário junto com a funcionalidade.
-- ============================================================

alter table pedagogico_envios drop constraint pedagogico_envios_tipo_check;
alter table pedagogico_envios add constraint pedagogico_envios_tipo_check
  check (tipo = any (array['confirmacao', 'grupo', 'boas_vindas', 'prazo_vencendo']));

alter table pedagogico_envios drop constraint pedagogico_envios_origem_check;
alter table pedagogico_envios add constraint pedagogico_envios_origem_check
  check (origem = any (array['venda', 'alocacao', 'prazo']));
