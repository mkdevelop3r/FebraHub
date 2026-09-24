-- ============================================================
-- FebraHub · Migration 214 — Certificados: fonte = matrículas (fato_base_alunos)
--
-- Antes usávamos fato_presenca (upload manual, incompleto — parou em 27/08 e
-- não tem turmas recentes como o IF36). A aba Presença usa fato_base_alunos
-- (matrículas Aprovadas), que é a fonte viva/completa. Trocamos os certificados
-- para a MESMA fonte: assim toda turma encerrada com matrícula aparece.
--
-- "alunos" = matriculados Aprovados (exclui COMPRADOR DE VAGAS, como o disparo
-- de turma já faz). `compareceu` fica como marcador informativo (existe registro
-- em fato_presenca), mas NÃO filtra — o certificado sai para o matriculado.
-- Só turmas certificáveis (curso com carga em curso_carga_horaria).
-- ============================================================

create or replace view public.vw_certificado_turmas as
select t.turma_id, t.curso, t.data_inicio, t.data_fim, t.cidade,
       count(distinct m.aluno_id) as presentes   -- nome mantido; hoje = matriculados aprovados
  from public.dim_turmas t
  join public.fato_base_alunos m
    on m.turma = t.turma_id
   and m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
 where coalesce(t.data_fim, t.data_inicio) < current_date
   and public.carga_horaria_curso(t.curso) is not null
   and pode_ver('pedagogico')
 group by t.turma_id, t.curso, t.data_inicio, t.data_fim, t.cidade;

create or replace view public.vw_certificado_presente as
select distinct
    m.turma                                                              as turma_id,
    lpad(regexp_replace(coalesce(m.aluno_id, ''), '\D', '', 'g'), 11, '0') as cpf,
    upper(coalesce(a.nome, m.aluno_id))                                  as nome,
    t.curso,
    t.data_inicio                                                        as periodo_ini,
    coalesce(t.data_fim, t.data_inicio)                                  as periodo_fim,
    public.carga_horaria_curso(t.curso)                                  as carga_horaria,
    coalesce(nullif(btrim(m.email_cliente), ''), a.email)                as email,
    coalesce(nullif(btrim(m.telefone_cliente), ''), a.telefone)          as telefone,
    exists (
      select 1 from public.fato_presenca fp
       where fp.turma = m.turma
         and lpad(regexp_replace(fp.cpf, '\D', '', 'g'), 11, '0')
           = lpad(regexp_replace(coalesce(m.aluno_id, ''), '\D', '', 'g'), 11, '0')
    )                                                                    as compareceu
  from public.fato_base_alunos m
  join public.dim_turmas t on t.turma_id = m.turma
  left join public.dim_alunos a
         on a.cpf_norm = lpad(regexp_replace(coalesce(m.aluno_id, ''), '\D', '', 'g'), 11, '0')
 where m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and pode_ver('pedagogico');

notify pgrst, 'reload schema';
