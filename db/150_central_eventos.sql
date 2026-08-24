-- ============================================================
-- FebraHub · Migration 150 — Central de Eventos (Salvador)
--
-- Kanban dos eventos/turmas do período, com vendas (Salesforce), local
-- e confirmados. Colunas organizadas por tempo: este mês / próximo mês.
--
-- DECISÕES (21/08/2026):
--
-- CONFIRMADOS é número INFORMADO à mão pela equipe, não vem da
-- automação do pedagógico. A automação grava resposta 'sim' em
-- pedagogico_envios, mas o retorno raramente chega (6 respostas em ~300
-- envios), então exibir aquele número seria enganoso.
--
-- LOCAL: cursos GGB acontecem na sede da Febracis; o IF costuma ser
-- fora. A view sugere 'Sede Febracis' quando ninguém informou, e marca
-- local_padrao = true para o front deixar claro que é sugestão. O campo
-- é sempre editável.
--
-- EDIÇÃO restrita a lista explícita (evento_editor), porque a permissão
-- não cabe num setor só: Carmen Acassia (comercial), Bruno Cordeiro
-- (marketing), Elis Figueiredo (pedagogico), Daniele Oliveira
-- (central-eventos). Admins também podem.
--
-- ATENÇÃO: em fato_base_alunos a coluna da turma chama-se `turma`
-- (não turma_id), e casa com dim_turmas.turma_id.
-- ============================================================

create table if not exists public.evento_detalhe (
  turma_id        text primary key,
  local           text,
  endereco        text,
  confirmados     integer,
  capacidade      integer,
  observacao      text,
  atualizado_por  uuid references public.perfis(id),
  atualizado_em   timestamptz default now()
);

create table if not exists public.evento_editor (
  perfil_id   uuid primary key references public.perfis(id),
  incluido_em timestamptz default now()
);

insert into public.evento_editor (perfil_id)
select id from public.perfis
where nome in ('Carmen Acassia', 'Bruno Cordeiro', 'Elis Figueiredo', 'Daniele Oliveira')
on conflict (perfil_id) do nothing;

create or replace function public.pode_editar_evento()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.evento_editor e where e.perfil_id = auth.uid()
  ) or exists (
    select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin'
  );
$$;

alter table public.evento_detalhe enable row level security;
alter table public.evento_editor  enable row level security;

drop policy if exists evento_detalhe_leitura on public.evento_detalhe;
create policy evento_detalhe_leitura on public.evento_detalhe
  for select to authenticated using (true);

drop policy if exists evento_detalhe_escrita on public.evento_detalhe;
create policy evento_detalhe_escrita on public.evento_detalhe
  for all to authenticated
  using (public.pode_editar_evento())
  with check (public.pode_editar_evento());

drop policy if exists evento_editor_leitura on public.evento_editor;
create policy evento_editor_leitura on public.evento_editor
  for select to authenticated using (true);

drop view if exists public.vw_central_eventos cascade;
create view public.vw_central_eventos as
with vendas as (
  select turma, count(distinct original_id_venda) as vendas
  from public.fato_base_alunos
  where turma is not null
  group by turma
)
select
  t.turma_id,
  coalesce(nullif(t.nome_comercial, ''), t.curso) as titulo,
  t.curso,
  t.data_inicio,
  t.data_fim,
  t.horario_credenciamento,
  t.horario_inicio,
  case
    when date_trunc('month', t.data_inicio) = date_trunc('month', current_date)
      then 'este_mes'
    when date_trunc('month', t.data_inicio) = date_trunc('month', current_date) + interval '1 month'
      then 'proximo_mes'
    when t.data_inicio < current_date then 'passado'
    else 'depois'
  end as coluna,
  (t.data_inicio - current_date) as dias_para_inicio,
  coalesce(v.vendas, 0) as vendas,
  d.confirmados,
  coalesce(nullif(d.local, ''), nullif(t.local, ''), 'Sede Febracis') as local,
  coalesce(nullif(d.endereco, ''), nullif(t.endereco, ''))            as endereco,
  (nullif(d.local, '') is null and nullif(t.local, '') is null)       as local_padrao,
  coalesce(d.capacidade, t.capacidade) as capacidade,
  d.observacao,
  d.atualizado_em,
  p.nome as atualizado_por
from public.dim_turmas t
left join vendas v                on v.turma = t.turma_id
left join public.evento_detalhe d on d.turma_id = t.turma_id
left join public.perfis p         on p.id = d.atualizado_por
where t.data_inicio is not null
  and (
    public.pode_ver('central-eventos')
    or public.pode_ver('marketing')
  );
grant select on public.vw_central_eventos to authenticated;

notify pgrst, 'reload schema';
