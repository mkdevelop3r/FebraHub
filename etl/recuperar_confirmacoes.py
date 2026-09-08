#!/usr/bin/env python3
"""Recupera confirmações inequívocas que ficaram sem tag no CRM.

Por segurança, o padrão é diagnóstico. Só grava com ``--aplicar`` e somente
quando encontra uma mensagem inbound posterior ao envio cujo texto normalizado
é exatamente ``sim`` ou ``s``. Áudio, emoji isolado e frases ambíguas ficam
para conferência humana.
"""

import argparse
import os
import re
import time
import unicodedata
from datetime import datetime, timezone

import requests


SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CRM_TOKEN = os.environ["CRM_TOKEN"]
CRM_LOCATION = os.environ["CRM_LOCATION_ID"]
CRM_API = "https://services.leadconnectorhq.com"
SB = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
CRM = {"Authorization": f"Bearer {CRM_TOKEN}", "Version": "2021-07-28"}


def falhou(r):
    if not r.ok:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return r


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "", texto)


def instante(valor):
    if valor is None:
        return None
    if isinstance(valor, (int, float)) or str(valor).isdigit():
        numero = float(valor)
        if numero > 10_000_000_000:
            numero /= 1000
        return datetime.fromtimestamp(numero, timezone.utc)
    return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))


def pendentes(turma):
    r = falhou(requests.get(
        f"{SUPABASE_URL}/rest/v1/vw_respostas_pendentes",
        headers=SB,
        params={"turma_id": f"eq.{turma}", "tipo": "eq.confirmacao", "select": "*"},
        timeout=60,
    ))
    return r.json()


def contato(telefone, email):
    consultas = []
    digitos = re.sub(r"\D", "", telefone or "")
    if digitos.startswith("55") and len(digitos) in (12, 13):
        digitos = digitos[2:]
    if len(digitos) in (10, 11):
        consultas.append("+55" + digitos)
    if email:
        consultas.append(email)
    for consulta in consultas:
        r = requests.get(
            f"{CRM_API}/contacts/", headers=CRM,
            params={"query": consulta, "limit": 1, "locationId": CRM_LOCATION}, timeout=30,
        )
        if r.ok:
            encontrados = (r.json() or {}).get("contacts") or []
            if encontrados:
                return encontrados[0]
    return None


def mensagens(contact_id):
    busca = falhou(requests.get(
        f"{CRM_API}/conversations/search", headers=CRM,
        params={"locationId": CRM_LOCATION, "contactId": contact_id, "limit": 10}, timeout=30,
    )).json()
    conversas = busca.get("conversations") or []
    todas = []
    for conversa in conversas:
        resposta = falhou(requests.get(
            f"{CRM_API}/conversations/{conversa['id']}/messages", headers=CRM,
            params={"limit": 100}, timeout=30,
        )).json()
        todas.extend((resposta.get("messages") or {}).get("messages") or [])
    return todas


def main(turma, aplicar):
    fila = pendentes(turma)
    recuperar, ambiguos, sem_contato, falhas = [], 0, 0, 0
    print(f"{turma}: {len(fila)} confirmações pendentes", flush=True)

    for linha in fila:
        try:
            c = contato(linha.get("telefone"), linha.get("email"))
            if not c:
                sem_contato += 1
                continue
            enviados_em = instante(linha.get("enviado_em"))
            entradas = []
            for msg in mensagens(c["id"]):
                if msg.get("direction") != "inbound":
                    continue
                quando = instante(msg.get("dateAdded"))
                if quando and enviados_em and quando >= enviados_em:
                    entradas.append((quando, normalizar(msg.get("body"))))
            entradas.sort()
            respostas_sim = [texto for _, texto in entradas if texto in {"sim", "s"}]
            if respostas_sim:
                recuperar.append({
                    "aluno_id": linha["aluno_id"], "turma_id": linha["turma_id"],
                    "tipo": "confirmacao", "resposta": "sim",
                })
            elif entradas:
                ambiguos += 1
        except Exception as exc:
            falhas += 1
            print(f"ERRO aluno ...{str(linha.get('aluno_id'))[-4:]}: {exc}", flush=True)
        time.sleep(0.3)

    print(f"RECUPERÁVEIS_SIM={len(recuperar)} AMBÍGUOS={ambiguos} "
          f"SEM_CONTATO={sem_contato} FALHAS={falhas}", flush=True)
    if aplicar and recuperar:
        r = falhou(requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/registrar_respostas",
            headers={**SB, "Content-Type": "application/json"},
            json={"p_itens": recuperar}, timeout=120,
        ))
        print(f"APLICADO={r.json()}", flush=True)
    elif recuperar:
        print("DIAGNÓSTICO: nada foi gravado. Use --aplicar após validar.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--turma", default="2026 - IF36")
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()
    main(args.turma, args.aplicar)
