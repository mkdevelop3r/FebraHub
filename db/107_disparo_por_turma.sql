-- ============================================================
-- 107 — DISPARO POR TURMA
--
-- APLICADO. Conferido no banco em 13/08/2026. Foi rodado por blocos.
--
-- O botão "Salvar turma" passa a disparar as mensagens da turma.
-- Hoje isso depende do script rodando no sync, e a Elis não tem
-- controle sobre quando sai.
--
-- DUAS MENSAGENS, DOIS MOMENTOS
--
-- Elas não saem juntas de propósito. A confirmação diz "em breve
-- enviaremos o link do grupo" — se as duas chegassem no mesmo
-- minuto, a promessa ficaria estranha.
--
--   confirmacao  precisa de credenciamento, início e fim
--                NÃO precisa de local: o texto já diz que o
--                endereço vem depois, na descrição do grupo
--
--   grupo        precisa só do link
--                sai quando a Elis criar o grupo, dias depois
--
-- Na prática: ela salva com os horários e a confirmação sai. Dias
-- depois cola o link e salva de novo, e aí sai o grupo.
--
-- QUEM RECEBE O LINK DO GRUPO
--
-- Todos os matriculados, MENOS quem tem a tag de recusa.
--
-- Não só quem respondeu SIM: a maioria não responde WhatsApp de
-- empresa, e não responder não é dizer que não vem. Excluir essa
-- gente faria ela chegar no dia sem saber o endereço. E o grupo
-- funciona como segundo convite — quem entra e vê o endereço
-- acaba confirmando por ali.
--
-- Mas quem escreveu "não" se deu ao trabalho de avisar. Mandar o
-- link depois disso é desatenção.
--
-- O BOTÃO NÃO CHAMA O CRM
--
-- Ele enfileira; o script do sync aplica as tags. Dois motivos: o
-- front não deve carregar token de CRM, e uma falha de rede no meio
-- de uma turma de 300 pessoas deixaria metade sem mensagem e sem
-- registro. Enfileirar é atômico.
--
-- Custo: a Elis salva às 10h e o disparo sai às 12h15, na rodada
-- seguinte. Se precisar ser imediato, aí é Edge Function com o
-- token do lado do servidor — outro projeto.
-- ============================================================


-- ------------------------------------------------------------
-- pedagogico_envios ganha 'pendente' como status válido
--
-- Até aqui a tabela era só registro do que já saiu. Agora ela
-- também guarda intenção: o botão grava 'pendente', o script troca
-- para 'aceito' depois de aplicar a tag.
--
-- É a diferença entre esta fila e as de boas-vindas/prazo, que são
-- views calculadas. Aqui quem decide o momento é a Elis, e essa
-- decisão precisa ficar registrada em algum lugar.
-- ------------------------------------------------------------
alter table pedagogico_envios drop constraint if exists pedagogico_envios_status_check;
alter table pedagogico_envios add constraint pedagogico_envios_status_check
  check (status = any (array['pendente', 'aceito', 'erro']));


-- ------------------------------------------------------------
-- disparar_turma
--
-- Chamada pelo botão. Devolve o que enfileirou e o que faltou,
-- para a tela dizer à Elis exatamente o que aconteceu.
-- ------------------------------------------------------------
create or replace function disparar_turma(
  p_turma_id text,
  p_tipo     text        -- 'confirmacao' ou 'grupo'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t          dim_turmas;
  v_faltando   text[] := '{}';
  v_enfileirados int;
  v_sem_contato  int;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  if p_tipo not in ('confirmacao', 'grupo') then
    raise exception 'Tipo inválido: use confirmacao ou grupo';
  end if;

  select * into v_t from dim_turmas where turma_id = p_turma_id;
  if not found then
    raise exception 'Turma não encontrada';
  end if;

  -- ---------- o que cada mensagem exige ----------
  if p_tipo = 'confirmacao' then
    if coalesce(v_t.horario_credenciamento, '') = '' then
      v_faltando := v_faltando || 'credenciamento';
    end if;
    if coalesce(v_t.horario_inicio, '') = '' then
      v_faltando := v_faltando || 'horário de início';
    end if;
    if coalesce(v_t.horario_fim, '') = '' then
      v_faltando := v_faltando || 'horário de fim';
    end if;
  else
    if coalesce(v_t.link_grupo, '') !~ '^https://chat\.whatsapp\.com/' then
      v_faltando := v_faltando || 'link do grupo';
    end if;
  end if;

  if array_length(v_faltando, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'faltando', v_faltando,
      'mensagem', 'Preencha antes: ' || array_to_string(v_faltando, ', ')
    );
  end if;

  -- ---------- quem entra ----------
  with elegivel as (
    select distinct m.aluno_id
      from fato_base_alunos m
     where m.turma = p_turma_id
       and m.status_matricula = 'Aprovada'
       and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
       -- já recebeu esta mensagem para esta turma
       and not exists (
         select 1 from pedagogico_envios e
          where e.aluno_id = m.aluno_id
            and e.turma_id = p_turma_id
            and e.tipo = p_tipo
       )
       -- quem disse que não vem não recebe o link do grupo
       and not (p_tipo = 'grupo' and exists (
         select 1 from pedagogico_envios e
          where e.aluno_id = m.aluno_id
            and e.turma_id = p_turma_id
            and e.tipo = 'confirmacao'
            and (e.resposta ilike 'n%o%' and e.resposta not ilike '%sim%')
       ))
  )
  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, criado_em)
  select aluno_id, p_turma_id, 'alocacao', p_tipo, 'pendente', now()
    from elegivel;

  get diagnostics v_enfileirados = row_count;

  -- quantos desses não têm como ser contatados — a tela precisa dizer
  select count(*) into v_sem_contato
    from pedagogico_envios e
    left join dim_alunos a on a.doc_norm = lpad(e.aluno_id, 11, '0')
   where e.turma_id = p_turma_id
     and e.tipo = p_tipo
     and e.status = 'pendente'
     and coalesce(a.telefone, '') = ''
     and coalesce(a.email, '') = '';

  return jsonb_build_object(
    'ok', true,
    'enfileirados', v_enfileirados,
    'sem_contato',  v_sem_contato,
    'mensagem', case
      when v_enfileirados = 0 then 'Todos já receberam esta mensagem.'
      else v_enfileirados || ' pessoas entram na próxima rodada de envio.'
    end
  );
