"""FebraHub · Contratos GGB — Fase 2: gera e envia o contrato pelo Autentique.

Fluxo, por venda pendente (view `vw_contrato_pendente`):
  1. baixa a Ficha de Inscrição (Anexo I) em PDF do domínio Visualforce
     (GET autenticado em .../apex/fichaCliente?id=<venda>) — provado funcionar;
  2. junta o contrato de adesão PADRÃO (fixo, pré-assinado pela FEBRACIS) com a
     ficha num PDF só;
  3. cria o documento no Autentique com o ALUNO como signatário (envio por
     WhatsApp e/ou e-mail — isolado do consultor);
  4. grava a linha em `contrato_envio` (Central Financeira), status 'enviado'.

Roda no mesmo ambiente do sync (tem o login do Salesforce). NÃO passa pelo
Black CRM. Use --dry-run pra testar ficha+merge SEM tocar no Autentique nem
gravar nada.

Secrets: SALESFORCE_* (como o sync), SUPABASE_URL, SUPABASE_SERVICE_KEY,
AUTENTIQUE_TOKEN.
"""

import argparse
import io
import json
import os
import re
import sys

import requests
from pypdf import PdfReader, PdfWriter

from salesforce_api_sync import Salesforce, load_env

SB_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SB_KEY = os.getenv("SUPABASE_SERVICE_KEY") or ""
AUTENTIQUE_TOKEN = os.getenv("AUTENTIQUE_TOKEN") or ""
AUTENTIQUE_API = os.getenv("AUTENTIQUE_API", "https://api.autentique.com.br/v2/graphql")
DELIVERY = os.getenv("CONTRATO_DELIVERY", "whatsapp").lower()  # whatsapp | email
CONTRATO_PDF = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "assets", "contrato_ggb_salvador.pdf")

