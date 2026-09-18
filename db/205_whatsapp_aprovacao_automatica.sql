-- FebraHub · Migration 205 — Aprovação automática segura no WhatsApp

alter table public.pedagogico_whatsapp_status
  add column if not exists aprovados_automaticamente integer not null default 0
  check (aprovados_automaticamente >= 0);

comment on column public.pedagogico_whatsapp_status.aprovados_automaticamente is
  'Pedidos efetivamente aprovados pelo monitor após correspondência única.';

notify pgrst, 'reload schema';
