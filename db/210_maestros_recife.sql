-- Maestros Recife: fonte Salesforce isolada, mesma estrutura de Salvador.
-- A carga substitui um snapshot validado; as anotações não são carga.
begin;

create table if not exists public.fato_maestro_recife (
  cpf text primary key,
  nome text not null,
  email text,
  telefone text,
  consultor text,
  data_nascimento date,
  total_cursos integer not null check (total_cursos > 0),
  total_investido numeric not null,
  primeira_compra date not null,
  ultima_compra date not null,
  aulas_compareceu integer not null check (aulas_compareceu >= 0),
  aulas_faltou integer not null check (aulas_faltou >= 0),
  data_maestria date not null,
  sincronizado_em timestamptz not null default now()
);
alter table public.fato_maestro_recife enable row level security;
revoke all on public.fato_maestro_recife from anon, authenticated;
grant all on public.fato_maestro_recife to service_role;

create table if not exists public.maestro_anotacao_recife (
  aluno_id text primary key,
  como_gosta_ser_chamado text,
  empresa text,
  faturamento text,
  cargo text,
  observacoes text,
  atualizado_em timestamptz default now()
);
alter table public.maestro_anotacao_recife enable row level security;
drop policy if exists maestro_recife_select on public.maestro_anotacao_recife;
create policy maestro_recife_select on public.maestro_anotacao_recife
  for select to authenticated using (public.pode_ver('pedagogico'));
drop policy if exists maestro_recife_insert on public.maestro_anotacao_recife;
create policy maestro_recife_insert on public.maestro_anotacao_recife
  for insert to authenticated with check (public.pode_ver('pedagogico'));
drop policy if exists maestro_recife_update on public.maestro_anotacao_recife;
create policy maestro_recife_update on public.maestro_anotacao_recife
  for update to authenticated using (public.pode_ver('pedagogico'))
  with check (public.pode_ver('pedagogico'));
revoke all on public.maestro_anotacao_recife from anon, authenticated;
grant select, insert, update on public.maestro_anotacao_recife to authenticated;
grant all on public.maestro_anotacao_recife to service_role;

create or replace view public.vw_pedagogico_maestros_recife_completo as
select
  m.cpf, m.nome, m.email, m.telefone, m.consultor,
  m.total_cursos, m.total_investido, m.primeira_compra, m.ultima_compra,
  current_date - m.ultima_compra as dias_sem_comprar,
  m.ultima_compra >= current_date - interval '12 months' as ativo,
  m.aulas_compareceu, m.aulas_faltou,
  case when m.aulas_compareceu + m.aulas_faltou > 0
    then round(100.0 * m.aulas_compareceu / (m.aulas_compareceu + m.aulas_faltou), 1)
  end as taxa_presenca,
  m.data_maestria,
  (m.data_maestria + interval '12 months')::date as vence_em,
  (m.data_maestria + interval '12 months')::date - current_date as dias_para_vencer,
  case
    when (m.data_maestria + interval '12 months')::date < current_date then 'Vencido'
    when (m.data_maestria + interval '12 months')::date <= current_date + 60 then 'Perto de vencer'
    else 'Válido'
  end as status_maestria,
  m.data_nascimento,
  extract(day from m.data_nascimento)::integer as dia_nascimento,
  extract(month from m.data_nascimento)::integer as mes_nascimento,
  extract(month from m.data_nascimento) = extract(month from current_date) as aniversaria_mes,
  a.como_gosta_ser_chamado, a.empresa, a.faturamento,
  a.cargo as cargo_anotado, a.observacoes
from public.fato_maestro_recife m
left join public.maestro_anotacao_recife a on a.aluno_id = m.cpf
where public.pode_ver('pedagogico');

create or replace view public.vw_pedagogico_maestros_recife_kpis as
select count(*) as total_maestros,
  count(*) filter (where vence_em >= current_date) as validos,
  count(*) filter (where vence_em < current_date) as vencidos,
  count(*) filter (where vence_em >= current_date and vence_em <= current_date + 60) as perto_vencer
from public.vw_pedagogico_maestros_recife_completo
where public.pode_ver('pedagogico');
revoke all on public.vw_pedagogico_maestros_recife_completo,
  public.vw_pedagogico_maestros_recife_kpis from anon;
grant select on public.vw_pedagogico_maestros_recife_completo,
  public.vw_pedagogico_maestros_recife_kpis to authenticated;

-- Troca atômica do snapshot: só o serviço pode executar.
create or replace function public.sincronizar_maestros_recife(p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer; anterior integer;
begin
  if jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'Carga de maestros deve ser uma lista';
  end if;
  n := jsonb_array_length(p_linhas);
  lock table public.fato_maestro_recife in exclusive mode;
  select count(*) into anterior from public.fato_maestro_recife;
  if n = 0 or (anterior > 0 and n < anterior * 0.8) then
    raise exception 'Carga vazia ou redução superior a 20%%: % -> %', anterior, n;
  end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) r
    where coalesce(r->>'cpf', '') = '' or coalesce(r->>'nome', '') = '')
    or (select count(distinct r->>'cpf') from jsonb_array_elements(p_linhas) r) <> n then
    raise exception 'Maestros sem identificação ou chaves duplicadas';
  end if;
  -- Qualquer erro de tipo/constraint desfaz a troca inteira.
  delete from public.fato_maestro_recife where cpf is not null;
  insert into public.fato_maestro_recife
    (cpf,nome,email,telefone,consultor,total_cursos,total_investido,
     primeira_compra,ultima_compra,aulas_compareceu,aulas_faltou,data_maestria,data_nascimento)
  select cpf,nome,email,telefone,consultor,total_cursos,total_investido,
    primeira_compra,ultima_compra,aulas_compareceu,aulas_faltou,data_maestria,data_nascimento
  from jsonb_to_recordset(p_linhas) as r(cpf text,nome text,email text,telefone text,
    consultor text,total_cursos integer,total_investido numeric,primeira_compra date,
    ultima_compra date,aulas_compareceu integer,aulas_faltou integer,data_maestria date,data_nascimento date);
  return n;
end $$;
revoke all on function public.sincronizar_maestros_recife(jsonb) from public, anon, authenticated;
grant execute on function public.sincronizar_maestros_recife(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;




