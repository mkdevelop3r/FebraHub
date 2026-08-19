-- ============================================================
-- 128_central_eventos_trafego.sql
-- Fase 4 — Tráfego: casamento campanha↔evento pelo código e
-- check automático da ação "Rodando no tráfego".
--
-- Regra do Bruno: "enquanto não está rodando no tráfego, aqui
-- está zerado". Ninguém marca essa ação na mão — o sync marca.
-- ============================================================

-- ---------- 1. AJUSTES NAS TABELAS DE TRÁFEGO ----------
alter table mkt_campanhas_trafego
  add column if not exists conta_id   text,   -- act_XXXX do Meta
  add column if not exists objetivo   text,
  add column if not exists vinculo    text not null default 'automatico'
    check (vinculo in ('automatico','manual','sem_evento'));
-- 'manual' = alguém vinculou na mão; o sync NUNCA sobrescreve esses.

create index if not exists ix_mkt_camp_evento on mkt_campanhas_trafego (evento_id);

-- ---------- 2. CASAMENTO CAMPANHA -> EVENTO PELO CÓDIGO ----------
-- O código (FGPC-DEZ26-SSA) vai no nome da campanha no gerenciador.
-- Case-insensitive; ignora campanhas já vinculadas na mão.
create or replace function mkt_casa_campanhas() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update mkt_campanhas_trafego c
     set evento_id = e.id, vinculo = 'automatico'
    from mkt_eventos e
   where c.vinculo <> 'manual'
     and c.evento_id is distinct from e.id
     and e.codigo is not null
     and upper(c.nome_campanha) like '%' || upper(e.codigo) || '%';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- 3. CHECK AUTOMÁTICO DA AÇÃO DE TRÁFEGO ----------
-- Marca quando existe campanha ATIVA vinculada com gasto > 0.
-- Desmarca se a campanha parou (o painel volta a ficar zerado —
-- exatamente o comportamento pedido).
create or replace function mkt_atualiza_acao_trafego() returns text
language plpgsql security definer set search_path = public as $$
declare v_on int; v_off int;
begin
  with situacao as (
    select e.id as evento_id,
           bool_or(c.status = 'ativa'
                   and coalesce(g.gasto_total, 0) > 0) as rodando,
           min(c.data_inicio) filter (where c.status = 'ativa') as inicio
    from mkt_eventos e
    left join mkt_campanhas_trafego c on c.evento_id = e.id
    left join lateral (
      select sum(s.gasto) as gasto_total
      from mkt_campanhas_snapshot_diario s
      where s.campanha_id = c.id
    ) g on true
    group by e.id
  )
  update mkt_acoes_evento a
     set concluida = true,
         concluida_em = coalesce(a.concluida_em,
                                 coalesce(si.inicio::timestamptz, now()))
    from situacao si
   where a.evento_id = si.evento_id
     and a.conclusao = 'automatica'
     and si.rodando
     and not a.concluida;
  get diagnostics v_on = row_count;

  with situacao as (
    select e.id as evento_id,
           bool_or(c.status = 'ativa'
                   and coalesce(g.gasto_total, 0) > 0) as rodando
    from mkt_eventos e
    left join mkt_campanhas_trafego c on c.evento_id = e.id
    left join lateral (
      select sum(s.gasto) as gasto_total
      from mkt_campanhas_snapshot_diario s
      where s.campanha_id = c.id
    ) g on true
    group by e.id
  )
  update mkt_acoes_evento a
     set concluida = false, concluida_em = null
    from situacao si
   where a.evento_id = si.evento_id
     and a.conclusao = 'automatica'
     and coalesce(si.rodando, false) = false
     and a.concluida;
  get diagnostics v_off = row_count;

  return format('trafego: %s marcadas · %s desmarcadas', v_on, v_off);
end $$;

-- ---------- 4. ROTINA ÚNICA (o ETL chama só esta) ----------
create or replace function mkt_sincroniza_trafego() returns text
language plpgsql security definer set search_path = public as $$
declare v_casadas int; v_acoes text;
begin
  v_casadas := mkt_casa_campanhas();
  v_acoes := mkt_atualiza_acao_trafego();
  return format('campanhas casadas %s · %s', v_casadas, v_acoes);
end $$;

revoke all on function mkt_casa_campanhas()        from public, anon;
revoke all on function mkt_atualiza_acao_trafego() from public, anon;
revoke all on function mkt_sincroniza_trafego()    from public, anon;
grant execute on function mkt_sincroniza_trafego() to service_role;

-- ---------- 5. VISÕES DE ACOMPANHAMENTO ----------
-- Substitui a vw_mkt_trafego_evento do 121 (agora com dias rodando,
-- CPL e a data de início — o "quando começou a rodar" do Bruno).
drop view if exists vw_mkt_trafego_evento;
create view vw_mkt_trafego_evento as
select e.id as evento_id, e.nome, e.codigo, e.data_evento,
       count(distinct c.id)                as campanhas,
       min(c.data_inicio)                  as trafego_inicio,
       coalesce(sum(s.gasto), 0)           as gasto_total,
       coalesce(sum(s.leads), 0)           as leads_trafego,
       case when sum(s.leads) > 0
            then round(sum(s.gasto)/sum(s.leads), 2) end as custo_por_lead,
       bool_or(c.status = 'ativa')         as rodando_agora,
       greatest(0, e.data_evento - min(c.data_inicio)) as dias_rodando_ate_evento
from mkt_eventos e
left join mkt_campanhas_trafego c on c.evento_id = e.id
left join mkt_campanhas_snapshot_diario s on s.campanha_id = c.id
group by e.id, e.nome, e.codigo, e.data_evento;

-- Fila de conferência: campanha gastando sem evento vinculado
-- (ou o código não foi posto no nome, ou é campanha institucional).
create or replace view vw_mkt_campanhas_sem_evento as
select c.id, c.nome_campanha, c.status, c.data_inicio,
       coalesce(sum(s.gasto), 0) as gasto_total
from mkt_campanhas_trafego c
left join mkt_campanhas_snapshot_diario s on s.campanha_id = c.id
where c.evento_id is null
group by c.id, c.nome_campanha, c.status, c.data_inicio
having coalesce(sum(s.gasto), 0) > 0
order by 5 desc;

-- Série diária por evento — matéria-prima do preditivo (Fase 7).
create or replace view vw_mkt_trafego_diario as
select e.id as evento_id, e.nome, s.dia, sum(s.gasto) as gasto,
       sum(s.leads) as leads,
       (e.data_evento - s.dia) as dias_para_evento
from mkt_eventos e
join mkt_campanhas_trafego c on c.evento_id = e.id
join mkt_campanhas_snapshot_diario s on s.campanha_id = c.id
group by e.id, e.nome, s.dia, e.data_evento;
