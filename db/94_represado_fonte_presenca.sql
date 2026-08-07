-- ============================================================
-- 05 — REPRESADO SOBRE PRESENÇA, VALIDADO CONTRA O SALESFORCE
--
-- NÃO APLICADO. Ler as decisões antes de rodar.
--
-- Validação que motivou este arquivo:
--
--   Turma 2026 - IF035, tela do Salesforce:
--     147 credenciados · 90 não credenciados · 237 total
--   Nossa fato_presenca:
--     147 pessoas distintas · 237 matriculados
--
-- Casou exato. O mecanismo está certo, e "não credenciado" já é
-- conceito da operação — represado não é invenção do FebraHub.
--
-- (Nossa vw_pedagogico_represados_turma diz 142, não 147, porque
--  exige matrícula aprovada NA MESMA TURMA. São perguntas
--  diferentes: o Salesforce conta quem passou pela porta, nós
--  contamos quem comprou e passou pela porta. Para represado a
--  nossa é a correta. Os 5 de diferença viram indicador próprio
--  na Parte 2 em vez de sumirem numa nota de rodapé.)
-- ============================================================


-- ============================================================
-- PARTE 1 — SÓ A FONTE VIVA
--
-- O 04 incluiu o histórico de credenciamento e trouxe 120 turmas
-- desde 2022. Duas razões para cortar isso agora:
--
-- 1. As turmas antigas têm comportamento impossível: mais de vinte
--    delas com 100% de comparecimento, incluindo uma de 93 pessoas
--    com 93 presentes. Turma cheia sem uma falta não existe. O
--    credenciamento antigo provavelmente só registrava quem
--    apareceu, sem lista de matriculados para confrontar — ou a
--    matrícula nascia do próprio credenciamento. Misturar isso com
--    presença real infla a confiança no número.
--
-- 2. Ninguém vai ligar para quem faltou em 2023. Represado só vale
--    como indicador se for acionável.
--
-- As 20 turmas de 2026 bastam, e são as validadas.
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
 where t.data_inicio <= current_date          -- turma futura não é represado
   and c.matriculados >= 10                   -- abaixo disso o % oscila demais
   and c.cobertura_pct >= 40                  -- turma sem registro não conta
   and exists (                               -- só onde a fonte é presença
     select 1 from fato_presenca p where p.turma = c.turma
   );

comment on view vw_turmas_mensuraveis is
  'Turmas onde ausência significa alguma coisa: já aconteceram, têm
   registro de presença de verdade (>=40%) e volume mínimo. Fora
   daqui, falta de registro não é falta de aluno. O corte de 40% saiu
   da distribuição real de 2026, que ficou entre 42% e 91% — os 50%
   da view antiga cortariam FOP19 e FGPC025, que têm presença
   legítima.';


-- ============================================================
-- PARTE 2 — PRESENTE SEM MATRÍCULA
--
-- Cinco pessoas assistiram à IF035 sem matrícula aprovada naquela
-- turma. Pode ser cortesia, matrícula em status errado, aluno de
-- outra turma assistindo, ou furo de processo.
--
-- Vira indicador próprio em vez de virar diferença inexplicada
-- entre a nossa tela e a do Salesforce. Quem for conferir os dois
-- números lado a lado precisa achar a explicação no sistema, não
-- descobrir sozinho.
-- ============================================================

create or replace view vw_pedagogico_presente_sem_matricula as
select p.turma,
       p.cpf,
       max(p.nome)  as nome,
       max(p.curso) as curso,
       min(p.data_registro) as primeiro_registro
  from fato_presenca p
  join vw_turmas_mensuraveis t on t.turma = p.turma
 where not exists (
   select 1 from fato_base_alunos m
    where m.turma = p.turma
      and m.aluno_id = p.cpf
      and m.status_matricula = 'Aprovada'
 )
   and pode_ver('pedagogico')
 group by p.turma, p.cpf;

comment on view vw_pedagogico_presente_sem_matricula is
  'Compareceu mas não tem matrícula aprovada nesta turma. É a
   diferença entre o número do Salesforce (147 na IF035) e o nosso
   (142). Não é erro: é gente que passou pela porta sem venda
   aprovada vinculada. Vale conferir caso a caso.';


