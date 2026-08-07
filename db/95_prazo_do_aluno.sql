-- ============================================================
-- 06 — PRAZO DO ALUNO
--
-- NÃO APLICADO. Rodar por blocos — o editor do Supabase roda tudo
-- em uma transação e um erro no meio desfaz o que já passou.
--
-- POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE SUBSTITUI O REPRESADO
--
-- O 05 mede ausência por turma. Descobrimos que isso mede a coisa
-- errada: a consultora vende "IF34 de setembro" para quem nunca
-- pretendeu ir em setembro. O cliente tem um ano a partir da compra
-- para fazer o curso, e passando disso paga R$ 200 de taxa de
-- transferência — que é cobrada de verdade.
--
-- Ou seja: faltar na turma da venda não é problema. Perder o prazo é.
--
-- A turma da venda é ficção comercial e não deve aparecer em
-- indicador nenhum. O relógio é `data_matricula + 365`.
-- (`data_fechamento_venda` é idêntica a `data_matricula` nas 7.954
--  linhas em que existe — diferença zero. A data da compra é a
--  matrícula.)
--
-- O QUE ISSO SUBSTITUI NA TELA
--
-- A "Lista de reativação · 1.242 alunos" do hub da Elis. Lista de
-- 1.242 itens não é lista de trabalho, é papel de parede — e mostra
-- CPF cru porque juntava por chave errada. Aqui são ~211 pessoas
-- ordenadas por urgência, com nome e telefone.
--
-- CHAVES — as duas armadilhas deste banco
--
-- 1. `fato_base_alunos.aluno_id` É O CPF (20.209 de 20.531 linhas
--    com 11 dígitos). Já `dim_alunos.aluno_id` é o ID do Salesforce
--    (001V2000...). Juntar os dois por aluno_id casa 2 de 99.
--    Juntar por `dim_alunos.cpf_norm` casa 86%.
--
-- 2. `dim_alunos.cpf` está truncado em ~7.000 linhas (zeros à
--    esquerda comidos numa conversão para número). Usar SEMPRE
--    `cpf_norm`, nunca `cpf`.
-- ============================================================


-- ============================================================
-- PARTE 1 — HORIZONTE DO CALENDÁRIO
--
-- O calendário vai até onde o planejamento do ano foi cadastrado —
-- hoje 26/11/2026. Isso não é falha: são as turmas que existem no
-- ano. O 1º semestre de 2027 entra quando a Elis e o Bruno
-- planejarem.
--
-- Mas muda o alerta. A partir de setembro, quem vencer depois de
-- novembro apareceria como "sem turma no prazo" — e não é verdade,
-- é calendário não planejado ainda. Se a tela gritar isso para
-- duzentas pessoas, a Elis para de confiar nela em uma semana.
--
-- O horizonte sai do próprio banco. Quando o 2027 for cadastrado,
-- a tela se ajusta sozinha, sem tocar em código.
-- ============================================================

create or replace view vw_calendario_horizonte as
select max(data_inicio) as ate,
       count(*) filter (where data_inicio > current_date) as turmas_futuras
  from dim_turmas;

comment on view vw_calendario_horizonte is
  'Até quando o calendário de turmas foi planejado. Nada codificado:
   quando o planejamento do semestre seguinte entrar em dim_turmas,
   o alerta de "sem turma no prazo" se reajusta sozinho.';


-- ============================================================
-- PARTE 2 — A FILA
--
-- Uma linha por PESSOA + CURSO, não por matrícula. No print da tela
-- antiga a mesma pessoa aparecia três vezes, duas delas na mesma
-- turma (PAPW8-5, uma com R$ 0,00 e outra com R$ 597,00) — duplicata
-- no Salesforce ou parcela virando linha. Agrupar evita a Elis
-- ligar duas vezes para a mesma pessoa pelo mesmo curso.
--
-- Só cursos que registram presença. Team Coaching, Coaching
-- Individual e produtos de livro não passam por credenciamento —
-- ali ausência de registro não significa ausência de pessoa.
-- ============================================================

create or replace view vw_pedagogico_prazo as
with cursos_com_registro as (
  select distinct norm_curso(curso) as c
    from fato_presenca
   where data_registro >= current_date - interval '18 months'
),
matricula as (
  select a.aluno_id                          as cpf,
         a.curso_id                          as curso,
         min(a.data_matricula)               as comprou_em,
         min(a.data_matricula) + 365         as vence_em,
         sum(a.valor)                        as valor,
         max(a.consultor_id)                 as consultor,
         min(a.turma)                        as turma_da_venda
    from fato_base_alunos a
    join cursos_com_registro cr on cr.c = norm_curso(a.curso_id)
   where a.status_matricula = 'Aprovada'
     and a.data_matricula >= current_date - interval '3 years'
   group by a.aluno_id, a.curso_id
),
ja_fez as (
  select distinct m.cpf, m.curso
    from matricula m
    join fato_presenca p
      on p.cpf = m.cpf
     and norm_curso(p.curso) = norm_curso(m.curso)
),
proxima_turma as (
  select norm_curso(curso) as c,
         min(data_inicio)  as proxima,
         min(turma_id)     as turma_id
    from dim_turmas
   where data_inicio > current_date
   group by 1
)
select m.cpf,
       al.nome,
       al.telefone,
       al.email,
       m.curso,
       m.comprou_em,
       m.vence_em,
       m.vence_em - current_date        as dias_restantes,
       round(m.valor)                   as valor,
       m.consultor,
       m.turma_da_venda,
       pt.turma_id                      as proxima_turma,
       pt.proxima                       as proxima_turma_em,
       case
         when m.vence_em < current_date                      then 'vencido'
         when m.vence_em > (select ate from vw_calendario_horizonte)
                                                             then 'aguardando calendario'
         when pt.proxima is null or pt.proxima > m.vence_em  then 'sem turma no prazo'
         when m.vence_em - current_date <= 90                then 'vencendo'
         else 'no prazo'
       end as situacao
  from matricula m
  left join ja_fez f       on f.cpf = m.cpf and f.curso = m.curso
  left join dim_alunos al  on al.cpf_norm = m.cpf
  left join proxima_turma pt on pt.c = norm_curso(m.curso)
 where f.cpf is null
   and pode_ver('pedagogico');

