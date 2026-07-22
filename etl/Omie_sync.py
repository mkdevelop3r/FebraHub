"""
FebraHub · omie_sync.py
Puxa vendas da loja (cupons fiscais) e posição de estoque do Omie.

Variáveis de ambiente:
  OMIE_APP_KEY
  OMIE_APP_SECRET
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

Uso:
  python omie_sync.py                      # vendas do último ano + estoque hoje
  python omie_sync.py --desde 01/01/2024   # histórico de vendas
"""
import os, json, time, argparse, urllib.request
from datetime import date, datetime, timedelta

APP_KEY    = os.environ['OMIE_APP_KEY']
APP_SECRET = os.environ['OMIE_APP_SECRET']
SB_URL     = os.environ['SUPABASE_URL']
SB_KEY     = os.environ['SUPABASE_SERVICE_KEY']

# URLs dos serviços Omie (RPC: POST com app_key/app_secret/call/param)
URL_CUPOM   = 'https://app.omie.com.br/api/v1/produtos/cupomfiscal/'
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
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # 425 = "consumo indevido" (rate limit do Omie); 5xx = instabilidade
        if e.code in (425, 500, 502, 503) and tentativa < 5:
            espera = 20 * (tentativa + 1)
            print(f"  Omie {e.code} — aguardando {espera}s")
            time.sleep(espera)
            return omie(url, call, param, tentativa + 1)
        corpo = e.read().decode()[:300]
        raise RuntimeError(f"Omie {e.code}: {corpo}")

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
    req = urllib.request.Request(url, data=json.dumps(linhas).encode(),
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status

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
        upsert('fato_loja_cupom', cab, 'cupom_id')
        upsert('fato_loja_item', [i for i in itens if i['seq_item'] is not None], 'cupom_id,seq_item')
        total_cupom += len(cab); total_item += len(itens)
        tot_pag = resp.get('nTotPaginas', 1)
        print(f"  cupons página {pagina}/{tot_pag}: {len(cab)} cupons, {len(itens)} itens")
        if pagina >= tot_pag: break
        pagina += 1
        time.sleep(1)
    print(f"vendas: {total_cupom} cupons, {total_item} itens")

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
            'saldo': num(p.get('nSaldo')),
            'fisico': num(p.get('fisico')),
            'reservado': num(p.get('reservado')),
            'estoque_minimo': num(p.get('estoque_minimo')),
            'data_posicao': dt_iso(hoje),
        } for p in prods if p.get('nCodProd')]
        upsert('fato_loja_estoque', linhas, 'produto_id')
        total += len(linhas)
        tot_pag = resp.get('nTotPaginas', 1)
        print(f"  estoque página {pagina}/{tot_pag}: {len(linhas)} produtos")
        if pagina >= tot_pag: break
        pagina += 1
        time.sleep(1)
    print(f"estoque: {total} produtos")

def registrar_status(ok, total):
    try:
        st = {'fonte':'omie','nome_exibicao':'Loja (Omie)',
              'ultima_sync':datetime.utcnow().isoformat()+'Z',
              'status':'ok' if ok else 'erro','registros':total,
              'atualizado_em':datetime.utcnow().isoformat()+'Z'}
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
    a = ap.parse_args()
    ok = True
    try:
        sync_vendas(a.desde, a.ate)
        sync_estoque()
    except Exception as e:
        ok = False
        print(f"ERRO: {e}")
    registrar_status(ok, 0)
    if not ok:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
