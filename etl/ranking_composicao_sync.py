"""
etl/ranking_composicao_sync.py

Como cada franquia vende: origem do lead, mix de curso e tipo de matricula,
por unidade e por mes. Grava em `fato_unidade_composicao` (migration 177).

O ranking (ranking_unidades_sync.py) diz QUEM esta ganhando. Este diz COMO --
e foi o `ranking_insight_diagnostico.py` que provou que da para saber:
LeadSource esta 100% preenchido em todas as unidades e separa estrategias
opostas dentro da mesma corrida.

A METRICA AQUI NAO E A DO RANKING

`total` e SUM(Opportunity.Amount). A Conversao BC do ranking e a formula CDF2
sobre Forma_Pag_Venda__c, que so o dashboard calcula. Os dois NAO batem e
nunca devem ser somados nem comparados. Esta tabela responde PROPORCAO --
que fatia do que a unidade vendeu veio de onde. Valor absoluto, olhe o
ranking.

O RECORTE E O MESMO DO RANKING, DE PROPOSITO

Canal_Venda = 'Franquias' e os mesmos estagios. Sem o filtro de canal, o topo
por Amount vinha com CIS TREINAMENTO, FEBRACIS SISTEMAS e outras entidades
corporativas que nao disputam o ranking -- e elas empurravam as franquias de
verdade para fora da lista.

SO LEITURA NO SALESFORCE. Escreve so em fato_unidade_composicao, fora do
grupo de concorrencia `salesforce-data-sync`.

Uso:
    python etl/ranking_composicao_sync.py --diagnostico   # mostra, nao grava
    python etl/ranking_composicao_sync.py                 # grava
    python etl/ranking_composicao_sync.py --mes 2026-07
"""

import os
import sys
import traceback
from collections import defaultdict
from datetime import date

import requests

from salesforce_api_sync import API_VERSION, Salesforce, load_env
from ranking_unidades_sync import mes_esperado

# Estagios do ranking, para o recorte ficar comparavel com ele.
ESTAGIOS = ("Aprovada", "Aprovada Parcial", "Pag. Parcial")

# As dimensoes que o diagnostico validou. A chave e o que vai para a coluna
# `dimensao`; o valor, o campo do Salesforce.
DIMENSOES = {
    "origem": "LeadSource",
    "curso": "NomeCurso__r.Name",
    # `Tipo_de_Matricula__c` e PICKLIST, nao lookup: `Tipo_de_Matricula__r`
    # devolve "Didn't understand relationship". Os valores crus sao numeros
    # (1, 27, 120) e o rotulo vem do describe do objeto -- ver `rotulos_picklist`.
    "tipo": "Tipo_de_Matricula__c",
}

# Dimensoes cujo valor cru precisa ser traduzido: {dimensao: (objeto, campo)}
PICKLISTS = {"tipo": ("Opportunity", "Tipo_de_Matricula__c")}


def log(m):
    print(m, flush=True)


