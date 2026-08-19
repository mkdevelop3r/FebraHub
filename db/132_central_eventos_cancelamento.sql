-- ============================================================
-- 132_central_eventos_cancelamento.sql
-- Evento cancelado: quem cancelou, quando e POR QUÊ.
--
-- Pedido do Bruno (19/08): o gestor precisa poder cancelar um evento, e
-- apagar da agenda do Google tem que virar cancelamento — não sumiço.
--
-- O status 'cancelado' já existia no check da 121 desde o começo; o que
-- não existia era como chegar nele nem onde escrever o motivo. Sem motivo
-- obrigatorio isto viraria o de sempre: três meses depois ninguém lembra
-- por que a palestra de setembro sumiu.
--
-- Efeito colateral que É a intenção: as quatro consultas da tela filtram
-- status='ativo' (mktEventosDoMes, mktAcoesDoPeriodo, mktAcoesAtrasadas,
-- mktProximoEventoAtivo), e as filas de notificação da 123 também. Cancelar
-- tira o evento e as pendências dele da pauta na hora, sem apagar nada — as
-- ações continuam na tabela, e reativar devolve tudo.
-- ============================================================


-- ---------- 1. O PORQUÊ MORA NA TABELA ----------
-- `cancelado_por` aponta para `perfis`, não para `auth.users` como o
-- `concluida_por` da 121. Motivo prático: o front não lê auth.users, então
-- concluida_por nunca vira nome na tela — a linha mostra só "feito em
-- <data>". Aqui quem cancelou É a informação, e perfis o front lê.
alter table mkt_eventos
  add column if not exists cancelado_motivo text,
  add column if not exists cancelado_em     timestamptz,
  add column if not exists cancelado_por    uuid references perfis(id);

-- Cancelado sem porquê não existe. Vale para o clique do gestor e para o
-- que vem da agenda — este último carimba o motivo sozinho, mais abaixo.
alter table mkt_eventos drop constraint if exists mkt_eventos_cancelado_com_motivo;
alter table mkt_eventos add constraint mkt_eventos_cancelado_com_motivo
  check (status <> 'cancelado' or cancelado_motivo is not null);

comment on column mkt_eventos.cancelado_motivo is
  'Por que o evento foi cancelado. Obrigatório quando status = cancelado.';


-- ---------- 2. O CLIQUE DO GESTOR ----------
-- Mesma régua de mkt_classificar_evento: cancelar é decisão de gestor, não
-- do time de produção. Um colaborador que perdesse a paciência com um
-- evento poderia zerar a pauta dele inteira.
create or replace function mkt_cancelar_evento(p_evento_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from perfis p
                 where p.id = auth.uid() and p.gestor_marketing) then
    raise exception 'apenas o gestor de marketing cancela eventos';
  end if;

  -- Motivo de verdade: espaço em branco não conta, e uma letra solta
  -- também não. A tela pede o texto antes de habilitar o botão; isto é a
  -- segunda tranca, para quem chamar a RPC por fora.
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'escreva o motivo do cancelamento';
  end if;

  select status into v_status from mkt_eventos where id = p_evento_id;
  if v_status is null then raise exception 'evento não encontrado'; end if;
  if v_status = 'cancelado' then raise exception 'evento já está cancelado'; end if;

  update mkt_eventos
     set status = 'cancelado',
         cancelado_motivo = btrim(p_motivo),
         cancelado_em = now(),
         cancelado_por = auth.uid()
   where id = p_evento_id;
end $$;


