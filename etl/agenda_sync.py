#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FebraHub · Google Agenda -> Central de Eventos

POR QUE ISTO EXISTE
-------------------
Os eventos da Central vieram de uma importacao manual em 18/08/2026 e
congelaram ali. Se o gestor movia uma data no Google, o FebraHub continuava
mostrando a data velha e o checklist cobrando prazos velhos -- sem aviso
nenhum, porque nada no sistema estava olhando para a agenda.

O trabalho pesado mora no banco, na funcao `mkt_sincroniza_agenda` (migration
138). Este script so faz duas coisas: le o calendario e entrega a lista
pronta para ela. A regra de negocio inteira -- o que entra, o que atualiza,
o que jamais e apagado -- esta na migration, e nao aqui.

O QUE ELE NAO FAZ
-----------------
Nao apaga e nao cancela nada. Evento que sumiu da agenda aparece na secao
"sumidos" do relatorio e para por ai: sumir e ambiguo (desmarcado? movido
para fora da janela? erro de quem mexeu no calendario?) e cancelar leva o
checklist junto. Quem cancela e gente, pela tela, com motivo.

CREDENCIAIS
-----------
Nenhuma nova. Reaproveita as duas que ja existem em etl/:

  service_account.json     a mesma conta usada nas planilhas
                           (connect-shetts@loja-api-503314). Ela ja tem
                           acesso de leitura ao calendario -- conferido.
                           Alternativas: GOOGLE_SERVICE_ACCOUNT (conteudo)
                           ou GOOGLE_SERVICE_ACCOUNT_FILE (caminho).

  .env                     SUPABASE_URL e SUPABASE_SERVICE_KEY.
                           A funcao so aceita service_role de proposito:
                           reescrever a agenda inteira nao e coisa que se
                           faca a partir do navegador.

Se o calendario mudar de dono ou for trocado, compartilhe o novo com o
e-mail da conta de servico e atualize mkt_unidades.agenda_google_id. O
script le a lista de calendarios do banco -- nao ha e-mail fixo aqui.

USO
---
    pip install google-auth google-api-python-client

    python agenda_sync.py                  # diagnostico: mostra, nao grava
    python agenda_sync.py --sync           # aplica
    python agenda_sync.py --sync --dias 365
    python agenda_sync.py --sync --sem-recorrentes

RECORRENTES ENTRAM
------------------
Instancias de evento recorrente entram como qualquer outra, e isso e
deliberado. A primeira versao deste script as filtrava, para nao encher a
fila do Bruno com a mesma reuniao toda semana -- mas o sistema ja resolvia
isso, e melhor: `mkt_regras_classificacao` tem regra 'ignorar' para
"Reuniao com os Treinadores" e "Reuniao estrategica com Recife", e as 34
instancias que ja estao no banco caem sozinhas em `sem_acoes`, sem passar
pela fila.

Filtrar aqui, alem de redundante, mentia: as instancias ficavam de fora da
lista enviada e a funcao as reportava como "sumidas da agenda" -- 32 alarmes
falsos por rodada. Reuniao nova que nao se divulga se resolve com uma linha
em mkt_regras_classificacao, que e onde essa decisao pertence.

`--sem-recorrentes` continua disponivel para depuracao.
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import date, timedelta

# stdout do Windows e cp1252; nome de evento com acento nao pode derrubar o
# script na hora de imprimir o relatorio.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

AQUI = os.path.dirname(os.path.abspath(__file__))
ESCOPO = ["https://www.googleapis.com/auth/calendar.readonly"]
TIMEOUT = 60


# ============================================================
# 1. Ambiente
# ============================================================

def carregar_env():
    """.env da pasta do script, sem sobrescrever o que ja veio do ambiente."""
    caminho = os.path.join(AQUI, ".env")
    if not os.path.exists(caminho):
        return
    for linha in open(caminho, encoding="utf-8"):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def credencial_google():
    from google.oauth2 import service_account
    bruto = os.environ.get("GOOGLE_SERVICE_ACCOUNT")
    if bruto:
        return service_account.Credentials.from_service_account_info(
            json.loads(bruto), scopes=ESCOPO)
    arquivo = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE") or \
        os.path.join(AQUI, "service_account.json")
    if not os.path.exists(arquivo):
        sys.exit("Sem credencial do Google. Veja o cabecalho deste arquivo.")
    return service_account.Credentials.from_service_account_file(arquivo, scopes=ESCOPO)


