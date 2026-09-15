-- ============================================================
-- FebraHub · Migration 202 — Contagem real de respostas + exportação
--
-- A tela de Avaliações mostrava "0 respostas" no evento BHP Recife, mesmo com
-- gente tendo respondido. Causa: a contagem vinha da view de NPS
-- (vw_evento_nps), que conta quem respondeu a pergunta de RECOMENDAÇÃO. Esse
-- evento não tem pergunta de NPS (formulário todo custom, agora que o núcleo é
-- removível — ver db/200), então a contagem dava 0.
--
-- A contagem certa é dos ENVIOS (evento_respostas), independente de NPS.
-- ============================================================

-- Quantos responderam, por evento — conta os envios, não o NPS.
create or replace view public.vw_evento_respostas_total as
select r.evento_id, count(*)::bigint as respostas
from public.evento_respostas r
join public.eventos e on e.id = r.evento_id
where public.pode_ver(e.setor)
group by r.evento_id;

-- Detalhe de todas as respostas para exportar em planilha: uma linha por
-- (envio, pergunta). O front faz o pivot (uma linha por respondente, uma coluna
-- por pergunta) e gera o CSV.
create or replace view public.vw_evento_resposta_detalhe as
select e.id           as evento_id,
       r.id           as resposta_id,
       r.enviado_em,
       p.id           as pergunta_id,
       p.ordem,
       p.texto        as pergunta,
       p.tipo,
       i.valor_num,
       i.valor_texto
from public.evento_respostas r
join public.eventos e on e.id = r.evento_id
join public.evento_resposta_itens i on i.resposta_id = r.id
join public.evento_perguntas p on p.id = i.pergunta_id
where public.pode_ver(e.setor);

revoke all on public.vw_evento_respostas_total from anon;
revoke all on public.vw_evento_resposta_detalhe from anon;
grant select on public.vw_evento_respostas_total to authenticated;
grant select on public.vw_evento_resposta_detalhe to authenticated;

notify pgrst, 'reload schema';
