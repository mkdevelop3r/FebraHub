-- Mensagens do pedagogico (confirmacao de turma) saiam com "Local:" e
-- "Endereco:" em branco. A dim_turmas tem os dois (local + endereco), mas a
-- vw_turma_fila_envio so expunha `local`. Aqui adiciona `endereco` (ao fim,
-- pra create-or-replace aceitar). A Edge Function mensagens-pedagogico passa
-- a empurrar os campos pedagogico_local e pedagogico_endereco pro Black CRM.
create or replace view public.vw_turma_fila_envio as
 WITH contatos AS (
         SELECT b.aluno_id, b.turma_id, b.tipo, b.nome, b.telefone, b.email
           FROM vw_turma_inscritos_base b
        UNION ALL
         SELECT r.aluno_id, r.turma_id, tipos.tipo, r.nome, r.telefone, r.email
           FROM vw_turma_represados_envio_base r
             CROSS JOIN ( VALUES ('confirmacao'::text), ('grupo'::text)) tipos(tipo)
        )
 SELECT e.aluno_id,
    e.tipo,
    vi.nome,
    normaliza_telefone(vi.telefone) AS whatsapp,
    vi.email,
    t.turma_id,
    t.curso,
    t.data_inicio,
    t.data_fim,
    t.horario_credenciamento,
    t.horario_inicio,
    t.horario_fim,
    t.local,
    t.link_grupo,
        CASE
            WHEN normaliza_telefone(vi.telefone) IS NOT NULL THEN 'whatsapp'::text
            WHEN COALESCE(vi.email, ''::text) <> ''::text THEN 'email'::text
            ELSE NULL::text
        END AS canal,
    t.endereco
   FROM pedagogico_envios e
     JOIN dim_turmas t ON t.turma_id = e.turma_id
     JOIN contatos vi ON vi.aluno_id = e.aluno_id AND vi.turma_id = e.turma_id AND vi.tipo = e.tipo
  WHERE e.status = 'pendente'::text
    AND (e.tipo = ANY (ARRAY['confirmacao'::text, 'grupo'::text]))
    AND COALESCE(vi.telefone, vi.email) IS NOT NULL;

notify pgrst, 'reload schema';
