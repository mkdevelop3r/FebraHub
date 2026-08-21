#!/usr/bin/env python3
"""
FebraHub · blackcrm_leads_sync.py
Puxa as oportunidades (leads) do Black CRM / LeadConnector e grava em
public.fato_crm_lead no Supabase.

POR QUE EXISTE
    O Clint foi desativado e a captação de leads parou em 13/07/2026 —
    a fato_negocio_lead virou histórico congelado. A operação migrou para
    o Black CRM, onde os leads seguem entrando. Este script é a ponte nova.

O QUE TRAZ DE MELHOR
    O Black CRM já classifica a origem em `source` ("LP IF SALVADOR",
    "Instagram Direct - CIS", "WhatsApp Oficial") e traz `attributions`
    com o mediumId — o ID do anúncio no Meta. Isso permite ligar
    lead -> anúncio -> gasto e calcular CPL por anúncio, o que o Clint
    não permitia.

USO
    python blackcrm_leads_sync.py --diagnostico   # só inspeciona, não grava
    python blackcrm_leads_sync.py --full          # carga completa (histórico)
    python blackcrm_leads_sync.py                 # incremental (padrão, 7 dias)
    python blackcrm_leads_sync.py --dias 30       # incremental de 30 dias

SECRETS (env)
    BLACKCRM_TOKEN        token da API (Private Integration do LeadConnector)
    BLACKCRM_LOCATION_ID  id da location
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
"""

import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta

import requests

# ---------------------------------------------------------------- config
CRM_BASE = "https://services.leadconnectorhq.com"
CRM_VERSION = "2021-07-28"

TOKEN = os.environ.get("BLACKCRM_TOKEN", "")
LOCATION_ID = os.environ.get("BLACKCRM_LOCATION_ID", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

TABELA = "fato_crm_lead"
PAGINA = 100          # máximo aceito pelo endpoint
LOTE_UPSERT = 500     # linhas por request ao Supabase
PAUSA = 0.25          # respiro entre páginas, para não estourar rate limit

CRM_HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Version": CRM_VERSION,
    "Accept": "application/json",
}

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def checar_ambiente():
    faltando = [k for k, v in {
        "BLACKCRM_TOKEN": TOKEN,
        "BLACKCRM_LOCATION_ID": LOCATION_ID,
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_SERVICE_KEY": SUPABASE_KEY,
    }.items() if not v]
    if faltando:
        log(f"ERRO: variáveis ausentes: {', '.join(faltando)}")
        sys.exit(1)


# ---------------------------------------------------------------- extração
def buscar_pagina(start_after=None, start_after_id=None, data_inicio=None):
    """Uma página de oportunidades, mais recentes primeiro."""
    # NÃO passar `order`: o endpoint devolve lista VAZIA (sem erro) com
    # order=added_desc. Sem o parâmetro, já vem do mais recente para o mais
    # antigo, que é o que a paginação por startAfter espera.
    params = {
        "location_id": LOCATION_ID,
        "limit": PAGINA,
        "status": "all",
    }
    if start_after and start_after_id:
        params["startAfter"] = start_after
        params["startAfterId"] = start_after_id
    if data_inicio:
        params["date"] = data_inicio  # mm-dd-yyyy

    r = requests.get(f"{CRM_BASE}/opportunities/search",
                     headers=CRM_HEADERS, params=params, timeout=60)

    if r.status_code == 429:            # rate limit: espera e tenta de novo
        log("  rate limit — aguardando 10s")
        time.sleep(10)
        return buscar_pagina(start_after, start_after_id, data_inicio)

    if r.status_code >= 300:
        log(f"  HTTP {r.status_code}: {r.text[:400]}")
    r.raise_for_status()

    dados = r.json().get("data", {})

    # Vazio sem erro é sintoma de parâmetro recusado silenciosamente
    # (foi o que aconteceu com order=added_desc). Mostra o que veio.
    if not dados.get("opportunities") and not start_after:
        log(f"  resposta sem oportunidades — meta: {json.dumps(dados.get('meta', {}))}")
        log(f"  params enviados: {json.dumps(params)}")

    return dados


def coletar(dias=None, limite_paginas=None):
    """Percorre as páginas até acabar (ou até passar da janela de dias)."""
    corte = None
    if dias:
        corte = datetime.now(timezone.utc) - timedelta(days=dias)

    oportunidades, sa, sai, pagina = [], None, None, 0

    while True:
        pagina += 1
        dados = buscar_pagina(sa, sai)
        lote = dados.get("opportunities", [])
        if not lote:
            break

        oportunidades.extend(lote)
        meta = dados.get("meta", {})
        sa, sai = meta.get("startAfter"), meta.get("startAfterId")
        total = meta.get("total", "?")
        log(f"  página {pagina}: +{len(lote)} (acumulado {len(oportunidades)} de {total})")

        # incremental: para quando a página já é toda anterior ao corte
        if corte:
            criado = lote[-1].get("createdAt")
            if criado and datetime.fromisoformat(criado.replace("Z", "+00:00")) < corte:
                log("  janela alcançada")
                break

        if limite_paginas and pagina >= limite_paginas:
            break
        if not sa or not sai:
            break

        time.sleep(PAUSA)

    return oportunidades


