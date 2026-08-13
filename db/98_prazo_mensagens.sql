-- ============================================================
-- 98 — MENSAGEM DE PRAZO VENCENDO
--
-- APLICADO. Conferido no banco em 13/08/2026. Foi rodado por blocos.
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
-- REGISTRAR O ENVIO
--
-- CORREÇÃO de uma versão anterior deste arquivo, que chamava esta
-- função de "enfileirar" e gravava status='pendente'. Estava
-- errado, e o erro importa:
--
-- `pedagogico_envios` NÃO é fila de saída. Ninguém a lê para
-- enviar. Ela é REGISTRO do que já foi feito, e existe para impedir
-- envio duplicado — o banco é recriado 3x ao dia pelo sync, e sem
-- ela a mesma pessoa receberia a mensagem toda rodada.
--
-- Quem dispara é o workflow do CRM, acionado pela tag que o script
-- aplica. A cadeia real é:
--   vw_prazo_fila_envio → script (grava campos + tag) → workflow
--   → 4zapy → aluno
--
-- Logo: o script chama esta função DEPOIS de aplicar a tag, e grava
-- 'aceito'. Gravar 'pendente' criaria uma linha que bloqueia o
-- reenvio de uma mensagem que nunca saiu.
--
-- Não existe botão de tela para isto. A tela mostra a fila e o que
-- já saiu; quem escreve é o script.
-- ------------------------------------------------------------
create or replace function registrar_envio_prazo(p_limite int default 50)
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

  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, enviado_em, criado_em)
  select f.aluno_id, f.turma_id, 'prazo', 'prazo_vencendo', 'aceito', now(), now()
    from (select * from vw_prazo_fila_envio
           order by dias_restantes limit p_limite) f;

  get diagnostics v_gravados = row_count;

  return jsonb_build_object(
    'registrados', v_gravados,
    'restantes_na_fila', (select count(*) from vw_prazo_fila_envio)
  );
end $$;

revoke execute on function registrar_envio_prazo from anon;


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
--
-- O script aplica a tag no CRM para os 10 primeiros e, só depois,
-- chama:
--   select registrar_envio_prazo(10);
--   select * from vw_prazo_envios_status;
--
-- Dez primeiro, ver o que volta, depois abrir. Fila de 51 disparada
-- de uma vez sem ninguém ter lido a mensagem em produção é como se
-- descobre erro de texto com cliente real.
-- ============================================================
