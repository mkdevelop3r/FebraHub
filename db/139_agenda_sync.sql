-- ============================================================
-- 139_agenda_sync.sql — a agenda do Google entra sozinha
--
-- NASCEU 138 E VIROU 139. Foi aplicada no Supabase em 20/08/2026 sob o
-- nome `138_agenda_sync` — é assim que ela aparece em
-- supabase_migrations.schema_migrations, e não vale reescrever registro de
-- migration já aplicada só para ficar bonito. O número do arquivo mudou
-- porque o Codex criou `138_financeiro_receita_categoria_detalhe.sql` na
-- mesma janela, e duas 138 na pasta é armadilha para quem chegar depois.
-- Renumerei a minha por ser a minha; a dele não se toca.
--
-- A ordem entre as duas não importa: esta mexe em funções `mkt_*`, a dele
-- cria uma view do Financeiro. Não se cruzam.
--
-- O PROBLEMA QUE ISTO RESOLVE
-- ---------------------------
-- Os 78 eventos da Central vieram da agenda marketingbahia@febracis.com.br
-- numa importação manual em 18/08/2026. Depois disso, nada. Não há pg_cron,
-- não há pg_net, não há Edge Function, e `google_event_id` só aparecia na
-- criação da tabela — nenhuma linha do repositório escrevia nele.
--
-- O gatilho da 124 (`trg_mkt_reprazo_acoes`) já sabe recalcular os prazos
-- quando `data_evento` muda. Ele nunca disparou porque ninguém trazia a
-- data nova de fora. Esta migration entrega a metade que faltava: a porta
-- de entrada. Quem bate nela é `etl/agenda_sync.py`.
--
-- Medido em 20/08/2026, antes de escrever, comparando a agenda com o banco:
--   89 eventos no Google que o banco não tem — mas 70 deles são PASSADO
--      (junho a agosto). Por isso a função tem `p_desde` e ignora o que já
--      aconteceu: importar passado geraria checklist nascido vencido.
--    1 data mudou: "Poder e Alta performance (Carol)", de 21/10 para 07/10.
--      Duas semanas mais CEDO, com o checklist inteiro atrasado e ninguém
--      sabendo. É o caso exato que motivou esta migration.
--   23 nomes "mudaram" — 21 eram só espaço em branco no fim. Daí o btrim:
--      sem ele, todo sync gravaria 21 UPDATEs falsos.
--    2 renomeações de verdade, e boas: "Palestra Rennan" virou "Palestra
--      Inteligência emocional para líderes - Rennan".
--
-- O QUE ESTA FUNÇÃO NÃO FAZ, DE PROPÓSITO
-- ----------------------------------------
-- Não apaga e não cancela. Sumir da agenda é ambíguo — pode ser evento
-- desmarcado, pode ser evento movido para fora da janela consultada, pode
-- ser erro de quem mexeu no calendário. E cancelar aqui é destrutivo: leva
-- o checklist junto. A função devolve a lista dos sumidos no relatório e
-- para por aí; quem cancela é gente, pela tela, com motivo — que é o fluxo
-- que a 132 construiu.
--
-- SOBRE `codigo`: renomear NÃO reemite o código do evento. O
-- `trg_mkt_gera_codigo` é BEFORE INSERT apenas. É o comportamento certo —
-- o código circula em conversa e em card, e mudá-lo porque alguém corrigiu
-- um acento no título quebraria a referência de todo mundo.
-- ============================================================

-- ---------- 1. classificar pendentes virou função ----------
-- O corpo é o mesmo `do $$` da migration 125, sem nenhuma mudança de
-- regra: primeiro a regra mais específica de `mkt_regras_classificacao`,
-- depois a primeira palavra do nome contra o catálogo de tipos. O que não
-- casa continua pendente — aí sim é fila do Bruno.
--
-- Virou função porque o sync precisa chamar isso a cada rodada. Como
-- bloco anônimo, só rodava uma vez, na mão, no dia da migration.
create or replace function mkt_classifica_pendentes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_regra  record;
  v_tipo   uuid;
  v_feitos integer := 0;
begin
  for r in select id, nome from mkt_eventos
            where status = 'pendente_classificacao' loop

    select rc.tipo_evento_id, true as achou into v_regra
      from mkt_regras_classificacao rc
     where rc.ativa and r.nome ilike rc.padrao
     order by length(rc.padrao) desc limit 1;

    if found then
      perform mkt_aplicar_classificacao(r.id, v_regra.tipo_evento_id);
      v_feitos := v_feitos + 1;
      continue;
    end if;

    select t.id into v_tipo
      from mkt_tipos_evento t
     where t.ativo and r.nome ~* ('^' || t.nome || '\y');
    if found then
      perform mkt_aplicar_classificacao(r.id, v_tipo);
      v_feitos := v_feitos + 1;
    end if;
  end loop;

  return v_feitos;
end $$;

comment on function mkt_classifica_pendentes() is
  'Aplica as regras de classificação nos eventos pendentes. Mesmo corpo do bloco anônimo da migration 125, agora chamável pelo sync da agenda.';

