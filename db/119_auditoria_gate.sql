-- ============================================================
-- 119 · AUDITORIA COMERCIAL — fecha o placar de verdade
--
-- STATUS: NÃO APLICADA. Escrita a partir do estado medido do banco em
-- 17/08/2026, para ser revisada e aplicada por você.
--
-- O QUE ESTÁ ERRADO HOJE
-- ----------------------
-- O hub de Auditoria nasceu como "placar fechado: só gestão vê, consultora
-- não". A tela cumpre isso — o item da sidebar só aparece para quem tem o
-- setor. O BANCO não cumpre.
--
-- Medido, não suposto:
--
--   set local role authenticated;
--   select (select count(*) from dim_peso_etapa)          as peso_etapa,   -- 0
--          (select count(*) from vw_auditoria_kpi)        as kpi,          -- 1
--          (select count(*) from vw_auditoria_gaps)       as gaps,         -- 30
--          (select count(*) from vw_auditoria_consultora) as consultora,   -- 3
--          (select count(*) from vw_conformidade_venda)   as conformidade; -- 3
--
-- Duas coisas nesse resultado:
--
-- 1. As quatro views devolvem TUDO para qualquer autenticado. Elas não têm
--    o `where pode_ver(...)` que as 87 views de comercial/financeiro/
--    pedagógico têm, e `fato_auditoria` está com RLS ligada e ZERO policies
--    — mas isso não protege nada, porque view pertencente ao postgres sem
--    `security_invoker` roda com o privilégio do dono e passa por cima da
--    RLS da tabela. Resultado prático: uma consultora com a chave anon (que
--    vai no bundle do front) lê o próprio score, o das colegas e o placar
--    inteiro. Esconder o menu não fecha porta nenhuma.
--
-- 2. `dim_peso_etapa` devolve 0 linhas — ali a RLS pega, porque é tabela e
--    o acesso é direto. Ou seja: o único objeto que a RLS efetivamente
--    protege é justamente o que não é sigiloso (a tabela de pesos, que o
--    hub exibe de propósito, por transparência), e os quatro que carregam
--    o dado sensível estão abertos. Está exatamente ao contrário.
--
-- POR QUE O SETOR É 'auditoria', E NÃO 'comercial'
-- ------------------------------------------------
-- As consultoras têm setor 'comercial'. Gatear em 'comercial' colocaria
-- justamente elas dentro do placar. 'auditoria' é setor novo, concedido
-- caso a caso por perfil_setores — e `pode_ver` já libera automaticamente
-- quem é papel 'admin' ou setor 'geral', que é o caso do CEO/diretoria.
--
-- (O rascunho em db/migration_hub_auditoria.sql sugeria 'auditoria_gestao'.
--  Escolhi o nome curto por consistência com os outros setores; se preferir
--  o longo, troque nos cinco lugares abaixo E no HUBS do FebraHub.jsx.)
-- ============================================================

-- ---------- 1. o gate nas quatro views ----------
-- Só o `where` muda; o corpo de cada uma é o que já está no banco hoje.

create or replace view vw_auditoria_kpi as
select
  canal,
  date_trunc('month', data_ref)::date               as mes,
  count(*)                                           as auditadas,
  round(avg(score))                                  as score_medio,
  round(avg(etapas_cumpridas), 1)                    as etapas_medias,
  max(etapas_avaliadas)                              as etapas_possiveis,
  count(*) filter (where faixa = 'alta')             as faixa_alta,
  count(*) filter (where temperatura_lead='quente')  as leads_quentes,
  count(*) filter (where objetivos_futuro = 1
                     and desafios_dores   = 1)       as sondagem_completa,
  sum(audios_usados)                                 as audios
from fato_auditoria
where pode_ver('auditoria')
group by 1, 2;

create or replace view vw_auditoria_gaps as
with notas as (
  select a.canal, a.data_ref, a.consultora, e.etapa, e.peso, e.ordem,
         case e.etapa
           when 'apresentacao'             then a.apresentacao
           when 'quebra_gelo'              then a.quebra_gelo
           when 'conhecimento_previo'      then a.conhecimento_previo
           when 'motivo_contato'           then a.motivo_contato
           when 'perfil_profissional'      then a.perfil_profissional
           when 'objetivos_futuro'         then a.objetivos_futuro
           when 'desafios_dores'           then a.desafios_dores
           when 'apresentacao_treinamento' then a.apresentacao_treinamento
           when 'validacao_interesse'      then a.validacao_interesse
           when 'tratamento_objecoes'      then a.tratamento_objecoes
           when 'fechamento'               then a.fechamento
           when 'proximos_passos'          then a.proximos_passos
         end as nota
  from fato_auditoria a
  join dim_peso_etapa e on e.canal = a.canal
  where pode_ver('auditoria')
)
select canal, consultora, etapa, peso, ordem,
       count(*) filter (where nota is not null)      as avaliadas,
       count(*) filter (where nota = 0)              as falhas,
       round(100.0 * count(*) filter (where nota = 0)
             / nullif(count(*) filter (where nota is not null),0), 0) as pct_falha
from notas
group by 1,2,3,4,5;

