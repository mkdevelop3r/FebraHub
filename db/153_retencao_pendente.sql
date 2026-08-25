-- ============================================================
-- FebraHub · Migration 153 — Casos de retenção pendentes
--
-- O formulário sempre tratou "pendente" como o estado inicial de um caso,
-- mas a constraint original aceitava apenas retido/cancelado. Isso impedia
-- registrar a fila em aberto e fazia o KPI de risco exibir zero.
-- ============================================================

alter table public.fato_retencao
  drop constraint if exists fato_retencao_desfecho_check;

alter table public.fato_retencao
  alter column desfecho set default 'pendente';

-- Registros sem desfecho são justamente casos ainda não encerrados.
update public.fato_retencao
set desfecho = 'pendente'
where desfecho is null;

alter table public.fato_retencao
  add constraint fato_retencao_desfecho_check
  check (desfecho in ('pendente', 'retido', 'cancelado'));