end $$;

revoke execute on function disparar_turma from anon;


-- ------------------------------------------------------------
-- A fila que o script vai ler
--
-- Junta o pendente com o contato e com os campos da turma que os
-- templates usam.
-- ------------------------------------------------------------
create or replace view vw_turma_fila_envio as
select e.aluno_id,
       e.tipo,
       a.nome,
       normaliza_telefone(a.telefone)         as whatsapp,
       a.email,
       t.turma_id,
       t.curso,
       t.data_inicio,
       t.data_fim,
       t.horario_credenciamento,
       t.horario_inicio,
       t.horario_fim,
       t.local,
       t.link_grupo,
       case when normaliza_telefone(a.telefone) is not null then 'whatsapp'
            when coalesce(a.email, '') <> ''                then 'email'
       end as canal
  from pedagogico_envios e
  join dim_turmas t  on t.turma_id = e.turma_id
  left join dim_alunos a on a.doc_norm = lpad(e.aluno_id, 11, '0')
 where e.status = 'pendente'
   and e.tipo in ('confirmacao', 'grupo')
   and coalesce(a.telefone, a.email) is not null;

comment on view vw_turma_fila_envio is
  'Pendentes de confirmação e link do grupo, com contato resolvido.
   Junta por doc_norm, que cobre CPF e CNPJ — cpf_norm só aceita 11
   dígitos e deixaria venda PJ de fora.';


-- ------------------------------------------------------------
-- O script marca como enviado depois de aplicar a tag
-- ------------------------------------------------------------
create or replace function registrar_envio_turma(p_itens jsonb)
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
     set status = 'aceito',
         enviado_em = now(),
         canal = coalesce(i->>'canal', e.canal)
    from jsonb_array_elements(p_itens) i
   where e.aluno_id = i->>'aluno_id'
     and e.turma_id = i->>'turma_id'
     and e.tipo     = i->>'tipo'
     and e.status   = 'pendente';

  get diagnostics v_n = row_count;
  return jsonb_build_object('registrados', v_n);
end $$;

revoke execute on function registrar_envio_turma from anon;


-- ------------------------------------------------------------
-- Painel da turma, para a tela
-- ------------------------------------------------------------
create or replace view vw_turma_envios as
select e.turma_id,
       e.tipo,
       count(*)                                            as total,
       count(*) filter (where e.status = 'pendente')        as aguardando,
       count(*) filter (where e.status = 'aceito')          as enviados,
       count(e.resposta)                                    as responderam,
       count(*) filter (where e.resposta ilike 'sim%')      as confirmaram,
       max(e.enviado_em)                                    as ultimo_envio
  from pedagogico_envios e
 where e.tipo in ('confirmacao', 'grupo')
   and pode_ver('pedagogico')
 group by e.turma_id, e.tipo;

grant select on vw_turma_fila_envio, vw_turma_envios to authenticated;


-- ============================================================
-- COMO A TELA USA
--
--   select disparar_turma('2026 - FCIS37', 'confirmacao');
--   select disparar_turma('2026 - FCIS37', 'grupo');
--
-- A função devolve `ok: false` com a lista do que falta preencher,
-- em vez de disparar mensagem truncada. Mostrar `mensagem` direto
-- na tela.
--
-- O botão diz "Enviar confirmação" e produz "42 pessoas entram na
-- próxima rodada de envio" — não "mensagens enviadas", porque o
-- envio é do script, na rodada seguinte.
-- ============================================================
