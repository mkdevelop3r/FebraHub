-- 203: Origem represada e confirmação são informações independentes.
-- APLICADA em 05/10/2026. Substitui a mistura introduzida pela 202.
-- Preserva as matrículas, envios e evidências do script atual.
begin;
create table if not exists public.pedagogico_represado_respostas (
 aluno_id text not null, turma_id text not null references public.dim_turmas(turma_id),
 resposta text not null check (resposta in ('sim','nao','sem_resposta')),
 respondido_em timestamptz not null default now(),
 registrado_por uuid references auth.users(id), primary key(aluno_id,turma_id)
);
alter table public.pedagogico_represado_respostas enable row level security;
revoke all on public.pedagogico_represado_respostas from anon, authenticated;
grant select,insert,update,delete on public.pedagogico_represado_respostas to service_role;

create or replace view public.vw_represado_elegiveis_base as
select r.* from ( SELECT f.cpf AS aluno_id,
    f.nome,
    f.telefone,
    f.curso,
    f.vence_em,
    f.dias_restantes,
    f.comprou_em,
    f.proxima_turma AS turma_id,
    f.proxima_turma_em,
    f.ja_transferiu,
    u.enviado_em AS ultimo_convite_em,
        CASE
            WHEN u.enviado_em IS NULL THEN NULL::integer
            ELSE CURRENT_DATE - u.enviado_em::date
        END AS dias_desde_o_convite,
    u.resposta AS ultima_resposta,
    f.telefone IS NOT NULL AS pode_disparar,
    cg.em IS NOT NULL OR u.resposta = 'sim'::text AS confirmado,
        CASE
            WHEN cg.por_grupo THEN 'grupo'::text
            WHEN cg.em IS NOT NULL THEN 'confirmacao'::text
            WHEN u.resposta = 'sim'::text THEN 'resposta'::text
            ELSE NULL::text
        END AS confirmado_origem
   FROM fila_prazo f
     LEFT JOIN LATERAL ( SELECT e.enviado_em,
            e.resposta
           FROM pedagogico_envios e
          WHERE e.aluno_id = f.cpf AND e.turma_id = f.proxima_turma AND (e.tipo = ANY (ARRAY['convite'::text, 'prazo_vencendo'::text])) AND e.status = 'aceito'::text
          ORDER BY e.enviado_em DESC
         LIMIT 1) u ON true
     LEFT JOIN LATERAL ( SELECT max(c.confirmado_em) AS em,
            bool_or(c.origem = 'grupo_whatsapp'::text) AS por_grupo
           FROM pedagogico_confirmacoes c
             WHERE lpad(c.aluno_id, 11, '0'::text) = lpad(regexp_replace(COALESCE(f.cpf, ''::text), '\D'::text, ''::text, 'g'::text), 11, '0'::text) AND c.turma_id = f.proxima_turma) cg ON true
  WHERE COALESCE(f.turma_da_venda, ''::text) !~~* '%LISBOA%'::text AND f.curso !~~* '%MAESTRIA%'::text AND f.situacao <> 'vencido'::text AND f.proxima_turma IS NOT NULL AND f.proxima_turma_em <= f.vence_em AND f.proxima_turma_em >= (now() AT TIME ZONE 'America/Bahia'::text)::date AND NOT (EXISTS ( SELECT 1
           FROM fato_credenciamento_turma ci
             JOIN dim_turma_salesforce ti ON ti.turma_id = ci.turma_id
          WHERE ci.cpf_norm = lpad(regexp_replace(COALESCE(f.cpf, ''::text), '\D'::text, ''::text, 'g'::text), 11, '0'::text) AND norm_curso(ti.curso_nome) = norm_curso(f.curso) AND NOT ci.elegivel AND NOT (EXISTS ( SELECT 1
                   FROM fato_credenciamento_turma ce
                     JOIN dim_turma_salesforce te ON te.turma_id = ce.turma_id
                  WHERE ce.cpf_norm = ci.cpf_norm AND norm_curso(te.curso_nome) = norm_curso(f.curso) AND ce.elegivel)))) ) r
