# -*- coding: utf-8 -*-
"""
Auditoria de LIGAÇÕES — Modelo A (roteiro da Carmen, 12 etapas).
Pesos aprovados em ago/2026.

Fluxo:
    1. busca chamadas concluídas das consultoras
    2. baixa a transcrição pronta do CRM
    3. aplica o roteiro via IA (a IA só dá as notas)
    4. o script calcula o score e a bandeira "ligação completa"

Uso:
    python auditar_ligacoes.py            # últimos 7 dias
    python auditar_ligacoes.py 14         # últimos 14 dias

Precisa no .env:
    BLACK_CRM_TOKEN=...
    OPENAI_API_KEY=...
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

TOKEN       = os.environ.get("BLACK_CRM_TOKEN")
OPENAI_KEY  = os.environ.get("OPENAI_API_KEY")
API         = "https://services.leadconnectorhq.com"
LOCATION_ID = "JedXhdJDbwOl6lvHCCfj"
MODELO      = "gpt-4o-mini"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")

# ligação curta demais não tem o que auditar (secretária, engano, "alô?" e desliga)
MIN_DURACAO = 60   # segundos

USUARIOS = {
    "1DJ3xRIzLr9yrOnKn3wE": "Alana Faleiro",
    "FZTwnSHPc3omb8Dib0eE": "Beatriz Novaes",
    "al2UgFV31HyBTWnlbPz7": "Beatriz Souza",
    "Je5GRyecJorNLmP8XbXX": "Carmen Acássia",
    "RmfY0nJxkEbKGcY4o7u2": "Cassia Romão",
    "A1ciMyUhFKuAH86x62Q7": "Jennifer Mota",
    "Xc86LOFNQJBpaPNvtQQw": "Bianca Santos",
    # 7PrmRgKhDcqr98HHVsFL -> pendente de identificação
}

# ---------------------------------------------------------------- pesos (Carmen, ago/2026)
PESOS = {
    "apresentacao":              8,
    "quebra_gelo":               5,
    "motivo_contato":            8,
    "conhecimento_previo":       4,
    "perfil_profissional":       8,
    "objetivos_futuro":         10,
    "desafios_dores":           14,
    "apresentacao_treinamento": 14,
    "validacao_interesse":       7,
    "tratamento_objecoes":       8,   # condicional: só conta se houve objeção
    "fechamento":               10,
    "proximos_passos":           4,
}

# pontos críticos (seção 10 do roteiro) -> marcam "ligação incompleta"
CRITICOS = [
    "apresentou_antes_de_sondar",
    "nao_identificou_profissao",
    "nao_identificou_objetivos",
    "nao_identificou_desafios",
    "perguntas_superficiais",
    "discurso_generico",
    "nao_conectou_solucao",
    "nao_trabalhou_objecoes",
    "nao_realizou_fechamento",
    "sem_proximo_passo",
]

PROMPT = """Você audita ligações comerciais da Febracis Bahia seguindo o Roteiro de
Ligação e Critérios de Auditoria. Você é auditor: não dá conselhos ao consultor,
não ensina a vender, não opina.

IMPORTANTE SOBRE A TRANSCRIÇÃO: a gravação é de canal único e NÃO identifica quem
fala. Você deve inferir pelo conteúdo quem é o consultor (apresenta-se, conduz,
pergunta) e quem é o cliente (responde, questiona preço). Onde a atribuição for
ambígua, seja conservador e não penalize por dúvida.
NÃO avalie quem falou mais tempo — esse critério não é mensurável nesta gravação.

AVALIE 12 ETAPAS. Nota 1 (cumprida) ou 0 (falhou). Use null apenas em
tratamento_objecoes, quando o cliente não levantou nenhuma objeção.

1 apresentacao — apresentou-se, informou a Febracis, confirmou com quem falava,
  demonstrou segurança. Falha: começou por preço ou produto.
2 quebra_gelo — criou conexão antes da sondagem, conversa natural.
  Falha: abordagem robotizada, pulou direto para a oferta.
