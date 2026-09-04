-- ============================================================
-- FebraHub · Migration 184 — A memoria de calculo sai do texto corrido
--
-- A `observacao` de outubro tinha 1.100 caracteres num paragrafo unico. A
-- Dulce leu e resumiu melhor do que eu conseguiria: "nao tem clareza nenhuma".
--
-- O erro nao foi de redacao, foi de modelagem. O campo estava carregando DUAS
-- coisas de naturezas diferentes:
--
--   1. A MEMORIA DE CALCULO -- "2 dias de FCIS a 4.548 = 9.096". E gerada pela
--      maquina, tem estrutura de tabela, e ninguem le tabela em prosa.
--      Achatada em texto corrido vira parede.
--
--   2. A OBSERVACAO -- "a IF37 foi cancelada". E o que SO UMA PESSOA sabe, o
--      que os numeros nao contam. Duas linhas, e a parte que realmente importa
--      daqui a seis meses.
--
-- Misturadas, a segunda se perde dentro da primeira: o cancelamento da IF37 --
-- a informacao mais importante de outubro, a que sozinha muda a meta em 36 mil
-- reais -- estava enterrado na nona linha de um paragrafo sobre medianas.
--
-- Entao a memoria ganha coluna propria, em jsonb, e volta a ser mostrada como
-- TABELA na tela. A `observacao` volta a ser humana e curta.
--
-- POR QUE JSONB E NAO UMA TABELA FILHA
--
-- A memoria e um retrato imutavel do momento em que a meta foi escrita. Nao se
-- consulta "todas as metas que tiveram 3 dias de IF", nao se junta com nada,
-- nao se atualiza depois. E documento, nao entidade. Tabela filha aqui seria
-- normalizar o que ninguem quer normalizado -- e obrigaria a migrar a memoria
-- de toda meta antiga a cada vez que o metodo ganhasse um campo.
--
-- E o formato ja existe: e exatamente o que `sugerir_meta_loja` devolve. A
-- tela grava o mesmo objeto que acabou de mostrar na sugestao.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A coluna, e a fronteira entre as duas escrita onde ela e lida
-- ------------------------------------------------------------
alter table public.meta_setor
  add column if not exists memoria jsonb;

comment on column public.meta_setor.memoria is
  'Memoria de calculo, no formato devolvido por sugerir_meta_loja: {linhas,
   avisos, master, basica, minima, calculado_em}. Retrato do momento em que a
   meta foi escrita -- NAO recalcule para exibir. Se o metodo mudar depois, a
   meta antiga tem que continuar mostrando a conta que a gerou; senao a tela
   passa a explicar um numero com uma conta que nunca foi feita.';

comment on column public.meta_setor.observacao is
  'O que so uma pessoa sabe: turma cancelada, loja parada, decisao da direcao.
   NAO e a memoria de calculo -- essa vive em `memoria` e a tela renderiza como
   tabela. Se estiver escrevendo aqui quanto vale um dia de curso, e no lugar
   errado.';


