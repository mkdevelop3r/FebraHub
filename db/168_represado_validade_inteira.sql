-- ============================================================
-- FebraHub · Migration 168 — Represado e a validade inteira
--
-- A lista mostrava 48 de 453. O filtro era `situacao = 'vencendo'`, que na
-- 103/95 significa "vence em ate 90 dias". Quem tem 92 dias de prazo sumia
-- da tela -- mesmo tendo comprado, nao ter feito, e ter turma disponivel.
--
-- Com a tela agrupada por TURMA isso ficou insustentavel: a FOP20 comeca
-- dia 09/09 e a tela oferecia 8 pessoas para chamar, enquanto outras 24
-- (18 com telefone) tinham essa mesma FOP20 como proxima turma e nao
-- apareciam. Para encher a turma de terca, prazo de 89 ou 92 dias da no
-- mesmo. A janela de 90 dias mede URGENCIA DO PRAZO; a tela por turma
-- pergunta QUEM CABE NESTA TURMA. Nao e a mesma pergunta.
--
-- Represado passa a ser: dentro da validade (`vence_em` = data_matricula +
-- 365, ver 95) e com turma disponivel antes de vencer. Ou seja
-- `situacao <> 'vencido'` -- 'sem turma no prazo' continua fora sozinho,
-- pelas condicoes de turma que ja existiam.
--
-- 48 -> 453 pessoas, 312 com telefone, nas mesmas 6 turmas.
--
-- O CORTE DE LISBOA FICA
--
-- Conferido linha a linha: as 55 pessoas de `- LISBOA` nao tem nome, nem
-- telefone, nem e-mail, nem CPF de 11 digitos -- alunos de Portugal que
-- nunca casaram com dim_alunos. Sem o filtro a lista cresce com 55 linhas
-- anonimas e incontactaveis. Numero maior, trabalho igual.
--
-- O DISPARO NAO ACOMPANHA A LISTA, E ISSO E DE PROPOSITO
--
-- `disparar_represados` le de dentro desta view. Alargar a view sem mexer
-- na funcao levaria o botao de ~45 para ~300 pessoas em um clique, e do
-- outro lado tem gente recebendo mensagem. Entao a funcao ganha
-- `p_prazo_maximo` (padrao 90): a LISTA e a validade inteira, o DISPARO
-- continua sendo so quem esta com o prazo curto. Para uma campanha
-- deliberada, passe outro valor -- ou null para tirar o teto.
--
-- `pode_disparar` na view segue a mesma regra, senao o contador de
-- "elegiveis" da tela prometeria o que a funcao nao faz.
--
-- `p_turma_id`: DISPARO POR TURMA
--
-- A tela passou a ser agrupada por turma, e o gesto que ela pede e "chamar
-- quem falta para a FOP20", nao "chamar todo mundo". Nulo mantem o
-- comportamento antigo (todas as turmas), que e o que o botao geral chama.
--
-- O DROP ANTES DO CREATE NAO E ZELO, E OBRIGACAO
--
-- Acrescentar argumento com default cria uma SEGUNDA funcao ao lado da
-- antiga, e `disparar_represados()` sem argumento passa a casar com as
-- duas: 42725, "function is not unique" -- o erro que derrubou o sync na
-- 130/131 e que a 142 teve de contornar. `create or replace` nao
-- substitui assinatura diferente. As duas assinaturas anteriores saem
-- explicitamente, entao esta migration se aplica sozinha.
-- ============================================================

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
         and f.dias_restantes <= 90
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
   and f.situacao <> 'vencido'
   and f.proxima_turma is not null
   and f.proxima_turma_em <= f.vence_em
   and public.pode_ver('pedagogico');

comment on view public.vw_represado_lista is
  'Dentro da validade de um ano (vence_em = compra + 365) e com turma antes
   de vencer. A janela de 90 dias saiu da LISTA na 168 -- a tela e por turma,
   e a pergunta e quem cabe na turma, nao quem esta pegando fogo.
   `pode_disparar` continua exigindo prazo <= 90 dias: lista larga, disparo
   estreito. `dias_desde_o_convite` diz ha quanto tempo o sistema chamou.';


drop function if exists public.disparar_represados(integer);
drop function if exists public.disparar_represados(integer, text);

create function public.disparar_represados(
  p_dias_carencia integer default 90,
  p_turma_id      text    default null,
  p_prazo_maximo  integer default 90
)
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
     and (p_turma_id is null or r.turma_id = p_turma_id)
     and (p_prazo_maximo is null or r.dias_restantes <= p_prazo_maximo)
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
    'turma', p_turma_id,
    'mensagem', case
      when v_n = 0 and p_turma_id is not null
        then 'Ninguém elegível na turma ' || p_turma_id || ': todos já foram convidados recentemente.'
      when v_n = 0
        then 'Ninguém elegível: todos já foram convidados recentemente.'
      when p_turma_id is not null
        then v_n || ' pessoa' || case when v_n = 1 then '' else 's' end
             || ' da turma ' || p_turma_id || ' entra'
             || case when v_n = 1 then '' else 'm' end || ' na próxima rodada de envio.'
      else v_n || ' pessoas entram na próxima rodada de envio.'
    end
  );
end $$;

revoke execute on function public.disparar_represados(integer, text, integer) from anon;
grant select on public.vw_represado_lista to authenticated;

notify pgrst, 'reload schema';

-- conferir
-- select count(*) as lista, count(*) filter (where pode_disparar) as elegiveis
--   from public.vw_represado_lista;          -- esperado: 453 | ~45 (admin)
