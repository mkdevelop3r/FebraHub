-- ============================================================
-- FebraHub · Migration 229 — Maestros: data de nascimento + aniversariantes
--
-- A gestora acompanha os maestros de perto; saber a data de nascimento e
-- quem faz aniversario no mes vira acao de relacionamento. A data vem do
-- Salesforce (Account.Data_de_Nascimento__c, casado por CPFun__c) e mora em
-- dim_alunos.data_nascimento (coluna ja existente). Aqui:
--   1) backfill dos 32 maestros PF (12 estavam sem data no banco);
--   2) vw_pedagogico_maestros_detalhe passa a expor:
--        data_nascimento, dia_nascimento, mes_nascimento, aniversaria_mes;
--   3) vw_pedagogico_maestros_completo repassa esses campos ao front.
-- aniversaria_mes = nascimento no mes corrente (calculado em current_date,
-- entao o destaque anda sozinho a cada mes, sem re-sync).
-- ============================================================

-- 1) Backfill das datas (fonte: Salesforce, puxado por CPF via sf CLI).
update public.dim_alunos da
set data_nascimento = v.dn
from (values
  ('00034801430'::text, '1976-06-27'::date),
  ('00089676521', '1981-12-21'),
  ('00186891598', '1981-01-23'),
  ('00389959561', '1981-08-26'),
  ('00519356519', '1983-10-01'),
  ('00678444560', '1984-09-21'),
  ('00790130580', '1984-09-24'),
  ('00887744575', '1984-09-22'),
  ('01183271514', '1983-08-07'),
  ('01665107502', '1985-02-15'),
  ('01920215590', '1987-01-03'),
  ('01934348570', '1986-11-23'),
  ('02293243559', '1986-03-25'),
  ('02579070508', '1986-04-11'),
  ('02864778580', '1996-01-01'),
  ('04450644557', '1989-12-19'),
  ('04478884552', '1989-12-28'),
  ('05592511574', '1995-01-01'),
  ('07891446547', '1997-08-19'),
  ('17794898897', '1974-10-29'),
  ('51380072549', '1971-02-15'),
  ('51568039549', '1969-10-06'),
  ('61882089553', '1971-06-09'),
  ('63896508504', '1973-04-13'),
  ('78510635587', '1979-03-16'),
  ('81213190568', '1980-09-05'),
  ('82924074568', '1982-07-23'),
  ('83824871572', '1987-12-03'),
  ('87251035553', '1971-02-17'),
  ('94293341587', '1980-03-18'),
  ('96601426504', '1978-08-28'),
  ('97701890572', '1979-08-06')
) as v(cpf, dn)
where lpad(regexp_replace(da.cpf, '\D', '', 'g'), 11, '0') = v.cpf;

