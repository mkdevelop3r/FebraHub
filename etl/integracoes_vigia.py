"""Confere se cada integracao rodou E se seu destino avancou."""
import os
from datetime import datetime, timezone
import requests

URL=os.environ["SUPABASE_URL"].rstrip("/")
KEY=os.environ["SUPABASE_SERVICE_KEY"]
H={"apikey":KEY,"Authorization":f"Bearer {KEY}","Content-Type":"application/json"}
WEBHOOK=os.getenv("VIGIA_ALERT_WEBHOOK_URL")

def req(method, path, **kw):
    headers={**H, **kw.pop("headers", {})}
    r=requests.request(method, f"{URL}/rest/v1/{path}", headers=headers, timeout=60, **kw)
    if not r.ok: raise RuntimeError(f"{method} {path}: {r.status_code} {r.text[:500]}")
    return r

def dt(value):
    if not value: return None
    return datetime.fromisoformat(value.replace("Z","+00:00"))

def probe(table, column):
    if not table or not column: return None, None
    rows=req("GET", table, params={"select":column,"order":f"{column}.desc.nullslast","limit":1}).json()
    last=rows[0].get(column) if rows else None
    r=req("HEAD", table, headers={**H,"Prefer":"count=exact","Range":"0-0"})
    total=int(r.headers.get("Content-Range","/0").split("/")[-1] or 0)
    return last,total

def notify(payload):
    if WEBHOOK:
        requests.post(WEBHOOK,json=payload,timeout=30).raise_for_status()

def main():
    now=datetime.now(timezone.utc)
    fontes=req("GET","vigia_fontes",params={"select":"*","ativo":"eq.true"}).json()
    for f in fontes:
        status=req("GET","integracao_status",params={"select":"*","fonte":f"eq.{f['fonte']}","limit":1}).json()
        status=status[0] if status else {}
        prev=req("GET","vigia_verificacoes",params={"select":"*","fonte":f"eq.{f['fonte']}","order":"verificado_em.desc","limit":1}).json()
        prev=prev[0] if prev else None
        last,count=probe(f.get("tabela_destino"),f.get("coluna_relogio"))
        ran=dt(status.get("ultima_sync")); situation="saudavel"; reason="Execucao e destino em dia"
        advanced=None; sequence=0
        if not ran or (now-ran).total_seconds() > f["tolerancia_minutos"]*60:
            situation="atrasado"; reason="A fonte nao executou dentro da tolerancia"
        elif status.get("status") == "erro":
            situation="erro"; reason=status.get("mensagem") or "A fonte declarou erro"
        elif not f.get("tabela_destino"):
            situation="nao_mensurado"; reason="Execucao em dia; gravacao ainda sem medidor"
        elif prev and ran > (dt(prev.get("ultima_execucao")) or datetime.min.replace(tzinfo=timezone.utc)):
            advanced=(last != prev.get("destino_ultima") or count != prev.get("destino_registros"))
            sequence=0 if advanced else int(prev.get("sequencia_sem_avanco") or 0)+1
            if f["exigir_avanco"] and sequence >= f["execucoes_sem_avanco"]:
                situation="sem_avanco"; reason=f"Rodou {sequence} vezes sem alterar o destino"
        payload={"fonte":f["fonte"],"ultima_execucao":status.get("ultima_sync"),
          "destino_ultima":last,"destino_registros":count,"avancou":advanced,
          "sequencia_sem_avanco":sequence,"situacao":situation,"motivo":reason}
        req("POST","vigia_verificacoes",json=payload)
        open_alerts=req("GET","vigia_alertas",params={"select":"*","fonte":f"eq.{f['fonte']}","resolvido_em":"is.null"}).json()
        bad=situation in ("atrasado","erro","sem_avanco")
        if bad:
            same=next((a for a in open_alerts if a["tipo"]==situation),None)
            if same:
                req("PATCH",f"vigia_alertas?id=eq.{same['id']}",json={"visto_em":now.isoformat(),"motivo":reason})
            else:
                req("POST","vigia_alertas",json={"fonte":f["fonte"],"tipo":situation,"motivo":reason})
                notify({"evento":"alerta","fonte":f["nome"],"situacao":situation,"motivo":reason})
        elif open_alerts:
            for a in open_alerts: req("PATCH",f"vigia_alertas?id=eq.{a['id']}",json={"resolvido_em":now.isoformat(),"visto_em":now.isoformat()})
            notify({"evento":"recuperacao","fonte":f["nome"],"situacao":situation})
        print(f"{f['fonte']}: {situation} - {reason}")

if __name__ == "__main__": main()
