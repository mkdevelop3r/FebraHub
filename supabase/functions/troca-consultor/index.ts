// ============================================================
// Edge Function: troca-consultor
//
// Executa no Black CRM as trocas de dono de lead já aprovadas no
// FebraHub. O TOKEN DO CRM vive aqui, como secret — nunca no navegador.
// Se o token ficasse no front, qualquer pessoa abriria o código-fonte e
// teria acesso de escrita a toda a base de contatos.
//
// COMO FUNCIONA
//   1. lê as solicitações com status 'aprovada' e ainda não executadas
//   2. para cada uma, chama PUT /contacts/{id} no CRM trocando assignedTo
//   3. grava o resultado de volta (executada / erro)
//
// A função NÃO decide quem pode trocar o quê — isso já foi resolvido
// pelas policies e pela solicitar_troca_consultor(). Aqui só executa o
// que foi aprovado.
//
// DEPLOY
//   supabase functions deploy troca-consultor
//   supabase secrets set CRM_TOKEN=...  CRM_LOCATION_ID=JedXhdJDbwOl6lvHCCfj
//
// Pode ser chamada por cron (a cada 2 min) ou pelo próprio front logo
// após registrar a solicitação.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_BASE = "https://services.leadconnectorhq.com";
const CRM_VERSION = "2021-07-28";
const LOTE = 25; // trocas por execução

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const crmToken = Deno.env.get("CRM_TOKEN");
  if (!crmToken) {
    return new Response(JSON.stringify({ erro: "CRM_TOKEN não configurado" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. o que está aprovado e ainda não foi executado
  const { data: fila, error: erroFila } = await db
    .from("troca_consultor_solicitacao")
    .select("id, contato_crm_id, dono_novo_crm_id, lead_nome")
    .eq("status", "aprovada")
    .is("executado_em", null)
    .order("criado_em", { ascending: true })
    .limit(LOTE);

  if (erroFila) {
    return new Response(JSON.stringify({ erro: erroFila.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (!fila || fila.length === 0) {
    return new Response(JSON.stringify({ ok: true, processadas: 0, mensagem: "Nada na fila." }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  }

  let sucesso = 0;
  let falha = 0;
  const detalhes: Array<Record<string, unknown>> = [];

  for (const item of fila) {
    try {
      const resp = await fetch(`${CRM_BASE}/contacts/${item.contato_crm_id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${crmToken}`,
          "Version": CRM_VERSION,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ assignedTo: item.dono_novo_crm_id }),
      });

      if (!resp.ok) {
        const corpo = await resp.text();
        throw new Error(`CRM ${resp.status}: ${corpo.slice(0, 300)}`);
      }

      await db.from("troca_consultor_solicitacao")
        .update({ status: "executada", executado_em: new Date().toISOString(), erro_msg: null })
        .eq("id", item.id);

      sucesso++;
      detalhes.push({ id: item.id, lead: item.lead_nome, resultado: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      await db.from("troca_consultor_solicitacao")
        .update({ status: "erro", erro_msg: msg })
        .eq("id", item.id);

      falha++;
      detalhes.push({ id: item.id, lead: item.lead_nome, resultado: "erro", msg });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processadas: fila.length, sucesso, falha, detalhes }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
