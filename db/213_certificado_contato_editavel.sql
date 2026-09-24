-- ============================================================
-- FebraHub · Migration 213 — Certificado: contato editável no link
--
-- Quando o presente não tem e-mail em dim_alunos, a Gisele precisa poder
-- digitar. O e-mail (e telefone) passam a ser guardados no certificado_link,
-- pra ficarem prontos pro disparo. O RPC ganha p_email/p_telefone.
-- ============================================================

alter table public.certificado_link add column if not exists email    text;
alter table public.certificado_link add column if not exists telefone text;

drop function if exists public.certificado_link(text,text,text,text,date,date,int);

create or replace function public.certificado_link(
  p_turma text, p_cpf text, p_nome text, p_curso text,
  p_ini date, p_fim date, p_carga int,
  p_email text default null, p_telefone text default null)
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
  insert into public.certificado_link (turma_id, cpf, nome, curso, periodo_ini, periodo_fim, carga_horaria, email, telefone)
  values (p_turma, p_cpf, p_nome, p_curso, p_ini, p_fim, p_carga,
          nullif(btrim(p_email), ''), nullif(btrim(p_telefone), ''))
  on conflict (turma_id, cpf) do update
    set nome = excluded.nome, curso = excluded.curso,
        periodo_ini = excluded.periodo_ini, periodo_fim = excluded.periodo_fim,
        carga_horaria = excluded.carga_horaria,
        email = excluded.email, telefone = excluded.telefone,
        atualizado_em = now()
  returning token into v_token;
  return v_token;
end $function$;

revoke execute on function public.certificado_link(text,text,text,text,date,date,int,text,text) from anon;
grant  execute on function public.certificado_link(text,text,text,text,date,date,int,text,text) to authenticated;

notify pgrst, 'reload schema';
