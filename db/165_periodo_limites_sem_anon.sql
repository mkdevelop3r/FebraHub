-- ============================================================
-- FebraHub · Migration 165 — `vw_periodo_limites` sai do alcance do anon
--
-- A 164 concedeu select só a `authenticated`. Mas objeto novo no schema
-- `public` nasce com o DEFAULT PRIVILEGE do Supabase, que já inclui `anon` —
-- o `grant` da 164 não foi o que abriu, e por isso não havia o que revogar
-- lá. Conferido depois de aplicada: a chave pública do front, deslogada,
-- lia a view e recebia 200 com as duas datas.
--
-- Nas outras views isso é inofensivo porque `pode_ver()` fecha por dentro:
-- sem sessão, `auth.uid()` é null, `meu_setor()` é null, o coalesce devolve
-- false e o anon recebe zero linhas. Esta é a única view sem esse gate — foi
-- essa a decisão da 164 —, então o fechamento precisa vir do privilégio.
--
-- O que estava exposto: "existe movimento financeiro desde nov/2021". Sem
-- PII, sem valor, sem linha. Fecha por higiene, não por incidente.
--
-- Seguro porque o front só lê esta view DEPOIS do login: `useRangeDatas`
-- vive dentro do provider de período, que só monta com `perfil` na mão. A
-- tela de login não toca em view nenhuma.
-- ============================================================

revoke select on public.vw_periodo_limites from anon;

notify pgrst, 'reload schema';

-- conferir (esperado: authenticated t | anon f)
-- select has_table_privilege('authenticated', 'public.vw_periodo_limites', 'select') as authenticated_le,
--        has_table_privilege('anon',          'public.vw_periodo_limites', 'select') as anon_le;
