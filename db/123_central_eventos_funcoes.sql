-- ============================================================
-- 123_central_eventos_funcoes.sql
-- Escrita sensível via security definer + filas de notificação
-- (padrão do projeto: front nunca escreve direto em nada crítico)
-- ============================================================

-- ---------- 1. CÓDIGO DO EVENTO ----------
-- 'FOP-AGO26-SSA': primeira palavra do nome + mês/ano + unidade.
-- É o que a Luana cola no nome da campanha.
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
  v_base := upper(regexp_replace(split_part(new.nome, ' ', 1), '[^A-Za-z0-9]', '', 'g'))
            || '-' || v_mes[extract(month from new.data_evento)::int]
            || substr(extract(year from new.data_evento)::text, 3, 2)
            || '-' || v_slug;
  new.codigo := v_base;
  -- colisão (dois eventos de mesmo nome no mês): sufixo -2, -3...
  while exists (select 1 from mkt_eventos e
                where e.codigo = new.codigo and e.id <> new.id) loop
    new.codigo := v_base || '-' ||
      (coalesce((select count(*) from mkt_eventos e2
                 where e2.codigo like v_base || '%'), 0) + 1)::text;
  end loop;
  return new;
end $$;

create trigger trg_mkt_gera_codigo
  before insert on mkt_eventos
  for each row execute function fn_mkt_gera_codigo();

-- ---------- 2. CLASSIFICAR EVENTO PENDENTE ----------
-- O clique do Bruno na fila "Precisa de alguma coisa?".
-- p_tipo_evento_id = null  →  'não precisa de nada' (sem_acoes)
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

  if p_tipo_evento_id is null then
    update mkt_eventos set status = 'sem_acoes' where id = p_evento_id;
    return;
  end if;

  update mkt_eventos set tipo_evento_id = p_tipo_evento_id where id = p_evento_id;

  if exists (select 1 from mkt_tipos_evento t
             where t.id = p_tipo_evento_id and t.gera_checklist) then
    insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                  responsavel, prazo, conclusao)
    select e.id, t.id, t.nome, t.responsavel_padrao,
           e.data_evento - t.prazo_dias_antes, t.conclusao
    from mkt_eventos e
    join mkt_templates_acao t on t.tipo_evento_id = p_tipo_evento_id
    where e.id = p_evento_id;
    update mkt_eventos set status = 'ativo' where id = p_evento_id;
  else
    update mkt_eventos set status = 'sem_acoes' where id = p_evento_id;
  end if;
end $$;

