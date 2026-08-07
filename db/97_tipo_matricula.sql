-- ============================================================
-- 08 — TIPO DE MATRÍCULA
--
-- NÃO APLICADO. Rodar por blocos, na ordem do arquivo.
--
-- Recria toda a cadeia de views do prazo. `vw_pedagogico_prazo`
-- muda de assinatura, e no Postgres isso exige drop — `create or
-- replace` não altera nome, tipo nem ordem de coluna.
--
-- O QUE MUDA E POR QUÊ
--
-- `fato_base_alunos.tipo_matricula` distingue coisas que a fila
-- estava tratando como iguais:
--
--   CONSUMIDOR DE VAGAS      3.918 linhas   valor 0 em 3.916
--   Matrícula                3.416          média R$ 5.640
--   COMPRADOR DE VAGAS       1.915          média R$ 5.429
--   Bônus                    1.796          valor 0 em 1.750
--   Taxa de Transferência…     609 + 17 + 24 (Transferido)
--
-- Três regras saíram da conversa com a operação:
--
-- 1. COMPRADOR DE VAGAS é sempre terceiro pagador — empresa ou
--    pessoa que compra vagas para outros. Não é aluno. Se ele
--    também fizer o curso, aparece numa linha de CONSUMIDOR.
--    Sai da fila. (1.013 pares pessoa+curso têm SÓ linha de
--    comprador: são compradores que nunca fizeram o curso, e
--    somem corretamente.)
--
-- 2. Transferência NÃO renova o prazo. O relógio continua contando
--    da compra original, então o corte é `min(data_matricula)`.
--    As linhas de 'Taxa de Transferência' e 'Transferido' ficam,
--    mas nunca definem o início — são sempre posteriores.
--
-- 3. Bônus, Cortesia, Staff, Permuta TÊM prazo de 1 ano, igual a
--    todo mundo. Ficam na fila.
--
-- IMPACTO MEDIDO: 134 → 117 urgentes, 1.800 → 1.588 pendentes.
--
-- E RESOLVE O MISTÉRIO DO VALOR ZERADO: a linha do aluno é a de
-- CONSUMIDOR, que é zero por construção — quem pagou foi o
-- comprador. `valor` nunca foi falha de dado; é o modelo de
-- negócio. Por isso ele sai da fila de ligação: somar zeros só
-- destrói a confiança no resto da tela.
-- ============================================================


-- ------------------------------------------------------------
-- DROP na ordem das dependências
-- ------------------------------------------------------------
drop view if exists vw_pedagogico_prazo_resumo;
drop view if exists vw_pedagogico_prazo_pessoa;
drop view if exists vw_pedagogico_prazo_sem_contato;
drop view if exists vw_pedagogico_demanda_mes;
drop view if exists vw_pedagogico_maestria_prazo;
drop view if exists vw_pedagogico_prazo_salvador;
drop view if exists vw_pedagogico_prazo;


-- ------------------------------------------------------------
-- BASE
-- ------------------------------------------------------------
create view vw_pedagogico_prazo as
with cursos_com_registro as (
  select distinct norm_curso(curso) as c
    from fato_presenca
   where data_registro >= current_date - interval '18 months'
),
matricula as (
  select a.aluno_id                  as cpf,
         a.curso_id                  as curso,
         min(a.data_matricula)       as comprou_em,
         min(a.data_matricula) + 365 as vence_em,
         max(a.consultor_id)         as consultor,
         min(a.turma)                as turma_da_venda,
         string_agg(distinct a.tipo_matricula, ', ') as tipos,
         bool_or(a.tipo_matricula in ('Taxa de Transferência',
                                      'Taxa de Transferência Isento',
                                      'Transferido')) as ja_transferiu
    from fato_base_alunos a
    join cursos_com_registro cr on cr.c = norm_curso(a.curso_id)
   where a.status_matricula = 'Aprovada'
     and a.data_matricula >= current_date - interval '3 years'
     and a.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   group by a.aluno_id, a.curso_id
),
ja_fez as (
  select distinct m.cpf, m.curso
    from matricula m
    join fato_presenca p
      on p.cpf = m.cpf and norm_curso(p.curso) = norm_curso(m.curso)
),
proxima_turma as (
  select norm_curso(curso) as c, min(data_inicio) as proxima, min(turma_id) as turma_id
    from dim_turmas where data_inicio > current_date group by 1
)
select m.cpf, al.nome, al.telefone, al.email, m.curso,
       m.comprou_em, m.vence_em,
       m.vence_em - current_date as dias_restantes,
       m.consultor, m.turma_da_venda, m.tipos, m.ja_transferiu,
       pt.turma_id as proxima_turma, pt.proxima as proxima_turma_em,
       case
         when m.vence_em < current_date then 'vencido'
         when m.vence_em > (select ate from vw_calendario_horizonte) then 'aguardando calendario'
         when pt.proxima is null or pt.proxima > m.vence_em then 'sem turma no prazo'
         when m.vence_em - current_date <= 90 then 'vencendo'
         else 'no prazo'
       end as situacao
  from matricula m
  left join ja_fez f on f.cpf = m.cpf and f.curso = m.curso
  left join dim_alunos al on al.cpf_norm = m.cpf
  left join proxima_turma pt on pt.c = norm_curso(m.curso)
 where f.cpf is null
   and pode_ver('pedagogico');


-- ------------------------------------------------------------
-- FILA DE SALVADOR
-- ------------------------------------------------------------
create view vw_pedagogico_prazo_salvador as
select * from vw_pedagogico_prazo
 where coalesce(turma_da_venda,'') not ilike '%LISBOA%'
   and curso not ilike '%MAESTRIA%';