create or replace view vw_auditoria_consultora as
select
  a.canal,
  a.consultora,
  u.consultor_id,
  count(*)                                as auditadas,
  round(avg(a.score), 1)                  as score_medio,
  round(avg(a.etapas_cumpridas), 1)       as etapas_medias,
  min(a.score)                            as pior,
  max(a.score)                            as melhor,
  count(*) filter (where a.objetivos_futuro = 1
                     and a.desafios_dores   = 1) as sondagem_completa,
  (count(*) >= 20)                        as amostra_suficiente
from fato_auditoria a
left join dim_usuario_crm u on u.user_id = a.user_id
where pode_ver('auditoria')
group by 1, 2, 3;

create or replace view vw_auditoria_criticos as
select canal, unnest(pontos_criticos) as ponto_critico, count(*) as ocorrencias
from fato_auditoria
where pontos_criticos is not null
  and pode_ver('auditoria')
group by 1,2
order by 3 desc;

-- vw_conformidade_venda cruza auditoria com receita por consultora. O gate
-- entra na CTE de auditoria: sem ela, `juntou` fica vazio e a view devolve
-- zero linhas — inclusive as medianas, que só existem se houver base.
create or replace view vw_conformidade_venda as
with auditoria as (
  select a.consultora, a.user_id,
         date_trunc('month', a.data_ref)::date as mes,
         count(*) as auditadas,
         round(avg(a.score), 1) as score_medio,
         count(*) filter (where a.completo) as completos
  from fato_auditoria a
  where pode_ver('auditoria')
  group by 1, 2, 3
), juntou as (
  select au.mes, au.consultora, au.user_id, u.consultor_id,
         au.auditadas, au.score_medio, au.completos,
         r.vendas, r.receita, r.ticket_medio,
         au.auditadas >= 20 as amostra_suficiente
  from auditoria au
  left join dim_usuario_crm u
         on u.user_id = au.user_id
         or (au.user_id is null and u.nome = au.consultora)
  left join vw_receita_consultora_mes r
         on r.consultor_id = u.consultor_id and r.mes = au.mes
), cortes as (
  -- Mediana calculada SÓ entre quem tem amostra suficiente. Com ninguém
  -- acima do corte ela volta nula, e o hub para de desenhar quadrante —
  -- é o comportamento correto, não um bug a consertar.
  select mes,
         percentile_cont(0.5) within group (order by score_medio::float8) as score_mediano,
         percentile_cont(0.5) within group (order by receita::float8)     as receita_mediana
  from juntou
  where amostra_suficiente and receita is not null
  group by 1
)
select j.mes, j.consultora, j.user_id, j.consultor_id,
       j.auditadas, j.score_medio, j.completos,
       j.vendas, j.receita, j.ticket_medio,
       j.amostra_suficiente, c.score_mediano, c.receita_mediana,
       case
         when not j.amostra_suficiente then 'amostra insuficiente'
         when j.receita is null        then 'sem venda atribuída'
         when j.score_medio::float8 >= c.score_mediano
          and j.receita::float8     >= c.receita_mediana then 'modelo'
         when j.score_medio::float8 <  c.score_mediano
          and j.receita::float8     <  c.receita_mediana then 'treinar'
         when j.score_medio::float8 <  c.score_mediano
          and j.receita::float8     >= c.receita_mediana then 'revisar roteiro'
         else 'acompanhar'
       end as quadrante
from juntou j
left join cortes c on c.mes = j.mes;

-- ---------- 2. policy na tabela dos pesos ----------
-- dim_peso_etapa está com RLS ligada e sem policy, então devolve 0 linhas
-- para authenticated. Os pesos NÃO são sigilosos — o hub os exibe de
-- propósito, para que ninguém ache o score arbitrário. Mas ficam atrás do
-- mesmo setor, porque fora do hub eles não têm uso.
drop policy if exists peso_etapa_auditoria on dim_peso_etapa;
create policy peso_etapa_auditoria on dim_peso_etapa
  for select using (pode_ver('auditoria'));

-- fato_auditoria continua com RLS ligada e sem policy de select: o acesso
-- é pelas views acima, e nenhuma tela lê a tabela crua. Mantém o padrão do
-- projeto ("o front NUNCA toca em tabela crua").

-- ---------- 3. conceder o setor ----------
-- Um insert por pessoa da gestão. Rode com o e-mail real de cada uma;
-- quem é papel 'admin' ou setor 'geral' já passa sem precisar disto.
--
--   insert into perfil_setores (perfil_id, setor)
--   select id, 'auditoria' from perfis
--    where email in ('...@febracis.com.br')
--   on conflict do nothing;

-- ---------- 4. conferir depois de aplicar ----------
-- Como authenticated SEM o setor, as cinco contagens têm que dar 0:
--
--   set local role authenticated;
--   select (select count(*) from dim_peso_etapa),
--          (select count(*) from vw_auditoria_kpi),
--          (select count(*) from vw_auditoria_gaps),
--          (select count(*) from vw_auditoria_consultora),
--          (select count(*) from vw_conformidade_venda);
--
-- Hoje esse mesmo comando devolve 0, 1, 30, 3, 3.
