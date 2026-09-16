-- ============================================================
-- 200 — REPRESADO RECEBE O LINK DO GRUPO
--
-- O convite de represado apontava a proxima turma, mas nao carregava o
-- link_grupo. Como entrar no grupo passa a ser uma fonte de confirmacao, um
-- convite sem link deixa o processo pela metade.
--
-- Regra: campanha de uma turma sem link falha antes de enfileirar. No disparo
-- geral, so entram turmas que ja possuem link. Linhas pendentes antigas ficam
-- aguardando ate o link ser cadastrado; depois aparecem automaticamente na
-- fila do robo.
-- ============================================================

begin;

create or replace view public.vw_prazo_fila_envio as
select e.aluno_id,
       f.nome,
       f.telefone,
       f.curso,
       f.vence_em,
       f.dias_restantes,
       e.turma_id,
       f.proxima_turma_em,
       f.ja_transferiu,
       t.link_grupo
  from public.pedagogico_envios e
  join public.fila_prazo f
    on f.cpf = e.aluno_id
   and f.proxima_turma = e.turma_id
  join public.dim_turmas t
    on t.turma_id = e.turma_id
 where e.tipo = 'prazo_vencendo'
   and e.status = 'pendente'
   and f.telefone is not null
   and nullif(btrim(t.link_grupo), '') is not null;

comment on view public.vw_prazo_fila_envio is
  'Mensagens de represados pendentes. So libera a linha quando a turma possui '
  'link_grupo; o robo grava o link no CRM antes de aplicar a tag do workflow.';

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
    raise exception 'Sem permissao';
  end if;

  if p_turma_id is not null and not exists (
    select 1
      from public.dim_turmas t
     where t.turma_id = p_turma_id
       and nullif(btrim(t.link_grupo), '') is not null
  ) then
    raise exception 'Cadastre o link do grupo da turma % antes de disparar para os represados.',
      p_turma_id;
  end if;

  insert into public.pedagogico_envios
    (aluno_id, turma_id, origem, tipo, status, criado_em)
  select r.aluno_id, r.turma_id, 'prazo', 'prazo_vencendo', 'pendente', now()
    from public.vw_represado_lista r
    join public.dim_turmas t on t.turma_id = r.turma_id
   where r.telefone is not null
     and nullif(btrim(t.link_grupo), '') is not null
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
        then 'Ninguem novo para enfileirar nesta turma.'
      when v_n = 0
        then 'Ninguem elegivel com turma e link do grupo cadastrados.'
      when p_turma_id is not null
        then v_n || ' pessoa' || case when v_n = 1 then '' else 's' end
             || ' da turma ' || p_turma_id || ' entra'
             || case when v_n = 1 then '' else 'm' end || ' na proxima rodada de envio.'
      else v_n || ' pessoas entram na proxima rodada de envio.'
    end
  );
end $$;

revoke execute on function public.disparar_represados(integer, text, integer) from anon;
grant execute on function public.disparar_represados(integer, text, integer) to authenticated;
grant select on public.vw_prazo_fila_envio to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