3 motivo_contato — descobriu o que levou o cliente a buscar, o que chamou atenção,
  o que ele espera.
4 conhecimento_previo — verificou se já conhece a Febracis, se já participou de
  treinamento.
5 perfil_profissional — identificou profissão, cargo, ramo, negócio, tempo de atuação.
6 objetivos_futuro — investigou onde o cliente quer chegar, o que quer conquistar.
7 desafios_dores — identificou ao menos um desafio real E aprofundou (consequência,
  há quanto tempo, o que muda se não resolver). Perguntar "qual seu objetivo?" e
  seguir para a apresentação NÃO conta como sondagem.
8 apresentacao_treinamento — apresentou APÓS entender o cliente e conectou a solução
  à necessidade citada por ele (Regra de Ouro). Falha: discurso genérico de catálogo.
9 validacao_interesse — validou a percepção ("faz sentido para o seu momento?"),
  deu espaço para o cliente falar.
10 tratamento_objecoes — ouviu sem interromper, investigou o motivo real, evitou
  desconto imediato, reforçou valor, validou se resolveu. null se não houve objeção.
11 fechamento — retomou a necessidade, pediu a decisão de forma clara, apresentou
  condições. Falha: encerrou sem pedir decisão.
12 proximos_passos — deixou combinado o passo seguinte com data ou ação definida.

ORDEM: o roteiro exige sequência (apresentação, quebra-gelo, sondagem, objetivos,
desafios, apresentação, validação, objeções, fechamento, próximos passos).
Informe ordem_respeitada true/false.

PONTOS CRÍTICOS: marque true para cada um que ocorreu:
apresentou_antes_de_sondar, nao_identificou_profissao, nao_identificou_objetivos,
nao_identificou_desafios, perguntas_superficiais, discurso_generico,
nao_conectou_solucao, nao_trabalhou_objecoes, nao_realizou_fechamento,
sem_proximo_passo.

NÃO CALCULE NOTA NEM SCORE. O cálculo é feito fora, a partir das suas notas.

