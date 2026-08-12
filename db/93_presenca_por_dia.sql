-- ============================================================
-- 03 — PRESENÇA POR DIA + CONSERTO DO CPF
--
-- NÃO APLICADO AINDA. Ler as três decisões abaixo antes de rodar.
--
-- Por que este arquivo existe:
--
-- `fato_credenciamento` morreu como fonte. A curva conta a história:
-- 5.275 registros em 2022, 3.660 em 2024, 726 em 2025, 4 em 2026 —
-- e o que sobrou é quase só CIS Global. As views que dependem dela
-- (vw_pedagogico_ausentes, vw_comprou_nao_compareceu) continuam
-- corretas na lógica, mas estão lendo de uma fonte vazia.
--
-- O relatório de PRESENÇA do Salesforce é a fonte viva: 1.887
-- registros em 2026, 20 turmas, todos os cursos, granularidade por
-- dia de aula. Este arquivo traz essa fonte para o banco e reconecta
-- as views existentes, sem reescrevê-las.
-- ============================================================


-- ============================================================
-- PARTE 1 — CPF: 6.970 alunos com zero à esquerda comido
--
-- `dim_alunos` tem 11.886 CPFs preenchidos, mas só 4.916 com 11
-- dígitos: 6.325 têm 10, 616 têm 9. Alguém converteu CPF para
-- número em algum ponto da carga do Salesforce e "00388430648"
-- virou "388430648".
--
-- Medido numa amostra de 300 CPFs do relatório de presença:
--   casamento hoje ................ 35,3%
--   casamento com lpad ............ 84,7%
--
-- Coluna GERADA, não update: o valor bruto continua intacto para
-- auditoria, e qualquer carga futura já nasce normalizada sem
-- depender de alguém lembrar de rodar correção.
--
-- ATENÇÃO — isto não conserta a ingestão. Enquanto o script que
-- alimenta dim_alunos tratar CPF como número, o dado bruto continua
-- chegando truncado. Corrigir lá também.
-- ============================================================

alter table dim_alunos
  add column cpf_norm text
  generated always as (
    nullif(lpad(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), 11, '0'), '00000000000')
  ) stored;

create index if not exists dim_alunos_cpf_norm on dim_alunos (cpf_norm);

comment on column dim_alunos.cpf_norm is
  'CPF com 11 dígitos, zeros à esquerda restaurados. Use SEMPRE esta
   coluna para junção — `cpf` está truncado em ~7.000 linhas por uma
   conversão para número na carga do Salesforce.';


-- ============================================================
-- PARTE 2 — PRESENÇA
--
-- Uma linha por pessoa × turma × dia de aula.
--
-- O relatório traz o dia embutido no texto do campo "Presença"
-- ("FULANO-CIS-GL-Dia 1"). A carga extrai o número.
--
-- `data_registro` é a data de CRIAÇÃO do registro no Salesforce,
-- NÃO a data da aula — confirmado com a operação. Serve para saber
-- quando entrou, nunca para saber quando a aula foi. Quem precisar
-- da data da aula usa dim_turmas.
--
-- Sem FK para dim_alunos de propósito: ~15% da presença é de gente
-- que ainda não entrou em dim_alunos. Barrar essas linhas jogaria
-- fora presença real de aluno recente.
-- ============================================================

create table stg_presenca (
  nome           text,
  unidade_venda  text,
  unidade        text,
  curso          text,
  presenca_txt   text,
  data_registro  text,
  turma          text,
  cpf            text
);

comment on table stg_presenca is
  'Área de pouso do CSV bruto do Salesforce. Truncar antes de cada
   carga. Tudo text: a conversão acontece na promoção para fato_presenca.';

create table fato_presenca (
  id            bigserial primary key,
  cpf           text not null,           -- já normalizado, 11 dígitos
  nome          text,
  curso         text,
  turma         text not null,
  dia           int  not null,           -- 1..8, extraído do texto
  data_registro date,
  unidade       text,
  carregado_em  timestamptz not null default now(),
  unique (cpf, turma, dia)
);

comment on column fato_presenca.data_registro is
  'Data de criação do registro no Salesforce. NÃO é a data da aula.';

comment on column fato_presenca.carregado_em is
  'Quando esta linha entrou no banco. fato_credenciamento não tem
   equivalente, e é por isso que ninguém percebeu que ela parou de
   ser alimentada. Não repetir o erro.';

create index fato_presenca_turma on fato_presenca (turma);
create index fato_presenca_cpf   on fato_presenca (cpf);


-- ------------------------------------------------------------
-- Promoção stg -> fato
-- Roda depois de cada carga do CSV. Idempotente.
-- As 198 linhas duplicadas do relatório (mesma pessoa, turma e dia)
-- são colapsadas pelo on conflict.
-- ------------------------------------------------------------
create or replace function promover_presenca()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lidas    int;
  v_gravadas int;
  v_sem_cpf  int;
