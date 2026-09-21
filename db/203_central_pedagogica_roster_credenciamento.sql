-- Central Pedagogica: o roster da turma e Credenciamento__c, nao apenas as
-- oportunidades vendidas pela unidade local. Isso inclui transferidos e
-- participantes vendidos por outras unidades, sem incluir compradores de lote.
begin;

create or replace view public.vw_turma_inscritos_base as
with roster_turmas as (
  select distinct d.nome as turma_id
    from public.dim_turma_salesforce d
    join public.fato_credenciamento_turma f on f.turma_id = d.turma_id
),
roster as (
  select distinct on (coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id), d.nome)
         d.nome as turma_id,
         t.curso,
         t.data_inicio,
         coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id) as aluno_id,
         coalesce(c.nome, f.nome_cliente, a.nome,
                  coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id)) as nome,
         coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone) as telefone,
         coalesce(c.email, nullif(m.email_cliente, ''), a.email) as email,
         case f.tipo_matricula_codigo
           when '1' then 'Matrícula'
           when '7' then 'CONSUMIDOR DE VAGAS'
           when '28' then 'CONSUMIDOR DE VAGAS'
           when '107' then 'Assinante CIS PASS ANUAL - GLOBAL'
           when '122' then 'Taxa de Transferência Isento'
           else coalesce(nullif(f.tipo_matricula, f.tipo_matricula_codigo),
                         f.tipo_matricula, f.tipo_matricula_codigo, 'Não informado')
         end as tipo_matricula
    from public.fato_credenciamento_turma f
    join public.dim_turma_salesforce d on d.turma_id = f.turma_id
    join public.dim_turmas t on t.turma_id = d.nome
    left join public.fato_contatos c on c.cpf = f.cpf_norm
    left join public.dim_alunos a on a.doc_norm = f.cpf_norm
    left join lateral (
      select b.telefone_cliente, b.email_cliente
        from public.fato_base_alunos b
       where b.aluno_id = f.cpf_norm
         and coalesce(nullif(b.telefone_cliente, ''), nullif(b.email_cliente, '')) is not null
       order by b.data_matricula desc nulls last
       limit 1
    ) m on true
   where f.elegivel
     and coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id) is not null
   order by coalesce(f.cpf_norm, f.cliente_id, f.credenciamento_id), d.nome,
            f.atualizado_salesforce_em desc nulls last
),
legado as (
  select distinct on (m.aluno_id, m.turma)
         m.turma as turma_id,
         t.curso,
         t.data_inicio,
         m.aluno_id,
         coalesce(c.nome, a.nome, m.aluno_id) as nome,
         coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone) as telefone,
         coalesce(c.email, nullif(m.email_cliente, ''), a.email) as email,
         m.tipo_matricula
    from public.fato_base_alunos m
    join public.dim_turmas t on t.turma_id = m.turma
    left join public.fato_contatos c on c.cpf = lpad(m.aluno_id, 11, '0')
    left join public.dim_alunos a on a.doc_norm = lpad(m.aluno_id, 11, '0')
   where m.status_matricula = 'Aprovada'
     and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
     and not exists (select 1 from roster_turmas rt where rt.turma_id = m.turma)
   order by m.aluno_id, m.turma, m.data_matricula desc nulls last
),
inscritos as (
  select * from roster
  union all
  select * from legado
)
select i.turma_id,
       i.curso,
       i.data_inicio,
       i.aluno_id,
       i.nome,
       i.telefone,
       i.email,
       i.tipo_matricula,
       tipos.tipo,
       e.status,
       e.enviado_em,
       e.resposta,
       e.respondido_em,
       e.resposta_origem,
       case
         when tipos.tipo = 'confirmacao' and conf.confirmado then 'confirmado'
         when e.aluno_id is null          then 'nao enfileirado'
         when e.status   = 'pendente'     then 'aguardando envio'
         when e.status   = 'erro'         then 'erro no envio'
         when e.resposta = 'sim'          then 'confirmado'
         when e.resposta = 'nao'          then 'nao vem'
         when e.resposta = 'sem_resposta' then 'sem resposta'
         else 'aguardando resposta'
       end as situacao,
       (coalesce(nullif(i.telefone, ''), nullif(i.email, '')) is null) as sem_contato
  from inscritos i
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join public.pedagogico_envios e
         on e.aluno_id = i.aluno_id and e.turma_id = i.turma_id and e.tipo = tipos.tipo
  left join lateral (
    select true as confirmado
      from public.pedagogico_confirmacoes pc
     where pc.aluno_id = i.aluno_id and pc.turma_id = i.turma_id
     limit 1
  ) conf on true
 where exists (
     select 1 from public.dim_cursos dc
      where public.norm_curso(dc.nome_curso) = public.norm_curso(i.curso)
        and dc.grade_pedagogico
   );

revoke all on public.vw_turma_inscritos_base from anon, authenticated;
grant select on public.vw_turma_inscritos_base to service_role;

create or replace view public.vw_turma_inscritos as
select *
  from public.vw_turma_inscritos_base
 where public.pode_ver('pedagogico');

