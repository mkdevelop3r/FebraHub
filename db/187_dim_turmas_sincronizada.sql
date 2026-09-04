-- ============================================================
-- FebraHub · Migration 187 — dim_turmas ganha sincronizacao, sem perder o
--                            que so as pessoas sabem
--
-- `dim_turmas` nunca teve sync: `sincronizado_em` e NULO nas 234 linhas, e as
-- 166 com `sf_turma_id` vieram de carga manual de relatorio. Por isso toda
-- turma futura era suspeita, e por isso a IF37 cancelada quase virou meta
-- (db/182).
--
-- Esta migration NAO cria o sync -- ela prepara a tabela para receber um, e o
-- ponto inteiro esta em decidir QUEM MANDA EM CADA COLUNA. Sem esse contrato
-- escrito, o primeiro sync apaga o trabalho do pedagogico numa madrugada e
-- ninguem descobre por semanas.
--
-- ------------------------------------------------------------
-- O QUE A INVESTIGACAO DE 04/09 ENCONTROU, e que desenha tudo abaixo
--
-- 1. O SALESFORCE NAO SABE DO CANCELAMENTO. A IF37 esta la como
--    `Status__c = 'Aberta'`, com `LastModifiedDate` de 24/07 -- o cancelamento
--    que o Bruno contou em 04/09 nunca foi lancado. Um sync ingenuo devolveria
--    a turma para 'aberta' e reinflaria outubro em R$ 38.649, desfazendo em
--    silencio uma correcao feita a mao.
--
--    Por isso `status` continua sendo da PESSOA, e o Salesforce escreve em
--    `status_sf`, ao lado. Quando os dois discordam, isso e informacao -- nao
--    e conflito para o sync resolver sozinho.
--
-- 2. O NOME DA TURMA NAO E UNICO. "2026 - CIS-GL252" existe umas 40 vezes no
--    Salesforce, uma por unidade da rede, e `Unidade__c` e NULO na maioria.
--    Nao da para achar "nossa" turma pelo nome nem pela unidade: o caminho e
--    pelas NOSSAS vendas (Opportunity com
--    `Unidade_Geradora_Venda__r.Name = 'FEBRACIS SALVADOR 2'`), que devolve o
--    Id da turma. Isso vive no ETL, mas esta registrado aqui porque explica
--    por que `sf_turma_id` e a chave de verdade e o nome e so rotulo.
--
-- 3. AS DATAS DO SALESFORCE SAO DATETIME EM UTC, e a virada de fuso muda o
--    resultado. A IF37 tem `Data_Final__c = 2026-10-12T02:59:59Z`, que em
--    America/Bahia e 11/10 23:59:59 -- dia 11, nao 12. Cortar a string em 10
--    caracteres, que e o obvio, inventaria um quarto dia de IF e somaria
--    R$ 12.883 a meta. Conferido nas quatro turmas de outubro: com fuso, as
--    datas batem exatamente com o que esta gravado hoje.
--
-- 4. OS IDs TEM 15 E 18 CARACTERES. `dim_turmas.sf_turma_id` guarda 15
--    (`a0QV200000zMyfA`); a API devolve 18 (`a0QV200000zMyfAMAS`). Comparar
--    sem normalizar nao da erro -- da INSERT em vez de UPDATE, e a tabela
--    ganha uma copia de cada turma. O ETL normaliza para 15, como o
--    `canonical_salesforce_id` que ja existe em salesforce_api_sync.py.
--
-- 5. `dim_turma_salesforce` NAO SERVE para isto, embora ja sincronize: ela vem
--    de `Credenciamento__c` e nao tem data nenhuma. Credenciamento acontece
--    depois da turma; calendario precisa do antes.
--
-- 6. NEM TODA TURMA NOSSA ACONTECE AQUI. Como as turmas sao achadas pelas
--    NOSSAS vendas, vem junto o que a unidade vendeu para turma realizada em
--    outra cidade: `2026 - CIS252 - Goiania`, `2026 - PB001 - Sao Paulo`,
--    `2026 - CIS-GL252 - Jequie`. Sao 12 turmas curtas so em 2026.
--
--    Isso esta CERTO para o Pedagogico -- o aluno comprou e precisa ser
--    acompanhado -- e ERRADO para a meta da Loja, que pergunta quantas pessoas
--    o dia poe DENTRO DESTE predio. Tres dias de CIS em Belo Horizonte
--    entrariam na media de CIS daqui e a rebaixariam.
--
--    Mesmo problema do evento em Feira de Santana (db/185) e do curso da
--    holding (db/183), pela terceira vez. Por isso ganha coluna propria em vez
--    de virar mais um regex escondido dentro da funcao da meta: a suposicao
--    fica visivel na tabela e uma pessoa pode corrigi-la.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Onde o Salesforce escreve
-- ------------------------------------------------------------
alter table public.dim_turmas
  add column if not exists status_sf        text,
  add column if not exists sf_modificado_em timestamptz,
  add column if not exists acontece_aqui    boolean not null default true;

