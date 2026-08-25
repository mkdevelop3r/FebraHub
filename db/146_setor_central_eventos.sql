-- ============================================================
-- 146_setor_central_eventos.sql — a Central ganha setor próprio
--
-- Pedido do Louis em 24/08/2026: a Daniele (social media) deve ver a
-- Central de Eventos e NÃO o Hub de Marketing. Hoje os dois abrem com o
-- mesmo setor `marketing`, então é tudo ou nada.
--
-- O setor novo é `central-eventos`, e quem o tem enxerga a operação de
-- evento sem enxergar leads, campanhas e investimento.
--
-- MENOS PRIVILÉGIO, NÃO MAIS UM APELIDO DE `marketing`
-- ----------------------------------------------------
-- O setor novo entra em CINCO tabelas — as que a Central lê de fato:
--
--   mkt_eventos · mkt_acoes_evento · mkt_tipos_evento
--   mkt_unidades · mkt_resultados_evento
--
-- e fica de fora de DUAS, de propósito:
--
--   mkt_leads              lead é do Hub de Marketing
--   mkt_campanhas_trafego  campanha e investimento idem
--
-- Sem esse recorte, o setor novo seria `marketing` com outro nome e a
-- separação existiria só no menu — qualquer chamada direta ao PostgREST
-- traria o que a tela escondeu.
--
-- `mkt_resultados_evento` entra porque o card do evento a lê por
-- EMBEDDING (`resultados:mkt_resultados_evento(...)`), e embedding exige
-- permissão na tabela embutida. Sem ela o card não quebra: volta nulo,
-- silenciosamente, e o número de inscritos some sem explicação.
--
-- O QUE ESTA MIGRATION NÃO RESOLVE
-- ---------------------------------
-- As views `vw_marketing_*` quase todas não têm gate nenhum: das onze, só
-- três chamam `pode_ver`. Ou seja, esconder o hub do menu impede a
-- navegação, não a consulta. Isso já era verdade antes desta migration e
-- vale para qualquer autenticado — não é dívida que a Daniele cria, é
-- dívida que ela torna visível. Fechar exige revisar as onze com o Codex,
-- que é dono do Hub de Marketing.
-- ============================================================

-- UM BURACO ACHADO NO CAMINHO, E FECHADO AQUI
-- --------------------------------------------
-- `sel_mkt_acoes` e `sel_mkt_resultados` NÃO checavam setor nenhum — só
-- `gestor_marketing OR unidade_id = e.unidade_id`. Qualquer perfil com
-- unidade preenchida lia o checklist inteiro, viesse de que setor viesse.
-- Não está vazando hoje porque só gente de marketing tem unidade; mas era
-- questão de tempo, e a 127 mostra que preencher unidade em perfil novo é
-- exatamente o que se faz quando alguém reclama de tela vazia.
--
-- As duas passam a exigir setor, como as outras três. Conferido contra os
-- oito perfis existentes: ninguém perde acesso com a mudança.

-- ---------- 1. as cinco policies da operação ----------
-- Nas três que já filtravam por setor, só ACRESCENTA 'central-eventos' ao
-- array. Nas duas de cima, acrescenta a checagem que faltava.

drop policy if exists sel_mkt_eventos on mkt_eventos;
create policy sel_mkt_eventos on mkt_eventos
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral','central-eventos'])
               and (p.gestor_marketing or p.unidade_id = mkt_eventos.unidade_id))
  );

drop policy if exists sel_mkt_acoes on mkt_acoes_evento;
create policy sel_mkt_acoes on mkt_acoes_evento
  for select using (
    exists (select 1 from perfis p
             join mkt_eventos e on e.id = mkt_acoes_evento.evento_id
            where p.id = auth.uid()
              and p.setor = any (array['marketing','geral','central-eventos'])
              and (p.gestor_marketing or p.unidade_id = e.unidade_id))
  );

drop policy if exists sel_mkt_resultados on mkt_resultados_evento;
create policy sel_mkt_resultados on mkt_resultados_evento
  for select using (
    exists (select 1 from perfis p
             join mkt_eventos e on e.id = mkt_resultados_evento.evento_id
            where p.id = auth.uid()
              and p.setor = any (array['marketing','geral','central-eventos'])
              and (p.gestor_marketing or p.unidade_id = e.unidade_id))
  );

-- Catálogo: não é sigiloso, é o que a tela exibe de propósito (ver 127).
drop policy if exists sel_mkt_tipos on mkt_tipos_evento;
create policy sel_mkt_tipos on mkt_tipos_evento
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral','central-eventos']))
  );

drop policy if exists sel_mkt_unidades on mkt_unidades;
create policy sel_mkt_unidades on mkt_unidades
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral','central-eventos']))
  );

-- ---------- 2. o público do sino ----------
-- A view da 144/145 gateia em `pode_ver('marketing')`. Sem acrescentar o
-- setor novo, a Daniele abriria a Central inteira e o sino viria vazio.
create or replace view vw_mkt_publico_evento as
select
  e.id                                as evento_id,
  e.nome,
  e.data_evento,
  e.status,
  e.unidade_id,
  case
    when e.sympla_evento_id is not null then 'sympla'
    when t.turma_id is not null         then 'salesforce'
  end                                 as fonte,
  case
    when e.sympla_evento_id is not null then r.inscritos
    when t.turma_id is not null         then m.pessoas
  end                                 as inscritos,
  case when t.turma_id is not null then m.vendas  end as vendas,
  case when t.turma_id is not null then m.receita end as receita,
  t.turma_id,
  t.capacidade
from mkt_eventos e
left join mkt_resultados_evento r on r.evento_id = e.id
left join mkt_tipos_evento ti on ti.id = e.tipo_evento_id
left join lateral (
  select d.turma_id, d.capacidade
    from dim_turmas d
   where e.sympla_evento_id is null
     and ti.nome = 'Treinamento'
     and d.data_inicio = e.data_evento
   limit 1
) t on true
left join lateral (
  select
    count(*)                                                   as pessoas,
    count(*) filter (where b.tipo_matricula = 'Matrícula')     as vendas,
    sum(b.valor) filter (where b.tipo_matricula = 'Matrícula') as receita
    from fato_base_alunos b
   where b.turma = t.turma_id
     and b.status_matricula = 'Aprovada'
     and b.tipo_matricula in ('Matrícula', 'CONSUMIDOR DE VAGAS')
) m on true
where pode_ver('marketing') or pode_ver('central-eventos');

grant select on vw_mkt_publico_evento to authenticated, service_role;

-- ---------- 3. conferência ----------
-- Como a Daniele (setor 'central-eventos'), o esperado é:
--   mkt_eventos > 0 · mkt_acoes_evento > 0 · mkt_unidades = 1
--   mkt_leads = 0   · mkt_campanhas_trafego = 0
-- Os dois zeros são o ponto da migration, não uma falha.