MUTATION = (
    "mutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {"
    " createDocument(document: $document, signers: $signers, file: $file) {"
    " id name signatures { public_id email link { short_link } } } }"
)


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- Supabase
def sb_get_pendentes(limite):
    r = requests.get(
        f"{SB_URL}/rest/v1/vw_contrato_pendente",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
        params={"select": "*", "limit": str(limite), "order": "comprou_em.asc"},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def sb_grava_envio(row, status, doc_id=None, link=None, erro=None):
    corpo = {
        "venda_id": row.get("venda_id"), "cpf": row.get("cpf"),
        "nome": row.get("nome"), "curso": row.get("curso"),
        "turma": row.get("turma"), "valor": row.get("valor"),
        "telefone": row.get("telefone"), "email": row.get("email"),
        "unidade": row.get("unidade"),
        "autentique_doc_id": doc_id, "link": link,
        "status": status, "erro": erro,
    }
    r = requests.post(
        f"{SB_URL}/rest/v1/contrato_envio",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        data=json.dumps(corpo), timeout=60,
    )
    if not r.ok:
        log(f"  ! falha ao gravar contrato_envio: {r.status_code} {r.text[:200]}")


# ---------------------------------------------------------------- Ficha (VF)
def vf_base(instance):
    host = re.sub(r"^https?://", "", instance)
    mydomain = host.split(".")[0]
    return (os.getenv("SALESFORCE_VF_URL") or f"https://{mydomain}--c.vf.force.com").rstrip("/")


def baixa_ficha(sf, base, venda_id):
    r = requests.get(f"{base}/apex/fichaCliente?id={venda_id}",
                     headers=sf.headers, allow_redirects=True, timeout=120)
    r.raise_for_status()
    if r.content[:4] != b"%PDF":
        raise RuntimeError(f"ficha nao veio em PDF (inicio={r.content[:12]!r})")
    return r.content


# ---------------------------------------------------------------- PDF
def contrato_limpo():
    """Contrato padrão, SEM a página de auditoria do Autentique (de quando foi
    pré-assinado) — senão o novo documento nasce com um relatório antigo."""
    reader = PdfReader(CONTRATO_PDF)
    writer = PdfWriter()
    for page in reader.pages:
        texto = (page.extract_text() or "").lower()
        if "relatório de auditoria" in texto or "autentique.com.br" in texto:
            continue
        writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def junta(contrato_bytes, ficha_bytes):
    writer = PdfWriter()
    for src in (contrato_bytes, ficha_bytes):
        for page in PdfReader(io.BytesIO(src)).pages:
            writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- Autentique
def e164(tel):
    d = re.sub(r"\D", "", str(tel or ""))
    if not d:
        return None
    if not d.startswith("55"):
        d = "55" + d
    return "+" + d


def cria_documento(nome, email, telefone, pdf_bytes, curso):
    signer = {"name": nome or "Aluno(a)", "action": "SIGN"}
    if email:
        signer["email"] = email
    tel = e164(telefone)
    if DELIVERY == "whatsapp" and tel:
        signer["phone"] = tel
        signer["delivery_method"] = "DELIVERY_METHOD_WHATSAPP"
    elif not email and tel:          # sem e-mail: cai pra SMS/WhatsApp
        signer["phone"] = tel
        signer["delivery_method"] = "DELIVERY_METHOD_WHATSAPP"

    variables = {
        "document": {"name": f"Contrato {curso} - {nome}"[:200], "refusable": True},
        "signers": [signer],
        "file": None,
    }
    operations = json.dumps({"query": MUTATION, "variables": variables})
    files = {
        "operations": (None, operations),
        "map": (None, json.dumps({"0": ["variables.file"]})),
        "0": ("contrato.pdf", pdf_bytes, "application/pdf"),
    }
    r = requests.post(AUTENTIQUE_API,
                      headers={"Authorization": f"Bearer {AUTENTIQUE_TOKEN}"},
                      files=files, timeout=180)
    dados = r.json()
    if r.status_code >= 300 or dados.get("errors"):
        raise RuntimeError(f"autentique: {json.dumps(dados.get('errors') or dados)[:300]}")
    doc = dados["data"]["createDocument"]
    sigs = doc.get("signatures") or []
    link = None
    for s in sigs:
        if (s.get("link") or {}).get("short_link"):
            link = s["link"]["short_link"]
            break
    return doc["id"], link


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limite", type=int, default=5, help="quantas vendas processar")
    ap.add_argument("--dry-run", action="store_true",
                    help="baixa ficha + junta, mas NAO cria no Autentique nem grava")
    ap.add_argument("--venda", help="processa SO esta venda (OpportunityId); util pra teste")
    args = ap.parse_args()
    load_env()

    sf = Salesforce()
    base = vf_base(sf.instance)
    log(f"instance={sf.instance} | vf={base} | delivery={DELIVERY} | dry_run={args.dry_run}")

    if args.venda:
        # Teste de uma venda específica: pega a linha da fila se existir; senão,
        # em dry-run, monta um registro mínimo só pra validar ficha + merge.
        pend = [r for r in sb_get_pendentes(1000) if r.get("venda_id") == args.venda]
        if not pend:
            if not args.dry_run:
                log("venda nao esta na fila (vw_contrato_pendente); abortando envio real.")
                return 1
            pend = [{"venda_id": args.venda, "nome": "TESTE", "curso": "TESTE"}]
    else:
        pend = sb_get_pendentes(args.limite)
    log(f"vendas pendentes: {len(pend)}")
    if not pend:
        return 0

    contrato = contrato_limpo()
    log(f"contrato base: {len(contrato)} bytes (paginas limpas)")

    enviados = erros = 0
    for i, row in enumerate(pend, 1):
        venda = row.get("venda_id")
        nome = row.get("nome")
        log(f"[{i}/{len(pend)}] {nome} · {row.get('curso_sigla') or row.get('curso')} · venda {venda}")
        try:
            if not row.get("telefone") and not row.get("email"):
                log("  - sem telefone e sem e-mail; pulando")
                if not args.dry_run:
                    sb_grava_envio(row, "erro", erro="sem telefone e sem e-mail")
                erros += 1
                continue

            ficha = baixa_ficha(sf, base, venda)
            pdf = junta(contrato, ficha)
            log(f"  - ficha {len(ficha)}b + contrato -> pacote {len(pdf)}b")

            if args.dry_run:
                nome_arq = f"pacote_{venda}.pdf"
                with open(nome_arq, "wb") as f:
                    f.write(pdf)
                log(f"  - DRY-RUN: pacote salvo em {nome_arq} (nao enviado)")
                enviados += 1
                continue

            doc_id, link = cria_documento(nome, row.get("email"),
                                          row.get("telefone"), pdf, row.get("curso"))
            sb_grava_envio(row, "enviado", doc_id=doc_id, link=link)
            log(f"  - OK Autentique doc {doc_id} | link {link}")
            enviados += 1
        except Exception as e:
            log(f"  ! erro: {e}")
            if not args.dry_run:
                sb_grava_envio(row, "erro", erro=str(e)[:400])
            erros += 1

    log(f"FIM: {enviados} processado(s), {erros} erro(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