# ---------------------------------------------------------------- transformação
def txt(v):
    """Normaliza para texto ou None — nunca string vazia (evita 22007/23503)."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def primeira_atribuicao(op):
    """A atribuição de primeiro toque; cai para a última se não houver."""
    atrs = op.get("attributions") or []
    if not atrs:
        return {}
    for a in atrs:
        if a.get("isFirst"):
            return a
    return atrs[0]


def transformar(op):
    contato = op.get("contact") or {}
    atr = primeira_atribuicao(op)

    return {
        "oportunidade_id":   txt(op.get("id")),
        "contato_id":        txt(op.get("contactId")),
        "nome":              txt(contato.get("name") or op.get("name")),
        "email":             txt(contato.get("email")),
        "telefone":          txt(contato.get("phone")),
        "fonte":             txt(op.get("source")),
        "pipeline_id":       txt(op.get("pipelineId")),
        "pipeline_etapa_id": txt(op.get("pipelineStageId")),
        "status":            txt(op.get("status")),
        "valor":             op.get("monetaryValue") or 0,
        "responsavel_id":    txt(op.get("assignedTo")),
        "tags":              contato.get("tags") or [],
        "meio":              txt(atr.get("medium")),
        "meio_id":           txt(atr.get("mediumId")),
        "utm_source":        txt(atr.get("utmSessionSource")),
        "criado_em":         txt(op.get("createdAt")),
        "atualizado_em":     txt(op.get("updatedAt")),
        "sincronizado_em":   datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------- carga
def gravar(linhas):
    if not linhas:
        return 0
    gravadas = 0
    url = f"{SUPABASE_URL}/rest/v1/{TABELA}?on_conflict=oportunidade_id"

    for i in range(0, len(linhas), LOTE_UPSERT):
        lote = linhas[i:i + LOTE_UPSERT]
        r = requests.post(url, headers=SB_HEADERS, json=lote, timeout=120)
        if r.status_code >= 300:
            log(f"ERRO no upsert (linhas {i}-{i+len(lote)}): {r.status_code} {r.text[:400]}")
            r.raise_for_status()
        gravadas += len(lote)
        log(f"  gravadas {gravadas}/{len(linhas)}")

    return gravadas


def marcar_status(registros, status="ok", mensagem=None):
    """Registra na integracao_status para a Central de APIs enxergar."""
    payload = [{
        "fonte": "blackcrm_leads",
        "nome_exibicao": "Leads (Black CRM)",
        "ultima_sync": datetime.now(timezone.utc).isoformat(),
        "registros": registros,
        "status": status,
        "mensagem": mensagem,
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
    }]
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/integracao_status?on_conflict=fonte",
            headers=SB_HEADERS, json=payload, timeout=30,
        )
    except Exception as e:
        log(f"aviso: não consegui atualizar integracao_status ({e})")


# ---------------------------------------------------------------- diagnóstico
def diagnostico():
    """Inspeciona a fonte sem gravar nada — obrigatório antes de integrar."""
    log("DIAGNÓSTICO — buscando 2 páginas de amostra")
    amostra = coletar(limite_paginas=2)

    if not amostra:
        log("nenhuma oportunidade retornada")
        return

    log(f"\ntotal na amostra: {len(amostra)}")
    log("\nchaves presentes no primeiro registro:")
    for k in sorted(amostra[0].keys()):
        log(f"  {k}")

    campos = ["id", "contactId", "source", "status", "pipelineId",
              "createdAt", "monetaryValue", "assignedTo"]
    log("\ntaxa de preenchimento (nível oportunidade):")
    for c in campos:
        n = sum(1 for o in amostra if o.get(c) not in (None, "", 0))
        log(f"  {c:<18} {n}/{len(amostra)} ({100*n//len(amostra)}%)")

    log("\ntaxa de preenchimento (nível contato):")
    for c in ["name", "email", "phone", "tags"]:
        n = sum(1 for o in amostra if (o.get("contact") or {}).get(c))
        log(f"  {c:<18} {n}/{len(amostra)} ({100*n//len(amostra)}%)")

    n_atr = sum(1 for o in amostra if o.get("attributions"))
    n_mid = sum(1 for o in amostra if primeira_atribuicao(o).get("mediumId"))
    log(f"\nattributions        {n_atr}/{len(amostra)}")
    log(f"  com mediumId      {n_mid}/{len(amostra)}  <- liga com o anúncio do Meta")

    fontes = {}
    for o in amostra:
        fontes[o.get("source") or "(sem fonte)"] = fontes.get(o.get("source") or "(sem fonte)", 0) + 1
    log("\nfontes (source) na amostra:")
    for f, n in sorted(fontes.items(), key=lambda x: -x[1]):
        log(f"  {n:>4}  {f}")

    log("\nexemplo transformado:")
    log(json.dumps(transformar(amostra[0]), indent=2, ensure_ascii=False, default=str))


# ---------------------------------------------------------------- main
def main():
    checar_ambiente()
    args = sys.argv[1:]

    if "--diagnostico" in args:
        diagnostico()
        return

    full = "--full" in args
    dias = None
    if "--dias" in args:
        dias = int(args[args.index("--dias") + 1])
    elif not full:
        dias = 7  # incremental padrão

    modo = "COMPLETA (histórico)" if full else f"INCREMENTAL ({dias} dias)"
    log(f"Sync Black CRM -> {TABELA} · carga {modo}")

    try:
        brutas = coletar(dias=dias)
        log(f"coletadas {len(brutas)} oportunidades")

        linhas = [transformar(o) for o in brutas]
        linhas = [l for l in linhas if l["oportunidade_id"]]

        # dedup defensivo: a paginação pode repetir na borda
        vistos, unicas = set(), []
        for l in linhas:
            if l["oportunidade_id"] not in vistos:
                vistos.add(l["oportunidade_id"])
                unicas.append(l)

        if len(unicas) != len(linhas):
            log(f"removidas {len(linhas) - len(unicas)} duplicatas de paginação")

        n = gravar(unicas)
        log(f"OK — {n} linhas gravadas")
        marcar_status(n)

    except Exception as e:
        log(f"FALHOU: {e}")
        marcar_status(0, status="erro", mensagem=str(e)[:300])
        raise


if __name__ == "__main__":
    main()
