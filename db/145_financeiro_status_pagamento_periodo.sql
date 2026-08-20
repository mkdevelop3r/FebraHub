-- ============================================================
-- FebraHub · Migration 145 — Status de pagamento por mês
--
-- Uma venda pode ter mais de uma linha/forma de pagamento. A view primeiro
-- consolida por venda e só depois conta, para o donut não inflar matrículas.
-- Prioridade: qualquer parcela em aberto deixa a venda em aberto; sem aberto,
-- Pago vence; Negado/Cancelado ficam como perdidos; vazio permanece auditável.
-- ============================================================

create or replace view public.vw_financeiro_pagamentos_periodo as
with vendas as (
  select
    p.original_id_venda,
    date_trunc('month', max(coalesce(p.data_aprovacao, p.data_pagamento)))::date as mes,
    case
      when bool_or(coalesce(p.status_pagamento, '') in ('Em aberto', 'Boleto Gerado', 'Boletos gerados')) then 'em_aberto'
      when bool_or(coalesce(p.status_pagamento, '') = 'Pago') then 'pago'
      when bool_or(coalesce(p.status_pagamento, '') in ('Negado', 'Cancelado')) then 'perdido'
      else 'sem_status'
    end as situacao
  from public.fato_pagamento_base p
  where p.original_id_venda is not null
    and p.tipo_matricula in ('Matrícula', 'COMPRADOR DE VAGAS', 'MAT. RETROATIVA')
  group by p.original_id_venda
)
select
  v.mes,
  count(*) filter (where v.situacao = 'pago')       as pagos,
  count(*) filter (where v.situacao = 'em_aberto')  as pendentes,
  count(*) filter (where v.situacao = 'perdido')    as perdidos,
  count(*) filter (where v.situacao = 'sem_status') as sem_status,
  count(*)                                           as matriculas
from vendas v
where v.mes is not null
  and public.pode_ver('financeiro')
group by v.mes
order by v.mes;

grant select on public.vw_financeiro_pagamentos_periodo to authenticated;

notify pgrst, 'reload schema';
