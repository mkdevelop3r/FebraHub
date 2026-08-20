-- ============================================================
-- Migration 137 — Matrículas reais do Hub Comercial
--
-- O card contava linhas de vw_venda_faturamento: uma por VENDA, e essa view
-- exclui CONSUMIDOR DE VAGAS. Portanto "Total de matrículas" mostrava 67
-- vendas em ago/2026, embora houvesse 572 matrículas aprovadas de alunos.
--
-- Regra já documentada na migration 23:
--   conta aluno: Matrícula + CONSUMIDOR DE VAGAS
--   não conta: COMPRADOR DE VAGAS (terceiro pagador, não aluno)
-- ============================================================

create or replace view public.vw_comercial_matriculas_periodo as
select
  a.data_matricula::date as data,
  case c.tipo
    when 'Coaching Individual' then 'CI'
    else coalesce(c.tipo, 'Sem categoria')
  end as categoria,
  count(*)::bigint as matriculas
from public.fato_base_alunos a
left join public.dim_cursos c on c.curso_id = a.curso_id
where public.pode_ver('comercial')
  and a.status_matricula = 'Aprovada'
  and a.tipo_matricula in ('Matrícula', 'CONSUMIDOR DE VAGAS')
  and a.data_matricula is not null
group by 1, 2;

grant select on public.vw_comercial_matriculas_periodo to authenticated;

notify pgrst, 'reload schema';
