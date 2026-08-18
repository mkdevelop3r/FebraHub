-- ============================================================
-- 127 · CENTRAL DE EVENTOS — acesso ao catálogo e vínculo de perfil
--
-- STATUS: APLICADA em 18/08/2026.
--
-- O módulo do front lê `mkt_eventos` e companhia pelas policies que a 121 e
-- a 123 já criaram, e escreve só por `mkt_marcar_acao` /
-- `mkt_classificar_evento`. Faltavam duas coisas para a tela ter dado.
-- ============================================================

-- ---------- 1. catálogo invisível: RLS ligada, ZERO policies ----------
-- `mkt_tipos_evento` e `mkt_unidades` estavam com RLS ativa e nenhuma
-- policy, o que devolve 0 linhas para QUALQUER autenticado. Efeitos na
-- tela: a fila de classificação abria sem nenhum botão de tipo, o chip do
-- card mostrava "—" (o embedding do tipo voltava nulo) e as abas de unidade
-- nunca apareceriam nem depois de Recife ser cadastrada.
--
-- Não é dado sigiloso — é catálogo que a tela exibe de propósito. Fica
-- atrás do mesmo setor que o resto do módulo.

drop policy if exists sel_mkt_tipos on mkt_tipos_evento;
create policy sel_mkt_tipos on mkt_tipos_evento
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral']))
  );

drop policy if exists sel_mkt_unidades on mkt_unidades;
create policy sel_mkt_unidades on mkt_unidades
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral']))
  );

-- ---------- 2. ninguém enxergava evento nenhum ----------
-- A policy de mkt_eventos (migration 121) é:
--
--   exists (select 1 from perfis p
--            where p.id = auth.uid()
--              and p.setor in ('marketing','geral')
--              and (p.gestor_marketing or p.unidade_id = mkt_eventos.unidade_id))
--
-- Medido antes, simulando o JWT de cada um:
--
--   Bruno Cordeiro  setor='marketing', gestor_marketing=false, unidade_id=NULL  -> 0 eventos
--   Dulce Mariano   setor='geral',     gestor_marketing=false, unidade_id=NULL  -> 0 eventos
--
-- `NULL = <uuid>` é NULL, não é false — não satisfaz a policy. E como
-- ninguém tinha `gestor_marketing`, o outro braço também não salvava. Os 16
-- eventos ativos existiam e estavam invisíveis para todo mundo.
--
-- Os dois updates abaixo foram RODADOS, com a escolha do Bruno em 18/08:
-- vínculo de unidade para os dois (leitura, nenhum poder extra) e
-- `gestor_marketing` só para ele. O gestor não é decoração: é o que a
-- `mkt_classificar_evento` exige — sem ele, o botão da fila é recusado.

update perfis set unidade_id = (select id from mkt_unidades where slug = 'ssa')
 where id in ('51d622aa-18d8-4c44-b81a-cd6629fc8479',   -- Dulce Mariano
              'b4b31008-2d43-4a0e-820c-00339b04af28');  -- Bruno Cordeiro

update perfis set gestor_marketing = true
 where id = 'b4b31008-2d43-4a0e-820c-00339b04af28';     -- Bruno Cordeiro

-- Quem entrar no marketing depois precisa de `unidade_id` preenchido, senão
-- cai no mesmo buraco de NULL. Vale checar ao criar perfil novo.

-- ---------- conferido depois de aplicar ----------
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}';
--
--   Dulce (geral)      -> 16 ativos, 10 pendentes, 9 em setembro
--   Bruno (gestor)     -> 16 ativos, 98 ações, 8 resultados, 4 tipos com checklist
--   Elis (pedagogico)  -> 0 em tudo, SEM erro — é o que faz a tela vir vazia
--                         em vez de quebrar para quem não é do marketing
--
-- Antes da migration, os mesmos comandos devolviam 0 para todos.
