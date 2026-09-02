"""
etl/ranking_insight_diagnostico.py

SOMENTE LEITURA. Nao grava nada, em lugar nenhum.

O ranking diz QUEM esta ganhando. Este diagnostico procura O QUE as outras
unidades estao fazendo -- que e a pergunta que originou o monitor.

Tres dimensoes, todas por unidade, no ultimo mes:

  curso        o que cada uma vende
  origem       como trazem gente (LeadSource / UltimaOrigemLead__c)
  ticket       volume x preco medio

POR QUE ISTO E UM DIAGNOSTICO E NAO UM ETL

Nao sei quanto desses campos esta preenchido FORA de Salvador. `LeadSource`
pode ser disciplina que so existe aqui, e nesse caso um painel de "origem por
unidade" seria bonito e vazio. Entao primeiro medimos a cobertura, depois
decidimos o que vale guardar. E a regra do README: rodar o diagnostico antes
de escrever o mapper.

CUIDADO COM A METRICA

Aqui somamos `Opportunity.Amount`, que NAO e a Conversao BC do ranking (essa
e a formula CDF2 sobre Forma_Pag_Venda__c, e so o dashboard calcula). Os
numeros deste script servem para ler PROPORCAO -- que fatia do que a unidade
vendeu foi de tal curso, veio de tal origem. Nao servem para comparar valor
com o ranking, e nunca devem aparecer lado a lado com ele sem essa ressalva.

Uso:
    python etl/ranking_insight_diagnostico.py
    python etl/ranking_insight_diagnostico.py --mes 2026-07
"""

import sys
from collections import defaultdict
from datetime import date

import requests

from salesforce_api_sync import API_VERSION, Salesforce, load_env
from ranking_unidades_sync import mes_esperado, sem_acento

# Quantas unidades detalhar. As de cima mais Salvador -- ler as 42 nao ajuda
# ninguem, e a pergunta e sobre quem esta na disputa.
TOPO = 8
CASA = "SALVADOR"

# Estagios do ranking, para o recorte ficar comparavel com ele.
ESTAGIOS = ("Aprovada", "Aprovada Parcial", "Pag. Parcial")


def log(m):
    print(m, flush=True)


def fim_do_mes(mes):
    return (date(mes.year + (mes.month // 12), (mes.month % 12) + 1, 1)
            - (date(1, 1, 2) - date(1, 1, 1)))


def consultar(sf, soql):
    """SOQL com o CORPO do erro quando falha.

    `Salesforce.query` usa raise_for_status(), que descarta a resposta -- e e
    justamente ali que o Salesforce diz o que ha de errado com a consulta.
    Um 400 sem corpo vira chute; com corpo, vira conserto. Mesma licao que o
    pedagogico_mensagens.py ja carrega no `erro_com_corpo`.
    """
    r = requests.get(f"{sf.instance}/services/data/v{API_VERSION}/query",
                     headers=sf.headers, params={"q": soql}, timeout=120)
    if not r.ok:
        raise RuntimeError(f"{r.status_code} {r.text[:600]}\n  SOQL: {soql}")
    dados = r.json()
    registros = dados.get("records", [])
    return registros


def agrupar(sf, mes, campo):
    """SUM(Amount) e COUNT por (unidade, campo) no mes.

    APELIDAR OS DOIS CAMPOS E OBRIGATORIO. Sem alias, `Unidade..._r.Name` e
    `NomeCurso__r.Name` colidem e o Salesforce responde
    "duplicate alias: Name" -- foi o 400 da primeira rodada.

    CANAL = FRANQUIAS delimita o mesmo universo do ranking. Sem esse filtro, a
    consulta trouxe CIS TREINAMENTO, FEBRACIS SISTEMAS, FEBRACIS EMPREENDEDOR
    DIGITAL e CIS PERSONALISSIMO no topo -- entidades corporativas, que nao
    disputam o ranking. Comparar Salvador com elas nao responde nada, e ainda
    empurrava as franquias de verdade para fora da lista.

    O LIMIT existe porque consulta agregada nao pagina: passar de 2000 grupos
    devolve EXCEEDED_ID_LIMIT, que foi o que derrubou UltimaOrigemLead__c.
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


def resumo(sf, mes, campo, rotulo, top_n=5):
    linhas = agrupar(sf, mes, campo)
    por_unidade = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    total_unidade = defaultdict(float)
    vazio_unidade = defaultdict(float)

    for l in linhas:
        unidade = l.get("unidade") or "(sem unidade)"
        valor = l.get("valor")
        qtd = int(l.get("qtd") or 0)
        total = float(l.get("total") or 0)
        alvo = por_unidade[unidade][valor or "(vazio)"]
        alvo[0] += qtd
        alvo[1] += total
        total_unidade[unidade] += total
        if not valor:
            vazio_unidade[unidade] += total

    ordem = sorted(total_unidade, key=total_unidade.get, reverse=True)
    interesse = ordem[:TOPO]
    for u in ordem:
        if CASA in sem_acento(u) and u not in interesse:
            interesse.append(u)

    log(f"\n===== {rotulo} =====")
    for u in interesse:
        tot = total_unidade[u] or 1
        cobertura = 100 * (1 - vazio_unidade[u] / tot)
        log(f"\n{u}   (preenchimento: {cobertura:.0f}%)")
        itens = sorted(por_unidade[u].items(), key=lambda kv: kv[1][1], reverse=True)
        for valor, (qtd, total) in itens[:top_n]:
            log(f"   {100 * total / tot:5.1f}%  {qtd:4d} vendas  {valor}")


def main():
    load_env()
    sf = Salesforce()

    mes = mes_esperado()
    if "--mes" in sys.argv:
        bruto = sys.argv[sys.argv.index("--mes") + 1]
        mes = date.fromisoformat(bruto + "-01")

    log(f"Diagnostico de insight — {mes:%m/%Y}")
    log("Metrica: SUM(Opportunity.Amount). NAO e a Conversao BC do ranking;")
    log("serve para ler proporcao, nao para comparar valor com o ranking.")

    # Uma dimensao que falha nao pode levar as outras junto: o objetivo da
    # rodada e descobrir QUAIS servem, e morrer na primeira nos daria um
    # veredicto por execucao.
    dimensoes = [
        ("NomeCurso__r.Name", "O QUE VENDEM (mix de curso)"),
        ("LeadSource", "COMO TRAZEM GENTE (origem do lead)"),
        ("UltimaOrigemLead__c", "COMO TRAZEM GENTE (ultima origem)"),
        # Tipo_de_Matricula__c devolveu id (1, 27, 120), nao rotulo. O nome
        # esta no objeto relacionado.
        ("Tipo_de_Matricula__r.Name", "MIX DE MATRICULA"),
    ]
    for campo, rotulo in dimensoes:
        try:
            resumo(sf, mes, campo, rotulo)
        except Exception as e:
            log(f"\n===== {rotulo} =====")
            log(f"  FALHOU em {campo}: {e}")

    log("\nNada foi gravado.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ERRO: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
