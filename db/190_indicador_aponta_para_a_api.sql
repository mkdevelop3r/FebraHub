-- ============================================================
-- FebraHub · Migration 190 — O indicador "Salesforce" passa a apontar para a
--                            fonte que realmente e o Salesforce hoje
--
-- O rodape de integracoes mostrava "Salesforce · Atualizado ha 5 dias" em
-- ambar. Nao era atraso: era o indicador apontando para o lugar errado.
--
-- Ate 02/09/2026 o Salesforce entrava por CSV recebido no Gmail
-- (`sync-salesforce.yml`, fonte `salesforce`). Naquele dia a API virou a fonte
-- primaria (`sync-salesforce-api.yml`, fonte `salesforce_api`, a cada 15
-- minutos) e o workflow do CSV perdeu os crons de proposito -- os dois
-- escrevem nas mesmas tabelas e nunca podem competir.
--
-- O painel nao acompanhou. Ele continuou lendo `salesforce`, que agora so se
-- move quando alguem dispara a contingencia a mao. O ultimo disparo foi em
-- 02/09; desde entao o indicador conta os dias e fica ambar por uma fonte que
-- esta fazendo exatamente o que deveria: nada.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE
--
-- Um alerta que acende sem motivo ensina a ignorar o painel. E este e o mesmo
-- painel onde um atraso de verdade vai aparecer um dia. O custo do alarme
-- falso nao e o pixel ambar -- e a confianca que ele gasta.
--
-- POR QUE O ROTULO VIVE NA VIEW, E NAO NA TABELA
--
-- `nome_exibicao` e reescrito pelo workflow a cada execucao:
--
--     "nome_exibicao": "Salesforce API (" + ",".join(sorted(targets)) + ")"
--
-- Renomear na tabela duraria ate a proxima sincronizacao. Alem disso, o nome
-- que a maquina escreve descreve o QUE ELA RODOU (quais alvos), e o nome que a
-- tela mostra responde OUTRA pergunta -- de onde vem este numero. Sao duas
-- coisas, e a view e onde a segunda pertence.
--
-- A contingencia continua registrada, com nome que diz o que ela e. Nenhum hub
-- a exibe hoje, mas o dia em que alguem precisar dispara-la, o registro de
-- quando foi usada pela ultima vez estara la.
-- ============================================================

create or replace view public.vw_integracao_status as
 SELECT fonte,
    -- Rotulo de TELA. O da tabela e o que a maquina escreveu sobre a propria
    -- execucao; este responde "de onde vem este numero", que e a pergunta de
    -- quem le o rodape.
    CASE fonte
      WHEN 'salesforce_api' THEN 'Salesforce'
      WHEN 'salesforce'     THEN 'Salesforce (CSV, contingência manual)'
      ELSE nome_exibicao
    END AS nome_exibicao,
    ultima_sync,
    registros,
    status,
    mensagem,
        CASE
            WHEN ultima_sync IS NULL THEN NULL::numeric
            ELSE EXTRACT(epoch FROM now() - ultima_sync) / 3600::numeric
        END AS horas_atras,
        CASE
            WHEN ultima_sync IS NULL THEN 'nunca'::text
            WHEN (now() - ultima_sync) < '24:00:00'::interval THEN 'hoje'::text
            WHEN (now() - ultima_sync) < '48:00:00'::interval THEN 'ontem'::text
            ELSE 'ha_dias'::text
        END AS frescor,
        CASE
            WHEN ultima_sync IS NULL THEN 'Nunca sincronizado'::text
            WHEN (now() - ultima_sync) < '01:00:00'::interval THEN 'Atualizado agora'::text
            WHEN (now() - ultima_sync) < '24:00:00'::interval THEN 'Atualizado hoje'::text
            WHEN (now() - ultima_sync) < '48:00:00'::interval THEN 'Atualizado ontem'::text
            ELSE ('Atualizado há '::text || floor(EXTRACT(epoch FROM now() - ultima_sync) / 86400::numeric)::integer) || ' dias'::text
        END AS rotulo
   FROM integracao_status;

comment on view public.vw_integracao_status is
  'Frescor das integracoes para o rodape dos hubs. O `nome_exibicao` daqui e o
   rotulo de TELA e pode divergir do que o ETL gravou na tabela -- ver o
   cabecalho de db/190. O hub pede a fonte pelo `fonte`, nunca pelo nome.';

notify pgrst, 'reload schema';

-- conferir:
--   select fonte, nome_exibicao, rotulo from vw_integracao_status
--    where fonte like 'salesforce%';
--   -- salesforce_api -> "Salesforce"      · Atualizado hoje
--   -- salesforce     -> "Salesforce (CSV, contingência manual)"
