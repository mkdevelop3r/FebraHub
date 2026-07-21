#!/usr/bin/env python3
"""
FebraHub · Conta Azul (v2) -> Supabase — Contas a PAGAR (despesas)

Espelho do contaazul_sync.py (contas a receber). Reaproveita TODA a
lógica de token/refresh já provada — importa dela. Muda só:
  - endpoint: contas-a-pagar/buscar
  - tabela:   fato_contas_pagar
  - semântica: despesa (o que SAI do caixa)

POR QUE ISTO IMPORTA:
Com contas a receber você via o que ENTRA. Com contas a pagar você vê
o que SAI. Só com os dois existe o número que a Dulce quer:
CAIXA LÍQUIDO PROJETADO = a receber − a pagar, por horizonte.
Receita sem despesa é faturamento; com despesa vira resultado.

Uso (mesmo .env e mesmo token do contaazul_sync.py):
    python contaazul_pagar_sync.py --diagnostico
    python contaazul_pagar_sync.py --sync --desde 2024-01-01

O token OAuth é COMPARTILHADO (mesma tabela integracao_tokens,
mesma integração 'contaazul'). Não precisa semear de novo — o
--semear-token do outro script já resolveu.
"""

import argparse
import json
import sys
import time
from collections import Counter
from datetime import date, datetime, timezone
from typing import Any, Dict, Iterator, List

import requests

# Reaproveita a máquina de token/refresh/helpers já provada.
import contaazul_sync as ca


ENDPOINT = "/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar"
TAM_PAGINA = 100
TIMEOUT = 60


# ============================================================
# Mapeamento — despesas. Estrutura idêntica a receber, mas
# 'cliente' vira 'fornecedor'. Confirmar via --diagnostico.
# ============================================================

MAPA: Dict[str, List[str]] = {
    "parcela_id":       ["id"],
    "evento_id":        ["evento_id", "id_evento"],
    "descricao":        ["descricao"],
    "fornecedor":       ["fornecedor.nome", "cliente.nome"],  # pagar = fornecedor

    "data_vencimento":  ["data_vencimento"],
    "data_competencia": ["data_competencia"],
    "data_alteracao":   ["data_alteracao"],
    "status_cru":       ["status"],

    "valor":            ["total"],
    "pago":             ["pago"],
    "nao_pago":         ["nao_pago"],

    "categoria":        ["categorias[0].nome"],
    "centro_custo":     ["centros_de_custo[0].nome"],
}

OBRIG = ["parcela_id", "valor", "data_vencimento"]
NUMERICOS = ["valor", "pago", "nao_pago"]
DATAS = ["data_vencimento", "data_competencia", "data_alteracao"]
PAGOS = {"ACQUITTED", "PAID", "SETTLED"}


def montar(reg: Dict[str, Any]) -> Dict[str, Any]:
    f = ca.achatar(reg)
    l = {d: ca.resolver(f, c) for d, c in MAPA.items()}
    for c in NUMERICOS:
        l[c] = ca.num(l.get(c))
    for c in DATAS:
        l[c] = ca.data(l.get(c))

    status_cru = (l.get("status_cru") or "").upper()
    pago_val = l.get("pago") or 0
    pago = status_cru in PAGOS or pago_val > 0

    l["data_pagamento"] = l.get("data_alteracao") if pago else None
    l["valor_pago"] = pago_val if pago_val > 0 else None
    l["status"] = {
        "ACQUITTED": "Pago",
        "OVERDUE":   "Vencido",
        "PENDING":   "A vencer",
        "PARTIAL":   "Parcial",
    }.get(status_cru, status_cru)

    l.pop("status_cru", None)
    l.pop("data_alteracao", None)
    l.pop("pago", None)
    l.pop("nao_pago", None)
    return l


# ============================================================
# API
# ============================================================

