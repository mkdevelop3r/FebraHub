-- ============================================================
-- 117 — CENTRAL PEDAGÓGICA: O ESTADO REAL DO BANCO
--
-- APLICADO. Este arquivo NÃO muda nada: ele TRANSCREVE o que está em
-- produção em 15/08/2026, lido com pg_get_viewdef.
--
-- POR QUE ELE EXISTE
--
-- `vw_turmas_central` foi aplicada três vezes, e nenhuma das versões
-- salvas no db/ era a que ficou no banco:
--
--   115_turmas_central.sql   (Claude)  exists, sem contadores
--   116_turmas_central.sql   (gerada)  join, marcada NÃO APLICADA
--   produção                           exists + pode_confirmar +
--                                      pode_grupo + contadores no LATERAL
--
-- As duas primeiras foram REMOVIDAS junto com este commit: descreviam
-- tentativas, não o banco. O db/ vale como fonte da verdade enquanto
-- descrever o que está rodando; um arquivo que perdeu a corrida vira
-- documentação errada, que é pior que documentação nenhuma.
--
-- A migration 115 continua existindo — mas é a `115_so_turma_de_verdade`,
-- que é outra coisa (grade_pedagogico + vw_turma_inscritos) e está
-- aplicada. Com isso o número 115 deixa de estar duplicado.
--
-- DIVERGÊNCIA CONHECIDA, DEIXADA COMO ESTÁ
--
-- A 115_so_turma_de_verdade contém:
--     update dim_cursos set grade_pedagogico = false
--      where nome_curso = 'LIVRÃO MÉTODO CIS';
-- No banco, hoje, LIVRÃO MÉTODO CIS está com grade_pedagogico = TRUE.
-- O mesmo vale para TOUR CRESCIMENTO EMPRESARIAL, que o comentário
-- daquele arquivo dava como false e está true (é por isso que o TOUR PV,
-- com 421 inscritos, aparece na Central).
--
-- Ou a carga do Salesforce sobrescreveu, ou o update não pegou. Não
-- corrijo aqui: o banco ganha, e a decisão de quais produtos entram na
-- grade é da operação, não minha. Fica registrado para não ser
-- redescoberto daqui a três meses.
-- ============================================================


-- ------------------------------------------------------------
-- vw_turmas_central — a lista de turmas da Central
--
-- `exists` e não `join`: dim_cursos tem 158 linhas para 153 nomes
-- normalizados, e MÉTODO CIS GLOBAL casa três vezes. Com join, a
-- CIS-GL252 apareceria em triplicata na tela.
--
-- Os contadores vêm num LATERAL sobre vw_turma_inscritos, só do tipo
-- 'confirmacao' — é o fluxo que acontece primeiro, e é o que a linha da
-- lista mostra. O drawer, que separa confirmação de link do grupo, lê a
-- vw_turma_inscritos_resumo.
--
-- `pode_confirmar` e `pode_grupo` respondem, por turma, o que a função
-- disparar_turma() exigiria: assim a tela sabe ANTES de clicar se o
-- cadastro está completo.
-- ------------------------------------------------------------
create or replace view public.vw_turmas_central as
select t.turma_id,
       t.curso,
       t.sigla,
       t.data_inicio,
       t.data_fim,
       t.cidade,
       t.horario_credenciamento,
       t.horario_inicio,
       t.horario_fim,
       t.local,
       t.capacidade,
       t.nome_comercial,
       t.link_grupo,
       (t.data_inicio >= current_date)                          as futura,
       (coalesce(t.horario_credenciamento, '') <> ''
        and coalesce(t.horario_inicio, '') <> ''
        and coalesce(t.horario_fim, '') <> '')                  as pode_confirmar,
       (coalesce(t.link_grupo, '') ~ '^https://chat\.whatsapp\.com/') as pode_grupo,
       coalesce(i.matriculados, 0)        as matriculados,
       coalesce(i.confirmados, 0)         as confirmados,
       coalesce(i.nao_vem, 0)             as nao_vem,
       coalesce(i.sem_resposta, 0)        as sem_resposta,
       coalesce(i.aguardando_resposta, 0) as aguardando_resposta,
       coalesce(i.nao_enfileirados, 0)    as nao_enfileirados,
       coalesce(i.sem_contato, 0)         as sem_contato
  from public.dim_turmas t
  left join lateral (
    select count(*)                                                     as matriculados,
           count(*) filter (where vi.situacao = 'confirmado')           as confirmados,
           count(*) filter (where vi.situacao = 'nao vem')              as nao_vem,
           count(*) filter (where vi.situacao = 'sem resposta')         as sem_resposta,
           count(*) filter (where vi.situacao = 'aguardando resposta')  as aguardando_resposta,
           count(*) filter (where vi.situacao = 'nao enfileirado')      as nao_enfileirados,
           count(*) filter (where vi.sem_contato)                       as sem_contato
      from public.vw_turma_inscritos vi
     where vi.turma_id = t.turma_id
       and vi.tipo = 'confirmacao'
  ) i on true
 where public.pode_ver('pedagogico')
   and exists (
     select 1 from public.dim_cursos dc
      where norm_curso(dc.nome_curso) = norm_curso(t.curso)
        and dc.grade_pedagogico
   );

comment on view public.vw_turmas_central is
  'Turmas que a Central opera: só as de curso da grade pedagógica, com os
   contadores de confirmação já agregados e com `pode_confirmar` /
   `pode_grupo` dizendo se o cadastro permite disparar. `exists` em vez de
   `join` porque dim_cursos repete o mesmo curso normalizado.';

grant select on public.vw_turmas_central to authenticated;

notify pgrst, 'reload schema';
