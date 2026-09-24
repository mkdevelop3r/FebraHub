-- ============================================================
-- FebraHub · Migration 215 — Certificados: fonte = CREDENCIAMENTO (Salesforce)
--
-- A "presença" verdadeira é o CREDENCIADO do Salesforce (quem fez check-in),
-- que é o número que a aba Presença mostra. Ele mora em fato_credenciamento_turma
-- (credenciado = true), com nome/e-mail/telefone. A ponte com o calendário é
-- dim_turmas.sf_turma_id = fato_credenciamento_turma.turma_id (lá o turma_id é
-- o ID do Salesforce, não o "2026 - IF36").
--
-- Substitui a fonte anterior (matrículas / fato_presenca): credenciado = esteve
-- presente, que é o pedido original. Só turmas certificáveis (carga definida).
-- Colunas mantidas (create or replace exige mesma ordem; `compareceu` = credenciado).
-- ============================================================

create or replace view public.vw_certificado_turmas as
select t.turma_id, t.curso, t.data_inicio, t.data_fim, t.cidade,
       count(distinct c.cpf_norm) as presentes
  from public.dim_turmas t
  join public.fato_credenciamento_turma c
    on c.turma_id = t.sf_turma_id and c.credenciado
 where coalesce(t.data_fim, t.data_inicio) < current_date
   and public.carga_horaria_curso(t.curso) is not null
   and pode_ver('pedagogico')
 group by t.turma_id, t.curso, t.data_inicio, t.data_fim, t.cidade;

create or replace view public.vw_certificado_presente as
select distinct
    t.turma_id,
    coalesce(c.cpf_norm, lpad(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'), 11, '0')) as cpf,
    upper(coalesce(c.nome_cliente, a.nome))                       as nome,
    t.curso,
    t.data_inicio                                                as periodo_ini,
    coalesce(t.data_fim, t.data_inicio)                          as periodo_fim,
    public.carga_horaria_curso(t.curso)                          as carga_horaria,
    coalesce(nullif(btrim(c.email_cliente), ''), a.email)        as email,
    coalesce(nullif(btrim(c.telefone_cliente), ''), a.telefone)  as telefone,
    c.credenciado                                                as compareceu
  from public.dim_turmas t
  join public.fato_credenciamento_turma c
    on c.turma_id = t.sf_turma_id and c.credenciado
  left join public.dim_alunos a
         on a.cpf_norm = coalesce(c.cpf_norm, lpad(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'), 11, '0'))
 where pode_ver('pedagogico');

notify pgrst, 'reload schema';
