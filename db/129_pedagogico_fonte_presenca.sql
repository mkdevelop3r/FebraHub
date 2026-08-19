-- ============================================================
-- 129 — HUB PEDAGÓGICO SOBRE A FONTE VIVA DE PRESENÇA
--
-- O gráfico temporal, o KPI geral e o ranking por curso ainda liam
-- fato_credenciamento pelas views criadas nas migrations 64–67.
-- Essa fonte parou de ser confiável e produzia históricos impossíveis.
--
-- A fonte canônica passa a ser vw_turmas_mensuraveis, construída sobre
-- fato_presenca. Ela já garante, por turma:
--   - evento iniciado;
--   - ao menos 10 matrículas aprovadas;
--   - cobertura de presença >= 40%;
--   - existência de registro real em fato_presenca.
--
-- IMPORTANTE: fato_presenca tem uma linha por pessoa × turma × dia.
-- Somar essa fato diretamente multiplicaria alunos pelos dias de aula.
-- As views abaixo agregam a partir da medida pronta POR TURMA.
-- ============================================================


-- Série do gráfico: o período é o trimestre de início da turma, não o
-- trimestre da matrícula nem data_registro (que é criação no Salesforce).
create or replace view public.vw_pedagogico_presenca_tempo as
select
  date_trunc('quarter', t.data_inicio)::date             as periodo,
  sum(t.matriculados)::bigint                            as matriculas,
  sum(t.compareceram)::bigint                            as compareceram,
  round(100.0 * sum(t.compareceram)
        / nullif(sum(t.matriculados), 0), 1)             as taxa_comparecimento
from public.vw_turmas_mensuraveis t
where public.pode_ver('pedagogico')
group by 1
order by 1;

comment on view public.vw_pedagogico_presenca_tempo is
  'Comparecimento por trimestre da turma. Fonte exclusiva: fato_presenca,
   filtrada por vw_turmas_mensuraveis. Nunca usar fato_credenciamento aqui.';


-- KPI do topo: razão ponderada pelo total de matriculados, não média das
-- porcentagens das turmas.
create or replace view public.vw_pedagogico_presenca_kpis as
select
  coalesce(sum(t.matriculados), 0)::bigint                as matriculas_com_credenciamento,
  coalesce(sum(t.compareceram), 0)::bigint                as compareceram,
  coalesce(sum(t.matriculados - t.compareceram), 0)::bigint as ausentes,
  round(100.0 * sum(t.compareceram)
        / nullif(sum(t.matriculados), 0), 1)              as taxa_comparecimento_geral,
  count(*)::bigint                                        as turmas_cobertas
from public.vw_turmas_mensuraveis t
where public.pode_ver('pedagogico');

comment on view public.vw_pedagogico_presenca_kpis is
  'KPIs ponderados das turmas mensuráveis. Fonte exclusiva: fato_presenca.';


-- Ranking por curso. Preserva o contrato consumido pelo front.
create or replace view public.vw_pedagogico_presenca_curso as
select
  coalesce(nullif(btrim(t.curso), ''), 'Sem curso')       as curso,
  sum(t.matriculados)::bigint                             as matriculas,
  sum(t.compareceram)::bigint                             as compareceram,
  sum(t.matriculados - t.compareceram)::bigint            as faltaram,
  round(100.0 * sum(t.compareceram)
        / nullif(sum(t.matriculados), 0), 1)              as taxa_comparecimento
from public.vw_turmas_mensuraveis t
where public.pode_ver('pedagogico')
group by 1
having sum(t.matriculados) >= 20
order by taxa_comparecimento asc;

comment on view public.vw_pedagogico_presenca_curso is
  'Comparecimento ponderado por curso. Fonte exclusiva: fato_presenca.';


grant select on public.vw_pedagogico_presenca_tempo to authenticated;
grant select on public.vw_pedagogico_presenca_kpis to authenticated;
grant select on public.vw_pedagogico_presenca_curso to authenticated;

notify pgrst, 'reload schema';