comment on column public.dim_turmas.acontece_aqui is
  'A turma ocupa ESTE predio? O sync chuta pelo nome (sufixo de cidade que nao
   seja Salvador => false) e so no momento de CRIAR a linha; depois disso a
   coluna e DA PESSOA e o sync nao encosta. Quem consome dim_turmas para medir
   movimento da loja tem que filtrar por ela; quem consome para acompanhar
   ALUNO (represados, presenca) nao deve -- o aluno de Goiania continua sendo
   nosso.';

comment on column public.dim_turmas.status_sf is
  'Status__c cru do Salesforce (Aberta, Fechada, ...). Escrito SO pelo sync.
   NAO e o status operacional -- ver dim_turmas.status. Existe para que a
   divergencia entre o que o Salesforce acha e o que a unidade sabe seja
   visivel em vez de silenciosa.';

comment on column public.dim_turmas.sf_modificado_em is
  'LastModifiedDate da Turma__c. Serve para responder "ha quanto tempo o
   Salesforce nao toca nesta turma" -- a IF37 estava parada desde 24/07 e
   continuava Aberta.';

comment on column public.dim_turmas.sincronizado_em is
  'Quando o sync tocou esta linha pela ultima vez. NULO = linha de carga
   manual, nunca sincronizada.';


-- ------------------------------------------------------------
-- 2. O CONTRATO DE PROPRIEDADE, escrito onde vai ser lido
--
-- Isto nao e decoracao: e a unica defesa contra um sync futuro passar por
-- cima do trabalho de quem opera. Quem for mexer no ETL le isto primeiro.
-- ------------------------------------------------------------
comment on column public.dim_turmas.status is
  'DA PESSOA, nao do Salesforce. planejada | aberta | cancelada. O sync NUNCA
   escreve aqui em linha que ja existe -- so ao criar turma nova. Motivo: em
   04/09/2026 a IF37 estava cancelada aqui e "Aberta" no Salesforce, que nao
   sabia do cancelamento. Se o sync mandasse, a meta de outubro voltaria a
   contar R$ 38.649 de uma turma que nao vai acontecer.';

comment on column public.dim_turmas.confirma_pedagogico is
  'DA PESSOA. O sync nao toca. 100 turmas dependem disto.';
comment on column public.dim_turmas.link_grupo is
  'DA PESSOA (link do grupo de WhatsApp). O sync nao toca.';
comment on column public.dim_turmas.crm_template_id is
  'DA PESSOA (template do Black CRM). O sync nao toca.';
comment on column public.dim_turmas.horario_credenciamento is
  'DA PESSOA. O sync nao toca.';
comment on column public.dim_turmas.endereco is
  'DA PESSOA. O sync nao toca -- Local__c do Salesforce e nulo nas nossas turmas.';
comment on column public.dim_turmas.nome_comercial is
  'DA PESSOA. O sync nao toca.';

