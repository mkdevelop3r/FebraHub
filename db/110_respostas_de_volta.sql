-- ============================================================
-- 110 — RESPOSTAS DE VOLTA
--
-- APLICADO. Conferido no banco em 13/08/2026. Foi rodado por blocos.
--
-- O BURACO
--
-- Foram 137 mensagens enviadas e `resposta` está NULA em todas.
-- As respostas existem — VITOR, Maike e Paulo responderam SIM —
-- mas vivem só no CRM, como tag. Nada volta para o banco.
--
-- Enquanto for assim, qualquer tela que a gente construa vai
-- mostrar "sem resposta" para todo mundo, inclusive para quem
-- respondeu ontem. E a Elis continua na planilha.
--
-- COMO O RETORNO FUNCIONA
--
-- O CRM é a fonte da verdade sobre a resposta: os workflows
-- aplicam uma tag de resultado em cada ramo. O script lê essas
-- tags e traduz:
--
--   pedagogico confirmado          -> sim
--   pedagogico aguardando contato  -> sim   (mesma coisa, fluxo
--                                            de prazo)
--   pedagogico nao vem             -> nao
--   pedagogico sem resposta        -> sem_resposta
--
-- Não lê o texto da conversa de propósito: interpretar "sim, mas
-- só em novembro" é trabalho de gente. O workflow já classificou.
-- ============================================================


-- ------------------------------------------------------------
-- PARTE 1 — o check precisa de dois valores a mais
--
-- Hoje só aceita 'sim' e 'nao'. Faltam:
--   sem_resposta  o timeout de 3 dias expirou
--   manual        a Elis marcou na tela — alguém ligou, respondeu
--                 pessoalmente, ou a resposta veio por outro canal.
--                 Sem isso ela volta para a planilha só para
--                 anotar as exceções, e o sistema perde a razão
--                 de existir.
-- ------------------------------------------------------------
alter table pedagogico_envios drop constraint pedagogico_envios_resposta_check;
alter table pedagogico_envios add constraint pedagogico_envios_resposta_check
  check (resposta = any (array['sim', 'nao', 'sem_resposta', 'manual']));

alter table pedagogico_envios
  add column if not exists respondido_em timestamptz,
  add column if not exists resposta_origem text;

comment on column pedagogico_envios.resposta_origem is
  'De onde veio a resposta: `crm` (tag aplicada pelo workflow) ou
   `hub` (a Elis marcou na tela). Serve para saber o que é
   automático e o que foi intervenção — e para não sobrescrever a
   marcação humana na próxima sincronia.';


-- ------------------------------------------------------------
-- PARTE 2 — o script grava o que leu do CRM
--
-- Formato:
--   [{"aluno_id":"...","turma_id":"...","tipo":"confirmacao",
--     "resposta":"sim"}, ...]
--
-- NUNCA sobrescreve resposta_origem='hub'. Se alguém ligou e a
-- Elis marcou na mão, essa informação vale mais que a tag — a
-- pessoa pode nunca ter respondido no WhatsApp.
-- ------------------------------------------------------------
create or replace function registrar_respostas(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) is distinct from 'service_role'
     and not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  update pedagogico_envios e
     set resposta        = i->>'resposta',
         respondido_em   = coalesce(e.respondido_em, now()),
         resposta_origem = 'crm'
    from jsonb_array_elements(p_itens) i
   where e.aluno_id = i->>'aluno_id'
     and e.turma_id = i->>'turma_id'
     and e.tipo     = i->>'tipo'
     and e.status   = 'aceito'
     and coalesce(e.resposta_origem, '') <> 'hub'   -- humano tem prioridade
     and e.resposta is distinct from i->>'resposta';

  get diagnostics v_n = row_count;
  return jsonb_build_object('atualizados', v_n);
end $$;

revoke execute on function registrar_respostas from anon;


