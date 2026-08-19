-- ============================================================
-- Conformidade × venda real — Hub de Auditoria
--
-- Junta: fato_auditoria (score) -> dim_usuario_crm (de-para) -> fato_pagamento_base (receita)
--
-- REGRAS QUE NÃO PODEM SER QUEBRADAS:
--   1. Receita = MAX(valor) por original_id_venda. NUNCA sum(valor) cru — o valor
--      se repete por forma de pagamento e infla cerca de 77%.
--   2. Contas genéricas (Febracis Sistemas, n8n, Sistema Salesforce, Pedagógico...)
--      não são pessoas e ficam fora de qualquer ranking.
--   3. Consultora com menos de 20 auditorias NÃO recebe classificação — amostra
--      pequena não julga ninguém.
--   4. Os cortes de "alto/baixo" usam a MEDIANA da equipe no período, não valores
--      fixos: ticket entre consultoras varia até 30x (R$ 868 a R$ 25.774), então
--      qualquer corte absoluto premiaria quem vende produto caro.
-- ============================================================

-- ---------- receita por consultora e mês (base do eixo Y) ----------
create or replace view vw_receita_consultora_mes as
with venda_unica as (
  -- uma linha por venda: max(valor) elimina a repetição por forma de pagamento
  select consultor_id,
         original_id_venda,
         date_trunc('month', data_pagamento)::date as mes,
         max(valor) as valor
  from fato_pagamento_base
  where data_pagamento is not null
  group by 1, 2, 3
)
select
  consultor_id,
  mes,
  count(*)                          as vendas,
  round(sum(valor))                 as receita,
  round(sum(valor) / count(*))      as ticket_medio
from venda_unica
where consultor_id not in (
  'Coordenador Comercial','Febracis BH','Febracis Salesforce','Febracis Sistemas',
  'Gestão ED','n8n','PEDAGOGICO FEBRACIS BAHIA','Pedagógico Febracis Holding',
  'Pedagógico São Paulo São Paulo','Sistema Salesforce'
)
group by 1, 2;

-- ---------- conformidade × venda ----------
create or replace view vw_conformidade_venda as
with auditoria as (
  select
    a.consultora,
    a.user_id,
    date_trunc('month', a.data_ref)::date as mes,
    count(*)                              as auditadas,
    round(avg(a.score), 1)                as score_medio,
    count(*) filter (where a.completo)    as completos
  from fato_auditoria a
  group by 1, 2, 3
),
juntou as (
  select
    au.mes,
    au.consultora,
    au.user_id,
    u.consultor_id,
    au.auditadas,
    au.score_medio,
    au.completos,
    r.vendas,
    r.receita,
    r.ticket_medio,
    (au.auditadas >= 20) as amostra_suficiente
  from auditoria au
  -- user_id é a chave certa; o nome é reserva para linhas antigas gravadas
  -- antes de o script passar a registrar o user_id.
  left join dim_usuario_crm u
         on u.user_id = au.user_id
         or (au.user_id is null and u.nome = au.consultora)
  left join vw_receita_consultora_mes r
         on r.consultor_id = u.consultor_id and r.mes = au.mes
),
cortes as (
  -- mediana do mês: define o que é "alto" e "baixo" em relação à própria equipe
  select mes,
         percentile_cont(0.5) within group (order by score_medio) as score_mediano,
         percentile_cont(0.5) within group (order by receita)     as receita_mediana
  from juntou
  where amostra_suficiente and receita is not null
  group by mes
)
select
  j.*,
  c.score_mediano,
  c.receita_mediana,
  case
    when not j.amostra_suficiente          then 'amostra insuficiente'
    when j.receita is null                 then 'sem venda atribuída'
    when j.score_medio >= c.score_mediano
     and j.receita     >= c.receita_mediana then 'modelo'
    when j.score_medio <  c.score_mediano
     and j.receita     <  c.receita_mediana then 'treinar'
    when j.score_medio <  c.score_mediano
     and j.receita     >= c.receita_mediana then 'revisar roteiro'
    else                                        'acompanhar'
  end as quadrante
from juntou j
left join cortes c on c.mes = j.mes;

-- ============================================================
-- COMO LER OS QUADRANTES (texto para o hub)
--   modelo          — segue o processo e vende. Usar como referência.
--   treinar         — não segue e não vende. Prioridade de treinamento.
--   revisar roteiro — não segue mas VENDE. Investigar antes de corrigir:
--                     pode ser que o roteiro esteja errado, não a consultora.
--   acompanhar      — segue o processo mas vende pouco. Ver se é carteira,
--                     produto ou momento.
-- ============================================================

-- ============================================================
-- ATENÇÃO — dois universos diferentes
-- O score vem de conversas de WhatsApp do funil GGB. A receita vem de TODAS as
-- vendas da consultora, inclusive de outros produtos e canais. Se uma consultora
-- vende bastante fora do GGB, o eixo da venda a favorece sem que o score reflita
-- esse trabalho. Enquanto não houver como amarrar venda ao canal de origem, o
-- hub deve exibir esta ressalva junto do gráfico.
-- ============================================================
