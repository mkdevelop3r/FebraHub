-- ============================================================
-- FebraHub - Migration 157: fidelizacao causal por curso
--
-- Coorte: aluno que compareceu ao curso (fato_presenca).
-- Conversao: matricula aprovada em OUTRO curso da grade nos 90 dias
-- seguintes ao encerramento. So entram cursos encerrados ha 90 dias, para
-- que todos tenham a mesma janela. Um CPF conta uma vez por curso.
-- ============================================================

create or replace view public.vw_pedagogico_recompra_curso as
with presencas_grade as (
  select
    p.cpf,
    t.curso,
    min(coalesce(t.data_fim, t.data_inicio)) as concluiu_em
  from public.fato_presenca p
  join public.dim_turmas t on t.turma_id = p.turma
  where p.cpf is not null
    and coalesce(t.data_fim, t.data_inicio) <= current_date - 90
    and exists (
      select 1 from public.dim_cursos c
      where c.grade_pedagogico
        and public.norm_curso(c.curso_id) = public.norm_curso(t.curso)
    )
  group by p.cpf, t.curso
), coorte as (
  select
    pg.cpf,
    pg.curso,
    pg.concluiu_em,
    exists (
      select 1
      from public.fato_base_alunos a
      join public.dim_cursos c
        on c.curso_id = a.curso_id and c.grade_pedagogico
      where lpad(regexp_replace(a.aluno_id, '\D', '', 'g'), 11, '0') = pg.cpf
        and a.status_matricula = 'Aprovada'
        and a.data_matricula > pg.concluiu_em
        and a.data_matricula <= pg.concluiu_em + 90
        and public.norm_curso(a.curso_id) <> public.norm_curso(pg.curso)
    ) as recomprou_90d
  from presencas_grade pg
)
select
  curso,
  count(*)::bigint as alunos,
  count(*) filter (where recomprou_90d)::bigint as recompraram,
  round(100.0 * count(*) filter (where recomprou_90d) / nullif(count(*), 0), 1) as taxa_recompra
from coorte
where public.pode_ver('pedagogico')
group by curso
having count(*) >= 10
order by taxa_recompra desc, alunos desc;

grant select on public.vw_pedagogico_recompra_curso to authenticated;
comment on view public.vw_pedagogico_recompra_curso is
  'Por curso: alunos presentes que compraram outro curso da grade em ate 90 dias apos o encerramento. Coortes maduras e CPF unico.';
notify pgrst, 'reload schema';
