-- Central Financeira / automacao de contratos GGB.
-- A fila (vw_contrato_pendente) passa a aceitar tambem 'COMPRADOR DE VAGAS'
-- (mesmo tratamento/contrato da Matricula). Consumidor de Vagas, Bonus e os
-- demais continuam de fora. Substitui o filtro so-Matricula de db/228.
create or replace view public.vw_contrato_pendente as
select
  a.original_id_venda                                   as venda_id,
  a.aluno_id                                            as cpf,
  coalesce(ct.nome, al.nome, a.aluno_id)                as nome,
  a.curso_id                                            as curso,
  c.nome_curto                                          as curso_sigla,
  a.turma                                               as turma,
  a.valor                                               as valor,
  coalesce(nullif(btrim(ct.celular), ''),
           nullif(btrim(a.telefone_cliente), ''),
           al.telefone)                                 as telefone,
  coalesce(nullif(btrim(ct.email), ''),
           nullif(btrim(a.email_cliente), ''),
           al.email)                                    as email,
  a.unidade_geradora_venda                              as unidade,
  a.data_matricula                                      as comprou_em,
  a.consultor_id                                        as consultor
from public.fato_base_alunos a
join public.dim_cursos c
  on c.curso_id = a.curso_id and c.tipo = 'GGB' and c.grade_pedagogico = true
left join public.dim_alunos al
  on al.cpf_norm = lpad(regexp_replace(coalesce(a.aluno_id, ''), '\D', '', 'g'), 11, '0')
left join public.fato_contatos ct on ct.cpf = a.aluno_id
where a.status_matricula = 'Aprovada'
  and a.tipo_matricula in ('Matrícula', 'COMPRADOR DE VAGAS')   -- matricula normal + comprador de vagas
  and a.data_matricula >= date '2026-10-01'
  and a.original_id_venda is not null
  and not exists (
    select 1 from public.contrato_envio e
     where e.venda_id = a.original_id_venda
       and coalesce(e.curso, '') = coalesce(a.curso_id, '')
  );

grant select on public.vw_contrato_pendente to service_role;

notify pgrst, 'reload schema';
