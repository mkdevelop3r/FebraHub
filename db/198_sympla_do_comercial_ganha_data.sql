-- ============================================================
-- FebraHub · Migration 198 — O Sympla do Comercial ganha data (e volta a
-- aparecer para quem e do Comercial)
--
-- A categoria Sympla do Hub Comercial era a unica que ignorava o seletor de
-- periodo do topo: mostrava "liquida · todos os tempos" e a Evolucao dizia
-- "Sympla nao tem serie mensal". Para arrumar isso a view precisava devolver
-- DATA, e ela devolvia uma linha agregada.
--
-- ------------------------------------------------------------
-- 1. A DATA EXISTIA, E ERA A PROPRIA VIEW QUE A JOGAVA FORA
--
-- A `vw_comercial_sympla_jennifer` fazia count/sum sobre a
-- `vw_eventos_desempenho`, que tem `data_inicio` por evento. O dado temporal
-- estava la o tempo inteiro; sumia no agregado. Entao a frase "a view do
-- Sympla e agregada e nao traz data" era verdadeira sobre a VIEW e falsa
-- sobre o DADO -- o tipo de meia-verdade que congela um problema, porque
-- quem le entende que a fonte nao tem jeito.
--
-- Esta view devolve UMA LINHA POR EVENTO. Quem quiser o total soma; quem
-- quiser setembro, recorta. O agregado e decisao de quem pergunta.
--
-- ------------------------------------------------------------
-- 2. O BUG QUE APARECEU NO CAMINHO: R$ 0 QUE PARECIA FATO
--
-- A view antiga lia a `vw_eventos_desempenho`, que carrega
-- `pode_ver('eventos')` no proprio WHERE. Quem e do Comercial e NAO tem o
-- setor `eventos` batia nesse filtro e recebia zero linha da view de dentro.
--
-- So que agregado sobre zero linha nao devolve zero linha: devolve UMA, com
-- count = 0 e os `sum` nulos. Como as colunas de identidade sao literais, a
-- resposta saia assim:
--
--     consultora = 'Jennifer Mota' | eventos = 0 | receita_liquida = null
--
-- Ou seja, a tela mostrava a Jennifer com R$ 0 e 0 eventos. Nao um vazio,
-- nao um erro de permissao: um ZERO, que se le como "ela nao vendeu nada".
-- Conferido em 10/09/2026: a Carmen Acassia e `comercial` + `auditoria` +
-- `central-eventos`, sem `eventos`. Era o que ela via.
--
-- Esta view le as TABELAS BASE, e nao a view de eventos, e faz o proprio
-- gate por `comercial` ou `eventos`. O `pode_ver` ja cobre admin e `geral`.
--
-- ------------------------------------------------------------
-- 3. O DIA SAI NO FUSO DA BAHIA
--
-- `data_inicio` e timestamptz gravado em UTC. Cortado como UTC, um evento das
-- 21h em Salvador cai no dia seguinte e escapa do mes. Hoje o mais tarde
-- comeca 20h -- uma hora de folga, fino demais para deixar por conta do
-- acaso. A view entrega `dia` ja convertido, para nao existirem duas
-- respostas para "que dia foi esse evento".
--
-- ------------------------------------------------------------
-- O QUE ESTA MIGRATION NAO FAZ
--
-- Nao apaga a `vw_comercial_sympla_jennifer`. Ela deixa de ser usada pelo
-- front nesta mesma mudanca, mas apagar view e conversa separada -- fica o
-- comentario dizendo que foi superada, para ninguem construir em cima.
--
-- Nao mexe na atribuicao: todo o Sympla desde jan/2025 continua sendo da
-- Jennifer, como a db/18c decidiu, porque o dado do Sympla nao tem vinculo
-- de consultora. Isso continua sendo uma ATRIBUICAO, e nao uma medicao.
-- ============================================================


create or replace view public.vw_comercial_sympla_evento as
select
  e.evento_id,
  e.nome_evento,
  -- Ver o cabecalho: dia local, nao dia UTC.
  (e.data_inicio at time zone 'America/Bahia')::date          as dia,
  e.cidade,
  -- Literais, como na db/18c: o Sympla nao diz quem vendeu.
  'Jennifer Mota'::text                                       as consultora,
  'https://bcorkfhfjfurlvggzgco.supabase.co/storage/v1/object/public/Consultoras/jennifer_mota.png'::text as foto_url,
  coalesce(pa.ingressos, 0)                                   as ingressos,
  coalesce(pa.compareceram, 0)                                as compareceram,
  round(coalesce(pd.receita_bruta, 0))                        as receita_bruta,
  round(coalesce(pd.receita_liquida, 0))                      as receita_liquida
from public.dim_eventos e
left join (
  select evento_id,
         count(*)                          as ingressos,
         count(*) filter (where check_in)  as compareceram
    from public.fato_participantes
   group by evento_id
) pa on pa.evento_id = e.evento_id
left join (
  select evento_id,
         sum(valor_total)   as receita_bruta,
         sum(valor_liquido) as receita_liquida
    from public.fato_pedidos
   group by evento_id
) pd on pd.evento_id = e.evento_id
where e.data_inicio >= '2025-01-01'          -- a Jennifer entrou em 2025 (db/18c)
  and (public.pode_ver('comercial') or public.pode_ver('eventos'));

comment on view public.vw_comercial_sympla_evento is
  'Uma linha por evento do Sympla desde jan/2025, com o dia ja no fuso da
   Bahia, para o Hub Comercial recortar pelo periodo do topo. Le as tabelas
   base de proposito: a vw_eventos_desempenho carrega pode_ver(''eventos'') e
   devolvia UMA linha de zeros para quem e so do Comercial. Ver db/198.';

comment on view public.vw_comercial_sympla_jennifer is
  'SUPERADA pela vw_comercial_sympla_evento (db/198): agregava a data fora e
   mostrava R$ 0 para quem e do Comercial sem o setor eventos. Mantida so por
   compatibilidade -- nao construir em cima.';

revoke all on public.vw_comercial_sympla_evento from anon;
grant select on public.vw_comercial_sympla_evento to authenticated;

notify pgrst, 'reload schema';

-- conferir: deve bater com o total da view antiga, e agora por mes
--   select to_char(dia,'YYYY-MM') as mes, count(*) eventos,
--          sum(ingressos) ingressos, sum(receita_liquida) liquida
--     from vw_comercial_sympla_evento group by 1 order by 1;
