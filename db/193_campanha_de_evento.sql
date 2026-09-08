-- ============================================================
-- FebraHub · Migration 193 — Campanha de evento ganha resultado
--
-- Terceira e ultima ponte da rastreabilidade. As duas anteriores cobriam quem
-- vira LEAD; esta cobre quem vira INSCRITO.
--
--     db/191  formulario do Meta -> anuncio ............. 5,2% do gasto
--     db/192  landing page -> campanha ................. 55,0%
--     db/193  campanha de evento -> palestra no Sympla .. 30,9%
--
-- As campanhas `[EG][$]` nao apareciam no painel porque nenhuma origem do CRM
-- aponta para elas -- e nao aponta porque o lead delas NAO PASSA PELO CRM. Sao
-- palestras vendidas no Sympla: "Do zero ao investimento", "Do panico ao
-- palco", "Encontro de casais". A pessoa compra ingresso, nao vira lead.
--
-- ------------------------------------------------------------
-- A ASSINATURA QUE PERMITE O DE-PARA
--
-- A campanha para de veicular na vespera do evento. Conferido em 08/09:
--
--     [EG][$]Do zero ao investimento    ate 31/08  ->  palestra em 01/09
--     [EG][$]Encontro de casais         ate 01/09  ->  palestra em 02/09
--     [EG][$]Do panico ao palco         ate 02/09  ->  palestra em 03/09
--     [EG][$]venda mais e melhor        ate 07/09  ->  palestra em 08/09
--
-- Quatro em sequencia, cada uma terminando no dia anterior. Isso e regra de
-- operacao, nao coincidencia -- anuncio de evento nao roda depois do evento.
--
-- ------------------------------------------------------------
-- RECEITA DE INGRESSO NAO E O RETORNO. Isto e o centro desta migration.
--
-- O ingresso da palestra custa uns R$ 30. Medir a campanha por receita de
-- ingresso diria que TODA palestra da prejuizo -- e diria errado, porque a
-- palestra existe para vender CURSO. A do Zero ao Investimento vendeu R$ 215
-- de ingresso e R$ 3.596 de curso depois.
--
-- Entao o retorno aqui e: quanto quem se inscreveu comprou de curso DEPOIS.
-- `fato_participantes` tem `email_norm`, e a matricula tem e-mail; a ponte
-- existe e nao precisou de dado novo.
--
-- ------------------------------------------------------------
-- A JANELA, E POR QUE ELA APERTA
--
-- So conta matricula do DIA DO EVENTO EM DIANTE, ate 60 dias depois. Uma
-- janela frouxa, que aceitasse venda anterior, creditaria a palestra quem ja
-- era aluno antes de entrar na sala.
--
-- A diferenca e grande: com janela frouxa a palestra de IE para Lideres
-- mostrava R$ 6.135; com a janela correta, R$ 4.435. Quarenta por cento de
-- inflacao, e o tipo de numero que ninguem questiona porque agrada.
--
-- Por isso a view tambem publica `ja_eram_alunos`: quantos inscritos ja
-- tinham matricula antes. E reengajamento, nao aquisicao, e as duas coisas
-- valem coisas diferentes para quem decide onde por verba.
--
-- ------------------------------------------------------------
-- ZERO RECENTE NAO E ZERO. A view publica `dias_desde_o_evento`.
--
-- Conferido em 08/09: as palestras de 01, 02, 03 e 08/09 aparecem com retorno
-- 0,00 -- e nao poderiam aparecer de outro jeito, porque aconteceram ha dias e
-- a janela de conversao tem 60. As duas com retorno alto sao de julho e
-- agosto, que ja tiveram tempo.
--
-- Sem a idade ao lado, alguem leria "0,00x" e cortaria a verba de uma campanha
-- que ainda nao teve chance. E o mesmo problema do `n` na tabela de metas: o
-- numero sozinho engana, o numero com a base em que se apoia informa. Numero
-- com menos de 30 dias de evento deve ser lido como PARCIAL.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O de-para
-- ------------------------------------------------------------
create table if not exists public.mkt_campanha_evento (
  campanha_nome text primary key,
  evento_id     text not null,
  observacao    text,
  criado_em     timestamptz not null default now()
);

comment on table public.mkt_campanha_evento is
  'De-para entre a campanha do Meta e o evento do Sympla que ela anunciou.
   Mantido a mao: so quem monta a campanha sabe. A chave e a CAMPANHA porque
   uma campanha anuncia um evento; se uma campanha servir duas edicoes, o
   problema esta no nome dela, e a decisao de qual edicao contar e de gente.';

alter table public.mkt_campanha_evento enable row level security;

drop policy if exists mkt_campanha_evento_escrita on public.mkt_campanha_evento;
create policy mkt_campanha_evento_escrita on public.mkt_campanha_evento
  for all to authenticated
  using (pode_ver('marketing') or pode_ver('geral'))
  with check (pode_ver('marketing') or pode_ver('geral'));


