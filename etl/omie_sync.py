"""
FebraHub · omie_sync.py
Puxa vendas da loja (cupons fiscais) e posição de estoque do Omie.

Variáveis de ambiente:
  OMIE_APP_KEY / OMIE_APP_SECRET                (unidade salvador)
  OMIE_APP_KEY_RECIFE / OMIE_APP_SECRET_RECIFE  (unidade recife)
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

Uso:
  python omie_sync.py                          # Salvador: vendas do último ano + estoque
  python omie_sync.py --desde 01/01/2024       # Salvador: histórico
  python omie_sync.py --unidade recife         # Recife (usa as credenciais _RECIFE)
"""
import os, json, time, argparse, urllib.request
from datetime import date, datetime, timedelta, timezone

# Carrega .env se existir (formato NOME=valor por linha), sem libs externas.
for _p in ('.env', 'etl/.env', os.path.join(os.path.dirname(__file__), '.env')):
    if os.path.exists(_p):
        for _linha in open(_p, encoding='utf-8'):
            _linha = _linha.strip()
            if _linha and not _linha.startswith('#') and '=' in _linha:
                _k, _v = _linha.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
        break


# Cada unidade é uma CONTA Omie separada (par app_key/app_secret próprio). A
# unidade escolhida no --unidade define de quais env vars ler e em QUAIS tabelas
# gravar: Salvador usa as tabelas fato_loja_* originais; as outras usam o mesmo
# nome com sufixo (fato_loja_cupom_recife, ...), pra nunca se misturarem.
CREDENCIAIS = {
    'salvador': ('OMIE_APP_KEY', 'OMIE_APP_SECRET'),
    'recife':   ('OMIE_APP_KEY_RECIFE', 'OMIE_APP_SECRET_RECIFE'),
}
UNIDADE    = 'salvador'   # reatribuído em main() conforme --unidade
APP_KEY    = None         # idem (resolvido a partir de CREDENCIAIS[UNIDADE])
APP_SECRET = None
SB_URL     = os.environ['SUPABASE_URL']
SB_KEY     = os.environ['SUPABASE_SERVICE_KEY']

def tab(nome):
    """Nome da tabela para a unidade atual (Salvador = original; senão sufixada)."""
    return nome if UNIDADE == 'salvador' else f'{nome}_{UNIDADE}'

# URLs dos serviços Omie (RPC: POST com app_key/app_secret/call/param)
URL_CUPOM   = 'https://app.omie.com.br/api/v1/produtos/cupomfiscalconsultar/'
URL_ESTOQUE = 'https://app.omie.com.br/api/v1/estoque/consulta/'

def omie(url, call, param, tentativa=0):
    """Chamada RPC padrão do Omie, com retry para instabilidade (5xx/425)."""
    body = json.dumps({
        'call': call,
        'app_key': APP_KEY,
        'app_secret': APP_SECRET,
        'param': [param],
    }).encode()
    req = urllib.request.Request(url, data=body,
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors='replace')
        if e.code in (425, 502, 503) and tentativa < 6:
            espera = 20 * (tentativa + 1)
            print(f"  Omie {e.code} — aguardando {espera}s")
            time.sleep(espera)
            return omie(url, call, param, tentativa + 1)
        raise RuntimeError(f"Omie {e.code}: {corpo[:500]}")
    except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
        # queda de conexão / socket -> esperar e tentar de novo
        if tentativa < 6:
            espera = 15 * (tentativa + 1)
            print(f"  conexão caiu ({e}) — aguardando {espera}s e tentando de novo")
            time.sleep(espera)
            return omie(url, call, param, tentativa + 1)
        raise


# Códigos de forma de pagamento do Omie (cIndPag)
FORMAS = {
    '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de Crédito',
    '04': 'Cartão de Débito', '05': 'Crédito Loja', '10': 'Vale Alimentação',
    '11': 'Vale Refeição', '12': 'Vale Presente', '13': 'Vale Combustível',
    '15': 'Boleto', '16': 'Depósito', '17': 'PIX', '18': 'Transferência',
    '19': 'Cashback', '90': 'Sem pagamento', '99': 'Outros',
}

def sn(v):  # 'S'/'N' -> bool
    return str(v or '').upper() == 'S'

def num(v):
    try: return float(v)
    except: return 0

