-- ============================================================
-- FebraHub · Migration 189 — Conserta a precedencia do WHERE na
--                            vw_turma_divergencia (erro meu na db/187)
--
-- Escrevi assim:
--
--     where pode_ver('pedagogico') or pode_ver('geral')
--       and t.data_inicio >= current_date - 180
--
-- e li como "(pode_ver OU pode_ver) E recente". O Postgres le o contrario,
-- porque AND tem precedencia maior que OR:
--
--     pode_ver('pedagogico') OR (pode_ver('geral') AND recente)
--
-- Para quem tem acesso ao Pedagogico, o filtro de data simplesmente nao
-- existe: a view devolve as 234 turmas, inclusive as de 2022. Numa tela que
-- existe para responder "que turma esta divergente AGORA", isso e ruido que
-- esconde justamente o que ela deveria mostrar.
--
-- NAO E FURO DE PERMISSAO -- os dois lados do OR exigem `pode_ver` -- mas e o
-- mesmo tipo de descuido que ja causou problema aqui: `full join` sem
-- `coalesce` na db/179, `group by` sobre agregado na db/181. Parenteses
-- explicitos custam nada e dispensam lembrar da tabela de precedencia.
--
-- Passei nisso porque a view devolveu 0 linhas no teste e eu atribui ao
-- `pode_ver` -- que, rodando sem sessao autenticada, e falso mesmo. O zero
-- estava certo pelo motivo errado, e escondeu o defeito.
-- ============================================================

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
 where (pode_ver('pedagogico') or pode_ver('geral'))
   and t.data_inicio >= current_date - 180;

comment on view public.vw_turma_divergencia is
  'Turmas em que o Salesforce e a unidade discordam, ou que o sync nunca
   tocou. Olhar antes de fechar meta ou de oferecer turma a represado.
   Janela: 180 dias para tras.';

revoke all on public.vw_turma_divergencia from anon;
grant select on public.vw_turma_divergencia to authenticated;

notify pgrst, 'reload schema';

-- conferir (numa sessao autenticada):
--   select situacao, count(*) from vw_turma_divergencia group by 1;
--   -- antes do primeiro sync: tudo em "nunca sincronizada", e so turma
--   -- recente, nao as de 2022.
