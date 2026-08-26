-- ============================================================
-- 152_auditoria_prova_lista.sql — como chegar até uma prova
--
-- A migration da prova criou `fato_auditoria_etapa`,
-- `fato_auditoria_transcricao` e `vw_auditoria_prova`. Faltavam duas
-- coisas para existir interface:
--
--   1. NÃO HÁ COMO LISTAR AUDITORIAS. O hub mostra só agregados — KPI,
--      gaps, placar por consultora — e nenhuma tela leva a uma conversa
--      específica. Sem lista, a prova é inalcançável.
--
--   2. O CABEÇALHO DA DEVOLUTIVA PEDE CAMPOS QUE A VIEW NÃO TRAZ.
--      `vw_auditoria_prova` entrega consultora, contato, canal, score e as
--      etapas — mas não `faixa`, `tipo_atendimento`, `etapas_cumpridas`
--      nem `etapas_avaliadas`, que estão em `fato_auditoria`.
--
-- POR QUE ACRESCENTAR VIEWS EM VEZ DE ALTERAR A QUE EXISTE
-- --------------------------------------------------------
-- O rodapé da migration da prova avisa: "alteração de forma de view
-- derruba o where pode_ver(). Se recriar vw_auditoria_prova, reponha o
-- gate." Recriar para acrescentar colunas é justamente esse risco, e o
-- prêmio seria pequeno. As duas views novas nascem com o gate e a de
-- prova fica intocada.
--
-- E RESOLVE UM DESPERDÍCIO: `vw_auditoria_prova` carrega
-- `conversa_completa` em CADA linha de etapa. São 10 etapas por auditoria
-- e conversas de até 10.632 caracteres — a mesma transcrição viajaria dez
-- vezes só para desenhar a lista de etapas. `vw_auditoria_conversa`
-- entrega uma vez, e só quando alguém expandir.
--
-- DADO PESSOAL
-- ------------
-- As duas repetem `pode_ver('auditoria')` no `where`. A transcrição tem
-- nome do lead e o que ele falou; o gate não é formalidade. View não
-- aceita policy de RLS — o gate mora no `where` e some se alguém recriar
-- sem ele.
-- ============================================================

-- ---------- 1. lista: uma linha por auditoria ----------
create or replace view vw_auditoria_lista as
select
  a.auditoria_id,
  a.data_ref,
  a.canal,
  a.consultora,
  a.contato,
  a.score,
  a.faixa,
  a.tipo_atendimento,
  a.tipo_justificativa,
  a.etapas_cumpridas,
  a.etapas_avaliadas,
  a.msgs_humanas,
  a.audios_usados,
  a.temperatura_lead,
  a.conclusao,
  -- Auditoria anterior à implantação da prova não tem transcrição
  -- gravada. A tela precisa saber ANTES de abrir, para explicar em vez de
  -- mostrar um painel vazio sem motivo.
  (t.auditoria_id is not null) as tem_prova,
  t.caracteres                 as conversa_caracteres
from fato_auditoria a
left join fato_auditoria_transcricao t on t.auditoria_id = a.auditoria_id
where pode_ver('auditoria');

comment on view vw_auditoria_lista is
  'Uma linha por auditoria, para a lista do hub. `tem_prova` diz se existe transcricao gravada. Gate pode_ver(auditoria) no where.';

grant select on vw_auditoria_lista to authenticated;

-- ---------- 2. a conversa, uma vez só ----------
create or replace view vw_auditoria_conversa as
select
  t.auditoria_id,
  t.canal,
  t.texto,
  t.audios,
  t.caracteres,
  t.montado_em
from fato_auditoria_transcricao t
where pode_ver('auditoria');

comment on view vw_auditoria_conversa is
  'Transcricao completa de UMA auditoria, sem repetir por etapa. Gate pode_ver(auditoria) no where.';

grant select on vw_auditoria_conversa to authenticated;

-- ---------- conferência ----------
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<id com setor auditoria>","role":"authenticated"}';
--   select count(*) from vw_auditoria_lista;      -- 12 hoje
--   select count(*) from vw_auditoria_conversa;   -- 12 hoje
-- Quem não tem o setor tem que ver ZERO linhas nas duas, sem erro.
