-- ============================================================
-- 143_conferir_antes_de_concluir.sql — três checks antes do check
--
-- Pedido do Louis em 20/08/2026: "Envio para o treinador — vídeo, card e
-- link" só pode ser concluída depois de conferir os três, um a um.
--
-- A ação já listava os três no próprio nome, e mesmo assim era um clique
-- só. Quem mandou só o card marcava igual a quem mandou tudo, e o
-- treinador descobria o que faltava na véspera.
--
-- ITENS VÊM DO DADO, NÃO DO CÓDIGO
-- ---------------------------------
-- `confirmar_itens text[]` no catálogo, copiado para a ação quando o
-- checklist nasce — mesma mecânica de `pede_agendamento` (142) e pelo
-- mesmo motivo. A alternativa seria a tela comparar o nome da ação e
-- desenhar três caixas fixas; aí renomear "Envio para o treinador" ou
-- passar a mandar um quarto item (stories, por exemplo) viraria mudança
-- de código. Assim é UPDATE numa linha de `mkt_templates_acao`.
--
-- Vale para os CINCO tipos que têm a ação: Palestra, Workshop,
-- Treinamento, Live e Evento.
--
-- ISTO É UM PORTÃO DE TELA, NÃO UMA RESTRIÇÃO DO BANCO
-- ----------------------------------------------------
-- Os três checks não são gravados, e é de propósito: como a ação não
-- conclui sem os três, "concluída" já significa "os três foram
-- conferidos". Guardar as marcações seria guardar três colunas que sempre
-- valem o mesmo que a quarta.
--
-- A consequência honesta disso é que o banco não tem como verificar o
-- ritual — quem chamar `mkt_marcar_acao` direto conclui sem conferir
-- nada. É aceitável porque o portão existe para evitar DESATENÇÃO de quem
-- está trabalhando na tela, não para impedir fraude. Se um dia virar
-- requisito de auditoria, aí sim é tabela filha com quem marcou e quando.
-- ============================================================

-- ---------- 1. coluna ----------
alter table mkt_templates_acao
  add column if not exists confirmar_itens text[];

alter table mkt_acoes_evento
  add column if not exists confirmar_itens text[];

comment on column mkt_acoes_evento.confirmar_itens is
  'Itens que a tela exige conferir antes de concluir. Nulo ou vazio = conclui com um clique.';

-- ---------- 2. quem exige conferência ----------
-- Ordem proposital: link, card e vídeo — do mais rápido de checar para o
-- mais demorado. O nome da ação lista na ordem inversa ("vídeo, card e
-- link") porque ali é frase, aqui é fila de trabalho.
update mkt_templates_acao
   set confirmar_itens = array['Link', 'Card', 'Vídeo']
 where nome ilike 'Envio para o treinador%';

update mkt_acoes_evento a
   set confirmar_itens = t.confirmar_itens
  from mkt_templates_acao t
 where t.id = a.template_acao_id
   and t.confirmar_itens is not null
   and a.confirmar_itens is distinct from t.confirmar_itens;

-- ---------- 3. o checklist nasce com os itens ----------
-- Os dois caminhos que criam ação a partir de template, de novo: o
-- gatilho (evento já classificado no insert) e a classificação posterior.
create or replace function fn_mkt_gera_checklist() returns trigger
language plpgsql as $$
begin
  if new.tipo_evento_id is not null then
    if exists (select 1 from mkt_tipos_evento t
               where t.id = new.tipo_evento_id and t.gera_checklist) then
      insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                    responsavel, prazo, conclusao, fonte_automacao,
                                    pede_agendamento, confirmar_itens)
      select new.id, t.id, t.nome, t.responsavel_padrao,
             new.data_evento - t.prazo_dias_antes, t.conclusao, t.fonte_automacao,
             t.pede_agendamento, t.confirmar_itens
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
                                  pede_agendamento, confirmar_itens)
    select e.id, t.id, t.nome, t.responsavel_padrao,
           e.data_evento - t.prazo_dias_antes, t.conclusao, t.fonte_automacao,
           t.pede_agendamento, t.confirmar_itens
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

-- ---------- 4. conferência ----------
do $$
declare v_tpl int; v_acoes int;
begin
  select count(*) into v_tpl from mkt_templates_acao
   where confirmar_itens = array['Link','Card','Vídeo'];
  if v_tpl <> 5 then
    raise exception 'Esperava os 5 tipos com a conferência; achei %', v_tpl;
  end if;

  select count(*) into v_acoes from mkt_acoes_evento
   where confirmar_itens is not null;
  if v_acoes <> 26 then
    raise exception 'Esperava 26 ações com itens a conferir; achei %', v_acoes;
  end if;
end $$;
