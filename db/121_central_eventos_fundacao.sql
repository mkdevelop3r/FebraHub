-- ============================================================
-- 121_central_eventos_fundacao.sql  (v2 — pós-colisão)
-- Central de Eventos do Marketing — Febracis
--
-- v2: já existe `eventos` no banco (sistema de auditoria/gate,
-- id bigint + token). Todas as tabelas novas ganham prefixo mkt_.
-- Ponte entre os dois mundos: sympla_evento_id (existe nas duas).
-- Idempotente: limpa restos da tentativa anterior antes de criar.
-- ============================================================

-- ---------- 0. LIMPEZA (restos da 1ª tentativa, se houver) ----------
drop view  if exists vw_lead_time_acoes;
drop view  if exists vw_trafego_evento;
drop view  if exists vw_funil_evento;
drop view  if exists vw_fila_cobranca_prazo;
drop table if exists templates_acao cascade;
drop table if exists tipos_evento   cascade;
drop table if exists unidades       cascade;
-- (só as NOSSAS; a `eventos` de auditoria não é tocada em nada aqui)

-- ---------- 1. UNIDADES ----------
create table mkt_unidades (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  slug             text not null unique,          -- 'ssa'
  agenda_google_id text,                          -- ID do calendário oficial
  ativa            boolean not null default true
);

insert into mkt_unidades (nome, slug) values ('Febracis Salvador', 'ssa');
-- Recife quando chegar a hora:
-- insert into mkt_unidades (nome, slug) values ('Febracis Recife', 'rec');

-- ---------- 2. CATÁLOGO (planilha validada pelo Bruno) ----------
create table mkt_tipos_evento (
  id             uuid primary key default gen_random_uuid(),
  prefixo        text not null unique,            -- '[PALESTRA]'
  nome           text not null,
  gera_checklist boolean not null default true,   -- Maestria = false
  ativo          boolean not null default true
);

create table mkt_templates_acao (
  id                 uuid primary key default gen_random_uuid(),
  tipo_evento_id     uuid not null references mkt_tipos_evento(id),
  nome               text not null,
  responsavel_padrao text,
  prazo_dias_antes   int  not null,               -- 15 = pronto em D-15
  conclusao          text not null default 'manual'
                     check (conclusao in ('manual','automatica')),
  ordem              int  not null default 0
);

-- ---------- 3. EVENTOS DA AGENDA ----------
create table mkt_eventos (
  id               uuid primary key default gen_random_uuid(),
  unidade_id       uuid not null references mkt_unidades(id),
  tipo_evento_id   uuid references mkt_tipos_evento(id), -- null = desconhecido
  nome             text not null,
  codigo           text unique,                   -- 'FOP-AGO26-SSA' → nome da campanha
  data_evento      date not null,
  google_event_id  text unique,
  sympla_evento_id text,                          -- PONTE com Sympla e com a `eventos` de auditoria
  status           text not null default 'pendente_classificacao'
                   check (status in ('pendente_classificacao','ativo',
                                     'sem_acoes','concluido','cancelado')),
  criado_em        timestamptz not null default now()
);

create index on mkt_eventos (unidade_id, data_evento);

-- ---------- 4. AÇÕES DO EVENTO (o checklist) ----------
create table mkt_acoes_evento (
  id               uuid primary key default gen_random_uuid(),
  evento_id        uuid not null references mkt_eventos(id) on delete cascade,
  template_acao_id uuid references mkt_templates_acao(id),
  nome             text not null,
  responsavel      text,
  prazo            date not null,
  conclusao        text not null default 'manual'
                   check (conclusao in ('manual','automatica')),
  concluida        boolean not null default false,
  concluida_em     timestamptz,
  concluida_por    uuid references auth.users(id)
);

create index on mkt_acoes_evento (evento_id);
create index on mkt_acoes_evento (concluida, prazo);

create or replace function fn_mkt_marca_conclusao() returns trigger
language plpgsql as $$
begin
  if new.concluida and not old.concluida then
    new.concluida_em := now();
    new.concluida_por := auth.uid();
  elsif not new.concluida and old.concluida then
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end $$;

create trigger trg_mkt_marca_conclusao
  before update of concluida on mkt_acoes_evento
  for each row execute function fn_mkt_marca_conclusao();

create or replace function fn_mkt_gera_checklist() returns trigger
language plpgsql as $$
begin
  if new.tipo_evento_id is not null then
    if exists (select 1 from mkt_tipos_evento t
               where t.id = new.tipo_evento_id and t.gera_checklist) then
      insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                    responsavel, prazo, conclusao)
      select new.id, t.id, t.nome, t.responsavel_padrao,
             new.data_evento - t.prazo_dias_antes, t.conclusao
      from mkt_templates_acao t
      where t.tipo_evento_id = new.tipo_evento_id;
      new.status := 'ativo';
    else
      new.status := 'sem_acoes';
    end if;
  end if;
  return new;
end $$;

create trigger trg_mkt_gera_checklist
  before insert on mkt_eventos
  for each row execute function fn_mkt_gera_checklist();

-- ---------- 5. TRÁFEGO ----------
create table mkt_campanhas_trafego (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid references mkt_eventos(id),
  nome_campanha text not null,
  plataforma    text not null default 'meta',
  external_id   text unique,
  data_inicio   date,
  data_fim      date,
  status        text not null default 'ativa'
                check (status in ('ativa','pausada','encerrada')),
  ultima_sync   timestamptz
);