-- ------------------------------------------------------------
-- 2. A view devolve a coluna nova
--
-- `create or replace view` so aceita coluna acrescentada NO FIM, com as
-- anteriores intactas em nome, tipo e ordem. Por isso `memoria` entra depois
-- de `atualizado_em` e nada mais se mexe.
-- ------------------------------------------------------------
create or replace view public.vw_meta_realizado_setor as
 WITH realizado AS (
         SELECT 'comercial'::text AS setor, 'faturamento'::text AS indicador,
            date_trunc('month'::text, v.data_ref::timestamp with time zone)::date AS mes_ref,
            sum(v.valor_bruto) AS valor
           FROM ( SELECT vw_venda_faturamento.original_id_venda,
                    max(vw_venda_faturamento.valor_bruto) AS valor_bruto,
                    min(COALESCE(vw_venda_faturamento.data_aprovacao, vw_venda_faturamento.data_pagamento)) AS data_ref
                   FROM vw_venda_faturamento
                  GROUP BY vw_venda_faturamento.original_id_venda) v
          GROUP BY 'comercial'::text, 'faturamento'::text, (date_trunc('month'::text, v.data_ref::timestamp with time zone)::date)
        UNION ALL
         SELECT 'loja'::text, 'faturamento'::text,
            vw_loja_receita_mensal.mes, vw_loja_receita_mensal.receita
           FROM vw_loja_receita_mensal
        UNION ALL
         SELECT 'marketing'::text, 'leads'::text,
            date_trunc('month'::text, fato_crm_lead.criado_em)::date,
            count(*)::numeric
           FROM fato_crm_lead
          WHERE fato_crm_lead.criado_em IS NOT NULL AND fato_crm_lead.criado_em::date <> '2026-07-16'::date
          GROUP BY 'marketing'::text, 'leads'::text, (date_trunc('month'::text, fato_crm_lead.criado_em)::date)
        UNION ALL
         SELECT 'pedagogico'::text, 'comparecimento'::text,
            date_trunc('month'::text, vw_turmas_mensuraveis.data_inicio::timestamp with time zone)::date,
            round(100.0 * sum(vw_turmas_mensuraveis.compareceram) / NULLIF(sum(vw_turmas_mensuraveis.matriculados), 0::numeric), 1)
           FROM vw_turmas_mensuraveis
          GROUP BY 'pedagogico'::text, 'comparecimento'::text, (date_trunc('month'::text, vw_turmas_mensuraveis.data_inicio::timestamp with time zone)::date)
        UNION ALL
         SELECT 'financeiro'::text, 'inadimplencia'::text,
            date_trunc('month'::text, fato_contas_receber.data_vencimento::timestamp with time zone)::date,
            sum(fato_contas_receber.valor)
           FROM fato_contas_receber
          WHERE fato_contas_receber.data_vencimento IS NOT NULL
            AND COALESCE(fato_contas_receber.status, ''::text) !~~* '%receb%'::text
            AND fato_contas_receber.data_vencimento < CURRENT_DATE
          GROUP BY 'financeiro'::text, 'inadimplencia'::text, (date_trunc('month'::text, fato_contas_receber.data_vencimento::timestamp with time zone)::date)
        )
 SELECT m.setor, m.indicador, m.mes_ref, m.unidade, m.sentido,
    m.minima, m.basica, m.master,
    r.valor AS realizado,
        CASE
            WHEN r.valor IS NULL THEN 'sem_dado'::text
            WHEN m.sentido = 'menor_melhor'::text THEN
              CASE WHEN r.valor <= m.minima THEN 'master'::text
                   WHEN r.valor <= m.basica THEN 'basica'::text
                   WHEN r.valor <= m.master THEN 'minima'::text
                   ELSE 'abaixo'::text END
            ELSE
              CASE WHEN r.valor >= m.master THEN 'master'::text
                   WHEN r.valor >= m.basica THEN 'basica'::text
                   WHEN r.valor >= m.minima THEN 'minima'::text
                   ELSE 'abaixo'::text END
        END AS nivel_atingido,
        CASE
            WHEN m.basica IS NULL OR m.basica = 0::numeric OR r.valor IS NULL THEN NULL::numeric
            WHEN m.sentido = 'menor_melhor'::text THEN round(100.0 * m.basica / NULLIF(r.valor, 0::numeric), 1)
            ELSE round(100.0 * r.valor / m.basica, 1)
        END AS atingido_pct,
    m.observacao,
    p.nome AS definido_por,
    m.atualizado_em,
    m.memoria
   FROM meta_setor m
     LEFT JOIN realizado r ON r.setor = m.setor AND r.indicador = m.indicador AND r.mes_ref = m.mes_ref
     LEFT JOIN perfis p ON p.id = m.definido_por
  WHERE pode_ver(m.setor) OR pode_ver('geral'::text);