comment on view vw_pedagogico_prazo is
  'Comprou, ainda não fez, e o relógio de 1 ano está correndo.
   Uma linha por pessoa + curso. A turma da venda aparece só como
   referência — ela não define nada, porque é frequentemente uma
   turma que o cliente nunca pretendeu fazer.

   As cinco situações:
     vencido               passou de 1 ano. Taxa de R$ 200.
     vencendo              menos de 90 dias e existe turma. LIGAR.
     sem turma no prazo    o calendário cobre o período e não há
                           turma antes do vencimento. Abrir turma
                           ou assumir a taxa.
     aguardando calendario vence depois do horizonte planejado.
                           Não é problema — some quando o semestre
                           seguinte for cadastrado.
     no prazo              tem tempo e tem turma.';


-- ============================================================
-- PARTE 3 — O CARD DO HUB
-- ============================================================

create or replace view vw_pedagogico_prazo_resumo as
select count(*) filter (where situacao = 'vencendo')             as vencendo_90d,
       count(*) filter (where situacao = 'sem turma no prazo')   as sem_turma,
       count(*) filter (where situacao = 'vencido')              as vencidos,
       count(*) filter (where situacao = 'aguardando calendario') as aguardando_calendario,
       count(*) filter (where situacao in ('vencendo','sem turma no prazo')
                          and telefone is null)                  as urgentes_sem_telefone,
       (select ate from vw_calendario_horizonte)                 as calendario_ate,
       (select max(carregado_em)::date from fato_presenca)       as presenca_carregada_em
  from vw_pedagogico_prazo;

comment on view vw_pedagogico_prazo_resumo is
  'Card do hub. `urgentes_sem_telefone` é fila de trabalho, não erro:
   ~69 das 211 pessoas urgentes não têm contato em dim_alunos, e
   achar o telefone antes do prazo virar taxa é tarefa de alguém.
   `presenca_carregada_em` precisa aparecer na tela: a carga é
   manual, e foi por falta exatamente deste aviso que ninguém
   percebeu o credenciamento morrer ao longo de 2025.';


-- ============================================================
-- PARTE 4 — DEMANDA POR MÊS, PARA O PLANEJAMENTO
--
-- Este é o uso que a lista tem além do telefone: ela diz quantas
-- turmas de cada curso precisam existir, e até quando.
--
-- Medido hoje, o vencimento se concentra em mar/abr/mai de 2027:
-- 126, 163 e 106 pessoas. A turma precisa acontecer ANTES do
-- vencimento — turma de IF em abril não resolve quem vence em março.
--
-- Levar esta tabela para a reunião de planejamento do semestre.
-- ============================================================

create or replace view vw_pedagogico_demanda_mes as
select to_char(vence_em, 'YYYY-MM') as mes_do_vencimento,
       curso,
       count(*)                     as pessoas,
       min(vence_em)                as primeiro_vencimento
  from vw_pedagogico_prazo
 where situacao <> 'vencido'
 group by 1, 2
 order by 1, 3 desc;

comment on view vw_pedagogico_demanda_mes is
  'Quantas pessoas perdem o direito a cada curso, mês a mês. É o
   insumo do calendário: a turma precisa existir antes da coluna
   `primeiro_vencimento`, não depois.';

grant select on vw_calendario_horizonte,
                vw_pedagogico_prazo,
                vw_pedagogico_prazo_resumo,
                vw_pedagogico_demanda_mes
  to authenticated;


-- ============================================================
-- O QUE FICA EM ABERTO
--
-- 1. O balde `vencido` está inflado. Ele inclui compras de 2024,
--    quando o registro de presença era ruim — parte dessa gente foi
--    ao curso e não ficou registrada. Não brigue por esse número.
--    O balde `vencendo` é confiável: quem vence nos próximos 90
--    dias comprou a partir de agosto de 2025, período com cobertura
--    boa.
--
-- 2. `valor` vem quase todo zerado em fato_base_alunos. Se a coluna
--    não ajudar a priorizar, é melhor tirar da tela do que exibir
--    R$ 0,00 — valor zero em lista de cobrança destrói a confiança
--    no resto. Conferir se o valor real está em fato_pagamento_base.
--
-- 3. ML5 tem 18 pessoas vencendo e NENHUMA turma futura cadastrada.
--    É o caso concreto de 'sem turma no prazo': ou abre turma, ou
--    são 18 taxas de R$ 200 em cliente que já pagou o curso.
--
-- 4. dim_turmas futuras têm `sincronizado_em` nulo — cadastro
--    manual da Elis e do Bruno, não vem do Salesforce. A lista é
--    tão boa quanto a última vez que alguém cadastrou. Vale um
--    aviso na tela quando o horizonte estiver a menos de 90 dias.
-- ============================================================
