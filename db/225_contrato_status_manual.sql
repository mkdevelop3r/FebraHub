-- ============================================================
-- FebraHub · Migration 225 — status 'manual' em contrato_envio
--
-- "manual" = contrato enviado FORA da automação (ex.: o Cleberson mandou à mão
-- antes do automático pegar). A linha PRECISA continuar existindo pra a fila
-- (vw_contrato_pendente) deduplicar e NÃO reenviar — mas não deve aparecer no
-- hub da Central Financeira. O front filtra status='manual' fora da lista/funil.
-- ============================================================

alter table public.contrato_envio drop constraint if exists contrato_envio_status_chk;
alter table public.contrato_envio
  add constraint contrato_envio_status_chk
  check (status in ('enviado','abriu','assinou','erro','manual'));