-- ------------------------------------------------------------
-- 3. As duas metas que ja existem
--
-- Os numeros abaixo NAO sao recalculados: sao o retrato do que foi conferido
-- em 04/09/2026 (setembro 61.366; outubro 34.199, ja com a db/183). Chamar a
-- funcao aqui faria a memoria mentir sobre a conta que gerou o numero.
-- ------------------------------------------------------------
update public.meta_setor set
  memoria = jsonb_build_object(
    'calculado_em', '2026-09-04',
    'metodo', 'dias x tipo (docs/METODO_META_LOJA.md)',
    'minima', 44184, 'basica', 49093, 'master', 61366,
    'linhas', jsonb_build_array(
      jsonb_build_object('tipo','IF',             'dias',3,'valor_dia',12883,'subtotal',38649,'n',6, 'estimado',false),
      jsonb_build_object('tipo','FCIS',           'dias',2,'valor_dia',4548, 'subtotal',9096, 'n',4, 'estimado',false),
      jsonb_build_object('tipo','FOP',            'dias',3,'valor_dia',1618, 'subtotal',4854, 'n',6, 'estimado',false),
      jsonb_build_object('tipo','WORKSHOP-EVENTO','dias',2,'valor_dia',2363, 'subtotal',4726, 'n',0, 'estimado',true),
      jsonb_build_object('tipo','PALESTRA',       'dias',6,'valor_dia',544,  'subtotal',3264, 'n',0, 'estimado',true),
      jsonb_build_object('tipo','UTIL',           'dias',7,'valor_dia',111,  'subtotal',777,  'n',91,'estimado',false),
      jsonb_build_object('tipo','SAB',            'dias',3,'valor_dia',0,    'subtotal',0,    'n',23,'estimado',false),
      jsonb_build_object('tipo','DOM',            'dias',4,'valor_dia',0,    'subtotal',0,    'n',30,'estimado',false)),
    'avisos', jsonb_build_array(
      'Workshop e palestra sao ARBITRADOS (8 dias): o calendario da Central so existe desde 19/08/2026.',
      'Fevereiro/2026 fora da amostra: a loja esteve parada de 13 a 23/02.')),
  observacao = 'Primeira meta escrita pelo metodo. Fevereiro ficou fora da amostra: a loja esteve parada de 13 a 23/02, onze dias corridos sem um cupom.'
 where setor = 'loja' and mes_ref = '2026-09-01';

update public.meta_setor set
  memoria = jsonb_build_object(
    'calculado_em', '2026-09-04',
    'metodo', 'dias x tipo (docs/METODO_META_LOJA.md), ja com a db/183',
    'minima', 24623, 'basica', 27359, 'master', 34199,
    'linhas', jsonb_build_array(
      jsonb_build_object('tipo','FCIS',           'dias',2,'valor_dia',4548,'subtotal',9096,'n',4, 'estimado',false),
      jsonb_build_object('tipo','CIS',            'dias',3,'valor_dia',2261,'subtotal',6783,'n',9, 'estimado',false),
      jsonb_build_object('tipo','BHP',            'dias',4,'valor_dia',1692,'subtotal',6768,'n',8, 'estimado',false),
      jsonb_build_object('tipo','WORKSHOP-EVENTO','dias',2,'valor_dia',2363,'subtotal',4726,'n',0, 'estimado',true),
      jsonb_build_object('tipo','TV',             'dias',2,'valor_dia',2042,'subtotal',4084,'n',2, 'estimado',false),
      jsonb_build_object('tipo','PALESTRA',       'dias',3,'valor_dia',544, 'subtotal',1632,'n',3, 'estimado',true),
      jsonb_build_object('tipo','UTIL',          'dias',10,'valor_dia',111, 'subtotal',1110,'n',91,'estimado',false),
      jsonb_build_object('tipo','SAB',            'dias',1,'valor_dia',0,   'subtotal',0,   'n',23,'estimado',false),
      jsonb_build_object('tipo','DOM',            'dias',4,'valor_dia',0,   'subtotal',0,   'n',30,'estimado',false)),
    'avisos', jsonb_build_array(
      'Workshop da Central e ARBITRADO (2 dias): nenhum dia medido ate 04/09.',
      'Palestra segue ARBITRADA em 544 (3 dias): ha 3 dias medidos em 01-03/09 e a mediana deu exatamente 544, mas n=3 e pouco para fixar a constante.')),
  observacao = 'A IF37 (09 a 11/10) foi CANCELADA. Com ela, a meta seria 70.999 em vez de 34.199. O resto do calendario de outubro foi confirmado pelo Bruno em 04/09 -- as turmas estavam paradas em dim_turmas desde 29/07.'
 where setor = 'loja' and mes_ref = '2026-10-01';

notify pgrst, 'reload schema';

-- conferir:
--   select mes_ref, length(observacao) as tam_obs,
--          jsonb_array_length(memoria->'linhas') as linhas
--     from meta_setor where setor='loja' order by mes_ref;
--   -- setembro e outubro devem sair com observacao curta (~150) e 8-9 linhas
