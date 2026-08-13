-- ============================================================
-- 96 — LIMPEZA DA FILA DE PRAZO
--
-- APLICADO. Conferido no banco em 13/08/2026. Foi rodado por blocos.
--
-- O 06 funcionou e já achou coisa urgente: uma pessoa vencendo em
-- 1 dia, e 91 sem turma disponível dentro do prazo. Mas a lista
-- crua expôs quatro defeitos, todos medidos:
--
--   192 linhas urgentes (vencendo + sem turma no prazo)
--    54 são de turmas de LISBOA — 28% da fila é gente que a Elis
--       não atende
--    62 têm aluno_id que não é CPF (venda PJ ou e-mail no lugar
--       do documento)
--   162 pessoas distintas em 192 linhas — a mesma pessoa aparece
--       em até 3 cursos, mas é UM telefonema
--     4 são MAESTRIA, que não cabe nesta régua
-- ============================================================


-- ============================================================
-- PARTE 1 — LISBOA FORA
--
-- Aluno de `2025 - CIS-GL246 - LISBOA` estava recebendo "próxima
-- turma: CIS-GL252, Salvador". Fora que os valores estão em euro
-- (329, 615, 739) — é operação de Portugal, vendida pelo consultor
-- daqui, mas não é turma da Elis.
--
-- Filtro pelo NOME DA TURMA, e não por cidade ou unidade, porque:
--   `unidade_geradora_venda` é 'FEBRACIS SALVADOR 2' em 100% das
--   7.135 matrículas, inclusive nas de Lisboa — não discrimina.
--   `dim_turmas.cidade` está poluída: tem nome de pessoa ('VALTER
--   VIEIRA', 'DAY DULCE'), nome de curso e siglas soltas.
--
-- É um filtro grosseiro por string, e está assumido como tal. Se
-- surgir outra praça (Porto, Miami), acrescentar aqui — ou, melhor,
-- limpar `dim_turmas.cidade` e trocar por um filtro de verdade.
-- ============================================================

create or replace view vw_pedagogico_prazo_salvador as
select *
  from vw_pedagogico_prazo
 where coalesce(turma_da_venda, '') not ilike '%LISBOA%'
   and curso not ilike '%MAESTRIA%';   -- ver Parte 3

comment on view vw_pedagogico_prazo_salvador is
  'A fila da Elis: só turmas de Salvador e região, sem MAESTRIA.
   O corte de Lisboa é por nome de turma porque nem unidade nem
   cidade discriminam — unidade é FEBRACIS SALVADOR 2 em 100% das
   linhas, e cidade está poluída com nome de pessoa e de curso.';


-- ============================================================
-- PARTE 2 — QUEM NÃO TEM DOCUMENTO
--
-- `fato_base_alunos.aluno_id` é CPF na maioria, mas não sempre:
-- aparecem 'pj:NUCLEO_DE_ATENDIMENTO_MEDICO_E_SAUDE_ESPECIALIZADA'
-- (venda PJ) e e-mails no lugar do documento. Sem CPF não há
-- casamento com dim_alunos, logo não há nome nem telefone.
--
-- Não some da fila: vira bloco próprio. Achar o contato antes do
-- prazo virar taxa é tarefa de alguém, e alguém precisa ver.
--
-- Um caso merece atenção à parte: 'aleatorio@gmail.com' aparece
-- duas vezes, em cursos diferentes. Isso é lixo digitado no
-- Salesforce, não é cliente. Vale a Elis conferir na origem.
-- ============================================================

create or replace view vw_pedagogico_prazo_sem_contato as
select cpf as identificador,
       case when cpf ~ '^\d{11}$'      then 'CPF sem cadastro'
            when cpf like 'pj:%'       then 'venda PJ'
            when cpf like '%@%'        then 'e-mail no lugar do CPF'
            else 'identificador invalido'
       end as motivo,
       curso, comprou_em, vence_em, dias_restantes, consultor, turma_da_venda
  from vw_pedagogico_prazo_salvador
 where telefone is null
   and situacao in ('vencendo', 'sem turma no prazo')
 order by dias_restantes;

comment on view vw_pedagogico_prazo_sem_contato is
  'Urgente e sem telefone. `motivo` diz o que fazer: CPF sem
   cadastro procura-se em dim_alunos; venda PJ procura-se o
   responsável no contrato; e-mail no lugar do CPF é erro de
   digitação na origem.';


-- ============================================================
-- PARTE 3 — MAESTRIA SAI DA RÉGUA
--
-- MAESTRIA dura 364 dias entre data_inicio e data_fim: é programa
-- anual, não turma de dois dias. A régua de "comprou e não fez em
-- 1 ano" não descreve o produto.
--
-- E os tickets são de outra ordem: R$ 45.000, R$ 60.000 e
-- R$ 100.000 nas quatro linhas urgentes. Isso não é assunto de
-- fila de ligação — é conversa individual, provavelmente da Dulce.
--
-- Fica em view própria, visível, fora da contagem.
-- ============================================================

create or replace view vw_pedagogico_maestria_prazo as
select cpf, nome, telefone, email, curso,
       comprou_em, vence_em, dias_restantes,
       round(valor) as valor, consultor, turma_da_venda
  from vw_pedagogico_prazo
 where curso ilike '%MAESTRIA%'
 order by dias_restantes;

comment on view vw_pedagogico_maestria_prazo is
  'MAESTRIA separada: programa anual (364 dias entre início e fim),
   tickets de R$ 45k a R$ 100k. Não é fila de ligação, é conversa
   individual. Sai da contagem geral para não diluir o número da
   Elis nem banalizar o caso.';


-- ============================================================
-- PARTE 4 — UMA LINHA POR PESSOA
--
-- 192 linhas, 162 pessoas. Francisco Benilson aparece com BHP,
-- MAESTRIA e ML5; Rosinélia idem. São três cursos e um telefonema.
--
-- A fila de trabalho é por PESSOA, com os cursos dentro. A urgência
-- é a do curso que vence primeiro.
-- ============================================================

create or replace view vw_pedagogico_prazo_pessoa as
select cpf,
       max(nome)     as nome,
       max(telefone) as telefone,
       max(email)    as email,
       count(*)                          as cursos_pendentes,
       string_agg(curso || ' (' || dias_restantes || 'd)',
                  ' · ' order by dias_restantes) as cursos,
       min(dias_restantes)               as vence_em_dias,
       min(vence_em)                     as primeiro_vencimento,
       sum(round(valor))                 as valor_total,
       max(consultor)                    as consultor,
       min(proxima_turma_em)             as proxima_turma_em,
       bool_or(situacao = 'sem turma no prazo') as tem_curso_sem_turma
  from vw_pedagogico_prazo_salvador
 where situacao in ('vencendo', 'sem turma no prazo')
 group by cpf
 order by min(dias_restantes);

comment on view vw_pedagogico_prazo_pessoa is
  'A fila de ligação da Elis: uma linha por pessoa, ordenada por
   quem vence primeiro. `cursos` lista tudo que está pendente com
   os dias de cada um, porque a conversa cobre todos de uma vez.
   `tem_curso_sem_turma` marca quem não tem para onde ir mesmo
   dizendo sim.';


-- ============================================================
-- PARTE 5 — O CARD, CORRIGIDO
-- ============================================================

create or replace view vw_pedagogico_prazo_resumo as
select count(*) filter (where situacao='vencendo')             as vencendo_90d,
       count(*) filter (where situacao='sem turma no prazo')   as sem_turma,
       count(*) filter (where situacao='sem turma no prazo'
                          and dias_restantes <= 30)            as sem_turma_em_30d,
       count(*) filter (where situacao='vencido')              as vencidos,
       count(*) filter (where situacao='aguardando calendario') as aguardando_calendario,
       (select count(*) from vw_pedagogico_prazo_pessoa)       as pessoas_para_ligar,
       (select count(*) from vw_pedagogico_prazo_sem_contato)  as urgentes_sem_telefone,
       (select ate from vw_calendario_horizonte)               as calendario_ate,
       (select max(carregado_em)::date from fato_presenca)     as presenca_carregada_em
  from vw_pedagogico_prazo_salvador;

grant select on vw_pedagogico_prazo_salvador,
                vw_pedagogico_prazo_sem_contato,
                vw_pedagogico_maestria_prazo,
                vw_pedagogico_prazo_pessoa,
                vw_pedagogico_prazo_resumo
  to authenticated;


-- ============================================================
-- O QUE ESTE ARQUIVO NÃO RESOLVE — E É O MAIS URGENTE
--
-- 91 pessoas não têm turma do seu curso antes do vencimento, e 34
-- delas vencem em 30 dias:
--
--   curso        sem turma   vence em 30d   próxima turma
--   CIS Global      29           10           15/10
--   Inteligência    23           21           17/09
--   Financeira
--   ML5             15            0           nenhuma
--   BHP             13            0           28/10
--
-- O caso agudo é Inteligência Financeira: 21 pessoas vencem ANTES
-- de 17/09, que é a próxima turma. Não é falta de aviso, é falta
-- de turma. Uma turma de IF antes de meados de setembro resolve os
-- 21 de uma vez. Sem isso, são 21 taxas de R$ 200 cobradas de
-- quem já pagou o curso.
--
-- Isso é decisão de calendário, não de software, e não deveria
-- esperar o sistema ficar pronto.
-- ============================================================
