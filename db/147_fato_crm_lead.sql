-- ============================================================
-- FebraHub · Migration 147 — fato_crm_lead (leads do Black CRM)
--
-- CONTEXTO: o Clint foi desativado e a captação de leads parou em
-- 13/07/2026 — a fato_negocio_lead virou histórico congelado (59.613
-- leads, out/2024 a jul/2026). A operação migrou para o Black CRM
-- (LeadConnector), onde os leads continuam entrando normalmente
-- (31.271 oportunidades, ~20 novas só nas últimas 4h de 21/08).
--
-- GANHO sobre o Clint: o Black CRM traz `source` já classificado
-- ("LP IF MULHERES", "Instagram Direct - CIS", "WhatsApp Oficial") e
-- `attributions.mediumId` = id do anúncio no Meta, o que permite ligar
-- lead -> anúncio -> gasto e calcular CPL por anúncio.
--
-- Alimentada por etl/blackcrm_leads_sync.py (3x/dia via GitHub Actions).
-- Todas as pipelines; carga completa no primeiro run, incremental depois.
-- ============================================================

create table if not exists public.fato_crm_lead (
  oportunidade_id   text primary key,
  contato_id        text,
  nome              text,
  email             text,
  telefone          text,
  fonte             text,          -- source do CRM
  pipeline_id       text,
  pipeline_etapa_id text,
  status            text,          -- open / won / lost / abandoned
  valor             numeric,
  responsavel_id    text,          -- assignedTo
  tags              text[],
  meio              text,          -- attributions.medium
  meio_id           text,          -- attributions.mediumId (anúncio no Meta)
  utm_source        text,          -- attributions.utmSessionSource
  criado_em         timestamptz,
  atualizado_em     timestamptz,
  sincronizado_em   timestamptz default now()
);

create index if not exists idx_crm_lead_criado    on public.fato_crm_lead (criado_em);
create index if not exists idx_crm_lead_fonte     on public.fato_crm_lead (fonte);
create index if not exists idx_crm_lead_meio_id   on public.fato_crm_lead (meio_id) where meio_id is not null;
create index if not exists idx_crm_lead_telefone  on public.fato_crm_lead (telefone) where telefone is not null;
create index if not exists idx_crm_lead_pipeline  on public.fato_crm_lead (pipeline_id);

alter table public.fato_crm_lead enable row level security;

drop policy if exists crm_lead_leitura on public.fato_crm_lead;
create policy crm_lead_leitura on public.fato_crm_lead
  for select to authenticated
  using (public.pode_ver('marketing'));

notify pgrst, 'reload schema';
