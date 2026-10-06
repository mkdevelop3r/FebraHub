// Mensagens automáticas do Pedagógico, executadas pelo pg_cron a cada 15 min.
// Deploy: supabase functions deploy mensagens-pedagogico --no-verify-jwt
// Secrets: CRM_TOKEN, CRM_LOCATION_ID e PEDAGOGICO_CRON_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_BASE = "https://services.leadconnectorhq.com";
const CRM_VERSION = "2021-07-28";
const CAMPO_CURSO = "aEypUKJotJp6CNa9qkjm";
const CAMPO_PRAZO = "hgKOTXvRxnNxFiULiRFi";
const CAMPO_PROXIMA = "oGv3CqcWa4lUekDI9Wap";
const CAMPO_DATAS = "qjFuniXeOdO812RlO3k4";
const CAMPO_HORARIOS = "NO62an9Rmr7izspnABUG";
const CAMPO_CREDENC = "Xjza3zFQ0KqopHqFVoJv";
const CAMPO_LINK = "fXr7R9YN5Jz7Hv14RoHm";
const CAMPO_LOCAL = "7DWYpa2RKKPer9JFJ9We";
const CAMPO_ENDERECO = "i9j1VCbhSSu8Gy32GbFT";
const TAG_BOAS = "pedagogico boas-vindas";
const TAG_PRAZO = "pedagogico prazo";
const TAG_CONFIRMACAO = "pedagogico:confirmacao";
const TAG_GRUPO = "pedagogico:grupo";
const TURMAS_BLOQUEADAS = new Set(["2026 - IF36"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

const dataBr = (iso?: string | null) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

const periodo = (inicio?: string | null, fim?: string | null) => {
  if (!inicio) return "";
  if (!fim || fim.slice(0, 10) === inicio.slice(0, 10)) return dataBr(inicio);
  const [a1, m1, d1] = inicio.slice(0, 10).split("-");
  const [a2, m2, d2] = fim.slice(0, 10).split("-");
  return a1 === a2 && m1 === m2 ? `${d1} a ${d2}/${m1}/${a1}` : `${dataBr(inicio)} a ${dataBr(fim)}`;
};

const horarioFaixa = (inicio?: string | null, fim?: string | null) => {
  const ini = String(inicio ?? "").trim();
  const ate = String(fim ?? "").trim();
  if (!ini) return "";
  return ate ? `das ${ini} às ${ate}` : `a partir das ${ini}`;
};

const tagTurma = (turma?: string | null) => {
  const partes = String(turma ?? "").split(" - ").map((p) => p.trim()).filter(Boolean);
  return partes.length ? `turma:${partes.slice(0, 2).join("_").toLowerCase()}` : null;
};

const hojeSalvador = () => {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método inválido" }, 405);

  const esperado = Deno.env.get("PEDAGOGICO_CRON_SECRET");
  if (!esperado || req.headers.get("x-cron-secret") !== esperado) {
    return json({ erro: "não autorizado" }, 401);
  }

  const crmToken = Deno.env.get("CRM_TOKEN");
  const crmLocation = Deno.env.get("CRM_LOCATION_ID");
  if (!crmToken || !crmLocation) return json({ erro: "secrets do CRM ausentes" }, 500);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const token = crypto.randomUUID();
  const { data: lock, error: lockError } = await db.rpc("adquirir_lock_mensagens_pedagogico", { p_token: token });
  if (lockError) return json({ erro: `lock: ${lockError.message}` }, 500);
  if (!lock) return json({ ok: true, ignorada: true, motivo: "outra execução ativa" });

  const crmHeaders = {
    Authorization: `Bearer ${crmToken}`,
    Version: CRM_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const detalhes: Array<Record<string, unknown>> = [];
  let enviados = 0, falhas = 0, pulados = 0, semRegistro = 0;

  const crmRequest = async (url: string, init: RequestInit) => {
    const resp = await fetch(url, { ...init, headers: crmHeaders });
    if (!resp.ok) throw new Error(`CRM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    return resp;
  };

  const upsertContato = async (linha: any, campos: Array<{ id: string; field_value: string }>) => {
    const telefone = String(linha.whatsapp ?? linha.telefone ?? "").trim();
    const email = String(linha.email ?? "").trim();
    if (!telefone && !email) throw new Error("sem telefone e sem e-mail");
    const body: Record<string, unknown> = { locationId: crmLocation, customFields: campos };
    if (linha.nome) body.name = linha.nome;
    if (telefone) body.phone = telefone;
    if (email) body.email = email;
    const resp = await crmRequest(`${CRM_BASE}/contacts/upsert`, { method: "POST", body: JSON.stringify(body) });
    const data = await resp.json();
    const id = data?.contact?.id ?? data?.id;
    if (!id) throw new Error("upsert não devolveu contactId");
    return id as string;
  };

  const aplicarTags = async (contactId: string, tags: Array<string | null>) => {
    const validas = tags.filter(Boolean);
    await crmRequest(`${CRM_BASE}/contacts/${contactId}/tags`, {
      method: "POST", body: JSON.stringify({ tags: validas }),
    });
  };

  const processar = async (
    fila: any[], tipo: "boas_vindas" | "turma" | "prazo",
  ) => {
    for (const linha of fila) {
      const rotulo = linha.nome ?? linha.aluno_id;
      try {
        const campos = [{ id: CAMPO_CURSO, field_value: String(linha.curso ?? "") }];
        let tag = TAG_BOAS;
        if (tipo === "boas_vindas") {
          if (linha.data_limite) campos.push({ id: CAMPO_PRAZO, field_value: dataBr(linha.data_limite) });
        } else if (tipo === "prazo") {
          const proxima = dataBr(linha.proxima_turma_em);
          const link = String(linha.link_grupo ?? "").trim();
          if (!proxima || !link) {
            pulados++;
            detalhes.push({
              aluno: rotulo,
              resultado: "pulado",
              motivo: !proxima ? "sem próxima turma" : "sem link_grupo",
            });
            continue;
          }
          if (linha.vence_em) campos.push({ id: CAMPO_PRAZO, field_value: dataBr(linha.vence_em) });
          campos.push({ id: CAMPO_PROXIMA, field_value: proxima });
          campos.push({ id: CAMPO_LINK, field_value: link });
          tag = TAG_PRAZO;
        } else {
          if (!linha.link_grupo) {
            pulados++; detalhes.push({ aluno: rotulo, resultado: "pulado", motivo: "sem link_grupo" });
            continue;
          }
          const adicionais = [
            [CAMPO_DATAS, periodo(linha.data_inicio, linha.data_fim)],
            [CAMPO_HORARIOS, horarioFaixa(linha.horario_inicio, linha.horario_fim)],
            [CAMPO_CREDENC, String(linha.horario_credenciamento ?? "")],
            [CAMPO_LOCAL, String(linha.local ?? "")],
            [CAMPO_ENDERECO, String(linha.endereco ?? "")],
            [CAMPO_LINK, String(linha.link_grupo)],
          ];
          for (const [id, value] of adicionais) if (value) campos.push({ id, field_value: value });
          tag = linha.tipo === "confirmacao" ? TAG_CONFIRMACAO : TAG_GRUPO;
        }

        const contactId = await upsertContato(linha, campos);
        await aplicarTags(contactId, [tag, tagTurma(linha.turma_id)]);

        const item: Record<string, unknown> = {
          aluno_id: linha.aluno_id, turma_id: linha.turma_id,
          canal: linha.canal ?? "whatsapp",
        };
        if (linha.tipo) item.tipo = linha.tipo;
        const rpc = tipo === "boas_vindas"
          ? "registrar_envio_boas_vindas"
          : tipo === "prazo"
          ? "registrar_envio_prazo"
          : "registrar_envio_turma";
        const { error } = await db.rpc(rpc, { p_itens: [item] });
        if (error) {
          semRegistro++;
          detalhes.push({ aluno: rotulo, resultado: "sem_registro", erro: error.message });
        } else {
          enviados++;
          detalhes.push({ aluno: rotulo, resultado: "ok", fila: tipo });
        }
      } catch (e) {
        falhas++;
        detalhes.push({ aluno: rotulo, resultado: "erro", erro: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  let status = "ok";
  let mensagem = "Execução serverless concluída.";
  try {
    const { data: iniciadas, error: erroTurmas } = await db.from("dim_turmas")
      .select("turma_id").lte("data_inicio", hojeSalvador());
    if (erroTurmas) throw new Error(`turmas: ${erroTurmas.message}`);
    const bloqueadas = new Set([...TURMAS_BLOQUEADAS, ...(iniciadas ?? []).map((t: any) => String(t.turma_id))]);

    const { data: boas, error: erroBoas } = await db.from("vw_boas_vindas_fila").select("*").limit(1000);
    if (erroBoas) throw new Error(`boas-vindas: ${erroBoas.message}`);
    const filaBoas = (boas ?? []).filter((l: any) => !bloqueadas.has(String(l.turma_id ?? ""))).slice(0, 5);
    await processar(filaBoas, "boas_vindas");

    const { data: turma, error: erroFila } = await db.from("vw_turma_fila_envio").select("*").limit(1000);
    if (erroFila) throw new Error(`fila de turma: ${erroFila.message}`);
    const filaTurma = (turma ?? []).filter((l: any) => !bloqueadas.has(String(l.turma_id ?? ""))).slice(0, 10);
    await processar(filaTurma, "turma");

    const { data: prazo, error: erroPrazo } = await db.from("vw_prazo_fila_envio").select("*").limit(1000);
    if (erroPrazo) throw new Error(`fila de represados: ${erroPrazo.message}`);
    const filaPrazo = (prazo ?? []).filter((l: any) => !bloqueadas.has(String(l.turma_id ?? ""))).slice(0, 10);
    await processar(filaPrazo, "prazo");

    if (falhas || semRegistro) {
      status = semRegistro ? "erro" : "parcial";
      mensagem = `${enviados} enviados, ${falhas} falhas, ${pulados} pulados, ${semRegistro} sem registro.`;
    } else {
      mensagem = `${enviados} enviados; ${pulados} pulados.`;
    }
  } catch (e) {
    status = "erro";
    mensagem = e instanceof Error ? e.message : String(e);
  } finally {
    const now = new Date().toISOString();
    await db.from("integracao_status").upsert({
      fonte: "mensagens_pedagogico", nome_exibicao: "Mensagens Pedagogico",
      ultima_sync: now, registros: enviados, status, mensagem, atualizado_em: now,
    }, { onConflict: "fonte" });
    await db.rpc("liberar_lock_mensagens_pedagogico", { p_token: token });
  }

  return json({ ok: status === "ok", status, enviados, falhas, pulados, sem_registro: semRegistro, detalhes }, status === "erro" ? 500 : 200);
});
