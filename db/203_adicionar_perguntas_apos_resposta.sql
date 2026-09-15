-- ============================================================
-- FebraHub · Migration 203 — Adicionar perguntas mesmo após respostas
--
-- Decisão pedagógica (Elis): depois que alguém responde, ainda dá pra ADICIONAR
-- perguntas novas. Só editar/remover as existentes fica travado — senão as
-- respostas já dadas ficariam penduradas numa pergunta que mudou de sentido.
--
-- (Quem responde depois da nova pergunta responde ela; quem já tinha respondido
-- fica com a célula vazia na planilha. Esperado.)
-- ============================================================

-- A trava agora permite INSERT; bloqueia só UPDATE/DELETE em evento respondido.
create or replace function public.evento_pergunta_imutavel()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_evento bigint := coalesce(new.evento_id, old.evento_id);
begin
  if TG_OP = 'INSERT' then
    return new;                         -- adicionar é sempre permitido
  end if;
  if exists (select 1 from eventos where id = v_evento and travado_em is not null) then
    raise exception 'Este evento já recebeu respostas. As perguntas existentes não podem mudar (mas você pode adicionar novas).';
  end if;
  return coalesce(new, old);
end
$function$;

-- Só ACRESCENTA perguntas ao fim (não apaga nem altera nenhuma existente), então
-- funciona mesmo com o evento travado. As novas nascem comuns (nucleo=false).
create or replace function public.adicionar_perguntas_evento(p_evento_id bigint, p_perguntas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_setor text;
  v_item  jsonb;
  v_ordem int;
  v_n     int := 0;
begin
  select setor into v_setor from eventos where id = p_evento_id;
  if v_setor is null then
    raise exception 'Evento não encontrado';
  end if;
  if not pode_ver(v_setor) then
    raise exception 'Sem permissão para editar este evento';
  end if;
  if jsonb_typeof(p_perguntas) <> 'array' then
    raise exception 'Formato inválido: envie uma lista de perguntas';
  end if;

  select coalesce(max(ordem), 0) into v_ordem
    from evento_perguntas where evento_id = p_evento_id;

  for v_item in select * from jsonb_array_elements(p_perguntas)
  loop
    if coalesce(btrim(v_item->>'texto'), '') = '' then
      raise exception 'Pergunta sem texto';
    end if;
    v_ordem := v_ordem + 1;
    v_n := v_n + 1;
    insert into evento_perguntas (evento_id, ordem, texto, tipo, obrigatoria, nucleo, opcoes)
    values (
      p_evento_id, v_ordem, btrim(v_item->>'texto'),
      (v_item->>'tipo')::tipo_pergunta,
      coalesce((v_item->>'obrigatoria')::boolean, true),
      false,
      case when v_item ? 'opcoes' and jsonb_typeof(v_item->'opcoes') = 'array'
           then array(select jsonb_array_elements_text(v_item->'opcoes'))
           end
    );
  end loop;

  return jsonb_build_object('adicionadas', v_n);
end
$function$;

revoke execute on function public.adicionar_perguntas_evento(bigint, jsonb) from anon;
grant execute on function public.adicionar_perguntas_evento(bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
