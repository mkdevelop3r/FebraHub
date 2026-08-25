-- ============================================================
-- 151_central_eventos_agenda.sql — a Central deixa de ser só curso
--
-- O Louis notou que a Central Febracis só mostrava curso ("só tá pegando
-- cursos GGB"). Estava certo, e não era filtro: `vw_central_eventos` lia
-- só `dim_turmas`, que tem turma de curso e nada mais. Palestra, workshop
-- e live vivem em `mkt_eventos`, que vem da agenda do Google.
--
-- Medido em 24/08/2026, no período de duas colunas (agosto e setembro):
--   dim_turmas    6 turmas
--   mkt_eventos  38 linhas — das quais a maioria é ruído
--
-- O QUE ENTRA DA AGENDA, E O QUE NÃO ENTRA
-- -----------------------------------------
-- Entram apenas Palestra, Workshop e Live com status 'ativo'. Ficam de
-- fora, de propósito:
--
--   Mentoria           sessão fechada, não se divulga nem se lota
--   sem tipo           "Reunião estratégica com Recife" toda semana,
--                      "Reuniao com os Treinadores", "VIAGEM CHINA",
--                      "AULA INTERNACIONAL" — 23 das 38 linhas
--   Treinamento        JÁ ESTÁ na Central, vindo de dim_turmas
--
-- A DUPLICATA QUE QUASE PASSOU
-- -----------------------------
-- Os três treinamentos ativos do período — FOP (09/09), IF 36 (17/09) e
-- FCIS (29/09) — existem NAS DUAS fontes: são turma no Salesforce e
-- evento na agenda. Excluir por tipo resolve esses três.
--
-- Mas sobrava um quarto: "PV EM SALVADOR" (27/08) está classificado como
-- WORKSHOP na agenda e é a mesma coisa que a turma "TOUR CRESCIMENTO
-- EMPRESARIAL" do mesmo dia. Por tipo ele passaria.
--
-- Por isso a regra final não é só o tipo: a agenda também não traz evento
-- que caia na data de início de uma turma. É a mesma chave de data que a
-- migration 144 usou e que foi medida lá — turma não divide dia com outra
-- turma, e evento de curso cai exatamente no dia em que a turma começa.
--
-- RISCO ASSUMIDO, e não é pequeno: uma palestra marcada para o mesmo dia
-- em que um curso começa some da Central sem aviso. Hoje isso não
-- acontece (as palestras estão em 01, 02, 03, 08, 22 e 24 de setembro; as
-- turmas em 09, 17 e 29), mas vai acontecer um dia. A correção definitiva
-- é ligar evento e turma por identificador, não por data — e para isso
-- falta uma coluna que ninguém preenche hoje.
--
-- VENDA E INSCRIÇÃO NÃO SÃO A MESMA COISA
-- ----------------------------------------
-- Curso conta VENDA (matrícula no Salesforce). Palestra conta INSCRITO
-- (ingresso no Sympla). São perguntas diferentes e a coluna `metrica` diz
-- qual é, para a tela escrever a palavra certa em vez de chamar tudo de
-- venda. Palestra sem link do Sympla vem com número nulo — que é
-- diferente de zero, e a tela também trata assim.
-- ============================================================

drop view if exists public.vw_central_eventos cascade;

create view public.vw_central_eventos as
with vendas as (
  select turma, count(distinct original_id_venda) as vendas
  from public.fato_base_alunos
  where turma is not null
  group by turma
),

-- ---------- fonte 1: turmas de curso (Salesforce) ----------
turmas as (
  select
    t.turma_id                                       as id,
    coalesce(nullif(t.nome_comercial, ''), t.curso)  as titulo,
    'Curso'                                          as tipo,
    'venda'                                          as metrica,
    t.data_inicio,
    t.data_fim,
    coalesce(v.vendas, 0)                            as numero,
    t.local                                          as local_origem,
    t.endereco                                       as endereco_origem,
    t.capacidade                                     as capacidade_origem
  from public.dim_turmas t
  left join vendas v on v.turma = t.turma_id
  where t.data_inicio is not null
),

-- ---------- fonte 2: agenda do marketing (Google) ----------
agenda as (
  select
    'mkt:' || e.id::text as id,
    e.nome               as titulo,
    ti.nome              as tipo,
    'inscrito'           as metrica,
    e.data_evento        as data_inicio,
    e.data_evento        as data_fim,
    r.inscritos          as numero,
    null::text           as local_origem,
    null::text           as endereco_origem,
    null::integer        as capacidade_origem
  from public.mkt_eventos e
  join public.mkt_tipos_evento ti on ti.id = e.tipo_evento_id
  left join public.mkt_resultados_evento r on r.evento_id = e.id
  where e.status = 'ativo'
    and ti.nome in ('Palestra', 'Workshop', 'Live')
    -- não repete o que já veio como turma; ver o cabeçalho
    and not exists (
      select 1 from public.dim_turmas d
       where d.data_inicio = e.data_evento
    )
),

tudo as (
  select * from turmas
  union all
  select * from agenda
)

select
  u.id                                as turma_id,
  u.titulo,
  u.tipo,
  u.metrica,
  u.data_inicio,
  u.data_fim,
  case
    when date_trunc('month', u.data_inicio) = date_trunc('month', current_date)
      then 'este_mes'
    when date_trunc('month', u.data_inicio) = date_trunc('month', current_date) + interval '1 month'
      then 'proximo_mes'
    when u.data_inicio < current_date then 'passado'
    else 'depois'
  end                                 as coluna,
  (u.data_inicio - current_date)      as dias_para_inicio,
  u.numero                            as vendas,
  d.confirmados,
  coalesce(nullif(d.local, ''), nullif(u.local_origem, ''), 'Sede Febracis') as local,
  coalesce(nullif(d.endereco, ''), nullif(u.endereco_origem, ''))            as endereco,
  (nullif(d.local, '') is null and nullif(u.local_origem, '') is null)       as local_padrao,
  coalesce(d.capacidade, u.capacidade_origem) as capacidade,
  d.observacao,
  d.atualizado_em,
  p.nome                              as atualizado_por
from tudo u
left join public.evento_detalhe d on d.turma_id = u.id
left join public.perfis p          on p.id = d.atualizado_por
where public.pode_ver('central-eventos')
   or public.pode_ver('marketing');

grant select on public.vw_central_eventos to authenticated;

notify pgrst, 'reload schema';

-- ---------- conferência ----------
--   select tipo, count(*) from vw_central_eventos
--    where coluna in ('este_mes','proximo_mes') group by tipo;
-- Esperado em 24/08: Curso 6, Palestra 6, Workshop 1.
-- Nenhum título repetido entre as duas fontes.
