-- ============================================================
-- 142_agendamento_da_postagem.sql — "programada para quando?"
--
-- Pedido do Louis em 20/08/2026: quando a Daniele marcar "Postagem
-- programada", a tela pede para quando a postagem está programada.
--
-- Hoje o check é um booleano: a ação vira concluída e o dia e a hora da
-- publicação não existem em lugar nenhum. Quem olha a Central sabe que
-- alguém programou algo, e nada além disso.
--
-- POR QUE UMA FLAG NO TEMPLATE, E NÃO UM `if nome = 'Postagem programada'`
-- ------------------------------------------------------------------------
-- "Postagem programada" existe em CINCO tipos (Palestra, Workshop,
-- Treinamento, Live e Evento), cada um com prazo próprio. Amanhã pode
-- aparecer uma sexta, ou outra ação que também precise de horário — o
-- disparo de WhatsApp é a candidata óbvia. Comparar string dentro da
-- função amarraria a regra ao texto: mudar "Postagem programada" para
-- "Postagem agendada" quebraria em silêncio.
--
-- `pede_agendamento` é a resposta: liga por linha de catálogo, e ligar
-- para o disparo de WhatsApp um dia é um UPDATE.
--
-- POR QUE A COLUNA APARECE NAS DUAS TABELAS
-- ------------------------------------------
-- `mkt_acoes_evento` copia do template no momento em que o checklist
-- nasce, como já faz com `conclusao` e `fonte_automacao`. É o padrão da
-- casa, e aqui evita um problema conhecido: ler a flag por embedding
-- exigiria policy de leitura em `mkt_templates_acao`, e a Central já se
-- queimou com isso — `mkt_tipos_evento` tinha RLS ligada sem policy
-- nenhuma e devolvia zero linhas para todo mundo (ver a 127).
--
-- O BANCO NÃO OBRIGA. É DE PROPÓSITO.
-- ------------------------------------
-- `p_agendado_para` entra como terceiro argumento OPCIONAL. Se fosse
-- obrigatório, o front publicado hoje — que chama a função com dois
-- argumentos — pararia de marcar essas 26 ações no instante em que esta
-- migration subisse, e ficaria assim até o deploy do front novo. Quem
-- exige o preenchimento é a tela.
--
-- Quando o front novo estiver publicado e estável, dá para apertar: um
-- `check` recusando `concluida and pede_agendamento and agendado_para is
-- null`. Não fiz agora porque as 8 ações JÁ concluídas violariam na hora.
--
-- CUIDADO COM A ASSINATURA
-- -------------------------
-- A versão de dois argumentos é DERRUBADA antes de criar a de três. Criar
-- a nova ao lado da velha deixaria a chamada com dois argumentos ambígua
-- — *42725 function is not unique* — que é exatamente o que quebrou o
-- `mkt_sincroniza_trafego` entre as migrations 130 e 131. Uma função com
-- default cobre as chamadas de dois e de três argumentos; duas funções
-- não cobrem nenhuma.
-- ============================================================

-- ---------- 1. colunas ----------
alter table mkt_templates_acao
  add column if not exists pede_agendamento boolean not null default false;

alter table mkt_acoes_evento
  add column if not exists pede_agendamento boolean not null default false,
  add column if not exists agendado_para    timestamptz;

comment on column mkt_acoes_evento.agendado_para is
  'Data e hora para a qual a postagem foi programada. Só faz sentido quando pede_agendamento.';

-- ---------- 2. quem pede agendamento ----------
update mkt_templates_acao
   set pede_agendamento = true
 where nome ilike 'Postagem programada%';

-- Retroativo nas ações que já existem, inclusive nas 8 concluídas: a flag
-- diz "esta ação PEDE horário", não "esta ação TEM horário". As já
-- concluídas seguem sem data, e está certo — ninguém vai reconstituir de
-- memória para quando programou uma postagem de agosto.
update mkt_acoes_evento a
   set pede_agendamento = true
  from mkt_templates_acao t
 where t.id = a.template_acao_id
   and t.pede_agendamento
   and not a.pede_agendamento;

