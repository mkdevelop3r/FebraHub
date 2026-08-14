-- ============================================================
-- 115 — TURMAS DA CENTRAL PEDAGÓGICA
--
-- NÃO APLICADO. Rodar no SQL Editor do Supabase.
--
-- O PROBLEMA
--
-- A Central lia dim_turmas direto e mostrava coisa que não é turma de
-- curso: LL NETWORKING BUSINESS, LLPASS, FORMAÇÃO EM PLANEJADOR
-- FINANCEIRO, TEAM COACHING BUSINESS/LIFE. São 89 das 234 turmas do
-- cadastro. A Elis não confirma presença em nenhuma delas.
--
-- O corte é `dim_cursos.grade_pedagogico`. Ele vive no banco, e é onde
-- tem que ficar: `norm_curso()` é função do banco, e reimplementar a
-- normalização em JavaScript garantiria divergência na primeira
-- acentuação diferente.
--
-- POR QUE `exists` E NÃO `join`
--
-- dim_cursos tem mais de uma linha para o mesmo nome de curso depois de
-- normalizado — MÉTODO CIS GLOBAL casa três vezes. Com `join`, a
-- CIS-GL252 apareceria três vezes na tela. `exists` responde a pergunta
-- certa ("este curso está na grade?") sem multiplicar linha.
--
-- `futura` sai daqui e não do front: é a mesma pergunta em toda tela, e
-- comparar data no cliente depende do relógio da máquina de quem abriu.
--
-- Conferido antes de escrever (13/08/2026):
--   234 turmas no cadastro · 145 na grade pedagógica
--     9 turmas futuras     ·   9 na grade (nenhuma futura fica de fora)
-- ============================================================

drop view if exists public.vw_turmas_central cascade;
create view public.vw_turmas_central as
select t.turma_id,
       t.curso,
       t.nome_comercial,
       t.sigla,
       t.data_inicio,
       t.data_fim,
       t.cidade,
       t.local,
       t.endereco,
       t.capacidade,
       t.link_grupo,
       t.horario_credenciamento,
       t.horario_inicio,
       t.horario_fim,
       (t.data_inicio >= current_date) as futura
  from public.dim_turmas t
 where exists (
   select 1
     from public.dim_cursos dc
    where norm_curso(dc.nome_curso) = norm_curso(t.curso)
      and dc.grade_pedagogico
 )
   and public.pode_ver('pedagogico');

comment on view public.vw_turmas_central is
  'Turmas que a Central opera: só as de curso da grade pedagógica
   (dim_cursos.grade_pedagogico). Fora daqui ficam LLPASS, Team
   Coaching, Planejador Financeiro e afins — cadastro de turma existe,
   confirmação de presença não. `exists` em vez de `join` porque
   dim_cursos repete o mesmo curso normalizado e o join multiplicaria a
   linha da turma na tela.';

grant select on public.vw_turmas_central to authenticated;

notify pgrst, 'reload schema';