-- ------------------------------------------------------------
-- PARTE 3 — a Elis marca na tela
--
-- Sempre vai existir quem responde por telefone, no corredor, ou
-- para a consultora. Sem um jeito de registrar isso, a planilha
-- volta pela porta dos fundos.
-- ------------------------------------------------------------
create or replace function marcar_resposta(
  p_aluno_id text,
  p_turma_id text,
  p_tipo     text,
  p_resposta text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  if p_resposta not in ('sim', 'nao', 'sem_resposta') then
    raise exception 'Resposta inválida: use sim, nao ou sem_resposta';
  end if;

  update pedagogico_envios
     set resposta        = p_resposta,
         respondido_em   = now(),
         resposta_origem = 'hub'
   where aluno_id = p_aluno_id
     and turma_id = p_turma_id
     and tipo     = p_tipo;

  if not found then
    raise exception 'Envio não encontrado';
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function marcar_resposta from anon;


-- ------------------------------------------------------------
-- PARTE 4 — quem o script precisa consultar no CRM
--
-- Só quem já recebeu e ainda não tem resposta. Sem isso o script
-- consultaria 137 contatos a cada rodada, três vezes ao dia.
-- ------------------------------------------------------------
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
     where x.aluno_id = e.aluno_id and x.turma = e.turma_id
       and x.status_matricula = 'Aprovada'
     order by x.data_matricula desc limit 1
  ) m on true
 where e.status = 'aceito'
   and e.resposta is null
   and e.tipo in ('confirmacao', 'prazo_vencendo')
   and e.enviado_em > now() - interval '30 days';

comment on view vw_respostas_pendentes is
  'Enviados sem resposta registrada, últimos 30 dias. O script busca
   esses contatos no CRM e lê as tags de resultado. Boas-vindas fica
   de fora: aquela mensagem não pede resposta.';

grant select on vw_respostas_pendentes to authenticated;


-- ------------------------------------------------------------
-- PARTE 5 — a tela da turma
--
-- É o que substitui a planilha da Elis.
-- ------------------------------------------------------------
create or replace view vw_turma_status as
select e.turma_id,
       t.curso,
       t.data_inicio,
       e.aluno_id,
       coalesce(a.nome, e.aluno_id)   as nome,
       coalesce(nullif(m.telefone_cliente, ''), a.telefone) as telefone,
       e.tipo,
       e.status,
       e.enviado_em,
       e.resposta,
       e.respondido_em,
       e.resposta_origem,
       case
         when e.status = 'pendente'          then 'aguardando envio'
         when e.status = 'erro'              then 'erro no envio'
         when e.resposta = 'sim'             then 'confirmado'
         when e.resposta = 'nao'             then 'nao vem'
         when e.resposta = 'sem_resposta'    then 'sem resposta'
         when e.resposta = 'manual'          then 'registrado na mao'
         else 'aguardando resposta'
       end as situacao
  from pedagogico_envios e
  join dim_turmas t on t.turma_id = e.turma_id
  left join dim_alunos a on a.doc_norm = lpad(e.aluno_id, 11, '0')
  left join lateral (
    select telefone_cliente
      from fato_base_alunos x
     where x.aluno_id = e.aluno_id and x.turma = e.turma_id
       and x.status_matricula = 'Aprovada'
     order by x.data_matricula desc limit 1
  ) m on true
 where e.tipo in ('confirmacao', 'grupo')
   and pode_ver('pedagogico');

create or replace view vw_turma_resumo as
select turma_id, curso, data_inicio, tipo,
       count(*)                                          as total,
       count(*) filter (where situacao = 'confirmado')     as confirmados,
       count(*) filter (where situacao = 'nao vem')        as nao_vem,
       count(*) filter (where situacao = 'sem resposta')   as sem_resposta,
       count(*) filter (where situacao = 'aguardando resposta') as aguardando,
       count(*) filter (where situacao = 'aguardando envio')    as nao_enviados
  from vw_turma_status
 group by turma_id, curso, data_inicio, tipo;

grant select on vw_turma_status, vw_turma_resumo to authenticated;


-- ============================================================
-- O QUE FALTA DEPOIS DISTO
--
-- 1. O script precisa de um passo novo: ler vw_respostas_pendentes,
--    buscar cada contato no CRM, traduzir as tags e chamar
--    registrar_respostas().
--
-- 2. A tela da turma no hub novo, lendo vw_turma_resumo e
--    vw_turma_status, com botão chamando marcar_resposta().
--
-- 3. As 137 mensagens já enviadas não têm resposta registrada. Na
--    primeira execução do passo novo, elas serão preenchidas de uma
--    vez — inclusive as de quem respondeu na terça.
-- ============================================================
