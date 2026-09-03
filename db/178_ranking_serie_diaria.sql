-- ============================================================
-- FebraHub · Migration 178 — O ranking vira serie diaria
--
-- A 176 usou chave (mes, unidade). Com a captura rodando todo dia, cada
-- execucao SOBRESCREVE a anterior: existe apenas a ultima foto de cada mes.
--
-- O custo disso e invisivel ate a hora em que doi. O agente semanal so pode
-- comparar meses FECHADOS -- e como agosto so fecha em 04/09, a primeira
-- comparacao real seria em outubro. A pergunta que uma reuniao de segunda faz
-- ("quem acelerou nesta semana?") ficaria sem resposta para sempre, porque a
-- foto da semana passada nao existe mais.
--
-- E dado que nao se reconstroi: o dashboard corporativo mostra o AGORA, nao
-- o que mostrava na segunda passada. Cada dia sem esta migration e uma foto
-- perdida em definitivo.
--
-- O QUE MUDA
--
-- `dia` entra na chave. Uma linha por (mes, unidade, dia da captura). Rodar
-- duas vezes no mesmo dia continua atualizando a mesma linha -- o que se
-- ganha e o historico entre dias, nao lixo por execucao.
--
-- As 42 linhas que ja existem recebem `dia` da data em que foram capturadas,
-- nao de hoje: elas sao a foto de 02/09, e mentir sobre isso comprometeria a
-- primeira comparacao semanal.
--
-- A VIEW MANTEM O CONTRATO
--
-- `vw_ranking_unidades` continua devolvendo UMA linha por (mes, unidade) --
-- a mais recente. A tela do Hub Executivo nao muda. O que ela ganha sao
-- colunas novas no fim: a foto de sete dias atras e o movimento contra ela.
-- Colunas novas no fim porque `create or replace view` aceita acrescentar,
-- nunca remover nem reordenar.
--
-- POR QUE O 7 DIAS E "A FOTO MAIS PROXIMA", E NAO "EXATAMENTE 7"
--
-- A captura pode falhar num dia (API fora, dashboard sem refresh). Exigir a
-- foto exata de D-7 faria a comparacao sumir sempre que um dia falhasse.
-- Pegamos a mais recente ATE D-7, e `dias_da_comparacao` diz de quantos dias
-- atras ela e -- numero na mao de quem le, em vez de premissa escondida.
-- ============================================================

alter table public.fato_ranking_unidades
  add column if not exists dia date;

-- A foto e do dia em que foi capturada. Usar current_date aqui carimbaria
-- 03/09 numa leitura de 02/09.
update public.fato_ranking_unidades
   set dia = capturado_em::date
 where dia is null;

alter table public.fato_ranking_unidades
  alter column dia set not null,
  alter column dia set default current_date;

alter table public.fato_ranking_unidades
  drop constraint if exists fato_ranking_unidades_pkey;

alter table public.fato_ranking_unidades
  add primary key (mes, unidade, dia);

create index if not exists fato_ranking_unidades_dia
  on public.fato_ranking_unidades (dia desc);

comment on column public.fato_ranking_unidades.dia is
  'Data da captura. Entra na chave para preservar a serie diaria: sem ela, a
   execucao de hoje apagava a foto de ontem, e foto de ranking nao se
   reconstroi -- o dashboard corporativo so mostra o agora.';


-- ------------------------------------------------------------
-- A view: ultima foto de cada mes, com o movimento da semana
-- ------------------------------------------------------------
create or replace view public.vw_ranking_unidades as
with ultimo as (
  select distinct on (r.mes, r.unidade) r.*
    from public.fato_ranking_unidades r
   order by r.mes, r.unidade, r.dia desc
), base as (
  select u.*,
         lag(u.valor)   over (partition by u.unidade order by u.mes) as valor_anterior,
         lag(u.posicao) over (partition by u.unidade order by u.mes) as posicao_anterior,
         max(u.valor)   over (partition by u.mes)                    as valor_lider
    from ultimo u
)
select b.mes,
       b.unidade,
       b.posicao,
       b.valor,
       b.valor_anterior,
       b.posicao_anterior,
       case when b.posicao_anterior is null then null
            else b.posicao_anterior - b.posicao end                  as posicoes_ganhas,
       case when coalesce(b.valor_anterior, 0) = 0 then null
            else round(100.0 * (b.valor - b.valor_anterior) / b.valor_anterior, 1)
       end                                                           as variacao_pct,
       round(b.valor_lider - b.valor)                                as atras_do_lider,
       b.refresh_em,
       b.capturado_em,
       -- ---- colunas novas (178), sempre no fim ----
       b.dia,
       s.valor   as valor_7d,
       s.posicao as posicao_7d,
       case when coalesce(s.valor, 0) = 0 then null
            else round(100.0 * (b.valor - s.valor) / s.valor, 1) end as variacao_7d,
       case when s.posicao is null then null
            else s.posicao - b.posicao end                           as posicoes_ganhas_7d,
       case when s.dia is null then null
            else b.dia - s.dia end                                   as dias_da_comparacao
  from base b
  left join lateral (
    select r.valor, r.posicao, r.dia
      from public.fato_ranking_unidades r
     where r.mes = b.mes and r.unidade = b.unidade and r.dia <= b.dia - 7
     order by r.dia desc
     limit 1
  ) s on true
 where public.pode_ver('comercial') or public.pode_ver('marketing')
 order by b.mes desc, b.posicao;

comment on view public.vw_ranking_unidades is
  'Ultima foto de cada mes, com movimento contra o mes anterior E contra a
   semana (178). `dias_da_comparacao` diz de quantos dias atras e a foto
   usada no recorte semanal -- pode nao ser 7 exatos se alguma captura
   falhou. Ate haver uma semana de historico, as colunas _7d vem nulas.';

notify pgrst, 'reload schema';

-- conferir
--   select mes, dia, count(*) from public.fato_ranking_unidades
--    group by 1,2 order by 2 desc;      -- uma linha por dia de captura
