"""Diagnostico somente leitura do ranking de unidades no Salesforce."""

import json
import re

from salesforce_api_sync import API_VERSION, Salesforce, load_env


DASHBOARD_ID = "01ZV2000000cOxNMAU"


def walk(value, path="root"):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}[{index}]")
    else:
        yield path, value


def main():
    load_env()
    sf = Salesforce()
    soql = """
SELECT Unidade_Geradora_Venda__r.Name, COUNT(Id), SUM(Amount)
FROM Opportunity
WHERE StageName = 'Aprovada'
  AND Data_de_Aprova_o__c >= 2026-08-01
  AND Data_de_Aprova_o__c <= 2026-08-31
GROUP BY Unidade_Geradora_Venda__r.Name
ORDER BY SUM(Amount) DESC
""".strip()
    rows = sf.query(soql)
    print("RANKING_AMOUNT " + json.dumps(rows, ensure_ascii=False))

    dashboard = sf.get(
        f"/services/data/v{API_VERSION}/analytics/dashboards/{DASHBOARD_ID}")
    refresh_fields = {
        path: value for path, value in walk(dashboard)
        if "refresh" in path.lower()
    }
    print("DASHBOARD_REFRESH " +
          json.dumps(refresh_fields, ensure_ascii=False, default=str))

    components = dashboard.get("dashboardMetadata", {}).get("components", [])
    component_data = dashboard.get("componentData", [])
    ranking_found = False
    for index, component in enumerate(components):
        texts = [str(value) for _, value in walk(component)]
        if any("ranking unidades" in value.lower() for value in texts):
            ranking_found = True
            print("RANKING_UNIDADES_COMPONENT " + json.dumps({
                "index": index,
                "metadata": component,
                "data": component_data[index] if index < len(component_data) else None,
            }, ensure_ascii=False, default=str))
    if not ranking_found:
        # Mantem os caminhos para diagnosticar eventual diferenca de estrutura
        # entre versoes da Analytics API.
        print("RANKING_UNIDADES_PATHS " + json.dumps({
            path: value for path, value in walk(dashboard)
            if "ranking unidades" in str(value).lower()
        }, ensure_ascii=False, default=str))
    report_ids = {
        str(value) for _, value in walk(dashboard)
        if isinstance(value, str) and re.fullmatch(r"00O[A-Za-z0-9]{12,15}", value)
    }
    matching_dashboard = {
        path: value for path, value in walk(dashboard)
        if "convers" in str(path).lower() or "convers" in str(value).lower()
    }
    print("DASHBOARD_CONVERSAO " +
          json.dumps(matching_dashboard, ensure_ascii=False, default=str))
    print("DASHBOARD_REPORT_IDS " + json.dumps(sorted(report_ids)))

    for report_id in sorted(report_ids):
        report = sf.get(
            f"/services/data/v{API_VERSION}/analytics/reports/{report_id}",
            {"includeDetails": "false"})
        metadata = report.get("reportMetadata", {})
        extended = report.get("reportExtendedMetadata", {})
        matches = {
            path: value for path, value in walk(extended)
            if "convers" in str(path).lower() or "convers" in str(value).lower()
               or re.search(r"(^|[^a-z])bc([^a-z]|$)", str(value).lower())
        }
        print("REPORT_DIAGNOSTIC " + json.dumps({
            "report_id": report_id,
            "name": metadata.get("name"),
            "aggregates": metadata.get("aggregates"),
            "reportFilters": metadata.get("reportFilters"),
            "standardDateFilter": metadata.get("standardDateFilter"),
            "groupingsDown": metadata.get("groupingsDown"),
            "customDetailFormula": metadata.get("customDetailFormula"),
            "customSummaryFormula": metadata.get("customSummaryFormula"),
            "matching_fields": matches,
        }, ensure_ascii=False, default=str))
        if report_id == "00OV20000099AFuMAM":
            print("REPORT_FAT_FRAN_08_FULL " + json.dumps({
                "report_id": report_id,
                "factMap": report.get("factMap"),
                "groupingsDown": report.get("groupingsDown"),
                "groupingsAcross": report.get("groupingsAcross"),
                "metadataGroupingsDown": metadata.get("groupingsDown"),
                "groupingColumnInfo": extended.get("groupingColumnInfo"),
                "aggregateColumnInfo": extended.get("aggregateColumnInfo"),
            }, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
