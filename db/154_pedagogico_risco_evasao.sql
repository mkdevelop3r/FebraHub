-- FebraHub - Migration 154: risco automatico de evasao.
-- Ausencia, frequencia abaixo de 75% ou 90 dias sem nova matricula.
create or replace view public.vw_pedagogico_risco_evasao as
with dias_por_turma as (
  select turma, count(distinct dia)::numeric as dias_registrados
  from public.fato_presenca group by turma
), matriculas_elegiveis as (
  select lpad(regexp_replace(m.aluno_id, '\D', '', 'g'), 11, '0') as cpf,
    m.turma, t.data_inicio,
    row_number() over (partition by lpad(regexp_replace(m.aluno_id, '\D', '', 'g'), 11, '0')
      order by t.data_inicio desc, m.data_matricula desc nulls last, m.turma desc) as ordem
  from public.fato_base_alunos m
  join public.vw_turmas_mensuraveis tm on tm.turma = m.turma
  join public.dim_turmas t on t.turma_id = m.turma
  where m.status_matricula = 'Aprovada' and m.aluno_id is not null
    and regexp_replace(m.aluno_id, '\D', '', 'g') <> '' and t.data_inicio <= current_date
), ultima_turma as (
  select cpf, turma, data_inicio from matriculas_elegiveis where ordem = 1
), presenca_ultima as (
  select u.cpf, u.data_inicio, coalesce(count(distinct p.dia), 0)::numeric as dias_presentes,
    round(100.0 * coalesce(count(distinct p.dia), 0) / nullif(d.dias_registrados, 0), 1) as frequencia_pct
  from ultima_turma u join dias_por_turma d on d.turma = u.turma
  left join public.fato_presenca p on p.turma = u.turma and p.cpf = u.cpf
  group by u.cpf, u.turma, u.data_inicio, d.dias_registrados
), ultima_compra as (
  select lpad(regexp_replace(aluno_id, '\D', '', 'g'), 11, '0') as cpf, max(data_matricula) as ultima_matricula
  from public.fato_base_alunos where status_matricula = 'Aprovada' and aluno_id is not null
    and regexp_replace(aluno_id, '\D', '', 'g') <> '' group by 1
), sinais as (
  select p.cpf, (p.dias_presentes = 0) as sem_comparecimento,
    (p.dias_presentes > 0 and p.frequencia_pct < 75) as baixa_frequencia,
    (p.data_inicio <= current_date - 90 and coalesce(c.ultima_matricula, '-infinity'::date) <= p.data_inicio) as sem_nova_matricula
  from presenca_ultima p left join ultima_compra c on c.cpf = p.cpf
)
select count(*) filter (where sem_comparecimento or baixa_frequencia or sem_nova_matricula)::bigint as alunos_em_risco,
  count(*) filter (where sem_comparecimento)::bigint as sem_comparecimento,
  count(*) filter (where baixa_frequencia)::bigint as baixa_frequencia,
  count(*) filter (where sem_nova_matricula)::bigint as sem_nova_matricula,
  75::integer as limite_frequencia_pct, 90::integer as limite_sem_nova_matricula_dias
from sinais where public.pode_ver('pedagogico');
grant select on public.vw_pedagogico_risco_evasao to authenticated;
comment on view public.vw_pedagogico_risco_evasao is
  'CPF unico em risco pela ultima turma mensuravel: ausencia, frequencia <75% ou 90 dias sem nova matricula.';
notify pgrst, 'reload schema';
