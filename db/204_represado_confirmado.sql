-- ============================================================
-- FebraHub · Migration 204 — Represado: confirmado + só turma futura
--
-- Antes, o único sinal de que um represado aceitou era a resposta manual ao
-- convite (pedagogico_envios.resposta = 'sim') — raríssima. Desde 16/09 o robô
-- do grupo grava a confirmação por ENTRADA no grupo
-- (pedagogico_confirmacoes.origem = 'grupo_whatsapp'), que é o sinal de verdade.
--
-- Aqui a vw_represado_lista ganha `confirmado` (grupo OU 'sim') e
-- `confirmado_origem` ('grupo' | 'confirmacao' | 'resposta'), pra tela marcar
-- quem já confirmou e a Elis parar de cobrar quem entrou.
--
-- A ponte confirmação->represado: pedagogico_confirmacoes.aluno_id -> dim_alunos
-- -> cpf_norm ↔ cpf do represado, casando turma_id = proxima_turma (a turma do
-- convite). Colunas novas ficam NO FIM (regra do create or replace view).
--
-- REGRA (17/09): nunca mostrar represado cuja próxima turma JÁ COMEÇOU (FOP/IF
-- em andamento). A fila_prazo é um snapshot e pode estar velha; o guard
-- `proxima_turma_em >= hoje` garante que o represado só aparece com turma
-- futura, mesmo entre um refresh e outro.
-- ============================================================
create or replace view public.vw_represado_lista as
 SELECT f.cpf AS aluno_id,
    f.nome,
    f.telefone,
    f.curso,
    f.vence_em,
    f.dias_restantes,
    f.comprou_em,
    f.proxima_turma AS turma_id,
    f.proxima_turma_em,
    f.ja_transferiu,
    u.enviado_em AS ultimo_convite_em,
        CASE
            WHEN u.enviado_em IS NULL THEN NULL::integer
            ELSE CURRENT_DATE - u.enviado_em::date
        END AS dias_desde_o_convite,
    u.resposta AS ultima_resposta,
    f.telefone IS NOT NULL AS pode_disparar,
    (cg.em IS NOT NULL OR u.resposta = 'sim') AS confirmado,
        CASE
            WHEN cg.por_grupo THEN 'grupo'::text
            WHEN cg.em IS NOT NULL THEN 'confirmacao'::text
            WHEN u.resposta = 'sim' THEN 'resposta'::text
            ELSE NULL::text
        END AS confirmado_origem
   FROM fila_prazo f
     LEFT JOIN LATERAL ( SELECT e.enviado_em, e.resposta
           FROM pedagogico_envios e
          WHERE e.aluno_id = f.cpf AND (e.tipo = ANY (ARRAY['convite'::text, 'prazo_vencendo'::text])) AND e.status = 'aceito'::text
          ORDER BY e.enviado_em DESC
         LIMIT 1) u ON true
     LEFT JOIN LATERAL ( SELECT max(c.confirmado_em) AS em, bool_or(c.origem = 'grupo_whatsapp'::text) AS por_grupo
           FROM pedagogico_confirmacoes c
             JOIN dim_alunos a ON a.aluno_id = c.aluno_id
          WHERE a.cpf_norm = lpad(regexp_replace(COALESCE(f.cpf, ''::text), '\D'::text, ''::text, 'g'::text), 11, '0'::text)
            AND c.turma_id = f.proxima_turma) cg ON true
  WHERE COALESCE(f.turma_da_venda, ''::text) !~~* '%LISBOA%'::text AND f.curso !~~* '%MAESTRIA%'::text AND f.situacao <> 'vencido'::text AND f.proxima_turma IS NOT NULL AND f.proxima_turma_em <= f.vence_em AND f.proxima_turma_em >= (now() AT TIME ZONE 'America/Bahia')::date AND NOT (EXISTS ( SELECT 1
           FROM fato_credenciamento_turma ci
             JOIN dim_turma_salesforce ti ON ti.turma_id = ci.turma_id
          WHERE ci.cpf_norm = lpad(regexp_replace(COALESCE(f.cpf, ''::text), '\D'::text, ''::text, 'g'::text), 11, '0'::text) AND norm_curso(ti.curso_nome) = norm_curso(f.curso) AND NOT ci.elegivel AND NOT (EXISTS ( SELECT 1
                   FROM fato_credenciamento_turma ce
                     JOIN dim_turma_salesforce te ON te.turma_id = ce.turma_id
                  WHERE ce.cpf_norm = ci.cpf_norm AND norm_curso(te.curso_nome) = norm_curso(f.curso) AND ce.elegivel)))) AND pode_ver('pedagogico'::text);

notify pgrst, 'reload schema';
