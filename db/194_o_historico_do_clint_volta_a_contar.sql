-- ============================================================
-- FebraHub · Migration 194 — O historico do Clint volta a contar
--
-- Eu tinha escrito, na tela, que campanha anterior a 10/07/2026 "nao tem como
-- ser julgada por lead, porque nao havia lead registrado". A Dulce respondeu
-- que uma vez tinha puxado de 2024 para frente. Ela estava certa e eu errado.
--
-- `fato_negocio_lead` -- a base do Clint, congelada em 13/07/2026 -- tem 59.613
-- linhas desde 14/10/2024. E melhor do que a fonte de hoje em uma coisa
-- decisiva: ela ja traz `id_anuncio` e `nome_campanha` NA PROPRIA LINHA DO
-- LEAD. Nao precisa de de-para nenhum.
--
-- Conferido em 08/09/2026:
--
--     273 anuncios casam por ID com fato_meta_insights
--     13.850 leads ganham campanha por esse caminho
--     R$ 77.117 de gasto passam a ser julgaveis
--
-- E a corrente fecha ate a venda:
--
--     [IF][LEADS][MAIO]            1.531 leads   7 vendas   R$ 67.126
--     [CIS 249][LEADS][ABRIL] SSA  2.916 leads   6 vendas   R$ 49.294
--     [TV][LEADS][JULHO]             427 leads   7 vendas   R$ 36.683
--
-- ------------------------------------------------------------
-- O QUADRO COMPLETO DOS R$ 483 MIL, agora sem eufemismo
--
--     no periodo do Clint, nenhum anuncio casou ... R$ 235.026   167 campanhas
--     antes do Clint, sem fonte ................... R$ 135.580    85 campanhas
--     coberto pelo Clint .......................... R$  77.117    30 campanhas
--     era do Black CRM ............................ R$  36.032    35 campanhas
--
-- Os R$ 235 mil do meio nao sao esquecimento: o Clint, como a integracao de
-- hoje, so capturava lead de FORMULARIO do Meta. Campanha de trafego, de
-- alcance e de evento nunca teve lead para casar -- ontem como hoje. A unica
-- fatia realmente sem fonte e a anterior a 14/10/2024.
--
-- ------------------------------------------------------------
-- DUAS FONTES DE LEAD, E POR QUE A UNIAO NAO DUPLICA
--
-- O Clint termina em 13/07/2026 e o Black CRM comeca em 10/07/2026: tres dias
-- de sobreposicao. A mesma pessoa pode aparecer nas duas.
--
-- Por isso o lead e contado por PESSOA dentro da campanha -- e-mail, ou os 8
-- finais do telefone quando nao ha e-mail -- e nao por linha. Contar linha
-- inflaria a campanha que atravessa a virada, que e justamente a de julho, e
-- de um jeito que ninguem notaria olhando.
--
-- ------------------------------------------------------------
-- E UM ERRO MEU, DA db/192, QUE SO APARECEU AGORA
--
-- Ao ligar o historico, os retornos sairam em 22x e 26x. Desconfiei do proprio
-- numero e achei a causa: a venda nao tinha JANELA NENHUMA. O casamento era
-- por e-mail e somava TODA a receita daquela pessoa, de qualquer epoca. Um
-- lead que ja era aluno desde 2021 creditava a campanha a vida inteira dele.
--
-- Medido: `[FGPC][LEADS][MAIO]` caiu de R$ 40.012 para R$ 33.515 -- R$ 6.497
-- eram matriculas ANTERIORES ao lead. A `[CIS 248]` perdeu R$ 4.194 em vendas
-- mais de seis meses depois, que atribuir seria esticar.
--
-- Agora a venda so conta entre o dia do lead e 180 dias depois. Cento e oitenta
-- porque o ciclo daqui e longo -- o lead de marco compra o CIS de outubro -- e
-- porque e onde a curva para de crescer nos dados. Nao e numero sagrado; e
-- numero escolhido, e esta escrito aqui para poder ser discutido.
--
-- A mesma correcao vale para o caminho do Black CRM, que herdou o defeito.
-- ============================================================

