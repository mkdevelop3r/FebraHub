-- ============================================================
-- Correção: vw_auditoria_gaps e vw_auditoria_consultora não tinham dimensão
-- de tempo, então o filtro de período não alcançava esses dois blocos.
--
-- Views não aceitam mudança de colunas por create or replace: drop primeiro.
-- Aplicar DEPOIS do 119_auditoria_gate.sql, e re-aplicar o gate nestas duas
-- (o drop leva o where pode_ver junto).
-- ============================================================

drop view if exists vw_auditoria_gaps;
drop view if exists vw_auditoria_consultora;

-- ---------- gaps: falha por etapa, agora com mês ----------
create view vw_auditoria_gaps as
with notas as (
  select a.canal,
         date_trunc('month', a.data_ref)::date as mes,
         a.data_ref,
         a.consultora,
         e.etapa, e.peso, e.ordem,
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
)
select canal, mes, data_ref, consultora, etapa, peso, ordem,
       count(*) filter (where nota is not null) as avaliadas,
       count(*) filter (where nota = 0)         as falhas,
       round(100.0 * count(*) filter (where nota = 0)
             / nullif(count(*) filter (where nota is not null), 0), 0) as pct_falha
from notas
group by 1,2,3,4,5,6,7;
-- data_ref no grão permite recorte livre (30 dias, semana). Para a visão
-- agregada, o front soma falhas/avaliadas e recalcula a porcentagem —
-- NÃO faça média de pct_falha, que pondera errado conversas de dias diferentes.

-- ---------- placar por consultora, agora com mês ----------
create view vw_auditoria_consultora as
select
  a.canal,
  date_trunc('month', a.data_ref)::date as mes,
  a.consultora,
  u.consultor_id,
  count(*)                          as auditadas,
  round(avg(a.score), 1)            as score_medio,
  round(avg(a.etapas_cumpridas), 1) as etapas_medias,
  min(a.score)                      as pior,
  max(a.score)                      as melhor,
  count(*) filter (where a.objetivos_futuro = 1
                     and a.desafios_dores   = 1) as sondagem_completa,
  (count(*) >= 20)                  as amostra_suficiente
from fato_auditoria a
left join dim_usuario_crm u on u.user_id = a.user_id
group by 1,2,3,4;
-- Atenção: amostra_suficiente passa a ser POR MÊS. Com 28 auditorias no total,
-- ninguém atinge 20 num mês só — o corte fica mais rígido do que era.
-- Se a intenção for acumulado, o front deve somar os meses antes de aplicar
-- o corte, e não usar esta coluna diretamente.
