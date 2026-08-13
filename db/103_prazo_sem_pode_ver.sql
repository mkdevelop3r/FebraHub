-- ============================================================
-- 103 — TIRAR pode_ver() DA VIEW BASE DO PRAZO
--
-- Aplicado em 11/08/2026.
--
-- PROBLEMA
--
-- O ETL lia vw_prazo_fila_envio com a service key e recebia zero
-- linhas, apesar de existirem 51 pessoas vencendo. A fila de
-- boas-vindas, no mesmo script, trazia gente normalmente.
--
-- A diferença: vw_pedagogico_prazo tinha `and pode_ver('pedagogico')`
-- no where, e vw_prazo_fila_envio herda esse filtro pela cadeia
-- (_salvador -> _prazo). Com service_role, auth.uid() é nulo,
-- meu_setor() é nulo, e pode_ver devolve falso — a view fica vazia
-- para o ETL sem nenhum erro. Falha silenciosa, a pior espécie.
--
-- CORREÇÃO
--
-- pode_ver() sai da view BASE. O RLS das tabelas subjacentes já faz
-- a filtragem por setor; repetir na view era redundante e quebrava
-- o acesso de serviço.
--
-- As views derivadas (_salvador, _pessoa, _sem_contato, _resumo)
-- mantêm pode_ver, e ali está certo: quem as consulta é usuário
-- logado, pelo front.
-- ============================================================

create or replace view vw_pedagogico_prazo as
with cursos_com_registro as (
  select distinct norm_curso(curso) as c
    from fato_presenca
   where data_registro >= current_date - interval '18 months'
),
matricula as (
  select a.aluno_id                  as cpf,
         a.curso_id                  as curso,
         min(a.data_matricula)       as comprou_em,
         min(a.data_matricula) + 365 as vence_em,
         max(a.consultor_id)         as consultor,
         min(a.turma)                as turma_da_venda,
         string_agg(distinct a.tipo_matricula, ', ') as tipos,
         bool_or(a.tipo_matricula in ('Taxa de Transferência',
                                      'Taxa de Transferência Isento',
                                      'Transferido')) as ja_transferiu
    from fato_base_alunos a
    join cursos_com_registro cr on cr.c = norm_curso(a.curso_id)
   where a.status_matricula = 'Aprovada'
     and a.data_matricula >= current_date - interval '3 years'
     and a.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   group by a.aluno_id, a.curso_id
),
ja_fez as (
  select distinct m.cpf, m.curso
    from matricula m
    join fato_presenca p
      on p.cpf = m.cpf and norm_curso(p.curso) = norm_curso(m.curso)
),
proxima_turma as (
  select norm_curso(curso) as c, min(data_inicio) as proxima, min(turma_id) as turma_id
    from dim_turmas where data_inicio > current_date group by 1
)
select m.cpf, al.nome, al.telefone, al.email, m.curso,
       m.comprou_em, m.vence_em,
       m.vence_em - current_date as dias_restantes,
       m.consultor, m.turma_da_venda, m.tipos, m.ja_transferiu,
       pt.turma_id as proxima_turma, pt.proxima as proxima_turma_em,
       case
         when m.vence_em < current_date then 'vencido'
         when m.vence_em > (select ate from vw_calendario_horizonte) then 'aguardando calendario'
         when pt.proxima is null or pt.proxima > m.vence_em then 'sem turma no prazo'
         when m.vence_em - current_date <= 90 then 'vencendo'
         else 'no prazo'
       end as situacao
  from matricula m
  left join ja_fez f on f.cpf = m.cpf and f.curso = m.curso
  left join dim_alunos al on al.cpf_norm = m.cpf
  left join proxima_turma pt on pt.c = norm_curso(m.curso)
 where f.cpf is null;
