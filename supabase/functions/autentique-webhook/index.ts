// FebraHub · Edge Function `autentique-webhook`
// Recebe os eventos do Autentique e atualiza o status do contrato na Central
// Financeira (tabela `contrato_envio`, casada por autentique_doc_id).
//   signature.viewed    -> abriu  (só sobe de 'enviado', não rebaixa)
//   signature.accepted  -> assinou
//   document.finished   -> assinou
//   signature.rejected  -> erro ("assinatura recusada")
//
// verify_jwt = false: é um endpoint público (o Autentique chama). Segurança
// opcional por token na URL: se AUTENTIQUE_WEBHOOK_TOKEN estiver definido, a URL
// registrada no Autentique precisa trazer ?t=<token>.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN = Deno.env.get("AUTENTIQUE_WEBHOOK_TOKEN") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-autentique-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function patch(docId: string, fields: Record<string, unknown>, extraFilter = "") {
  const url = `${SB_URL}/rest/v1/contrato_envio?autentique_doc_id=eq.${encodeURIComponent(docId)}${extraFilter}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...fields, atualizado_em: new Date().toISOString() }),
  });
  if (!r.ok) console.error("contrato_envio patch falhou", r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "metodo invalido" }, 405);

  if (WEBHOOK_TOKEN) {
    const t = new URL(req.url).searchParams.get("t");
    if (t !== WEBHOOK_TOKEN) return json({ erro: "token invalido" }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "json invalido" }, 400); }

  const ev = body?.event ?? {};
  const type: string = ev?.type ?? "";
  const data = ev?.data ?? {};
  const docId: string = data?.document ?? data?.id ?? data?.object?.id ?? "";
  if (!docId) return json({ ok: true, ignorado: "sem id de documento" });

  const agora = new Date().toISOString();
  try {
    if (type === "signature.accepted" || type === "document.finished") {
      await patch(docId, { status: "assinou", assinou_em: data?.signed ?? agora });
    } else if (type === "signature.viewed") {
      // só promove de 'enviado' pra 'abriu' (não rebaixa quem já assinou)
      await patch(docId, { status: "abriu", abriu_em: data?.viewed ?? agora }, "&status=eq.enviado");
    } else if (type === "signature.rejected") {
      await patch(docId, { status: "erro", erro: "assinatura recusada" });
    } else {
      return json({ ok: true, ignorado: type });
    }
  } catch (e) {
    console.error("erro no webhook", String(e));
    return json({ erro: "falha ao atualizar" }, 500);
  }
  return json({ ok: true, tipo: type, documento: docId });
});
