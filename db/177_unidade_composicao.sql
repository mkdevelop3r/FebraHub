-- ============================================================
-- FebraHub · Migration 177 — Como cada unidade vende
--
-- O ranking (176) diz QUEM esta ganhando. Esta tabela diz COMO -- que era a
-- pergunta original: "o que as outras franquias estao fazendo".
--
-- O QUE O DIAGNOSTICO MOSTROU, E POR QUE VALE GUARDAR
--
-- `LeadSource` esta 100% preenchido em TODAS as unidades, e diferencia:
--
--   Rio de Janeiro 2   Cliente Base    86 vendas    28,7% do valor
--   Salvador 2         TRAFEGO        414 vendas     5,4% do valor
--   Porto Alegre 3     RSP Meta       102 vendas     2,1% do valor
--
-- O Rio tira quase um terco do faturamento da propria base, com ticket alto.
-- Salvador faz o oposto: muito volume de trafego, ticket baixo. Mesma
-- corrida, jogos opostos -- e isso o ranking sozinho nao mostra.
--
-- A METRICA AQUI NAO E A DO RANKING, E ISSO IMPORTA
--
-- `total` e SUM(Opportunity.Amount). A Conversao BC do ranking e a formula
-- CDF2 sobre Forma_Pag_Venda__c, que so o dashboard calcula. Os dois numeros
-- NAO batem e nunca devem ser somados nem comparados entre si.
--
-- Por isso a view expoe `share` (a fatia dentro da unidade) e nao incentiva
-- leitura de valor absoluto: proporcao e o que esta tabela responde bem.
-- Quem quiser valor, olha o ranking.
--
-- 'Pedido' domina em todas as unidades (40% a 99%) e quase certamente e o
-- valor padrao de venda que entra por pedido/checkout. E ruido, nao origem --
-- fica gravado porque descartar dado na carga esconde a verdade, mas quem
-- ler precisa saber disso.
-- ============================================================

create table if not exists public.fato_unidade_composicao (
  mes          date        not null,
  unidade      text        not null,
  dimensao     text        not null,   -- 'origem' | 'curso' | 'tipo'
  valor        text        not null,   -- o rotulo dentro da dimensao
  qtd          integer     not null,
  total        numeric     not null,   -- SUM(Amount); NAO e Conversao BC
  capturado_em timestamptz not null default now(),
  primary key (mes, unidade, dimensao, valor)
);

comment on table public.fato_unidade_composicao is
  'Composicao das vendas de cada franquia por mes: origem do lead, curso e
   tipo de matricula. `total` e SUM(Opportunity.Amount) -- NAO e a Conversao
   BC do ranking (176), nao somar nem comparar os dois. Serve para
   proporcao. Recorte: Canal_Venda = Franquias, mesmos estagios do ranking.';

create index if not exists fato_unidade_composicao_mes
  on public.fato_unidade_composicao (mes desc, unidade);

alter table public.fato_unidade_composicao enable row level security;


-- ------------------------------------------------------------
-- A leitura: fatia dentro da unidade, e o ticket medio
--
-- `share` e o que responde "como esta unidade vende". O ticket medio ao lado
-- e o que revela a estrategia: 414 vendas que somam 5% do valor e um jogo
-- diferente de 86 vendas que somam 29%.
-- ------------------------------------------------------------
create or replace view public.vw_unidade_composicao as
select c.mes,
       c.unidade,
       c.dimensao,
       c.valor,
       c.qtd,
       c.total,
       round(100.0 * c.total / nullif(sum(c.total) over (
         partition by c.mes, c.unidade, c.dimensao), 0), 1)          as share,
       round(c.total / nullif(c.qtd, 0))                             as ticket_medio,
       c.capturado_em
  from public.fato_unidade_composicao c
 where public.pode_ver('comercial') or public.pode_ver('marketing')
 order by c.mes desc, c.unidade, c.dimensao, c.total desc;

comment on view public.vw_unidade_composicao is
  'Composicao por unidade com a fatia (share) dentro de cada dimensao e o
   ticket medio. Leia proporcao, nao valor absoluto -- a metrica nao e a
   mesma do ranking.';

grant select on public.vw_unidade_composicao to authenticated;

notify pgrst, 'reload schema';

-- conferir depois da primeira carga
--   select unidade, valor, qtd, share, ticket_medio
--     from public.vw_unidade_composicao
--    where dimensao = 'origem' and unidade ilike '%RIO DE JANEIRO%'
--    order by share desc limit 5;