where not exists (
 select 1 from public.fato_base_alunos m join public.dim_turmas t on t.turma_id=m.turma
 where m.aluno_id=r.aluno_id and public.norm_curso(m.curso_id)=public.norm_curso(r.curso)
 and m.status_matricula='Aprovada'
 and m.tipo_matricula not in ('COMPRADOR DE VAGAS','BÔNUS - COMPRADOR DE VAGAS')
 and t.data_inicio >= (now() at time zone 'America/Bahia')::date
)
and not exists (
 select 1 from public.fato_credenciamento_turma c join public.dim_turma_salesforce t on t.turma_id=c.turma_id
 where c.cpf_norm=lpad(r.aluno_id,11,'0')
 and public.norm_curso(t.curso_nome)=public.norm_curso(r.curso) and c.elegivel and c.credenciado
);
revoke all on public.vw_represado_elegiveis_base from anon,authenticated;
grant select on public.vw_represado_elegiveis_base to service_role;

create or replace view public.vw_represado_lista as
select r.aluno_id,r.nome,r.telefone,r.curso,r.vence_em,r.dias_restantes,r.comprou_em,
 r.turma_id,r.proxima_turma_em,r.ja_transferiu,r.ultimo_convite_em,r.dias_desde_o_convite,
 coalesce(m.resposta,r.ultima_resposta) as ultima_resposta,
 r.pode_disparar and not coalesce(case when m.resposta is not null then m.resposta='sim' else r.confirmado end,false) as pode_disparar,
 coalesce(case when m.resposta is not null then m.resposta='sim' else r.confirmado end,false) as confirmado,
 case when m.resposta='sim' then 'manual' when m.resposta is not null then null else r.confirmado_origem end as confirmado_origem
from public.vw_represado_elegiveis_base r
left join public.pedagogico_represado_respostas m on m.aluno_id=r.aluno_id and m.turma_id=r.turma_id
where public.pode_ver('pedagogico');