def buscar(desde: str, ate: str) -> Iterator[Dict[str, Any]]:
    token = ca.access_token_valido()
    pagina = 1
    while True:
        r = requests.get(
            f"{ca.BASE}{ENDPOINT}",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "pagina": pagina,
                "tamanho_pagina": TAM_PAGINA,
                "data_vencimento_de": desde,
                "data_vencimento_ate": ate,
            },
            timeout=TIMEOUT,
        )
        if r.status_code == 401:
            token = ca.access_token_valido()
            continue
        if r.status_code == 429:
            time.sleep(5)
            continue
        r.raise_for_status()

        corpo = r.json()
        itens = corpo.get("itens") or corpo.get("data") or corpo.get("content") or []
        if isinstance(corpo, list):
            itens = corpo
        if not itens:
            return
        for it in itens:
            yield it
        if len(itens) < TAM_PAGINA:
            return
        pagina += 1
        time.sleep(0.3)


def diagnosticar() -> None:
    hoje = date.today().isoformat()
    inicio = date.today().replace(year=date.today().year - 1).isoformat()
    amostra = [ca.achatar(r) for i, r in enumerate(buscar(inicio, hoje)) if i < 200]

    print(f"\nCONTAS A PAGAR · {len(amostra)} registros\n" + "=" * 62)
    if not amostra:
        print("Nada retornado. Sem contas a pagar no período?")
        return

    cont: Counter = Counter()
    for l in amostra:
        for k, v in l.items():
            if not ca.vazio(v):
                cont[k] += 1
    print("\n-- CHAVES REAIS --")
    for k, n in sorted(cont.items()):
        print(f"  {n/len(amostra):5.0%}  {k}")

    print("\n-- MAPEAMENTO --")
    for d, c in MAPA.items():
        t = sum(1 for l in amostra if not ca.vazio(ca.resolver(l, c))) / len(amostra)
        print(f"  {'OK ' if t >= ca.LIMITE else '!! '}{d:20} {t:5.0%}")

    print("\n-- EXEMPLO CRU --")
    print(json.dumps(amostra[0], indent=2, ensure_ascii=False)[:2000])


def upsert(linhas: List[Dict]) -> None:
    url, _ = ca._supa()
    for i in range(0, len(linhas), 500):
        lote = linhas[i : i + 500]
        r = requests.post(
            f"{url}/rest/v1/fato_contas_pagar",
            headers={**ca._supa_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            params={"on_conflict": "parcela_id"},
            data=json.dumps(lote, ensure_ascii=False, default=str),
            timeout=90,
        )
        if r.status_code >= 300:
            raise RuntimeError(f"HTTP {r.status_code}\n{r.text[:400]}")
        print(f"  {i + len(lote)}/{len(linhas)}")


def sincronizar(desde: str) -> None:
    ate = date.today().replace(year=date.today().year + 2).isoformat()
    linhas = [montar(r) for r in buscar(desde, ate)]
    print(f"\n{len(linhas)} parcelas de contas a pagar")
    if not linhas:
        sys.exit("Zero registros — nada a gravar.")

    probs = [c for c in OBRIG
             if sum(1 for l in linhas if not ca.vazio(l.get(c))) / len(linhas) < ca.LIMITE]
    if probs:
        sys.exit(f"ABORTADO — obrigatórios vazios: {probs}. Rode --diagnostico.")

    total = sum(l["valor"] or 0 for l in linhas)
    pagas = sum(1 for l in linhas if l.get("data_pagamento"))
    a_pagar = sum(l["valor"] or 0 for l in linhas if not l.get("data_pagamento"))
    print(f"Total    R$ {total:>14,.2f}")
    print(f"Pagas    {pagas}/{len(linhas)}")
    print(f"A pagar  R$ {a_pagar:>14,.2f}\n")

    upsert(linhas)
    print("OK.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--diagnostico", action="store_true")
    ap.add_argument("--sync", action="store_true")
    ap.add_argument("--desde", default="2024-01-01")
    a = ap.parse_args()

    if a.diagnostico:
        diagnosticar()
    elif a.sync:
        sincronizar(a.desde)
    else:
        ap.print_help()