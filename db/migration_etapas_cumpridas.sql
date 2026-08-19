-- ============================================================
-- Ajuste aprovado por Carmen (ago/2026)
-- Aposenta a bandeira "atendimento completo" e adota "etapas cumpridas: X de N".
--
-- Motivo: com os 10 pontos críticos invalidando, 0 de 29 atendimentos ficavam
-- completos. Métrica que dá sempre o mesmo valor não informa. A escala contínua
-- mostra progresso — sair de 3 para 5 etapas é visível.
-- Os pontos críticos CONTINUAM registrados: viram diagnóstico, não veredito.
-- ============================================================

alter table fato_auditoria
  add column if not exists etapas_cumpridas int,
  add column if not exists etapas_avaliadas int;

-- ---------- preenche o que já está gravado ----------
update fato_auditoria set
  etapas_cumpridas = (
    coalesce(apresentacao,0) + coalesce(quebra_gelo,0) + coalesce(conhecimento_previo,0)
  + coalesce(motivo_contato,0) + coalesce(perfil_profissional,0) + coalesce(objetivos_futuro,0)
  + coalesce(desafios_dores,0) + coalesce(apresentacao_treinamento,0)
  + coalesce(validacao_interesse,0) + coalesce(tratamento_objecoes,0)
  + coalesce(fechamento,0) + coalesce(proximos_passos,0)),
  etapas_avaliadas = (
    (apresentacao is not null)::int + (quebra_gelo is not null)::int
  + (conhecimento_previo is not null)::int + (motivo_contato is not null)::int
  + (perfil_profissional is not null)::int + (objetivos_futuro is not null)::int
  + (desafios_dores is not null)::int + (apresentacao_treinamento is not null)::int
  + (validacao_interesse is not null)::int + (tratamento_objecoes is not null)::int
  + (fechamento is not null)::int + (proximos_passos is not null)::int)
where etapas_cumpridas is null;

-- ---------- KPIs: troca "completos" por etapas ----------
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
  -- meta do ciclo: sondar objetivos E desafios (as duas que mais falham)
  count(*) filter (where objetivos_futuro = 1
                     and desafios_dores   = 1)       as sondagem_completa,
  sum(audios_usados)                                 as audios
from fato_auditoria
group by 1, 2;

-- ---------- placar por consultora ----------
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
group by 1, 2, 3;

-- A coluna "completo" fica na tabela por compatibilidade, mas não é mais usada
-- em nenhuma view. Revisar quando "não identificou desafios" cair abaixo de 50%.
