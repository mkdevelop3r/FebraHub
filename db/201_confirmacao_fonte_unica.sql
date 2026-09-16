-- ============================================================
-- 201 — CONFIRMACAO E ENVIO SAO COISAS DIFERENTES
--
-- pedagogico_envios responde "a mensagem saiu?". Esta tabela responde
-- "por onde sabemos que a pessoa confirmou?". Misturar as duas perguntas fez
-- 137 respostas = sim aparecerem como 67 confirmados quando 70 mensagens ainda
-- estavam pendentes.
--
-- Uma pessoa pode ter mais de uma evidencia (CRM e grupo, por exemplo). A
-- chave inclui a origem para preservar essa historia. Para contar confirmado,
-- basta existir uma evidencia para aluno + turma.
-- ============================================================

begin;

create table if not exists public.pedagogico_confirmacoes (
  aluno_id       text        not null,
  turma_id       text        not null references public.dim_turmas(turma_id),
  origem         text        not null,
  confirmado_em  timestamptz not null default now(),
  telefone       text,
  detalhes       jsonb       not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  primary key (aluno_id, turma_id, origem),
  constraint pedagogico_confirmacoes_origem_check
    check (origem in ('crm', 'manual', 'grupo_whatsapp', 'importacao'))
);

create index if not exists idx_pedagogico_confirmacoes_turma
  on public.pedagogico_confirmacoes (turma_id, aluno_id);

comment on table public.pedagogico_confirmacoes is
  'Evidencias de confirmacao, separadas do envio. CRM, marcacao manual, '
  'entrada no grupo e importacao podem coexistir para a mesma pessoa.';

alter table public.pedagogico_confirmacoes enable row level security;
drop policy if exists pedagogico_confirmacoes_leitura on public.pedagogico_confirmacoes;
create policy pedagogico_confirmacoes_leitura on public.pedagogico_confirmacoes
  for select to authenticated using (public.pode_ver('pedagogico'));
revoke all on public.pedagogico_confirmacoes from anon;
grant select on public.pedagogico_confirmacoes to authenticated;
grant select, insert, update, delete on public.pedagogico_confirmacoes to service_role;


-- Toda resposta positiva que ja passa pelo fluxo atual alimenta a fonte nova.
-- SECURITY DEFINER permite que marcar_resposta() continue sendo a unica porta
-- da tela, sem abrir INSERT direto da tabela para usuarios autenticados.
create or replace function public.sincronizar_confirmacao_do_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem_nova text;
  v_origem_antiga text;
begin
  v_origem_nova := case
    when new.resposta_origem = 'hub' then 'manual'
    when new.resposta_origem = 'crm' then 'crm'
    else 'crm'
  end;

  if tg_op = 'UPDATE' then
    v_origem_antiga := case
      when old.resposta_origem = 'hub' then 'manual'
      when old.resposta_origem = 'crm' then 'crm'
      else 'crm'
    end;
    if old.resposta = 'sim'
       and (new.resposta is distinct from 'sim'
            or v_origem_antiga is distinct from v_origem_nova) then
      delete from public.pedagogico_confirmacoes
       where aluno_id = old.aluno_id
         and turma_id = old.turma_id
         and origem = v_origem_antiga;
    end if;
  end if;

  if new.resposta = 'sim'
     and new.tipo in ('confirmacao', 'prazo_vencendo') then
    insert into public.pedagogico_confirmacoes
      (aluno_id, turma_id, origem, confirmado_em, detalhes, atualizado_em)
    values
      (new.aluno_id, new.turma_id, v_origem_nova,
       coalesce(new.respondido_em, new.enviado_em, now()),
       jsonb_build_object('tipo_envio', new.tipo), now())
    on conflict (aluno_id, turma_id, origem) do update
      set confirmado_em = least(public.pedagogico_confirmacoes.confirmado_em,
                                 excluded.confirmado_em),
          detalhes = public.pedagogico_confirmacoes.detalhes || excluded.detalhes,
          atualizado_em = now();
  end if;
  return new;
