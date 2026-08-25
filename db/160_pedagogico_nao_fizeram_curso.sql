-- FebraHub - Migration 160: alunos que compraram e nunca fizeram o curso.
-- Usa a fila canonica de prazo, que ja elimina quem realizou outra turma
-- equivalente, compradores de vagas e cursos sem fonte de presenca viva.
create or replace view public.vw_pedagogico_nao_fizeram_curso as
select
  curso,
  count(distinct cpf)::bigint as alunos,
  count(distinct cpf) filter (where situacao = 'vencido')::bigint as vencidos,
  count(distinct cpf) filter (where situacao = 'vencendo')::bigint as vencendo,
  min(comprou_em) as compra_mais_antiga,
  max(comprou_em) as compra_mais_recente
from public.vw_pedagogico_prazo
where public.pode_ver('pedagogico')
group by curso
having count(distinct cpf) >= 5
order by alunos desc, curso;
grant select on public.vw_pedagogico_nao_fizeram_curso to authenticated;
comment on view public.vw_pedagogico_nao_fizeram_curso is
  'CPF unico que comprou e nao tem presenca em nenhuma turma equivalente; fonte canonica vw_pedagogico_prazo.';
notify pgrst, 'reload schema';
