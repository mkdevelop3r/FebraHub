# -*- coding: utf-8 -*-
"""
Auditoria comercial por IA — Febracis Bahia.

Roda DEPOIS de transcrever_audios.py:
    1. transcrever_audios.py  -> transcricoes.csv
    2. auditar_conversas.py   -> auditorias.csv

O que faz:
    - monta a conversa em ordem, juntando texto + áudio transcrito
    - descarta o que não é atendimento humano (disparo em massa)
    - descarta conversa com áudio ainda não transcrito (auditar sem ele é injusto)
    - aplica o prompt de auditoria e grava o JSON estruturado

Uso:
    python auditar_conversas.py                 # todas as conversas do transcricoes.csv
    python auditar_conversas.py <conversation_id> [...]
"""
import os, sys, json, csv, time, datetime, urllib.request, urllib.error

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def carregar_env(caminho=".env"):
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            for linha in f:
                linha = linha.strip()
                if not linha or linha.startswith("#") or "=" not in linha:
                    continue
                if linha.lower().startswith("export "):
                    linha = linha[7:]
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


carregar_env()

try:
    import db
except ImportError:
    db = None

BLACKCRM_TOKEN = os.environ.get("BLACK_CRM_TOKEN")
OPENAI_KEY     = os.environ.get("OPENAI_API_KEY")
API_BASE       = "https://services.leadconnectorhq.com"
MODELO         = "gpt-4o-mini"          # troque se quiser outro
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")

GGB = {
    "1DJ3xRIzLr9yrOnKn3wE": "Alana Faleiro",
    "FZTwnSHPc3omb8Dib0eE": "Beatriz Novaes",
    "al2UgFV31HyBTWnlbPz7": "Beatriz Souza",
}

# --- filtro de atendimento humano -------------------------------------------
# source="app"  -> a consultora digitou no aplicativo
# source="bulk_actions" -> disparo em massa (NÃO é atendimento)
MIN_MSGS_HUMANAS = 3

PROMPT = """Você audita atendimentos de WhatsApp da Febracis Bahia seguindo o Roteiro
de Ligação e Critérios de Auditoria (versão adaptada ao WhatsApp). Você é auditor:
não dá conselhos ao consultor, não ensina a vender, não opina.

O CANAL É ASSÍNCRONO. Considere isto ao avaliar:
- NÃO exija quebra-gelo: no WhatsApp a primeira mensagem já é a abordagem.
- NÃO avalie quem escreveu mais: por texto o cliente naturalmente escreve menos.
- Demora entre mensagens é normal e não é falha da consultora.
- Mensagens marcadas [ÁUDIO TRANSCRITO] foram faladas pela consultora e valem
  para todas as etapas, igual às escritas.
- Mensagens marcadas DISPARO AUTOMÁTICO não foram escritas pela consultora:
  servem de contexto, mas NÃO contam como mérito nem como falha dela.

AVALIE 10 ETAPAS. Nota 1 (cumprida) ou 0 (falhou). Use null apenas em
tratamento_objecoes, quando o cliente não levantou nenhuma objeção.

1 apresentacao — apresentou-se, informou a Febracis, confirmou com quem falava.
  Falha: começou por preço ou produto.
2 motivo_contato — descobriu o que levou o cliente a buscar, o que chamou atenção,
  o que ele espera encontrar.
3 perfil_profissional — identificou profissão, cargo, ramo, negócio ou momento
  profissional.
4 objetivos_futuro — investigou onde o cliente quer chegar, o que quer conquistar.
5 desafios_dores — identificou ao menos um desafio real E aprofundou (consequência,
  há quanto tempo, o que muda se não resolver). Perguntar "qual seu objetivo?" e
  seguir direto para a apresentação NÃO conta como sondagem.
6 apresentacao_treinamento — apresentou APÓS entender o cliente e conectou a solução
  à necessidade que ele mesmo citou (Regra de Ouro). Falha: catálogo genérico,
  carga horária e preço sem ligação com a dor dele.
7 validacao_interesse — validou a percepção ("faz sentido para o seu momento?"),
  deu espaço para o cliente responder.
8 tratamento_objecoes — ouviu a objeção, investigou o motivo real, evitou desconto
  imediato, reforçou valor, validou se resolveu. null se não houve objeção.
9 fechamento — retomou a necessidade, pediu a decisão de forma clara, apresentou
  condições. Falha: encerrou passivamente, deixou a decisão por conta do cliente.
10 proximos_passos — deixou combinado o passo seguinte, com data ou ação definida.

ORDEM: o roteiro exige sequência (apresentação, sondagem, objetivos, desafios,
apresentação personalizada, validação, objeções, fechamento, próximos passos).
Informe ordem_respeitada true/false.

PONTOS CRÍTICOS: marque true para cada um que ocorreu:
apresentou_antes_de_sondar, nao_identificou_profissao, nao_identificou_objetivos,
nao_identificou_desafios, perguntas_superficiais, discurso_generico,
nao_conectou_solucao, nao_trabalhou_objecoes, nao_realizou_fechamento,
sem_proximo_passo.

NÃO CALCULE NOTA NEM SCORE. O cálculo é feito fora, a partir das suas notas.

Responda SÓ com este JSON, sem texto em volta e sem blocos de código:
{"etapas":{"apresentacao":{"nota":<1|0>,"obs":"<frase>"},
"motivo_contato":{"nota":<1|0>,"obs":""},"perfil_profissional":{"nota":<1|0>,"obs":""},
"objetivos_futuro":{"nota":<1|0>,"obs":""},"desafios_dores":{"nota":<1|0>,"obs":""},
"apresentacao_treinamento":{"nota":<1|0>,"obs":""},"validacao_interesse":{"nota":<1|0>,"obs":""},
"tratamento_objecoes":{"nota":<1|0|null>,"obs":""},"fechamento":{"nota":<1|0>,"obs":""},
"proximos_passos":{"nota":<1|0>,"obs":""}},
"criticos":{"apresentou_antes_de_sondar":<bool>,"nao_identificou_profissao":<bool>,
"nao_identificou_objetivos":<bool>,"nao_identificou_desafios":<bool>,
"perguntas_superficiais":<bool>,"discurso_generico":<bool>,"nao_conectou_solucao":<bool>,
"nao_trabalhou_objecoes":<bool>,"nao_realizou_fechamento":<bool>,"sem_proximo_passo":<bool>},
"ordem_respeitada":<bool>,"temperatura_lead":"<quente|morno|frio>",
"falhas":["<falha objetiva>"],"conclusao":"<2 a 4 frases>"}"""