-- ---------- 3. o checklist nasce com a flag ----------
-- Dois caminhos criam ação a partir de template, e os dois precisam levar
-- a coluna nova: o gatilho (evento já classificado no insert) e a
-- classificação posterior (evento que saiu da fila).
create or replace function fn_mkt_gera_checklist() returns trigger
language plpgsql as $$
begin
  if new.tipo_evento_id is not null then
    if exists (select 1 from mkt_tipos_evento t
               where t.id = new.tipo_evento_id and t.gera_checklist) then
      insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                    responsavel, prazo, conclusao, fonte_automacao,
                                    pede_agendamento)
      select new.id, t.id, t.nome, t.responsavel_padrao,
             new.data_evento - t.prazo_dias_antes, t.conclusao, t.fonte_automacao,
             t.pede_agendamento
      from mkt_templates_acao t
      where t.tipo_evento_id = new.tipo_evento_id;
      new.status := 'ativo';
    else
      new.status := 'sem_acoes';
    end if;
  end if;
  return new;
end $$;

create or replace function mkt_aplicar_classificacao(p_evento_id uuid, p_tipo_evento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo_evento_id is null then
    update mkt_eventos set status = 'sem_acoes'
     where id = p_evento_id and status = 'pendente_classificacao';
    return;
  end if;

  update mkt_eventos set tipo_evento_id = p_tipo_evento_id
   where id = p_evento_id;

  if exists (select 1 from mkt_tipos_evento t
             where t.id = p_tipo_evento_id and t.gera_checklist) then
    insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                  responsavel, prazo, conclusao, fonte_automacao,
                                  pede_agendamento)
    select e.id, t.id, t.nome, t.responsavel_padrao,
           e.data_evento - t.prazo_dias_antes, t.conclusao, t.fonte_automacao,
           t.pede_agendamento
    from mkt_eventos e
    join mkt_templates_acao t on t.tipo_evento_id = p_tipo_evento_id
    where e.id = p_evento_id
      and not exists (select 1 from mkt_acoes_evento a
                      where a.evento_id = e.id);  -- nunca duplica checklist
    update mkt_eventos set status = 'ativo' where id = p_evento_id;
  else
    update mkt_eventos set status = 'sem_acoes' where id = p_evento_id;
  end if;
end $$;

-- `fonte_automacao` entrou aqui de carona: a versão anterior desta função
-- não copiava a coluna, embora o gatilho copiasse. Efeito prático: ação
-- de tráfego criada por classificação posterior nascia sem fonte e o sync
-- não a encontrava para marcar sozinho. Corrigido junto por estar na
-- mesma linha do insert.

-- ---------- 4. marcar ação, agora com horário ----------
drop function if exists mkt_marcar_acao(uuid, boolean);

create or replace function mkt_marcar_acao(
  p_acao_id       uuid,
  p_concluida     boolean,
  p_agendado_para timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_unidade uuid; v_conclusao text; v_pede boolean;
begin
  select e.unidade_id, a.conclusao, a.pede_agendamento
    into v_unidade, v_conclusao, v_pede
  from mkt_acoes_evento a join mkt_eventos e on e.id = a.evento_id
  where a.id = p_acao_id;

  if v_unidade is null then raise exception 'ação não encontrada'; end if;
  if v_conclusao = 'automatica' then
    raise exception 'ação automática: o sistema marca sozinho';
  end if;
  if not exists (select 1 from perfis p
                 where p.id = auth.uid()
                   and (p.gestor_marketing or p.unidade_id = v_unidade)) then
    raise exception 'sem permissão nesta unidade';
  end if;

  -- Horário só é aceito em ação que o pede. Guardar em qualquer outra
  -- criaria dado que nenhuma tela mostra e ninguém sabe explicar depois.
  if p_agendado_para is not null and not v_pede then
    raise exception 'esta ação não trabalha com horário de agendamento';
  end if;

  update mkt_acoes_evento
     set concluida = p_concluida,
         -- Desmarcar limpa o horário: se a postagem não está mais
         -- programada, a data de quando estaria é lixo que engana.
         agendado_para = case when p_concluida then p_agendado_para else null end
   where id = p_acao_id;
  -- concluida_em/concluida_por: o trigger 121 cuida.
end $$;

grant execute on function mkt_marcar_acao(uuid, boolean, timestamptz) to authenticated, service_role;

-- ---------- 5. conferência ----------
do $$
declare v_flag int; v_func int;
begin
  select count(*) into v_flag from mkt_acoes_evento where pede_agendamento;
  if v_flag <> 26 then
    raise exception 'Esperava 26 ações pedindo agendamento; achei %', v_flag;
  end if;

  select count(*) into v_func from pg_proc where proname = 'mkt_marcar_acao';
  if v_func <> 1 then
    raise exception 'Existem % versões de mkt_marcar_acao — a chamada fica ambígua', v_func;
  end if;
end $$;