-- ---------- 3. MARCAR/DESMARCAR CHECK ----------
-- Colaborador só mexe em ação MANUAL de evento da sua unidade.
-- Ação automática (tráfego) ninguém marca na mão — quem marca é o sync.
create or replace function mkt_marcar_acao(
  p_acao_id uuid, p_concluida boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_unidade uuid; v_conclusao text;
begin
  select e.unidade_id, a.conclusao into v_unidade, v_conclusao
  from mkt_acoes_evento a join mkt_eventos e on e.id = a.evento_id
  where a.id = p_acao_id;

  if v_unidade is null then raise exception 'ação não encontrada'; end if;
  if v_conclusao = 'automatica' then
    raise exception 'ação automática: o sistema marca sozinho';
  end if;
  if not exists (select 1 from perfis p
                 where p.id = auth.uid()
                   and (p.gestor_marketing or p.unidade_id = v_unidade)) then
    raise exception 'sem permissão nesta unidade';
  end if;

  update mkt_acoes_evento set concluida = p_concluida where id = p_acao_id;
  -- concluida_em/concluida_por: o trigger 121 cuida.
end $$;

-- ---------- 4. LANÇAR RESULTADO (Mara, num lugar só) ----------
create or replace function mkt_lancar_resultado(
  p_evento_id uuid,
  p_inscritos int default null, p_presentes int default null,
  p_vendas_pitch int default null, p_valor_pitch numeric default null,
  p_vendas_pos int default null,  p_valor_pos numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from perfis p join mkt_eventos e on e.id = p_evento_id
    where p.id = auth.uid()
      and (p.gestor_marketing or p.unidade_id = e.unidade_id)
  ) then
    raise exception 'sem permissão nesta unidade';
  end if;

  insert into mkt_resultados_evento as r
    (evento_id, inscritos, presentes, vendas_pitch, valor_pitch, vendas_pos, valor_pos)
  values
    (p_evento_id, p_inscritos, p_presentes, p_vendas_pitch, p_valor_pitch, p_vendas_pos, p_valor_pos)
  on conflict (evento_id) do update set
    inscritos     = coalesce(excluded.inscritos,     r.inscritos),
    presentes     = coalesce(excluded.presentes,     r.presentes),
    vendas_pitch  = coalesce(excluded.vendas_pitch,  r.vendas_pitch),
    valor_pitch   = coalesce(excluded.valor_pitch,   r.valor_pitch),
    vendas_pos    = coalesce(excluded.vendas_pos,    r.vendas_pos),
    valor_pos     = coalesce(excluded.valor_pos,     r.valor_pos),
    atualizado_em = now();
end $$;

-- ---------- 5. PERMISSÕES DE EXECUÇÃO ----------
revoke all on function mkt_classificar_evento(uuid, uuid) from public, anon;
revoke all on function mkt_marcar_acao(uuid, boolean)     from public, anon;
revoke all on function mkt_lancar_resultado(uuid,int,int,int,numeric,int,numeric)
  from public, anon;
grant execute on function mkt_classificar_evento(uuid, uuid) to authenticated;
grant execute on function mkt_marcar_acao(uuid, boolean)     to authenticated;
grant execute on function mkt_lancar_resultado(uuid,int,int,int,numeric,int,numeric)
  to authenticated;

-- Leitura das demais tabelas segue o padrão do 121:
create policy sel_mkt_acoes on mkt_acoes_evento for select using (
  exists (select 1 from perfis p join mkt_eventos e on e.id = mkt_acoes_evento.evento_id
          where p.id = auth.uid()
            and (p.gestor_marketing or p.unidade_id = e.unidade_id))
);
create policy sel_mkt_campanhas on mkt_campanhas_trafego for select using (
  exists (select 1 from perfis p where p.id = auth.uid()
            and p.setor in ('marketing','geral'))
);
create policy sel_mkt_leads on mkt_leads for select using (
  exists (select 1 from perfis p where p.id = auth.uid()
            and (p.gestor_marketing or p.unidade_id = mkt_leads.unidade_id))
);
create policy sel_mkt_resultados on mkt_resultados_evento for select using (
  exists (select 1 from perfis p join mkt_eventos e on e.id = mkt_resultados_evento.evento_id
          where p.id = auth.uid()
            and (p.gestor_marketing or p.unidade_id = e.unidade_id))
);

-- ---------- 6. FILAS DE NOTIFICAÇÃO (WhatsApp — Fase 6) ----------
-- Mesmo desenho do pedagógico: view = fila; o script lê, aplica a
-- tag no CRM e SÓ ENTÃO registra em mkt_notificacoes_enviadas.

-- 6.1 Convite ao treinador: evento novo com ação de vídeo pendente
create view vw_mkt_fila_video_treinador as
select e.id as evento_id, e.nome as evento, e.data_evento, u.slug as unidade
from mkt_eventos e
join mkt_unidades u on u.id = e.unidade_id
join mkt_acoes_evento a on a.evento_id = e.id
where e.status = 'ativo'
  and a.nome = 'Vídeo do treinador' and not a.concluida
  and not exists (select 1 from mkt_notificacoes_enviadas n
                  where n.tipo = 'video_treinador' and n.referencia = e.id);

-- 6.2 Evento sem tipo: pergunta ao Bruno (1x por evento)
create view vw_mkt_fila_pendente_classificacao as
select e.id as evento_id, e.nome as evento, e.data_evento, u.slug as unidade
from mkt_eventos e
join mkt_unidades u on u.id = e.unidade_id
where e.status = 'pendente_classificacao'
  and not exists (select 1 from mkt_notificacoes_enviadas n
                  where n.tipo = 'pendente_classificacao' and n.referencia = e.id);

-- 6.3 Atraso crítico (3+ dias): responsável + Bruno, diária
create view vw_mkt_fila_atraso_critico as
select a.id as acao_id, a.nome as acao, a.responsavel,
       current_date - a.prazo as dias_atraso,
       e.nome as evento, e.data_evento, u.slug as unidade
from mkt_acoes_evento a
join mkt_eventos e on e.id = a.evento_id
join mkt_unidades u on u.id = e.unidade_id
where not a.concluida and e.status = 'ativo'
  and a.prazo <= current_date - 3
  and not exists (select 1 from mkt_notificacoes_enviadas n
                  where n.tipo = 'atraso_critico' and n.referencia = a.id
                    and n.enviada_em::date = current_date);

-- 6.4 D-2 com checklist incompleto: alerta ao Bruno
create view vw_mkt_fila_d2_incompleto as
select e.id as evento_id, e.nome as evento, e.data_evento, u.slug as unidade,
       string_agg(a.nome, ', ' order by a.prazo) as pendencias
from mkt_eventos e
join mkt_unidades u on u.id = e.unidade_id
join mkt_acoes_evento a on a.evento_id = e.id and not a.concluida
where e.status = 'ativo'
  and e.data_evento = current_date + 2
  and not exists (select 1 from mkt_notificacoes_enviadas n
                  where n.tipo = 'd2_incompleto' and n.referencia = e.id
                    and n.enviada_em::date = current_date)
group by e.id, e.nome, e.data_evento, u.slug;
