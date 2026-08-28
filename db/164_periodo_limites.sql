-- ============================================================
-- FebraHub · Migration 164 — A régua do calendário sai de trás do setor
--
-- SINTOMA: para quem não é financeiro, loja, geral ou admin, o seletor de
-- período mostrava UM mês e UM ano — "Agosto 2026" e nada mais, com as duas
-- setas mortas. Marketing, comercial, pedagógico e central-eventos, todos.
--
-- CAUSA: o front derivava o intervalo navegável do menor `data` encontrado
-- em quatro views de FLUXO, e as quatro têm gate no `where`:
--   vw_financeiro_receita_categoria_periodo   pode_ver('financeiro')
--   vw_financeiro_despesa_categoria_periodo   pode_ver('financeiro')
--   vw_loja_receita_periodo                   pode_ver('loja')
--   vw_loja_serie                             pode_ver('loja')
-- Zero linhas → o fallback do front (`minMes = maxMes = mês de hoje`) tomava
-- conta. Não é regressão: está assim desde que o filtro global nasceu, em
-- jul/2026. O dado sempre esteve lá — fato_pagamento_base começa em nov/2021.
--
-- CORREÇÃO: uma view que devolve DUAS DATAS e mais nada. Onde o calendário
-- começa não é informação de setor — é a moldura. O que precisa de trava é o
-- número dentro do mês, e esse continua onde estava: nenhuma view de valor é
-- tocada aqui, nenhum gate é afrouxado.
--
-- DE PROPÓSITO SEM `pode_ver`. É a única view do projeto assim, e a exceção
-- se justifica pelo que ela expõe: agregado sobre a tabela inteira, sem
-- linha, sem valor, sem PII. Saber que a empresa tem venda desde nov/2021
-- não conta nada a ninguém que a home do site já não conte.
--
-- Sobre a advertência do README (view roda com privilégio do dono e ignora a
-- RLS das tabelas de baixo): aqui isso é o mecanismo, não o descuido. Por
-- isso o `select` é `min`/`max` e a view não tem como devolver outra coisa.
--
-- `max_mes` nunca passa do mês corrente: fato_contas_receber tem vencimento
-- até abr/2027, e navegar para um mês que ainda não aconteceu não mostra
-- nada — a mesma regra que `intervaloDe()` já aplica no front.
-- ============================================================

drop view if exists public.vw_periodo_limites cascade;
create view public.vw_periodo_limites as
with fontes as (
  -- receita (comercial/financeiro): a fonte mais antiga, nov/2021
  select min(data_pagamento) as ini, max(data_pagamento) as fim
    from public.fato_pagamento_base
   where data_pagamento is not null
  union all
  -- despesa
  select min(data_pagamento), max(data_pagamento)
    from public.fato_contas_pagar
   where data_pagamento is not null
  union all
  -- loja: mesma coalescência da vw_loja_receita_periodo (pago, senão vencido)
  select min(coalesce(data_pagamento, data_vencimento)),
         max(coalesce(data_pagamento, data_vencimento))
    from public.fato_contas_receber
   where coalesce(data_pagamento, data_vencimento) is not null
  union all
  -- série longa da loja (planilha de fechamento, 2022-2026)
  select min(mes_ref), max(mes_ref)
    from public.fato_loja_fechamento
   where mes_ref is not null
)
select
  date_trunc('month', min(ini))::date as min_mes,
  least(date_trunc('month', max(fim)),
        date_trunc('month', current_date))::date as max_mes
from fontes;

comment on view public.vw_periodo_limites is
  'Moldura do seletor de periodo: primeiro e ultimo mes navegaveis. Sem pode_ver de proposito (migration 164) — so duas datas agregadas, nenhum valor. Nao usar como fonte de metrica.';

grant select on public.vw_periodo_limites to authenticated;

notify pgrst, 'reload schema';

-- conferir (deve devolver uma linha: 2021-11-01 | 2026-08-01)
-- select * from public.vw_periodo_limites;
