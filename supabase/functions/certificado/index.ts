// FebraHub · Edge Function `certificado`
// Gera o PDF do certificado NA HORA (nada fica guardado): recebe um token,
// busca o conteúdo em certificado_link, desenha por cima do template (Storage)
// e devolve application/pdf. É o mesmo link que serve download no app e envio
// por WhatsApp/e-mail (Black CRM) — o WhatsApp exige URL que entregue o arquivo
// com Content-Type application/pdf, que é o que esta função faz.
// verify_jwt = false: a Meta/WhatsApp baixa sem autenticação; o token (uuid
// aleatório) é o que protege.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ddmmyyyy = (s: string | null) => {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

// Desenha texto centrado em centerX, reduzindo o corpo se passar de maxW.
function centrado(page: any, txt: string, font: any, size: number, centerX: number, y: number, maxW: number, color: any) {
  let s = size;
  while (s > 8 && font.widthOfTextAtSize(txt, s) > maxW) s -= 0.5;
  const w = font.widthOfTextAtSize(txt, s);
  page.drawText(txt, { x: centerX - w / 2, y, size: s, font, color });
  return s;
}

// Quebra em linhas centradas que cabem em maxW.
function paragrafo(page: any, txt: string, font: any, size: number, centerX: number, yTopo: number, maxW: number, color: any) {
  const palavras = txt.split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? atual + " " + p : p;
    if (font.widthOfTextAtSize(teste, size) > maxW && atual) { linhas.push(atual); atual = p; }
    else atual = teste;
  }
  if (atual) linhas.push(atual);
  let y = yTopo;
  for (const l of linhas) {
    const w = font.widthOfTextAtSize(l, size);
    page.drawText(l, { x: centerX - w / 2, y, size, font, color });
    y -= size * 1.45;
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const seg = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const token = (url.searchParams.get("token") ?? seg).replace(/\.pdf$/i, "");
    if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("token inválido", { status: 400 });

    // conteúdo do certificado (só texto; nunca há PDF guardado)
    const r = await fetch(`${SB_URL}/rest/v1/certificado_link?token=eq.${token}&select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const linhas = await r.json();
    if (!Array.isArray(linhas) || !linhas.length) return new Response("certificado não encontrado", { status: 404 });
    const c = linhas[0];

    // template (arte) do Storage
    const tpl = await fetch(`${SB_URL}/storage/v1/object/certificados/template.pdf`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!tpl.ok) return new Response("template indisponível", { status: 500 });
    const tplBytes = new Uint8Array(await tpl.arrayBuffer());

    const pdf = await PDFDocument.load(tplBytes);
    const page = pdf.getPages()[0];
    const { width: W, height: H } = page.getSize();
    const serif = await pdf.embedFont(StandardFonts.TimesRoman);
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const branco = rgb(0.98, 0.98, 0.98);

    const cx = W * 0.375;        // centro da área escura à esquerda
    const maxW = W * 0.60;       // largura útil antes da faixa/selo
    const nome = String(c.nome ?? "").toUpperCase();
    const curso = String(c.curso ?? "").toUpperCase();
    const periodo = `${ddmmyyyy(c.periodo_ini)} A ${ddmmyyyy(c.periodo_fim)}`;
    const carga = c.carga_horaria != null ? `, COM CARGA HORÁRIA DE ${c.carga_horaria}H/AULA` : "";

    centrado(page, "CONFERE A CERTIFICAÇÃO A:", serif, 13, cx, H * 0.575, maxW, branco);
    centrado(page, nome, serifBold, 30, cx, H * 0.50, maxW, branco);
    centrado(page, `PELA CONCLUSÃO DO CURSO ${curso}`, serifBold, 13, cx, H * 0.415, maxW, branco);
    paragrafo(page, `REALIZADO PELA FEBRACIS, NO PERÍODO DE ${periodo}${carga}.`, serif, 11.5, cx, H * 0.365, maxW, branco);

    const bytes = await pdf.save();
    const nomeArq = `Certificado - ${String(c.nome ?? "")}.pdf`.replace(/[^\w\s.\-]/g, "");
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeArq}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`erro: ${e}`, { status: 500 });
  }
});
