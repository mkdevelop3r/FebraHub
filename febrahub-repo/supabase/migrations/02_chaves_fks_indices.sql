-- ============================================================
-- FebraHub · Migration 02 — Chaves, FKs e Índices
-- Rodar POR BLOCO, na ordem. Não rode tudo de uma vez:
-- o bloco 2 (órfãos) decide se o bloco 3 (FKs) vai funcionar.
-- ============================================================


-- ============================================================
-- BLOCO 1 — Padronizar nomes de chave (sufixo _id, sempre)
-- ============================================================
begin;

-- fato_negocio_lead: fonte usa prefixo id_, o resto do banco usa sufixo
alter table public.fato_negocio_lead rename column id_negocio   to negocio_id;
alter table public.fato_negocio_lead rename column id_origem    to origem_id;
alter table public.fato_negocio_lead rename column id_consultor to consultor_id;
alter table public.fato_negocio_lead rename column id_contato   to lead_id;

-- dim_leads: a PK precisa ter o nome da entidade, não da fonte
alter table public.dim_leads rename column id_contato to lead_id;

commit;


-- ============================================================
-- BLOCO 2 — Checagem de órfãos (RODE E LEIA ANTES DO BLOCO 3)
-- Cada linha aqui é uma FK que vai FALHAR se o count > 0.
-- ============================================================

select 'negocio_lead -> consultor' as relacao, count(*) as orfaos
from public.fato_negocio_lead f
left join public.dim_consultores d on d.consultor_id = f.consultor_id
where f.consultor_id is not null and d.consultor_id is null

union all
select 'negocio_lead -> origem', count(*)
from public.fato_negocio_lead f
left join public.dim_origens d on d.origem_id = f.origem_id
where f.origem_id is not null and d.origem_id is null

union all
select 'negocio_lead -> lead', count(*)
from public.fato_negocio_lead f
left join public.dim_leads d on d.lead_id = f.lead_id
where f.lead_id is not null and d.lead_id is null;

-- Cobertura do calendário: se faltar dia, a FK de data quebra.
select
  (select min(data) from public.dim_calendario) as calendario_inicio,
  (select max(data) from public.dim_calendario) as calendario_fim,
  (select min(data_criacao)::date from public.fato_negocio_lead) as fato_inicio,
  (select max(data_criacao)::date from public.fato_negocio_lead) as fato_fim;


-- ============================================================
-- BLOCO 3 — Coluna de data + FKs
-- Só rode se o BLOCO 2 voltou tudo zerado.
-- ============================================================
begin;

-- Não dá pra ligar timestamp -> date. Cria uma coluna derivada,
-- calculada pelo próprio banco, imutável e indexável.
alter table public.fato_negocio_lead
  add column if not exists data_criacao_dia date
  generated always as (data_criacao::date) stored;

alter table public.fato_negocio_lead
  add constraint fk_negocio_consultor
    foreign key (consultor_id) references public.dim_consultores(consultor_id),
  add constraint fk_negocio_origem
    foreign key (origem_id)    references public.dim_origens(origem_id),
  add constraint fk_negocio_lead
    foreign key (lead_id)      references public.dim_leads(lead_id),
  add constraint fk_negocio_data
    foreign key (data_criacao_dia) references public.dim_calendario(data);

commit;


-- ============================================================
-- BLOCO 4 — Índices desenhados a partir dos KPIs dos hubs
-- Cada índice abaixo existe por causa de uma query específica.
-- ============================================================
begin;

-- Hub Comercial: funil e conversão por período
create index if not exists ix_negocio_data
  on public.fato_negocio_lead (data_criacao_dia);

-- Hub Comercial: ranking de consultores no mês
create index if not exists ix_negocio_consultor_data
  on public.fato_negocio_lead (consultor_id, data_criacao_dia);

-- Hub Marketing: leads por origem/campanha
create index if not exists ix_negocio_origem_data
  on public.fato_negocio_lead (origem_id, data_criacao_dia);

-- Hub Comercial: taxa de conversão por etapa do funil
create index if not exists ix_negocio_etapa
  on public.fato_negocio_lead (etapa_funil, data_criacao_dia);

-- Hub Pedagógico: matrículas e conclusão por curso/turma
create index if not exists ix_matricula_curso_data
  on public.fato_base_alunos (curso_id, data_matricula);

create index if not exists ix_matricula_conclusao
  on public.fato_base_alunos (data_conclusao)
  where data_conclusao is not null;

-- Hub Financeiro: receita por período (ajuste o nome da coluna
-- de data quando você me mandar o resto de fato_pagamento_base)
-- create index if not exists ix_pagamento_data
--   on public.fato_pagamento_base (data_pagamento);

commit;
