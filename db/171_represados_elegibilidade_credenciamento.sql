-- ============================================================
-- 171 — REPRESADOS: ELEGIBILIDADE ATUAL DO CREDENCIAMENTO
--
-- A fila materializada continua preservada. Esta view apenas impede que a
-- Central e disparar_represados() tratem como represado quem hoje está:
--   13 — Cancelado
--   22 — TRANSF. DE TITULARIDADE (titular antigo)
--   27 — COMPRADOR DE VAGAS
--
-- O filtro é por CPF + curso. Se a mesma pessoa possuir outro
-- Credenciamento__c elegível para o curso, ela permanece na fila.
-- ============================================================

begin;

create or replace view public.vw_represado_lista as
select f.cpf as aluno_id,
       f.nome,
       f.telefone,
       f.curso,
       f.vence_em,
       f.dias_restantes,
       f.comprou_em,
       f.proxima_turma    as turma_id,
       f.proxima_turma_em,
       f.ja_transferiu,
       u.enviado_em       as ultimo_convite_em,
       case when u.enviado_em is null then null::integer
            else current_date - u.enviado_em::date
       end                as dias_desde_o_convite,
       u.resposta         as ultima_resposta,
       f.telefone is not null
         and f.dias_restantes <= 90
         and (u.enviado_em is null or u.enviado_em < now() - interval '90 days')
                          as pode_disparar
  from public.fila_prazo f
  left join lateral (
    select e.enviado_em, e.resposta
      from public.pedagogico_envios e
     where e.aluno_id = f.cpf
       and e.tipo in ('convite', 'prazo_vencendo')
       and e.status = 'aceito'
     order by e.enviado_em desc
     limit 1
  ) u on true
 where coalesce(f.turma_da_venda, '') not ilike '%LISBOA%'
   and f.curso not ilike '%MAESTRIA%'
   and f.situacao <> 'vencido'
   and f.proxima_turma is not null
   and f.proxima_turma_em <= f.vence_em
   and not exists (
     select 1
       from public.fato_credenciamento_turma ci
       join public.dim_turma_salesforce ti on ti.turma_id = ci.turma_id
      where ci.cpf_norm = lpad(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g'), 11, '0')
        and public.norm_curso(ti.curso_nome) = public.norm_curso(f.curso)
        and not ci.elegivel
        and not exists (
          select 1
            from public.fato_credenciamento_turma ce
            join public.dim_turma_salesforce te on te.turma_id = ce.turma_id
           where ce.cpf_norm = ci.cpf_norm
             and public.norm_curso(te.curso_nome) = public.norm_curso(f.curso)
             and ce.elegivel
        )
   )
   and public.pode_ver('pedagogico');

comment on view public.vw_represado_lista is
  'Represados dentro da validade e com turma disponível, excluindo a '
  'elegibilidade atual 13/22/27 do credenciamento Salesforce. Uma matrícula '
  'elegível da mesma pessoa para o curso mantém a pessoa na fila.';

revoke all on public.vw_represado_lista from anon;
grant select on public.vw_represado_lista to authenticated;

notify pgrst, 'reload schema';

commit;

-- Conferência após aplicar, com usuário do Pedagógico:
-- select count(*) as represados,
--        count(*) filter (where pode_disparar) as elegiveis_disparo
--   from public.vw_represado_lista;
