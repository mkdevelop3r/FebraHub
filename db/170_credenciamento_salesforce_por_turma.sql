-- ============================================================
-- 170 — CREDENCIAMENTO SALESFORCE POR TURMA
--
-- Fonte oficial:
--   Turma__c
--   Credenciamento__c
--   Presenca__c.Credenciamento__c
--
-- Esta migration é aditiva. Não altera fato_presenca, fato_base_alunos
-- nem as views pedagógicas atuais.
-- ============================================================

begin;

create table if not exists public.dim_turma_salesforce (
  turma_id                    text primary key,
  nome                        text not null,
  codigo_turma                text,
  curso_id                    text,
  curso_nome                  text,
  unidade_id                  text,
  unidade_nome                text,
  status                      text,
  status_entrega              text,
  turma_validada              boolean,
  quantidade_alunos_salesforce integer,
  link_credenciamento         text,
  atualizado_salesforce_em    timestamptz,
  sincronizado_em             timestamptz not null default now(),
  constraint dim_turma_salesforce_id_chk
    check (length(turma_id) in (15, 18))
);

comment on table public.dim_turma_salesforce is
  'Turmas do Salesforce. turma_id corresponde a Turma__c.Id.';

create table if not exists public.fato_credenciamento_turma (
  credenciamento_id           text primary key,
  turma_id                    text not null
    references public.dim_turma_salesforce(turma_id),
  venda_id                    text,
  cliente_id                  text,
  cpf                         text,
  nome_cliente                text,
  tipo_matricula_codigo       text,
  tipo_matricula              text,
  elegivel                    boolean not null,
  motivo_inelegibilidade      text,
  credenciado                 boolean not null default false,
  quantidade_presencas        integer not null default 0,
  primeira_presenca_em        timestamptz,
  ultima_presenca_em          timestamptz,
  atualizado_salesforce_em    timestamptz,
  sincronizado_em             timestamptz not null default now(),
  cpf_norm text generated always as (
    nullif(
      lpad(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), 11, '0'),
      '00000000000'
    )
  ) stored,
  constraint fato_credenciamento_turma_id_chk
    check (length(credenciamento_id) in (15, 18)),
  constraint fato_credenciamento_turma_presencas_chk
    check (quantidade_presencas >= 0),
  constraint fato_credenciamento_turma_elegibilidade_chk
    check (
      (elegivel and motivo_inelegibilidade is null)
      or
      (not elegivel and motivo_inelegibilidade is not null)
    ),
  constraint fato_credenciamento_turma_credenciado_chk
    check (not credenciado or quantidade_presencas > 0)
);

comment on table public.fato_credenciamento_turma is
  'Uma linha por Credenciamento__c. Presença é determinada pelo vínculo '
  'Presenca__c.Credenciamento__c, sem aproximação por CPF.';

comment on column public.fato_credenciamento_turma.elegivel is
  'Regra pedagógica: exclui Cancelado, COMPRADOR DE VAGAS e TRANSF. DE '
  'TITULARIDADE (titular antigo). Inclui Taxa de Transferência Isento, '
  'Bônus Maestria e BÔNUS - COMPRADOR DE VAGAS.';

create index if not exists dim_turma_salesforce_nome_idx
  on public.dim_turma_salesforce (nome);

create index if not exists fato_credenciamento_turma_turma_idx
  on public.fato_credenciamento_turma (turma_id);

create index if not exists fato_credenciamento_turma_venda_idx
  on public.fato_credenciamento_turma (venda_id);

create index if not exists fato_credenciamento_turma_cliente_idx
  on public.fato_credenciamento_turma (cliente_id);

create index if not exists fato_credenciamento_turma_cpf_idx
  on public.fato_credenciamento_turma (cpf_norm);

create index if not exists fato_credenciamento_turma_painel_idx
  on public.fato_credenciamento_turma (turma_id, elegivel, credenciado);

alter table public.dim_turma_salesforce enable row level security;
alter table public.fato_credenciamento_turma enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dim_turma_salesforce'
      and policyname = 'dim_turma_salesforce_select_authenticated'
  ) then
    create policy dim_turma_salesforce_select_authenticated
      on public.dim_turma_salesforce
      for select to authenticated
      using (public.pode_ver('pedagogico'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fato_credenciamento_turma'
      and policyname = 'fato_credenciamento_turma_select_authenticated'
  ) then
    create policy fato_credenciamento_turma_select_authenticated
      on public.fato_credenciamento_turma
      for select to authenticated
      using (public.pode_ver('pedagogico'));
  end if;
end $$;

revoke all on public.dim_turma_salesforce from anon;
revoke all on public.fato_credenciamento_turma from anon;
grant select on public.dim_turma_salesforce to authenticated;
grant select on public.fato_credenciamento_turma to authenticated;
grant all on public.dim_turma_salesforce to service_role;
grant all on public.fato_credenciamento_turma to service_role;

create or replace view public.vw_credenciamento_por_turma
with (security_invoker = true)
as
with metricas as (
  select
    c.turma_id,
    count(distinct coalesce(c.venda_id, c.credenciamento_id))
      filter (where c.elegivel)                              as total_alunos,
    count(distinct coalesce(c.venda_id, c.credenciamento_id))
      filter (where c.elegivel and c.credenciado)            as credenciados
  from public.fato_credenciamento_turma c
  group by c.turma_id
)
select
  t.turma_id,
  t.nome                                                    as turma,
  t.codigo_turma,
  t.curso_id,
  t.curso_nome,
  t.unidade_id,
  t.unidade_nome,
  t.status,
  coalesce(m.total_alunos, 0)::integer                      as total_alunos,
  coalesce(m.credenciados, 0)::integer                      as credenciados,
  (coalesce(m.total_alunos, 0) - coalesce(m.credenciados, 0))::integer
                                                              as nao_credenciados,
  case
    when coalesce(m.total_alunos, 0) = 0 then 0::numeric
    else round(100.0 * m.credenciados / m.total_alunos, 2)
  end                                                       as percentual_credenciamento,
  t.sincronizado_em
from public.dim_turma_salesforce t
left join metricas m on m.turma_id = t.turma_id
where public.pode_ver('pedagogico');

comment on view public.vw_credenciamento_por_turma is
  'Matrículas, credenciados e não credenciados por turma segundo a regra '
  'pedagógica validada. Uma pessoa/vaga por venda dentro da turma.';

revoke all on public.vw_credenciamento_por_turma from anon;
grant select on public.vw_credenciamento_por_turma to authenticated;
grant select on public.vw_credenciamento_por_turma to service_role;

notify pgrst, 'reload schema';

commit;
