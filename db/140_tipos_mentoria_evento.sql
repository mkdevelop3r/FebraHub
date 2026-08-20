-- ============================================================
-- 140_tipos_mentoria_evento.sql — dois tipos novos no catálogo
--
-- Pedido do Louis em 20/08/2026: Mentoria e Evento na Central.
--
-- MENTORIA NÃO GERA CHECKLIST, EVENTO GERA
-- -----------------------------------------
-- A escolha foi do Louis, e o dado apoia: as 13 mentorias que já estavam
-- na Central são quase todas "sala de reunião" — sessão fechada, que não
-- se divulga. Mentoria entra como a Maestria: serve para classificar e
-- tirar da fila, sem cobrar prazo de ninguém.
--
-- Evento é o guarda-chuva do que se divulga e não é Palestra, Workshop,
-- Treinamento nem Live. Por isso puxa checklist, com as MESMAS 9 ações da
-- Palestra — copiadas por `insert ... select` em vez de redigitadas, para
-- não nascer divergente. Inclui a "Rodando no tráfego", que é automática
-- (`conclusao = 'automatica'`, fonte 'trafego') e por isso não pode ser
-- marcada na mão.
--
-- O PERIGO QUE ISTO EVITA: tipo com `gera_checklist = true` e template
-- vazio faz o evento nascer 'ativo' com zero ações — a tela diz que está
-- tudo pronto quando não existe nada. Por isso o checklist do Evento é
-- criado na mesma transação que o tipo, e a conferência no fim recusa o
-- resultado se as duas coisas não baterem.
--
-- EFEITO NA CLASSIFICAÇÃO AUTOMÁTICA
-- -----------------------------------
-- `mkt_classifica_pendentes` casa a primeira palavra do nome contra o
-- catálogo. A partir daqui, evento pendente começando com "Mentoria" ou
-- "Evento" se classifica sozinho no próximo sync.
--
-- Os 13 já existentes NÃO são tocados: só quem está em
-- 'pendente_classificacao' passa pelas regras, e eles já estão em
-- 'sem_acoes'. Isso é deliberado — `tipo_evento_id` nulo ali significa
-- "o Bruno mandou ignorar", e reescrever essa decisão em massa apagaria
-- registro de escolha humana. Se um dia for para reclassificar, é UPDATE
-- pontual, com o Bruno junto.
-- ============================================================

-- ---------- 1. os dois tipos ----------
insert into mkt_tipos_evento (prefixo, nome, gera_checklist, ativo) values
  ('[MENTORIA]', 'Mentoria', false, true),
  ('[EVENTO]',   'Evento',   true,  true)
on conflict (prefixo) do nothing;

-- ---------- 2. checklist do Evento, clonado da Palestra ----------
insert into mkt_templates_acao
  (tipo_evento_id, nome, responsavel_padrao, prazo_dias_antes,
   conclusao, ordem, fonte_automacao)
select (select id from mkt_tipos_evento where nome = 'Evento'),
       tm.nome, tm.responsavel_padrao, tm.prazo_dias_antes,
       tm.conclusao, tm.ordem, tm.fonte_automacao
  from mkt_templates_acao tm
  join mkt_tipos_evento t on t.id = tm.tipo_evento_id
 where t.nome = 'Palestra'
   and not exists (                       -- idempotente: rodar 2x não duplica
     select 1 from mkt_templates_acao x
      join mkt_tipos_evento xt on xt.id = x.tipo_evento_id
     where xt.nome = 'Evento');

-- ---------- 3. conferência ----------
-- Falha alto se o catálogo ficar incoerente. Tipo que promete checklist e
-- não tem ação é pior que tipo nenhum.
do $$
declare v_mentoria int; v_evento int; v_gera boolean;
begin
  select count(*) into v_mentoria from mkt_tipos_evento where nome = 'Mentoria';
  select count(*) into v_evento   from mkt_tipos_evento where nome = 'Evento';
  if v_mentoria <> 1 or v_evento <> 1 then
    raise exception 'Esperava um Mentoria e um Evento; achei % e %', v_mentoria, v_evento;
  end if;

  select t.gera_checklist into v_gera from mkt_tipos_evento t where t.nome = 'Mentoria';
  if v_gera then
    raise exception 'Mentoria não deveria gerar checklist.';
  end if;

  select count(*) into v_evento
    from mkt_templates_acao tm join mkt_tipos_evento t on t.id = tm.tipo_evento_id
   where t.nome = 'Evento';
  if v_evento <> 9 then
    raise exception 'Evento deveria ter as 9 ações da Palestra; tem %', v_evento;
  end if;
end $$;
