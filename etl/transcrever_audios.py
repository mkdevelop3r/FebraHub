# -*- coding: utf-8 -*-
"""
Transcreve os áudios das conversas do Black CRM.
Roda ANTES da auditoria por IA — conversa com áudio pendente não é auditada.

Uso:
    python transcrever_audios.py <conversation_id> [<conversation_id> ...]

Precisa de um .env na mesma pasta:
    BLACK_CRM_TOKEN=...
    OPENAI_API_KEY=...
"""
import os, sys, json, time, csv, datetime, urllib.request, urllib.error

# ---------- console do Windows aceita acento ----------
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ---------- carrega .env ----------
# utf-8-sig: o Bloco de Notas do Windows salva com BOM, e o BOM gruda no nome da
# primeira variável ("\ufeffBLACKCRM_TOKEN"), fazendo ela nunca ser encontrada.
def carregar_env(caminho=".env"):
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            for linha in f:
                linha = linha.strip()
                if not linha or linha.startswith("#") or "=" not in linha:
                    continue
                if linha.lower().startswith("export "):
                    linha = linha[7:]
                chave, valor = linha.split("=", 1)
                os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


carregar_env()

BLACKCRM_TOKEN = os.environ.get("BLACK_CRM_TOKEN")
OPENAI_KEY     = os.environ.get("OPENAI_API_KEY")
API_BASE       = "https://services.leadconnectorhq.com"
LOCATION_ID    = "JedXhdJDbwOl6lvHCCfj"

