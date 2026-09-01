-- ============================================================
-- 172 — DISPARO DE REPRESADOS POR TURMA
--
-- Ao escolher uma turma, a intenção operacional é convidar todos os
-- represados válidos daquela turma que possuem telefone. A janela de 90 dias
-- continua protegendo o disparo GERAL, mas não limita uma campanha deliberada
-- por turma. Uma mensagem já pendente para pessoa + turma continua bloqueada.
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
       f.telefone is not null as pode_disparar
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
  'Represados válidos por turma. pode_disparar significa possuir telefone; '
  'campanhas por turma alcançam todos com contato, e o disparo geral mantém '
  'a janela de prazo e carência.';

drop function if exists public.disparar_represados(integer, text, integer);

create function public.disparar_represados(
  p_dias_carencia integer default 90,
  p_turma_id      text    default null,
  p_prazo_maximo  integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  insert into public.pedagogico_envios
    (aluno_id, turma_id, origem, tipo, status, criado_em)
  select r.aluno_id, r.turma_id, 'prazo', 'prazo_vencendo', 'pendente', now()
    from public.vw_represado_lista r
   where r.telefone is not null
     and (p_turma_id is null or r.turma_id = p_turma_id)
     and (p_turma_id is not null
          or p_prazo_maximo is null
          or r.dias_restantes <= p_prazo_maximo)
     and (p_turma_id is not null
          or r.ultimo_convite_em is null
          or r.ultimo_convite_em < now() - (p_dias_carencia || ' days')::interval)
     and not exists (
       select 1
         from public.pedagogico_envios e
        where e.aluno_id = r.aluno_id
          and e.turma_id = r.turma_id
          and e.tipo = 'prazo_vencendo'
          and e.status = 'pendente'
     );

  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'enfileirados', v_n,
    'turma', p_turma_id,
    'mensagem', case
      when v_n = 0 and p_turma_id is not null
        then 'Ninguém novo para enfileirar nesta turma.'
      when v_n = 0
        then 'Ninguém elegível: todos já foram convidados recentemente.'
      when p_turma_id is not null
        then v_n || ' pessoa' || case when v_n = 1 then '' else 's' end
             || ' da turma ' || p_turma_id || ' entra'
             || case when v_n = 1 then '' else 'm' end || ' na próxima rodada de envio.'
      else v_n || ' pessoas entram na próxima rodada de envio.'
    end
  );
end $$;

revoke execute on function public.disparar_represados(integer, text, integer) from anon;
grant execute on function public.disparar_represados(integer, text, integer) to authenticated;
grant select on public.vw_represado_lista to authenticated;

notify pgrst, 'reload schema';

commit;

-- Conferência no IF36 após aplicar:
-- select turma_id, count(*) total,
--        count(*) filter (where telefone is null) sem_telefone,
--        count(*) filter (where pode_disparar) elegiveis
--   from public.vw_represado_lista
--  where turma_id ilike '%IF36%'
--  group by turma_id;
