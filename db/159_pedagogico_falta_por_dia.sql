-- ============================================================
-- FebraHub - Migration 159: falta por aluno-dia
--
-- Antes, quem aparecia em qualquer dia era contado como comparecimento total.
-- Agora a taxa usa presencas esperadas (pessoas x dias carregados da turma)
-- versus presencas efetivas. Somente turmas mensuraveis entram no ranking.
-- ============================================================

create or replace view public.vw_pedagogico_presenca_curso as
with turmas_validas as materialized (
  select turma, curso from public.vw_turmas_mensuraveis
), pessoas_turma as materialized (
  select m.turma, lpad(regexp_replace(m.aluno_id, '\D', '', 'g'), 11, '0') as cpf
  from public.fato_base_alunos m
  join turmas_validas t on t.turma = m.turma
  where m.status_matricula = 'Aprovada' and m.aluno_id is not null
    and regexp_replace(m.aluno_id, '\D', '', 'g') <> ''
  group by 1, 2
  union
  select p.turma, p.cpf
  from public.fato_presenca p
  join turmas_validas t on t.turma = p.turma
  where p.cpf is not null
  group by 1, 2
), dias_turma as materialized (
  select p.turma, count(distinct p.dia)::bigint as dias_registrados
  from public.fato_presenca p
  join turmas_validas t on t.turma = p.turma
  group by p.turma
), frequencia_pessoa as (
  select pt.turma, pt.cpf, dt.dias_registrados,
    count(distinct p.dia)::bigint as dias_presentes
  from pessoas_turma pt
  join dias_turma dt on dt.turma = pt.turma
  left join public.fato_presenca p on p.turma = pt.turma and p.cpf = pt.cpf
  group by pt.turma, pt.cpf, dt.dias_registrados
)
select
  coalesce(nullif(btrim(t.curso), ''), 'Sem curso') as curso,
  count(*)::bigint as matriculas,
  count(*) filter (where f.dias_presentes > 0)::bigint as compareceram,
  sum(f.dias_registrados - f.dias_presentes)::bigint as faltaram,
  round(100.0 * sum(f.dias_presentes) / nullif(sum(f.dias_registrados), 0), 1) as taxa_comparecimento,
  sum(f.dias_registrados)::bigint as presencas_esperadas,
  sum(f.dias_presentes)::bigint as presencas_realizadas
from frequencia_pessoa f
join turmas_validas t on t.turma = f.turma
where public.pode_ver('pedagogico')
group by 1
having count(*) >= 20
order by taxa_comparecimento asc;

grant select on public.vw_pedagogico_presenca_curso to authenticated;
comment on view public.vw_pedagogico_presenca_curso is
  'Frequencia por curso em aluno-dia: presencas realizadas / pessoas previstas x dias registrados, somente turmas mensuraveis.';
notify pgrst, 'reload schema';
