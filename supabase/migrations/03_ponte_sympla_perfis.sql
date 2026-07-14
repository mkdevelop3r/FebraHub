-- ============================================================
-- FebraHub · Migration 03
-- 1. Normalização de telefone + ponte Lead -> Aluno
-- 2. FKs e datas do Sympla (participantes/pedidos)
-- 3. Unidade de negócio (impede somar R$19,90 com R$1.900)
-- 4. perfis pronta para RLS
-- Rodar bloco a bloco.
-- ============================================================


-- ============================================================
-- BLOCO 1 — Telefone normalizado, materializado e indexado
-- Normalizar dentro do JOIN a cada query = 66k x 13k scans.
-- Coluna gerada: o banco calcula uma vez, indexa, e acabou.
--
-- Regra: últimos 8 dígitos. Isso neutraliza as três variações
-- que quebram o match no Brasil — +55, DDD, e o 9 extra do
-- celular. Risco conhecido: colisão entre DDDs diferentes.
-- Por isso guardamos também o DDD, para medir confiança.
-- ============================================================
begin;

alter table public.dim_leads
  add column if not exists tel_norm text
    generated always as (
      right(regexp_replace(coalesce(telefone_completo,''), '\D', '', 'g'), 8)
    ) stored,
  add column if not exists tel_ddd text
    generated always as (
      case when length(regexp_replace(coalesce(telefone_completo,''), '\D', '', 'g')) >= 10
        then substr(
               right(regexp_replace(coalesce(telefone_completo,''), '\D', '', 'g'), 11),
               1, 2)
      end
    ) stored;

alter table public.dim_alunos
  add column if not exists tel_norm text
    generated always as (
      right(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), 8)
    ) stored,
  add column if not exists tel_ddd text
    generated always as (
      case when length(regexp_replace(coalesce(telefone,''), '\D', '', 'g')) >= 10
        then substr(
               right(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), 11),
               1, 2)
      end
    ) stored,
  add column if not exists email_norm text
    generated always as (lower(trim(coalesce(email,'')))) stored;

alter table public.dim_leads
  add column if not exists email_norm text
    generated always as (lower(trim(coalesce(email,'')))) stored;

create index if not exists ix_leads_tel   on public.dim_leads  (tel_norm)  where tel_norm <> '';
create index if not exists ix_alunos_tel  on public.dim_alunos (tel_norm)  where tel_norm <> '';
create index if not exists ix_leads_email on public.dim_leads  (email_norm) where email_norm <> '';
create index if not exists ix_alunos_email on public.dim_alunos(email_norm) where email_norm <> '';

commit;


-- ============================================================
-- BLOCO 2 — Ponte Lead -> Aluno
-- Tabela explícita, não view: o match é uma DECISÃO, e decisão
-- precisa ser auditável, corrigível à mão e ter confiança.
-- Nunca finja que um match de 40% é um fato de 100%.
-- ============================================================
begin;

create table if not exists public.ponte_lead_aluno (
  lead_id      text not null references public.dim_leads(lead_id),
  aluno_id     text not null references public.dim_alunos(aluno_id),
  metodo       text not null check (metodo in ('telefone','telefone_ddd','email','manual')),
  confianca    numeric(3,2) not null,   -- 0.00 a 1.00
  criado_em    timestamptz not null default now(),
  primary key (lead_id, aluno_id)
);

-- Match forte: telefone + DDD batendo
insert into public.ponte_lead_aluno (lead_id, aluno_id, metodo, confianca)
select l.lead_id, a.aluno_id, 'telefone_ddd', 0.95
from public.dim_leads l
join public.dim_alunos a
  on a.tel_norm = l.tel_norm
 and a.tel_ddd  = l.tel_ddd
where l.tel_norm <> '' and l.tel_ddd is not null
on conflict do nothing;

-- Match médio: telefone sem DDD confiável
insert into public.ponte_lead_aluno (lead_id, aluno_id, metodo, confianca)
select l.lead_id, a.aluno_id, 'telefone', 0.75
from public.dim_leads l
join public.dim_alunos a on a.tel_norm = l.tel_norm
where l.tel_norm <> ''
on conflict do nothing;

