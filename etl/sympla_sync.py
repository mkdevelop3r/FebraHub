#!/usr/bin/env python3
"""
FebraHub · Sympla -> Supabase

CAUSA RAIZ DO BUG (resolvida):
O Power Query renomeia as colunas depois de importar:
    Table.RenameColumns(..., {{"buyer_email", "email_comprador"}, ...})
O mapper antigo foi escrito com os nomes FINAIS do Power BI
("valor_total", "comprador_email") em vez dos nomes CRUS da API
("order_total_sale_price", "buyer_email"). O .get() nao achava,
devolvia None, e o insert gravava NULL. Sem erro. Sem log.

Os nomes abaixo foram CONFIRMADOS por --diagnostico (93 registros).

Uso:
    pip install requests python-dotenv

    # .env na mesma pasta (e no .gitignore!):
    #   SYMPLA_TOKEN=...
    #   SUPABASE_URL=https://xxxx.supabase.co
    #   SUPABASE_SERVICE_KEY=...   <- service_role, NUNCA a anon

    python sympla_sync.py --diagnostico
    python sympla_sync.py --sync
"""

import argparse
import json
import os
import sys
import time
from collections import Counter
from typing import Any, Dict, Iterator, List, Optional

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SYMPLA_BASE = "https://api.sympla.com.br/public/v1.5.1"
TIMEOUT = 30
PAGE_SIZE = 100
LIMITE_PREENCHIMENTO = 0.50  # <50% num campo obrigatorio = mapeamento errado


# ============================================================
# 1. Achatamento — o que o Power Query faz e o Python nao
# ============================================================

def achatar(obj: Any, prefixo: str = "") -> Dict[str, Any]:
    """{"invoice_info": {"doc_number": "x"}} -> {"invoice_info.doc_number": "x"}"""
    saida: Dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            novo = f"{prefixo}.{k}" if prefixo else str(k)
            if isinstance(v, (dict, list)):
                saida.update(achatar(v, novo))
            else:
                saida[novo] = v
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if isinstance(item, dict) and "name" in item and "value" in item:
                chave = f"{prefixo}[{str(item['name']).strip().lower()}]"
                saida[chave] = item.get("value")
            else:
                saida.update(achatar(item, f"{prefixo}[{i}]"))
    else:
        saida[prefixo] = obj
    return saida