def crm(path):
    req = urllib.request.Request(API_BASE + path, headers={
        "Authorization": f"Bearer {BLACKCRM_TOKEN}",
        "Version": "2021-04-15", "Accept": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def detalhe_erro(e):
    if isinstance(e, urllib.error.HTTPError):
        try:
            return f"HTTP {e.code} {e.read().decode('utf-8','replace')[:200]}"
        except Exception:
            return f"HTTP {e.code}"
    return f"{type(e).__name__}: {e}"[:200]


def carregar_transcricoes(caminho="transcricoes.csv"):
    """message_id -> texto transcrito."""
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            return {r["message_id"]: r["transcricao"]
                    for r in csv.DictReader(f) if (r.get("transcricao") or "").strip()}
    except FileNotFoundError:
        print("! transcricoes.csv não encontrado — rode transcrever_audios.py antes.")
        return {}


def montar_conversa(msgs, transcricoes):
    """Devolve (texto_da_conversa, consultora, humanas, audio_pendente)."""
    linhas, consultora, humanas, pendente = [], None, 0, 0
    for m in sorted(msgs, key=lambda x: x.get("dateAdded") or ""):
        if m.get("messageType", "").startswith("TYPE_ACTIVITY"):
            continue                                  # evento de funil, não é fala
        uid    = m.get("userId") or ""
        origem = (m.get("source") or "").lower()
        corpo  = (m.get("body") or "").strip()
        anexos = m.get("attachments") or []
        eh_saida = m.get("direction") == "outbound"

        if eh_saida and uid in GGB:
            consultora = GGB[uid]

        if anexos and not corpo:                      # mensagem de mídia
            t = transcricoes.get(m.get("id"))
            if t:
                corpo = f"[ÁUDIO TRANSCRITO] {t}"
            else:
                pendente += 1
                continue

        if not corpo:
            continue

        if eh_saida:
            if origem == "bulk_actions":
                quem = "DISPARO AUTOMÁTICO"           # entra como contexto, não como mérito
            else:
                quem = consultora or "CONSULTORA"
                humanas += 1
        else:
            quem = "LEAD"

        data = (m.get("dateAdded") or "")[:16].replace("T", " ")
        linhas.append(f"[{data}] {quem}: {corpo}")
    return "\n".join(linhas), consultora, humanas, pendente


def auditar(texto, cid, contact_id, consultora):
    payload = {
        "model": MODELO,
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content":
                f"chat_id: {cid}\nlead_id: {contact_id}\nconsultor: {consultora}\n\n"
                f"CONVERSA:\n{texto}"},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {OPENAI_KEY}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        resp = json.loads(r.read())
    return json.loads(resp["choices"][0]["message"]["content"])


# Pesos v3 — Modelo B (WhatsApp), aprovados por Carmen em ago/2026. Somam 100.
PESOS = {
    "apresentacao":              8,
    "motivo_contato":           10,
    "perfil_profissional":       8,
    "objetivos_futuro":         10,
    "desafios_dores":           15,
    "apresentacao_treinamento": 15,
    "validacao_interesse":       8,
    "tratamento_objecoes":       8,   # condicional: só conta se houve objeção
    "fechamento":               13,
    "proximos_passos":           5,
}

# pontos críticos (seção 10 do roteiro) -> marcam "atendimento incompleto"
CRITICOS = ["apresentou_antes_de_sondar", "nao_identificou_profissao",
            "nao_identificou_objetivos", "nao_identificou_desafios",
            "perguntas_superficiais", "discurso_generico", "nao_conectou_solucao",
            "nao_trabalhou_objecoes", "nao_realizou_fechamento", "sem_proximo_passo"]


def calcular_score(etapas):
    """Score = soma ponderada das notas / soma dos pesos aplicáveis x 100.
    Etapa com nota null (follow-up não aplicável) sai do divisor.
    Calculado aqui, nunca pela IA — modelo de linguagem erra aritmética."""
    soma = base = 0.0
    for chave, peso in PESOS.items():
        nota = (etapas.get(chave) or {}).get("nota")
        if nota is None:
            continue
        base += peso
        soma += peso * float(nota)
    if not base:
        return None, None
    valor = round(soma / base * 100)
    faixa = "alta" if valor >= 80 else "media" if valor >= 50 else "baixa"
    return valor, faixa


def linha_csv(a, cid, consultora, humanas, n_audios):
    etapas = a.get("etapas", {})
    score, faixa = calcular_score(etapas)
    criticos = [k for k in CRITICOS if (a.get("criticos") or {}).get(k)]
    linha = {
        "conversation_id": cid,
        "consultora": consultora,
        "msgs_humanas": humanas,
        "audios_usados": n_audios,
        "score": score,
        "faixa": faixa,
        "atendimento_completo": "nao" if criticos else "sim",
        "pontos_criticos": " | ".join(criticos),
        "ordem_respeitada": a.get("ordem_respeitada"),
        "temperatura_lead": a.get("temperatura_lead"),
    }
    for chave in PESOS:
        nota = (etapas.get(chave) or {}).get("nota")
        linha[chave] = "" if nota is None else nota
    linha["falhas"] = " | ".join(a.get("falhas", []))
    linha["conclusao"] = a.get("conclusao", "")
    linha["auditado_em"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return linha


if __name__ == "__main__":
    faltando = [n for n, v in (("BLACK_CRM_TOKEN", BLACKCRM_TOKEN),
                               ("OPENAI_API_KEY", OPENAI_KEY)) if not v]
    if faltando:
        sys.exit("Faltou no .env: " + ", ".join(faltando))

    transcricoes = carregar_transcricoes()

    ids = sys.argv[1:]
    if not ids:
        try:
            with open("transcricoes.csv", encoding="utf-8-sig") as f:
                ids = list(dict.fromkeys(r["conversation_id"] for r in csv.DictReader(f)))
        except FileNotFoundError:
            sys.exit("Passe os conversation_id ou rode transcrever_audios.py antes.")
        print(f"{len(ids)} conversas do transcricoes.csv\n")

    resultados, pulados = [], []
    for cid in ids:
        try:
            resp = crm(f"/conversations/{cid}/messages?limit=100")
            msgs = resp.get("messages", {}).get("messages", [])
        except Exception as e:
            print(f"{cid}: ! {detalhe_erro(e)}")
            continue

        texto, consultora, humanas, pendente = montar_conversa(msgs, transcricoes)

        if pendente:
            print(f"{cid}: pulada — {pendente} áudio(s) sem transcrição")
            pulados.append((cid, f"{pendente} áudio pendente")); continue
        if humanas < MIN_MSGS_HUMANAS:
            print(f"{cid}: pulada — só {humanas} mensagem(ns) humana(s)")
            pulados.append((cid, f"{humanas} msgs humanas")); continue

        n_audios = texto.count("[ÁUDIO TRANSCRITO]")
        try:
            a = auditar(texto, cid, msgs[0].get("contactId"), consultora or "?")
        except Exception as e:
            print(f"{cid}: ! auditoria falhou — {detalhe_erro(e)}")
            continue

        linha = linha_csv(a, cid, consultora, humanas, n_audios)
        resultados.append(linha)
        marca = "COMPLETO" if linha["atendimento_completo"] == "sim" else \
                f"{len(linha['pontos_criticos'].split(' | '))} críticos"
        print(f"{cid}: {consultora} · score {linha['score']} ({linha['faixa']}) · "
              f"{humanas} msgs, {n_audios} áudios · {marca}")
        time.sleep(0.5)

    if resultados:
        with open("auditorias_whatsapp.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(resultados[0].keys()))
            w.writeheader(); w.writerows(resultados)
        media = sum(r["score"] for r in resultados if r["score"]) / len(resultados)
        print(f"\n{len(resultados)} auditadas · score médio {media:.0f} -> auditorias_whatsapp.csv")

        if db and db.disponivel():
            n, erro = db.gravar(resultados, "whatsapp")
            print("Supabase: " + (f"{n} auditorias gravadas" if not erro else f"FALHOU — {erro}"))
        else:
            print("Supabase: não configurado — resultado só no CSV")
    else:
        print("\nNenhuma conversa auditada.")
    if pulados:
        print(f"{len(pulados)} puladas (áudio pendente ou pouco atendimento humano).")
