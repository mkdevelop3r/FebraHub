-- ============================================================
-- HUB DE AUDITORIA COMERCIAL — estrutura no Supabase
-- Febracis Bahia · roteiro da Carmen (ago/2026)
--
-- Uma tabela só para os dois canais: o modelo de WhatsApp (10 etapas) é
-- subconjunto do de ligação (12). WhatsApp deixa quebra_gelo e
-- conhecimento_previo em NULL — assim dá para comparar os canais.
--
-- RLS: PLACAR FECHADO. Só gestão vê (gestor de marketing, gestora comercial,
-- CEO, gerente). As consultoras NÃO têm acesso.
-- ============================================================

-- ---------- dimensão: pesos por canal (exibidos no hub) ----------
create table if not exists dim_peso_etapa (
  canal   text not null,             -- 'ligacao' | 'whatsapp'
  etapa   text not null,
  peso    numeric(4,1) not null,
  ordem   int not null,              -- ordem obrigatória do roteiro
  primary key (canal, etapa)
);

delete from dim_peso_etapa;
insert into dim_peso_etapa (canal, etapa, peso, ordem) values
  ('ligacao','apresentacao',              8, 1),
  ('ligacao','quebra_gelo',               5, 2),
  ('ligacao','motivo_contato',            8, 3),
  ('ligacao','conhecimento_previo',       4, 4),
  ('ligacao','perfil_profissional',       8, 5),
  ('ligacao','objetivos_futuro',         10, 6),
  ('ligacao','desafios_dores',           14, 7),
  ('ligacao','apresentacao_treinamento', 14, 8),
  ('ligacao','validacao_interesse',       7, 9),
  ('ligacao','tratamento_objecoes',       8,10),
  ('ligacao','fechamento',               10,11),
  ('ligacao','proximos_passos',           4,12),
  ('whatsapp','apresentacao',             8, 1),
  ('whatsapp','motivo_contato',          10, 2),
  ('whatsapp','perfil_profissional',      8, 3),
  ('whatsapp','objetivos_futuro',        10, 4),
  ('whatsapp','desafios_dores',          15, 5),
  ('whatsapp','apresentacao_treinamento',15, 6),
  ('whatsapp','validacao_interesse',      8, 7),
  ('whatsapp','tratamento_objecoes',      8, 8),
  ('whatsapp','fechamento',              13, 9),
  ('whatsapp','proximos_passos',          5,10);

-- ---------- dimensão: usuários do CRM ----------
-- assignedTo é CARTEIRA, não autoria: usar sempre o user_id DA MENSAGEM.
create table if not exists dim_usuario_crm (
  user_id      text primary key,
  nome         text not null,
  email        text,
  consultor_id text,        -- liga com fato_pagamento_base (venda real)
  equipe       text         -- 'ggb' | 'outros' | 'marketing' | 'pedagogico'
);

-- ---------- fato: auditorias ----------
create table if not exists fato_auditoria (
  auditoria_id   text primary key,      -- conversation_id (whatsapp) ou message_id (ligação)
  canal          text not null check (canal in ('whatsapp','ligacao')),
  data_ref       date not null,
  user_id        text,
  consultora     text,
  contato        text,
  -- contexto
  msgs_humanas   int,
  audios_usados  int,
  duracao_seg    int,                   -- só ligação
  -- resultado
  score          int,
  faixa          text,
  completo       boolean,               -- nenhum ponto crítico
  pontos_criticos text[],
  ordem_respeitada boolean,
  temperatura_lead text,
  -- etapas (null = não se aplica a este canal ou não houve objeção)
  apresentacao             int,
  quebra_gelo              int,
  conhecimento_previo      int,
  motivo_contato           int,
  perfil_profissional      int,
  objetivos_futuro         int,
  desafios_dores           int,
  apresentacao_treinamento int,
  validacao_interesse      int,
  tratamento_objecoes      int,
  fechamento               int,
  proximos_passos          int,
  falhas       text,
  conclusao    text,
  auditado_em  timestamptz default now()
);

create index if not exists ix_aud_data on fato_auditoria(data_ref);
create index if not exists ix_aud_consultora on fato_auditoria(consultora, data_ref);

-- ============================================================
-- VIEWS DO HUB
-- ============================================================

-- KPIs do período
create or replace view vw_auditoria_kpi as
select
  canal,
  date_trunc('month', data_ref)::date              as mes,
  count(*)                                          as auditadas,
  round(avg(score))                                 as score_medio,
  count(*) filter (where completo)                  as completos,
  count(*) filter (where faixa = 'alta')            as faixa_alta,
  count(*) filter (where temperatura_lead='quente') as leads_quentes,
  sum(audios_usados)                                as audios
from fato_auditoria
group by 1, 2;

-- Gaps: falha por etapa (alimenta o gráfico principal)
create or replace view vw_auditoria_gaps as
with notas as (
  select a.canal, a.data_ref, a.consultora, e.etapa, e.peso, e.ordem,
         case e.etapa
           when 'apresentacao'             then a.apresentacao
           when 'quebra_gelo'              then a.quebra_gelo
           when 'conhecimento_previo'      then a.conhecimento_previo
           when 'motivo_contato'           then a.motivo_contato
           when 'perfil_profissional'      then a.perfil_profissional
           when 'objetivos_futuro'         then a.objetivos_futuro
           when 'desafios_dores'           then a.desafios_dores
           when 'apresentacao_treinamento' then a.apresentacao_treinamento
           when 'validacao_interesse'      then a.validacao_interesse
           when 'tratamento_objecoes'      then a.tratamento_objecoes
           when 'fechamento'               then a.fechamento
           when 'proximos_passos'          then a.proximos_passos
         end as nota
  from fato_auditoria a
  join dim_peso_etapa e on e.canal = a.canal
)
select canal, consultora, etapa, peso, ordem,
       count(*) filter (where nota is not null)      as avaliadas,
       count(*) filter (where nota = 0)              as falhas,
       round(100.0 * count(*) filter (where nota = 0)
             / nullif(count(*) filter (where nota is not null),0), 0) as pct_falha
from notas
group by 1,2,3,4,5;

-- Placar por consultora (cruzar com venda real no hub)
create or replace view vw_auditoria_consultora as
select
  a.canal,
  a.consultora,
  u.consultor_id,
  count(*)                          as auditadas,
  round(avg(a.score),1)             as score_medio,
  min(a.score)                      as pior,
  max(a.score)                      as melhor,
  count(*) filter (where a.completo) as completos,
  -- amostra pequena não classifica ninguém
  (count(*) >= 20)                  as amostra_suficiente
from fato_auditoria a
left join dim_usuario_crm u on u.user_id = a.user_id
group by 1,2,3;

-- Frequência de cada ponto crítico
create or replace view vw_auditoria_criticos as
select canal, unnest(pontos_criticos) as ponto_critico, count(*) as ocorrencias
from fato_auditoria
where pontos_criticos is not null
group by 1,2
order by 3 desc;

-- ============================================================
-- RLS — placar fechado
-- ============================================================
alter table fato_auditoria enable row level security;

-- ajustar ao padrão de perfis do FebraHub:
-- create policy auditoria_gestao on fato_auditoria
--   for select using (pode_ver('auditoria_gestao'));

-- ============================================================
-- CARGA (staging -> fato), idempotente por auditoria_id
-- ============================================================
-- insert into fato_auditoria (...) select ... from stg_auditoria
-- on conflict (auditoria_id) do update set
--   score = excluded.score, faixa = excluded.faixa, ... , auditado_em = now();