-- ---------- 3. DESFAZER ----------
-- Cancelamento é reversível de propósito: sem volta, o gestor pensa duas
-- vezes antes de usar e o campo morre sem uso. O status de volta não é
-- adivinhado — é recalculado da mesma regra da 125: sem tipo volta para a
-- fila, tipo que gera checklist volta ativo, o resto é sem_acoes.
create or replace function mkt_reativar_evento(p_evento_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tipo uuid; v_gera boolean;
begin
  if not exists (select 1 from perfis p
                 where p.id = auth.uid() and p.gestor_marketing) then
    raise exception 'apenas o gestor de marketing reativa eventos';
  end if;

  select e.tipo_evento_id, t.gera_checklist into v_tipo, v_gera
    from mkt_eventos e
    left join mkt_tipos_evento t on t.id = e.tipo_evento_id
   where e.id = p_evento_id and e.status = 'cancelado';
  if not found then raise exception 'evento não está cancelado'; end if;

  update mkt_eventos
     set status = case when v_tipo is null then 'pendente_classificacao'
                       when v_gera then 'ativo'
                       else 'sem_acoes' end,
         cancelado_motivo = null, cancelado_em = null, cancelado_por = null
   where id = p_evento_id;
end $$;


-- ---------- 4. APAGAR DA AGENDA É CANCELAR ----------
-- O sync da agenda vive fora deste repositório (roda com service_role, que
-- ignora RLS). Se ele apagar a linha do evento removido do Google, o
-- ON DELETE CASCADE de mkt_acoes_evento leva junto o checklist inteiro:
-- some o que o time fez, some o histórico, e ninguém fica sabendo.
--
-- Em vez de pedir que a automação mude, o banco recusa a exclusão e
-- converte em cancelamento. `return null` num BEFORE DELETE descarta o
-- DELETE em silêncio — quem chamou acha que apagou, e é isso mesmo que
-- queremos: nenhuma automação quebra.
--
-- Escape: `set local mkt.excluir_de_verdade = 'on'` numa transação faz a
-- exclusão acontecer. É para limpar lixo de teste, não para uso normal.
create or replace function fn_mkt_delete_vira_cancelamento() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('mkt.excluir_de_verdade', true), '') = 'on' then
    return old;
  end if;

  update mkt_eventos
     set status = 'cancelado',
         cancelado_motivo = coalesce(cancelado_motivo, 'Apagado da agenda do Google'),
         cancelado_em = coalesce(cancelado_em, now()),
         cancelado_por = coalesce(cancelado_por, auth.uid())
   where id = old.id;
  return null;
end $$;

drop trigger if exists trg_mkt_delete_vira_cancelamento on mkt_eventos;
create trigger trg_mkt_delete_vira_cancelamento
  before delete on mkt_eventos
  for each row execute function fn_mkt_delete_vira_cancelamento();


-- ---------- 5. O TRÁFEGO PARA DE MARCAR EVENTO CANCELADO ----------
-- A função da 130 varre mkt_eventos sem olhar status. Com cancelamento
-- existindo, uma campanha que continua no ar (porque ninguém pausou no
-- Meta) marcaria "Rodando no tráfego" num evento que não vai acontecer.
-- Idêntica à da 130 fora o filtro de status.
create or replace function mkt_atualiza_acao_trafego() returns text
language plpgsql security definer set search_path = public as $$
declare v_on bigint; v_off bigint;
begin
  with situacao as (
    select e.id as evento_id, e.data_evento,
           bool_or(c.status = 'ativa'
                   and coalesce(g.gasto_total, 0) > 0) as rodando,
           min(c.data_inicio) filter (where c.status = 'ativa'
                   and coalesce(g.gasto_total, 0) > 0) as inicio
      from mkt_eventos e
      left join mkt_campanhas_trafego c on c.evento_id = e.id
      left join lateral (
        select sum(s.gasto) as gasto_total
          from mkt_campanhas_snapshot_diario s
         where s.campanha_id = c.id
      ) g on true
     where e.status <> 'cancelado'
     group by e.id, e.data_evento
  ),
  mudanca as (
    update mkt_acoes_evento a
       set concluida = coalesce(si.rodando, false),
           concluida_em = case when si.rodando
                               then coalesce(a.concluida_em, si.inicio::timestamptz, now())
                               else null end
      from situacao si
     where a.evento_id = si.evento_id
       and a.fonte_automacao = 'trafego'
       and a.concluida is distinct from coalesce(si.rodando, false)
       and (coalesce(si.rodando, false) or si.data_evento >= current_date)
    returning a.concluida
  )
  select count(*) filter (where concluida),
         count(*) filter (where not concluida)
    into v_on, v_off
    from mudanca;
  return format('trafego: %s marcadas · %s desmarcadas', v_on, v_off);
end $$;


-- ---------- 6. PERMISSÕES ----------
revoke all on function mkt_cancelar_evento(uuid, text) from public, anon;
revoke all on function mkt_reativar_evento(uuid)       from public, anon;
grant execute on function mkt_cancelar_evento(uuid, text) to authenticated;
grant execute on function mkt_reativar_evento(uuid)       to authenticated;
-- mkt_atualiza_acao_trafego continua fechada (130/131): só o sync a chama.
revoke execute on function mkt_atualiza_acao_trafego() from public, anon, authenticated;

notify pgrst, 'reload schema';
