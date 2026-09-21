-- Recupera contatos ja existentes em fato_base_alunos para o roster oficial.
-- A busca usa aluno_id sem funcao, aproveitando o indice fba_aluno_curso.
begin;

create or replace view public.vw_turma_inscritos_base as
with roster_turmas as (
  select distinct d.nome as turma_id
    from public.dim_turma_salesforce d
    join public.fato_credenciamento_turma f on f.turma_id = d.turma_id
),
roster as (
  select distinct on (coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id), d.nome)
         d.nome as turma_id,
         t.curso,
         t.data_inicio,
         coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id) as aluno_id,
         coalesce(c.nome, f.nome_cliente, a.nome,
                  coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id)) as nome,
         coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone) as telefone,
         coalesce(c.email, nullif(m.email_cliente, ''), a.email) as email,
         case f.tipo_matricula_codigo
           when '1' then 'Matrícula'
           when '7' then 'CONSUMIDOR DE VAGAS'
           when '28' then 'CONSUMIDOR DE VAGAS'
           when '107' then 'Assinante CIS PASS ANUAL - GLOBAL'
           when '122' then 'Taxa de Transferência Isento'
           else coalesce(nullif(f.tipo_matricula, f.tipo_matricula_codigo),
                         f.tipo_matricula, f.tipo_matricula_codigo, 'Não informado')
         end as tipo_matricula
    from public.fato_credenciamento_turma f
    join public.dim_turma_salesforce d on d.turma_id = f.turma_id
    join public.dim_turmas t on t.turma_id = d.nome
    left join public.fato_contatos c on c.cpf = f.cpf_norm
    left join public.dim_alunos a on a.doc_norm = f.cpf_norm
    left join lateral (
      select b.telefone_cliente, b.email_cliente
        from public.fato_base_alunos b
       where b.aluno_id = f.cpf_norm
         and coalesce(nullif(b.telefone_cliente, ''), nullif(b.email_cliente, '')) is not null
       order by b.data_matricula desc nulls last
       limit 1
    ) m on true
   where f.elegivel
     and coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id) is not null
   order by coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id), d.nome,
            f.atualizado_salesforce_em desc nulls last
),
legado as (
  select distinct on (m.aluno_id, m.turma)
         m.turma as turma_id,
         t.curso,
         t.data_inicio,
         m.aluno_id,
         coalesce(c.nome, a.nome, m.aluno_id) as nome,
         coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone) as telefone,
         coalesce(c.email, nullif(m.email_cliente, ''), a.email) as email,
         m.tipo_matricula
    from public.fato_base_alunos m
    join public.dim_turmas t on t.turma_id = m.turma
    left join public.fato_contatos c on c.cpf = lpad(m.aluno_id, 11, '0')
    left join public.dim_alunos a on a.doc_norm = lpad(m.aluno_id, 11, '0')
   where m.status_matricula = 'Aprovada'
     and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
     and not exists (select 1 from roster_turmas rt where rt.turma_id = m.turma)
   order by m.aluno_id, m.turma, m.data_matricula desc nulls last
),
inscritos as (
  select * from roster
  union all
  select * from legado
)
select i.turma_id,
       i.curso,
       i.data_inicio,
       i.aluno_id,
       i.nome,
       i.telefone,
       i.email,
       i.tipo_matricula,
       tipos.tipo,
       e.status,
       e.enviado_em,
       e.resposta,
       e.respondido_em,
       e.resposta_origem,
       case
         when tipos.tipo = 'confirmacao' and conf.confirmado then 'confirmado'
         when e.aluno_id is null          then 'nao enfileirado'
         when e.status   = 'pendente'     then 'aguardando envio'
         when e.status   = 'erro'         then 'erro no envio'
         when e.resposta = 'sim'          then 'confirmado'
         when e.resposta = 'nao'          then 'nao vem'
         when e.resposta = 'sem_resposta' then 'sem resposta'
         else 'aguardando resposta'
       end as situacao,
       (coalesce(nullif(i.telefone, ''), nullif(i.email, '')) is null) as sem_contato
  from inscritos i
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join public.pedagogico_envios e
         on e.aluno_id = i.aluno_id and e.turma_id = i.turma_id and e.tipo = tipos.tipo
  left join lateral (
    select true as confirmado
      from public.pedagogico_confirmacoes pc
     where pc.aluno_id = i.aluno_id and pc.turma_id = i.turma_id
     limit 1
  ) conf on true
 where exists (
     select 1 from public.dim_cursos dc
      where public.norm_curso(dc.nome_curso) = public.norm_curso(i.curso)
        and dc.grade_pedagogico
   );

revoke all on public.vw_turma_inscritos_base from anon, authenticated;
grant select on public.vw_turma_inscritos_base to service_role;
notify pgrst, 'reload schema';
commit;

-- Validacao:
-- select count(*) from vw_turma_inscritos_base
--  where turma_id='2026 - CIS-GL252' and tipo='confirmacao' and sem_contato;