-- ---------- 2. a porta de entrada ----------
-- Recebe a agenda inteira de uma vez, em jsonb, e resolve tudo numa
-- transação só. Foi escrito assim de propósito: o Python fazendo linha a
-- linha pelo PostgREST daria 165 chamadas, sem atomicidade, e um erro no
-- meio deixaria metade da agenda aplicada.
--
-- Formato de cada item:
--   {"google_event_id": "abc123", "nome": "Palestra X", "data": "2026-10-07"}
--
-- `p_calendario` é o e-mail do calendário; a unidade sai de
-- `mkt_unidades.agenda_google_id`. É o que deixa Recife entrar depois sem
-- tocar nesta função.
create or replace function mkt_sincroniza_agenda(
  p_calendario text,
  p_eventos    jsonb,
  p_desde      date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade   uuid;
  v_item      jsonb;
  v_gid       text;
  v_nome      text;
  v_data      date;
  v_atual     record;
  v_inseridos integer := 0;
  v_datas     integer := 0;
  v_nomes     integer := 0;
  v_passado   integer := 0;
  v_iguais    integer := 0;
  v_class     integer := 0;
  v_min       date;
  v_max       date;
  v_sumidos   jsonb;
  v_mudancas  jsonb := '[]'::jsonb;
begin
  select id into v_unidade
    from mkt_unidades
   where agenda_google_id = p_calendario and ativa;

  if v_unidade is null then
    raise exception 'Nenhuma unidade ativa com agenda_google_id = %', p_calendario
      using hint = 'Preencha mkt_unidades.agenda_google_id com o e-mail do calendário.';
  end if;

  -- Janela real do que veio. Serve para não acusar de "sumido" um evento
  -- que apenas está fora do intervalo que o Python consultou.
  select min((e->>'data')::date), max((e->>'data')::date)
    into v_min, v_max
    from jsonb_array_elements(p_eventos) e;

  for v_item in select * from jsonb_array_elements(p_eventos) loop
    v_gid  := v_item->>'google_event_id';
    v_nome := btrim(coalesce(v_item->>'nome', ''));
    v_data := (v_item->>'data')::date;

    -- Evento sem título no Google existe e não tem o que divulgar.
    continue when v_gid is null or v_nome = '' or v_data is null;

    select id, nome, data_evento, status into v_atual
      from mkt_eventos where google_event_id = v_gid;

    if not found then
      if v_data < p_desde then
        v_passado := v_passado + 1;      -- passado não entra
      else
        insert into mkt_eventos (unidade_id, nome, data_evento,
                                 google_event_id, status)
        values (v_unidade, v_nome, v_data, v_gid, 'pendente_classificacao')
        on conflict (google_event_id) do nothing;
        v_inseridos := v_inseridos + 1;
        v_mudancas := v_mudancas || jsonb_build_object(
          'acao', 'novo', 'nome', v_nome, 'data', v_data);
      end if;
      continue;
    end if;

    -- Evento cancelado na tela não volta sozinho porque continua na agenda.
    -- Reativar é decisão de gestor, e a 132 já tem o fluxo com registro.
    if v_atual.status = 'cancelado' then
      v_iguais := v_iguais + 1;
      continue;
    end if;

    if v_atual.data_evento is distinct from v_data then
      update mkt_eventos set data_evento = v_data where id = v_atual.id;
      v_datas := v_datas + 1;
      v_mudancas := v_mudancas || jsonb_build_object(
        'acao', 'data', 'nome', v_atual.nome,
        'de', v_atual.data_evento, 'para', v_data);
    end if;

    if btrim(v_atual.nome) is distinct from v_nome then
      update mkt_eventos set nome = v_nome where id = v_atual.id;
      v_nomes := v_nomes + 1;
      v_mudancas := v_mudancas || jsonb_build_object(
        'acao', 'nome', 'de', v_atual.nome, 'para', v_nome);
    end if;
  end loop;

  v_class := mkt_classifica_pendentes();

  -- Sumidos: existe aqui, dentro da janela consultada, e não veio na
  -- agenda. Só relatório — ver o cabeçalho.
  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', e.nome, 'data', e.data_evento, 'status', e.status)), '[]'::jsonb)
    into v_sumidos
    from mkt_eventos e
   where e.unidade_id = v_unidade
     and e.status <> 'cancelado'
     and e.data_evento between greatest(v_min, p_desde) and v_max
     and not exists (
       select 1 from jsonb_array_elements(p_eventos) g
        where g->>'google_event_id' = e.google_event_id);

  return jsonb_build_object(
    'recebidos',      jsonb_array_length(p_eventos),
    'inseridos',      v_inseridos,
    'datas_mudadas',  v_datas,
    'nomes_mudados',  v_nomes,
    'passado_ignorado', v_passado,
    'sem_mudanca',    v_iguais,
    'classificados',  v_class,
    'janela',         jsonb_build_object('de', v_min, 'ate', v_max, 'desde', p_desde),
    'mudancas',       v_mudancas,
    'sumidos',        v_sumidos
  );
end $$;

comment on function mkt_sincroniza_agenda(text, jsonb, date) is
  'Entrada da agenda do Google na Central de Eventos. Insere futuro, atualiza data e nome, nunca apaga nem cancela. Devolve relatório em jsonb.';

-- ---------- 3. quem pode chamar ----------
-- Só o service_role: quem chama é o ETL, com a chave de serviço. Nenhum
-- usuário logado tem por que reescrever a agenda inteira a partir do
-- navegador.
revoke all on function mkt_sincroniza_agenda(text, jsonb, date) from public, anon, authenticated;
revoke all on function mkt_classifica_pendentes() from public, anon, authenticated;
grant execute on function mkt_sincroniza_agenda(text, jsonb, date) to service_role;
grant execute on function mkt_classifica_pendentes() to service_role;

-- ---------- 4. conferência ----------
--   select mkt_sincroniza_agenda('marketingbahia@febracis.com.br', '[]'::jsonb);
-- Com lista vazia tem que devolver tudo zero e não tocar em nada.
