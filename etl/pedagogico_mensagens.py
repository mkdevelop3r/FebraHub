"""
etl/pedagogico_mensagens.py

Lê as filas de mensagem do Supabase, grava os campos no CRM, aplica a tag
que dispara o workflow, e registra o envio.

A CADEIA COMPLETA:
  view (Supabase) -> este script -> campos + tag (CRM) -> workflow
  -> 4zapy -> aluno

TRÊS FILAS:

  turma           confirmação de participação e link do grupo.
                  Enfileirada pela Elis no botão "Salvar turma" — ela
                  decide o momento, o script só entrega. É a única
                  fila que não é view calculada.
                  Tags: 'pedagogico:confirmacao' e 'pedagogico:grupo'

  boas_vindas     no ato da compra. Acolhimento + prazo da vaga.
                  Tag: 'pedagogico boas-vindas'

  prazo_vencendo  faltam menos de 90 dias e EXISTE turma antes do
                  vencimento. Quem não tem turma disponível fica de
                  fora de propósito — mandar "seu prazo acaba" sem
                  ter o que oferecer cria problema, não resolve.
                  Tag: 'pedagogico prazo'

TRÊS TAGS POR CONTATO: a da mensagem ('pedagogico boas-vindas' ou
'pedagogico prazo'), que o workflow remove ao terminar, e a da turma
('turma:2026_fgpc26'), que fica para sempre e serve para filtrar quem
é de qual turma. O CRM aceita tag livre por API, então não é preciso
campo intermediário nem tag dinâmica no workflow.

A ORDEM IMPORTA: a tag vai ANTES do registro. `pedagogico_envios` é
registro do que já foi feito, não fila de saída — gravar antes da tag
criaria uma linha que bloqueia o reenvio de uma mensagem que nunca saiu.

E O REGISTRO É POR PESSOA, DENTRO DO LOOP. Registrar em lote no fim
parece mais eficiente, mas quando o lote falha (constraint, rede) todo
mundo fica com tag aplicada e sem registro — ou seja, recebe a mensagem
de novo na próxima execução. Aconteceu duas vezes durante a montagem
disto. Uma chamada por pessoa é mais lenta e nunca deixa esse rastro.

Se o CRM falhar num contato, ele não é registrado e volta na fila
amanhã. É o comportamento certo.

Variáveis de ambiente:
  SUPABASE_URL, SUPABASE_SERVICE_KEY
  CRM_TOKEN, CRM_LOCATION_ID
  MSG_LIMITE   opcional, padrão 10. Comece pequeno: mensagem errada em
               produção se descobre com cliente real. 0 = sem limite.
"""

import os
import sys
import time

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CRM_TOKEN = os.environ["CRM_TOKEN"]
CRM_LOCATION = os.environ["CRM_LOCATION_ID"]
LIMITE = int(os.environ.get("MSG_LIMITE") or 10)

SB = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
      "Content-Type": "application/json"}
CRM = {"Authorization": f"Bearer {CRM_TOKEN}", "Version": "2021-07-28",
       "Content-Type": "application/json", "Accept": "application/json"}
CRM_API = "https://services.leadconnectorhq.com"

# IDs, não fieldKey. A API do LeadConnector devolve 400 quando recebe
# "contact.pedagogico_curso" no lugar do id.
CAMPO_CURSO = "aEypUKJotJp6CNa9qkjm"   # Pedagogico Curso
CAMPO_PRAZO = "hgKOTXvRxnNxFiULiRFi"   # Pedagogico Prazo
CAMPO_PROXIMA = "oGv3CqcWa4lUekDI9Wap" # Pedagogico Proxima Turma
CAMPO_DATAS = "qjFuniXeOdO812RlO3k4"   # Pedagogico Datas
CAMPO_HORARIOS = "NO62an9Rmr7izspnABUG" # Pedagogico Horarios
CAMPO_CREDENC = "Xjza3zFQ0KqopHqFVoJv" # Pedagogico Credenciamento
CAMPO_LINK = "fXr7R9YN5Jz7Hv14RoHm"    # Pedagogico Link Grupo

TAG_BOAS_VINDAS = "pedagogico boas-vindas"
TAG_PRAZO = "pedagogico prazo"
TAG_CONFIRMACAO = "pedagogico:confirmacao"
TAG_GRUPO = "pedagogico:grupo"


def log(m):
    print(m, flush=True)


