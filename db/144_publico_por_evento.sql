-- ============================================================
-- 144_publico_por_evento.sql — quantas pessoas cada evento tem
--
-- Pedido do Louis em 20/08/2026: o sino da Central mostra, além das ações
-- pendentes do mês, o número de inscritos/compras de cada evento. Sympla
-- de um lado, Salesforce do outro.
--
-- DUAS FONTES, UMA COLUNA
-- ------------------------
-- Palestra e workshop vendem ingresso pelo Sympla; treinamento matricula
-- aluno no Salesforce. São bases diferentes, com nomes diferentes para a
-- mesma pergunta ("quantas pessoas?"), e a tela não deveria ter de saber
-- disso. A view resolve e entrega `fonte` junto, para a Central poder
-- dizer de onde veio o número em vez de fingir que é tudo igual.
--
-- COMO O TREINAMENTO CASA COM A TURMA: PELA DATA
-- -----------------------------------------------
-- Medido nos 10 treinamentos ativos, em 20/08/2026:
--
--   · 8 têm turma começando na data EXATA do evento; 2 não têm turma
--     nenhuma ("IF para mulheres - em avaliação" e "FGPC");
--   · em NENHUM caso houve duas turmas no mesmo dia. Zero ambiguidade.
--
-- Casar por NOME seria o caminho intuitivo e está errado aqui: a
-- similaridade entre o nome do evento e o nome do curso vai de 0,014 a
-- 0,714, porque o evento é chamado pela sigla e número ("IF 37",
-- "BHP 26") e o curso pelo nome inteiro ("INTELIGÊNCIA FINANCEIRA"). Com
-- limiar alto perde quase tudo; com limiar baixo casa errado. Foi
-- exatamente essa armadilha que travou o casamento campanha↔evento do
-- tráfego, registrado no handoff: 1.046 pares medidos, melhor semelhança
-- 0,278.
--
-- A data é o campo forte, e por isso o `limit 1` abaixo NÃO é um desempate
-- disfarçado: é a afirmação de que não há empate. Se um dia dois
-- treinamentos começarem no mesmo dia, este número passa a mentir em
-- silêncio — e aí o certo é casar por `sigla || numero` extraído do nome,
-- que é o que o `turma_id` guarda ("2026 - IF37").
--
-- DATA SOZINHA NÃO BASTA — o erro que a primeira versão desta view tinha
-- ------------------------------------------------------------------------
-- Escrita só com a data, ela casava QUALQUER evento sem Sympla com a turma
-- do dia. Resultado medido antes de corrigir: "Reunião estratégica com
-- Recife" — reunião interna semanal — exibia 7 alunos do FOP20 em 09/09 e
-- 1 do BHP26 em 28/10. Três falsos positivos em onze casamentos.
--
-- Por isso o `join` com o tipo: só evento classificado como TREINAMENTO
-- procura turma. É a régua do próprio pedido ("dos treinamentos tem esses
-- dados no Salesforce") e derruba os três casos ruins sem perder nenhum
-- dos oito bons.
--
-- Perde-se um caso legítimo: "PV EM SALVADOR" (27/08) casava com
-- "2026 - TCE001 - TOUR PV SALVADOR", 522 pessoas, e está classificado
-- como Workshop. Fica sem número. Preferi assim: um evento sem número é
-- visivelmente sem número, e uma reunião interna com 7 alunos parece
-- verdade. Se o PV precisar aparecer, o caminho é classificá-lo como
-- Treinamento — decisão do Bruno, na tela, não regra escondida aqui.
--
-- QUEM CONTA COMO PESSOA
-- -----------------------
-- `Matrícula` + `CONSUMIDOR DE VAGAS`, aprovadas — o mesmo critério que a
-- migration 137 fixou para o Comercial. Não é escolha nova: é a régua que
-- já existe no produto. COMPRADOR DE VAGAS fica de fora de propósito, é
-- quem paga e não ocupa cadeira; contá-lo dobraria a pessoa.
--
-- No Sympla, `mkt_resultados_evento.inscritos` já vem calculado pelo
-- `mkt_sincroniza_sympla`, que exclui cancelado e reembolsado.
--
-- ACESSO
-- ------
-- `pode_ver('marketing')` dentro da view, como a 119 fez na Auditoria.
-- View não aceita policy de RLS; o gate mora no `where`.
-- ============================================================

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
    when t.turma_id is not null         then m.alunos
  end                                 as inscritos,
  t.turma_id,
  t.capacidade
from mkt_eventos e
left join mkt_resultados_evento r on r.evento_id = e.id
left join mkt_tipos_evento ti on ti.id = e.tipo_evento_id
left join lateral (
  -- Só procura turma quando o evento NÃO é do Sympla (um evento é uma
  -- coisa ou outra; as duas pontas ligadas criariam número duplo) E é
  -- Treinamento — ver o cabeçalho sobre os falsos positivos.
  select d.turma_id, d.capacidade
    from dim_turmas d
   where e.sympla_evento_id is null
     and ti.nome = 'Treinamento'
     and d.data_inicio = e.data_evento
   limit 1
) t on true
left join lateral (
  select count(*) as alunos
    from fato_base_alunos b
   where b.turma = t.turma_id
     and b.status_matricula = 'Aprovada'
     and b.tipo_matricula in ('Matrícula', 'CONSUMIDOR DE VAGAS')
) m on true
where pode_ver('marketing');

comment on view vw_mkt_publico_evento is
  'Público por evento da Central: inscritos do Sympla ou matrículas aprovadas do Salesforce, com a fonte declarada. Turma casa por data exata — ver o cabeçalho da migration 144.';

grant select on vw_mkt_publico_evento to authenticated, service_role;

-- ---------- conferência ----------
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<id de marketing>","role":"authenticated"}';
--   select fonte, count(*), sum(inscritos) from vw_mkt_publico_evento
--    where status = 'ativo' group by 1;
-- Quem não é do marketing tem que ver ZERO linhas, sem erro.