-- 2) Detalhe com data de nascimento e flag de aniversariante do mes.
drop view if exists public.vw_pedagogico_maestros_detalhe cascade;
create view public.vw_pedagogico_maestros_detalhe as
with maestros as (
  select
    aluno_id,
    max(data_matricula) as data_maestria
  from public.fato_base_alunos
  where curso_id = 'MAESTRIA' and aluno_id is not null and aluno_id <> ''
  group by aluno_id
),
contato as (
  select distinct on (a.aluno_id)
    a.aluno_id, a.email_cliente, a.telefone_cliente, a.consultor_id
  from public.fato_base_alunos a
  join maestros m on m.aluno_id = a.aluno_id
  where a.email_cliente is not null or a.telefone_cliente is not null
  order by a.aluno_id, a.data_matricula desc nulls last
),
compras as (
  select
    a.aluno_id,
    count(*) as total_cursos,
    round(sum(a.valor)) as total_investido,
    max(a.data_matricula) as ultima_compra,
    min(a.data_matricula) as primeira_compra
  from public.fato_base_alunos a
  join maestros m on m.aluno_id = a.aluno_id
  group by a.aluno_id
),
presenca as (
  select
    a.aluno_id,
    count(*) filter (where c.aluno_id is not null) as compareceu,
    count(*) filter (where c.aluno_id is null) as faltou
  from public.fato_base_alunos a
  join maestros m on m.aluno_id = a.aluno_id
  left join public.fato_credenciamento c
    on c.aluno_id = a.aluno_id and c.turma = a.turma
  where a.turma in (select distinct turma from public.fato_credenciamento)
  group by a.aluno_id
)
select
  co.aluno_id                                    as cpf,
  coalesce(
    da.nome,
    case when co.aluno_id like 'pj:%'
         then replace(substr(co.aluno_id, 4), '_', ' ') end
  )                                              as nome,
  ct.email_cliente                               as email,
  ct.telefone_cliente                            as telefone,
  ct.consultor_id                                as consultor,
  co.total_cursos,
  co.total_investido,
  co.primeira_compra,
  co.ultima_compra,
  (current_date - co.ultima_compra)              as dias_sem_comprar,
  (co.ultima_compra >= current_date - interval '12 months') as ativo,
  coalesce(pr.compareceu, 0)                     as aulas_compareceu,
  coalesce(pr.faltou, 0)                         as aulas_faltou,
  case when coalesce(pr.compareceu,0)+coalesce(pr.faltou,0) > 0
       then round(100.0*pr.compareceu/(pr.compareceu+pr.faltou),1) end as taxa_presenca,
  m.data_maestria,
  (m.data_maestria + interval '12 months')::date as vence_em,
  ((m.data_maestria + interval '12 months')::date - current_date) as dias_para_vencer,
  case
    when (m.data_maestria + interval '12 months')::date < current_date
      then 'Vencido'
    when (m.data_maestria + interval '12 months')::date <= current_date + 60
      then 'Perto de vencer'
    else 'Válido'
  end                                            as status_maestria,
  -- ANIVERSARIO (fonte: Salesforce via dim_alunos.data_nascimento)
  da.data_nascimento,
  extract(day   from da.data_nascimento)::int    as dia_nascimento,
  extract(month from da.data_nascimento)::int    as mes_nascimento,
  (da.data_nascimento is not null
    and extract(month from da.data_nascimento) = extract(month from current_date)
  )                                              as aniversaria_mes
from compras co
join maestros m on m.aluno_id = co.aluno_id
left join contato ct on ct.aluno_id = co.aluno_id
left join presenca pr on pr.aluno_id = co.aluno_id
left join public.dim_alunos da
  on lpad(regexp_replace(da.cpf, '\D', '', 'g'), 11, '0')
   = lpad(regexp_replace(co.aluno_id, '\D', '', 'g'), 11, '0')
  and co.aluno_id not like 'pj:%'
where public.pode_ver('pedagogico')
order by co.total_investido desc;
grant select on public.vw_pedagogico_maestros_detalhe to authenticated;

-- 3) Completo (detalhe + anotacoes) — repassa os campos novos ao front.
drop view if exists public.vw_pedagogico_maestros_completo cascade;
create view public.vw_pedagogico_maestros_completo as
select
  m.cpf,
  m.nome,
  m.email,
  m.telefone,
  m.consultor,
  m.total_cursos,
  m.total_investido,
  m.primeira_compra,
  m.ultima_compra,
  m.dias_sem_comprar,
  m.ativo,
  m.aulas_compareceu,
  m.aulas_faltou,
  m.taxa_presenca,
  m.data_maestria,
  m.vence_em,
  m.dias_para_vencer,
  m.status_maestria,
  m.data_nascimento,
  m.dia_nascimento,
  m.mes_nascimento,
  m.aniversaria_mes,
  a.como_gosta_ser_chamado,
  a.empresa,
  a.faturamento,
  a.cargo as cargo_anotado,
  a.observacoes
from public.vw_pedagogico_maestros_detalhe m
left join public.maestro_anotacao a on a.aluno_id = m.cpf;
grant select on public.vw_pedagogico_maestros_completo to authenticated;

notify pgrst, 'reload schema';