-- Match complementar: e-mail (pega quem não tinha telefone)
insert into public.ponte_lead_aluno (lead_id, aluno_id, metodo, confianca)
select l.lead_id, a.aluno_id, 'email', 0.90
from public.dim_leads l
join public.dim_alunos a on a.email_norm = l.email_norm
where l.email_norm <> ''
on conflict do nothing;

commit;

-- Cobertura real da ponte (é ESTE número que vai na tela)
select
  metodo,
  count(*)                                  as vinculos,
  count(distinct aluno_id)                  as alunos_alcancados,
  round(100.0 * count(distinct aluno_id)
        / (select count(*) from public.dim_alunos), 1) as pct_base_alunos
from public.ponte_lead_aluno
group by metodo
order by vinculos desc;


-- ============================================================
-- BLOCO 3 — Sympla: datas, FKs e ligação com o resto
-- ============================================================
begin;

-- Data em dia, para ligar ao calendário e indexar
alter table public.fato_pedidos
  add column if not exists data_pedido_dia date
    generated always as (data_pedido::date) stored;

alter table public.fato_participantes
  add column if not exists data_pedido_dia date
    generated always as (data_pedido::date) stored,
  add column if not exists email_norm text
    generated always as (lower(trim(coalesce(email_participante,'')))) stored;

-- FKs internas do Sympla (essas existem e são seguras)
alter table public.fato_pedidos
  add constraint fk_pedido_evento
    foreign key (evento_id) references public.dim_eventos(evento_id);

alter table public.fato_participantes
  add constraint fk_part_evento
    foreign key (evento_id) references public.dim_eventos(evento_id),
  add constraint fk_part_pedido
    foreign key (pedido_id) references public.fato_pedidos(pedido_id);

create index if not exists ix_part_evento on public.fato_participantes (evento_id, data_pedido_dia);
create index if not exists ix_part_email  on public.fato_participantes (email_norm) where email_norm <> '';
create index if not exists ix_pedido_data on public.fato_pedidos (data_pedido_dia);

commit;


-- ============================================================
-- BLOCO 4 — Unidade de negócio
-- Sem isso, "receita total" soma ingresso de R$19,90 com
-- matrícula de R$1.900 e produz um número sem significado.
-- ============================================================
begin;

create table if not exists public.dim_unidade_negocio (
  unidade_id text primary key,
  nome       text not null,
  ticket_tipo text not null check (ticket_tipo in ('alto','baixo'))
);

insert into public.dim_unidade_negocio (unidade_id, nome, ticket_tipo) values
  ('ggb',    'Cursos GGB (Salesforce)', 'alto'),
  ('cis',    'CIS (Salesforce)',        'alto'),
  ('evento', 'Eventos (Sympla)',        'baixo'),
  ('loja',   'Loja',                    'baixo')
on conflict do nothing;

commit;


-- ============================================================
-- BLOCO 5 — perfis: base de toda a RLS
-- Hoje setor e papel são text livre. Um typo ('comercal')
-- silenciosamente tira o acesso da pessoa a tudo.
-- ============================================================
begin;

alter table public.perfis
  add constraint chk_perfis_setor check (
    setor in ('geral','financeiro','marketing','comercial','pedagogico','loja','eventos')
  ),
  add constraint chk_perfis_papel check (
    papel in ('admin','gestor','membro')
  );

alter table public.perfis alter column setor set not null;
alter table public.perfis alter column papel set not null;

-- Helpers usados por TODAS as policies. security definer para
-- poder ler perfis sem cair na RLS da própria perfis (recursão).
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid()
$$;

create or replace function public.meu_setor()
returns text language sql stable security definer set search_path = public as $$
  select setor from public.perfis where id = auth.uid()
$$;

-- Cada um lê o próprio perfil. Admin lê todos.
create policy "perfil proprio" on public.perfis
  for select using (id = auth.uid() or public.meu_papel() = 'admin');

commit;