comment on view public.vw_turma_inscritos is
  'Roster oficial por Credenciamento__c quando disponivel. Inclui vendas de outras unidades e transferidos; usa fato_base_alunos apenas como fallback.';

-- A versao anterior recalculava todo o roster uma vez para cada turma.
-- Agregar uma unica vez evita o carregamento infinito da Central.
create or replace view public.vw_turmas_central as
with metricas as (
  select vi.turma_id,
         count(*)                                                    as matriculados,
         count(*) filter (where vi.situacao = 'confirmado')          as confirmados,
         count(*) filter (where vi.situacao = 'nao vem')             as nao_vem,
         count(*) filter (where vi.situacao = 'sem resposta')        as sem_resposta,
         count(*) filter (where vi.situacao = 'aguardando resposta') as aguardando_resposta,
         count(*) filter (where vi.situacao = 'nao enfileirado')     as nao_enfileirados,
         count(*) filter (where vi.sem_contato)                      as sem_contato
    from public.vw_turma_inscritos_base vi
   where vi.tipo = 'confirmacao'
   group by vi.turma_id
)
select t.turma_id, t.curso, t.sigla, t.data_inicio, t.data_fim, t.cidade,
       t.horario_credenciamento, t.horario_inicio, t.horario_fim, t.local,
       t.capacidade, t.nome_comercial, t.link_grupo,
       (t.data_inicio >= current_date) as futura,
       (coalesce(t.horario_credenciamento, '') <> ''
        and coalesce(t.horario_inicio, '') <> ''
        and coalesce(t.horario_fim, '') <> '') as pode_confirmar,
       (coalesce(t.link_grupo, '') ~ '^https://chat\.whatsapp\.com/') as pode_grupo,
       coalesce(i.matriculados, 0) as matriculados,
       coalesce(i.confirmados, 0) as confirmados,
       coalesce(i.nao_vem, 0) as nao_vem,
       coalesce(i.sem_resposta, 0) as sem_resposta,
       coalesce(i.aguardando_resposta, 0) as aguardando_resposta,
       coalesce(i.nao_enfileirados, 0) as nao_enfileirados,
       coalesce(i.sem_contato, 0) as sem_contato
  from public.dim_turmas t
  left join metricas i on i.turma_id = t.turma_id
 where public.pode_ver('pedagogico')
   and exists (
     select 1 from public.dim_cursos dc
      where public.norm_curso(dc.nome_curso) = public.norm_curso(t.curso)
        and dc.grade_pedagogico
   );

grant select on public.vw_turmas_central to authenticated;

create or replace function public.disparar_turma(p_turma_id text, p_tipo text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  select distinct vi.aluno_id, p_turma_id, 'alocacao', p_tipo, 'pendente', now()
    from public.vw_turma_inscritos_base vi
   where vi.turma_id = p_turma_id and vi.tipo = 'confirmacao'
     and not exists (select 1 from public.pedagogico_envios e
       where e.aluno_id=vi.aluno_id and e.turma_id=p_turma_id and e.tipo=p_tipo)
     and not (p_tipo='grupo' and exists (select 1 from public.pedagogico_envios e
       where e.aluno_id=vi.aluno_id and e.turma_id=p_turma_id
         and e.tipo='confirmacao'
         and (e.resposta ilike 'n%o%' and e.resposta not ilike '%sim%')));
  get diagnostics v_enfileirados = row_count;
  select count(*) into v_sem_contato from public.vw_turma_inscritos_base vi
   where vi.turma_id=p_turma_id and vi.tipo=p_tipo and vi.sem_contato;
  return jsonb_build_object('ok', true, 'enfileirados', v_enfileirados,
    'sem_contato', v_sem_contato,
    'mensagem', case when v_enfileirados=0 then 'Todos já receberam esta mensagem.'
      else v_enfileirados || ' pessoas entram na próxima rodada de envio.' end);
end $$;

revoke execute on function public.disparar_turma(text,text) from anon;

create or replace view public.vw_turma_fila_envio as
select e.aluno_id, e.tipo, vi.nome,
       public.normaliza_telefone(vi.telefone) as whatsapp, vi.email,
       t.turma_id, t.curso, t.data_inicio, t.data_fim,
       t.horario_credenciamento, t.horario_inicio, t.horario_fim,
       t.local, t.link_grupo,
       case when public.normaliza_telefone(vi.telefone) is not null then 'whatsapp'
            when coalesce(vi.email, '') <> '' then 'email' end as canal
  from public.pedagogico_envios e
  join public.dim_turmas t on t.turma_id=e.turma_id
  join public.vw_turma_inscritos_base vi
    on vi.aluno_id=e.aluno_id and vi.turma_id=e.turma_id and vi.tipo=e.tipo
 where e.status='pendente' and e.tipo in ('confirmacao','grupo')
   and coalesce(vi.telefone, vi.email) is not null;

grant select on public.vw_turma_inscritos, public.vw_turma_fila_envio to authenticated;
notify pgrst, 'reload schema';
commit;

-- Validacao:
-- select matriculados from vw_turmas_central where turma_id='2026 - CIS-GL252';
-- Deve acompanhar o roster elegivel atual (33 em 21/09/2026).
