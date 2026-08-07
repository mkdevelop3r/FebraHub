-- ============================================================
-- 98 — MENSAGEM DE PRAZO VENCENDO
--
-- NÃO APLICADO. Rodar por blocos.
-- Depende de 95, 96 e 97.
--
-- Não cria tabela. `pedagogico_envios` já é uma fila de mensagem
-- por aluno × turma, com tipo, canal, status, tentativas, erro_msg
-- e resposta. Isto acrescenta um `tipo` novo à máquina que já
-- existe — a mesma que entrega o link do grupo.
--
-- Convenção seguida do que já está lá:
--   tipo='confirmacao' · origem='venda' · canal='whatsapp'
--   status em ('aceito','erro')
--
-- REGRA DE OURO DESTE ARQUIVO: só entra na fila quem tem para
-- onde ir.
--
-- 51 pessoas estão vencendo COM turma disponível — essas recebem.
-- 66 estão sem turma dentro do prazo, 29 delas vencendo em 30
-- dias — essas NÃO recebem. Mandar "seu prazo está vencendo" para
-- quem não tem turma para onde ir cria um problema em vez de
-- resolver: a pessoa responde SIM e não há o que oferecer.
--
-- Esse grupo é decisão de calendário (abrir turma) ou conversa
-- individual sobre isenção da taxa. Aparece na tela da Elis como
-- alerta, nunca como mensagem automática.
-- ============================================================


-- ------------------------------------------------------------
-- QUEM DEVE RECEBER
--
-- Quatro condições, todas necessárias:
--   a) está vencendo (< 90 dias) — não 'sem turma no prazo'
--   b) tem telefone
--   c) existe turma antes do vencimento
--   d) ainda não recebeu esta mensagem para este curso
-- ------------------------------------------------------------
create or replace view vw_prazo_fila_envio as
select p.cpf              as aluno_id,
       p.nome,
       p.telefone,
       p.curso,
       p.vence_em,
       p.dias_restantes,
       p.proxima_turma    as turma_id,
       p.proxima_turma_em,
       p.ja_transferiu
  from vw_pedagogico_prazo_salvador p
 where p.situacao = 'vencendo'
   and p.telefone is not null
   and p.proxima_turma is not null
   and p.proxima_turma_em <= p.vence_em
   and not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = p.cpf
        and e.turma_id = p.proxima_turma
        and e.tipo = 'prazo_vencendo'
   );

comment on view vw_prazo_fila_envio is
  'Quem recebe a mensagem de prazo. `turma_id` é a PRÓXIMA turma
   oferecida, não a turma da venda — a turma da venda é ficção
   comercial e não serve para nada aqui. Quem está em "sem turma
   no prazo" fica fora de propósito: não há o que oferecer.';


-- ------------------------------------------------------------
-- ENFILEIRAR
--
-- Não envia nada. Só grava a intenção em pedagogico_envios, no
-- mesmo padrão do link do grupo, para o disparador existente
-- consumir.
--
-- `p_limite` existe para a primeira rodada não ir com 51 de uma
-- vez. Mandar dez, ver o que volta, depois abrir.
-- ------------------------------------------------------------
create or replace function enfileirar_prazo_vencendo(p_limite int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gravados int;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, criado_em)
  select f.aluno_id, f.turma_id, 'prazo', 'prazo_vencendo', 'pendente', now()
    from (select * from vw_prazo_fila_envio
           order by dias_restantes limit p_limite) f;

  get diagnostics v_gravados = row_count;

  return jsonb_build_object(
    'enfileirados', v_gravados,
    'restantes_na_fila', (select count(*) from vw_prazo_fila_envio)
  );
end $$;

revoke execute on function enfileirar_prazo_vencendo from anon;


-- ------------------------------------------------------------
-- ACOMPANHAMENTO
-- ------------------------------------------------------------
create or replace view vw_prazo_envios_status as
select e.status,
       count(*)                          as envios,
       count(e.resposta)                 as responderam,
       count(*) filter (where e.resposta ilike 'sim%') as disseram_sim,
       count(*) filter (where e.resposta ilike 'nao%'
                           or e.resposta ilike 'não%') as disseram_nao,
       max(e.enviado_em)::date           as ultimo_envio
  from pedagogico_envios e
 where e.tipo = 'prazo_vencendo'
   and pode_ver('pedagogico')
 group by e.status;

grant select on vw_prazo_fila_envio, vw_prazo_envios_status to authenticated;


-- ============================================================
-- O TEXTO DA MENSAGEM — decisão de produto, fica registrada aqui
--
-- Sugestão, para quem está VENCENDO e TEM turma:
--
--   Olá, [nome]! Você garantiu sua vaga no [curso] e ela vale até
--   [vence_em]. A próxima turma começa em [proxima_turma_em].
--   Responda SIM que a gente reserva seu lugar, ou NÃO para
--   falarmos sobre outra data.
--
-- O que a mensagem NÃO diz, de propósito:
--
--   "Você faltou" — não é verificável. Em vários cursos só existe
--   registro do Dia 1, e o CIS Global nem registra o Dia 2.
--   Afirmar falta com base nisso vira falso positivo.
--
--   "Estamos te transferindo" — o sistema não transfere ninguém.
--   Afirmar o que não se fez é a forma mais rápida de perder a
--   confiança do cliente e da Elis ao mesmo tempo.
--
--   O valor pago — a linha do aluno é CONSUMIDOR DE VAGAS e vale
--   zero por construção; quem pagou foi o comprador das vagas.
-- ============================================================


-- ============================================================
-- COMO RODAR A PRIMEIRA VEZ
--
--   select * from vw_prazo_fila_envio order by dias_restantes;
--   select enfileirar_prazo_vencendo(10);   -- dez primeiro
--   select * from vw_prazo_envios_status;
--
-- Dez, ver o que volta, depois abrir. Fila de 51 disparada de uma
-- vez sem ninguém ter lido a mensagem em produção é como se
-- descobre erro de texto com cliente real.
-- ============================================================