-- ------------------------------------------------------------
-- MAESTRIA — programa anual, tickets de R$ 45k a R$ 100k.
-- Conversa individual, não fila de ligação.
-- ------------------------------------------------------------
create view vw_pedagogico_maestria_prazo as
select cpf, nome, telefone, email, curso, comprou_em, vence_em,
       dias_restantes, consultor, turma_da_venda
  from vw_pedagogico_prazo
 where curso ilike '%MAESTRIA%';


-- ------------------------------------------------------------
-- SEM CONTATO — urgente e sem telefone. Fila de trabalho, não erro.
-- ------------------------------------------------------------
create view vw_pedagogico_prazo_sem_contato as
select cpf as identificador,
       case when cpf ~ '^\d{11}$' then 'CPF sem cadastro'
            when cpf like 'pj:%'  then 'venda PJ'
            when cpf like '%@%'   then 'e-mail no lugar do CPF'
            else 'identificador invalido' end as motivo,
       curso, comprou_em, vence_em, dias_restantes, consultor, turma_da_venda
  from vw_pedagogico_prazo_salvador
 where telefone is null
   and situacao in ('vencendo','sem turma no prazo');


-- ------------------------------------------------------------
-- A FILA DE LIGAÇÃO — uma linha por pessoa
-- Sem coluna de valor: a linha do aluno é CONSUMIDOR DE VAGAS,
-- zero por construção. Somar zeros destrói a confiança na tela.
-- ------------------------------------------------------------
create view vw_pedagogico_prazo_pessoa as
select cpf,
       max(nome) as nome, max(telefone) as telefone, max(email) as email,
       count(*) as cursos_pendentes,
       string_agg(curso || ' (' || dias_restantes || 'd)', ' · '
                  order by dias_restantes) as cursos,
       min(dias_restantes) as vence_em_dias,
       min(vence_em)       as primeiro_vencimento,
       max(consultor)      as consultor,
       bool_or(situacao='sem turma no prazo') as tem_curso_sem_turma,
       bool_or(ja_transferiu)                 as ja_transferiu_antes
  from vw_pedagogico_prazo_salvador
 where situacao in ('vencendo','sem turma no prazo')
 group by cpf;


-- ------------------------------------------------------------
-- DEMANDA POR MÊS — insumo do calendário
-- ------------------------------------------------------------
create view vw_pedagogico_demanda_mes as
select to_char(vence_em,'YYYY-MM') as mes_do_vencimento,
       curso, count(*) as pessoas, min(vence_em) as primeiro_vencimento
  from vw_pedagogico_prazo_salvador
 where situacao <> 'vencido'
 group by 1,2;


-- ------------------------------------------------------------
-- CARD DO HUB
-- ------------------------------------------------------------
create view vw_pedagogico_prazo_resumo as
select count(*) filter (where situacao='vencendo')             as vencendo_90d,
       count(*) filter (where situacao='sem turma no prazo')   as sem_turma,
       count(*) filter (where situacao='sem turma no prazo'
                          and dias_restantes<=30)              as sem_turma_em_30d,
       count(*) filter (where situacao='vencido')              as vencidos,
       count(*) filter (where situacao='aguardando calendario') as aguardando_calendario,
       (select count(*) from vw_pedagogico_prazo_pessoa)       as pessoas_para_ligar,
       (select count(*) from vw_pedagogico_prazo_sem_contato)  as urgentes_sem_telefone,
       (select ate from vw_calendario_horizonte)               as calendario_ate,
       (select max(carregado_em)::date from fato_presenca)     as presenca_carregada_em
  from vw_pedagogico_prazo_salvador;

grant select on vw_pedagogico_prazo, vw_pedagogico_prazo_salvador,
                vw_pedagogico_maestria_prazo, vw_pedagogico_prazo_sem_contato,
                vw_pedagogico_prazo_pessoa, vw_pedagogico_demanda_mes,
                vw_pedagogico_prazo_resumo
  to authenticated;


-- ============================================================
-- COMENTÁRIOS — rodar depois, num bloco separado
-- ============================================================
comment on view vw_pedagogico_prazo is
  'Comprou, ainda não fez, relógio de 1 ano correndo da compra
   ORIGINAL — transferência não renova prazo. COMPRADOR DE VAGAS
   fora: é terceiro pagador, não aluno. Bônus, Cortesia, Staff e
   Permuta ficam, têm prazo igual. `tipos` mostra do que a matrícula
   é feita, e `ja_transferiu` marca quem já usou a transferência
   uma vez — segunda conversa é diferente da primeira.';

comment on view vw_pedagogico_prazo_pessoa is
  'A fila de ligação da Elis. Uma linha por pessoa porque três
   cursos pendentes são um telefonema, não três. Sem coluna de
   valor: a linha do aluno é CONSUMIDOR DE VAGAS e vale zero por
   construção — quem pagou foi o comprador das vagas.';


-- ============================================================
-- O QUE CONTINUA EM ABERTO
--
-- 1. 91 pessoas sem turma do curso antes do vencimento, 34 delas
--    em 30 dias. O caso agudo é Inteligência Financeira: 21
--    vencem antes de 17/09, que é a próxima turma. Decisão de
--    calendário, não de software.
--
-- 2. `dim_turmas.cidade` está poluída (nome de pessoa, nome de
--    curso, siglas). Por isso o corte de Lisboa é por nome de
--    turma, que é grosseiro. Limpar a coluna permitiria filtro de
--    verdade — e existe aluno de São Paulo na fila recebendo
--    turma de Salvador, que pode ser certo ou errado conforme a
--    operação.
--
-- 3. A carga da presença continua manual.
-- ============================================================