def erro_com_corpo(r):
    """400 sem corpo é chute. O corpo diz o motivo em uma linha."""
    if not r.ok:
        raise RuntimeError(f"{r.status_code} {r.text[:400]}")
    return r


def ler_fila(view, limite):
    p = f"?select=*&limit={limite}" if limite else "?select=*"
    r = erro_com_corpo(requests.get(f"{SUPABASE_URL}/rest/v1/{view}{p}",
                                    headers=SB, timeout=60))
    return r.json()


def data_br(iso):
    """2027-08-08 -> 08/08/2027. O cliente lê data, não ISO."""
    if not iso:
        return ""
    a, m, d = iso[:10].split("-")
    return f"{d}/{m}/{a}"


def upsert_contato(nome, telefone, email, curso, prazo=None, proxima=None,
                   datas=None, horarios=None, credenciamento=None, link_grupo=None):
    """Cria ou atualiza o contato com os campos que o template usa.

    Devolve o contactId. O upsert deduplica por telefone/e-mail, então
    não cria contato repetido para quem já existe.

    `proxima` só é usado na mensagem de prazo. A de boas-vindas não fala
    de turma de propósito: a turma da venda é frequentemente uma que o
    cliente nunca combinou.
    """
    campos = [{"id": CAMPO_CURSO, "field_value": curso or ""}]
    if prazo:
        campos.append({"id": CAMPO_PRAZO, "field_value": data_br(prazo)})
    if proxima:
        campos.append({"id": CAMPO_PROXIMA, "field_value": data_br(proxima)})
    for cid_campo, valor in ((CAMPO_DATAS, datas),
                             (CAMPO_HORARIOS, horarios),
                             (CAMPO_CREDENC, credenciamento),
                             (CAMPO_LINK, link_grupo)):
        if valor:
            campos.append({"id": cid_campo, "field_value": valor})

    corpo = {"locationId": CRM_LOCATION, "customFields": campos}
    if nome:
        corpo["name"] = nome
    if telefone:
        corpo["phone"] = telefone
    if email:
        corpo["email"] = email

    if not telefone and not email:
        raise RuntimeError("sem telefone e sem e-mail")

    r = erro_com_corpo(requests.post(f"{CRM_API}/contacts/upsert",
                                     headers=CRM, json=corpo, timeout=30))
    d = r.json()
    return (d.get("contact") or {}).get("id") or d.get("id")


def tag_turma(turma_id):
    """'2026 - FGPC26' -> 'turma:2026_fgpc26'

    Só os dois primeiros pedaços: '2026 - CIS-GL251 - Olho dAgua das
    Flores' vira 'turma:2026_cis-gl251'. A cidade deixaria a tag longa
    demais para filtrar no CRM.

    Esta tag NÃO é removida pelos workflows — é histórico. A pessoa
    acumula uma por curso que fez, e é isso que permite filtrar
    'quem é da FGPC26' meses depois.
    """
    if not turma_id:
        return None
    partes = [p.strip() for p in turma_id.split(" - ") if p.strip()]
    if not partes:
        return None
    return "turma:" + "_".join(partes[:2]).lower()


def aplicar_tags(contact_id, tags):
    tags = [t for t in tags if t]
    if not tags:
        return
    erro_com_corpo(requests.post(f"{CRM_API}/contacts/{contact_id}/tags",
                                 headers=CRM, json={"tags": tags}, timeout=30))


def registrar(funcao, item):
    r = erro_com_corpo(requests.post(f"{SUPABASE_URL}/rest/v1/rpc/{funcao}",
                                     headers=SB, json={"p_itens": [item]},
                                     timeout=60))
    return r.json()


def periodo(de, ate):
    """'2026-08-26' + '2026-08-29' -> '26 a 29/08/2026'.

    Uma data só quando for o mesmo dia. O template escreve
    'nos dias {{...}}', então isso precisa encaixar na frase.
    """
    if not de:
        return ""
    if not ate or ate[:10] == de[:10]:
        return data_br(de)
    a1, m1, d1 = de[:10].split("-")
    a2, m2, d2 = ate[:10].split("-")
    if (a1, m1) == (a2, m2):
        return f"{d1} a {d2}/{m1}/{a1}"
    return f"{data_br(de)} a {data_br(ate)}"


def horario_faixa(ini, fim):
    """'9h' + '22h' -> 'das 9h às 22h'. Só o início se não houver fim."""
    ini = (ini or "").strip()
    fim = (fim or "").strip()
    if not ini:
        return ""
    return f"das {ini} às {fim}" if fim else f"a partir das {ini}"


