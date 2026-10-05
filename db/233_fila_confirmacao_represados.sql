-- 233: Enfileirar confirmação e grupo pela aba Represados, com a fila do script.
-- APLICADA em 05/10/2026 no SQL Editor; não dispara mensagens durante a migração.
begin;
create or replace view public.vw_turma_represados_envio_base as
select r.aluno_id,r.turma_id,r.nome,r.telefone,coalesce(c.email,a.email) as email,
coalesce(case when m.resposta is not null then m.resposta='sim' else r.confirmado end,false) as confirmado,
coalesce(m.resposta,r.ultima_resposta) as resposta
from public.vw_represado_elegiveis_base r
left join public.fato_contatos c on c.cpf=r.aluno_id
left join lateral (select x.email from public.dim_alunos x where x.cpf_norm=r.aluno_id limit 1) a on true
left join public.pedagogico_represado_respostas m on m.aluno_id=r.aluno_id and m.turma_id=r.turma_id;
revoke all on public.vw_turma_represados_envio_base from public,anon,authenticated;
grant select on public.vw_turma_represados_envio_base to service_role;
CREATE OR REPLACE FUNCTION public.disparar_turma_represados(p_turma_id text, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.dim_turmas;
  v_faltando text[] := '{}';
  v_enfileirados int;
  v_sem_contato int;
begin
  if not public.pode_ver('pedagogico') then raise exception 'Sem permissão'; end if;
  if p_tipo not in ('confirmacao', 'grupo') then raise exception 'Tipo inválido: use confirmacao ou grupo'; end if;
  select * into v_t from public.dim_turmas where turma_id = p_turma_id;
  if not found then raise exception 'Turma não encontrada'; end if;
  if p_tipo = 'confirmacao' then
    if coalesce(v_t.horario_credenciamento, '') = '' then v_faltando := v_faltando || 'credenciamento'; end if;
    if coalesce(v_t.horario_inicio, '') = '' then v_faltando := v_faltando || 'horário de início'; end if;
    if coalesce(v_t.horario_fim, '') = '' then v_faltando := v_faltando || 'horário de fim'; end if;
  elsif coalesce(v_t.link_grupo, '') !~ '^https://chat\.whatsapp\.com/' then
    v_faltando := v_faltando || 'link do grupo';
  end if;
  if array_length(v_faltando, 1) > 0 then
    return jsonb_build_object('ok', false, 'faltando', v_faltando,
      'mensagem', 'Preencha antes: ' || array_to_string(v_faltando, ', '));
  end if;
  insert into public.pedagogico_envios (aluno_id, turma_id, origem, tipo, status, criado_em)
  select distinct vi.aluno_id, p_turma_id, 'prazo', p_tipo, 'pendente', now()
    from public.vw_turma_represados_envio_base vi
   where vi.turma_id = p_turma_id and (p_tipo <> 'confirmacao' or not vi.confirmado)
     and not exists (select 1 from public.pedagogico_envios e
       where e.aluno_id=vi.aluno_id and e.turma_id=p_turma_id and e.tipo=p_tipo)
     and not (p_tipo='grupo' and coalesce(vi.resposta,'')='nao')
     and not (p_tipo='grupo' and exists (select 1 from public.pedagogico_envios e
       where e.aluno_id=vi.aluno_id and e.turma_id=p_turma_id
         and e.tipo='confirmacao'
         and (e.resposta ilike 'n%o%' and e.resposta not ilike '%sim%')))
  on conflict (aluno_id,turma_id,tipo) do nothing;
  get diagnostics v_enfileirados = row_count;
  select count(*) into v_sem_contato from public.vw_turma_represados_envio_base vi
   where vi.turma_id=p_turma_id and coalesce(nullif(vi.telefone,''),nullif(vi.email,'')) is null;
  return jsonb_build_object('ok', true, 'enfileirados', v_enfileirados,
    'sem_contato', v_sem_contato,
    'mensagem', case when v_enfileirados=0 then 'Nenhum represado novo para enfileirar: confira os já confirmados ou com envio registrado.'
      else v_enfileirados || ' pessoas entram na próxima rodada de envio.' end);
end $function$;
revoke all on function public.disparar_turma_represados(text,text) from public,anon;
grant execute on function public.disparar_turma_represados(text,text) to authenticated,service_role;
create or replace view public.vw_turma_fila_envio as
with contatos as (
select aluno_id,turma_id,tipo,nome,telefone,email from public.vw_turma_inscritos_base
union all
select r.aluno_id,r.turma_id,tipo,r.nome,r.telefone,r.email
from public.vw_turma_represados_envio_base r
cross join (values ('confirmacao'::text),('grupo'::text)) tipos(tipo)
)
select e.aluno_id,e.tipo,vi.nome,public.normaliza_telefone(vi.telefone) as whatsapp,vi.email,
t.turma_id,t.curso,t.data_inicio,t.data_fim,t.horario_credenciamento,t.horario_inicio,t.horario_fim,t.local,t.link_grupo,
case when public.normaliza_telefone(vi.telefone) is not null then 'whatsapp'
when coalesce(vi.email,'')<>'' then 'email' else null end as canal
from public.pedagogico_envios e join public.dim_turmas t on t.turma_id=e.turma_id
join contatos vi on vi.aluno_id=e.aluno_id and vi.turma_id=e.turma_id and vi.tipo=e.tipo
where e.status='pendente' and e.tipo in ('confirmacao','grupo')
and coalesce(vi.telefone,vi.email) is not null;
notify pgrst,'reload schema';
commit;
