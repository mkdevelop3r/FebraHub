-- ============================================================
-- FebraHub · Migration 205 — disparar_represados sem estourar a PK
--
-- BUG: pedagogico_envios tem PK (aluno_id, turma_id, tipo). O guard
-- anti-duplicata de disparar_represados só pulava quem tinha envio com
-- status = 'pendente'. Quem já recebeu 'prazo_vencendo' naquela turma
-- (status 'aceito'/'enviado'/'erro'...) NÃO era excluído, então o INSERT
-- tentava gravar a mesma PK de novo:
--   duplicate key value violates unique constraint "pedagogico_envios_pkey"
-- Ficou latente enquanto a fila_prazo estava velha; voltou ao normalizar
-- o refresh da fila (essas pessoas voltaram a aparecer na fila).
--
-- FIX: ON CONFLICT (aluno_id, turma_id, tipo) DO UPDATE — em vez de estourar,
-- re-enfileira a pessoa (volta pra 'pendente' e zera o ciclo de envio). Isso
-- é fiel à intenção do código, que de propósito só protegia quem estava
-- 'pendente' (o resto era pra reentrar após a carência). Mantém `resposta`
-- e a confirmação, só limpa o que é do ciclo de envio (enviado_em, erro,
-- tentativas). `get diagnostics row_count` passa a contar inseridos + re-enfileirados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.disparar_represados(p_dias_carencia integer DEFAULT 90, p_turma_id text DEFAULT NULL::text, p_prazo_maximo integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     )
  on conflict (aluno_id, turma_id, tipo) do update
     set status     = 'pendente',
         origem     = excluded.origem,
         criado_em  = excluded.criado_em,
         enviado_em = null,
         erro_msg   = null,
         tentativas = 0
   where public.pedagogico_envios.status <> 'pendente';

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
end $function$;

notify pgrst, 'reload schema';
