-- ============================================================
-- FebraHub · Migration 212 — Certificados (fundação)
--
-- Aba de Certificados na Central Pedagógica. A partir da PRESENÇA de uma turma
-- encerrada (fato_presenca), a Elis enfileira e dispara certificados por
-- WhatsApp/e-mail (via Black CRM) e pode baixar o PDF. O PDF NÃO é guardado:
-- é gerado na hora por uma Edge Function a partir de um token.
--
-- Aqui ficam: (1) carga horária por curso (casada por padrão, editável),
-- (2) a tabela de LINKS (token -> conteúdo do certificado; guarda só o TEXTO,
-- nunca o PDF) + RPC que cria/atualiza o token, (3) views de turmas encerradas
-- e presentes com os campos pré-preenchidos.
-- ============================================================

-- 1) Carga horária por curso — padrão ilike, escolhe o de menor `ordem`.
create table if not exists public.curso_carga_horaria (
  padrao text primary key,
  horas  int  not null,
  rotulo text,
  ordem  int  not null default 100
);

insert into public.curso_carga_horaria (padrao, horas, rotulo, ordem) values
  ('%COACHING INTEGRAL SIST%', 472, 'FCIS', 1),
  ('%ML5%',                    248, 'ML5', 2),
  ('%MASTER COACHING%',        202, 'MASTER', 3),
  ('%TODO CIS%',                60, 'MÉTODO CIS', 4),
  ('%INTELIG%FINANC%',          30, 'IF', 5),
  ('%ORADORES%',                30, 'FOP', 6),
  ('%HIGH PERFORMANCE%',        40, 'BHP', 7),
  ('%PLANEJAMENTO ESTRAT%',     40, 'Planejamento Estratégico', 8),
  ('%INTERCOACHING%',           30, 'Intercoaching', 9),
  ('%CNICAS DE VENDAS%',        20, 'TV', 10),
  ('%IN COMPANY%',              30, 'CIS In Company', 11),
  ('%PERFORMANCE E COMPORTAMENTO%', 30, 'FGPC', 12),
  ('%GROWTH%',                  30, 'Growth', 13),
  ('%CRESCIMENTO EMPRESARIAL%', 30, 'Growth (10 em 12)', 14),
  ('%SAUDE%',                   20, 'APS', 15),
  ('%MINDFULNESS%',             20, 'Mindfulness', 16)
on conflict (padrao) do update set horas = excluded.horas, rotulo = excluded.rotulo, ordem = excluded.ordem;

create or replace function public.carga_horaria_curso(p_curso text)
returns int language sql stable set search_path to 'public' as $function$
  select horas from public.curso_carga_horaria
   where p_curso ilike padrao
   order by ordem limit 1;
$function$;

-- 2) Links dos certificados: token -> conteúdo (só TEXTO, nunca o PDF).
--    Guarda os campos FINAIS (já com as edições da Elis), pra a Edge Function
--    gerar exatamente o que foi conferido e o mesmo link servir download e envio.
create table if not exists public.certificado_link (
  token         uuid primary key default gen_random_uuid(),
  turma_id      text not null,
  cpf           text not null,
  nome          text not null,
  curso         text not null,
  periodo_ini   date,
  periodo_fim   date,
  carga_horaria int,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (turma_id, cpf)
);
alter table public.certificado_link enable row level security;

create or replace function public.certificado_link(
  p_turma text, p_cpf text, p_nome text, p_curso text,
  p_ini date, p_fim date, p_carga int)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token uuid;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissao';
  end if;
  insert into public.certificado_link (turma_id, cpf, nome, curso, periodo_ini, periodo_fim, carga_horaria)
  values (p_turma, p_cpf, p_nome, p_curso, p_ini, p_fim, p_carga)
  on conflict (turma_id, cpf) do update
    set nome = excluded.nome, curso = excluded.curso,
        periodo_ini = excluded.periodo_ini, periodo_fim = excluded.periodo_fim,
        carga_horaria = excluded.carga_horaria, atualizado_em = now()
  returning token into v_token;
  return v_token;
end $function$;

revoke execute on function public.certificado_link(text,text,text,text,date,date,int) from anon;
grant  execute on function public.certificado_link(text,text,text,text,date,date,int) to authenticated;

-- 3) Turmas encerradas (com nº de presentes) e presentes com campos pré-preenchidos.
create or replace view public.vw_certificado_turmas as
select t.turma_id, t.curso, t.data_inicio, t.data_fim, t.cidade,
       count(distinct fp.cpf) as presentes
  from public.dim_turmas t
  join public.fato_presenca fp on fp.turma = t.turma_id
 where coalesce(t.data_fim, t.data_inicio) < current_date
   and pode_ver('pedagogico')
 group by t.turma_id, t.curso, t.data_inicio, t.data_fim, t.cidade;

create or replace view public.vw_certificado_presente as
select distinct
    fp.turma                                    as turma_id,
    fp.cpf,
    upper(coalesce(a.nome, fp.nome))            as nome,
    t.curso,
    t.data_inicio                               as periodo_ini,
    coalesce(t.data_fim, t.data_inicio)         as periodo_fim,
    public.carga_horaria_curso(t.curso)         as carga_horaria,
    a.email,
    a.telefone
  from public.fato_presenca fp
  join public.dim_turmas t on t.turma_id = fp.turma
  left join public.dim_alunos a
         on a.cpf_norm = lpad(regexp_replace(coalesce(fp.cpf, ''), '\D', '', 'g'), 11, '0')
 where pode_ver('pedagogico');

notify pgrst, 'reload schema';
