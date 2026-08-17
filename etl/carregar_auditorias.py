# -*- coding: utf-8 -*-
"""
Sobe auditorias já geradas (CSV) para a fato_auditoria no Supabase.

Serve para carregar o histórico que existe em CSV antes da rotina diária assumir.
Upsert por auditoria_id: rodar duas vezes não duplica.

Uso:
    python carregar_auditorias.py                          # os dois CSVs padrão
    python carregar_auditorias.py auditorias_whatsapp.csv  # um arquivo específico
"""
import csv, os, sys

try:
    import db
except ImportError:
    sys.exit("db.py precisa estar na mesma pasta.")


def carregar_env(caminho=".env"):
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            for linha in f:
                linha = linha.strip()
                if not linha or linha.startswith("#") or "=" not in linha:
                    continue
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


carregar_env()
# o db.py lê as variáveis na importação; recarrega depois do .env
db.SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
db.SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

PADRAO = [("auditorias_whatsapp.csv", "whatsapp"),
          ("auditorias_ligacoes.csv", "ligacao")]


def canal_de(nome):
    return "ligacao" if "ligac" in nome.lower() else "whatsapp"


def main(arquivos):
    if not db.disponivel():
        sys.exit("Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no .env")

    total = 0
    for caminho, canal in arquivos:
        if not os.path.exists(caminho):
            print(f"{caminho}: não encontrado, pulando")
            continue
        with open(caminho, encoding="utf-8-sig") as f:
            linhas = list(csv.DictReader(f))
        if not linhas:
            print(f"{caminho}: vazio")
            continue

        # o CSV traz números como texto; o banco espera inteiro
        for l in linhas:
            for campo in ("score", "msgs_humanas", "audios_usados", "duracao_seg"):
                if l.get(campo) not in (None, ""):
                    try:
                        l[campo] = int(float(l[campo]))
                    except ValueError:
                        l[campo] = None
            for campo in ("ordem_respeitada",):
                v = str(l.get(campo, "")).strip().lower()
                l[campo] = True if v in ("true", "sim", "1") else (
                           False if v in ("false", "nao", "não", "0") else None)

        n, erro = db.gravar(linhas, canal)
        if erro:
            print(f"{caminho}: FALHOU — {erro}")
        else:
            print(f"{caminho}: {n} auditorias gravadas ({canal})")
            total += n

    print(f"\ntotal: {total}")


if __name__ == "__main__":
    args = sys.argv[1:]
    main([(a, canal_de(a)) for a in args] if args else PADRAO)
