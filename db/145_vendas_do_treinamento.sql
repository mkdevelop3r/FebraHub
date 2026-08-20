-- ============================================================
-- 145_vendas_do_treinamento.sql — venda e receita, separadas de gente
--
-- Pedido do Louis em 20/08/2026: o card do treinamento passa a mostrar as
-- vendas, como a palestra já mostra inscritos, puxando do Salesforce pelo
-- mesmo caminho que o sino (view da 144).
--
-- PESSOA NA SALA NÃO É VENDA — e o dado prova
-- --------------------------------------------
-- Medido em 20/08/2026, nas duas maiores turmas:
--
--   IF 36     43 `Matrícula` (42 com valor, R$ 87.899)
--             19 `CONSUMIDOR DE VAGAS` (zero valor)  -> 62 pessoas
--   FCIS 37   34 `Matrícula` (34 com valor, R$ 101.399)
--              5 `CONSUMIDOR DE VAGAS` (zero valor)  -> 39 pessoas
--
-- `CONSUMIDOR DE VAGAS` é quem ocupa cadeira comprada ANTES, num pacote.
-- A pessoa está na sala e a venda não aconteceu agora — por isso a coluna
-- `inscritos` (que a 144 já entregava) continua somando os dois, e as
-- colunas novas contam só a venda.
--
-- Se fossem um número só, o cálculo de ticket médio sairia errado por
-- construção: R$ 87.899 dividido por 62 dá R$ 1.418, quando o ticket real
-- é R$ 2.093 sobre as 42 que têm valor. Ninguém repara num erro desses
-- olhando um card; ele só aparece quando alguém decide alguma coisa com
-- base nele.
--
-- `receita` soma `valor` das matrículas — no IF 36, uma das 43 está sem
-- valor preenchido na origem. O número é o que o Salesforce tem, não uma
-- estimativa; quando faltar dado lá, falta aqui, e é assim que deve ser.
-- ============================================================

-- `create or replace` não aceita coluna nova no MEIO da lista — o Postgres
-- recusa com 42P16 ("cannot change name of view column"). Derrubar e
-- recriar é seguro aqui: nada no banco depende desta view, e o único
-- consumidor é o front, que ainda não foi publicado. Se um dia houver
-- outra view em cima desta, `drop` sem `cascade` avisa em vez de arrastar.
drop view if exists vw_mkt_publico_evento;

create view vw_mkt_publico_evento as
select
  e.id                                as evento_id,
  e.nome,
  e.data_evento,
  e.status,
  e.unidade_id,
  case
    when e.sympla_evento_id is not null then 'sympla'
    when t.turma_id is not null         then 'salesforce'
  end                                 as fonte,
  case
    when e.sympla_evento_id is not null then r.inscritos
    when t.turma_id is not null         then m.pessoas
  end                                 as inscritos,
  -- Só o Salesforce tem venda por aqui. No Sympla, `vendas_pitch` e
  -- `vendas_pos` de `mkt_resultados_evento` são lançamento manual do que
  -- foi vendido NO evento, coisa diferente, e ficam onde estão.
  --
  -- O `case` não é decoração: sem ele, o `count(*)` do lateral sobre uma
  -- turma inexistente devolve ZERO para todo evento do Sympla, e a tela
  -- passaria a dizer "0 vendas" onde a verdade é "esta fonte não responde
  -- essa pergunta". Zero é um fato; nulo é a ausência dele.
  case when t.turma_id is not null then m.vendas  end as vendas,
  case when t.turma_id is not null then m.receita end as receita,
  t.turma_id,
  t.capacidade
from mkt_eventos e
left join mkt_resultados_evento r on r.evento_id = e.id
left join mkt_tipos_evento ti on ti.id = e.tipo_evento_id
left join lateral (
  select d.turma_id, d.capacidade
    from dim_turmas d
   where e.sympla_evento_id is null
     and ti.nome = 'Treinamento'
     and d.data_inicio = e.data_evento
   limit 1
) t on true
left join lateral (
  select
    count(*)                                                        as pessoas,
    count(*) filter (where b.tipo_matricula = 'Matrícula')          as vendas,
    sum(b.valor) filter (where b.tipo_matricula = 'Matrícula')      as receita
    from fato_base_alunos b
   where b.turma = t.turma_id
     and b.status_matricula = 'Aprovada'
     and b.tipo_matricula in ('Matrícula', 'CONSUMIDOR DE VAGAS')
) m on true
where pode_ver('marketing');

comment on view vw_mkt_publico_evento is
  'Público por evento da Central. `inscritos` = pessoas (Matrícula + CONSUMIDOR DE VAGAS) ou inscritos do Sympla; `vendas` e `receita` contam só venda direta, e existem apenas na fonte salesforce. Ver migration 145.';

grant select on vw_mkt_publico_evento to authenticated, service_role;