end $$;

drop trigger if exists trg_pedagogico_envio_confirmacao on public.pedagogico_envios;
create trigger trg_pedagogico_envio_confirmacao
after insert or update of resposta, resposta_origem, respondido_em
on public.pedagogico_envios
for each row execute function public.sincronizar_confirmacao_do_envio();

-- Estado existente: nenhum confirmado some na virada.
insert into public.pedagogico_confirmacoes
  (aluno_id, turma_id, origem, confirmado_em, detalhes)
select e.aluno_id,
       e.turma_id,
       case when e.resposta_origem = 'hub' then 'manual' else 'crm' end,
       min(coalesce(e.respondido_em, e.enviado_em, e.criado_em, now())),
       jsonb_build_object('backfill', true)
  from public.pedagogico_envios e
 where e.resposta = 'sim'
   and e.tipo in ('confirmacao', 'prazo_vencendo')
 group by e.aluno_id, e.turma_id,
          case when e.resposta_origem = 'hub' then 'manual' else 'crm' end
on conflict (aluno_id, turma_id, origem) do nothing;


-- Mesmas colunas da view vigente. A unica mudanca deliberada e a precedencia:
-- evidencia de confirmacao vence status de envio pendente/erro.
create or replace view public.vw_turma_inscritos as
select distinct on (m.aluno_id, m.turma, tipos.tipo)
       t.turma_id,
       t.curso,
       t.data_inicio,
       m.aluno_id,
       coalesce(c.nome, a.nome, m.aluno_id) as nome,
       coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone) as telefone,
       coalesce(c.email, nullif(m.email_cliente, ''), a.email) as email,
       m.tipo_matricula,
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
       (coalesce(c.celular, nullif(m.telefone_cliente, ''), a.telefone,
                 c.email, nullif(m.email_cliente, ''), a.email) is null) as sem_contato
  from public.fato_base_alunos m
  join public.dim_turmas t on t.turma_id = m.turma
  cross join (values ('confirmacao'), ('grupo')) as tipos(tipo)
  left join public.fato_contatos c on c.cpf = lpad(m.aluno_id, 11, '0')
  left join public.dim_alunos a on a.doc_norm = lpad(m.aluno_id, 11, '0')
  left join public.pedagogico_envios e
         on e.aluno_id = m.aluno_id
        and e.turma_id = m.turma
        and e.tipo = tipos.tipo
  left join lateral (
    select true as confirmado
      from public.pedagogico_confirmacoes pc
     where pc.aluno_id = m.aluno_id
       and pc.turma_id = m.turma
     limit 1
  ) conf on true
 where m.status_matricula = 'Aprovada'
   and m.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and exists (
     select 1 from public.dim_cursos dc
      where public.norm_curso(dc.nome_curso) = public.norm_curso(t.curso)
        and dc.grade_pedagogico
   )
   and public.pode_ver('pedagogico')
 order by m.aluno_id, m.turma, tipos.tipo, m.data_matricula desc nulls last;


create or replace view public.vw_confirmacoes_turma_origem as
select pc.turma_id,
       pc.origem,
       count(distinct pc.aluno_id) as confirmados,
       min(pc.confirmado_em) as primeira_confirmacao,
       max(pc.confirmado_em) as ultima_confirmacao
  from public.pedagogico_confirmacoes pc
 where public.pode_ver('pedagogico')
 group by pc.turma_id, pc.origem;

grant select on public.vw_turma_inscritos,
                public.vw_confirmacoes_turma_origem to authenticated;

notify pgrst, 'reload schema';
commit;

-- Validacao esperada para IF36 depois de aplicar:
-- select origem, count(*) from pedagogico_confirmacoes
--  where turma_id = '2026 - IF36' group by 1;
-- select confirmados from vw_turmas_central where turma_id = '2026 - IF36';