-- ------------------------------------------------------------
-- 2. O que as datas sustentam
--
-- Cada linha tem a distancia entre o fim da veiculacao e o evento. Quanto
-- menor, mais forte o vinculo. Deixei registrada tambem a que NAO entrou.
-- ------------------------------------------------------------
insert into public.mkt_campanha_evento (campanha_nome, evento_id, observacao) values
  ('[EG][$]Do zero ao investimento',      's35e723', 'Veiculou ate 31/08; palestra em 01/09. 1 dia.'),
  ('[EG][$]Encontro de casais - setembro','s35ef13', 'Veiculou ate 01/09; palestra em 02/09. 1 dia.'),
  ('[EG][$]Do pânico ao palco — Thamires','s35e715', 'Veiculou ate 02/09; palestra em 03/09. 1 dia.'),
  ('[EG][$]venda mais e melhor',          's35e749', 'Veiculou ate 07/09; palestra em 08/09. 1 dia.'),
  ('[EG][$] O Próximo nível da medicina', 's3580de', 'Veiculou ate 14/08; evento em 15/08. 1 dia.'),
  ('[EG][$]Café com empresarios [sympla]','s35e8e1', 'Veiculou ate 25/08; evento em 28/08. 3 dias.'),
  ('[EG][$]Lideres de alta performance',  's3523e0', 'Veiculou ate 27/07; palestra em 28/07. 1 dia.'),
  ('[EG][$]Liderança na prática - Volney','s35ef74', 'Veiculou ate 27/08; workshop em 12/09. 16 dias -- vinculo mais fraco, mas e o unico evento com esse nome.'),
  ('[EG][$]IE para mulheres — Carol',     's3622e0', 'Veiculou ate 08/09; palestra em 24/09. 16 dias -- idem.')
on conflict (campanha_nome) do nothing;

-- NAO ENTROU, de proposito:
--   `[EG][$]IE para lideres — Renan` veiculou de 10/07 a 08/09 e atravessa
--   DUAS edicoes da mesma palestra (29/07 e 22/09). Atribuir a uma delas
--   escolheria por chute. Fica sem de-para ate alguem decidir -- e aparece na
--   tela marcada, que e o comportamento desejado.


-- ------------------------------------------------------------
-- 3. O resultado
-- ------------------------------------------------------------
create or replace view public.vw_mkt_evento_resultado as
with gasto as (
  select campanha_nome, sum(gasto) as gasto,
         min(data) as comecou, max(data) as terminou,
         count(distinct anuncio_id) as anuncios
    from fato_meta_insights
   where gasto > 0
   group by campanha_nome
),
inscrito as (
  select p.evento_id,
         coalesce(p.email_norm, lower(trim(p.email_participante))) as email,
         bool_or(p.check_in) as compareceu
    from fato_participantes p
   group by 1, 2
),
matricula as (
  select lower(trim(email_cliente)) as email, data_matricula::date as quando, valor
    from fato_base_alunos
   where email_cliente is not null and email_cliente <> ''
)
select m.campanha_nome,
       e.evento_id,
       e.nome_evento,
       e.data_inicio::date                         as data_evento,
       g.comecou,
       g.terminou,
       (e.data_inicio::date - g.terminou)          as dias_ate_o_evento,
       -- Quanto tempo o resultado teve para acontecer. Ver o cabecalho: sem
       -- isto, o zero de um evento de ontem parece fracasso.
       (current_date - e.data_inicio::date)        as dias_desde_o_evento,
       (current_date - e.data_inicio::date < 30)   as resultado_parcial,
       round(g.gasto)                              as gasto,
       count(distinct i.email)                     as inscritos,
       count(distinct i.email) filter (where i.compareceu) as compareceram,
       -- So do dia do evento em diante. Ver o cabecalho: janela frouxa inflava
       -- 40% ao creditar quem ja era aluno antes de entrar na sala.
       count(distinct v.email) filter (
         where v.quando between e.data_inicio::date and e.data_inicio::date + 60) as compraram,
       round(coalesce(sum(v.valor) filter (
         where v.quando between e.data_inicio::date and e.data_inicio::date + 60), 0)) as receita,
       count(distinct v.email) filter (where v.quando < e.data_inicio::date) as ja_eram_alunos,
       round(g.gasto / nullif(count(distinct i.email), 0)) as custo_por_inscrito,
       round(coalesce(sum(v.valor) filter (
         where v.quando between e.data_inicio::date and e.data_inicio::date + 60), 0)
             / nullif(g.gasto, 0), 2)               as retorno
  from mkt_campanha_evento m
  join gasto g       on g.campanha_nome = m.campanha_nome
  join dim_eventos e on e.evento_id = m.evento_id
  left join inscrito i  on i.evento_id = e.evento_id
  left join matricula v on v.email = i.email
 where pode_ver('marketing') or pode_ver('geral')
 group by m.campanha_nome, e.evento_id, e.nome_evento, e.data_inicio,
          g.comecou, g.terminou, g.gasto;

comment on view public.vw_mkt_evento_resultado is
  'Campanha de evento: gasto, inscritos no Sympla e CURSO vendido a quem se
   inscreveu. Receita de ingresso NAO entra -- o ingresso custa R$ 30 e a
   palestra existe para vender curso; medir por ingresso diria que toda
   palestra da prejuizo. `ja_eram_alunos` separa reengajamento de aquisicao.
   `resultado_parcial` marca evento com menos de 30 dias: o retorno dele ainda
   nao aconteceu, e zero ali nao significa fracasso.';

revoke all on public.vw_mkt_evento_resultado from anon;
grant select on public.vw_mkt_evento_resultado to authenticated;

notify pgrst, 'reload schema';

-- conferir:
--   select campanha_nome, gasto, inscritos, compraram, receita, retorno,
--          ja_eram_alunos, resultado_parcial
--     from vw_mkt_evento_resultado order by gasto desc;
