-- ============================================================
-- 126_central_eventos_cruzamento_salesforce.sql
-- JÁ APLICADO em produção via MCP em 18/08/2026 — este arquivo é o
-- registro para a pasta de migrations. NÃO rodar de novo (os inserts
-- de regras duplicariam).
--
-- Origem: cruzamento dos 22 pendentes com fato_presenca (cursos do
-- Salesforce, 14k linhas) e fato_loja_curso (301 turmas).
-- Placar: 8 ativo / 22 pendente / 48 sem_acoes
--      -> 16 ativo / 10 pendente / 52 sem_acoes
--
-- Regras permanentes criadas (valem p/ turmas futuras):
--   AULA INTERNACIONAL%        -> ignorar  (aula de curso em andamento)
--   Festa GGB%                 -> ignorar  (exemplo literal do Bruno)
--   BHP % / FGPC% / INTELIGÊNCIA FINANCEIRA% / T[eé]cnicas de Vendas%
--                              -> Treinamento (cursos do Salesforce/loja)
--   Poder e Alta performance%  -> Workshop
--
-- Pontuais (nome exato, sem generalizar):
--   IF 37 - CRUZ DAS ALMAS     -> Treinamento
--   FCIS MOD 01 - Thamyres     -> Treinamento (módulo 1 = turma nova)
--   FCIS - 36 2°ª MOD          -> ignorar    (turma em andamento)
--   Cis Cor De rosa Feira      -> Palestra   ("P. CIS ROSA" na loja)
--
-- Deixados de fora de propósito:
--   IF para mulheres           -> "em avaliação" no próprio título
--   CIS 252 GOIANIA / CIS 253 SP -> outra praça; Bruno decide se
--                                   Salvador divulga caravana
-- ============================================================

insert into mkt_regras_classificacao (padrao, tipo_evento_id, observacao) values
  ('AULA INTERNACIONAL%', null, 'aula de curso em andamento (Master/FCIS) — não é captação'),
  ('Festa GGB%',          null, 'exemplo do Bruno na reunião: não precisa de nada'),
  ('BHP %',  (select id from mkt_tipos_evento where nome='Treinamento'), 'Business High Performance — curso do Salesforce'),
  ('FGPC%',  (select id from mkt_tipos_evento where nome='Treinamento'), 'FGPC — curso recorrente na loja'),
  ('INTELIGÊNCIA FINANCEIRA%', (select id from mkt_tipos_evento where nome='Treinamento'), 'curso IF do Salesforce'),
  ('Tecnicas de Vendas%',      (select id from mkt_tipos_evento where nome='Treinamento'), 'curso Técnicas de Vendas (sem acento)'),
  ('Técnicas de Vendas%',      (select id from mkt_tipos_evento where nome='Treinamento'), 'curso Técnicas de Vendas (com acento)'),
  ('Poder e Alta performance%',(select id from mkt_tipos_evento where nome='Workshop'),    'Workshop de 8h no Salesforce');

do $$
declare r record; v_regra record;
begin
  for r in select id, nome from mkt_eventos where status='pendente_classificacao' loop
    select rc.tipo_evento_id into v_regra
      from mkt_regras_classificacao rc
     where rc.ativa and r.nome ilike rc.padrao
     order by length(rc.padrao) desc limit 1;
    if found then
      perform mkt_aplicar_classificacao(r.id, v_regra.tipo_evento_id);
    end if;
  end loop;
end $$;

do $$
declare v_trein uuid; v_palestra uuid; v_ev uuid;
begin
  select id into v_trein    from mkt_tipos_evento where nome='Treinamento';
  select id into v_palestra from mkt_tipos_evento where nome='Palestra';

  select id into v_ev from mkt_eventos where nome='IF 37 - CRUZ DAS ALMAS' and status='pendente_classificacao';
  if found then perform mkt_aplicar_classificacao(v_ev, v_trein); end if;

  select id into v_ev from mkt_eventos where nome='FCIS MOD 01 - Thamyres' and status='pendente_classificacao';
  if found then perform mkt_aplicar_classificacao(v_ev, v_trein); end if;

  select id into v_ev from mkt_eventos where nome='FCIS - 36 2°ª MOD' and status='pendente_classificacao';
  if found then perform mkt_aplicar_classificacao(v_ev, null); end if;

  select id into v_ev from mkt_eventos where nome='Cis Cor De rosa Feira' and status='pendente_classificacao';
  if found then perform mkt_aplicar_classificacao(v_ev, v_palestra); end if;
end $$;

select status, count(*) from mkt_eventos group by status order by status;
