-- ============================================================
-- FebraHub · Migration 05 — Acesso por setor (RLS efetiva)
--
-- REGRA: "o Financeiro só vê o Hub Financeiro" precisa ser
-- verdade NO BANCO, nao no React. O bundle JS e publico e a
-- anon key tambem — qualquer um abre o DevTools e chama o
-- Supabase direto. Esconder o botao nao e seguranca.
--
-- ARQUITETURA:
--   Tabelas de fato/dimensao  -> RLS ligada, ZERO policies.
--                                Ninguem le. Nem anon, nem logado.
--   Views por hub             -> unico caminho do front.
--                                A permissao mora no WHERE da view.
--                                PII (CPF, telefone) nunca entra aqui.
--
-- ATENCAO: uma view no Postgres roda com os privilegios do DONO
-- e IGNORA a RLS das tabelas de baixo. Por isso a checagem tem
-- que estar dentro da view. Sem o WHERE pode_ver(...), a view
-- vira um buraco na seguranca.
-- ============================================================


-- ============================================================
-- 1. perfis + setores
-- ============================================================
begin;

alter table public.perfis drop constraint if exists chk_perfis_setor;
alter table public.perfis drop constraint if exists chk_perfis_papel;

alter table public.perfis
  add constraint chk_perfis_setor check (setor in (
    'geral','financeiro','comercial','marketing',
    'pedagogico','loja','eventos','estoque'
  )),
  add constraint chk_perfis_papel check (papel in ('admin','gestor','membro'));

alter table public.perfis alter column setor set not null;
alter table public.perfis alter column papel set not null;

commit;


-- ============================================================
-- 2. Helpers de permissao
-- security definer: precisam ler `perfis` sem cair na RLS da
-- propria `perfis` (senao recursao infinita).
-- ============================================================
begin;

create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid()
$$;

create or replace function public.meu_setor()
returns text language sql stable security definer set search_path = public as $$
  select setor from public.perfis where id = auth.uid()
$$;

-- A regra inteira do sistema, em uma funcao.
create or replace function public.pode_ver(setor_alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.meu_papel() = 'admin'      -- Dulce ve tudo
    or public.meu_setor() = 'geral'   -- perfil geral ve tudo
    or public.meu_setor() = setor_alvo,
    false                             -- sem perfil = ve nada
  )
$$;

grant execute on function public.meu_papel()  to authenticated;
grant execute on function public.meu_setor()  to authenticated;
grant execute on function public.pode_ver(text) to authenticated;

commit;


-- ============================================================
-- 3. RLS da propria `perfis`
-- ============================================================
begin;

alter table public.perfis enable row level security;

drop policy if exists "perfil proprio" on public.perfis;
create policy "perfil proprio" on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.meu_papel() = 'admin');

drop policy if exists "admin gerencia perfis" on public.perfis;
create policy "admin gerencia perfis" on public.perfis
  for all to authenticated
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');

commit;


-- ============================================================
-- 4. Perfil criado automaticamente no signup
-- Sem isto, usuario loga e fica sem setor -> pode_ver() = false
-- -> ve tudo vazio, sem entender por que.
-- ============================================================
begin;

create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, setor, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'setor', 'comercial'),
    coalesce(new.raw_user_meta_data->>'papel', 'membro')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

commit;


-- ============================================================
-- 5. VIEWS POR HUB — o unico caminho do front
-- Nenhuma expoe CPF, telefone, e-mail ou data de nascimento.
-- ============================================================

-- ---------- COMERCIAL ----------
create or replace view public.vw_comercial_funil as
select
  date_trunc('month', n.data_criacao)::date as mes,
  n.etapa_funil,
  n.status_negocio,
  count(*)                                   as negocios,
  count(*) filter (where n.status_negocio ilike '%ganho%') as ganhos,
  sum(n.valor)                               as valor_total,
  avg(n.valor)                               as ticket_medio
from public.fato_negocio_lead n
where public.pode_ver('comercial')
group by 1, 2, 3;

create or replace view public.vw_comercial_ranking as
select
  date_trunc('month', n.data_criacao)::date as mes,
  c.consultor_id,
  c.nome                                     as consultor,
  c.equipe,
  count(*)                                   as negocios,
  count(*) filter (where n.status_negocio ilike '%ganho%') as ganhos,
  round(100.0 * count(*) filter (where n.status_negocio ilike '%ganho%')
        / nullif(count(*), 0), 1)            as taxa_conversao,
  sum(n.valor) filter (where n.status_negocio ilike '%ganho%') as receita
from public.fato_negocio_lead n
join public.dim_consultores c on c.consultor_id = n.consultor_id
where public.pode_ver('comercial')
group by 1, 2, 3, 4;


-- ---------- FINANCEIRO ----------
-- Receita de curso (Salesforce) e de evento (Sympla) entram
-- SEPARADAS, com unidade de negocio. Somar R$1.900 com R$45
-- produz um numero sem significado.
create or replace view public.vw_financeiro_receita as
select
  date_trunc('month', p.data_pagamento)::date as mes,
  coalesce(p.unidade_geradora_venda, 'nao_informado') as unidade,
  'curso'::text                               as tipo_receita,
  p.status_pagamento,
  p.forma_pagamento,
  count(*)                                    as transacoes,
  sum(p.valor)                                as valor_bruto,
  sum(p.valor)                                as valor_liquido  -- sem taxa de plataforma
from public.fato_pagamento_base p
where public.pode_ver('financeiro')
group by 1, 2, 3, 4, 5

union all