create or replace view public.vw_turma_inscritos_base as
select i.* from ( WITH roster_turmas AS (
         SELECT DISTINCT d.nome AS turma_id
           FROM dim_turma_salesforce d
             JOIN fato_credenciamento_turma f ON f.turma_id = d.turma_id
        ), roster AS (
         SELECT DISTINCT ON ((COALESCE(f.cpf_norm, f.cliente_id, f.credenciamento_id)), d.nome) d.nome AS turma_id,
            t.curso,
            t.data_inicio,
            COALESCE(f.cpf_norm, f.cliente_id, f.credenciamento_id) AS aluno_id,
            COALESCE(c.nome, f.nome_cliente, a.nome, COALESCE(f.cpf_norm, f.cliente_id, f.credenciamento_id)) AS nome,
            COALESCE(c.celular, NULLIF(f.telefone_cliente, ''::text), NULLIF(m.telefone_cliente, ''::text), a.telefone) AS telefone,
            COALESCE(c.email, NULLIF(f.email_cliente, ''::text), NULLIF(m.email_cliente, ''::text), a.email) AS email,
                CASE f.tipo_matricula_codigo
                    WHEN '1'::text THEN 'Matrícula'::text
                    WHEN '7'::text THEN 'CONSUMIDOR DE VAGAS'::text
                    WHEN '28'::text THEN 'CONSUMIDOR DE VAGAS'::text
                    WHEN '107'::text THEN 'Assinante CIS PASS ANUAL - GLOBAL'::text
                    WHEN '122'::text THEN 'Taxa de Transferência Isento'::text
                    ELSE COALESCE(NULLIF(f.tipo_matricula, f.tipo_matricula_codigo), f.tipo_matricula, f.tipo_matricula_codigo, 'Não informado'::text)
                END AS tipo_matricula
           FROM fato_credenciamento_turma f
             JOIN dim_turma_salesforce d ON d.turma_id = f.turma_id
             JOIN dim_turmas t ON t.turma_id = d.nome
             LEFT JOIN fato_contatos c ON c.cpf = f.cpf_norm
             LEFT JOIN dim_alunos a ON a.doc_norm = f.cpf_norm
             LEFT JOIN LATERAL ( SELECT b.telefone_cliente,
                    b.email_cliente
                   FROM fato_base_alunos b
                  WHERE b.aluno_id = f.cpf_norm AND COALESCE(NULLIF(b.telefone_cliente, ''::text), NULLIF(b.email_cliente, ''::text)) IS NOT NULL
                  ORDER BY b.data_matricula DESC NULLS LAST
                 LIMIT 1) m ON true
          WHERE f.elegivel AND COALESCE(f.cpf_norm, f.cliente_id, f.credenciamento_id) IS NOT NULL
          ORDER BY (COALESCE(f.cpf_norm, f.cliente_id, f.credenciamento_id)), d.nome, f.atualizado_salesforce_em DESC NULLS LAST
        ), legado AS (
         SELECT DISTINCT ON (m.aluno_id, m.turma) m.turma AS turma_id,
            t.curso,
            t.data_inicio,
            m.aluno_id,
            COALESCE(c.nome, a.nome, m.aluno_id) AS nome,
            COALESCE(c.celular, NULLIF(m.telefone_cliente, ''::text), a.telefone) AS telefone,
            COALESCE(c.email, NULLIF(m.email_cliente, ''::text), a.email) AS email,
            m.tipo_matricula
           FROM fato_base_alunos m
             JOIN dim_turmas t ON t.turma_id = m.turma
             LEFT JOIN fato_contatos c ON c.cpf = lpad(m.aluno_id, 11, '0'::text)
             LEFT JOIN dim_alunos a ON a.doc_norm = lpad(m.aluno_id, 11, '0'::text)
          WHERE m.status_matricula = 'Aprovada'::text AND (m.tipo_matricula <> ALL (ARRAY['COMPRADOR DE VAGAS'::text, 'BÔNUS - COMPRADOR DE VAGAS'::text])) AND NOT (EXISTS ( SELECT 1
                   FROM roster_turmas rt
                  WHERE rt.turma_id = m.turma))
          ORDER BY m.aluno_id, m.turma, m.data_matricula DESC NULLS LAST
        ), inscritos AS (
         SELECT roster.turma_id,
            roster.curso,
            roster.data_inicio,
            roster.aluno_id,
            roster.nome,
            roster.telefone,
            roster.email,
            roster.tipo_matricula
           FROM roster
        UNION ALL
         SELECT legado.turma_id,
            legado.curso,
            legado.data_inicio,
            legado.aluno_id,
            legado.nome,
            legado.telefone,
            legado.email,
            legado.tipo_matricula
           FROM legado
        )
 SELECT i.turma_id,
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
        CASE
            WHEN tipos.tipo = 'confirmacao'::text AND conf.confirmado THEN 'confirmado'::text
            WHEN e.aluno_id IS NULL THEN 'nao enfileirado'::text
            WHEN e.status = 'pendente'::text THEN 'aguardando envio'::text
            WHEN e.status = 'erro'::text THEN 'erro no envio'::text
            WHEN e.resposta = 'sim'::text THEN 'confirmado'::text
            WHEN e.resposta = 'nao'::text THEN 'nao vem'::text
            WHEN e.resposta = 'sem_resposta'::text THEN 'sem resposta'::text
            ELSE 'aguardando resposta'::text
        END AS situacao,
    COALESCE(NULLIF(i.telefone, ''::text), NULLIF(i.email, ''::text)) IS NULL AS sem_contato
   FROM inscritos i
     CROSS JOIN ( VALUES ('confirmacao'::text), ('grupo'::text)) tipos(tipo)
     LEFT JOIN pedagogico_envios e ON e.aluno_id = i.aluno_id AND e.turma_id = i.turma_id AND e.tipo = tipos.tipo
     LEFT JOIN LATERAL ( SELECT true AS confirmado
           FROM pedagogico_confirmacoes pc
          WHERE pc.aluno_id = i.aluno_id AND pc.turma_id = i.turma_id
         LIMIT 1) conf ON true
  WHERE (EXISTS ( SELECT 1
           FROM dim_cursos dc
          WHERE norm_curso(dc.nome_curso) = norm_curso(i.curso) AND dc.grade_pedagogico))) i
where not exists (select 1 from public.vw_represado_elegiveis_base r
 where r.aluno_id=i.aluno_id and r.turma_id=i.turma_id);

