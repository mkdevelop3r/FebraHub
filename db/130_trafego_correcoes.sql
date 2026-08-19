-- ============================================================
-- 130_trafego_correcoes.sql
-- Correções da 128 (Fase 4 — Tráfego), medidas contra o banco em 19/08/2026.
--
-- A 128 está APLICADA. O que ela desenhou está certo; o que segue são
-- cinco pontos onde o código não fazia o que o comentário dizia.
--
--   1. concluida_em era código morto — o trigger da 121 sobrescrevia.
--      Prova: as 5 ações automáticas concluídas tinham todas
--      concluida_em = 2026-08-18 20:13:47.708622+00 (idêntico ao
--      microssegundo, o instante do sync), enquanto a campanha começou
--      em 14/08. A vw_mkt_lead_time_acoes calcula lead time desse campo.
--   2. A desmarcação não olhava a data do evento. Como toda campanha
--      encerra, o checklist de um evento passado voltaria a ficar em
--      branco. Hoje não dói (o evento mais antigo com ação automática é
--      01/09); passaria a doer em 02/09.
--   3. O update pegava TODA ação com conclusao='automatica'. Funciona
--      hoje por só existir um nome automático no catálogo ("Rodando no
--      tráfego", 16 linhas). A segunda ação automática quebraria as duas.
--   4. mkt_casa_campanhas casava 0 de 59 campanhas e ninguém via, porque
--      o retorno não é conferido. Aqui ela fica determinística e para de
--      atropelar campanha já triada; o casamento em si continua sem
--      acontecer — o código do evento (PALESTRA-SET26-SSA-2) não existe
--      no nome da campanha ([EG][$]Do zero ao investimento). Isso é
--      decisão de processo, não de SQL, e não está nesta migration.
--   5. Campanha triada como 'sem_evento' (mkt_vincula_campanha com
--      p_evento_id null) voltava para a fila todo dia: a view filtrava
--      só por evento_id is null.
--
-- Fora de escopo, de propósito:
--   - security_invoker / revoke anon nas views vw_mkt_*: dívida do banco
--     inteiro (157 das 163 views são legíveis por anon), vai junto com a 119.
--   - a tela de vínculo campanha↔evento: depende da decisão do item 4.
-- ============================================================


-- ---------- 1. O TRIGGER PASSA A RESPEITAR CARIMBO EXPLÍCITO ----------
-- Antes: qualquer UPDATE que ligasse `concluida` recebia now(), mesmo
-- tendo trazido a data certa. Agora now() é só o padrão de quem não
-- informou nada — que continua sendo o caso do mkt_marcar_acao (123).
create or replace function fn_mkt_marca_conclusao() returns trigger
language plpgsql as $$
begin
  if new.concluida and not old.concluida then
    if new.concluida_em is not distinct from old.concluida_em then
      new.concluida_em := now();
    end if;
    new.concluida_por := coalesce(new.concluida_por, auth.uid());
  elsif not new.concluida and old.concluida then
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end $$;
-- O trigger trg_mkt_marca_conclusao (121) continua o mesmo; só o corpo mudou.


-- ---------- 2. QUAL AÇÃO O SISTEMA MARCA SOZINHO ----------
-- 'automatica' diz QUE alguém marca por você; não diz QUEM. Sem isso, o
-- sync do tráfego é dono de qualquer ação automática que venha a existir.
alter table mkt_templates_acao
  add column if not exists fonte_automacao text
  check (fonte_automacao is null or fonte_automacao in ('trafego'));

alter table mkt_acoes_evento
  add column if not exists fonte_automacao text
  check (fonte_automacao is null or fonte_automacao in ('trafego'));

-- Hoje as 3 automáticas do catálogo (Palestra, Treinamento, Workshop) são
-- todas de tráfego — é o que o comentário da 122 já registrava.
update mkt_templates_acao
   set fonte_automacao = 'trafego'
 where conclusao = 'automatica' and fonte_automacao is null;

update mkt_acoes_evento a
   set fonte_automacao = t.fonte_automacao
  from mkt_templates_acao t
 where t.id = a.template_acao_id
   and t.fonte_automacao is not null
   and a.fonte_automacao is distinct from t.fonte_automacao;

-- O gerador de checklist (121) passa a carregar a fonte para as ações novas.
create or replace function fn_mkt_gera_checklist() returns trigger
language plpgsql as $$
begin
  if new.tipo_evento_id is not null then
    if exists (select 1 from mkt_tipos_evento t
               where t.id = new.tipo_evento_id and t.gera_checklist) then
      insert into mkt_acoes_evento (evento_id, template_acao_id, nome,
                                    responsavel, prazo, conclusao, fonte_automacao)
      select new.id, t.id, t.nome, t.responsavel_padrao,
             new.data_evento - t.prazo_dias_antes, t.conclusao, t.fonte_automacao
      from mkt_templates_acao t
      where t.tipo_evento_id = new.tipo_evento_id;
      new.status := 'ativo';
    else
      new.status := 'sem_acoes';
    end if;
  end if;
  return new;
end $$;


-- ---------- 3. CASAMENTO DETERMINÍSTICO ----------
-- Três mudanças:
--   - strpos no lugar de LIKE: o código é dado editável e '_' ou '%'
--     dentro dele viraria curinga;
--   - só mexe em vinculo='automatico' — antes, o que fora triado como
--     'sem_evento' era re-vinculado no sync seguinte;
--   - campanha cujo nome cita DOIS códigos é ignorada em vez de receber
--     um evento arbitrário (UPDATE ... FROM escolhe qualquer linha).
--     Hoje não há nenhuma; quando houver, ela fica na fila de conferência.
create or replace function mkt_casa_campanhas() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with candidato as (
    select c.id as campanha_id,
           (array_agg(e.id))[1] as evento_id
      from mkt_campanhas_trafego c
      join mkt_eventos e on e.codigo is not null
       and strpos(upper(c.nome_campanha), upper(e.codigo)) > 0
     where c.vinculo = 'automatico'
     group by c.id
    having count(*) = 1
  )
  update mkt_campanhas_trafego c
     set evento_id = k.evento_id
    from candidato k
   where c.id = k.campanha_id
     and c.evento_id is distinct from k.evento_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- ---------- 4. MARCA E DESMARCA NUMA INSTRUÇÃO SÓ ----------
-- A 128 repetia a mesma CTE duas vezes. Aqui a situação é calculada uma
-- vez e o UPDATE devolve o que mudou.
--
-- A regra do Bruno ("enquanto não roda, está zerado") vale para o que
-- ainda vai acontecer. Evento que já passou nunca é desmarcado: a
-- campanha dele encerra, e o checklist é histórico — mesma escolha da 124,
-- que não reprazava ação concluída.
--
-- gasto_total continua sendo o gasto de toda a vida da campanha, não o
-- recente: campanha 'ativa' que parou de gastar segue contando como
-- rodando. Mudar isso é mudar a regra, não corrigir bug.
create or replace function mkt_atualiza_acao_trafego() returns text
language plpgsql security definer set search_path = public as $$
declare v_on bigint; v_off bigint;
begin
  with situacao as (
    select e.id as evento_id, e.data_evento,
           bool_or(c.status = 'ativa'
                   and coalesce(g.gasto_total, 0) > 0) as rodando,
           min(c.data_inicio) filter (where c.status = 'ativa'
                   and coalesce(g.gasto_total, 0) > 0) as inicio
      from mkt_eventos e
      left join mkt_campanhas_trafego c on c.evento_id = e.id
      left join lateral (
        select sum(s.gasto) as gasto_total
          from mkt_campanhas_snapshot_diario s
         where s.campanha_id = c.id
      ) g on true
     group by e.id, e.data_evento
  ),
  mudanca as (
    update mkt_acoes_evento a
       set concluida = coalesce(si.rodando, false),
           concluida_em = case when si.rodando
                               then coalesce(a.concluida_em, si.inicio::timestamptz, now())
                               else null end
      from situacao si
     where a.evento_id = si.evento_id
       and a.fonte_automacao = 'trafego'
       and a.concluida is distinct from coalesce(si.rodando, false)
       and (coalesce(si.rodando, false) or si.data_evento >= current_date)
    returning a.concluida
  )
  select count(*) filter (where concluida),
         count(*) filter (where not concluida)
    into v_on, v_off
    from mudanca;
  return format('trafego: %s marcadas · %s desmarcadas', v_on, v_off);
end $$;


-- ---------- 5. CONSERTO DOS CARIMBOS JÁ GRAVADOS ----------
-- As ações concluídas hoje dizem "concluída às 20:13 de 18/08" porque foi
-- quando o sync rodou. O certo é o dia em que a campanha começou a rodar.
-- (Este UPDATE não lista `concluida` no SET, então o trigger nem dispara.)
update mkt_acoes_evento a
   set concluida_em = ini.dt
  from (
    select e.id as evento_id, min(c.data_inicio)::timestamptz as dt
      from mkt_eventos e
      join mkt_campanhas_trafego c on c.evento_id = e.id and c.status = 'ativa'
     group by e.id
  ) ini
 where a.evento_id = ini.evento_id
   and a.fonte_automacao = 'trafego'
   and a.concluida
   and ini.dt is not null;


-- ---------- 6. A FILA DE CONFERÊNCIA RESPEITA A TRIAGEM ----------
-- mkt_vincula_campanha(campanha, null) grava vinculo='sem_evento'. A view
-- ignorava isso e a campanha institucional voltava para a fila no dia
-- seguinte, para sempre.
--
-- Medido no banco em 19/08 (na aplicação desta migration): a view viva já
-- tinha o filtro de vinculo E uma coluna data_fim que nem a 128 nem este
-- arquivo previam — alguém a substituiu direto, fora de migration. Este
-- bloco vira transcrição do que está aplicado, com data_fim mantida: sem
-- ela, o `create or replace` falha ("cannot drop columns from view") e
-- derruba a migration inteira.
create or replace view vw_mkt_campanhas_sem_evento as
select c.id, c.nome_campanha, c.status, c.data_inicio, c.data_fim,
       coalesce(sum(s.gasto), 0) as gasto_total
from mkt_campanhas_trafego c
left join mkt_campanhas_snapshot_diario s on s.campanha_id = c.id
where c.evento_id is null
  and c.vinculo <> 'sem_evento'
group by c.id, c.nome_campanha, c.status, c.data_inicio, c.data_fim
having coalesce(sum(s.gasto), 0) > 0
order by gasto_total desc;


-- ---------- 7. OS 6 VÍNCULOS QUE UMA PESSOA FEZ ----------
-- Foram gravados por UPDATE direto (não por mkt_vincula_campanha), então
-- ficaram com o default 'automatico' — indistinguíveis de casamento de
-- máquina, e reescrevíveis pelo sync. São decisão humana e conferida
-- ([EG][$]Do zero ao investimento -> Palestra do zero ao investimento).
update mkt_campanhas_trafego
   set vinculo = 'manual'
 where evento_id is not null and vinculo = 'automatico';


-- ---------- 8. QUEM PODE RODAR O SYNC ----------
-- A 128 revogou de `public` e `anon`, mas o Supabase concede EXECUTE
-- direto a `authenticated` ao criar a função — revogar de public não tira
-- isso. Resultado hoje: qualquer usuário logado, de qualquer setor, pode
-- reescrever vínculos e ligar/desligar checkboxes de todos os eventos.
-- mkt_vincula_campanha chama mkt_atualiza_acao_trafego por dentro; como é
-- security definer, ela continua funcionando sem o grant.
revoke execute on function mkt_casa_campanhas()        from public, anon, authenticated;
revoke execute on function mkt_atualiza_acao_trafego() from public, anon, authenticated;
revoke execute on function mkt_sincroniza_trafego()    from public, anon, authenticated;
grant  execute on function mkt_sincroniza_trafego()    to service_role;

notify pgrst, 'reload schema';