comment on column public.dim_turmas.data_inicio is
  'DO SALESFORCE (Data_Inicial__c, convertida para America/Bahia). O sync
   sobrescreve.';
comment on column public.dim_turmas.data_fim is
  'DO SALESFORCE (Data_Final__c, convertida para America/Bahia -- ver o item 3
   do cabecalho desta migration; sem o fuso a data sai um dia adiante). O sync
   sobrescreve.';
comment on column public.dim_turmas.curso is
  'DO SALESFORCE (Curso__r.Name). O sync sobrescreve.';
comment on column public.dim_turmas.capacidade is
  'DO SALESFORCE (Capacidade__c). O sync sobrescreve quando vier preenchido.';
comment on column public.dim_turmas.sf_turma_id is
  'Id da Turma__c com 15 caracteres. E a chave REAL -- o nome da turma se
   repete em toda a rede.';


-- ------------------------------------------------------------
-- 2b. O chute inicial para as 234 linhas que ja existem
--
-- A convencao de nome e a unica pista: turma de fora leva a cidade no fim
-- (`2026 - CIS250 - Curitiba`). O `SALVADOR` fica de fora do filtro porque
-- `2026 - TCE01 - TOUR PV SALVADOR` tem sufixo e acontece aqui.
--
-- Conferido antes de rodar: isso marca 53 linhas, e NENHUMA delas e turma
-- curta de 2026 -- ou seja, nenhum numero de meta ja calculado muda. As 12
-- turmas de fora que importam ainda nem estao na tabela; vao chegar com o
-- primeiro sync, ja marcadas.
--
-- E chute, e esta escrito que e: heuristica de nome erra. `2025 - TCL -
-- ACOLHIDOS245` vai ser marcada como de fora e nao e -- ACOLHIDOS nao e
-- cidade. Um dia sozinho, e corrigivel na mao. Preferi o falso positivo
-- visivel ao falso negativo silencioso.
-- ------------------------------------------------------------
update public.dim_turmas
   set acontece_aqui = false
 where turma_id ~ ' - .+ - '
   and turma_id not ilike '%SALVADOR%';


-- ------------------------------------------------------------
-- 3. A divergencia fica visivel
--
-- O sync nao resolve o desacordo; ele o expoe. Esta view e o lugar de olhar
-- antes de escrever uma meta, e e o que teria mostrado a IF37 sem depender de
-- alguem lembrar de perguntar.
-- ------------------------------------------------------------
create or replace view public.vw_turma_divergencia as
select t.turma_id,
       t.curso,
       t.data_inicio,
       t.data_fim,
       t.status                       as status_aqui,
       t.status_sf,
       t.acontece_aqui,
       t.sincronizado_em,
       t.sf_modificado_em,
       (current_date - t.sf_modificado_em::date) as dias_sem_mexer_no_sf,
       case
         when t.sincronizado_em is null                     then 'nunca sincronizada'
         when t.status = 'cancelada' and t.status_sf is not null
              and t.status_sf not ilike '%cancel%'          then 'cancelada aqui, aberta no Salesforce'
         when t.status <> 'cancelada' and t.status_sf ilike '%cancel%'
                                                            then 'cancelada no Salesforce, aberta aqui'
         else 'ok'
       end as situacao
  from dim_turmas t
 where pode_ver('pedagogico') or pode_ver('geral')
   and t.data_inicio >= current_date - 180;

comment on view public.vw_turma_divergencia is
  'Turmas em que o Salesforce e a unidade discordam, ou que o sync nunca
   tocou. Olhar antes de fechar meta ou de oferecer turma a represado.';

revoke all on public.vw_turma_divergencia from anon;
grant select on public.vw_turma_divergencia to authenticated;

notify pgrst, 'reload schema';

-- conferir:
--   select situacao, count(*) from vw_turma_divergencia group by 1;
--   -- antes do primeiro sync: tudo em "nunca sincronizada"
