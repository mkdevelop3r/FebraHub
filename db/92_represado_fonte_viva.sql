-- ============================================================
-- 92 — REPRESADO SOBRE A FONTE VIVA
--
-- APLICADO. Conferido no banco em 13/08/2026. Ler as decisões antes de rodar.
--
-- O 03 trouxe a presença para o banco. Este arquivo faz as views de
-- represado que já existiam voltarem a funcionar, trocando a fonte
-- morta (fato_credenciamento) pela unificada (vw_comparecimento).
--
-- A lógica delas não muda. Elas já estavam certas.
--
-- Duas correções de rota descobertas durante a validação:
--
-- 1. NÃO PASSAR POR dim_alunos. Ela cobre 6% dos alunos matriculados
--    em 2026 e 20% em 2022 — nunca esteve completa. `aluno_id` em
--    fato_base_alunos JÁ É o CPF (20.209 de 20.531 linhas com 11
--    dígitos), igual ao CPF da presença. A ponte era desnecessária e
--    derrubava o casamento de 74% para 1%.
--
-- 2. TURMA FUTURA NÃO É REPRESADO. `TCE001 - TOUR PV SALVADOR` tem
--    474 matriculados e zero presença porque ainda não aconteceu.
--    Sem filtro de data, ela entraria como 474 ausentes — o pior tipo
--    de erro, grande e convincente. Cobertura sozinha não protege
--    disso; é preciso exigir turma já iniciada.
-- ============================================================


-- ============================================================
-- QUAIS TURMAS PODEM GERAR REPRESADO
--
-- Três condições, todas necessárias:
--   a) já começou            (dim_turmas.data_inicio <= hoje)
--   b) tem registro de presença de gente de verdade (>= 40%)
--   c) tem pelo menos 10 matriculados — abaixo disso o percentual
--      oscila demais para significar algo
--
-- O corte de 40% (e não os 50% da view antiga) vem da distribuição
-- real medida em 2026: as 20 turmas presenciais ficaram entre 42% e
-- 91%. Cortar em 50% descartaria FOP19 (43%) e FGPC025 (42%), que
-- têm presença legítima.
--
-- As ~65 turmas com zero presença ficam de fora sozinhas, e é o
-- certo: são Team Coaching, Coaching Individual, produtos de livro,
-- turmas de outras praças (SP, Curitiba, Rio, BH) e turmas futuras.
-- Nenhuma passa por credenciamento de porta.
-- ============================================================

create or replace view vw_turmas_mensuraveis as
select c.turma,
       c.matriculados,
       c.compareceram,
       c.cobertura_pct,
       t.data_inicio,
       t.curso,
       t.cidade
  from vw_presenca_cobertura c
  join dim_turmas t on t.turma_id = c.turma
 where t.data_inicio <= current_date
   and c.matriculados >= 10
   and c.cobertura_pct >= 40;

comment on view vw_turmas_mensuraveis is
  'Turmas onde ausência significa alguma coisa. Fora daqui, falta de
   registro não é falta de aluno — e nenhum indicador de represado
   deve olhar turma que não está nesta lista.';


-- ============================================================
-- REPRESADOS
--
-- Quem comprou, a turma aconteceu, a turma tem registro confiável,
-- e a pessoa não aparece na presença.
-- ============================================================

create or replace view vw_pedagogico_represados as
select m.aluno_id                as cpf,
       m.turma,
       m.curso_id                as curso,
       m.consultor_id            as consultor,
       m.data_matricula,
       round(m.valor)            as valor,
       t.data_inicio             as data_turma,
       t.cidade,
       current_date - t.data_inicio as dias_desde_a_turma
  from fato_base_alunos m
  join vw_turmas_mensuraveis t on t.turma = m.turma
 where m.status_matricula = 'Aprovada'
   and not exists (
     select 1 from vw_comparecimento c
      where c.turma = m.turma
        and c.aluno_id = m.aluno_id
   )
   and pode_ver('pedagogico');

comment on view vw_pedagogico_represados is
  'Comprou, a turma rodou, e não há registro de presença. Só turmas
   mensuráveis. `cpf` é o aluno_id de fato_base_alunos, que é o CPF.';


-- ------------------------------------------------------------
-- Resumo por turma, para o card do hub da Elis
-- ------------------------------------------------------------
create or replace view vw_pedagogico_represados_turma as
select t.turma,
       t.curso,
       t.cidade,
       t.data_inicio,
       t.matriculados,
       t.compareceram,
       t.matriculados - t.compareceram as represados,
       round(100.0 * (t.matriculados - t.compareceram) / t.matriculados) as pct_represado,
       t.cobertura_pct
  from vw_turmas_mensuraveis t
 where pode_ver('pedagogico');

grant select on vw_turmas_mensuraveis,
                vw_pedagogico_represados,
                vw_pedagogico_represados_turma
  to authenticated;


-- ============================================================
-- AS VIEWS ANTIGAS
--
-- `vw_pedagogico_ausentes` e `vw_comprou_nao_compareceu` continuam
-- lendo fato_credenciamento, ou seja, continuam devolvendo o
-- histórico até 2025 e nada de 2026.
--
-- NÃO foram alteradas aqui de propósito: a troca de fonte muda
-- números que já podem estar em tela, e isso merece comparação lado
-- a lado antes de virar a chave. Rodar a consulta abaixo, conferir,
-- e só então migrar em um arquivo 05.
--
--   select 'antiga' origem, count(*) from vw_pedagogico_ausentes
--   union all
--   select 'nova',          count(*) from vw_pedagogico_represados;
--
-- Quando migrar, as duas antigas viram wrappers de
-- vw_pedagogico_represados e param de existir como lógica própria —
-- duas definições da mesma pergunta é como os números começam a
-- divergir entre telas.
-- ============================================================


-- ============================================================
-- O QUE ESTE ARQUIVO NÃO RESOLVE
--
-- A carga da presença é manual: alguém exporta o CSV do Salesforce,
-- importa em stg_presenca, roda promover_presenca().
--
-- Foi exatamente assim que o credenciamento morreu — sem ninguém
-- perceber, porque não havia como distinguir "nenhuma turma
-- aconteceu" de "nada foi carregado". `fato_presenca.carregado_em`
-- existe para detectar isso, mas detectar não é resolver.
--
-- Enquanto a carga depender de memória humana, o indicador de
-- represado tem prazo de validade. Automatizar a ingestão é o
-- próximo trabalho de verdade deste módulo.
-- ============================================================

create or replace view vw_presenca_saude as
select max(carregado_em)                             as ultima_carga,
       current_date - max(carregado_em)::date        as dias_desde_a_carga,
       count(*)                                      as linhas,
       count(distinct turma)                         as turmas,
       max(data_registro)                            as registro_mais_recente
  from fato_presenca;

comment on view vw_presenca_saude is
  'Mostrar no hub. Se dias_desde_a_carga passar de 30, a presença
   está envelhecendo e todo represado calculado a partir dela vira
   suspeito. O credenciamento morreu por falta deste indicador.';

grant select on vw_presenca_saude to authenticated;
