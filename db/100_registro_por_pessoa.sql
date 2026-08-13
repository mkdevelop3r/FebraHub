-- ============================================================
-- 100 — REGISTRO DE ENVIO POR PESSOA
--
-- APLICADO. Conferido no banco em 13/08/2026.
--
-- CORREÇÃO das funções do 98 e 99. Elas registravam "os N primeiros
-- da fila" — o que só funciona se todos os N derem certo.
--
-- Na prática o script processa um por um contra o CRM, e alguns
-- falham: contato sem telefone válido, erro de rede, rate limit.
-- Registrar por quantidade marcaria como enviados três contatos que
-- deram erro — e o `not exists` das views os bloquearia para sempre.
-- A pessoa comprou, nunca foi acolhida, e nada acusa.
--
-- Agora o script informa exatamente quem foi. Cada linha registrada
-- corresponde a uma tag que realmente entrou no CRM.
-- ============================================================

drop function if exists registrar_envio_prazo(int);
drop function if exists registrar_envio_boas_vindas(int);


-- p_itens: [{"aluno_id":"01234567890","turma_id":"2026 - IF36"}, ...]
create function registrar_envio_prazo(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) is distinct from 'service_role'
     and not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, enviado_em, criado_em)
  select i->>'aluno_id', i->>'turma_id', 'prazo', 'prazo_vencendo', 'aceito', now(), now()
    from jsonb_array_elements(p_itens) i
   where not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = i->>'aluno_id'
        and e.turma_id = i->>'turma_id'
        and e.tipo = 'prazo_vencendo');

  get diagnostics v_n = row_count;
  return jsonb_build_object('registrados', v_n);
end $$;

revoke execute on function registrar_envio_prazo from anon;


create function registrar_envio_boas_vindas(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) is distinct from 'service_role'
     and not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, canal, enviado_em, criado_em)
  select i->>'aluno_id', i->>'turma_id', 'venda', 'boas_vindas', 'aceito',
         coalesce(i->>'canal','whatsapp'), now(), now()
    from jsonb_array_elements(p_itens) i
   where not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = i->>'aluno_id'
        and e.turma_id = i->>'turma_id'
        and e.tipo = 'boas_vindas');

  get diagnostics v_n = row_count;
  return jsonb_build_object('registrados', v_n);
end $$;

revoke execute on function registrar_envio_boas_vindas from anon;

-- O `not exists` interno é cinto e suspensório: a view já filtra,
-- mas duas execuções simultâneas do script passariam pelo filtro da
-- view ao mesmo tempo. Aqui a segunda não grava nada.
