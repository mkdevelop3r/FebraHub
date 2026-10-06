#!/usr/bin/env python3
"""Mede a primeira mensagem humana enviada a leads de campanhas ativas."""
import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests

CRM = "https://services.leadconnectorhq.com"
TOKEN = os.environ["BLACKCRM_TOKEN"]
LOCATION = os.environ["BLACKCRM_LOCATION_ID"]
SB_URL = os.environ["SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CRM_HEADERS = {"Authorization": f"Bearer {TOKEN}", "Version": "2021-04-15", "Accept": "application/json"}
SB_HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}


def crm(path, params=None):
    for tentativa in range(4):
        r = requests.get(f"{CRM}{path}", headers=CRM_HEADERS, params=params, timeout=45)
        if r.status_code != 429:
            r.raise_for_status()
            return r.json()
        time.sleep(5 * (tentativa + 1))
    r.raise_for_status()


def candidatos():
    params = {
        "select": "oportunidade_id,contato_id,criado_em,responsavel_id,primeiro_atendimento_em,verificado_em",
        "primeiro_atendimento_em": "is.null", "order": "verificado_em.asc.nullsfirst", "limit": "300",
    }
    r = requests.get(f"{SB_URL}/rest/v1/vw_mkt_atendimento_candidatos?{urlencode(params)}",
                     headers=SB_HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()


def mensagens(contato_id):
    busca = crm("/conversations/search", {"locationId": LOCATION, "contactId": contato_id, "limit": 10})
    todas = []
    for conversa in busca.get("conversations") or []:
        resposta = crm(f"/conversations/{conversa['id']}/messages", {"limit": 100})
        for msg in (resposta.get("messages") or {}).get("messages") or []:
            msg["_conversa_id"] = conversa["id"]
            todas.append(msg)
    return todas


def primeira_humana(msgs, criado_em):
    inicio = criado_em or ""
    validas = [m for m in msgs
               if m.get("direction") == "outbound"
               and m.get("userId")
               and (m.get("source") or "").lower() != "bulk_actions"
               and not (m.get("messageType") or "").startswith("TYPE_ACTIVITY")
               and (m.get("dateAdded") or "") >= inicio]
    if not validas:
        return None
    return min(validas, key=lambda m: m.get("dateAdded") or "")


def gravar(registros):
    if not registros:
        return
    h = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(f"{SB_URL}/rest/v1/fato_crm_primeiro_atendimento?on_conflict=oportunidade_id",
                      headers=h, json=registros, timeout=60)
    r.raise_for_status()


def main():
    agora = datetime.now(timezone.utc).isoformat()
    linhas = candidatos()
    saida = []
    encontrados = 0
    for i, lead in enumerate(linhas, 1):
        try:
            primeira = primeira_humana(mensagens(lead["contato_id"]), lead.get("criado_em"))
            if primeira:
                encontrados += 1
            saida.append({
                "oportunidade_id": lead["oportunidade_id"],
                "conversa_id": primeira.get("_conversa_id") if primeira else None,
                "primeiro_atendimento_em": primeira.get("dateAdded") if primeira else None,
                "responsavel_id": primeira.get("userId") if primeira else lead.get("responsavel_id"),
                "canal": primeira.get("messageType") if primeira else None,
                "verificado_em": agora,
            })
        except requests.HTTPError as e:
            print(f"aviso {lead['oportunidade_id']}: HTTP {e.response.status_code}")
        if len(saida) >= 50:
            gravar(saida)
            saida = []
        if i % 25 == 0:
            print(f"{i}/{len(linhas)} verificados")
        time.sleep(.12)
    gravar(saida)
    print(f"{len(linhas)} leads verificados; {encontrados} com primeiro atendimento")


if __name__ == "__main__":
    main()