begin
  if app_papel() is null and meu_papel() not in ('admin','gestao') then
    raise exception 'Sem permissão';
  end if;

  select count(*) into v_lidas from stg_presenca;

  select count(*) into v_sem_cpf
    from stg_presenca
   where nullif(regexp_replace(coalesce(cpf,''), '\D', '', 'g'), '') is null;

  insert into fato_presenca (cpf, nome, curso, turma, dia, data_registro, unidade)
  select lpad(regexp_replace(cpf, '\D', '', 'g'), 11, '0'),
         nullif(btrim(nome), ''),
         nullif(btrim(curso), ''),
         btrim(turma),
         (regexp_match(presenca_txt, 'Dia\s*(\d+)'))[1]::int,
         to_date(nullif(btrim(data_registro), ''), 'DD/MM/YYYY'),
         nullif(btrim(unidade), '')
    from stg_presenca
   where nullif(regexp_replace(coalesce(cpf,''), '\D', '', 'g'), '') is not null
     and turma is not null
     and presenca_txt ~ 'Dia\s*\d+'
  on conflict (cpf, turma, dia) do update
    set nome          = excluded.nome,
        curso         = excluded.curso,
        data_registro = excluded.data_registro,
        carregado_em  = now();

  get diagnostics v_gravadas = row_count;

  return jsonb_build_object(
    'lidas', v_lidas, 'gravadas', v_gravadas, 'descartadas_sem_cpf', v_sem_cpf
  );
end $$;

revoke execute on function promover_presenca from anon;


-- ============================================================
-- PARTE 3 — RECONECTAR O QUE JÁ EXISTE
--
-- `vw_pedagogico_ausentes` e `vw_comprou_nao_compareceu` já estão
-- certas na lógica, inclusive no cuidado de só considerar turmas
-- com cobertura mínima (50% e 45%) — que é a proteção contra
-- chamar de ausente quem estava numa turma sem registro.
--
-- Elas não são reescritas aqui. O que muda é a fonte embaixo:
-- esta view une credenciamento (histórico, até 2025) e presença
-- (atual), no formato que aquelas views já esperam.
--
-- MIGRAÇÃO: depois de validar esta view, trocar nas duas views
-- existentes `fato_credenciamento` por `vw_comparecimento`. Isso
-- vai em arquivo próprio (04), não aqui — para dar chance de
-- comparar os números lado a lado antes de virar a chave.
-- ============================================================

create view vw_comparecimento as
-- histórico: credenciamento (aluno_id do Salesforce), até 2025
select c.aluno_id,
       c.curso_id,
       c.turma,
       c.data_credenciamento as data,
       1                     as dia,
       'credenciamento'      as fonte
  from fato_credenciamento c
union all
-- atual: presença, casada por CPF normalizado
select a.aluno_id,
       p.curso   as curso_id,
       p.turma,
       p.data_registro as data,
       p.dia,
       'presenca'      as fonte
  from fato_presenca p
  join dim_alunos a on a.cpf_norm = p.cpf;

comment on view vw_comparecimento is
  'Comparecimento unificado. `fonte` diz de onde veio cada linha —
   credenciamento morreu em 2025, presença é a fonte viva. A junção
   por cpf_norm perde ~15%: alunos que ainda não estão em dim_alunos.
   Toda tela que mostrar número daqui precisa mostrar também a
   cobertura, senão ausência de registro vira ausência de pessoa.';


-- ============================================================
-- COBERTURA — o guarda-costas de todo indicador daqui
--
-- Sem isto, uma turma sem registro nenhum produz "100% de ausentes"
-- e alguém liga para vinte alunos que estavam presentes.
-- ============================================================
create view vw_presenca_cobertura as
select m.turma,
       count(distinct m.aluno_id)                     as matriculados,
       count(distinct c.aluno_id)                     as compareceram,
       round(100.0 * count(distinct c.aluno_id)
             / nullif(count(distinct m.aluno_id), 0)) as cobertura_pct,
       max(c.fonte)                                   as fonte
  from fato_base_alunos m
  left join vw_comparecimento c
         on c.turma = m.turma and c.aluno_id = m.aluno_id
 where m.status_matricula = 'Aprovada'
 group by m.turma;

grant select on vw_comparecimento, vw_presenca_cobertura to authenticated;


-- ============================================================
-- COMO CARREGAR O CSV
--
--   1. No Supabase: Table editor -> stg_presenca -> Import data from CSV
--      (o arquivo é ISO-8859-1 / latin1 — converter para UTF-8 antes,
--       senão acento vira lixo)
--   2. select promover_presenca();
--   3. select * from vw_presenca_cobertura order by cobertura_pct;
--   4. truncate stg_presenca;
--
-- O passo 3 é o que interessa: turma com cobertura baixa não é turma
-- com aluno faltando, é turma sem registro. Olhar antes de acreditar.
-- ============================================================
