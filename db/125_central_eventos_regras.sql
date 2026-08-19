-- ============================================================
-- 125_central_eventos_regras.sql
-- Aprendizados da 1ª rodada real do sync (85 eventos, 78 criados):
--   1. Regras de classificação por padrão de nome — classifica uma
--      vez, vale pra sempre (inclusive recorrentes).
--   2. Correção do gerador de código: translitera acentos
--      (CONFERÊNCIA -> CONFERENCIA, não CONFERNCIA).
--   3. Aplicação em lote nos 78 pendentes já criados.
-- ============================================================

-- ---------- 1. REGRAS DE CLASSIFICAÇÃO ----------
-- tipo_evento_id = null  →  'ignorar' (vira sem_acoes, sem perguntar)
-- Padrão é ILIKE ('%' = curinga). Regra mais específica (mais longa) vence.
create table mkt_regras_classificacao (
  id             uuid primary key default gen_random_uuid(),
  padrao         text not null,
  tipo_evento_id uuid references mkt_tipos_evento(id),
  observacao     text,
  ativa          boolean not null default true
);

insert into mkt_regras_classificacao (padrao, tipo_evento_id, observacao) values
  ('Reuniao com os Treinadores%',      null, 'reunião interna recorrente (semanal)'),
  ('Reunião estratégica com Recife%',  null, 'reunião interna recorrente (semanal)'),
  ('Mentoria %',                       null, 'mentorias não são eventos de marketing'),
  ('MENTORIA %',                       null, 'idem, variação em caixa alta'),
  ('VIAGEM %',                         null, 'compromisso, não evento'),
  ('FOP%', (select id from mkt_tipos_evento where nome = 'Treinamento'),
                                             'FOP é treinamento — citado pelo Bruno na reunião');
-- Ajuste/adicione pelo Table editor. Desativar = ativa=false, nunca delete
-- (histórico de por que algo foi classificado).

-- ---------- 2. CLASSIFICAÇÃO SEM CHECAGEM DE PAPEL (uso interno) ----------
-- O 123 fez mkt_classificar_evento exigir gestor via auth.uid().
-- Sync e aplicação em lote rodam sem usuário logado — precisam de um
-- núcleo sem auth, que NINGUÉM de fora executa.
create or replace function mkt_aplicar_classificacao(
  p_evento_id uuid, p_tipo_evento_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_tipo_evento_id is null then
    update mkt_eventos set status = 'sem_acoes'
     where id = p_evento_id and status = 'pendente_classificacao';
    return;
  end if;

  update mkt_eventos set tipo_evento_id = p_tipo_evento_id
   where id = p_evento_id;

  if exists (select 1 from mkt_tipos_evento t
             where t.id = p_tipo_evento_id and t.gera_checklist) then
    insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                  responsavel, prazo, conclusao)
    select e.id, t.id, t.nome, t.responsavel_padrao,
           e.data_evento - t.prazo_dias_antes, t.conclusao
    from mkt_eventos e
    join mkt_templates_acao t on t.tipo_evento_id = p_tipo_evento_id
    where e.id = p_evento_id
      and not exists (select 1 from mkt_acoes_evento a
                      where a.evento_id = e.id);  -- nunca duplica checklist
    update mkt_eventos set status = 'ativo' where id = p_evento_id;
  else
    update mkt_eventos set status = 'sem_acoes' where id = p_evento_id;
  end if;
end $$;

revoke all on function mkt_aplicar_classificacao(uuid, uuid)
  from public, anon, authenticated;

-- O clique do Bruno continua com checagem de papel, agora delegando:
create or replace function mkt_classificar_evento(
  p_evento_id uuid, p_tipo_evento_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis p
                 where p.id = auth.uid() and p.gestor_marketing) then
    raise exception 'apenas o gestor de marketing classifica eventos';
  end if;
  if not exists (select 1 from mkt_eventos
                 where id = p_evento_id and status = 'pendente_classificacao') then
    raise exception 'evento não está pendente de classificação';
  end if;
  perform mkt_aplicar_classificacao(p_evento_id, p_tipo_evento_id);
end $$;

-- ---------- 3. GERADOR DE CÓDIGO: transliterar acentos ----------
create or replace function fn_mkt_gera_codigo() returns trigger
language plpgsql as $$
declare
  v_slug text;
  v_mes  text[] := array['JAN','FEV','MAR','ABR','MAI','JUN',
                         'JUL','AGO','SET','OUT','NOV','DEZ'];
  v_base text;
begin
  if new.codigo is not null then return new; end if;
  select upper(slug) into v_slug from mkt_unidades where id = new.unidade_id;
  v_base := upper(regexp_replace(
              translate(split_part(new.nome, ' ', 1),
                        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
              '[^A-Za-z0-9]', '', 'g'))
            || '-' || v_mes[extract(month from new.data_evento)::int]
            || substr(extract(year from new.data_evento)::text, 3, 2)
            || '-' || v_slug;
  new.codigo := v_base;
  while exists (select 1 from mkt_eventos e
                where e.codigo = new.codigo and e.id <> new.id) loop
    new.codigo := v_base || '-' ||
      (coalesce((select count(*) from mkt_eventos e2
                 where e2.codigo like v_base || '%'), 0) + 1)::text;
  end loop;
  return new;
end $$;

-- ---------- 4. APLICAR EM LOTE NOS PENDENTES DE HOJE ----------
-- Ordem: regra (mais específica primeiro) -> primeira palavra = tipo.
-- O que sobrar continua pendente — aí sim é fila do Bruno.
do $$
declare
  r record; v_regra record; v_tipo uuid;
begin
  for r in select id, nome from mkt_eventos
            where status = 'pendente_classificacao' loop

    select rc.tipo_evento_id, true as achou into v_regra
      from mkt_regras_classificacao rc
     where rc.ativa and r.nome ilike rc.padrao
     order by length(rc.padrao) desc limit 1;

    if found then
      perform mkt_aplicar_classificacao(r.id, v_regra.tipo_evento_id);
      continue;
    end if;

    select t.id into v_tipo
      from mkt_tipos_evento t
     where t.ativo and r.nome ~* ('^' || t.nome || '\y');
    if found then
      perform mkt_aplicar_classificacao(r.id, v_tipo);
    end if;
  end loop;
end $$;

-- ---------- 5. CONFERÊNCIA ----------
select status, count(*) from mkt_eventos group by status order by status;
