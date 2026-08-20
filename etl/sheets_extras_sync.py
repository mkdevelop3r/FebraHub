"""
FebraHub · sheets_extras_sync.py
Carrega as receitas extras da loja que vêm de planilhas:
  - CURSOS PREMIUM LOJA  (abas "C." — as oficiais, com observação comercial)
  - SENTIDO DE BRINCAR   (produto avulso)

Grava em fato_loja_receita_extra, que a vw_loja_receita_consolidada
soma ao PDV (Omie) e ao livrão (Salesforce).

Variáveis de ambiente (ou .env):
  GOOGLE_SERVICE_ACCOUNT ou GOOGLE_SERVICE_ACCOUNT_FILE
  SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import os, json, re, urllib.request, hashlib
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

SB_URL = os.environ['SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_KEY']

PREMIUM_ID = '1Xstg_g7s2J5d5O0pVfyJhT-XBm-QXIr24-LdjZNA4_E'
# abas oficiais = as com "C." (confirmado com a gestora)
PREMIUM_ABAS = {2024: '2024 C.', 2025: '2025 C.', 2026: '2026 C. '}

BRINCAR_ID  = '1o33ziVdVbx-nvdkKyk2zDu6r9InpXpgqew6VqYfa8-g'
BRINCAR_ABA = 'Página1'

# aluguel de salas: uma planilha por ano, uma aba por mês
ALUGUEL = {
    2025: '1imHfJUnk0leOZuvMdzgUQykfj9cRjP_TVEK5qkO1nt0',
    2026: '1k7r9dyTzxVeKLWGu9cj8edpxH-NHBwXajuDKZ54moKU',
}

MESES_ABREV = {'JAN':1,'FEV':2,'MAR':3,'ABR':4,'MAI':5,'JUN':6,
               'JUL':7,'AGO':8,'SET':9,'OUT':10,'NOV':11,'DEZ':12}

def credencial():
    escopo = ['https://www.googleapis.com/auth/spreadsheets.readonly']
    if os.environ.get('GOOGLE_SERVICE_ACCOUNT'):
        return service_account.Credentials.from_service_account_info(
            json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT']), scopes=escopo)
    return service_account.Credentials.from_service_account_file(
        os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE', 'service_account.json'),
        scopes=escopo)

def val(s):
    s = str(s or '').replace('R$', '').replace('\xa0', ' ').strip()
    if not s or s in ('-', '?', '#REF!', '#DIV/0!'): return None
    s = s.replace('.', '').replace(',', '.')
    s = re.sub(r'[^0-9.\-]', '', s)
    try:
        v = float(s)
        return round(v, 2) if v > 0 else None
    except: return None

def txt(s):
    s = str(s or '').strip()
    return None if s in ('', '-', '?') else s

def data_br(s, ano_padrao=None):
    """'14/03' ou '08/05/2026' -> ISO. Sem ano, usa ano_padrao."""
    s = str(s or '').strip()
    m = re.match(r'(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?', s)
    if not m: return None
    d, mes, a = m.group(1), m.group(2), m.group(3)
    if a:
        a = int(a)
        if a < 100: a += 2000
    else:
        a = ano_padrao
    if not a: return None
    try:
        return f"{int(a)}-{int(mes):02d}-{int(d):02d}"
    except: return None

def data_abrev(s, ano):
    """'28/jan.' -> 2025-01-28. O ano vem do nome da aba."""
    s = str(s or '').strip().upper().replace('.', '')
    m = re.match(r'(\d{1,2})\s*[/\-]\s*([A-ZÇ]{3})', s)
    if m:
        mes = MESES_ABREV.get(m.group(2)[:3])
        if mes and ano:
            return f"{ano}-{mes:02d}-{int(m.group(1)):02d}"
    return data_br(s, ano)      # tenta o formato numérico


def chave(*partes):
    return hashlib.md5('|'.join(str(p or '') for p in partes).encode()).hexdigest()[:24]

def cabecalho(linhas):
    """Acha a linha do cabeçalho (a que tem DATA e VALOR) e devolve o índice
    e o mapa nome->coluna."""
    for i, linha in enumerate(linhas[:6]):
        up = [str(c or '').upper().strip() for c in linha]
        if any('DATA' in c for c in up) and any('VALOR' in c for c in up):
            mapa = {}
            for j, c in enumerate(up):
                if not c: continue
                if 'DATA' in c and 'data' not in mapa: mapa['data'] = j
                elif c.startswith('CURSO'): mapa['curso'] = j
                elif 'FORMA' in c: mapa['forma'] = j
                elif 'VALOR' in c: mapa['valor'] = j
                elif c.startswith('NOME'): mapa['nome'] = j
                elif c.startswith('CPF'): mapa['doc'] = j
                elif 'QUANTIDADE' in c: mapa['qtd'] = j
                elif 'EMPRESA' in c: mapa['empresa'] = j
                elif 'TIPO' in c: mapa['tipo'] = j
                elif 'CLIENTE' in c: mapa['nome'] = j
                elif 'STATUS' in c or 'OBSERV' in c: mapa.setdefault('obs', j)
            return i, mapa
    return None, {}

def cel(linha, j):
    return linha[j] if (j is not None and j < len(linha)) else ''

CAMPOS = ['fonte','data_venda','mes_ref','descricao','forma_pagto','valor',
          'quantidade','cliente','documento','observacao','chave_origem']

def normalizar(linhas):
    """PostgREST exige que todos os objetos do lote tenham as MESMAS chaves."""
    return [{c: l.get(c) for c in CAMPOS} for l in linhas]

def upsert(linhas):
    if not linhas: return
    linhas = normalizar(linhas)
    url = f"{SB_URL}/rest/v1/fato_loja_receita_extra?on_conflict=fonte,chave_origem"
    req = urllib.request.Request(url, data=json.dumps(linhas, default=str).encode(),
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  ERRO: {e.code} {e.read().decode(errors='replace')[:300]}")
        print(f"  exemplo: {json.dumps(linhas[0], default=str)[:250]}")
        raise

def premium(svc):
    todos, vistos = [], set()
    for ano, aba in PREMIUM_ABAS.items():
        try:
            r = svc.values().get(spreadsheetId=PREMIUM_ID,
                                 range=f"'{aba}'!A1:N500").execute()
        except Exception as e:
            print(f"  {aba}: ERRO {str(e)[:120]}")
            continue
        linhas = r.get('values', [])
        icab, mapa = cabecalho(linhas)
        if icab is None:
            print(f"  {aba}: cabeçalho não encontrado")
            continue
        n = 0
        for linha in linhas[icab+1:]:
            dt = data_br(cel(linha, mapa.get('data')), ano)
            v  = val(cel(linha, mapa.get('valor')))
            curso = txt(cel(linha, mapa.get('curso')))
            if not dt or not v or not curso: continue
            k = chave(dt, curso, txt(cel(linha, mapa.get('nome'))), v)
            if k in vistos: continue
            vistos.add(k)
            todos.append({
                'fonte': 'curso_premium',
                'data_venda': dt,
                'mes_ref': dt[:7] + '-01',
                'descricao': curso,
                'forma_pagto': txt(cel(linha, mapa.get('forma'))),
                'valor': v,
                'quantidade': 1,
                'cliente': txt(cel(linha, mapa.get('nome'))),
                'documento': txt(cel(linha, mapa.get('doc'))),
                'observacao': txt(cel(linha, mapa.get('obs'))),
                'chave_origem': k,
            })
            n += 1
        print(f"  {aba}: {n} vendas")
    return todos

def brincar(svc):
    try:
        r = svc.values().get(spreadsheetId=BRINCAR_ID,
                             range=f"'{BRINCAR_ABA}'!A1:H500").execute()
    except Exception as e:
        print(f"  Sentido de Brincar: ERRO {str(e)[:120]}")
        return []
    linhas = r.get('values', [])
    icab, mapa = cabecalho(linhas)
    if icab is None:
        print("  Sentido de Brincar: cabeçalho não encontrado")
        return []
    todos, vistos = [], set()
    for idx, linha in enumerate(linhas[icab+1:]):
        dt = data_br(cel(linha, mapa.get('data')))
        v  = val(cel(linha, mapa.get('valor')))
        if not dt or not v: continue
        qtd = val(cel(linha, mapa.get('qtd'))) or 1
        k = chave(dt, v, qtd, idx)
        if k in vistos: continue
        vistos.add(k)
        todos.append({
            'fonte': 'sentido_brincar',
            'data_venda': dt,
            'mes_ref': dt[:7] + '-01',
            'descricao': 'Sentido de Brincar',
            'forma_pagto': txt(cel(linha, mapa.get('forma'))),
            'valor': v,
            'quantidade': qtd,
            'chave_origem': k,
        })
    print(f"  Sentido de Brincar: {len(todos)} vendas")
    return todos

def aluguel(svc):
    todos, vistos = [], set()
    for ano, pid in ALUGUEL.items():
        try:
            meta = svc.get(spreadsheetId=pid).execute()
        except Exception as e:
            print(f"  aluguel {ano}: ERRO {str(e)[:120]}")
            continue
        abas = [x['properties']['title'] for x in meta.get('sheets', [])]
        for aba in abas:
            try:
                r = svc.values().get(spreadsheetId=pid,
                                     range=f"'{aba}'!A1:J300").execute()
            except Exception as e:
                print(f"    {aba}: ERRO {str(e)[:100]}")
                continue
            linhas = r.get('values', [])
            icab, mapa = cabecalho(linhas)
            if icab is None:
                print(f"    {aba}: cabeçalho não encontrado")
                continue
            n = 0
            for linha in linhas[icab+1:]:
                dt = data_abrev(cel(linha, mapa.get('data')), ano)
                v  = val(cel(linha, mapa.get('valor')))
                if not dt or not v: continue
                tipo = txt(cel(linha, mapa.get('tipo'))) or 'Aluguel'
                k = chave(dt, tipo, txt(cel(linha, mapa.get('nome'))), v)
                if k in vistos: continue
                vistos.add(k)
                todos.append({
                    'fonte': 'aluguel_sala',
                    'data_venda': dt,
                    'mes_ref': dt[:7] + '-01',
                    'descricao': f"Aluguel de sala · {tipo}",
                    'forma_pagto': txt(cel(linha, mapa.get('forma'))),
                    'valor': v,
                    'quantidade': 1,
                    'cliente': txt(cel(linha, mapa.get('nome'))),
                    'observacao': txt(cel(linha, mapa.get('empresa'))),
                    'chave_origem': k,
                })
                n += 1
            print(f"    {aba}: {n} aluguéis")
    return todos


def main():
    svc = build('sheets', 'v4', credentials=credencial()).spreadsheets()
    print("=== CURSOS PREMIUM ===")
    linhas = premium(svc)
    print("\n=== SENTIDO DE BRINCAR ===")
    linhas += brincar(svc)
    print("\n=== ALUGUEL DE SALAS ===")
    linhas += aluguel(svc)

    for i in range(0, len(linhas), 200):
        upsert(linhas[i:i+200])
    print(f"\ntotal gravado: {len(linhas)} registros")

    por_fonte = {}
    for l in linhas:
        por_fonte[l['fonte']] = por_fonte.get(l['fonte'], 0) + (l['valor'] or 0)
    for f, v in por_fonte.items():
        print(f"  {f}: R$ {v:,.2f}")

if __name__ == '__main__':
    main()