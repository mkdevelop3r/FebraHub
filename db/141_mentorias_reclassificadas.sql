-- ============================================================
-- 141_mentorias_reclassificadas.sql — as mentorias antigas ganham tipo
--
-- A 140 criou o tipo Mentoria e deixou de propósito os eventos antigos
-- como estavam: `sem_acoes` com `tipo_evento_id` nulo. O Louis pediu em
-- 20/08/2026 para reclassificá-los.
--
-- SÃO 12, NÃO 13. O número 13 circulou numa conversa e estava errado:
-- contava junto o "Masterclass mentoria de carol - sala de reunião", que
-- não está em `sem_acoes` — está em `pendente_classificacao`, ou seja, na
-- fila do Bruno. Mexer nele aqui seria decidir por ele, e "Masterclass"
-- não é obviamente mentoria. Fica na fila.
--
-- O QUE O FILTRO EXCLUI, E POR QUÊ
-- --------------------------------
-- `nome ilike 'mentoria%'` — começa com a palavra, não apenas contém.
-- A diferença não é cosmética: existem duas "Palestra ... - vender
-- mentoria/público aberto" (Rennan e Clécio), que são PALESTRA, já
-- classificadas e com checklist ativo. Um filtro com '%mentoria%' as
-- pegaria, trocaria o tipo e — pior — o checklist delas ficaria órfão de
-- um tipo que não gera checklist. Duas palestras de captação virariam
-- sessão fechada sem ninguém perceber.
--
-- POR QUE VIA FUNÇÃO, E NÃO UPDATE DIRETO
-- ----------------------------------------
-- `mkt_aplicar_classificacao` é o caminho oficial: grava o tipo, consulta
-- `gera_checklist` e ajusta o status por consequência. Como Mentoria não
-- gera checklist, todas continuam em `sem_acoes` — o que muda é que
-- passam a ter tipo, e a Central para de mostrá-las como indefinidas.
-- UPDATE na mão gravaria o tipo e deixaria o status por conta da sorte.
--
-- Idempotente: rodar de novo não acha nada, porque o filtro exige
-- `tipo_evento_id is null`.
-- ============================================================

do $$
declare
  v_tipo  uuid;
  v_antes integer;
  r       record;
  v_feitos integer := 0;
begin
  select id into v_tipo from mkt_tipos_evento where nome = 'Mentoria';
  if v_tipo is null then
    raise exception 'Tipo Mentoria não existe. A migration 140 rodou?';
  end if;

  select count(*) into v_antes
    from mkt_eventos
   where nome ilike 'mentoria%'
     and status = 'sem_acoes'
     and tipo_evento_id is null;

  raise notice 'Mentorias sem tipo antes: %', v_antes;

  for r in select id from mkt_eventos
            where nome ilike 'mentoria%'
              and status = 'sem_acoes'
              and tipo_evento_id is null loop
    perform mkt_aplicar_classificacao(r.id, v_tipo);
    v_feitos := v_feitos + 1;
  end loop;

  raise notice 'Reclassificadas: %', v_feitos;

  -- Guarda-costas: nenhuma Palestra pode ter virado Mentoria.
  if exists (select 1 from mkt_eventos e
              join mkt_tipos_evento t on t.id = e.tipo_evento_id
             where t.nome = 'Mentoria' and e.nome ilike 'palestra%') then
    raise exception 'Uma Palestra foi classificada como Mentoria — filtro errado.';
  end if;
end $$;

-- ---------- a 13ª, acrescentada depois ----------
-- O bloco acima rodou primeiro e não pegou a "Masterclass mentoria de
-- carol - sala de reunião": ela estava em `pendente_classificacao`, e não
-- em `sem_acoes`, então ficou de fora do filtro. Perguntei ao Louis se era
-- mentoria ou aula aberta — é mentoria, e ele mandou classificar.
--
-- Aplicada no banco em 20/08/2026, logo após o bloco acima. Está escrita
-- aqui para que reconstruir a partir das migrations chegue ao mesmo
-- estado; por isso o filtro aceita os dois status.
--
-- Por nome e não por id: id de evento nasce de `gen_random_uuid()` e seria
-- outro num banco reconstruído.
do $$
declare v_tipo uuid; v_feitos integer := 0; r record;
begin
  select id into v_tipo from mkt_tipos_evento where nome = 'Mentoria';

  for r in select id from mkt_eventos
            where nome ilike 'Masterclass mentoria%'
              and status in ('pendente_classificacao', 'sem_acoes')
              and tipo_evento_id is null loop
    perform mkt_aplicar_classificacao(r.id, v_tipo);
    v_feitos := v_feitos + 1;
  end loop;

  raise notice 'Masterclass reclassificada: %', v_feitos;
end $$;

-- ---------- conferência ----------
--   select t.nome, count(*) from mkt_eventos e
--     join mkt_tipos_evento t on t.id = e.tipo_evento_id
--    group by t.nome order by 2 desc;