select
  date_trunc('month', e.data_pedido)::date,
  'eventos',
  'evento',
  e.status_pedido,
  e.forma_pagamento,
  count(*),
  sum(e.valor_total),
  sum(e.valor_liquido)   -- Sympla cobra ~11,5%. O caixa recebe o liquido.
from public.fato_pedidos e
where public.pode_ver('financeiro')
group by 1, 2, 3, 4, 5;

create or replace view public.vw_financeiro_inadimplencia as
select
  date_trunc('month', p.data_pagamento)::date as mes,
  p.status_pagamento,
  count(*)                                    as transacoes,
  sum(p.valor)                                as valor,
  round(100.0 * sum(p.valor) / nullif(
    sum(sum(p.valor)) over (partition by date_trunc('month', p.data_pagamento)), 0), 1
  )                                           as pct_do_mes
from public.fato_pagamento_base p
where public.pode_ver('financeiro')
group by 1, 2;


-- ---------- MARKETING ----------
create or replace view public.vw_marketing_origem as
select
  date_trunc('month', n.data_criacao)::date as mes,
  coalesce(o.nome, 'nao_informado')          as origem,
  coalesce(o.grupo_nome, 'nao_informado')    as grupo,
  n.nome_campanha,
  n.aplicativo_origem,
  count(*)                                   as leads,
  count(*) filter (where n.status_negocio ilike '%ganho%') as ganhos,
  round(100.0 * count(*) filter (where n.status_negocio ilike '%ganho%')
        / nullif(count(*), 0), 1)            as taxa_conversao
from public.fato_negocio_lead n
left join public.dim_origens o on o.origem_id = n.origem_id
where public.pode_ver('marketing')
group by 1, 2, 3, 4, 5;


-- ---------- PEDAGOGICO ----------
create or replace view public.vw_pedagogico_turmas as
select
  date_trunc('month', m.data_matricula)::date as mes,
  c.curso_id,
  c.nome_curso,
  m.turma,
  count(*)                                    as matriculas,
  count(*) filter (where m.data_conclusao is not null) as concluintes,
  round(100.0 * count(*) filter (where m.data_conclusao is not null)
        / nullif(count(*), 0), 1)             as taxa_conclusao,
  round(avg(m.data_conclusao - m.data_matricula)) as dias_medios_conclusao
from public.fato_base_alunos m
join public.dim_cursos c on c.curso_id = m.curso_id
where public.pode_ver('pedagogico')
group by 1, 2, 3, 4;


-- ---------- EVENTOS ----------
create or replace view public.vw_eventos_desempenho as
select
  e.evento_id,
  e.nome_evento,
  e.data_inicio,
  e.cidade,
  count(distinct pa.participante_id)          as ingressos,
  count(distinct pa.participante_id) filter (where pa.check_in) as compareceram,
  round(100.0 * count(distinct pa.participante_id) filter (where pa.check_in)
        / nullif(count(distinct pa.participante_id), 0), 1) as taxa_comparecimento,
  sum(pd.valor_total)                         as receita_bruta,
  sum(pd.valor_liquido)                       as receita_liquida,
  sum(pd.valor_total - pd.valor_liquido)      as taxa_plataforma
from public.dim_eventos e
left join public.fato_participantes pa on pa.evento_id = e.evento_id
left join public.fato_pedidos pd       on pd.evento_id = e.evento_id
where public.pode_ver('eventos')
group by 1, 2, 3, 4;


-- ---------- DIRETORIA (consolidado, so admin/geral) ----------
create or replace view public.vw_diretoria_consolidado as
select
  date_trunc('month', p.data_pagamento)::date as mes,
  'cursos'::text                              as unidade_negocio,
  sum(p.valor)                                as receita_liquida,
  count(*)                                    as transacoes
from public.fato_pagamento_base p
where public.pode_ver('geral')
group by 1

union all

select
  date_trunc('month', e.data_pedido)::date,
  'eventos',
  sum(e.valor_liquido),
  count(*)
from public.fato_pedidos e
where public.pode_ver('geral')
group by 1;


-- ============================================================
-- 6. Grants: o front so enxerga views. Nunca tabela crua.
-- ============================================================
begin;

revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.vw_comercial_funil,
  public.vw_comercial_ranking,
  public.vw_financeiro_receita,
  public.vw_financeiro_inadimplencia,
  public.vw_marketing_origem,
  public.vw_pedagogico_turmas,
  public.vw_eventos_desempenho,
  public.vw_diretoria_consolidado
to authenticated;

grant select on public.perfis to authenticated;

commit;


-- ============================================================
-- 7. Criar a Dulce (admin) e os primeiros perfis
--
-- Crie os usuarios primeiro no painel:
--   Authentication -> Users -> Add user (email + senha)
-- Depois rode isto para dar setor/papel a cada um.
-- ============================================================

-- update public.perfis set setor = 'geral',      papel = 'admin'
--   where id = (select id from auth.users where email = 'dulce@febracis.com');

-- update public.perfis set setor = 'financeiro', papel = 'membro'
--   where id = (select id from auth.users where email = 'financeiro@febracis.com');

-- Conferir quem e o que:
-- select p.nome, p.setor, p.papel, u.email
-- from public.perfis p join auth.users u on u.id = p.id;


-- ============================================================
-- 8. TESTE DE SEGURANCA — rode isto antes de subir pro Netlify
-- Logue como um usuario do Financeiro e tente:
--   select * from public.vw_comercial_funil;      -> deve vir VAZIO
--   select * from public.fato_pagamento_base;     -> deve dar ERRO
--   select * from public.dim_alunos;              -> deve dar ERRO
-- Se qualquer uma retornar dado, a RLS esta furada.
-- ============================================================
