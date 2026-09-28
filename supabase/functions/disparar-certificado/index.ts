// FebraHub · Edge Function `disparar-certificado`
// Recebe a lista de credenciados de uma turma (com os campos já editados),
// gera/atualiza o token do certificado (certificado_link), grava a URL no campo
// personalizado `certificado_url` do contato no Black CRM e aplica a tag
// `enviar_certificado` — que dispara o workflow (WhatsApp DOCUMENT + e-mail).
// O PDF continua gerado on-demand pela função `certificado`; aqui só se move o
// link + a tag (mecânica do "Tour").
//
// verify_jwt = false: tratamos CORS e validamos o usuário (setor pedagógico)
// manualmente a partir do token enviado pelo app.

const SB_URL   = Deno.env.get("SUPABASE_URL")!;
const SB_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRM_TOKEN = Deno.env.get("CRM_TOKEN")!;
const CRM_LOCATION = Deno.env.get("CRM_LOCATION_ID") ?? "JedXhdJDbwOl6lvHCCfj";
const CERT_FIELD_ID = Deno.env.get("CERT_FIELD_ID") ?? "pOLGEB3taGpLlRFjb7fD"; // contact.certificado_url
const CERT_TAG = Deno.env.get("CERT_TAG") ?? "enviar_certificado";

const CRM_API = "https://services.leadconnectorhq.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const sb = (headers: Record<string, string> = {}) => ({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...headers,
});
const crm = { Authorization: `Bearer ${CRM_TOKEN}`, Version: "2021-07-28", "Content-Type": "application/json" };

// valida o token do app e confirma que é do pedagógico/geral/admin
async function usuarioAutorizado(auth: string | null): Promise<boolean> {
  if (!auth) return false;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: auth } });
  if (!u.ok) return false;
  const user = await u.json();
  const uid = user?.id;
  if (!uid) return false;
  const p = await fetch(`${SB_URL}/rest/v1/perfis?id=eq.${uid}&select=setor,papel`, { headers: sb() });
  const perfil = (await p.json())?.[0];
  if (perfil?.papel === "admin" || ["pedagogico", "geral"].includes(perfil?.setor)) return true;
  const ps = await fetch(`${SB_URL}/rest/v1/perfil_setores?perfil_id=eq.${uid}&select=setor`, { headers: sb() });
  const setores = ((await ps.json()) ?? []).map((r: any) => r.setor);
  return setores.includes("pedagogico") || setores.includes("geral");
}

async function upsertToken(p: any): Promise<string> {
  const linha = {
    turma_id: p.turma_id, cpf: p.cpf, nome: p.nome, curso: p.curso,
    periodo_ini: p.periodo_ini || null, periodo_fim: p.periodo_fim || null,
    carga_horaria: p.carga_horaria == null || p.carga_horaria === "" ? null : Number(p.carga_horaria),
    email: p.email || null, telefone: p.telefone || null,
  };
  const r = await fetch(`${SB_URL}/rest/v1/certificado_link?on_conflict=turma_id,cpf`, {
    method: "POST",
    headers: sb({ Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(linha),
  });
  if (!r.ok) throw new Error(`token: ${await r.text()}`);
  const row = (await r.json())?.[0];
  return row.token;
}

async function dispararPessoa(p: any): Promise<{ ok: boolean; motivo?: string }> {
  const telefone = (p.telefone || "").toString().trim();
  const email = (p.email || "").toString().trim();
  if (!telefone && !email) return { ok: false, motivo: "sem telefone e sem e-mail" };

  const token = await upsertToken(p);
  const url = `${SB_URL}/functions/v1/certificado/${token}.pdf`;

  const corpo: any = { locationId: CRM_LOCATION, customFields: [{ id: CERT_FIELD_ID, field_value: url }] };
  if (p.nome) corpo.name = p.nome;
  if (telefone) corpo.phone = telefone;
  if (email) corpo.email = email;

  const up = await fetch(`${CRM_API}/contacts/upsert`, { method: "POST", headers: crm, body: JSON.stringify(corpo) });
  if (!up.ok) return { ok: false, motivo: `crm upsert: ${(await up.text()).slice(0, 200)}` };
  const d = await up.json();
  const contactId = d?.contact?.id ?? d?.id;
  if (!contactId) return { ok: false, motivo: "sem contactId" };

  const tg = await fetch(`${CRM_API}/contacts/${contactId}/tags`, {
    method: "POST", headers: crm, body: JSON.stringify({ tags: [CERT_TAG] }),
  });
  if (!tg.ok) return { ok: false, motivo: `crm tag: ${(await tg.text()).slice(0, 200)}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método inválido" }, 405);

  if (!(await usuarioAutorizado(req.headers.get("Authorization")))) {
    return json({ erro: "sem permissão" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "json inválido" }, 400); }
  let pessoas: any[] = Array.isArray(body?.pessoas) ? body.pessoas : [];
  if (body?.teste) pessoas = pessoas.filter((p) => p.cpf === body.teste).slice(0, 1);
  if (!pessoas.length) return json({ erro: "nenhuma pessoa" }, 400);

  let enviados = 0, sem_contato = 0;
  const erros: any[] = [];
  // processa em lotes de 5 pra não estourar o tempo
  for (let i = 0; i < pessoas.length; i += 5) {
    const lote = pessoas.slice(i, i + 5);
    const res = await Promise.all(lote.map(async (p) => {
      try { return await dispararPessoa(p); }
      catch (e) { return { ok: false, motivo: String(e).slice(0, 200) }; }
    }));
    res.forEach((r, j) => {
      if (r.ok) enviados++;
      else if (r.motivo?.includes("sem telefone")) sem_contato++;
      else erros.push({ cpf: lote[j].cpf, nome: lote[j].nome, motivo: r.motivo });
    });
  }
  return json({ enviados, sem_contato, erros, total: pessoas.length });
});
