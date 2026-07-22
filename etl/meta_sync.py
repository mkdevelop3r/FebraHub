"""
FebraHub · meta_sync.py
Puxa gasto/alcance por anúncio da Marketing API e grava em fato_meta_insights.

Variáveis de ambiente:
  META_TOKEN        token de longa duração (60 dias)
  META_ACCOUNT_ID   act_426283099062813
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

Uso:
  python meta_sync.py                # últimos 2 meses (rotina diária)
  python meta_sync.py --desde 2024-01-01   # carga histórica
"""
import os, sys, time, json, argparse, urllib.request, urllib.parse
from datetime import date, datetime, timedelta

TOKEN   = os.environ['META_TOKEN']
ACCOUNT = os.environ['META_ACCOUNT_ID']
SB_URL  = os.environ['SUPABASE_URL']
SB_KEY  = os.environ['SUPABASE_SERVICE_KEY']
API     = 'https://graph.facebook.com/v25.0'

def get(path, params):
    params['access_token'] = TOKEN
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

def insights_mes(desde, ate):
    """Puxa insights por anúncio no intervalo, paginando."""
    linhas = []
    params = {
        'level': 'ad',
        'fields': 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,'
                  'spend,impressions,reach,clicks',
        'time_range': json.dumps({'since': desde, 'until': ate}),
        'time_increment': 1,          # 1 linha por dia
        'limit': 200,
    }
    path = f"{ACCOUNT}/insights"
    while True:
        data = get(path, params)
        linhas.extend(data.get('data', []))
        nxt = data.get('paging', {}).get('cursors', {}).get('after')
        if not nxt or not data.get('data'):
            break
        params['after'] = nxt
        time.sleep(0.3)
    return linhas

def montar(r):
    def num(v):
        try: return float(v)
        except: return 0
    return {
        'data': r.get('date_start'),
        'conta_id': ACCOUNT,
        'campanha_id': r.get('campaign_id'),
        'campanha_nome': r.get('campaign_name'),
        'adset_id': r.get('adset_id'),
        'adset_nome': r.get('adset_name'),
        'anuncio_id': r.get('ad_id'),
        'anuncio_nome': r.get('ad_name'),
        'impressoes': int(num(r.get('impressions'))),
        'alcance': int(num(r.get('reach'))),
        'cliques': int(num(r.get('clicks'))),
        'gasto': round(num(r.get('spend')), 2),
    }

def gravar(linhas):
    if not linhas: return 0
    url = f"{SB_URL}/rest/v1/fato_meta_insights?on_conflict=data,campanha_id,anuncio_key"
    # anuncio_key é gerada; o upsert usa data+campanha+anuncio_id
    req = urllib.request.Request(
        url, data=json.dumps(linhas).encode(),
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates'},
        method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status

def meses(desde, ate):
    d = datetime.strptime(desde, '%Y-%m-%d').date()
    fim = datetime.strptime(ate, '%Y-%m-%d').date()
    while d <= fim:
        prox = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield d.isoformat(), min(prox - timedelta(days=1), fim).isoformat()
        d = prox

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--desde', default=(date.today().replace(day=1) - timedelta(days=31)).isoformat())
    ap.add_argument('--ate', default=date.today().isoformat())
    a = ap.parse_args()

    total = 0
    for ini, fim in meses(a.desde, a.ate):
        linhas = [montar(r) for r in insights_mes(ini, fim)]
        if linhas:
            gravar(linhas)
            total += len(linhas)
            print(f"  {ini[:7]}: {len(linhas)} linhas")
        time.sleep(0.5)
    print(f"total: {total} linhas de {a.desde} a {a.ate}")

    # registra status
    try:
        st = {'fonte':'meta_ads','nome_exibicao':'Meta Ads',
              'ultima_sync':datetime.utcnow().isoformat()+'Z','status':'ok',
              'registros':total,'atualizado_em':datetime.utcnow().isoformat()+'Z'}
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/integracao_status?on_conflict=fonte",
            data=json.dumps(st).encode(),
            headers={'apikey':SB_KEY,'Authorization':f'Bearer {SB_KEY}',
                     'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
            method='POST')
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        print(f"[aviso] status não registrado: {e}")

if __name__ == '__main__':
    main()