def vazio(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def resolver(linha: Dict[str, Any], candidatos: List[str]) -> Optional[Any]:
    baixo = {k.lower(): v for k, v in linha.items()}
    for c in candidatos:
        v = baixo.get(c.lower())
        if not vazio(v):
            return v
    return None


# ============================================================
# 2. Mapeamento — CONFIRMADO pelo diagnostico, nao chutado
# ============================================================

MAPA_PEDIDOS: Dict[str, List[str]] = {
    "pedido_id":               ["id"],                          # 100%
    "evento_id":               ["event_id"],                    # 100%
    "status_pedido":           ["order_status"],                # 100%
    "data_pedido":             ["order_date"],                  # 100%
    "data_atualizacao_pedido": ["updated_date"],                # 100%
    "data_aprovacao_pedido":   ["approved_date"],               # 100%

    "valor_total":             ["order_total_sale_price"],      # 100% <- ERA O BUG
    "comprador_email":         ["buyer_email"],                 # 100% <- ERA O BUG
    "comprador_nome":          ["buyer_first_name"],            # 100%
    "comprador_sobrenome":     ["buyer_last_name"],             # 100%

    # Bruto - liquido = taxa do Sympla (~12,5%).
    # R$19,90 vendido = R$17,40 recebido. Sem isto o Financeiro
    # conta receita que nunca entrou no caixa.
    "valor_liquido":           ["order_total_net_value"],       # 100%
    "forma_pagamento":         ["transaction_type"],            # 100%

    # CPF: chave mais forte do banco. Liga comprador de palestra
    # (R$19,90) a aluno GGB (R$1.900) via dim_alunos.cpf.
    # TEXT, sempre. Virar numero mata o zero a esquerda.
    "comprador_documento":      ["invoice_info.doc_number"],    # 66%
    "comprador_documento_tipo": ["invoice_info.doc_type"],      # 66%

    "utm_source":              ["utm.utm_source"],              # 23%
    "utm_medium":              ["utm.utm_medium"],              # 23%
    "utm_campaign":            ["utm.utm_campaign"],            # 23%
}

MAPA_PARTICIPANTES: Dict[str, List[str]] = {
    "participante_id":         ["id"],                          # 100%
    "evento_id":               ["event_id"],                    # 100%
    "pedido_id":               ["order_id"],                    # 100%
    "status_pedido":           ["order_status"],                # 100%
    "data_pedido":             ["order_date"],                  # 100%
    "data_atualizacao_pedido": ["order_updated_date"],          # 100%
    "data_aprovacao_pedido":   ["order_approved_date"],         # 100%
    "numero_ingresso":         ["ticket_number"],               # 100%
    "qr_code_ingresso":        ["ticket_num_qr_code"],          # 100%
    "tipo_ingresso":           ["ticket_name"],                 # 100%
    "valor_ingresso":          ["ticket_sale_price"],           # 100%
    "check_in":                ["checkin.check_in"],            # 100%
    "desconto":                ["order_discount"],              # 100%

    # 4%, e NAO e bug: o Sympla so coleta dados do COMPRADOR.
    # O formulario do participante quase nunca e preenchido.
    # Participante = ingresso. Comprador = pessoa (em fato_pedidos).
    "nome_participante":       ["first_name"],                  # 4%
    "email_participante":      ["email"],                       # 4%
}

OBRIGATORIOS_PEDIDOS = [
    "pedido_id", "evento_id", "valor_total", "valor_liquido", "comprador_email",
]
OBRIGATORIOS_PARTICIPANTES = [
    "participante_id", "evento_id", "pedido_id", "valor_ingresso",
]


# ============================================================
# 3. Cliente Sympla
# ============================================================

def sympla_get(caminho: str, token: str) -> Iterator[Dict[str, Any]]:
    pagina = 1
    while True:
        r = requests.get(
            f"{SYMPLA_BASE}{caminho}",
            headers={"s_token": token, "Content-Type": "application/json"},
            params={"page": pagina, "page_size": PAGE_SIZE},
            timeout=TIMEOUT,
        )
        if r.status_code == 429:
            time.sleep(5)
            continue
        if r.status_code == 404:
            return
        r.raise_for_status()
        corpo = r.json()
        dados = corpo.get("data") or []
        if not dados:
            return
        for d in dados:
            yield d
        if not (corpo.get("pagination") or {}).get("has_next"):
            return
        pagina += 1
        time.sleep(0.3)


def listar_eventos(token: str) -> List[Dict[str, Any]]:
    return list(sympla_get("/events", token))


# ============================================================
# 4. Diagnostico
# ============================================================

def diagnosticar(token: str, limite_eventos: int = 3) -> None:
    eventos = listar_eventos(token)
    print(f"\n{len(eventos)} eventos. Amostrando {limite_eventos}.\n")

    for rotulo, caminho, mapa in [
        ("PEDIDOS", "/events/{eid}/orders", MAPA_PEDIDOS),
        ("PARTICIPANTES", "/events/{eid}/participants", MAPA_PARTICIPANTES),
    ]:
        amostra: List[Dict[str, Any]] = []
        for ev in eventos[:limite_eventos]:
            try:
                for i, reg in enumerate(sympla_get(caminho.format(eid=ev.get("id")), token)):
                    amostra.append(achatar(reg))
                    if i >= 30:
                        break
            except requests.HTTPError as e:
                print(f"  (evento {ev.get('id')}: {e})")

        print("=" * 62)
        print(f"{rotulo} — {len(amostra)} registros")
        print("=" * 62)
        if not amostra:
            print("  Nenhum registro.\n")
            continue

        contagem: Counter = Counter()
        for linha in amostra:
            for k, v in linha.items():
                if not vazio(v):
                    contagem[k] += 1

        print("\n-- CHAVES REAIS (preenchimento) --")
        for k, n in sorted(contagem.items()):
            print(f"  {n/len(amostra):5.0%}  {k}")

        print("\n-- MAPEAMENTO --")
        for destino, candidatos in mapa.items():
            taxa = sum(1 for l in amostra if not vazio(resolver(l, candidatos))) / len(amostra)
            marca = "OK " if taxa >= LIMITE_PREENCHIMENTO else "!! "
            print(f"  {marca}{destino:26} {taxa:5.0%}  <- {candidatos[0]}")
        print()


# ============================================================
# 5. Supabase (PostgREST)
# ============================================================

def _cred() -> tuple:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit(
            "Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY.\n"
            "Crie um .env na mesma pasta (e adicione .env ao .gitignore)."
        )
    return url.rstrip("/"), key


def upsert(tabela: str, linhas: List[Dict[str, Any]], pk: str) -> None:
    if not linhas:
        print(f"  {tabela}: nada a gravar")
        return
    url, key = _cred()
    for i in range(0, len(linhas), 500):
        lote = linhas[i : i + 500]
        r = requests.post(
            f"{url}/rest/v1/{tabela}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            params={"on_conflict": pk},
            data=json.dumps(lote, ensure_ascii=False, default=str),
            timeout=90,
        )
        if r.status_code >= 300:
            raise RuntimeError(f"{tabela}: HTTP {r.status_code}\n{r.text[:600]}")
        print(f"  {tabela}: {i + len(lote)}/{len(linhas)}")


def validar(rotulo: str, linhas: List[Dict], obrigatorios: List[str]) -> None:
    """Falha ALTO. Melhor quebrar do que gravar NULL em silencio."""
    if not linhas:
        return
    problemas = [
        f"{c}: preenchido em apenas "
        f"{sum(1 for l in linhas if not vazio(l.get(c))) / len(linhas):.0%}"
        for c in obrigatorios
        if sum(1 for l in linhas if not vazio(l.get(c))) / len(linhas) < LIMITE_PREENCHIMENTO
    ]
    if problemas:
        print(f"\nCARGA ABORTADA — {rotulo}", file=sys.stderr)
        for p in problemas:
            print(f"  - {p}", file=sys.stderr)
        print("\nRode --diagnostico e ajuste o mapeamento.", file=sys.stderr)
        sys.exit(1)


# ============================================================
# 6. Sync
# ============================================================

def sincronizar(token: str) -> None:
    _cred()  # falha cedo se faltar credencial, antes de bater na API
    eventos = listar_eventos(token)
    print(f"{len(eventos)} eventos.\n")

    upsert("dim_eventos", [
        {
            "evento_id":     str(e.get("id")),
            "id_referencia": e.get("reference_id"),
            "nome_evento":   e.get("name"),
            "data_inicio":   e.get("start_date"),
            "data_final":    e.get("end_date"),
            "local_evento":  (e.get("address") or {}).get("name"),
            "endereco":      (e.get("address") or {}).get("address"),
            "bairro":        (e.get("address") or {}).get("neighborhood"),
            "cidade":        (e.get("address") or {}).get("city"),
        }
        for e in eventos
    ], "evento_id")

    pedidos: List[Dict] = []
    participantes: List[Dict] = []

    for n, e in enumerate(eventos, 1):
        eid = str(e.get("id"))
        print(f"  [{n}/{len(eventos)}] {e.get('name', eid)[:45]}")

        for reg in sympla_get(f"/events/{eid}/orders", token):
            linha = {d: resolver(achatar(reg), c) for d, c in MAPA_PEDIDOS.items()}
            linha["evento_id"] = linha.get("evento_id") or eid
            linha["moeda"] = "BRL"  # nao existe no payload; Sympla e BRL
            pedidos.append(linha)

        for reg in sympla_get(f"/events/{eid}/participants", token):
            linha = {d: resolver(achatar(reg), c) for d, c in MAPA_PARTICIPANTES.items()}
            linha["evento_id"] = linha.get("evento_id") or eid
            participantes.append(linha)

    print(f"\n{len(pedidos)} pedidos · {len(participantes)} participantes")

    validar("fato_pedidos", pedidos, OBRIGATORIOS_PEDIDOS)
    validar("fato_participantes", participantes, OBRIGATORIOS_PARTICIPANTES)

    cpf = sum(1 for p in pedidos if not vazio(p.get("comprador_documento")))
    bruto = sum(float(p["valor_total"] or 0) for p in pedidos)
    liquido = sum(float(p["valor_liquido"] or 0) for p in pedidos)
    print(f"CPF do comprador: {cpf}/{len(pedidos)} ({cpf/max(len(pedidos),1):.0%})"
          "  <- chave da ponte evento->aluno")
    print(f"Bruto R$ {bruto:,.2f} · Liquido R$ {liquido:,.2f} "
          f"· Taxa Sympla R$ {bruto - liquido:,.2f} "
          f"({(bruto - liquido)/max(bruto, 1):.1%})\n")

    upsert("fato_pedidos", pedidos, "pedido_id")
    upsert("fato_participantes", participantes, "participante_id")
    print("\nOK.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--diagnostico", action="store_true")
    ap.add_argument("--sync", action="store_true")
    args = ap.parse_args()

    tok = os.environ.get("SYMPLA_TOKEN")
    if not tok:
        sys.exit("Falta SYMPLA_TOKEN. Crie um .env na mesma pasta do script.")

    if args.diagnostico:
        diagnosticar(tok)
    elif args.sync:
        sincronizar(tok)
    else:
        ap.print_help()
