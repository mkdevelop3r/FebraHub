-- ============================================================
-- FebraHub · Migration 176 — Ranking das unidades Febracis
--
-- Serie mensal do ranking corporativo: quanto cada franquia converteu e em
-- que posicao ficou. Alimenta o agente que avisa quem acelerou, quem passou
-- quem, e a distancia de Salvador para o primeiro lugar.
--
-- DE ONDE VEM O NUMERO, E POR QUE NAO E CALCULADO AQUI
--
-- "Conversao BC" nao e Opportunity.Amount. E a formula de resumo CDF2 dos
-- relatorios do dashboard 01ZV2000000cOxNMAU, sobre Forma_Pag_Venda__c:
--
--   IF(UPPER(MoedaTexto__c) = 'BRL', Valor__c,
--      IF(OR(ISBLANK(ValorConvertidoBRL__c), ValorConvertidoBRL__c = 0),
--         0, ValorConvertidoBRL__c))
--
-- Medido em agosto/2026, a diferenca entre somar Amount e ler o campo certo:
--
--   unidade              dashboard        SUM(Amount)     erro
--   Salvador 2           1.169.288,60     1.176.238,77    +0,6%
--   Rio de Janeiro 2     1.067.624,20     1.176.126,66    +10%
--   Porto Alegre 3         834.059,43     1.020.548,95    +22%
--
-- Por Amount, Salvador e Rio ficam separados por R$ 112 -- empatados. Pelo
-- campo certo, Salvador lidera por 100 mil. O ranking VIRA com o campo
-- errado, e vira de um jeito convincente. Por isso o ETL le o resultado
-- pronto da Analytics API do Salesforce (o mesmo numero do dashboard) em
-- vez de reimplementar a formula e recriar os filtros de onze relatorios.
--
-- `capturado_em` e `refresh_em` sao colunas de honestidade, nao enfeite:
-- o dashboard entrega dado do ULTIMO REFRESH dele, nao do instante da
-- leitura. Sem `refresh_em` na tela, dado de ontem passa por dado de agora
-- -- o mesmo erro que a carga de presenca ja custou uma vez neste projeto.
-- ============================================================

create table if not exists public.fato_ranking_unidades (
  mes           date        not null,   -- primeiro dia do mes de referencia
  unidade       text        not null,   -- rotulo como vem do Salesforce
  unidade_chave text,                   -- key do agrupamento (id da unidade)
  valor         numeric     not null,   -- Conversao BC (CDF2)
  posicao       integer     not null,
  refresh_em    timestamptz,            -- refreshDate do dashboard
  capturado_em  timestamptz not null default now(),
  primary key (mes, unidade)
);

comment on table public.fato_ranking_unidades is
  'Ranking mensal das unidades Febracis por Conversao BC, lido pronto do
   componente RANKING UNIDADES do dashboard 01ZV2000000cOxNMAU. Nao e
   calculado aqui de proposito -- ver cabecalho da migration 176.';

create index if not exists fato_ranking_unidades_mes on public.fato_ranking_unidades (mes desc);

-- Padrao das tabelas de fato: RLS ligada, ZERO policies. A leitura passa
-- pela view; a escrita e do ETL com service_role.
alter table public.fato_ranking_unidades enable row level security;


-- ------------------------------------------------------------
-- A leitura: posicao, valor, e o MOVIMENTO
--
-- Numero solto nao serve. "Porto Alegre fez 834 mil" nao diz nada; "Porto
-- Alegre subiu duas posicoes e cresceu 22%" e o que faz alguem olhar.
-- Por isso a view ja entrega a comparacao com o mes anterior e a distancia
-- para o lider -- o agente le e narra, sem recalcular.
-- ------------------------------------------------------------
create or replace view public.vw_ranking_unidades as
with base as (
  select r.*,
         lag(r.valor)   over (partition by r.unidade order by r.mes) as valor_anterior,
         lag(r.posicao) over (partition by r.unidade order by r.mes) as posicao_anterior,
         max(r.valor)   over (partition by r.mes)                    as valor_lider
    from public.fato_ranking_unidades r
)
select b.mes,
       b.unidade,
       b.posicao,
       b.valor,
       b.valor_anterior,
       b.posicao_anterior,
       -- posicao_anterior maior = estava mais embaixo = subiu. O sinal fica
       -- positivo para "subiu" porque e assim que a frase e lida.
       case when b.posicao_anterior is null then null
            else b.posicao_anterior - b.posicao end                    as posicoes_ganhas,
       case when coalesce(b.valor_anterior, 0) = 0 then null
            else round(100.0 * (b.valor - b.valor_anterior) / b.valor_anterior, 1)
       end                                                            as variacao_pct,
       round(b.valor_lider - b.valor)                                 as atras_do_lider,
       b.refresh_em,
       b.capturado_em
  from base b
 where public.pode_ver('comercial') or public.pode_ver('marketing')
 order by b.mes desc, b.posicao;

comment on view public.vw_ranking_unidades is
  'Ranking mensal das unidades com movimento: posicoes ganhas e variacao
   contra o mes anterior, e a distancia para o lider. Gate duplo porque a
   pergunta e de Marketing e de Comercial ao mesmo tempo -- admin e geral
   passam pelos dois.';

grant select on public.vw_ranking_unidades to authenticated;

notify pgrst, 'reload schema';

-- conferir depois da primeira carga (agosto/2026, 11 unidades)
--   select mes, posicao, unidade, valor, refresh_em
--     from public.fato_ranking_unidades order by mes desc, posicao limit 15;