# só as consultoras de GGB (escopo atual da auditoria)
GGB = {
    "1DJ3xRIzLr9yrOnKn3wE": "Alana Faleiro",
    "FZTwnSHPc3omb8Dib0eE": "Beatriz Novaes",
    "al2UgFV31HyBTWnlbPz7": "Beatriz Souza",
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")

AUDIO_EXT = (".ogg", ".mp3", ".m4a", ".wav", ".opus", ".oga")


def crm(path):
    req = urllib.request.Request(API_BASE + path, headers={
        "Authorization": f"Bearer {BLACKCRM_TOKEN}",
        "Version": "2021-04-15",
        "Accept": "application/json",
        "User-Agent": UA,
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def eh_audio(m):
    """Devolve a URL do áudio, ou None. Só formatos de áudio conhecidos —
    anexo de outro tipo (imagem, documento, figurinha) fica de fora."""
    for a in (m.get("attachments") or []):
        if any(a.lower().split("?")[0].endswith(x) for x in AUDIO_EXT):
            return a
    return None


def transcrever(url):
    """Baixa o áudio e envia para a API de transcrição. Devolve o texto."""
    req_audio = urllib.request.Request(url, headers={"User-Agent": UA})
    audio = urllib.request.urlopen(req_audio, timeout=120).read()
    if not audio:
        raise ValueError("arquivo de áudio vazio")

    bound = "----febrahub"
    corpo = b""

    def campo(nome, val):
        return (f"--{bound}\r\n"
                f'Content-Disposition: form-data; name="{nome}"\r\n\r\n{val}\r\n').encode()

    corpo += campo("model", "whisper-1")
    corpo += campo("language", "pt")   # português explícito: melhora bastante
    # vocabulário: sem isso o Whisper escreve "Febre Assis", "Fibrasis", "Fedrancis"
    corpo += campo("prompt", "Febracis, Método CIS, Paulo Vieira, Camila Vieira, GGB, "
                             "Coaching Integral Sistêmico, Salvador, Bahia")
    corpo += (f"--{bound}\r\n"
              f'Content-Disposition: form-data; name="file"; filename="audio.ogg"\r\n'
              f"Content-Type: application/octet-stream\r\n\r\n").encode() + audio + b"\r\n"
    corpo += f"--{bound}--\r\n".encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions", data=corpo,
        headers={"Authorization": f"Bearer {OPENAI_KEY}",
                 "Content-Type": f"multipart/form-data; boundary={bound}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["text"].strip()


def detalhe_erro(e):
    """Mensagem útil em vez de apenas 'HTTP Error 401'."""
    if isinstance(e, urllib.error.HTTPError):
        try:
            corpo = e.read().decode("utf-8", "replace")[:200]
        except Exception:
            corpo = ""
        return f"HTTP {e.code} {corpo}"
    return f"{type(e).__name__}: {e}"[:200]


def conversas_recentes(dias=7, limite=40):
    """Conversas das consultoras de GGB com mensagem nos últimos N dias."""
    corte = (datetime.datetime.now(datetime.timezone.utc)
             - datetime.timedelta(days=dias)).timestamp() * 1000
    achadas = []
    for uid, nome in GGB.items():
        try:
            r = crm(f"/conversations/search?locationId={LOCATION_ID}"
                    f"&assignedTo={uid}&limit={limite}"
                    f"&sortBy=last_message_date&sort=desc&status=all")
        except Exception as e:
            print(f"  ! {nome}: {detalhe_erro(e)}")
            continue
        novas = [c["id"] for c in r.get("conversations", [])
                 if (c.get("lastMessageDate") or 0) >= corte]
        achadas += novas
        print(f"  {nome}: {len(novas)} conversas recentes")
    return list(dict.fromkeys(achadas))


def main(conversation_ids, ja_transcritos=frozenset()):
    linhas = []
    for cid in conversation_ids:
        print(f"\nconversa {cid}")
        try:
            resp = crm(f"/conversations/{cid}/messages?limit=100")
            msgs = resp.get("messages", {}).get("messages", [])
        except Exception as e:
            print(f"  ! não consegui ler: {detalhe_erro(e)}")
            continue

        audios = [m for m in msgs if eh_audio(m)]
        print(f"  {len(msgs)} mensagens, {len(audios)} com áudio")

        for m in audios:
            mid = m.get("id")
            if mid in ja_transcritos:
                continue
            url = eh_audio(m)
            texto, erro = None, None
            try:
                texto = transcrever(url)
            except Exception as e:
                erro = detalhe_erro(e)
            quem = GGB.get(m.get("userId"), "lead" if m.get("direction") == "inbound" else "?")
            linhas.append({
                "message_id": mid,
                "conversation_id": cid,
                "contact_id": m.get("contactId"),
                "user_id": m.get("userId") or None,
                "autor": quem,
                "direction": m.get("direction"),
                "data": m.get("dateAdded"),
                "audio_url": url,
                "transcricao": texto,
                "transcrito_em": datetime.datetime.now(datetime.timezone.utc).isoformat() if texto else None,
                "erro": erro,
            })
            marca = "ok  " if texto else "ERRO"
            print(f"  {marca} [{quem}] {(texto or erro or '')[:70]}")
            time.sleep(0.4)   # respeita rate limit
    return linhas


if __name__ == "__main__":
    faltando = [n for n, v in (("BLACK_CRM_TOKEN", BLACKCRM_TOKEN),
                               ("OPENAI_API_KEY", OPENAI_KEY)) if not v]
    if faltando:
        print("Faltou definir: " + ", ".join(faltando))
        print("Coloque no .env, nesta pasta, uma linha por variável:")
        print("  BLACK_CRM_TOKEN=...")
        print("  OPENAI_API_KEY=...")
        print("Se o .env existe e mesmo assim aparece esta mensagem, salve-o como UTF-8.")
        sys.exit(1)

    ids = sys.argv[1:]
    if not ids:
        print("Sem IDs — buscando conversas dos últimos 7 dias das consultoras de GGB...")
        ids = conversas_recentes(dias=7)
        if not ids:
            sys.exit("Nenhuma conversa recente encontrada.")
        print(f"{len(ids)} conversas encontradas.")

    linhas = main(ids)

    if not linhas:
        print("\nNenhum áudio encontrado nessas conversas — nada a transcrever.")
        sys.exit(0)

    with open("transcricoes.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        w.writeheader()
        w.writerows(linhas)

    ok = sum(1 for l in linhas if l["transcricao"])
    print(f"\n{ok} de {len(linhas)} áudios transcritos -> transcricoes.csv")
    if ok < len(linhas):
        print("Os que falharam ficaram no CSV com o motivo na coluna 'erro'.")
