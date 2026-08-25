-- FebraHub - Migration 155: KPIs pedagogicos interativos por periodo.
create or replace function public.pedagogico_kpis_periodo(p_inicio date, p_fim date)
returns table (
  alunos_periodo bigint,
  matriculas_periodo bigint,
  taxa_recompra numeric,
  cursos_por_aluno numeric,
  taxa_comparecimento numeric,
  turmas_mensuraveis bigint,
  alunos_risco_90d bigint
)
language sql stable security invoker set search_path = public as $$
with grade as (
  select a.aluno_id, a.turma, a.data_matricula
  from fato_base_alunos a
  join dim_cursos c on c.curso_id = a.curso_id and c.grade_pedagogico
  where a.aluno_id is not null and a.aluno_id <> '' and a.data_matricula <= p_fim
), alunos_no_periodo as (
  select distinct aluno_id from grade where data_matricula between p_inicio and p_fim
), historico_aluno as (
  select aluno_id, count(*) as compras from grade group by aluno_id
), recompra as (
  select count(*)::bigint as alunos,
    count(*) filter (where h.compras >= 2)::bigint as recompraram,
    (select count(*) from grade where data_matricula between p_inicio and p_fim)::bigint as matriculas
  from alunos_no_periodo a join historico_aluno h using (aluno_id)
), comparecimento as (
  select count(*)::bigint as turmas, sum(matriculados)::numeric as matriculados,
    sum(compareceram)::numeric as compareceram
  from vw_turmas_mensuraveis where data_inicio between p_inicio and p_fim
), dias_turma as (
  select turma, count(distinct dia)::numeric as dias from fato_presenca group by turma
), elegiveis_risco as (
  select lpad(regexp_replace(m.aluno_id, '\D', '', 'g'), 11, '0') as cpf,
    m.turma, t.data_inicio,
    row_number() over (partition by lpad(regexp_replace(m.aluno_id, '\D', '', 'g'), 11, '0')
      order by t.data_inicio desc, m.data_matricula desc nulls last, m.turma desc) as ordem
  from fato_base_alunos m
  join vw_turmas_mensuraveis tm on tm.turma = m.turma
  join dim_turmas t on t.turma_id = m.turma
  where m.aluno_id is not null and regexp_replace(m.aluno_id, '\D', '', 'g') <> ''
    and t.data_inicio <= p_fim
), ultima_turma as (
  select cpf, turma, data_inicio from elegiveis_risco where ordem = 1
), ultima_compra as (
  select lpad(regexp_replace(aluno_id, '\D', '', 'g'), 11, '0') as cpf,
    max(data_matricula) as ultima_matricula
  from fato_base_alunos
  where aluno_id is not null and regexp_replace(aluno_id, '\D', '', 'g') <> ''
    and data_matricula <= p_fim group by 1
), risco as (
  select count(*)::bigint as alunos
  from ultima_turma u
  join dias_turma d on d.turma = u.turma
  left join ultima_compra c on c.cpf = u.cpf
  where u.data_inicio <= p_fim - 90
    and coalesce(c.ultima_matricula, '-infinity'::date) <= u.data_inicio
)
select r.alunos, r.matriculas,
  round(100.0 * r.recompraram / nullif(r.alunos, 0), 1),
  round(r.matriculas::numeric / nullif(r.alunos, 0), 2),
  round(100.0 * c.compareceram / nullif(c.matriculados, 0), 1),
  c.turmas, ri.alunos
from recompra r cross join comparecimento c cross join risco ri
where pode_ver('pedagogico');
$$;
grant execute on function public.pedagogico_kpis_periodo(date, date) to authenticated;
notify pgrst, 'reload schema';
