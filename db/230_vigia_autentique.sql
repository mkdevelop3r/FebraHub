-- ============================================================
-- FebraHub · Migration 230 — Vigia: registra a integração do Autentique
--
-- A automação de contratos (disparar_contrato.py) agora dá heartbeat em
-- integracao_status (fonte 'autentique'). Aqui ela entra no registro do vigia
-- (vigia_fontes), pra aparecer na Central de APIs como as demais.
--
-- exigir_avanco = false: o disparo roda de hora marcada mas só grava em
-- contrato_envio quando há venda GGB Matrícula pendente — então "rodou sem
-- gravar" é normal, não é alerta. Saúde = a fonte ter executado na janela.
-- tolerancia 1560 min (26h) cobre a maior folga entre rodadas (madrugada).
-- ============================================================
insert into public.vigia_fontes
  (fonte, nome, tolerancia_minutos, tabela_destino, coluna_relogio, exigir_avanco, execucoes_sem_avanco)
values
  ('autentique', 'Contratos (Autentique)', 1560, 'contrato_envio', 'enviado_em', false, 2)
on conflict (fonte) do update set
  nome = excluded.nome,
  tolerancia_minutos = excluded.tolerancia_minutos,
  tabela_destino = excluded.tabela_destino,
  coluna_relogio = excluded.coluna_relogio,
  exigir_avanco = excluded.exigir_avanco,
  execucoes_sem_avanco = excluded.execucoes_sem_avanco,
  atualizado_em = now();

notify pgrst, 'reload schema';
