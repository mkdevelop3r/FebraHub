-- ============================================================
-- 105 — ÍNDICES DA FILA DE PRAZO
--
-- Motivo: o ETL quebrou lendo vw_prazo_fila_envio pelo PostgREST,
-- com "canceling statement due to statement timeout" (57014). As
-- boas-vindas do mesmo lote passaram; só a fila de prazo estourou.
--
-- A view percorre 3 anos de matrículas cruzando fato_presenca e
-- dim_turmas, e as views empilhadas em cima repetem esse trabalho a
-- cada leitura. No editor do Supabase o limite de tempo é folgado; no
-- PostgREST é curto, então o que passava na mão falhava no ETL.
--
-- Nenhum destes índices altera dado. Se ainda assim a leitura passar
-- de ~3s, o caminho é materializar a fila: virar tabela atualizada
-- pelo próprio sync, em vez de calculada a cada leitura. O custo sai
-- do ETL, que tem tempo, e a leitura vira instantânea.
--
-- Conferir depois de aplicar:
--   explain analyze select count(*) from vw_prazo_fila_envio;
-- ============================================================

-- filtro principal da CTE `matricula`
create index if not exists fba_status_data
  on fato_base_alunos (status_matricula, data_matricula);

-- agrupamento por pessoa + curso, e junção com `ja_fez`
create index if not exists fba_aluno_curso
  on fato_base_alunos (aluno_id, curso_id);

-- junção que descobre quem já fez o curso
create index if not exists fp_cpf_curso
  on fato_presenca (cpf, curso);

-- CTE `proxima_turma`, que filtra data_inicio > hoje
create index if not exists dt_data_inicio
  on dim_turmas (data_inicio);
