-- FebraHub - Migration 158: performance da fidelizacao pos-curso.
-- Substitui o EXISTS correlacionado por um cruzamento unico entre duas bases
-- materializadas. A regra de negocio da migration 157 nao muda.
create or replace view public.vw_pedagogico_recompra_curso as
with cursos_grade as materialized (
  select distinct public.norm_curso(curso_id) as curso_norm
  from public.dim_cursos where grade_pedagogico
), presencas_grade as materialized (
  select p.cpf, t.curso, public.norm_curso(t.curso) as curso_norm,
    min(coalesce(t.data_fim, t.data_inicio)) as concluiu_em
  from public.fato_presenca p
  join public.dim_turmas t on t.turma_id = p.turma
  join cursos_grade g on g.curso_norm = public.norm_curso(t.curso)
  where p.cpf is not null
    and coalesce(t.data_fim, t.data_inicio) <= current_date - 90
  group by p.cpf, t.curso, public.norm_curso(t.curso)
), compras_grade as materialized (
  select lpad(regexp_replace(a.aluno_id, '\D', '', 'g'), 11, '0') as cpf,
    public.norm_curso(a.curso_id) as curso_norm, a.data_matricula
  from public.fato_base_alunos a
  join public.dim_cursos c on c.curso_id = a.curso_id and c.grade_pedagogico
  where a.status_matricula = 'Aprovada' and a.aluno_id is not null
    and a.data_matricula is not null
), coorte as (
  select p.cpf, p.curso,
    bool_or(c.cpf is not null) as recomprou_90d
  from presencas_grade p
  left join compras_grade c on c.cpf = p.cpf
    and c.data_matricula > p.concluiu_em
    and c.data_matricula <= p.concluiu_em + 90
    and c.curso_norm <> p.curso_norm
  group by p.cpf, p.curso
)
select curso, count(*)::bigint as alunos,
  count(*) filter (where recomprou_90d)::bigint as recompraram,
  round(100.0 * count(*) filter (where recomprou_90d) / nullif(count(*), 0), 1) as taxa_recompra
from coorte
where public.pode_ver('pedagogico')
group by curso
having count(*) >= 10
order by taxa_recompra desc, alunos desc;
grant select on public.vw_pedagogico_recompra_curso to authenticated;
notify pgrst, 'reload schema';
