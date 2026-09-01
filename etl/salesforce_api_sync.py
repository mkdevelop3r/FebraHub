"""Sincroniza Salesforce -> Supabase sem depender de e-mail ou CSV.

Autenticacao headless: OAuth Client Credentials de um External Client App.
Por padrao apenas consulta e valida. Use --write para gravar no Supabase.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from urllib.parse import unquote

import requests


API_VERSION = os.getenv("SALESFORCE_API_VERSION", "67.0")
UNIDADE = os.getenv("SALESFORCE_UNIDADE", "FEBRACIS SALVADOR 2")
REPORT_ALUNOS = os.getenv("SALESFORCE_REPORT_ALUNOS", "00OV20000091YSHMA2")
REPORT_PAGAMENTOS = os.getenv("SALESFORCE_REPORT_PAGAMENTOS", "00OV20000091Z1lMAE")
LOOKBACK_DAYS = int(os.getenv("SALESFORCE_LOOKBACK_DAYS", "120"))


def log(message):
    print(message, flush=True)


def load_env():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


class Salesforce:
    def __init__(self):
        instance = (os.getenv("SALESFORCE_INSTANCE_URL") or "").rstrip("/")
        token = os.getenv("SALESFORCE_ACCESS_TOKEN")
        if not token:
            auth_url = os.getenv("SALESFORCE_AUTH_URL")
            if auth_url:
                client_id, client_secret, refresh_token, auth_instance = (
                    parse_sfdx_auth_url(auth_url)
                )
                response = requests.post(
                    f"{auth_instance}/services/oauth2/token",
                    data={"grant_type": "refresh_token", "client_id": client_id,
                          "client_secret": client_secret or None,
                          "refresh_token": refresh_token},
                    timeout=60,
                )
                response.raise_for_status()
                auth = response.json()
                token = auth["access_token"]
                instance = auth.get("instance_url", auth_instance).rstrip("/")
            else:
                client_id = os.environ.get("SALESFORCE_CLIENT_ID")
                client_secret = os.environ.get("SALESFORCE_CLIENT_SECRET")
                if not client_id or not client_secret:
                    raise RuntimeError(
                        "Defina SALESFORCE_AUTH_URL ou SALESFORCE_CLIENT_ID e "
                        "SALESFORCE_CLIENT_SECRET."
                    )
                login_url = (os.getenv("SALESFORCE_LOGIN_URL") or
                             "https://login.salesforce.com").rstrip("/")
                response = requests.post(
                    f"{login_url}/services/oauth2/token",
                    data={"grant_type": "client_credentials",
                          "client_id": client_id, "client_secret": client_secret},
                    timeout=60,
                )
                response.raise_for_status()
                auth = response.json()
                token = auth["access_token"]
                instance = auth["instance_url"].rstrip("/")
        if not instance:
            raise RuntimeError("SALESFORCE_INSTANCE_URL nao definida.")
        self.instance = instance
        self.headers = {"Authorization": f"Bearer {token}",
                        "Accept": "application/json"}

    def get(self, path, params=None):
        url = path if path.startswith("http") else f"{self.instance}{path}"
        response = requests.get(url, headers=self.headers, params=params, timeout=120)
        response.raise_for_status()
        return response.json()

    def query(self, soql):
        data = self.get(f"/services/data/v{API_VERSION}/query", {"q": soql})
        records = list(data.get("records", []))
        while not data.get("done", True):
            data = self.get(data["nextRecordsUrl"])
            records.extend(data.get("records", []))
        return records

    def report_description(self, report_id):
        return self.get(
            f"/services/data/v{API_VERSION}/analytics/reports/{report_id}/describe"
        )["reportMetadata"]

    def describe_object(self, object_name):
        return self.get(
            f"/services/data/v{API_VERSION}/sobjects/{object_name}/describe")


def parse_sfdx_auth_url(value):
    """Extrai client id/secret/refresh token sem registrar nenhum segredo."""
    if not value.startswith("force://") or "@" not in value:
        raise RuntimeError("SALESFORCE_AUTH_URL invalida.")
    credentials, host = value[len("force://"):].rsplit("@", 1)
    parts = credentials.split(":", 2)
    if len(parts) != 3 or not parts[0] or not parts[2] or not host:
        raise RuntimeError("SALESFORCE_AUTH_URL incompleta.")
    client_id, client_secret, refresh_token = map(unquote, parts)
    instance = host if host.startswith("http") else f"https://{host}"
    return client_id, client_secret, refresh_token, instance.rstrip("/")


def nested(record, path, default=None):
    value = record
    for key in path.split("."):
        if not isinstance(value, dict):
            return default
        value = value.get(key)
    return default if value is None else value


def iso_day(value):
    return str(value or "")[:10] or None


def br_day(value):
    day = iso_day(value)
    if not day:
        return None
    return datetime.strptime(day, "%Y-%m-%d").strftime("%d/%m/%Y")


def digits(value):
    return re.sub(r"\D", "", str(value or ""))


def canonical_salesforce_id(value):
    text = str(value or "")
    return text[:15] if re.fullmatch(r"[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?", text) else text


def allowed_enrollment_types(metadata):
    for item in metadata.get("reportFilters", []):
        if item.get("column") == "Opportunity.Tipo_de_Matricula__c":
            return {part.strip() for part in item.get("value", "").split(",")
                    if part.strip()}
    raise RuntimeError("Relatorio de alunos sem filtro Tipo de Matricula.")


def resolve_picklist_values(sf, object_name, field_name, report_labels):
    """Converte rotulos exibidos no relatorio nos valores gravados pela API."""
    description = sf.get(
        f"/services/data/v{API_VERSION}/sobjects/{object_name}/describe"
    )
    field = next((item for item in description.get("fields", [])
                  if item.get("name") == field_name), None)
    if not field:
        raise RuntimeError(f"Campo {object_name}.{field_name} nao encontrado.")
    values = {
        item.get("value"): item.get("label")
        for item in field.get("picklistValues", [])
        if item.get("label") in report_labels or item.get("value") in report_labels
    }
    values.pop(None, None)
    if not values:
        raise RuntimeError(f"Nenhum valor do picklist {field_name} corresponde ao relatorio.")
    return values


def assert_report(metadata, expected_name, expected_date_column):
    if metadata.get("name") != expected_name:
        raise RuntimeError(
            f"Relatorio inesperado: {metadata.get('name')!r}; esperado {expected_name!r}."
        )
    date_column = nested(metadata, "standardDateFilter.column")
    if date_column != expected_date_column:
        raise RuntimeError(
            f"{expected_name}: filtro de data mudou para {date_column!r}; abortando."
        )


def opportunity_rows(sf, start):
    fields = (
        "Id,Name,AccountId,Account.Name,Account.CPFun__c,"
        "Account.PersonEmail,Account.PersonMobilePhone,Owner.Name,"
        "Data_de_Aprova_o__c,CloseDate,StageName,CreatedDate,Amount,LeadSource,"
        "Tipo_de_Matricula__c,NomeCurso__r.Name,Turma__r.Name,"
        "Unidade_Geradora_Venda__r.Name,Treinador__r.Name,"
        "utm_campaign__c,UltimaOrigemLead__c"
    )
    soql = (
        f"SELECT {fields} FROM Opportunity "
        f"WHERE (Data_de_Aprova_o__c >= {start.isoformat()} OR "
        f"(Data_de_Aprova_o__c = null AND CloseDate >= {start.isoformat()})) "
        "AND StageName = 'Aprovada' "
        f"AND Unidade_Geradora_Venda__r.Name = '{UNIDADE}'"
    )
    return sf.query(soql)


def transform_students(records, allowed, labels):
    rows = []
    for record in records:
        enrollment_value = record.get("Tipo_de_Matricula__c") or ""
        if enrollment_value not in allowed:
            continue
        enrollment_type = labels.get(enrollment_value, enrollment_value)
        course = nested(record, "NomeCurso__r.Name", "")
        sale_id = canonical_salesforce_id(record["Id"])
        email = str(nested(record, "Account.PersonEmail", "") or "").strip().lower()
        cpf = digits(nested(record, "Account.CPFun__c", ""))
        rows.append({
            "matricula_id": f"{sale_id}|{course}"[:120],
            "aluno_id": cpf or email,
            "curso_id": course or None,
            "data_matricula": iso_day(record.get("Data_de_Aprova_o__c") or
                                       record.get("CloseDate")),
            "status_matricula": record.get("StageName"),
            "data_conclusao": None,
            "original_id_venda": sale_id,
            "consultor_id": nested(record, "Owner.Name"),
            "tipo_matricula": enrollment_type or None,
            "data_fechamento_venda": iso_day(record.get("CloseDate")),
            "turma": nested(record, "Turma__r.Name"),
            "valor": record.get("Amount"),
            "origem_lead": record.get("LeadSource"),
            "unidade_geradora_venda": nested(
                record, "Unidade_Geradora_Venda__r.Name"),
            "fase": None,
            "ganho": None,
            "treinador": nested(record, "Treinador__r.Name"),
            "email_cliente": email or None,
            "telefone_cliente": digits(nested(record, "Account.PersonMobilePhone")) or None,
            "utm_campaign": record.get("utm_campaign__c"),
            "ultima_origem_lead": record.get("UltimaOrigemLead__c"),
        })
    return rows


def payment_rows(sf, start):
    fields = (
        "Id,Idpagamento__c,Name,Valor_cada_Parcela__c,Status__c,Payment_Id__c,"
        "Venda__c,Venda__r.Name,Venda__r.AccountId,Venda__r.Owner.Name,"
        "Venda__r.Data_de_pagamento__c,Venda__r.Data_de_Aprova_o__c,"
        "Venda__r.CloseDate,Venda__r.Tipo_de_Matricula__c,Venda__r.Amount,"
        "Venda__r.QuantidadeParcelas__c,Venda__r.StageName,"
        "Venda__r.Unidade_Geradora_Venda__r.Name"
    )
    soql = (
        f"SELECT {fields} FROM Forma_Pag_Venda__c "
        f"WHERE Venda__r.Data_de_Aprova_o__c >= {start.isoformat()} "
        "AND Venda__r.StageName = 'Aprovada' "
        f"AND Venda__r.Unidade_Geradora_Venda__r.Name = '{UNIDADE}'"
    )
    return sf.query(soql)


def transform_payments(records, allowed, labels):
    rows = []
    for record in records:
        enrollment_value = nested(record, "Venda__r.Tipo_de_Matricula__c", "")
        if enrollment_value not in allowed:
            continue
        enrollment_type = labels.get(enrollment_value, enrollment_value)
        approved = iso_day(nested(record, "Venda__r.Data_de_Aprova_o__c"))
        paid = iso_day(nested(record, "Venda__r.Data_de_pagamento__c")) or approved
        rows.append({
            "pagamento_id": record.get("Idpagamento__c") or record["Id"],
            "aluno_id": nested(record, "Venda__r.AccountId"),
            "curso_id": None,
            "consultor_id": nested(record, "Venda__r.Owner.Name"),
            "data_pagamento": paid,
            "valor": nested(record, "Venda__r.Amount"),
            "status_pagamento": record.get("Status__c"),
            "forma_pagamento": record.get("Name"),
            "original_id_venda": canonical_salesforce_id(record.get("Venda__c")),
            "nome_venda": nested(record, "Venda__r.Name"),
            "tipo_matricula": enrollment_type or None,
            "quantidade_parcelas": nested(record, "Venda__r.QuantidadeParcelas__c"),
            "valor_parcela": record.get("Valor_cada_Parcela__c"),
            "periodo_fiscal": None,
            "unidade_geradora_venda": nested(
                record, "Venda__r.Unidade_Geradora_Venda__r.Name"),
            "payment_id": record.get("Payment_Id__c"),
            "data_aprovacao": approved,
            "data_fechamento": iso_day(nested(record, "Venda__r.CloseDate")),
        })
    return rows


def presence_rows(sf):
    fields = (
        "Id,Cliente__r.Name,Unidade_Geradora_da_Venda__c,Unidade__c,"
        "Curso__r.Name,Name,CreatedDate,Turma_do_Credenciamento__c,CPF__c"
    )
    soql = (
        f"SELECT {fields} FROM Presenca__c WHERE CreatedDate >= 2021-01-01T00:00:00Z "
        "AND Unidade__c IN ('FEBRACIS SALVADOR 2','FEBRACIS SALVADOR')"
    )
    records = sf.query(soql)
    return [{
        "nome": nested(r, "Cliente__r.Name"),
        "unidade_venda": r.get("Unidade_Geradora_da_Venda__c"),
        "unidade": r.get("Unidade__c"),
        "curso": nested(r, "Curso__r.Name"),
        "presenca_txt": r.get("Name"),
        "data_registro": br_day(r.get("CreatedDate")),
        "turma": r.get("Turma_do_Credenciamento__c"),
        "cpf": digits(r.get("CPF__c")) or None,
    } for r in records]


class Supabase:
    def __init__(self):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        key = os.environ["SUPABASE_SERVICE_KEY"]
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json"}

    def request(self, method, path, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        response = requests.request(method, f"{self.url}/rest/v1/{path}",
                                    headers=headers, timeout=180, **kwargs)
        response.raise_for_status()
        return response

    def select_all(self, table, columns, filters=None):
        result, offset = [], 0
        filters = list(filters or [])
        while True:
            params = [("select", columns), ("limit", 1000), ("offset", offset)]
            params.extend(filters)
            batch = self.request("GET", table, params=params).json()
            result.extend(batch)
            if len(batch) < 1000:
                return result
            offset += 1000

    def upsert(self, table, rows, key):
        for index in range(0, len(rows), 500):
            self.request("POST", table, params={"on_conflict": key},
                         headers={**self.headers,
                                  "Prefer": "resolution=merge-duplicates,return=minimal"},
                         json=rows[index:index + 500])

    def keys_in_window(self, table, key, date_column, start, end):
        result, offset = set(), 0
        while True:
            response = self.request(
                "GET", table,
                params=[("select", key), (date_column, f"gte.{start}"),
                        (date_column, f"lte.{end}"), ("limit", 1000),
                        ("offset", offset)],
            ).json()
            result.update(str(row[key]) for row in response if row.get(key))
            if len(response) < 1000:
                return result
            offset += 1000

    def delete_keys(self, table, key, keys):
        for value in keys:
            self.request("DELETE", table, params={key: f"eq.{value}"})

    def plan_window(self, table, rows, key, date_column):
        dates = sorted(row[date_column] for row in rows if row.get(date_column))
        if not dates:
            raise RuntimeError(f"{table}: nenhuma data valida.")
        start, end = dates[0], dates[-1]
        incoming = {str(row[key]) for row in rows if row.get(key)}
        existing = self.keys_in_window(table, key, date_column, start, end)
        plan = {
            "tabela": table,
            "inicio": start,
            "fim": end,
            "recebidos": len(rows),
            "inclusoes": len(incoming - existing),
            "upserts_existentes": len(incoming & existing),
            "remocoes": len(existing - incoming),
        }
        log("PLANO_ESCRITA " + json.dumps(plan, ensure_ascii=False, sort_keys=True))
        return plan

    def replace_window(self, table, rows, key, date_column):
        dates = sorted(row[date_column] for row in rows if row.get(date_column))
        if not dates:
            raise RuntimeError(f"{table}: nenhuma data valida.")
        start, end = dates[0], dates[-1]
        if (date.fromisoformat(end) - date.fromisoformat(start)).days > 120:
            raise RuntimeError(f"{table}: janela maior que 120 dias; abortando.")
        self.upsert(table, rows, key)
        incoming = {str(row[key]) for row in rows if row.get(key)}
        existing = self.keys_in_window(table, key, date_column, start, end)
        self.delete_keys(table, key, existing - incoming)
        log(f"{table}: {len(rows)} upserts; {len(existing - incoming)} removidos")

    def replace_presence_stage(self, rows):
        self.request("DELETE", "stg_presenca", params={"cpf": "not.is.null"})
        self.request("DELETE", "stg_presenca", params={"cpf": "is.null"})
        try:
            for index in range(0, len(rows), 1000):
                self.request("POST", "stg_presenca", json=rows[index:index + 1000])
            result = self.request("POST", "rpc/promover_presenca", json={}).json()
        finally:
            self.request("DELETE", "stg_presenca", params={"cpf": "not.is.null"})
            self.request("DELETE", "stg_presenca", params={"cpf": "is.null"})
        log(f"presenca promovida: {result}")


def normalized(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join(text.encode("ascii", "ignore").decode().upper().split())


def max_value_by_sale(rows, allowed_types=None, excluded_courses=None):
    allowed_types = {normalized(item) for item in (allowed_types or [])}
    excluded_courses = {normalized(item) for item in (excluded_courses or [])}
    sales = {}
    for row in rows:
        if allowed_types and normalized(row.get("tipo_matricula")) not in allowed_types:
            continue
        if excluded_courses and normalized(row.get("curso_id")) in excluded_courses:
            continue
        sale_id = row.get("original_id_venda")
        if not sale_id:
            continue
        value = float(row.get("valor") or 0)
        sales[str(sale_id)] = max(value, sales.get(str(sale_id), 0))
    return round(sum(sales.values()), 2), len(sales)


def grouped_counts(rows, field, date_field=None):
    counts = {}
    for row in rows:
        value = str(row.get(field) or "(vazio)")
        if date_field:
            month = str(row.get(date_field) or "(sem data)")[:7]
            value = f"{month} | {value}"
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:20])


def log_divergence(source, api_rows, db_rows, key, date_field, type_field):
    api_map = {str(row[key]): row for row in api_rows if row.get(key)}
    db_map = {str(row[key]): row for row in db_rows if row.get(key)}
    only_api = [api_map[item] for item in api_map.keys() - db_map.keys()]
    only_db = [db_map[item] for item in db_map.keys() - api_map.keys()]
    for side, rows in (("so_api", only_api), ("so_supabase", only_db)):
        detail = {
            "fonte": source,
            "lado": side,
            "total": len(rows),
            "por_mes_tipo": grouped_counts(rows, type_field, date_field),
        }
        log("DIVERGENCIA " + json.dumps(detail, ensure_ascii=False, sort_keys=True))
    return only_api, only_db


def log_student_sale_diagnosis(api_rows, db_rows):
    api_by_sale = {canonical_salesforce_id(row["original_id_venda"]): row
                   for row in api_rows
                   if row.get("original_id_venda")}
    db_by_sale = {canonical_salesforce_id(row["original_id_venda"]): row
                  for row in db_rows
                  if row.get("original_id_venda")}
    api_sales = set(api_by_sale)
    db_sales = set(db_by_sale)
    shared_sales = api_sales & db_sales
    changes = {field: 0 for field in (
        "matricula_id", "curso_id", "tipo_matricula", "data_matricula", "valor")}
    course_transitions = {}
    for sale_id in shared_sales:
        api_row = api_by_sale[sale_id]
        db_row = db_by_sale[sale_id]
        for field in changes:
            if str(api_row.get(field) or "") != str(db_row.get(field) or ""):
                changes[field] += 1
        if str(api_row.get("curso_id") or "") != str(db_row.get("curso_id") or ""):
            transition = (
                f'{db_row.get("curso_id") or "(vazio)"} -> '
                f'{api_row.get("curso_id") or "(vazio)"}')
            course_transitions[transition] = course_transitions.get(transition, 0) + 1
    course_transitions = dict(sorted(
        course_transitions.items(), key=lambda item: (-item[1], item[0]))[:20])
    detail = {
        "metrica": "diagnostico_por_original_id_venda",
        "vendas_api": len(api_sales),
        "vendas_supabase": len(db_sales),
        "vendas_em_ambos": len(shared_sales),
        "vendas_so_api": len(api_sales - db_sales),
        "vendas_so_supabase": len(db_sales - api_sales),
        "alteracoes_nas_vendas_em_ambos": changes,
        "principais_trocas_de_curso": course_transitions,
    }
    log("DIAGNOSTICO_VENDA " +
        json.dumps(detail, ensure_ascii=False, sort_keys=True))
    return (
        [api_by_sale[item] for item in api_sales - db_sales],
        [db_by_sale[item] for item in db_sales - api_sales],
    )


def diagnose_sales_missing_from_api(sf, db_only_rows, start, allowed, labels):
    raw_sale_ids = sorted({str(row["original_id_venda"]) for row in db_only_rows
                       if row.get("original_id_venda")})
    fields = (
        "Id,StageName,Data_de_Aprova_o__c,CloseDate,Amount,"
        "Tipo_de_Matricula__c,NomeCurso__r.Name,"
        "Unidade_Geradora_Venda__r.Name"
    )
    current = []
    for offset in range(0, len(raw_sale_ids), 100):
        quoted_ids = ",".join(
            f"'{item}'" for item in raw_sale_ids[offset:offset + 100])
        current.extend(sf.query(
            f"SELECT {fields} FROM Opportunity WHERE Id IN ({quoted_ids})"))
    current_by_id = {canonical_salesforce_id(row["Id"]): row for row in current}
    reasons = {}
    stages = {}
    units = {}
    types = {}
    months = {}
    sale_ids = sorted({canonical_salesforce_id(item) for item in raw_sale_ids})
    for sale_id in sale_ids:
        record = current_by_id.get(canonical_salesforce_id(sale_id))
        if not record:
            reason_list = ["nao_encontrada_ou_sem_acesso"]
        else:
            reason_list = []
            stage = str(record.get("StageName") or "(vazio)")
            unit = str(nested(record, "Unidade_Geradora_Venda__r.Name", "(vazio)"))
            enrollment_value = record.get("Tipo_de_Matricula__c") or ""
            enrollment_type = labels.get(enrollment_value, enrollment_value or "(vazio)")
            approval = iso_day(record.get("Data_de_Aprova_o__c"))
            close_date = iso_day(record.get("CloseDate"))
            effective_date = approval or close_date
            month = str(effective_date or "(sem data)")[:7]
            stages[stage] = stages.get(stage, 0) + 1
            units[unit] = units.get(unit, 0) + 1
            types[enrollment_type] = types.get(enrollment_type, 0) + 1
            months[month] = months.get(month, 0) + 1
            if stage != "Aprovada":
                reason_list.append("fase_nao_aprovada")
            if unit != UNIDADE:
                reason_list.append("outra_unidade")
            if enrollment_value not in allowed:
                reason_list.append("tipo_fora_do_relatorio")
            if not effective_date or effective_date < start.isoformat():
                reason_list.append("fora_da_janela_120_dias")
            if not reason_list:
                reason_list.append("deveria_estar_na_api")
        reason = "+".join(reason_list)
        reasons[reason] = reasons.get(reason, 0) + 1

    def top(values):
        return dict(sorted(values.items(), key=lambda item: (-item[1], item[0]))[:20])

    detail = {
        "metrica": "motivos_vendas_so_supabase",
        "total": len(sale_ids),
        "encontradas_no_salesforce": len(current_by_id),
        "motivos": top(reasons),
        "fases_atuais": top(stages),
        "unidades_atuais": top(units),
        "tipos_atuais": top(types),
        "meses_atuais": top(months),
    }
    log("DIAGNOSTICO_ESTADO_ATUAL " +
        json.dumps(detail, ensure_ascii=False, sort_keys=True))


def presence_key(row, api=False):
    cpf = digits(row.get("cpf"))
    if cpf:
        cpf = cpf.zfill(11)
    turma = str(row.get("turma") or "").strip()
    if api:
        match = re.search(r"Dia\s*(\d+)", str(row.get("presenca_txt") or ""), re.I)
        day = int(match.group(1)) if match else None
    else:
        day = row.get("dia")
    return (cpf, turma, day) if cpf and turma and day else None


def log_event_diagnosis(students, presence, turma):
    target = normalized(turma)
    event_students = [row for row in students
                      if normalized(row.get("turma")) == target]
    event_presence = [row for row in presence
                      if normalized(row.get("turma")) == target]
    eligible_types = {
        "CONSUMIDOR DE VAGAS", "MATRÍCULA", "BÔNUS", "PERMUTA",
        "INFLUENCIADOR", "CORTESIA", "TAXA DE TRANSFERÊNCIA ISENTO",
    }
    eligible = [row for row in event_students
                if normalized(row.get("tipo_matricula")) in
                {normalized(item) for item in eligible_types}]
    unique_students = {str(row.get("aluno_id")) for row in eligible
                       if row.get("aluno_id")}
    credentialed_cpfs = {digits(row.get("cpf")).zfill(11)
                         for row in event_presence if digits(row.get("cpf"))}
    detail = {
        "turma": turma,
        "matriculas_relatorio": len(event_students),
        "alunos_elegiveis_unicos": len(unique_students),
        "credenciados_cpf_unico": len(credentialed_cpfs),
        "registros_presenca": len(event_presence),
        "tipos_matricula": grouped_counts(event_students, "tipo_matricula"),
    }
    log("DIAGNOSTICO_EVENTO " +
        json.dumps(detail, ensure_ascii=False, sort_keys=True))


def discover_class_object(sf, class_id):
    prefix = str(class_id)[:3]
    catalog = sf.get(f"/services/data/v{API_VERSION}/sobjects")
    matches = [item for item in catalog.get("sobjects", [])
               if item.get("keyPrefix") == prefix]
    if not matches:
        raise RuntimeError(f"Nenhum objeto Salesforce com prefixo {prefix}.")
    for item in matches:
        object_name = item["name"]
        description = sf.describe_object(object_name)
        keywords = ("turma", "class", "cred", "aluno", "student", "presen",
                    "status", "curso", "unidade", "particip")
        fields = [{
            "name": field.get("name"),
            "label": field.get("label"),
            "type": field.get("type"),
            "referenceTo": field.get("referenceTo"),
        } for field in description.get("fields", [])
            if any(word in normalized(
                f'{field.get("name", "")} {field.get("label", "")}').lower()
                   for word in keywords)]
        children = [{
            "childSObject": child.get("childSObject"),
            "field": child.get("field"),
            "relationshipName": child.get("relationshipName"),
        } for child in description.get("childRelationships", [])
            if any(word in normalized(
                f'{child.get("childSObject", "")} '
                f'{child.get("relationshipName", "")}').lower()
                   for word in keywords)]
        name_field = description.get("nameField") or "Name"
        records = sf.query(
            f"SELECT Id,{name_field} FROM {object_name} "
            f"WHERE Id = '{class_id}' LIMIT 1")
        detail = {
            "class_id": class_id,
            "objeto": object_name,
            "rotulo": item.get("label"),
            "registro": records,
            "campos_relevantes": fields,
            "relacionamentos_filhos_relevantes": children,
        }
        log("DESCOBERTA_CLASS_ID " +
            json.dumps(detail, ensure_ascii=False, sort_keys=True))

    credential_description = sf.describe_object("Credenciamento__c")
    credential_keywords = (
        "turma", "cred", "aluno", "student", "client", "contact", "contato",
        "presen", "status", "cpf", "opportun", "venda", "matric")
    credential_fields = [{
        "name": field.get("name"),
        "label": field.get("label"),
        "type": field.get("type"),
        "referenceTo": field.get("referenceTo"),
    } for field in credential_description.get("fields", [])
        if any(word in normalized(
            f'{field.get("name", "")} {field.get("label", "")}').lower()
               for word in credential_keywords)]
    credential_count = sf.query(
        "SELECT COUNT(Id) total, "
        "COUNT(CPF_do_Cliente__c) com_cpf_cliente, "
        "COUNT(CPF__c) com_cpf_credenciamento "
        "FROM Credenciamento__c "
        f"WHERE Turma__c = '{class_id}'")
    log("DESCOBERTA_CREDENCIAMENTO " + json.dumps({
        "class_id": class_id,
        "total_registros": credential_count,
        "campos_relevantes": credential_fields,
    }, ensure_ascii=False, sort_keys=True))


def compare_with_supabase(sf, sb, students, payments, presence, start,
                          allowed, labels):
    student_db_all = sb.select_all(
        "fato_base_alunos",
        "matricula_id,valor,data_matricula,data_fechamento_venda,"
        "original_id_venda,tipo_matricula,curso_id",
    )
    student_db = [row for row in student_db_all if
                  str(row.get("data_matricula") or
                      row.get("data_fechamento_venda") or "")[:10] >= start.isoformat()]
    payment_db = sb.select_all(
        "fato_pagamento_base",
        "pagamento_id,valor,data_aprovacao,original_id_venda,tipo_matricula",
        [("data_aprovacao", f"gte.{start.isoformat()}")],
    )

    def diff(name, api_rows, db_rows, key):
        api_keys = {str(row[key]) for row in api_rows if row.get(key)}
        db_keys = {str(row[key]) for row in db_rows if row.get(key)}
        result = {
            "fonte": name,
            "api": len(api_keys),
            "supabase": len(db_keys),
            "em_ambos": len(api_keys & db_keys),
            "so_api": len(api_keys - db_keys),
            "so_supabase": len(db_keys - api_keys),
        }
        log("RECONCILIACAO " + json.dumps(result, ensure_ascii=False, sort_keys=True))
        return result

    results = [
        diff("alunos", students, student_db, "matricula_id"),
        diff("pagamentos", payments, payment_db, "pagamento_id"),
    ]

    students_only_api, students_only_db = log_divergence(
        "alunos", students, student_db, "matricula_id",
        "data_matricula", "tipo_matricula")
    sales_only_api, sales_only_db = log_student_sale_diagnosis(
        students, student_db)
    diagnose_sales_missing_from_api(
        sf, sales_only_db, start, allowed, labels)
    log_divergence(
        "pagamentos", payments, payment_db, "pagamento_id",
        "data_aprovacao", "tipo_matricula")

    billing_types = {"Matrícula", "COMPRADOR DE VAGAS", "MAT. RETROATIVA"}
    excluded_courses = {"REVOLUTION", "METODO CIS GLOBAL HOLDING"}
    api_billing, api_sales = max_value_by_sale(
        students, billing_types, excluded_courses)
    db_billing, db_sales = max_value_by_sale(
        student_db, billing_types, excluded_courses)
    billing = {
        "metrica": "faturamento_aprovacao",
        "vendas_api": api_sales,
        "vendas_supabase": db_sales,
        "valor_api": api_billing,
        "valor_supabase": db_billing,
        "diferenca": round(api_billing - db_billing, 2),
    }
    log("REGRA_NEGOCIO " + json.dumps(billing, ensure_ascii=False, sort_keys=True))
    api_only_billing, api_only_sales = max_value_by_sale(
        students_only_api, billing_types, excluded_courses)
    db_only_billing, db_only_sales = max_value_by_sale(
        students_only_db, billing_types, excluded_courses)
    exclusive_billing = {
        "metrica": "faturamento_registros_exclusivos",
        "vendas_so_api": api_only_sales,
        "vendas_so_supabase": db_only_sales,
        "valor_so_api": api_only_billing,
        "valor_so_supabase": db_only_billing,
        "diferenca": round(api_only_billing - db_only_billing, 2),
    }
    log("REGRA_NEGOCIO " +
        json.dumps(exclusive_billing, ensure_ascii=False, sort_keys=True))
    api_real_only_billing, api_real_only_sales = max_value_by_sale(
        sales_only_api, billing_types, excluded_courses)
    db_real_only_billing, db_real_only_sales = max_value_by_sale(
        sales_only_db, billing_types, excluded_courses)
    real_exclusive_billing = {
        "metrica": "faturamento_vendas_realmente_exclusivas",
        "vendas_so_api": api_real_only_sales,
        "vendas_so_supabase": db_real_only_sales,
        "valor_so_api": api_real_only_billing,
        "valor_so_supabase": db_real_only_billing,
        "diferenca": round(api_real_only_billing - db_real_only_billing, 2),
    }
    log("REGRA_NEGOCIO " +
        json.dumps(real_exclusive_billing, ensure_ascii=False, sort_keys=True))

    occupancy_types = {
        "CONSUMIDOR DE VAGAS", "MATRÍCULA", "BÔNUS", "PERMUTA",
        "INFLUENCIADOR", "CORTESIA", "TAXA DE TRANSFERÊNCIA ISENTO",
    }
    api_occupancy = {row["matricula_id"] for row in students
                     if normalized(row.get("tipo_matricula")) in
                     {normalized(item) for item in occupancy_types}}
    db_occupancy = {row["matricula_id"] for row in student_db
                    if normalized(row.get("tipo_matricula")) in
                    {normalized(item) for item in occupancy_types}}
    occupancy = {
        "metrica": "ocupacao_evento",
        "api": len(api_occupancy),
        "supabase": len(db_occupancy),
        "em_ambos": len(api_occupancy & db_occupancy),
        "so_api": len(api_occupancy - db_occupancy),
        "so_supabase": len(db_occupancy - api_occupancy),
    }
    log("REGRA_NEGOCIO " + json.dumps(occupancy, ensure_ascii=False, sort_keys=True))

    if presence:
        presence_db = sb.select_all("fato_presenca", "cpf,turma,dia")
        api_keys = {key for row in presence if (key := presence_key(row, api=True))}
        db_keys = {key for row in presence_db if (key := presence_key(row))}
        result = {
            "fonte": "presenca",
            "api_bruta": len(presence),
            "api_deduplicada": len(api_keys),
            "supabase": len(db_keys),
            "em_ambos": len(api_keys & db_keys),
            "so_api": len(api_keys - db_keys),
            "so_supabase": len(db_keys - api_keys),
        }
        log("RECONCILIACAO " + json.dumps(result, ensure_ascii=False, sort_keys=True))
        log("PLANO_ESCRITA " + json.dumps({
            "tabela": "fato_presenca",
            "recebidos_deduplicados": len(api_keys),
            "inclusoes": len(api_keys - db_keys),
            "ja_existentes": len(api_keys & db_keys),
            "remocoes": 0,
        }, ensure_ascii=False, sort_keys=True))
        results.append(result)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true",
                        help="Grava no Supabase; sem esta flag apenas valida.")
    parser.add_argument("--include-presence", action="store_true")
    parser.add_argument("--compare", action="store_true",
                        help="Compara com o Supabase sem gravar.")
    parser.add_argument(
        "--target", action="append",
        choices=("students", "payments", "presence"),
        help="Fonte a gravar; pode ser repetida. Obrigatoria com --write.")
    args = parser.parse_args()
    targets = set(args.target or [])
    if args.write and not targets:
        parser.error("--write exige ao menos um --target.")
    if "presence" in targets and not args.include_presence:
        parser.error("--target presence exige --include-presence.")

    load_env()
    sf = Salesforce()
    metadata_students = sf.report_description(REPORT_ALUNOS)
    metadata_payments = sf.report_description(REPORT_PAGAMENTOS)
    assert_report(metadata_students, "Sync Base alunos 17h15",
                  "Opportunity.Data_de_Aprova_o__c")
    assert_report(metadata_payments, "Sync Base pagamentos 17h15",
                  "Opportunity.Data_de_Aprova_o__c")
    report_labels = allowed_enrollment_types(metadata_students)
    picklist_labels = resolve_picklist_values(
        sf, "Opportunity", "Tipo_de_Matricula__c", report_labels
    )
    allowed = set(picklist_labels)
    log(f"Filtro de matricula: {len(report_labels)} rotulos, "
        f"{len(allowed)} valores de API")

    start = date.today() - timedelta(days=LOOKBACK_DAYS)
    students = transform_students(
        opportunity_rows(sf, start), allowed, picklist_labels)
    payments = transform_payments(
        payment_rows(sf, start), allowed, picklist_labels)
    log(f"API Salesforce: {len(students)} alunos; {len(payments)} pagamentos")
    if not students or not payments:
        raise RuntimeError("Extracao vazia; abortando.")

    presence = []
    if args.include_presence:
        presence = presence_rows(sf)
        log(f"API Salesforce: {len(presence)} registros de presenca")
        if len(presence) < 1000:
            raise RuntimeError("Presenca muito abaixo do esperado; abortando.")
    diagnostic_class = os.getenv("SALESFORCE_TURMA_DIAGNOSTICO")
    if diagnostic_class:
        log_event_diagnosis(students, presence, diagnostic_class)
    diagnostic_class_id = os.getenv("SALESFORCE_CLASS_ID_DIAGNOSTICO")
    if diagnostic_class_id:
        discover_class_object(sf, diagnostic_class_id)

    sb = Supabase() if args.compare or args.write else None
    if args.compare:
        compare_with_supabase(
            sf, sb, students, payments, presence, start,
            allowed, picklist_labels)
        sb.plan_window(
            "fato_base_alunos", students, "matricula_id", "data_matricula")
        sb.plan_window(
            "fato_pagamento_base", payments, "pagamento_id", "data_aprovacao")

    if not args.write:
        log("DRY RUN concluido; nada foi gravado.")
        return

    if "students" in targets:
        sb.replace_window(
            "fato_base_alunos", students, "matricula_id", "data_matricula")
    if "payments" in targets:
        sb.replace_window(
            "fato_pagamento_base", payments, "pagamento_id", "data_aprovacao")
    if "presence" in targets:
        sb.replace_presence_stage(presence)
    now = datetime.now(timezone.utc).isoformat()
    sb.upsert("integracao_status", [{"fonte": "salesforce_api",
              "nome_exibicao": "Salesforce API (" + ",".join(sorted(targets)) + ")",
              "ultima_sync": now,
              "status": "ok", "atualizado_em": now}], "fonte")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ERRO: {exc}")
        sys.exit(1)