def dt_iso(s):
    # Omie usa DD/MM/AAAA
    try:
        d, m, a = s.split('/')
        return f"{a}-{int(m):02d}-{int(d):02d}"
    except:
        return None

def upsert(tabela, linhas, conflito):
    if not linhas: return
    url = f"{SB_URL}/rest/v1/{tabela}?on_conflict={conflito}"
    req = urllib.request.Request(url, data=json.dumps(linhas, default=str).encode(),
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors='replace')
        print(f"  ERRO ao gravar {tabela}: {e.code} {corpo[:400]}")
        print(f"  exemplo de linha: {json.dumps(linhas[0], default=str)[:300]}")
        raise

# ---------------- VENDAS (cupons + itens) ----------------
def sync_vendas(desde, ate):
    pagina = 1
    total_cupom = total_item = 0
    while True:
        resp = omie(URL_CUPOM, 'CuponsFiscais', {
            'nPagina': pagina, 'nRegPorPagina': 100,
            'dDtEmissaoDe': desde, 'dDtEmissaoAte': ate,
        })
        cupons = resp.get('cupons', []) or []
        cab, itens = [], []
        for c in cupons:
            h = c.get('cabecalhoCupom', {})
            info = c.get('cabecalhoCupom', {}).get('info', {}) or {}
            # o cancelamento vem no info dos itens/cupom
            it_list = c.get('itensCupom', []) or []
            cancelado = any(sn(i.get('cCupomCancelado')) for i in it_list) if it_list else False
            devolvido = any(sn(i.get('cCupomDevolvido')) for i in it_list) if it_list else False
            cab.append({
                'cupom_id': h.get('nIdCupom'),
                'numero_cupom': h.get('nNumCupom'),
                'serie': h.get('nSerieCupom'),
                'chave': h.get('cChaveCupom'),
                'data_emissao': dt_iso(h.get('dDtEmissaoCupom')),
                'valor': num(h.get('nValorCupom')),
                'cliente_id': h.get('idCliente'),
                'vendedor_id': h.get('idVendedor'),
                'cancelado': cancelado,
                'devolvido': devolvido,
            })
            for i in it_list:
                itens.append({
                    'cupom_id': h.get('nIdCupom'),
                    'seq_item': i.get('nSequencia') or i.get('seqItem'),
                    'produto_id': i.get('idProduto'),
                    'descricao': i.get('xProd'),
                    'quantidade': num(i.get('nQuant')),
                    'valor_unitario': num(i.get('vUnit')),
                    'valor_item': num(i.get('vItem')),
                    'quantidade_dev': num(i.get('nQuantDev')),
                    'cancelado': sn(i.get('cItemCancelado')),
                })
        upsert(tab('fato_loja_cupom'), cab, 'cupom_id')
        upsert(tab('fato_loja_item'), [i for i in itens if i['seq_item'] is not None], 'cupom_id,seq_item')
        total_cupom += len(cab); total_item += len(itens)
        tot_pag = resp.get('nTotPaginas', 1)
        print(f"  cupons página {pagina}/{tot_pag}: {len(cab)} cupons, {len(itens)} itens")
        if pagina >= tot_pag: break
        pagina += 1
        time.sleep(1)
    print(f"vendas: {total_cupom} cupons, {total_item} itens")


# ---------------- PAGAMENTOS (formas de pagamento dos cupons) ----------------
def sync_pagamentos(desde, ate):
    pagina = 1
    total = 0
    while True:
        resp = omie(URL_CUPOM, 'CuponsPagamentos', {
            'nPagina': pagina, 'nRegPorPagina': 100,
            'dDtEmisDe': desde, 'dDtEmisAte': ate,
        })
        pgs = resp.get('pagamentos', []) or []
        linhas = []
        vistos = {}
        for p in pgs:
            # o Omie devolve o código em cMeioPag; cIndPag costuma vir vazio
            cod = str(p.get('cMeioPag') or p.get('cIndPag') or '').strip()
            cod = cod.zfill(2) if cod else ''
            cid = p.get('nIdCupom')
            # seqItem repete no mesmo cupom -> gerar sequência própria
            vistos[cid] = vistos.get(cid, 0) + 1
            linhas.append({
                'cupom_id': cid,
                'seq_item': vistos[cid],
                'forma_codigo': cod,
                'forma': FORMAS.get(cod, 'Outros'),
                'meio_codigo': p.get('cMeioPag'),
                'bandeira': p.get('cBandeira') or p.get('cTpBandeira'),
                'parcelas': p.get('nParcelaTEF') or p.get('nParcelaPOS'),
                'valor': num(p.get('nValorItem') or p.get('nValorDocumento')),
                'data_transacao': dt_iso(p.get('dTransacao') or p.get('dDtEmissaoCupom')),
                'nsu': p.get('NSU'),
            })
        linhas = [l for l in linhas if l['cupom_id'] is not None]
        upsert(tab('fato_loja_pagamento'), linhas, 'cupom_id,seq_item')
        total += len(linhas)
        tot_pag = resp.get('nTotPaginas', 1)
        print(f"  pagamentos página {pagina}/{tot_pag}: {len(linhas)} registros")
        if pagina >= tot_pag: break
        pagina += 1
        time.sleep(1)
    print(f"pagamentos: {total} registros")