-- ============================================================
-- PARTE 3 — AS VIEWS ANTIGAS VIRAM WRAPPERS
--
-- `vw_pedagogico_ausentes` e `vw_comprou_nao_compareceu` ainda leem
-- fato_credenciamento, ou seja, ainda devolvem só o histórico até
-- 2025. Elas passam a apontar para a lógica nova.
--
-- Duas definições da mesma pergunta é como telas começam a divergir
-- entre si. A partir daqui existe uma só, e as antigas continuam
-- respondendo pelo nome antigo para não quebrar o que já consome.
--
-- ANTES DE RODAR, compare:
--   select 'antiga' o, count(*) from vw_pedagogico_ausentes
--   union all select 'nova', count(*) from vw_pedagogico_represados;
-- Os números VÃO mudar — a antiga olha 2022-2025, a nova olha 2026.
-- É a mudança pretendida, mas se alguma tela mostra o número velho,
-- avise antes de virar a chave.
-- ============================================================

create or replace view vw_pedagogico_ausentes as
select cpf as aluno_id,
       turma,
       curso,
       consultor,
       data_matricula,
       valor
  from vw_pedagogico_represados
 order by data_matricula desc;

comment on view vw_pedagogico_ausentes is
  'Mantida pelo nome para não quebrar telas. A lógica vive em
   vw_pedagogico_represados. Fonte trocada de fato_credenciamento
   (morta desde 2025) para fato_presenca.';

create or replace view vw_comprou_nao_compareceu as
select cpf as aluno_id,
       curso as curso_id,
       turma,
       valor,
       data_matricula,
       consultor as consultor_id
  from vw_pedagogico_represados;


-- ============================================================
-- PARTE 4 — O CARD DA ELIS
--
-- Um número só não serve. Represado sem cobertura ao lado convida
-- à leitura errada: 51% de represado numa turma com 49% de
-- cobertura pode ser evasão real ou pode ser metade da turma que
-- ninguém bipou. A tela precisa mostrar os dois juntos, sempre.
-- ============================================================

create or replace view vw_pedagogico_represados_resumo as
select count(*)                              as turmas,
       sum(t.matriculados)                   as matriculados,
       sum(t.compareceram)                   as compareceram,
       sum(t.matriculados - t.compareceram)  as represados,
       round(100.0 * sum(t.matriculados - t.compareceram)
             / nullif(sum(t.matriculados), 0)) as pct_represado,
       min(t.cobertura_pct)                  as pior_cobertura,
       max(t.data_inicio)                    as turma_mais_recente,
       (select max(carregado_em)::date from fato_presenca) as ultima_carga
  from vw_turmas_mensuraveis t
 where pode_ver('pedagogico');

comment on view vw_pedagogico_represados_resumo is
  'Card do hub. `pior_cobertura` e `ultima_carga` não são enfeite:
   são o que impede o número grande de ser lido como verdade
   absoluta. Se ultima_carga passar de 30 dias, a tela precisa
   dizer que o dado está envelhecendo — foi por falta exatamente
   disso que ninguém percebeu o credenciamento morrer.';

grant select on vw_turmas_mensuraveis,
                vw_pedagogico_presente_sem_matricula,
                vw_pedagogico_represados_resumo
  to authenticated;


-- ============================================================
-- O QUE CONTINUA EM ABERTO
--
-- 1. A carga é manual. Exportar CSV, importar em stg_presenca,
--    rodar promover_presenca(). Foi assim que o credenciamento
--    morreu: sem ninguém perceber. `vw_presenca_saude` detecta,
--    mas detectar não é resolver. Automatizar a ingestão é o
--    próximo trabalho de verdade.
--
-- 2. dim_alunos cobre 6% dos alunos matriculados em 2026 e 20% em
--    2022. Não afeta mais este módulo (a junção passou a ser por
--    CPF direto, que é o próprio aluno_id), mas afeta qualquer
--    outra tela que junte por ela. Vale mapear onde é usada.
--
-- 3. Turma com represado acima de 40% precisa de conferência
--    humana antes de virar ação. IF035 (40%) e CIS-GL249 (51%)
--    são altos demais para serem só falta. Pegar dez nomes e
--    conferir com a Elis separa "problema de evasão" de "problema
--    de registro" — nenhuma consulta responde isso.
-- ============================================================
