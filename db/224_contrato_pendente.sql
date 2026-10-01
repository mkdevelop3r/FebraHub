-- ============================================================
-- FebraHub · Migration 224 — Fase 1 da automação de contratos: detecção
--
-- Quem precisa de contrato AGORA: venda de Curso GGB **presencial** aprovada no
-- Salesforce que ainda não teve contrato gerado. "Cursos GGB" aqui NÃO são as
-- 80 variações de dim_cursos.tipo='GGB' (que inclui online/taxa/combo) — são os
-- 12 cursos de verdade, os mesmos que a Central Pedagógica trata: filtro
-- tipo='GGB' AND grade_pedagogico=true (IF, FCIS, FGPC, BHP, TV, FOP, Master,
-- ML5, Maestria, Growth, PE, FCIS-base).
--
-- Dedup pela venda+curso já presente em contrato_envio. Corte de data = go-live
-- (só vendas novas; não refaz histórico). Sem guard pode_ver: é view de
-- processamento, lida pela Edge Function com service_role.
-- ============================================================

create or replace view public.vw_contrato_pendente as
select
  a.original_id_venda                                   as venda_id,
  a.aluno_id                                            as cpf,
  coalesce(ct.nome, al.nome, a.aluno_id)                as nome,
  a.curso_id                                            as curso,
  c.nome_curto                                          as curso_sigla,
  a.turma                                               as turma,
  a.valor                                               as valor,
  coalesce(nullif(btrim(ct.celular), ''),
           nullif(btrim(a.telefone_cliente), ''),
           al.telefone)                                 as telefone,
  coalesce(nullif(btrim(ct.email), ''),
           nullif(btrim(a.email_cliente), ''),
           al.email)                                    as email,
  a.unidade_geradora_venda                              as unidade,
  a.data_matricula                                      as comprou_em,
  a.consultor_id                                        as consultor
from public.fato_base_alunos a
join public.dim_cursos c
  on c.curso_id = a.curso_id and c.tipo = 'GGB' and c.grade_pedagogico = true
left join public.dim_alunos al
  on al.cpf_norm = lpad(regexp_replace(coalesce(a.aluno_id, ''), '\D', '', 'g'), 11, '0')
left join public.fato_contatos ct on ct.cpf = a.aluno_id
where a.status_matricula = 'Aprovada'
  and a.data_matricula >= date '2026-10-01'   -- go-live: só vendas novas (ajustar aqui)
  and a.original_id_venda is not null
  and not exists (
    select 1 from public.contrato_envio e
     where e.venda_id = a.original_id_venda
       and coalesce(e.curso, '') = coalesce(a.curso_id, '')
  );

grant select on public.vw_contrato_pendente to service_role;

notify pgrst, 'reload schema';
