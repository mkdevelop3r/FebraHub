#!/usr/bin/env python3
"""
FebraHub · meta_leads_sync.py
Puxa os LEADS de formulario do Meta, com o anuncio que os gerou, e grava em
public.fato_meta_lead.

POR QUE EXISTE

A rastreabilidade anuncio -> lead -> venda esta quebrada no primeiro elo desde
13/07/2026. Ate la o Clint trazia id e nome do anuncio; a operacao migrou para
o Black CRM e o cabecalho do `blackcrm_leads_sync.py` afirmou que o `mediumId`
das `attributions` era "o ID do anuncio no Meta".

Nao e. Conferido na API em 08/09/2026, o contato traz:

    "formId": "1268691287887869",  "formName": "FCIS",
    "adId": null,  "adSetId": null,  "campaignId": null

`mediumId` E o `formId`. Os campos de anuncio existem no esquema do GHL e vem
NULOS -- a integracao nativa do Meta com o CRM nao entrega atribuicao de
anuncio. Como a frase do cabecalho dizia o contrario, ninguem percebeu que a
rastreabilidade tinha piorado com a migracao.

Este script vai buscar o elo que falta na propria fonte.

O QUE ELE NAO PRECISA BUSCAR

Nome de anuncio, nome de campanha e GASTO ja estao em `fato_meta_insights`, que
o `meta_sync.py` mantem desde 2024 (3.755 anuncios, R$ 483 mil). Aqui so vem a
lista de leads por anuncio; a view `vw_mkt_lead_anuncio_venda` junta os dois.

DE ONDE SAI A LISTA DE ANUNCIOS

Do Supabase, nao do Meta: `fato_meta_insights` ja sabe quais anuncios tiveram
gasto na janela. Sao 181 desde 10/07 -- 181 chamadas, nao 3.755. Anuncio sem
gasto nao gera lead, entao perguntar por ele seria so queimar rate limit.

A PERMISSAO QUE FALTA

`/{ad_id}/leads` exige `leads_retrieval` (ou `pages_manage_ads`) no token,
alem do `ads_read` que o `meta_sync.py` usa. Conferido na primeira execucao,
em 08/09/2026, a Meta responde ALTO:

    Meta 400: (#100) Requires pages_manage_ads or leads_retrieval permission
    to manage the object

Eu tinha escrito aqui que ela responderia 200 com lista vazia, em silencio.
Estava errado, e a realidade e melhor: o erro nomeia a permissao que falta. A
checagem de "todos vazios" continua abaixo por seguranca -- nao custa nada e
cobre o caso de um token que veja o anuncio mas nao o formulario -- mas o
sintoma esperado desta falta e o 400, nao o silencio.

COMO CONSERTAR: gerar um token novo incluindo `leads_retrieval`, com o usuario
tendo papel na Pagina dona do formulario, e trocar por token de longa duracao.
O segredo e o mesmo `META_TOKEN` que o meta_sync ja usa.

USO
    python meta_leads_sync.py --diagnostico   # 5 anuncios, nao grava
    python meta_leads_sync.py                 # janela padrao, nao grava
    python meta_leads_sync.py --aplicar       # grava
    python meta_leads_sync.py --desde 2026-07-10 --aplicar

SECRETS (env)
    META_TOKEN, META_ACCOUNT_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

API = "https://graph.facebook.com/v25.0"
TABELA = "fato_meta_lead"

# Nomes que o Meta usa para os campos do formulario. Variam por formulario --
# quem monta escolhe -- entao o mapa e por aproximacao, e o que nao casar fica
# de fora em vez de virar coluna errada.
CAMPOS_EMAIL = ("email", "e-mail", "email_address")
CAMPOS_TEL   = ("phone_number", "phone", "telefone", "celular", "whatsapp")
CAMPOS_NOME  = ("full_name", "nome", "name", "first_name")


def log(msg):
    print(msg, flush=True)


def env(nome):
    v = os.environ.get(nome)
    if not v:
        raise RuntimeError(f"falta a variavel de ambiente {nome}")
    return v


# ---------------------------------------------------------------- Meta
def get(path, params, token, tentativa=0):
    params = {**params, "access_token": token}
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors="replace")
        if e.code in (403, 429) and tentativa < 5:
            espera = 60 * (tentativa + 1)
            log(f"  rate limit ({e.code}) — aguardando {espera}s")
            time.sleep(espera)
            return get(path, params, token, tentativa + 1)
        raise RuntimeError(f"Meta {e.code}: {corpo[:400]}")


def leads_do_anuncio(anuncio_id, token, desde_unix):
    """Todos os leads de um anuncio, paginando."""
    campos = ("id,created_time,ad_id,adset_id,campaign_id,form_id,"
              "platform,field_data")
    params = {"fields": campos, "limit": 100}
    if desde_unix:
        params["filtering"] = json.dumps([{
            "field": "time_created", "operator": "GREATER_THAN",
            "value": desde_unix}])
    saida, path = [], f"{anuncio_id}/leads"
    while True:
        data = get(path, params, token)
        saida.extend(data.get("data", []))
        depois = (data.get("paging") or {}).get("cursors", {}).get("after")
        if not depois or not data.get("data"):
            return saida
        params["after"] = depois
        time.sleep(0.3)


# ---------------------------------------------------------------- transformar
def so_digitos(v):
    return re.sub(r"\D", "", str(v or ""))


def do_form(campos, nomes):
    """Primeiro valor cujo `name` casa com um dos nomes procurados."""
    for c in campos or []:
        if str(c.get("name", "")).lower() in nomes:
            vals = c.get("values") or []
            if vals and str(vals[0]).strip():
                return str(vals[0]).strip()
    return None


def transformar(lead, nome_do_form):
    campos = lead.get("field_data")
    email = do_form(campos, CAMPOS_EMAIL)
    tel = do_form(campos, CAMPOS_TEL)
    digitos = so_digitos(tel)
    return {
        "lead_id":     str(lead["id"]),
        "anuncio_id":  str(lead.get("ad_id") or ""),
        "adset_id":    lead.get("adset_id"),
        "campanha_id": lead.get("campaign_id"),
        "form_id":     lead.get("form_id"),
        "form_nome":   nome_do_form.get(str(lead.get("form_id") or "")),
        "plataforma":  lead.get("platform"),
        "criado_em":   lead.get("created_time"),
        # Normalizado na gravacao, nao na consulta: e assim que sera comparado,
        # e deixar para depois convida a divergencia entre um lugar e outro.
        "email":       email.lower().strip() if email else None,
        "telefone":    tel,
        "tel8":        digitos[-8:] if len(digitos) >= 8 else None,
        "nome":        do_form(campos, CAMPOS_NOME),
        "sincronizado_em": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------- Supabase
def sb(metodo, caminho, url, key, **kw):
    req = urllib.request.Request(
        f"{url}/rest/v1/{caminho}", method=metodo,
        data=json.dumps(kw.pop("json")).encode() if "json" in kw else None,
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", **kw.pop("headers", {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            corpo = r.read().decode()
            return json.loads(corpo) if corpo.strip() else []
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"Supabase {metodo} {caminho}: {e.code}: {e.read().decode()[:400]}")


def anuncios_com_gasto(desde, url, key):
    """Anuncios que gastaram na janela, direto do Supabase. Ver o cabecalho."""
    q = urllib.parse.urlencode({
        "select": "anuncio_id", "data": f"gte.{desde}", "gasto": "gt.0",
        "limit": 10000})
    linhas = sb("GET", f"fato_meta_insights?{q}", url, key)
    return sorted({l["anuncio_id"] for l in linhas if l.get("anuncio_id")})


def gravar(linhas, url, key):
    for i in range(0, len(linhas), 500):
        sb("POST", f"{TABELA}?on_conflict=lead_id", url, key,
           json=linhas[i:i + 500],
           headers={"Prefer": "resolution=merge-duplicates,return=minimal"})


# ---------------------------------------------------------------- main
def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--aplicar", action="store_true", help="grava no Supabase")
    p.add_argument("--diagnostico", action="store_true",
                   help="so 5 anuncios, para conferir permissao e formato")
    p.add_argument("--desde", default=None,
                   help="data inicial (padrao: 60 dias atras)")
    args = p.parse_args()

    token = env("META_TOKEN")
    sb_url, sb_key = env("SUPABASE_URL").rstrip("/"), env("SUPABASE_SERVICE_KEY")

    desde = args.desde or (date.today() - timedelta(days=60)).isoformat()
    desde_unix = int(datetime.fromisoformat(desde)
                     .replace(tzinfo=timezone.utc).timestamp())
    log(f"janela: leads criados a partir de {desde}")

    anuncios = anuncios_com_gasto(desde, sb_url, sb_key)
    if not anuncios:
        raise RuntimeError(
            "nenhum anuncio com gasto na janela -- o meta_sync.py rodou? "
            "abortando sem gravar")
    if args.diagnostico:
        anuncios = anuncios[:5]
    log(f"anuncios a consultar: {len(anuncios)}")

    # Nome do formulario vem uma vez por formulario, nao por lead.
    nome_do_form, todos, vazios = {}, [], 0
    for i, ad in enumerate(anuncios, 1):
        leads = leads_do_anuncio(ad, token, desde_unix)
        if not leads:
            vazios += 1
        for l in leads:
            fid = str(l.get("form_id") or "")
            if fid and fid not in nome_do_form:
                try:
                    nome_do_form[fid] = get(fid, {"fields": "name"}, token).get("name")
                except RuntimeError:
                    nome_do_form[fid] = None      # sem permissao no formulario
            todos.append(transformar(l, nome_do_form))
        if i % 25 == 0:
            log(f"  {i}/{len(anuncios)} anuncios · {len(todos)} leads ate aqui")
        time.sleep(0.2)

    log("")
    log("-" * 66)
    log(f"  leads COLETADOS (ainda nao gravados) ... {len(todos)}")
    log(f"  anuncios sem nenhum lead ............... {vazios}/{len(anuncios)}")
    if todos:
        log(f"  com e-mail ............................. "
            f"{sum(1 for l in todos if l['email'])}")
        log(f"  com telefone ........................... "
            f"{sum(1 for l in todos if l['tel8'])}")
        log(f"  formularios distintos .................. {len(nome_do_form)}")
    log("-" * 66)

    # Rede de seguranca, nao o sintoma esperado: quando falta
    # `leads_retrieval`, a Meta devolve 400 e o script morre antes de chegar
    # aqui (conferido em 08/09/2026). Isto cobre o caso mais sutil -- token
    # que enxerga o anuncio mas nao o formulario, voltando vazio sem erro.
    if vazios == len(anuncios):
        log("")
        log("NENHUM anuncio devolveu lead, e sem erro da Meta. Antes de concluir")
        log("que nao houve lead, confira se o token enxerga os FORMULARIOS --")
        log("permissao de anuncio e permissao de formulario sao separadas.")
        return

    for l in todos[:8]:
        log(f"    {l['criado_em'][:10]}  ad {l['anuncio_id']}  "
            f"{(l['form_nome'] or l['form_id'] or '')[:22]:<24} "
            f"{'e-mail' if l['email'] else '      '} "
            f"{'tel' if l['tel8'] else ''}")

    if not args.aplicar:
        log("")
        log("MODO DIAGNOSTICO -- nada foi gravado. Use --aplicar para escrever.")
        return

    gravar(todos, sb_url, sb_key)
    log("")
    log(f"GRAVADO: {len(todos)} leads.")

    agora = datetime.now(timezone.utc).isoformat()
    sb("POST", "integracao_status?on_conflict=fonte", sb_url, sb_key,
       json=[{"fonte": "meta_leads", "nome_exibicao": "Leads por anúncio (Meta)",
              "ultima_sync": agora, "status": "ok", "atualizado_em": agora}],
       headers={"Prefer": "resolution=merge-duplicates,return=minimal"})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ERRO: {exc}")
        sys.exit(1)