create table mkt_campanhas_snapshot_diario (
  campanha_id uuid not null references mkt_campanhas_trafego(id) on delete cascade,
  dia         date not null,
  gasto       numeric(12,2) not null default 0,
  leads       int not null default 0,
  impressoes  bigint,
  cliques     int,
  primary key (campanha_id, dia)
);

-- ---------- 6. LEADS E O CAMINHO DO LEAD ----------
create table mkt_leads (
  id              uuid primary key default gen_random_uuid(),
  unidade_id      uuid not null references mkt_unidades(id),
  evento_id       uuid references mkt_eventos(id),
  campanha_id     uuid references mkt_campanhas_trafego(id),
  crm_contact_id  text unique,
  origem          text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  etapa_atual     text not null default 'novo'
                  check (etapa_atual in ('novo','sem_resposta','respondeu',
                                         'negociacao','venda','perdido')),
  valor_venda     numeric(12,2),
  criado_em       timestamptz not null default now()
);

create index on mkt_leads (evento_id, etapa_atual);
create index on mkt_leads (campanha_id);

create table mkt_lead_etapas (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid not null references mkt_leads(id) on delete cascade,
  etapa     text not null,
  entrou_em timestamptz not null default now(),
  fonte     text not null default 'crm_sync'
);

create index on mkt_lead_etapas (lead_id, entrou_em);

-- ---------- 7. RESULTADO DO EVENTO ----------
create table mkt_resultados_evento (
  evento_id     uuid primary key references mkt_eventos(id) on delete cascade,
  inscritos     int,
  presentes     int,
  vendas_pitch  int,
  valor_pitch   numeric(12,2),
  vendas_pos    int,
  valor_pos     numeric(12,2),
  atualizado_em timestamptz not null default now()
);

-- ---------- 8. NOTIFICAÇÕES ----------
create table mkt_notificacoes_enviadas (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,
  referencia   uuid not null,
  destinatario text not null,
  enviada_em   timestamptz not null default now()
);

create view vw_mkt_fila_cobranca_prazo as
select a.id as acao_id, a.nome as acao, a.responsavel, a.prazo,
       e.nome as evento, e.data_evento, u.slug as unidade
from mkt_acoes_evento a
join mkt_eventos e on e.id = a.evento_id
join mkt_unidades u on u.id = e.unidade_id
where not a.concluida
  and a.prazo < current_date
  and e.status = 'ativo'
  and not exists (select 1 from mkt_notificacoes_enviadas n
                  where n.tipo = 'cobranca_prazo'
                    and n.referencia = a.id
                    and n.enviada_em::date = current_date);

-- ---------- 9. PERFIS E RLS ----------
alter table perfis
  add column if not exists unidade_id uuid references mkt_unidades(id),
  add column if not exists gestor_marketing boolean not null default false;
-- Bruno: setor='marketing' + gestor_marketing=true.
-- Colaboradores: setor='marketing' + unidade_id da praça.

alter table mkt_eventos            enable row level security;
alter table mkt_acoes_evento       enable row level security;
alter table mkt_campanhas_trafego  enable row level security;
alter table mkt_leads              enable row level security;
alter table mkt_resultados_evento  enable row level security;

create policy sel_mkt_eventos on mkt_eventos for select using (
  exists (select 1 from perfis p
          where p.id = auth.uid()
            and p.setor in ('marketing','geral')
            and (p.gestor_marketing or p.unidade_id = mkt_eventos.unidade_id))
);
-- Repetir o padrão nas demais no 123 (escrita sensível via security definer).

-- ---------- 10. VISÕES DO ACOMPANHAMENTO (Hub Marketing) ----------
create view vw_mkt_funil_evento as
select e.id as evento_id, e.nome, e.data_evento, u.slug as unidade,
       count(l.id)                                            as leads,
       count(*) filter (where l.etapa_atual = 'sem_resposta') as sem_resposta,
       count(*) filter (where l.etapa_atual = 'respondeu')    as respondeu,
       count(*) filter (where l.etapa_atual = 'negociacao')   as negociacao,
       count(*) filter (where l.etapa_atual = 'venda')        as vendas,
       coalesce(sum(l.valor_venda), 0)                        as valor_vendido
from mkt_eventos e
join mkt_unidades u on u.id = e.unidade_id
left join mkt_leads l on l.evento_id = e.id
group by e.id, e.nome, e.data_evento, u.slug;

create view vw_mkt_trafego_evento as
select e.id as evento_id, e.nome, e.codigo,
       min(c.data_inicio)        as trafego_inicio,
       coalesce(sum(s.gasto), 0) as gasto_total,
       coalesce(sum(s.leads), 0) as leads_trafego,
       case when sum(s.leads) > 0
            then round(sum(s.gasto) / sum(s.leads), 2) end as custo_por_lead,
       bool_or(c.status = 'ativa') as rodando_agora
from mkt_eventos e
left join mkt_campanhas_trafego c on c.evento_id = e.id
left join mkt_campanhas_snapshot_diario s on s.campanha_id = c.id
group by e.id, e.nome, e.codigo;

create view vw_mkt_lead_time_acoes as
select ta.nome as acao, u.slug as unidade, a.responsavel,
       avg(e.data_evento - a.concluida_em::date) as dias_antes_do_evento_media,
       avg((a.concluida_em::date - a.prazo))     as atraso_medio_dias,
       count(*) filter (where a.concluida_em::date > a.prazo) as vezes_atrasada
from mkt_acoes_evento a
join mkt_templates_acao ta on ta.id = a.template_acao_id
join mkt_eventos e on e.id = a.evento_id
join mkt_unidades u on u.id = e.unidade_id
where a.concluida
group by ta.nome, u.slug, a.responsavel;
