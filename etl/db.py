# -*- coding: utf-8 -*-
"""
Gravação das auditorias direto no Supabase (tabela fato_auditoria).

Usado por auditar_conversas.py (WhatsApp) e auditar_ligacoes.py (ligação).
Upsert por auditoria_id: rodar duas vezes no mesmo dia não duplica, atualiza.

Precisa no .env:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=...      (chave de serviço — ignora RLS, nunca versionar)
"""
import os, json, datetime, urllib.request, urllib.error

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

ETAPAS = ["apresentacao", "quebra_gelo", "conhecimento_previo", "motivo_contato",
          "perfil_profissional", "objetivos_futuro", "desafios_dores",
          "apresentacao_treinamento", "validacao_interesse", "tratamento_objecoes",
          "fechamento", "proximos_passos"]


def disponivel():
    return bool(SUPABASE_URL and SUPABASE_KEY)


def para_fato(linha, canal):
    """Converte a linha do CSV no formato da tabela fato_auditoria."""
    completo = linha.get("atendimento_completo") or linha.get("ligacao_completa")
    criticos = linha.get("pontos_criticos") or ""
    data = (linha.get("data") or "")[:10] or datetime.date.today().isoformat()

    reg = {
        "auditoria_id": linha.get("conversation_id") or linha.get("message_id"),
        "canal": canal,
        "data_ref": data,
        "user_id": linha.get("user_id"),
        "consultora": linha.get("consultora"),
        "contato": linha.get("contato"),
        "msgs_humanas": linha.get("msgs_humanas"),
        "audios_usados": linha.get("audios_usados"),
        "duracao_seg": linha.get("duracao_seg"),
        "score": linha.get("score"),
        "faixa": linha.get("faixa"),
        "completo": (completo == "sim"),
        # escala contínua substitui a bandeira binária (decisão Carmen, ago/2026)
        "etapas_cumpridas": sum(1 for e in ETAPAS if str(linha.get(e)) == "1"),
        "etapas_avaliadas": sum(1 for e in ETAPAS if linha.get(e) not in ("", None)),
        "pontos_criticos": [c.strip() for c in criticos.split("|") if c.strip()],
        "ordem_respeitada": linha.get("ordem_respeitada"),
        "temperatura_lead": linha.get("temperatura_lead"),
        "falhas": linha.get("falhas"),
        "conclusao": linha.get("conclusao"),
        "auditado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    for e in ETAPAS:
        v = linha.get(e)
        reg[e] = None if v in ("", None) else int(v)
    return reg


def _post(tabela, registros, on_conflict):
    """Upsert em lote numa tabela. Devolve erro ou None."""
    if not registros:
        return None
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{tabela}?on_conflict={on_conflict}",
        data=json.dumps(registros).encode("utf-8"), method="POST",
        headers={"apikey": SUPABASE_KEY,
                 "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return None if r.status in (200, 201, 204) else f"HTTP {r.status}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code} {e.read().decode('utf-8','replace')[:300]}"
    except Exception as e:
        return f"{type(e).__name__}: {e}"[:200]


def gravar_prova(linhas, canal):
    """Grava a transcrição e a justificativa por etapa — a prova para quando
    a consultora contestar a nota. Só o banco recebe: é dado pessoal."""
    transcricoes, etapas = [], []
    for l in linhas:
        aid = l.get("conversation_id") or l.get("message_id")
        texto = l.get("_transcricao")
        if texto:
            transcricoes.append({
                "auditoria_id": aid, "canal": canal, "texto": texto,
                "audios": texto.count("[ÁUDIO TRANSCRITO]"),
                "caracteres": len(texto),
            })
        for etapa, dados in (l.get("_etapas") or {}).items():
            if not isinstance(dados, dict):
                continue
            etapas.append({
                "auditoria_id": aid, "etapa": etapa,
                "nota": dados.get("nota"),
                "observacao": (dados.get("obs") or "")[:1000],
                "trecho": (dados.get("trecho") or "")[:500],
            })
    erro = _post("fato_auditoria_transcricao", transcricoes, "auditoria_id")
    if erro:
        return f"transcrição: {erro}"
    return _post("fato_auditoria_etapa", etapas, "auditoria_id,etapa")


def gravar(linhas, canal):
    """Upsert em lote. Devolve (gravadas, erro_ou_None)."""
    if not disponivel():
        return 0, "SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes no .env"
    if not linhas:
        return 0, None

    corpo = json.dumps([para_fato(l, canal) for l in linhas]).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/fato_auditoria?on_conflict=auditoria_id",
        data=corpo, method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            # merge-duplicates = upsert; sem isso o segundo run falha na PK
            "Prefer": "resolution=merge-duplicates,return=minimal",
        })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            if r.status in (200, 201, 204):
                # a prova vai depois: a FK exige o registro pai gravado
                erro_prova = gravar_prova(linhas, canal)
                return len(linhas), (f"auditorias ok, prova falhou — {erro_prova}"
                                     if erro_prova else None)
            return 0, f"HTTP {r.status}"
    except urllib.error.HTTPError as e:
        return 0, f"HTTP {e.code} {e.read().decode('utf-8','replace')[:300]}"
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"[:200]