create or replace view public.vw_turma_represados as
select r.turma_id,r.curso,t.data_inicio,r.aluno_id,r.nome,r.telefone,
 coalesce(c.email,a.email) as email,'Represado'::text as tipo_matricula,
 tipos.tipo,e.status,e.enviado_em,
 case when tipos.tipo='confirmacao' then coalesce(m.resposta,e.resposta) else e.resposta end as resposta,
 case when tipos.tipo='confirmacao' then coalesce(m.respondido_em,e.respondido_em) else e.respondido_em end as respondido_em,
 case when tipos.tipo='confirmacao' and m.resposta is not null then 'hub' else e.resposta_origem end as resposta_origem,
 case
 when tipos.tipo='confirmacao' and m.resposta='nao' then 'nao vem'
 when tipos.tipo='confirmacao' and m.resposta='sem_resposta' then 'sem resposta'
 when tipos.tipo='confirmacao' and r.confirmado then 'confirmado'
 when e.resposta='sim' then 'confirmado'
 when e.resposta='nao' then 'nao vem'
 when e.resposta='sem_resposta' then 'sem resposta'
 when e.aluno_id is null then 'nao enfileirado'
 when e.status='pendente' then 'aguardando envio'
 when e.status='erro' then 'erro no envio'
 else 'aguardando resposta' end as situacao,
 coalesce(nullif(r.telefone,''),c.email,a.email) is null as sem_contato,
 r.confirmado_origem
from public.vw_represado_lista r join public.dim_turmas t on t.turma_id=r.turma_id
cross join (values ('confirmacao'),('grupo')) tipos(tipo)
left join public.fato_contatos c on c.cpf=r.aluno_id
left join lateral (select x.email from public.dim_alunos x where x.cpf_norm=r.aluno_id limit 1) a on true
left join public.pedagogico_represado_respostas m on m.aluno_id=r.aluno_id and m.turma_id=r.turma_id
left join public.pedagogico_envios e on e.aluno_id=r.aluno_id and e.turma_id=r.turma_id and e.tipo=tipos.tipo;
revoke all on public.vw_turma_represados from anon;
grant select on public.vw_turma_represados to authenticated,service_role;

create or replace function public.marcar_resposta_represado(p_aluno_id text,p_turma_id text,p_resposta text)
returns jsonb language plpgsql security definer set search_path=public as $rpc$
begin
 if not public.pode_ver('pedagogico') then raise exception 'Sem permissão'; end if;
 if p_resposta is null or p_resposta not in ('sim','nao','sem_resposta') then raise exception 'Resposta inválida'; end if;
 if not exists(select 1 from public.vw_represado_elegiveis_base r where r.aluno_id=p_aluno_id and r.turma_id=p_turma_id) then raise exception 'Represado não elegível para esta turma'; end if;
 insert into public.pedagogico_represado_respostas(aluno_id,turma_id,resposta,respondido_em,registrado_por)
 values(p_aluno_id,p_turma_id,p_resposta,now(),auth.uid())
 on conflict(aluno_id,turma_id) do update set resposta=excluded.resposta,respondido_em=excluded.respondido_em,registrado_por=excluded.registrado_por;
 update public.pedagogico_envios set resposta=p_resposta,respondido_em=now(),resposta_origem='hub'
 where aluno_id=p_aluno_id and turma_id=p_turma_id and tipo in ('confirmacao','prazo_vencendo');
 if p_resposta='sim' then
  insert into public.pedagogico_confirmacoes(aluno_id,turma_id,origem,detalhes)
  values(p_aluno_id,p_turma_id,'manual',jsonb_build_object('classificacao','represado'))
  on conflict(aluno_id,turma_id,origem) do update set atualizado_em=now();
 else
  delete from public.pedagogico_confirmacoes where aluno_id=p_aluno_id and turma_id=p_turma_id and origem='manual';
 end if;
 return jsonb_build_object('ok',true,'classificacao','represado');
end $rpc$;
revoke all on function public.marcar_resposta_represado(text,text,text) from public,anon;
grant execute on function public.marcar_resposta_represado(text,text,text) to authenticated,service_role;
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
     and not coalesce(r.confirmado, false)
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
notify pgrst,'reload schema';
commit;
