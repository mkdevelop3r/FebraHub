-- ============================================================
-- 188 — CENTRAL DE EVENTOS: SOMENTE TURMAS REALIZADAS AQUI
--
-- dim_turmas reúne duas necessidades diferentes: turmas realizadas por
-- Salvador e turmas de outras unidades para as quais Salvador vendeu. A
-- Central de Eventos cuida da operação física local, portanto só pode usar
-- acontece_aqui=true. O filtro de cancelamento usa o status local, que é
-- deliberadamente preservado pelo sync quando diverge do Salesforce.
-- ============================================================

create or replace view public.vw_central_eventos as
with vendas as (
  select turma, count(distinct original_id_venda) as vendas
  from public.fato_base_alunos
  where turma is not null
  group by turma
),
turmas as (
  select
    t.turma_id                                       as id,
    coalesce(nullif(t.nome_comercial, ''), t.curso)  as titulo,
    'Curso'::text                                    as tipo,
    'venda'::text                                    as metrica,
    t.data_inicio,
    t.data_fim,
    coalesce(v.vendas, 0)                            as numero,
    t.local                                          as local_origem,
    t.endereco                                       as endereco_origem,
    t.capacidade                                     as capacidade_origem
  from public.dim_turmas t
  left join vendas v on v.turma = t.turma_id
  where t.data_inicio is not null
    and coalesce(t.acontece_aqui, false)
    and lower(coalesce(t.status, '')) <> 'cancelada'
),
agenda as (
  select
    'mkt:' || e.id::text as id,
    e.nome               as titulo,
    ti.nome              as tipo,
    'inscrito'::text      as metrica,
    e.data_evento        as data_inicio,
    e.data_evento        as data_fim,
    r.inscritos          as numero,
    null::text           as local_origem,
    null::text           as endereco_origem,
    null::integer        as capacidade_origem
  from public.mkt_eventos e
  join public.mkt_tipos_evento ti on ti.id = e.tipo_evento_id
  left join public.mkt_resultados_evento r on r.evento_id = e.id
  where e.status = 'ativo'
    and ti.nome in ('Palestra', 'Workshop', 'Live')
    and not exists (
      select 1
      from public.dim_turmas d
      where d.data_inicio = e.data_evento
        and coalesce(d.acontece_aqui, false)
        and lower(coalesce(d.status, '')) <> 'cancelada'
    )
),
tudo as (
  select * from turmas
  union all
  select * from agenda
)
select
  u.id                                as turma_id,
  u.titulo,
  u.tipo,
  u.metrica,
  u.data_inicio,
  u.data_fim,
  case
    when date_trunc('month', u.data_inicio) = date_trunc('month', current_date)
      then 'este_mes'
    when date_trunc('month', u.data_inicio) = date_trunc('month', current_date) + interval '1 month'
      then 'proximo_mes'
    when u.data_inicio < current_date then 'passado'
    else 'depois'
  end                                 as coluna,
  (u.data_inicio - current_date)      as dias_para_inicio,
  u.numero                            as vendas,
  d.confirmados,
  coalesce(nullif(d.local, ''), nullif(u.local_origem, ''), 'Sede Febracis') as local,
  coalesce(nullif(d.endereco, ''), nullif(u.endereco_origem, ''))            as endereco,
  (nullif(d.local, '') is null and nullif(u.local_origem, '') is null)       as local_padrao,
  coalesce(d.capacidade, u.capacidade_origem) as capacidade,
  d.observacao,
  d.atualizado_em,
  p.nome                              as atualizado_por
from tudo u
left join public.evento_detalhe d on d.turma_id = u.id
left join public.perfis p          on p.id = d.atualizado_por
where public.pode_ver('central-eventos')
   or public.pode_ver('marketing');

comment on view public.vw_central_eventos is
  'Calendário institucional: agenda ativa e somente turmas não canceladas que acontecem nesta unidade.';

grant select on public.vw_central_eventos to authenticated;

notify pgrst, 'reload schema';