# ============================================================
# 2. Supabase (PostgREST cru, sem dependencia extra)
# ============================================================

class Supabase:
    def __init__(self):
        self.url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not self.url or not self.key:
            sys.exit("Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.")

    def _pedir(self, caminho, dados=None):
        req = urllib.request.Request(
            self.url + caminho,
            data=json.dumps(dados).encode("utf-8") if dados is not None else None,
            headers={"apikey": self.key, "Authorization": "Bearer " + self.key,
                     "Content-Type": "application/json"},
            method="POST" if dados is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            sys.exit("Supabase %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:500]))

    def unidades(self):
        return self._pedir("/rest/v1/mkt_unidades"
                           "?select=id,nome,slug,agenda_google_id"
                           "&ativa=eq.true&agenda_google_id=not.is.null")

    def eventos(self, unidade_id):
        return self._pedir("/rest/v1/mkt_eventos"
                           "?select=google_event_id,nome,data_evento,status"
                           "&unidade_id=eq." + unidade_id + "&limit=2000")

    def sincronizar(self, calendario, eventos, desde):
        return self._pedir("/rest/v1/rpc/mkt_sincroniza_agenda", {
            "p_calendario": calendario,
            "p_eventos": eventos,
            "p_desde": desde.isoformat(),
        })


# ============================================================
# 3. Google Agenda
# ============================================================

def ler_agenda(api, calendario, desde, ate, sem_recorrentes):
    """Devolve (lista no formato da funcao, quantas recorrencias foram puladas).

    singleEvents=True expande a serie em instancias -- e o que a Central
    precisa, porque cada data tem o proprio checklist, e e como os 34
    "Reuniao..." ja gravados entraram. O id da instancia carrega '_'
    (base_20260701T130000Z); e por ele que se reconhece uma recorrencia sem
    ter de pedir a serie inteira ao Google.
    """
    itens, token, puladas = [], None, 0
    while True:
        r = api.events().list(
            calendarId=calendario,
            timeMin=desde.isoformat() + "T00:00:00Z",
            timeMax=ate.isoformat() + "T00:00:00Z",
            singleEvents=True, orderBy="startTime",
            maxResults=250, pageToken=token).execute()
        itens += r.get("items", [])
        token = r.get("nextPageToken")
        if not token:
            break

    saida = []
    for e in itens:
        # 'cancelled' e o proprio Google dizendo que a instancia nao vale.
        if e.get("status") == "cancelled":
            continue
        if sem_recorrentes and "_" in e.get("id", ""):
            puladas += 1
            continue
        inicio = e.get("start", {})
        # Evento de dia inteiro traz 'date'; com hora, 'dateTime'. A Central
        # trabalha em dia, entao os dois viram a mesma coisa.
        dia = inicio.get("date") or (inicio.get("dateTime") or "")[:10]
        nome = (e.get("summary") or "").strip()
        if not dia or not nome:
            continue
        saida.append({"google_event_id": e["id"], "nome": nome, "data": dia})
    return saida, puladas


# ============================================================
# 4. Diagnostico — compara sem gravar
# ============================================================

def diagnosticar(agenda, banco, desde):
    """Espelha a logica da funcao 138 para leitura humana. A verdade sobre o
    que sera gravado e sempre a funcao; isto aqui e o olho antes do salto."""
    no_banco = {e["google_event_id"]: e for e in banco if e.get("google_event_id")}
    novos, datas, nomes, passado = [], [], [], 0

    for item in agenda:
        atual = no_banco.get(item["google_event_id"])
        if atual is None:
            if item["data"] < desde.isoformat():
                passado += 1
            else:
                novos.append(item)
            continue
        if atual["status"] == "cancelado":
            continue
        if atual["data_evento"] != item["data"]:
            datas.append((atual["nome"], atual["data_evento"], item["data"]))
        if (atual["nome"] or "").strip() != item["nome"]:
            nomes.append((atual["nome"], item["nome"]))

    vistos = {i["google_event_id"] for i in agenda}
    janela = [i["data"] for i in agenda]
    sumidos = []
    if janela:
        piso, teto = max(min(janela), desde.isoformat()), max(janela)
        sumidos = [e for e in banco
                   if e.get("google_event_id") not in vistos
                   and e["status"] != "cancelado"
                   and piso <= e["data_evento"] <= teto]
    return novos, datas, nomes, passado, sumidos


def imprimir(titulo, linhas, formatar, limite=15):
    print("\n%s: %d" % (titulo, len(linhas)))
    for x in linhas[:limite]:
        print("   ", formatar(x))
    if len(linhas) > limite:
        print("    ... e mais %d" % (len(linhas) - limite))


# ============================================================
# 5. Principal
# ============================================================

def main():
    p = argparse.ArgumentParser(description="Sincroniza a agenda do Google com a Central de Eventos.")
    p.add_argument("--sync", action="store_true", help="aplica; sem isto, so mostra")
    p.add_argument("--dias", type=int, default=180, help="janela para frente (padrao 180)")
    p.add_argument("--desde", help="data inicial AAAA-MM-DD (padrao hoje)")
    p.add_argument("--sem-recorrentes", action="store_true",
                   help="deixa instancias de evento recorrente de fora (depuracao)")
    args = p.parse_args()

    carregar_env()
    desde = date.fromisoformat(args.desde) if args.desde else date.today()
    ate = desde + timedelta(days=args.dias)

    from googleapiclient.discovery import build
    api = build("calendar", "v3", credentials=credencial_google(), cache_discovery=False)
    sb = Supabase()

    unidades = sb.unidades()
    if not unidades:
        sys.exit("Nenhuma unidade ativa com agenda_google_id preenchido.")

    for u in unidades:
        cal = u["agenda_google_id"]
        print("=" * 60)
        print("%s  ·  %s" % (u["nome"], cal))
        print("janela: %s -> %s" % (desde, ate))

        agenda, puladas = ler_agenda(api, cal, desde, ate, args.sem_recorrentes)
        print("na agenda: %d evento(s)%s" %
              (len(agenda), "  (%d recorrente(s) fora)" % puladas if puladas else ""))

        if args.sync:
            r = sb.sincronizar(cal, agenda, desde)
            print("\n-- aplicado --")
            for k in ("inseridos", "datas_mudadas", "nomes_mudados",
                      "classificados", "passado_ignorado", "sem_mudanca"):
                print("   %-18s %s" % (k, r.get(k)))
            for m in r.get("mudancas", []):
                if m["acao"] == "data":
                    print("    data: %s  %s -> %s" % (m["nome"], m["de"], m["para"]))
                elif m["acao"] == "nome":
                    print("    nome: %s -> %s" % (m["de"], m["para"]))
                else:
                    print("    novo: %s (%s)" % (m["nome"], m["data"]))
            if r.get("sumidos"):
                print("\n   NA CENTRAL E NAO NA AGENDA (ninguem cancelou nada;")
                print("   decida na tela se e desmarcado de verdade):")
                for s in r["sumidos"]:
                    print("    - %s  %s  [%s]" % (s["data"], s["nome"], s["status"]))
        else:
            banco = sb.eventos(u["id"])
            novos, datas, nomes, passado, sumidos = diagnosticar(agenda, banco, desde)
            print("no banco:  %d evento(s)" % len(banco))
            imprimir("ENTRARIAM", novos, lambda x: "%s  %s" % (x["data"], x["nome"]))
            imprimir("DATA MUDOU", datas, lambda x: "%s: %s -> %s" % x)
            imprimir("NOME MUDOU", nomes, lambda x: "%s -> %s" % x)
            print("\npassado ignorado: %d" % passado)
            imprimir("NA CENTRAL E NAO NA AGENDA (so aviso)", sumidos,
                     lambda e: "%s  %s  [%s]" % (e["data_evento"], e["nome"], e["status"]))
            print("\nNada foi gravado. Para aplicar: --sync")

    print("=" * 60)


if __name__ == "__main__":
    main()
