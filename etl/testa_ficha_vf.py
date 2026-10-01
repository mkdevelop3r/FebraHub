"""Teste: puxar a Ficha de Inscrição (Anexo I) do domínio Visualforce.

Objetivo: provar, no ambiente do sync (onde o token do Salesforce é REAL), que
a automação consegue baixar o PDF da ficha direto de
`https://<mydomain>--c.vf.force.com/apex/fichaCliente?id=<venda>` — sem precisar
de endpoint Apex nem de admin. NÃO grava nada, NÃO toca no Autentique; só busca
a ficha e diz se veio PDF. É o "teste antes" da Fase 2.

Rodar pelo workflow `testa-ficha-vf.yml` (Actions -> Run workflow).
"""

import os
import re
import sys

import requests

from salesforce_api_sync import Salesforce, load_env


def diagnostica(nome, resp):
    ct = resp.headers.get("Content-Type", "")
    head = resp.content[:8]
    print(f"[{nome}] HTTP {resp.status_code} | {ct} | {len(resp.content)} bytes "
          f"| inicio={head!r} | url_final={resp.url}", flush=True)
    if resp.content[:4] == b"%PDF":
        with open("ficha.pdf", "wb") as f:
            f.write(resp.content)
        print(f"[{nome}] >>> SUCESSO: veio PDF, salvo em ficha.pdf <<<", flush=True)
        return True
    return False


def main():
    load_env()
    venda = os.getenv("VENDA_ID", "006V200000oGkdBIAS").strip()

    sf = Salesforce()
    token = sf.headers["Authorization"].split(" ", 1)[1]
    instance = sf.instance

    host = re.sub(r"^https?://", "", instance)
    mydomain = host.split(".")[0]  # ex.: febracis
    vf_base = (os.getenv("SALESFORCE_VF_URL")
               or f"https://{mydomain}--c.vf.force.com").rstrip("/")
    vf_path = f"/apex/fichaCliente?id={venda}"

    print(f"instance={instance} | vf_base={vf_base} | venda={venda}", flush=True)

    # Método 1: ponte de sessão pelo frontdoor do PRÓPRIO domínio VF.
    try:
        s = requests.Session()
        r = s.get(f"{vf_base}/secur/frontdoor.jsp",
                  params={"sid": token, "retURL": vf_path},
                  allow_redirects=True, timeout=120)
        if diagnostica("frontdoor-vf", r):
            return 0
    except Exception as e:
        print(f"[frontdoor-vf] erro: {e}", flush=True)

    # Método 2: Bearer direto no domínio VF.
    try:
        r = requests.get(f"{vf_base}{vf_path}",
                         headers={"Authorization": f"Bearer {token}"},
                         allow_redirects=True, timeout=120)
        if diagnostica("bearer-vf", r):
            return 0
    except Exception as e:
        print(f"[bearer-vf] erro: {e}", flush=True)

    # Método 3: frontdoor na instância, retornando pra URL completa do VF.
    try:
        s = requests.Session()
        r = s.get(f"{instance}/secur/frontdoor.jsp",
                  params={"sid": token, "retURL": f"{vf_base}{vf_path}"},
                  allow_redirects=True, timeout=120)
        if diagnostica("frontdoor-instance", r):
            return 0
        print("ultimo_corpo(300):", r.text[:300], flush=True)
    except Exception as e:
        print(f"[frontdoor-instance] erro: {e}", flush=True)

    print("NENHUM método retornou PDF — ver diagnóstico acima.", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