Responda SÓ com este JSON, sem texto em volta e sem blocos de código:
{"etapas":{"apresentacao":{"nota":<1|0>,"obs":"<frase>"},
"quebra_gelo":{"nota":<1|0>,"obs":""},"motivo_contato":{"nota":<1|0>,"obs":""},
"conhecimento_previo":{"nota":<1|0>,"obs":""},"perfil_profissional":{"nota":<1|0>,"obs":""},
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


def req_json(url):
    r = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {TOKEN}", "Version": "2021-04-15",
        "Accept": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read())


def erro_de(e):
    if isinstance(e, urllib.error.HTTPError):
        try:
            return f"HTTP {e.code} {e.read().decode('utf-8','replace')[:160]}"
        except Exception:
            return f"HTTP {e.code}"
    return f"{type(e).__name__}: {e}"[:160]


def buscar_ligacoes(dias):
    """Chamadas concluídas e longas o bastante, nos últimos N dias."""
    corte = (datetime.datetime.now(datetime.timezone.utc)
             - datetime.timedelta(days=dias)).timestamp() * 1000
    achadas = []
    for uid, nome in USUARIOS.items():
        try:
            r = req_json(f"{API}/conversations/search?locationId={LOCATION_ID}"
                         f"&assignedTo={uid}&limit=50&sortBy=last_message_date"
                         f"&sort=desc&status=all")
        except Exception as e:
            print(f"  ! {nome}: {erro_de(e)}")
            continue
        for c in r.get("conversations", []):
            if (c.get("lastMessageDate") or 0) < corte:
                continue
            try:
                m = req_json(f"{API}/conversations/{c['id']}/messages?limit=100&type=TYPE_CALL")
                msgs = m.get("messages", {}).get("messages", [])
            except Exception:
                continue
            for msg in msgs:
                call = (msg.get("meta") or {}).get("call") or {}
                dur = call.get("duration") or 0
                if call.get("status") == "completed" and dur >= MIN_DURACAO:
                    achadas.append({
                        "message_id": msg["id"], "conversation_id": c["id"],
                        "contact_id": msg.get("contactId"),
                        "contato": c.get("contactName"),
                        "user_id": msg.get("userId"),
                        "consultora": USUARIOS.get(msg.get("userId"), "não identificada"),
                        "duracao": dur, "data": msg.get("dateAdded"),
                    })
    # sem duplicata
    vistos, saida = set(), []
    for x in achadas:
        if x["message_id"] not in vistos:
            vistos.add(x["message_id"]); saida.append(x)
    return saida


def transcricao(message_id):
    """Transcrição pronta do CRM. Canal único: não separa quem fala."""
    d = req_json(f"{API}/conversations/locations/{LOCATION_ID}"
                 f"/messages/{message_id}/transcription")
    partes = [f'[{x.get("startTime",0):.0f}s] {x.get("transcript","").strip()}'
              for x in d if x.get("transcript")]
    return "\n".join(partes)


def auditar(texto, lig):
    payload = {
        "model": MODELO,
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content":
                f"consultor: {lig['consultora']}\ncliente: {lig['contato']}\n"
                f"duração: {lig['duracao']}s\n\nTRANSCRIÇÃO:\n{texto}"}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    r = urllib.request.Request("https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {OPENAI_KEY}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp:
        return json.loads(json.loads(resp.read())["choices"][0]["message"]["content"])


def calcular_score(etapas):
    """Soma ponderada / pesos aplicáveis. Etapa null sai do divisor.
    Calculado aqui, nunca pela IA."""
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


def main(dias):
    print(f"Buscando ligações concluídas de {MIN_DURACAO}s+ nos últimos {dias} dias...")
    ligacoes = buscar_ligacoes(dias)
    print(f"{len(ligacoes)} ligações auditáveis\n")

    linhas = []
    for lig in ligacoes:
        try:
            texto = transcricao(lig["message_id"])
        except Exception as e:
            print(f"{lig['contato']}: sem transcrição — {erro_de(e)}")
            continue
        if len(texto) < 200:
            print(f"{lig['contato']}: transcrição curta demais, pulada")
            continue
        try:
            a = auditar(texto, lig)
        except Exception as e:
            print(f"{lig['contato']}: auditoria falhou — {erro_de(e)}")
            continue

        etapas = a.get("etapas", {})
        score, faixa = calcular_score(etapas)
        criticos = [k for k in CRITICOS if (a.get("criticos") or {}).get(k)]

        linha = {
            "message_id": lig["message_id"],
            "data": lig["data"],
            "consultora": lig["consultora"],
            "contato": lig["contato"],
            "duracao_seg": lig["duracao"],
            "score": score,
            "faixa": faixa,
            "ligacao_completa": "nao" if criticos else "sim",
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
        linhas.append(linha)

        print(f"{lig['consultora']:16s} · {lig['contato'][:22]:22s} · {lig['duracao']:3d}s · "
              f"score {score} ({faixa}) · {'COMPLETA' if not criticos else str(len(criticos))+' críticos'}")
        time.sleep(0.5)

    if not linhas:
        print("\nNenhuma ligação auditada.")
        return
    with open("auditorias_ligacoes.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        w.writeheader(); w.writerows(linhas)
    media = sum(l["score"] for l in linhas if l["score"]) / len(linhas)
    completas = sum(1 for l in linhas if l["ligacao_completa"] == "sim")
    print(f"\n{len(linhas)} auditadas · score médio {media:.0f} · "
          f"{completas} completas -> auditorias_ligacoes.csv")

    if db and db.disponivel():
        n, erro = db.gravar(linhas, "ligacao")
        print("Supabase: " + (f"{n} auditorias gravadas" if not erro else f"FALHOU — {erro}"))
    else:
        print("Supabase: não configurado — resultado só no CSV")


if __name__ == "__main__":
    faltando = [n for n, v in (("BLACK_CRM_TOKEN", TOKEN),
                               ("OPENAI_API_KEY", OPENAI_KEY)) if not v]
    if faltando:
        sys.exit("Faltou no .env: " + ", ".join(faltando))
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
