-- ============================================================
-- 112 — FILA DE RESPOSTAS: SÓ QUEM DÁ PARA CONSULTAR
--
-- Aplicado em 13/08/2026.
--
-- PROBLEMA
--
-- O passo de leitura de respostas consultava o CRM para 84 pessoas
-- e o log dizia:
--
--   respostas: 3 gravadas, 38 ainda sem resultado, 46 não achados
--
-- Os 46 "não achados" pareciam falha de busca. Não eram: 42 dessas
-- pessoas não têm telefone NEM e-mail em lugar nenhum — nem em
-- dim_alunos, nem na matrícula. Sem chave de busca, o CRM não tem
-- como devolver nada.
--
-- Elas receberam a mensagem em algum momento, quando havia contato,
-- ou entraram por outro caminho. Não é bug, mas custava 46 chamadas
-- por rodada, três vezes ao dia, e enchia o log de linha vermelha
-- que não era problema — o tipo de ruído que faz parar de ler o log.
--
-- DUAS CORREÇÕES
--
-- 1. Exige contato: quem não tem telefone nem e-mail sai da fila.
--    De 84 para 50 consultáveis.
--
-- 2. Inclui 'convite'. A view foi escrita no 108, antes de a fila
--    de convite existir (111) — então nenhum convite teria a
--    resposta lida de volta.
-- ============================================================

create or replace view vw_respostas_pendentes as
select e.aluno_id,
       e.turma_id,
       e.tipo,
       e.enviado_em,
       normaliza_telefone(coalesce(nullif(m.telefone_cliente, ''), a.telefone)) as telefone,
       coalesce(nullif(m.email_cliente, ''), a.email) as email
  from pedagogico_envios e
  left join dim_alunos a on a.doc_norm = lpad(e.aluno_id, 11, '0')
  left join lateral (
    select telefone_cliente, email_cliente
      from fato_base_alunos x
     where x.aluno_id = e.aluno_id
       and x.turma = e.turma_id
       and x.status_matricula = 'Aprovada'
     order by x.data_matricula desc
     limit 1
  ) m on true
 where e.status = 'aceito'
   and e.resposta is null
   and e.tipo in ('confirmacao', 'prazo_vencendo', 'convite')
   and e.enviado_em > now() - interval '30 days'
   and coalesce(
         normaliza_telefone(coalesce(nullif(m.telefone_cliente, ''), a.telefone)),
         nullif(m.email_cliente, ''),
         a.email
       ) is not null;

comment on view vw_respostas_pendentes is
  'Quem recebeu, ainda não tem resposta registrada, e TEM como ser
   encontrado no CRM. Boas-vindas fica de fora: aquela mensagem não
   pede resposta. A janela de 30 dias evita reconsultar histórico
   antigo a cada rodada.';
