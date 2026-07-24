"""
FebraHub · sheets_fechamento_sync.py
Lê o fechamento oficial da loja: meta e faturamento por mês, desde 2022.

Planilha "FECHAMENTO MES/ META", abas META BATIDA 2022-2023-2024 / 2025 / 2026.

Padrão de cada bloco:
    col 0-1                 col 3-4
    META SETEMBRO 2022:     FATURAMENTO LOJA
    MINIMA   30.000         DESCRIÇÃO   VALOR
    BASICA   35.000         LOJA        32.073,10
    MASTER   50.000         PDA : 6      5.382,00
                                        37.455,10  <- total (descrição vazia)

O faturamento do mês é a soma das linhas COM descrição.

Variáveis de ambiente (ou .env):
  GOOGLE_SERVICE_ACCOUNT ou GOOGLE_SERVICE_ACCOUNT_FILE
  SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import os, json, re, urllib.request
from datetime import datetime, timezone

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

PLANILHA = '1d5CRf_SMsFFvqWzxXzWlY9ZunV4Z17S5QO5Rt781gqU'
ABAS = ['META BATIDA 2022-2023-2024', 'META BATIDA 2025', 'META BATIDA 2026']
SB_URL = os.environ['SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_KEY']

MESES = {'JANEIRO':1,'FEVEREIRO':2,'MARCO':3,'MARÇO':3,'ABRIL':4,'MAIO':5,'JUNHO':6,
         'JULHO':7,'AGOSTO':8,'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12}

def credencial():
    escopo = ['https://www.googleapis.com/auth/spreadsheets.readonly']
    if os.environ.get('GOOGLE_SERVICE_ACCOUNT'):
        return service_account.Credentials.from_service_account_info(
            json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT']), scopes=escopo)
    caminho = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE', 'service_account.json')
    if not os.path.exists(caminho):
        raise SystemExit("Credencial do Google não encontrada. "
                         "Cadastre o secret GOOGLE_SERVICE_ACCOUNT ou "
                         f"deixe {caminho} na pasta.")
    return service_account.Credentials.from_service_account_file(caminho, scopes=escopo)

def val(s):
    """'30.000' -> 30000 ; 'R$ 32.073,10' -> 32073.10"""
    s = str(s or '').replace('R$', '').replace('\xa0', ' ').strip()
    if not s or s in ('-', '?', '#REF!', '#DIV/0!'): return None
    if ',' in s:                    # vírgula = decimal, ponto = milhar
        s = s.replace('.', '').replace(',', '.')
    else:                           # só ponto = milhar
        s = s.replace('.', '')
    s = re.sub(r'[^0-9.\-]', '', s)
    try:
        v = float(s)
        return round(v, 2) if v != 0 else None
    except: return None

def cel(linhas, i, j):
    if i >= len(linhas): return ''
    l = linhas[i]
    return str(l[j]).strip() if j < len(l) and l[j] is not None else ''

def upsert(linhas):
    if not linhas: return
    url = f"{SB_URL}/rest/v1/fato_loja_fechamento?on_conflict=mes_ref"
    req = urllib.request.Request(url, data=json.dumps(linhas, default=str).encode(),
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  ERRO: {e.code} {e.read().decode(errors='replace')[:300]}")
        raise

def processar(svc, aba):
    r = svc.values().get(spreadsheetId=PLANILHA, range=f"'{aba}'!A1:L400").execute()
    linhas = r.get('values', [])
    achados = []
    for i, linha in enumerate(linhas):
        t = cel(linhas, i, 0).upper()
        if not t.startswith('META '): continue
        m = re.search(r'META\s+([A-ZÇ]+)\s*(\d{4})?', t)
        if not m: continue
        mes = MESES.get(m.group(1))
        if not mes: continue
        ano = int(m.group(2)) if m.group(2) else int(re.search(r'(\d{4})', aba).group(1))

        # níveis (col 0 = rótulo, col 1 = valor)
        niveis = {}
        for k in range(1, 5):
            rot = cel(linhas, i+k, 0).upper()
            v = val(cel(linhas, i+k, 1))
            if 'MINIM' in rot or 'MÍNIM' in rot: niveis['minima'] = v
            elif 'BASIC' in rot or 'BÁSIC' in rot: niveis['basica'] = v
            elif 'MASTER' in rot or 'MÁSTER' in rot: niveis['master'] = v

        # faturamento (col 3 = descrição, col 4 = valor)
        # a linha do cabeçalho é DESCRIÇÃO|VALOR; somar as linhas COM descrição
        # O bloco tem linhas "DESCRIÇÃO | VALOR" e, ao final, uma linha com
        # descrição VAZIA e valor preenchido: é o VALOR FECHADO do mês.
        # Usar o valor fechado quando existir — somar as linhas dá errado
        # porque algumas descrições se repetem (correções, divisão por vendedor).
        detalhe, soma, fechado = {}, 0.0, None
        k = i
        while k < i + 5 and 'DESCRI' not in cel(linhas, k, 3).upper():
            k += 1
        if 'DESCRI' in cel(linhas, k, 3).upper():
            j, vazias, limite = k + 1, 0, k + 9   # janela curta: só o bloco do mês
            while j < len(linhas) and j <= limite and vazias < 3:
                # para ao encontrar o próximo bloco de meta
                if cel(linhas, j, 0).upper().startswith('META '): break
                desc = cel(linhas, j, 3)
                v = val(cel(linhas, j, 4))
                if not desc and v is None:
                    vazias += 1          # atravessa linhas em branco
                    j += 1
                    continue
                vazias = 0
                if desc.upper().startswith('META'): break
                if desc and v is not None:
                    # a mesma descrição pode aparecer várias vezes e TODAS somam
                    # (ex.: LOJA 117.201,77 + LOJA 102.371,37 = 219.573,14)
                    chave = desc if desc not in detalhe else f"{desc} ({len(detalhe)})"
                    detalhe[chave] = v
                    soma += v
                elif not desc and v is not None and fechado is None:
                    fechado = v          # linha de total = valor fechado do mês
                j += 1
        total = fechado if fechado is not None else soma

        achados.append({
            'mes_ref': f"{ano}-{mes:02d}-01",
            'ano': ano,
            'mes_nome': m.group(1),
            'faturamento': round(total, 2) if total else None,
            'meta_minima': niveis.get('minima'),
            'meta_basica': niveis.get('basica'),
            'meta_master': niveis.get('master'),
            'detalhe': detalhe or None,
        })
    print(f"  {aba}: {len(achados)} meses")
    return achados

def main():
    svc = build('sheets', 'v4', credentials=credencial()).spreadsheets()
    todos = []
    for aba in ABAS:
        try:
            todos += processar(svc, aba)
        except Exception as e:
            print(f"  {aba}: ERRO {str(e)[:160]}")

    # dedup por mês (mantém a última ocorrência)
    d = {}
    for r in todos: d[r['mes_ref']] = r
    # descarta meses sem faturamento nem meta (blocos futuros em branco)
    todos = [r for r in sorted(d.values(), key=lambda x: x['mes_ref'])
             if r['faturamento'] or r['meta_minima']]

    for i in range(0, len(todos), 200):
        upsert(todos[i:i+200])

    print(f"\ntotal: {len(todos)} meses")
    for r in todos:
        f = f"R$ {r['faturamento']:,.2f}" if r['faturamento'] else '—'
        mm = f"min {r['meta_minima']:,.0f}" if r['meta_minima'] else 'sem meta'
        print(f"  {r['mes_ref'][:7]}  {f:>16}   {mm}")

if __name__ == '__main__':
    main()