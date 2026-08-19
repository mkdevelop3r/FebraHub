-- ============================================================
-- 124_central_eventos_sync_suporte.sql
-- Suporte ao sync da agenda: evento que MUDA DE DATA no Google
-- recalcula os prazos das ações pendentes sozinho.
-- (Ação concluída não é tocada — histórico é histórico.)
-- ============================================================

create or replace function fn_mkt_reprazo_acoes() returns trigger
language plpgsql as $$
begin
  if new.data_evento is distinct from old.data_evento then
    -- ações de template: recalcula pelo D-x do catálogo
    update mkt_acoes_evento a
       set prazo = new.data_evento - t.prazo_dias_antes
      from mkt_templates_acao t
     where t.id = a.template_acao_id
       and a.evento_id = new.id
       and not a.concluida;

    -- ações avulsas: desloca pelo mesmo delta do evento
    update mkt_acoes_evento
       set prazo = prazo + (new.data_evento - old.data_evento)
     where evento_id = new.id
       and template_acao_id is null
       and not concluida;
  end if;
  return new;
end $$;

create trigger trg_mkt_reprazo_acoes
  after update of data_evento on mkt_eventos
  for each row execute function fn_mkt_reprazo_acoes();
