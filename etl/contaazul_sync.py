#!/usr/bin/env python3
"""
FebraHub · Conta Azul (v2) -> Supabase — Contas a Receber

O QUE ESTA FONTE DESTRAVA:
A CisPay dava o caixa de CARTÃO. A Conta Azul dá o caixa COMPLETO —
tudo que a Febracis tem a receber, de qualquer forma de pagamento —
mais o que o Salesforce nunca teve: DATA DE VENCIMENTO. Com ela, a
inadimplência real (vencido e não pago) finalmente é calculável.

O PROBLEMA DO TOKEN (por que você voltava no Postman):
A API v2 da Conta Azul ROTACIONA o refresh_token a cada renovação —
o antigo morre. Se o script não gravar o novo, funciona uma vez e
quebra. Aqui o token vive na tabela integracao_tokens do Supabase:
o script lê, renova, e grava o novo de volta. Nunca mais Postman.

AUTORIZAÇÃO (quando o refresh morre de vez):
OAuth2 Authorization Code exige um humano autorizar no navegador. O
`--autorizar` conduz isso do início ao fim: monta a URL, abre o
navegador, recebe o `code` colado de volta, troca por tokens e grava
no Supabase.
    python contaazul_sync.py --autorizar
Precisa de CONTAAZUL_REDIRECT_URI no .env — o MESMO que está cadastrado
no app da Conta Azul, caractere por caractere.

QUANDO USAR CADA COISA:
    --autorizar      o refresh morreu (a API responde invalid_grant)
    --semear-token   você já tem um refresh novo em mãos, de outra origem

SEMEIE UMA VEZ SÓ. Cada refresh serve para UM uso: quem o usa recebe o
substituto. Semear de novo com uma cópia velha devolve invalid_grant, e
esse é o jeito mais comum de se perder aqui.

Uso:
    pip install requests python-dotenv

    # .env (no .gitignore!):
    #   CONTAAZUL_CLIENT_ID=...
    #   CONTAAZUL_CLIENT_SECRET=...
    #   SUPABASE_URL=...
    #   SUPABASE_SERVICE_KEY=...

    python contaazul_sync.py --semear-token <refresh_token_inicial>
    python contaazul_sync.py --diagnostico
    python contaazul_sync.py --sync --desde 2024-01-01
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import webbrowser
from collections import Counter
from datetime import date, datetime, timezone
from typing import Any, Dict, Iterator, List, Optional
from urllib.parse import parse_qs, urlencode, urlparse

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


AUTH_URL = "https://auth.contaazul.com/oauth2/token"
AUTORIZA_URL = "https://auth.contaazul.com/oauth2/authorize"
NOVA_LINHA = chr(10)
BASE = "https://api-v2.contaazul.com"
ENDPOINT = "/v1/financeiro/eventos-financeiros/contas-a-receber/buscar"
TAM_PAGINA = 100
TIMEOUT = 60
LIMITE = 0.50
INTEGRACAO = "contaazul"


# ============================================================
# Supabase — leitura/escrita direta via REST
# ============================================================

def _supa() -> tuple:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no .env")
    return url, key


def _supa_headers() -> Dict[str, str]:
    _, key = _supa()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def token_ler() -> Optional[Dict[str, Any]]:
    url, _ = _supa()
    r = requests.get(
        f"{url}/rest/v1/integracao_tokens",
        headers=_supa_headers(),
        params={"integracao": f"eq.{INTEGRACAO}", "select": "*"},
        timeout=30,
    )
    r.raise_for_status()
    linhas = r.json()
    return linhas[0] if linhas else None


def token_gravar(access: str, refresh: str, expira_em: str) -> None:
    url, _ = _supa()
    r = requests.post(
        f"{url}/rest/v1/integracao_tokens",
        headers={**_supa_headers(), "Prefer": "resolution=merge-duplicates"},
        params={"on_conflict": "integracao"},
        data=json.dumps([{
            "integracao": INTEGRACAO,
            "access_token": access,
            "refresh_token": refresh,     # o NOVO — o antigo já morreu
            "expira_em": expira_em,
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
        }]),
        timeout=30,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"Falha ao gravar token: {r.status_code}\n{r.text[:300]}")


# ============================================================
# OAuth2 — refresh com rotação
# ============================================================

def _basic() -> str:
    cid = os.environ.get("CONTAAZUL_CLIENT_ID")
    sec = os.environ.get("CONTAAZUL_CLIENT_SECRET")
    if not cid or not sec:
        sys.exit("Faltam CONTAAZUL_CLIENT_ID / CONTAAZUL_CLIENT_SECRET no .env")
    return base64.b64encode(f"{cid}:{sec}".encode()).decode()


def access_token_valido() -> str:
    """Lê o token do Supabase; se expirado (ou quase), renova e grava o novo."""
    reg = token_ler()
    if not reg:
        sys.exit("Sem token no banco. Rode --semear-token <refresh_token> primeiro.")

    # margem de 5 min antes de expirar
    if reg.get("access_token") and reg.get("expira_em"):
        exp = datetime.fromisoformat(reg["expira_em"].replace("Z", "+00:00"))
        if (exp - datetime.now(timezone.utc)).total_seconds() > 300:
            return reg["access_token"]

    return _renovar(reg["refresh_token"])


def _renovar(refresh_token: str) -> str:
    r = requests.post(
        AUTH_URL,
        headers={
            "Authorization": f"Basic {_basic()}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        timeout=TIMEOUT,
    )
    if r.status_code >= 300:
        raise RuntimeError(
            f"Refresh falhou: {r.status_code}\n{r.text[:300]}\n"
            "Se for invalid_grant, o refresh token expirou de vez — "
            "refaça a autorização no navegador e rode --semear-token."
        )
    d = r.json()
    # A v2 devolve um refresh_token NOVO. Gravar, senão o próximo run quebra.
    novo_refresh = d.get("refresh_token", refresh_token)
    expira = datetime.now(timezone.utc).timestamp() + int(d.get("expires_in", 3600))
    expira_iso = datetime.fromtimestamp(expira, timezone.utc).isoformat()
    token_gravar(d["access_token"], novo_refresh, expira_iso)
    return d["access_token"]


SCOPE_PADRAO = "openid profile aws.cognito.signin.user.admin"

ERRO_CODE = """invalid_grant aqui quase sempre e uma destas tres:
  - o code ja foi usado (vale UMA vez);
  - passou do prazo (poucos minutos);
  - o redirect_uri nao e IDENTICO ao do passo do navegador."""

ERRO_REDIRECT = """Falta o redirect_uri. Passe --redirect-uri ou ponha
CONTAAZUL_REDIRECT_URI no .env. Ele precisa ser IDENTICO ao cadastrado no
app da Conta Azul - inclusive http/https, barra no fim e porta."""


def _trocar_code(code: str, redirect_uri: str) -> Dict[str, Any]:
    """Troca o `code` de uso unico pelos tokens. Espelha `_renovar`, mudando
    so o grant_type - o endpoint e a autenticacao Basic sao os mesmos."""
    r = requests.post(
        AUTH_URL,
        headers={
            "Authorization": f"Basic {_basic()}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=TIMEOUT,
    )
    if r.status_code >= 300:
        raise RuntimeError(
            f"Troca do code falhou: {r.status_code}" + NOVA_LINHA
            + r.text[:300] + NOVA_LINHA + ERRO_CODE
        )
    return r.json()


def autorizar(redirect_uri: Optional[str] = None) -> None:
    """Fluxo completo de autorizacao, do navegador ao token gravado.

    Existe porque o refresh do Cognito morre - por expirar (costuma ser 30
    dias) ou porque alguem usou uma copia velha dele. Quando isso acontece
    nao ha automacao possivel: OAuth2 Authorization Code exige um humano
    dizendo sim numa tela. O que da para automatizar e todo o resto, e era
    isso que faltava aqui - o cabecalho deste arquivo mandava para o
    Postman e nunca mais trazia de volta.
    """
    cid = os.environ.get("CONTAAZUL_CLIENT_ID")
    if not cid:
        sys.exit("Falta CONTAAZUL_CLIENT_ID no .env")

    redirect_uri = redirect_uri or os.environ.get("CONTAAZUL_REDIRECT_URI")
    if not redirect_uri:
        sys.exit(ERRO_REDIRECT)

    escopo = os.environ.get("CONTAAZUL_SCOPE", SCOPE_PADRAO)
    url = AUTORIZA_URL + "?" + urlencode({
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": redirect_uri,
        "scope": escopo,
        "state": "febrahub",
    })

    print()
    print("1. Abra esta URL, entre e autorize:")
    print()
    print(url)
    try:
        webbrowser.open(url)
        print()
        print("   (tentei abrir no seu navegador)")
    except Exception:
        pass

    print()
    print("2. Voce vai cair numa pagina de erro ou em branco - e esperado. O")
    print("   redirect so existe para carregar o `code` na barra de endereco.")
    print("   Cole a URL INTEIRA aqui (ou so o valor do code):")
    print()
    bruto = input("   > ").strip()
    if not bruto:
        sys.exit("Nada colado. Abortado.")

    # Aceita a URL inteira ou o code cru: colar a URL e o que a pessoa tem a
    # mao, e obrigar a recortar o parametro e onde o erro de digitacao entra.
    code = bruto
    if "?" in bruto or "code=" in bruto:
        q = parse_qs(urlparse(bruto).query)
        if "error" in q:
            sys.exit("O navegador voltou com erro: " + q["error"][0] + " "
                     + (q.get("error_description") or [""])[0])
        if not q.get("code"):
            sys.exit("Nao achei `code=` na URL colada.")
        code = q["code"][0]

    print()
    print("3. Trocando o code por tokens...")
    d = _trocar_code(code, redirect_uri)
    if not d.get("refresh_token"):
        sys.exit("A resposta veio sem refresh_token. Confira os scopes do app.")

    expira = datetime.now(timezone.utc).timestamp() + int(d.get("expires_in", 3600))
    token_gravar(d["access_token"], d["refresh_token"],
                 datetime.fromtimestamp(expira, timezone.utc).isoformat())
    print("OK - tokens gravados no Supabase. O script se vira daqui em diante.")
    print("Confira com: python contaazul_sync.py --diagnostico")


def semear(refresh_token: str) -> None:
    """Grava o primeiro refresh token (obtido manualmente) e testa a renovação."""
    token_gravar("", refresh_token, datetime.now(timezone.utc).isoformat())
    print("Token semeado. Testando renovação…")
    _renovar(refresh_token)
    print("OK — refresh funciona e o novo token foi salvo no Supabase.")


# ============================================================
# Achatamento / resolução (padrão dos outros ETLs)
# ============================================================

def achatar(obj: Any, pref: str = "") -> Dict[str, Any]:
    saida: Dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            nk = f"{pref}.{k}" if pref else str(k)
            saida.update(achatar(v, nk)) if isinstance(v, (dict, list)) else saida.update({nk: v})
    elif isinstance(obj, list):
        for i, it in enumerate(obj):
            saida.update(achatar(it, f"{pref}[{i}]"))
    else:
        saida[pref] = obj
    return saida


def vazio(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def num(v: Any) -> Optional[float]:
    if vazio(v):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).strip()
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def data(v: Any) -> Optional[str]:
    if vazio(v):
        return None
    s = str(v).strip()[:10]
    for f in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, f).date().isoformat()
        except ValueError:
            continue
    return None


def resolver(linha: Dict[str, Any], cands: List[str]) -> Optional[Any]:
    baixo = {k.lower(): v for k, v in linha.items()}
    for c in cands:
        v = baixo.get(c.lower())
        if not vazio(v):
            return v
    return None


# ============================================================
# Mapeamento — nomes CRUS confirmados via --diagnostico
# (deixados como candidatos; o diagnóstico revela os reais)
# ============================================================

MAPA: Dict[str, List[str]] = {
    "parcela_id":       ["id"],
    "evento_id":        ["evento_id", "id_evento"],
    "descricao":        ["descricao"],
    "cliente":          ["cliente.nome"],          # muitas vêm null (lançamento interno)

    "data_vencimento":  ["data_vencimento"],
    "data_competencia": ["data_competencia"],
    "data_alteracao":   ["data_alteracao"],        # proxy de data de baixa
    "status":           ["status_traduzido"],      # legível: RECEBIDO / EM_ABERTO
    "status_cru":       ["status"],                # ACQUITTED / PENDING

    "valor":            ["total"],
    "pago":             ["pago"],
    "nao_pago":         ["nao_pago"],

    "categoria":        ["categorias[0].nome"],
    "centro_custo":     ["centros_de_custo[0].nome"],
}

OBRIG = ["parcela_id", "valor", "data_vencimento"]
NUMERICOS = ["valor", "pago", "nao_pago"]
DATAS = ["data_vencimento", "data_competencia", "data_alteracao"]

# status crus da API (o status_traduzido nem sempre chega no lote)
RECEBIDOS = {"ACQUITTED", "PAID", "SETTLED"}      # quitado
VENCIDOS = {"OVERDUE"}                             # vencido e não pago = inadimplência


def montar(reg: Dict[str, Any]) -> Dict[str, Any]:
    f = achatar(reg)
    l = {d: resolver(f, c) for d, c in MAPA.items()}
    for c in NUMERICOS:
        l[c] = num(l.get(c))
    for c in DATAS:
        l[c] = data(l.get(c))

    status_cru = (l.get("status_cru") or "").upper()
    pago_val = l.get("pago") or 0

    # Recebido: status ACQUITTED, ou tem valor pago.
    recebido = status_cru in RECEBIDOS or pago_val > 0
    l["data_pagamento"] = l.get("data_alteracao") if recebido else None
    l["valor_pago"] = pago_val if pago_val > 0 else None

    # status legível para a UI (deriva do cru, que é confiável)
    l["status"] = {
        "ACQUITTED": "Recebido",
        "OVERDUE":   "Vencido",
        "PENDING":   "A vencer",
        "PARTIAL":   "Parcial",
    }.get(status_cru, l.get("status") or status_cru)

    l["conta_financeira"] = None
    l.pop("status_cru", None)
    l.pop("data_alteracao", None)
    l.pop("pago", None)
    l.pop("nao_pago", None)
    return l


# ============================================================
# API Conta Azul
# ============================================================

def buscar(desde: str, ate: str) -> Iterator[Dict[str, Any]]:
    token = access_token_valido()
    pagina = 1
    while True:
        r = requests.get(
            f"{BASE}{ENDPOINT}",
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
            # token expirou no meio — renova uma vez e retoma
            token = access_token_valido()
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


# ============================================================
# Diagnóstico
# ============================================================

def diagnosticar() -> None:
    hoje = date.today().isoformat()
    inicio = date.today().replace(year=date.today().year - 1).isoformat()
    amostra = [achatar(r) for i, r in enumerate(buscar(inicio, hoje)) if i < 200]

    print(f"\nCONTAS A RECEBER · {len(amostra)} registros\n" + "=" * 62)
    if not amostra:
        print("Nada retornado no período. Sem contas a receber no último ano?")
        return

    cont: Counter = Counter()
    for l in amostra:
        for k, v in l.items():
            if not vazio(v):
                cont[k] += 1
    print("\n-- CHAVES REAIS (preenchimento) --")
    for k, n in sorted(cont.items()):
        print(f"  {n/len(amostra):5.0%}  {k}")

    print("\n-- MAPEAMENTO --")
    for d, c in MAPA.items():
        t = sum(1 for l in amostra if not vazio(resolver(l, c))) / len(amostra)
        print(f"  {'OK ' if t >= LIMITE else '!! '}{d:20} {t:5.0%}")

    print("\n-- EXEMPLO CRU --")
    print(json.dumps(amostra[0], indent=2, ensure_ascii=False)[:2200])


# ============================================================
# Sync
# ============================================================

def upsert(linhas: List[Dict]) -> None:
    url, _ = _supa()
    for i in range(0, len(linhas), 500):
        lote = linhas[i : i + 500]
        r = requests.post(
            f"{url}/rest/v1/fato_contas_receber",
            headers={**_supa_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            params={"on_conflict": "parcela_id"},
            data=json.dumps(lote, ensure_ascii=False, default=str),
            timeout=90,
        )
        if r.status_code >= 300:
            raise RuntimeError(f"HTTP {r.status_code}\n{r.text[:400]}")
        print(f"  {i + len(lote)}/{len(linhas)}")


def validar(linhas: List[Dict]) -> None:
    if not linhas:
        sys.exit("CARGA ABORTADA — zero registros.")
    probs = [
        f"{c}: {sum(1 for l in linhas if not vazio(l.get(c)))/len(linhas):.0%}"
        for c in OBRIG
        if sum(1 for l in linhas if not vazio(l.get(c))) / len(linhas) < LIMITE
    ]
    if probs:
        print("\nCARGA ABORTADA — obrigatórios vazios:", file=sys.stderr)
        for p in probs:
            print(f"  - {p}", file=sys.stderr)
        print("Rode --diagnostico e ajuste o MAPA.", file=sys.stderr)
        sys.exit(1)


def sincronizar(desde: str) -> None:
    ate = date.today().replace(year=date.today().year + 2).isoformat()  # inclui futuro
    linhas = [montar(r) for r in buscar(desde, ate)]
    print(f"\n{len(linhas)} parcelas de contas a receber")
    validar(linhas)

    total = sum(l["valor"] or 0 for l in linhas)
    recebido = sum(1 for l in linhas if l.get("data_pagamento"))
    a_receber = sum(l["valor"] or 0 for l in linhas if not l.get("data_pagamento"))
    print(f"Total     R$ {total:>14,.2f}")
    print(f"Recebidas {recebido}/{len(linhas)}")
    print(f"A receber R$ {a_receber:>14,.2f}\n")

    upsert(linhas)
    print("OK.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--autorizar", action="store_true",
                    help="refaz a autorização no navegador e grava os tokens")
    ap.add_argument("--redirect-uri",
                    help="sobrepõe CONTAAZUL_REDIRECT_URI, só com --autorizar")
    ap.add_argument("--semear-token", metavar="REFRESH_TOKEN",
                    help="grava um refresh token que você já tem em mãos")
    ap.add_argument("--diagnostico", action="store_true")
    ap.add_argument("--sync", action="store_true")
    ap.add_argument("--desde", default="2024-01-01", help="data de vencimento inicial")
    a = ap.parse_args()

    if a.autorizar:
        autorizar(a.redirect_uri)
    elif a.semear_token:
        semear(a.semear_token)
    elif a.diagnostico:
        diagnosticar()
    elif a.sync:
        sincronizar(a.desde)
    else:
        ap.print_help()