# ---------------- ESTOQUE (posição) ----------------
def sync_estoque():
    hoje = date.today().strftime('%d/%m/%Y')
    pagina = 1
    total = 0
    while True:
        resp = omie(URL_ESTOQUE, 'ListarPosEstoque', {
            'nPagina': pagina, 'nRegPorPagina': 100,
            'dDataPosicao': hoje, 'cExibeTodos': 'S',
            'codigo_local_estoque': 0,
        })
        prods = resp.get('produtos', []) or []
        linhas = [{
            'produto_id': p.get('nCodProd'),
            'codigo': p.get('cCodigo'),
            'descricao': p.get('cDescricao'),
            'preco_unitario': num(p.get('nPrecoUnitario')),
            'custo_medio': num(p.get('nCMC')),      # custo médio contábil
            'saldo': num(p.get('nSaldo')),
            'fisico': num(p.get('fisico')),
            'reservado': num(p.get('reservado')),
            'estoque_minimo': num(p.get('estoque_minimo')),
            'data_posicao': dt_iso(hoje),
        } for p in prods if p.get('nCodProd')]
        upsert(tab('fato_loja_estoque'), linhas, 'produto_id')
        total += len(linhas)
        tot_pag = resp.get('nTotPaginas', 1)
        print(f"  estoque página {pagina}/{tot_pag}: {len(linhas)} produtos")
        if pagina >= tot_pag: break
        pagina += 1
        time.sleep(1)
    print(f"estoque: {total} produtos")

def registrar_status(ok, total):
    try:
        fonte = 'omie' if UNIDADE == 'salvador' else f'omie_{UNIDADE}'
        nome  = 'Loja (Omie)' if UNIDADE == 'salvador' else f'Loja {UNIDADE.capitalize()} (Omie)'
        st = {'fonte':fonte,'nome_exibicao':nome,
              'ultima_sync':datetime.now(timezone.utc).isoformat(),
              'status':'ok' if ok else 'erro','registros':total,
              'atualizado_em':datetime.now(timezone.utc).isoformat()}
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/integracao_status?on_conflict=fonte",
            data=json.dumps(st).encode(),
            headers={'apikey':SB_KEY,'Authorization':f'Bearer {SB_KEY}',
                     'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
            method='POST')
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        print(f"[aviso] status não registrado: {e}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--desde', default=(date.today()-timedelta(days=365)).strftime('%d/%m/%Y'))
    ap.add_argument('--ate', default=date.today().strftime('%d/%m/%Y'))
    ap.add_argument('--unidade', default='salvador', choices=list(CREDENCIAIS))
    a = ap.parse_args()

    global UNIDADE, APP_KEY, APP_SECRET
    UNIDADE = a.unidade
    k_key, k_sec = CREDENCIAIS[UNIDADE]
    try:
        APP_KEY, APP_SECRET = os.environ[k_key], os.environ[k_sec]
    except KeyError as e:
        raise SystemExit(f"Faltando credencial Omie de {UNIDADE}: variavel {e} nao definida")
    print(f"== Omie · unidade={UNIDADE} · {a.desde} a {a.ate} ==")

    ok = True
    try:
        sync_vendas(a.desde, a.ate)
        sync_pagamentos(a.desde, a.ate)
        sync_estoque()
    except Exception as e:
        ok = False
        print(f"ERRO: {e}")
    registrar_status(ok, 0)
    if not ok:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
