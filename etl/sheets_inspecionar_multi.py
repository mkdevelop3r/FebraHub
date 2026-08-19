"""
FebraHub · sheets_inspecionar_multi.py
Inspeciona VÁRIAS planilhas: lista as abas e mostra as primeiras linhas.
Não grava nada — serve para desenhar as tabelas com base no dado real.

ANTES DE RODAR: cada planilha precisa estar compartilhada com o e-mail
da conta de serviço (campo client_email do JSON), senão dá erro 403.
"""
import os, json

for _p in ('.env', 'etl/.env', os.path.join(os.path.dirname(__file__), '.env')):
    if os.path.exists(_p):
        for _l in open(_p, encoding='utf-8'):
            _l = _l.strip()
            if _l and not _l.startswith('#') and '=' in _l:
                _k, _v = _l.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
        break

from google.oauth2 import service_account
from googleapiclient.discovery import build

PLANILHAS = {
    'FATURAMENTO LOJA 2022+': '1d5CRf_SMsFFvqWzxXzWlY9ZunV4Z17S5QO5Rt781gqU',
}

def credencial():
    escopo = ['https://www.googleapis.com/auth/spreadsheets.readonly']
    if os.environ.get('GOOGLE_SERVICE_ACCOUNT'):
        return service_account.Credentials.from_service_account_info(
            json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT']), scopes=escopo)
    return service_account.Credentials.from_service_account_file(
        os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE', 'service_account.json'),
        scopes=escopo)

def main():
    svc = build('sheets', 'v4', credentials=credencial()).spreadsheets()
    for apelido, pid in PLANILHAS.items():
        print(f"\n{'#'*70}\n### {apelido}\n### id: {pid}")
        try:
            meta = svc.get(spreadsheetId=pid).execute()
        except Exception as e:
            msg = str(e)
            if '403' in msg:
                print("  ERRO 403 — planilha NÃO compartilhada com a conta de serviço")
            elif '404' in msg:
                print("  ERRO 404 — id inválido ou planilha não existe")
            else:
                print(f"  ERRO: {msg[:200]}")
            continue

        print(f"  título: {meta.get('properties',{}).get('title')}")
        abas = [s['properties']['title'] for s in meta.get('sheets', [])]
        print(f"  abas ({len(abas)}): {abas}")

        for aba in abas[:8]:      # até 8 abas por planilha
            print(f"\n  --- aba: {aba!r} ---")
            try:
                r = svc.values().get(spreadsheetId=pid,
                                     range=f"'{aba}'!A1:AZ10").execute()
                linhas = r.get('values', [])
                if not linhas:
                    print("    (vazia)")
                    continue
                for i, linha in enumerate(linhas[:10]):
                    marca = '>' if i == 0 else ' '
                    print(f"    {marca}[{i}] " +
                          ' | '.join(str(c)[:20] for c in linha[:12]))
            except Exception as e:
                print(f"    ERRO: {str(e)[:160]}")

if __name__ == '__main__':
    main()