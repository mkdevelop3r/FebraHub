"""FebraHub · Sincroniza vendas CANCELADAS/PERDIDAS do Salesforce.

O sync principal só traz vendas Aprovadas; esta carga traz as de StageName
'Cancelado' e 'Perdida' (Salvador 2) para `fato_venda_cancelada`, que alimenta a
aba "Cancelados" da Central Financeira. Janela por data de cancelamento/fechamento.

Secrets: SALESFORCE_* (como o sync), SUPABASE_URL, SUPABASE_SERVICE_KEY.
"""

import os
from datetime import datetime, timezone, timedelta

from salesforce_api_sync import Salesforce, Supabase, load_env, nested, digits

UNIDADE = os.getenv("SALESFORCE_UNIDADE", "FEBRACIS SALVADOR 2")
LOOKBACK = int(os.getenv("CANCELADOS_LOOKBACK_DAYS", "540"))


def dia(v):
    return str(v)[:10] if v else None


def main():
    load_env()
    sf = Salesforce()
    sb = Supabase()
    desde = (datetime.now(timezone.utc).date() - timedelta(days=LOOKBACK)).isoformat()

    fields = ("Id,Account.Name,Account.CPFun__c,NomeCurso__r.Name,Amount,"
              "CloseDate,DataCancelamento__c,Owner.Name,StageName,Loss_Reason__c")
    soql = (
        f"SELECT {fields} FROM Opportunity "
        f"WHERE Unidade_Geradora_Venda__r.Name = '{UNIDADE}' "
        f"AND Unidade__r.Name = '{UNIDADE}' "          # Unidade Realizadora do Curso (Matriz) = Salvador 2
        "AND StageName IN ('Cancelado','Perdida') "
        f"AND (CloseDate >= {desde} OR DataCancelamento__c >= {desde}T00:00:00Z)"
    )
    recs = sf.query(soql)
    rows = []
    for r in recs:
        dcanc = dia(r.get("DataCancelamento__c"))
        close = dia(r.get("CloseDate"))
        rows.append({
            "venda_id": str(r["Id"]),
            "nome": nested(r, "Account.Name"),
            "cpf": digits(nested(r, "Account.CPFun__c")) or None,
            "curso": nested(r, "NomeCurso__r.Name"),
            "valor": r.get("Amount"),
            "etapa": r.get("StageName"),
            "loss_reason": r.get("Loss_Reason__c"),
            "data_cancelamento": dcanc,
            "data_fechamento": close,
            "data_ref": dcanc or close,
            "consultor": nested(r, "Owner.Name"),
            "unidade": UNIDADE,
            "sincronizado_em": datetime.now(timezone.utc).isoformat(),
        })

    print(f"canceladas/perdidas (desde {desde}): {len(rows)}", flush=True)
    if rows:
        sb.upsert("fato_venda_cancelada", rows, "venda_id")
    print("ok", flush=True)


if __name__ == "__main__":
    main()
