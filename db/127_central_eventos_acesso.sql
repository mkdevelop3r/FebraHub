-- ============================================================
-- 121 Â· CENTRAL DE EVENTOS â€” o que falta para a tela ter dado
--
-- STATUS: NÃƒO APLICADA. Escrita a partir do estado medido do banco em
-- 18/08/2026, para vocÃª revisar e aplicar.
--
-- O mÃ³dulo do front estÃ¡ pronto e commitado. Ele lÃª `mkt_eventos` e
-- companhia pelas policies que jÃ¡ existem, e escreve sÃ³ por
-- `mkt_marcar_acao` / `mkt_classificar_evento`. TrÃªs coisas do lado do
-- banco impedem a tela de mostrar qualquer coisa hoje.
-- ============================================================

-- ---------- 1. NINGUÃ‰M enxerga evento nenhum ----------
-- A policy de mkt_eventos Ã©:
--
--   exists (select 1 from perfis p
--            where p.id = auth.uid()
--              and p.setor in ('marketing','geral')
--              and (p.gestor_marketing or p.unidade_id = mkt_eventos.unidade_id))
--
-- Medido, simulando o JWT de cada um:
--
--   Bruno Cordeiro  setor='marketing', gestor_marketing=false, unidade_id=NULL  -> 0 eventos
--   Dulce Mariano   setor='geral',     gestor_marketing=false, unidade_id=NULL  -> 0 eventos
--
-- `NULL = <uuid>` Ã© NULL, nÃ£o Ã© false â€” e nÃ£o satisfaz a policy. Como
-- ninguÃ©m tem `gestor_marketing`, o segundo braÃ§o tambÃ©m nÃ£o salva. Os 16
-- eventos ativos existem e estÃ£o invisÃ­veis para todo mundo.
--
-- Duas saÃ­das, e a escolha Ã© de negÃ³cio, nÃ£o tÃ©cnica:
--
--   (a) Vincular cada pessoa Ã  unidade dela. Ã‰ o correto quando Recife
--       existir: cada um vÃª a prÃ³pria praÃ§a.
--
--       update perfis set unidade_id = (select id from mkt_unidades where slug='ssa')
--        where id in ('b4b31008-2d43-4a0e-820c-00339b04af28',   -- Bruno
--                     '51d622aa-18d8-4c44-b81a-cd6629fc8479');  -- Dulce
--
--   (b) Marcar quem Ã© gestÃ£o de marketing. `gestor_marketing` tambÃ©m Ã© o
--       que a `mkt_classificar_evento` exige para classificar da fila â€”
--       sem isso, o botÃ£o da fila vai recusar. O enunciado do mÃ³dulo diz
--       que o Bruno Ã© o gestor.
--
--       update perfis set gestor_marketing = true
--        where id = 'b4b31008-2d43-4a0e-820c-00339b04af28';     -- Bruno
--
-- Provavelmente as DUAS: (a) para todo mundo do marketing, (b) sÃ³ para o
-- Bruno. Deixei como comentÃ¡rio porque Ã© decisÃ£o sua e mexe em gente.

-- ---------- 2. mkt_tipos_evento: RLS ligada, ZERO policies ----------
-- ConsequÃªncia: a fila de classificaÃ§Ã£o abre sem nenhum botÃ£o de tipo, e
-- o chip do card mostra "â€”" em vez do nome do tipo (o embedding volta
-- nulo). NÃ£o Ã© sigiloso â€” Ã© catÃ¡logo. Fica atrÃ¡s do mesmo setor.
drop policy if exists sel_mkt_tipos on mkt_tipos_evento;
create policy sel_mkt_tipos on mkt_tipos_evento
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral']))
  );

-- ---------- 3. mkt_unidades: RLS ligada, ZERO policies ----------
-- ConsequÃªncia: as abas de unidade nunca aparecem, nem quando Recife for
-- cadastrada, porque a lista volta vazia. Hoje isso passa despercebido
-- (sÃ³ existe Salvador, e com uma unidade as abas ficam ocultas de
-- propÃ³sito) â€” mas Ã© uma bomba-relÃ³gio silenciosa.
drop policy if exists sel_mkt_unidades on mkt_unidades;
create policy sel_mkt_unidades on mkt_unidades
  for select using (
    exists (select 1 from perfis p
             where p.id = auth.uid()
               and p.setor = any (array['marketing','geral']))
  );

-- ---------- conferir depois de aplicar ----------
-- Como o Bruno, os trÃªs tÃªm que devolver linha:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"b4b31008-2d43-4a0e-820c-00339b04af28"}';
--   select (select count(*) from mkt_eventos)      as eventos,      -- espera 16 ativos + 10 pendentes + 52 sem_acoes
--          (select count(*) from mkt_tipos_evento) as tipos,
--          (select count(*) from mkt_unidades)     as unidades;     -- espera 1 (Salvador)
--
-- Hoje esse mesmo comando devolve 0, 0, 0.
--
-- E como a Elis (setor 'pedagogico'), `mkt_eventos` tem que continuar em 0
-- SEM erro â€” Ã© o que faz a tela vir vazia em vez de quebrar. JÃ¡ confirmei
-- que Ã© o caso: ela lÃª a prÃ³pria linha de `perfis`, a policy avalia false
-- e devolve zero linhas.