create or replace view public.vw_mkt_campanha_resultado as
with janela as (
  -- A veiculacao real, nao a planejada: primeiro e ultimo dia com gasto. A
  -- folga de 3 dias no fim e para quem clica hoje e preenche depois.
  select campanha_nome,
         min(data)                  as comecou,
         max(data)                  as terminou,
         max(data) + 3              as vale_ate,
         sum(gasto)                 as gasto,
         count(distinct anuncio_id) as anuncios
    from fato_meta_insights
   where gasto > 0
   group by campanha_nome
),
-- CAMINHO 1 (hoje): o de-para diz de que campanha e a landing page, e a
-- janela recorta -- landing page vive mais que a campanha. Ver db/192.
lead_crm as (
  select o.campanha_nome,
         lower(trim(l.email)) as email,
         right(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 8) as tel8,
         l.criado_em::date as quando
    from fato_crm_lead l
    join mkt_origem_campanha o on o.fonte = l.fonte
    join janela j on j.campanha_nome = o.campanha_nome
   where l.criado_em::date between j.comecou and j.vale_ate
),
-- CAMINHO 2 (ate 13/07/2026): o proprio lead diz o anuncio. Sem de-para e sem
-- janela -- o vinculo e o Id, que nao depende de data para ser verdadeiro.
lead_clint as (
  -- So e-mail: a base do Clint nao guarda telefone. Deixar NULL explicito e
  -- melhor que fabricar uma coluna vazia -- quem ler sabe que o casamento
  -- deste caminho depende inteiramente do e-mail.
  select a.campanha_nome,
         lower(trim(n.email_contato)) as email,
         null::text                   as tel8,
         n.data_criacao::date         as quando
    from fato_negocio_lead n
    join (select distinct anuncio_id, campanha_nome from fato_meta_insights) a
      on a.anuncio_id = n.id_anuncio
   where n.id_anuncio is not null
),
-- Uma pessoa, uma vez, por campanha. Ver o cabecalho: as duas fontes se
-- sobrepoem em tres dias de julho.
lead as (
  select campanha_nome,
         nullif(email, '') as email,
         nullif(tel8, '')  as tel8,
         min(quando)       as quando          -- o primeiro toque da pessoa
    from (select * from lead_crm union all select * from lead_clint) u
   where nullif(email, '') is not null or nullif(tel8, '') is not null
   group by 1, 2, 3
),
-- Uma linha por matricula, COM A DATA. Agregar antes, como estava na db/192,
-- apagava o tempo e deixava a receita de 2021 entrar numa campanha de 2026.
venda as (
  select lower(trim(email_cliente)) as email,
         right(regexp_replace(coalesce(telefone_cliente, ''), '\D', '', 'g'), 8) as tel8,
         data_matricula::date as quando,
         valor
    from fato_base_alunos
   where data_matricula is not null
),
casado as (
  select l.campanha_nome,
         coalesce(l.email, l.tel8) as pessoa,
         -- Quem ja tinha matricula ANTES do lead. Nao entra na receita (a
         -- janela cuida disso), mas dizer quantos sao muda a leitura: a
         -- CIS 252 Salvador alcancou 16 pessoas que ja eram alunas, e isso e
         -- reengajamento, nao aquisicao.
         bool_or(v.quando < l.quando) as ja_era_aluno,
         -- Ver o cabecalho: sem esta janela a campanha herda a vida inteira
         -- do aluno. R$ 6.497 de inflacao so na [FGPC][LEADS][MAIO].
         sum(v.valor) filter (
           where v.quando between l.quando and l.quando + 180) as valor_venda
    from lead l
    -- SEM janela aqui de proposito: este join precisa enxergar tambem a venda
    -- anterior, para poder contar `ja_era_aluno`. A janela e aplicada campo a
    -- campo abaixo, e nao no join -- senao o "antes" ficaria invisivel.
    left join venda v
           on ((l.email is not null and v.email = l.email)
            or (l.tel8 is not null and length(l.tel8) = 8 and v.tel8 = l.tel8))
   group by 1, 2
)
select j.campanha_nome,
       j.comecou,
       j.terminou,
       j.anuncios,
       round(j.gasto)                                   as gasto,
       count(c.pessoa)                                  as leads,
       count(c.valor_venda)                             as vendas,
       round(coalesce(sum(c.valor_venda), 0))           as receita,
       round(j.gasto / nullif(count(c.pessoa), 0))      as cpl,
       round(j.gasto / nullif(count(c.valor_venda), 0)) as cac,
       round(coalesce(sum(c.valor_venda), 0) / nullif(j.gasto, 0), 2) as retorno,
       count(*) filter (where c.ja_era_aluno)                          as ja_eram_alunos,
       -- Agora significa "nenhuma das DUAS fontes alcanca esta campanha".
       -- Antes so olhava o de-para, e por isso 30 campanhas do Clint apareciam
       -- como se ninguem as tivesse mapeado.
       (count(c.pessoa) = 0
        and not exists (select 1 from mkt_origem_campanha o
                         where o.campanha_nome = j.campanha_nome))       as sem_de_para
  from janela j
  left join casado c on c.campanha_nome = j.campanha_nome
 where pode_ver('marketing') or pode_ver('geral')
 group by j.campanha_nome, j.comecou, j.terminou, j.anuncios, j.gasto;

comment on view public.vw_mkt_campanha_resultado is
  'Gasto, leads, vendas e retorno por campanha, de DUAS fontes de lead: o Black
   CRM via de-para de origem (db/192) e o historico do Clint via id do anuncio,
   que dispensa de-para. O lead e contado por PESSOA, nao por linha -- as
   fontes se sobrepoem em tres dias de julho/2026. Ver db/194.';

notify pgrst, 'reload schema';

-- conferir:
--   select campanha_nome, gasto, leads, vendas, receita, retorno
--     from vw_mkt_campanha_resultado
--    where leads > 0 order by receita desc limit 10;
--   -- devem aparecer campanhas de 2025 e do comeco de 2026, que antes vinham
--   -- com leads = 0 e sem_de_para = true
