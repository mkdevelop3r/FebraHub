# -*- coding: utf-8 -*-
"""
Rotina diária da auditoria comercial — Febracis Bahia.

Ordem obrigatória:
    1. transcrever_audios.py   (áudio do WhatsApp -> texto)
    2. auditar_conversas.py    (WhatsApp, modelo B)
    3. auditar_ligacoes.py     (ligações, modelo A)

Regras:
  - a auditoria de WhatsApp NÃO roda se a transcrição falhar: auditar sem o
    áudio produz score injusto (etapas inteiras ficam invisíveis).
  - falha alto: sai com código diferente de zero para o Actions marcar em vermelho.
    Silêncio é pior que erro — hub desatualizado ninguém percebe.

Uso:
    python run_auditoria.py
"""
import subprocess, sys, os, datetime

PASTA = os.path.dirname(os.path.abspath(__file__))

ETAPAS = [
    ("Transcrição de áudio", "transcrever_audios.py", [], True),
    ("Auditoria WhatsApp",   "auditar_conversas.py",  [], False),
    ("Auditoria ligações",   "auditar_ligacoes.py",   [], False),
]


def rodar(nome, script, args, bloqueia):
    print(f"\n{'='*60}\n{nome}\n{'='*60}", flush=True)
    r = subprocess.run([sys.executable, os.path.join(PASTA, script)] + args,
                       cwd=PASTA)          # roda de dentro da pasta: acha .env e CSVs
    if r.returncode != 0:
        print(f"!! {nome} falhou (código {r.returncode})", flush=True)
        if bloqueia:
            print("!! etapa obrigatória — interrompendo a rotina", flush=True)
        return False
    return True


def main():
    inicio = datetime.datetime.now()
    print(f"Rotina de auditoria · {inicio:%d/%m/%Y %H:%M}")

    falhas = []
    for nome, script, args, bloqueia in ETAPAS:
        if not rodar(nome, script, args, bloqueia):
            falhas.append(nome)
            if bloqueia:
                break

    dur = (datetime.datetime.now() - inicio).seconds
    print(f"\n{'='*60}")
    if falhas:
        print(f"Rotina terminou com falha em: {', '.join(falhas)} ({dur}s)")
        sys.exit(1)
    print(f"Rotina concluída sem erros ({dur}s)")


if __name__ == "__main__":
    main()
