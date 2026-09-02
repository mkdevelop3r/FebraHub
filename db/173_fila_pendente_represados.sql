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
       f.ja_transferiu
  from public.pedagogico_envios e
  join public.fila_prazo f
    on f.cpf = e.aluno_id
   and f.proxima_turma = e.turma_id
 where e.tipo = 'prazo_vencendo'
   and e.status = 'pendente'
   and f.telefone is not null;

comment on view public.vw_prazo_fila_envio is
  'Mensagens de represados explicitamente enfileiradas e ainda pendentes.';

create or replace function public.registrar_envio_prazo(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) is distinct from 'service_role'
     and not pode_ver('pedagogico') then
    raise exception 'Sem permissao';
  end if;

  update public.pedagogico_envios e
     set status = 'aceito',
         enviado_em = now(),
         canal = coalesce(i->>'canal', e.canal)
    from jsonb_array_elements(p_itens) i
   where e.aluno_id = i->>'aluno_id'
     and e.turma_id = i->>'turma_id'
     and e.tipo = 'prazo_vencendo'
     and e.status = 'pendente';

  get diagnostics v_n = row_count;
  return jsonb_build_object('registrados', v_n);
end $$;

revoke execute on function public.registrar_envio_prazo(jsonb) from anon;
grant execute on function public.registrar_envio_prazo(jsonb) to authenticated, service_role;
grant select on public.vw_prazo_fila_envio to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Conferencia antes do disparo:
-- select turma_id, count(*) from public.vw_prazo_fila_envio group by turma_id;
