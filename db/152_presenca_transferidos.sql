-- ============================================================
-- FebraHub · Migration 152 — Presença: transferidos no denominador
--
-- PROBLEMA (24/08/2026): a Central Pedagógica mostrava 74% de presença
-- na CIS-GL251 (73 de 98) enquanto a tela do Salesforce mostrava
-- 116 de 138 (84%). A Elis vê a tela; o hub parecia errado.
--
-- INVESTIGAÇÃO:
--   116 pessoas credenciadas na turma
--    98 constam como matriculadas nela na nossa base
--    43 dos presentes estão matriculados em OUTRAS turmas
--       (9 na CIS-GL250, 6 na IF36, 6 no TOUR, várias de 2022-2024)
--    25 matriculados aqui não apareceram
--
-- CAUSA: transferência de turma. A pessoa compra para a GL249, não
-- consegue ir, é transferida para a 250, também não vai, e faz na 251.
-- A presença conta na 251 — onde ela sentou. Mas a matrícula continua
-- registrada na turma de origem aqui, enquanto o Salesforce reclassifica
-- como 'Taxa de Transferência Isento' (a tela tinha 22; nossa base, 4).
-- A base tem os tipos de transferência (633 'Taxa de Transferência
-- Isento', 55 'Transferido') mas sem apontar a turma de origem, então
-- não dá para rastrear a cadeia 249 -> 250 -> 251.
--
-- CORREÇÃO: ampliar o DENOMINADOR.
--   previstos = matriculados na turma + presentes vindos de outra turma
--   98 + 43 = 141 (tela: 138). 116/141 = 82% (tela: 84%).
--
-- POR QUE NÃO AMPLIAR O NUMERADOR (contar presença em qualquer turma do
-- mesmo curso): testado — sobe de 73 para só 76, porque apenas 3 dos 25
-- ausentes foram assistir em outra turma. E seria conceitualmente
-- errado: quem comprou a 249 e fez na 251 realmente faltou à 249.
--
-- LIMITE CONHECIDO: o denominador ampliado só existe DEPOIS do evento,
-- porque a transferência só se revela quando a pessoa aparece. Para
-- turma futura, previstos = matriculados apenas, e cobertura_pct = 0.
-- O front deve mostrar "—" em vez de 0% para turma que ainda não
-- aconteceu (ex: o TOUR aparece com 573 previstos e 0%).
--
-- A view expõe matriculados_na_turma e transferidos_de_outra para o
-- front poder explicar a composição do denominador.
--
-- ATENÇÃO: o cascade derruba vw_turmas_mensuraveis,
-- vw_pedagogico_presenca_curso, vw_pedagogico_presenca_kpis e
-- vw_pedagogico_presenca_tempo — recriadas ao fim deste arquivo.
-- ============================================================

drop view if exists public.vw_presenca_cobertura cascade;
create view public.vw_presenca_cobertura as
with matriculados as (
  select
    m.turma,
    lpad(regexp_replace(m.aluno_id, '\D', '', 'g'), 11, '0') as cpf
  from public.fato_base_alunos m
  where m.status_matricula = 'Aprovada'
    and m.aluno_id is not null
  group by 1, 2
),
presentes as (
  select
    p.turma,
    lpad(regexp_replace(p.cpf, '\D', '', 'g'), 11, '0') as cpf,
    min(p.data_registro) as primeira_presenca
  from public.fato_presenca p
  where p.cpf is not null
  group by 1, 2
),
previstos as (
  select turma, cpf, true as matriculado_aqui from matriculados
  union
  select turma, cpf, false from presentes
)
select
  v.turma,
  count(*)                                              as matriculados,
  count(*) filter (where p.cpf is not null)             as compareceram,
  count(*) filter (where v.matriculado_aqui)            as matriculados_na_turma,
  count(*) filter (where not v.matriculado_aqui)        as transferidos_de_outra,
  round(100.0 * count(*) filter (where p.cpf is not null) / nullif(count(*), 0)) as cobertura_pct,
  max(case when p.cpf is not null then 'presenca' end)  as fonte
from (
  select turma, cpf, bool_or(matriculado_aqui) as matriculado_aqui
  from previstos group by turma, cpf
) v
left join presentes p on p.turma = v.turma and p.cpf = v.cpf
group by v.turma;
grant select on public.vw_presenca_cobertura to authenticated;

-- ---- views dependentes, recriadas ----

create or replace view public.vw_turmas_mensuraveis as
select c.turma, c.matriculados, c.compareceram, c.cobertura_pct,
       t.data_inicio, t.curso, t.cidade
from public.vw_presenca_cobertura c
join public.dim_turmas t on t.turma_id = c.turma
where t.data_inicio <= current_date
  and t.data_inicio >= '2025-01-01'::date
  and c.matriculados >= 10
  and c.cobertura_pct >= 40
  and exists (select 1 from public.fato_presenca p where p.turma = c.turma);
grant select on public.vw_turmas_mensuraveis to authenticated;

create or replace view public.vw_pedagogico_presenca_curso as
select
  coalesce(nullif(btrim(curso), ''), 'Sem curso') as curso,
  sum(matriculados)::bigint                        as matriculas,
  sum(compareceram)::bigint                        as compareceram,
  sum(matriculados - compareceram)::bigint         as faltaram,
  round(100.0 * sum(compareceram) / nullif(sum(matriculados), 0), 1) as taxa_comparecimento
from public.vw_turmas_mensuraveis t
where public.pode_ver('pedagogico')
group by 1
having sum(matriculados) >= 20
order by round(100.0 * sum(compareceram) / nullif(sum(matriculados), 0), 1);
grant select on public.vw_pedagogico_presenca_curso to authenticated;

create or replace view public.vw_pedagogico_presenca_kpis as
select
  count(*)::bigint                                  as turmas,
  sum(matriculados)::bigint                         as matriculas,
  sum(compareceram)::bigint                         as compareceram,
  sum(matriculados - compareceram)::bigint          as faltaram,
  round(100.0 * sum(compareceram) / nullif(sum(matriculados), 0), 1) as taxa_comparecimento
from public.vw_turmas_mensuraveis
where public.pode_ver('pedagogico');
grant select on public.vw_pedagogico_presenca_kpis to authenticated;

-- ATENÇÃO: agrupa por TRIMESTRE e a coluna chama-se `periodo` — o card
-- "Comparecimento no tempo" é rotulado "taxa por trimestre" e quebra se
-- vier `mes`. (Errei isso na primeira recriação; corrigido em seguida.)
create or replace view public.vw_pedagogico_presenca_tempo as
select
  date_trunc('quarter', data_inicio)::date           as periodo,
  count(*)::bigint                                   as turmas,
  sum(matriculados)::bigint                          as matriculas,
  sum(compareceram)::bigint                          as compareceram,
  sum(matriculados - compareceram)::bigint           as faltaram,
  round(100.0 * sum(compareceram) / nullif(sum(matriculados), 0), 1) as taxa_comparecimento
from public.vw_turmas_mensuraveis
where public.pode_ver('pedagogico')
group by 1
order by 1;
grant select on public.vw_pedagogico_presenca_tempo to authenticated;

notify pgrst, 'reload schema';