def fim_do_mes(mes):
    return (date(mes.year + (mes.month // 12), (mes.month % 12) + 1, 1)
            - (date(1, 1, 2) - date(1, 1, 1)))


def consultar(sf, soql):
    """SOQL com o CORPO do erro quando falha.

    `Salesforce.query` usa raise_for_status(), que descarta a resposta -- e e
    ali que o Salesforce diz o que ha de errado. Um 400 sem corpo vira chute.
    """
    r = requests.get(f"{sf.instance}/services/data/v{API_VERSION}/query",
                     headers=sf.headers, params={"q": soql}, timeout=120)
    if not r.ok:
        raise RuntimeError(f"{r.status_code} {r.text[:600]}\n  SOQL: {soql}")
    return (r.json() or {}).get("records", [])


def agrupar(sf, mes, campo):
    """SUM(Amount) e COUNT por (unidade, campo) no mes, so franquias.

    APELIDAR OS DOIS CAMPOS E OBRIGATORIO: sem alias, `Unidade..._r.Name` e
    `NomeCurso__r.Name` colidem e o Salesforce responde "duplicate alias:
    Name".

    O LIMIT existe porque consulta agregada nao pagina -- passar de 2000
    grupos devolve EXCEEDED_ID_LIMIT.
    """
    ini, fim = mes.isoformat(), fim_do_mes(mes).isoformat()
    estagios = ", ".join(f"'{e}'" for e in ESTAGIOS)
    soql = (
        f"SELECT Unidade_Geradora_Venda__r.Name unidade, {campo} valor, "
        f"COUNT(Id) qtd, SUM(Amount) total "
        f"FROM Opportunity "
        f"WHERE StageName IN ({estagios}) "
        f"AND Canal_Venda__c = 'Franquias' "
        f"AND Data_de_Aprova_o__c >= {ini} AND Data_de_Aprova_o__c <= {fim} "
        f"GROUP BY Unidade_Geradora_Venda__r.Name, {campo} "
        f"LIMIT 2000"
    )
    return consultar(sf, soql)


def rotulos_picklist(sf, objeto, campo):
    """{valor cru: rotulo} de um campo picklist.

    Sem isto, o mix de matricula chega como 1, 27 e 120 -- numeros que nao
    dizem nada a quem abre a tela. O describe do objeto e a unica fonte do
    rotulo; nao ha objeto relacionado para consultar.
    """
    dados = sf.get(f"/services/data/v{API_VERSION}/sobjects/{objeto}/describe")
    for f in (dados.get("fields") or []):
        if f.get("name") != campo:
            continue
        valores = f.get("picklistValues") or []
        if not valores:
            log(f"  aviso: {campo} nao tem picklistValues; fica com o valor cru")
        return {str(v.get("value")): (v.get("label") or v.get("value"))
                for v in valores}
    log(f"  aviso: campo {campo} nao encontrado no describe de {objeto}")
    return {}


def coletar(sf, mes):
    """Uma linha por (unidade, dimensao, valor). Dimensao que falha nao
    derruba as outras -- perder o mix de curso nao pode custar a origem."""
    linhas, falhas = [], []
    for dimensao, campo in DIMENSOES.items():
        try:
            registros = agrupar(sf, mes, campo)
        except Exception as e:
            falhas.append(f"{dimensao} ({campo}): {e}")
            continue

        traducao = {}
        if dimensao in PICKLISTS:
            try:
                traducao = rotulos_picklist(sf, *PICKLISTS[dimensao])
            except Exception as e:
                log(f"  aviso: nao consegui traduzir {dimensao}: {e}")

        n = 0
        for r in registros:
            unidade = r.get("unidade")
            if not unidade:
                continue          # venda sem unidade nao pertence a ninguem
            bruto = r.get("valor")
            rotulo = traducao.get(str(bruto), bruto) if traducao else bruto
            linhas.append({
                "mes": mes.isoformat(),
                "unidade": unidade,
                "dimensao": dimensao,
                "valor": (rotulo or "(sem informacao)")[:200],
                "qtd": int(r.get("qtd") or 0),
                "total": float(r.get("total") or 0),
            })
            n += 1
        log(f"  {dimensao}: {n} combinacoes")
    return linhas, falhas


def gravar(linhas):
    url = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    gravadas = 0
    # Em lotes: uma unica requisicao com milhares de linhas estoura o limite
    # de payload do PostgREST.
    for i in range(0, len(linhas), 500):
        lote = linhas[i:i + 500]
        r = requests.post(
            f"{url}/rest/v1/fato_unidade_composicao",
            headers={"apikey": chave, "Authorization": f"Bearer {chave}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates"},
            json=lote, timeout=120)
        if not r.ok:
            raise RuntimeError(f"{r.status_code} {r.text[:400]}")
        gravadas += len(lote)
    return gravadas


def main(diagnostico=False):
    load_env()
    sf = Salesforce()

    mes = mes_esperado()
    if "--mes" in sys.argv:
        mes = date.fromisoformat(sys.argv[sys.argv.index("--mes") + 1] + "-01")

    log(f"composicao: {mes:%m/%Y}")
    linhas, falhas = coletar(sf, mes)

    for f in falhas:
        log(f"  FALHOU {f}")

    if not linhas:
        raise RuntimeError("Nenhuma dimensao respondeu; nao vou gravar mes vazio.")

    unidades = len({l["unidade"] for l in linhas})
    log(f"composicao: {len(linhas)} linhas, {unidades} unidades")

    # Uma amostra no log: carga que so diz "ok" nao deixa ninguem perceber
    # quando o conteudo muda de forma.
    amostra = sorted([l for l in linhas if l["dimensao"] == "origem"],
                     key=lambda l: l["total"], reverse=True)[:5]
    for l in amostra:
        log(f"    {l['unidade'][:28]:<28} {l['valor'][:28]:<28} "
            f"{l['qtd']:5d} vendas")

    if diagnostico:
        log("composicao: DIAGNOSTICO — nada foi gravado.")
        return

    n = gravar(linhas)
    log(f"composicao: {n} linhas gravadas em fato_unidade_composicao")

    # Uma dimensao que sumiu e sinal de campo renomeado no Salesforce. Grava o
    # que veio (o resto e legitimo) e morre em vermelho para alguem olhar.
    if falhas:
        raise RuntimeError(f"{len(falhas)} dimensao(oes) falharam: {falhas}")


if __name__ == "__main__":
    try:
        main(diagnostico="--diagnostico" in sys.argv)
    except Exception as e:
        log(f"ERRO: {e}")
        if not isinstance(e, RuntimeError):
            traceback.print_exc()
        sys.exit(1)
