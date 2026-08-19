"""
FebraHub · sheets_inspecionar.py
Só LÊ e MOSTRA a estrutura das abas da planilha da loja.
Não grava nada — serve para desenhar as tabelas com base no dado real.

Variáveis de ambiente (ou .env na mesma pasta):
  GOOGLE_SERVICE_ACCOUNT   conteúdo do JSON da conta de serviço
  (alternativa: GOOGLE_SERVICE_ACCOUNT_FILE com o caminho do arquivo)

Uso:
  pip install google-auth google-api-python-client
  python sheets_inspecionar.py
"""
import os, json

# .env opcional
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

PLANILHA = '10lm_7AQQbrjWlUH65sWr2WcfJ312Rlnv3YGSBgTAOm0'
ABAS = [
    'INDICADORES CURSOS PREMIUM LOJA',
    'F.CURSOS PREMIUM DNTRO DAS TURMAS ',   # atenção: espaço no final
]

def credencial():
    if os.environ.get('GOOGLE_SERVICE_ACCOUNT'):
        info = json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT'])
        return service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    caminho = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE', 'service_account.json')
    return service_account.Credentials.from_service_account_file(
        caminho, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])

def main():
    svc = build('sheets', 'v4', credentials=credencial()).spreadsheets()

    # lista todas as abas existentes (para conferir os nomes exatos)
    meta = svc.get(spreadsheetId=PLANILHA).execute()
    print("=== ABAS NA PLANILHA ===")
    for s in meta.get('sheets', []):
        p = s['properties']
        print(f"  {p['title']!r}  ({p['gridProperties'].get('rowCount')} linhas x "
              f"{p['gridProperties'].get('columnCount')} colunas)")

    for aba in ABAS:
        print(f"\n{'='*60}\n=== {aba} ===")
        try:
            r = svc.values().get(spreadsheetId=PLANILHA,
                                 range=f"'{aba}'!A1:AZ12").execute()
            linhas = r.get('values', [])
            if not linhas:
                print("  (vazia)")
                continue
            for i, linha in enumerate(linhas[:12]):
                marca = '>' if i == 0 else ' '
                cels = ' | '.join(str(c)[:22] for c in linha[:14])
                print(f"  {marca}[{i}] {cels}")
        except Exception as e:
            print(f"  ERRO: {e}")

if __name__ == '__main__':
    main()