def processar(view, tag, funcao_registro, monta_campos, exige=()):
    """`exige` lista campos que não podem vir vazios.

    Existe porque a mensagem de prazo diz "a próxima turma começa em
    {{...}}". Sem o valor, o WhatsApp sai com a frase truncada — foi o
    que aconteceu com o Maike: "a próxima turma começa em ." Melhor
    pular a pessoa e ela voltar amanhã do que mandar texto quebrado.
    """
    fila = ler_fila(view, LIMITE)
    log(f"\n{view}: {len(fila)} na fila")
    if not fila:
        return

    ok = falhas = sem_registro = pulados = 0

    for linha in fila:
        rotulo = linha.get("nome") or linha.get("aluno_id")
        cid = None

        campos = monta_campos(linha)
        faltando = [c for c in exige if not campos.get(c)]
        if faltando:
            pulados += 1
            log(f"  pula  {rotulo}: sem {', '.join(faltando)}")
            continue

        try:
            cid = upsert_contato(**campos)
            if not cid:
                raise RuntimeError("upsert não devolveu contactId")
            tag_da_linha = tag(linha) if callable(tag) else tag
            aplicar_tags(cid, [tag_da_linha, tag_turma(linha.get("turma_id"))])

        except Exception as e:
            falhas += 1
            log(f"  ERRO  {rotulo}: {e}")
            continue          # sem tag, sem registro: volta na fila amanhã

        # A tag já saiu. O registro TEM que acontecer, senão a pessoa
        # recebe de novo amanhã. Falha aqui é grave e vai destacada.
        try:
            item = {
                "aluno_id": linha["aluno_id"],
                "turma_id": linha["turma_id"],
                "canal": linha.get("canal") or "whatsapp",
            }
            if linha.get("tipo"):
                item["tipo"] = linha["tipo"]      # fila de turma: confirmacao/grupo
            registrar(funcao_registro, item)
            ok += 1
            log(f"  ok    {rotulo}")

        except Exception as e:
            sem_registro += 1
            log(f"  ALERTA {rotulo}: tag aplicada mas NÃO registrada -> {e}")
            log(f"         corrija com: select {funcao_registro}("
                f"'[{{\"aluno_id\":\"{linha['aluno_id']}\","
                f"\"turma_id\":\"{linha['turma_id']}\"}}]'::jsonb);")

        time.sleep(0.3)       # respeita o rate limit do CRM

    log(f"{view}: {ok} enviados, {falhas} falhas, "
        f"{pulados} pulados, {sem_registro} SEM REGISTRO")

    if sem_registro:
        log("  ^ estes recebem a mensagem de novo se não forem "
            "registrados na mão.")


def main():
    processar(
        "vw_boas_vindas_fila", TAG_BOAS_VINDAS, "registrar_envio_boas_vindas",
        lambda l: {
            "nome": l.get("nome"),
            "telefone": l.get("whatsapp"),
            "email": l.get("email"),
            "curso": l.get("curso"),
            "prazo": l.get("data_limite"),
        },
    )

    # Fila de turma: confirmação e link do grupo. Diferente das outras
    # duas, que são views calculadas, esta é enfileirada pela Elis no
    # botão "Salvar turma" — ela decide o momento, o script só entrega.
    # Por isso a tag varia por linha: a mesma view traz os dois tipos.
    processar(
        "vw_turma_fila_envio",
        lambda l: TAG_CONFIRMACAO if l["tipo"] == "confirmacao" else TAG_GRUPO,
        "registrar_envio_turma",
        lambda l: {
            "nome": l.get("nome"),
            "telefone": l.get("whatsapp"),
            "email": l.get("email"),
            "curso": l.get("curso"),
            "datas": periodo(l.get("data_inicio"), l.get("data_fim")),
            "horarios": horario_faixa(l.get("horario_inicio"), l.get("horario_fim")),
            "credenciamento": l.get("horario_credenciamento"),
            "link_grupo": l.get("link_grupo"),
        },
    )

    processar(
        "vw_prazo_fila_envio", TAG_PRAZO, "registrar_envio_prazo",
        lambda l: {
            "nome": l.get("nome"),
            "telefone": l.get("telefone"),
            "email": None,
            "curso": l.get("curso"),
            "prazo": l.get("vence_em"),
            "proxima": l.get("proxima_turma_em"),
        },
        exige=("proxima",),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ERRO: {e}")
        sys.exit(1)
