-- ============================================================
-- 111 — REPRESADOS: A LISTA E O DISPARO
--
-- APLICADO. Este arquivo foi RECONSTRUÍDO a partir do banco em
-- 13/08/2026 (pg_get_viewdef / pg_get_functiondef): a migration
-- original nunca foi salva em db/, e os dois objetos existiam só
-- em produção. Fonte da verdade sem o arquivo mais importante da
-- seção não é fonte da verdade.
--
-- Se o texto aqui divergir do banco, o banco está certo — mas
-- então este arquivo está desatualizado e alguém rodou SQL fora
-- do db/ de novo.
--
-- O QUE É REPRESADO
--
-- Quem comprou, tem prazo correndo (`situacao = 'vencendo'` na
-- fila_prazo) e tem turma disponível ANTES do vencimento
-- (`proxima_turma_em <= vence_em`). Dá para resolver: existe vaga
-- em tempo. Sem turma antes do prazo não é represado, é problema
-- de calendário.
--
-- EXCLUSÕES QUE PARECEM ARBITRÁRIAS E NÃO SÃO
--
--   LISBOA    turma de fora; o convite não se aplica
--   MAESTRIA  produto de outra natureza, não entra no fluxo
--
-- POR QUE O DISPARO É MANUAL
--
-- O sistema não sabe quem já foi chamado pelo WhatsApp da
-- consultora. Automatizar significaria mandar mensagem de cobrança
-- para quem falou com a Febracis ontem. A carência de 90 dias
-- reduz o risco, não elimina — a decisão continua sendo de gente.
-- ============================================================


-- ------------------------------------------------------------
-- A lista
--
-- `dias_desde_o_convite` é a coluna que decide: quem foi
-- convidado há 8 meses faz sentido cobrar de novo; quem foi
-- convidado semana passada, não. `pode_disparar` é sugestão
-- (telefone + carência de 90 dias), NÃO trava — a tela mostra
-- todo mundo e deixa a Elis decidir.
-- ------------------------------------------------------------
create or replace view public.vw_represado_lista as
select f.cpf as aluno_id,
       f.nome,
       f.telefone,
       f.curso,
       f.vence_em,
       f.dias_restantes,
       f.comprou_em,
       f.proxima_turma    as turma_id,
       f.proxima_turma_em,
       f.ja_transferiu,
       u.enviado_em       as ultimo_convite_em,
       case when u.enviado_em is null then null::integer
            else current_date - u.enviado_em::date
       end                as dias_desde_o_convite,
       u.resposta         as ultima_resposta,
       f.telefone is not null
         and (u.enviado_em is null or u.enviado_em < now() - interval '90 days')
                          as pode_disparar
  from fila_prazo f
  left join lateral (
    select e.enviado_em, e.resposta
      from pedagogico_envios e
     where e.aluno_id = f.cpf
       and e.tipo in ('convite', 'prazo_vencendo')
       and e.status = 'aceito'
     order by e.enviado_em desc
     limit 1
  ) u on true
 where coalesce(f.turma_da_venda, '') not ilike '%LISBOA%'
   and f.curso not ilike '%MAESTRIA%'
   and f.situacao = 'vencendo'
   and f.proxima_turma is not null
   and f.proxima_turma_em <= f.vence_em
   and public.pode_ver('pedagogico');

comment on view public.vw_represado_lista is
  'Comprou, prazo correndo, e existe turma antes do vencimento.
   `dias_desde_o_convite` diz há quanto tempo o sistema chamou essa
   pessoa — sem isso a tela convida a cobrar quem foi convidado
   ontem. `pode_disparar` é sugestão, não trava.';


-- ------------------------------------------------------------
-- O disparo
--
-- Enfileira em pedagogico_envios; NÃO envia. Quem envia é o script,
-- na rodada seguinte. A tela precisa dizer "entram na próxima
-- rodada", nunca "mensagens enviadas".
--
-- A carência é parâmetro (padrão 90 dias) para poder ser afrouxada
-- numa campanha sem mexer na função.
-- ------------------------------------------------------------
create or replace function public.disparar_represados(p_dias_carencia integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, criado_em)
  select r.aluno_id, r.turma_id, 'prazo', 'prazo_vencendo', 'pendente', now()
    from vw_represado_lista r
   where r.telefone is not null
     and (r.ultimo_convite_em is null
          or r.ultimo_convite_em < now() - (p_dias_carencia || ' days')::interval)
     and not exists (
       select 1 from pedagogico_envios e
        where e.aluno_id = r.aluno_id
          and e.turma_id = r.turma_id
          and e.tipo = 'prazo_vencendo'
          and e.status = 'pendente'
     );

  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'enfileirados', v_n,
    'mensagem', case when v_n = 0
      then 'Ninguém elegível: todos já foram convidados recentemente.'
      else v_n || ' pessoas entram na próxima rodada de envio.' end
  );
end $$;

revoke execute on function public.disparar_represados from anon;
grant select on public.vw_represado_lista to authenticated;

notify pgrst, 'reload schema';
