"""
etl/ranking_unidades_sync.py

Ranking mensal das unidades Febracis: le o componente "RANKING UNIDADES" do
dashboard do Salesforce e grava em `fato_ranking_unidades`.

POR QUE LER O DASHBOARD E NAO SOMAR O SALESFORCE

"Conversao BC" e a formula de resumo CDF2 dos relatorios, sobre
Forma_Pag_Venda__c -- nao e Opportunity.Amount. Medido em agosto/2026:

    unidade            dashboard       SUM(Amount)     erro
    Salvador 2         1.169.288,60    1.176.238,77    +0,6%
    Rio de Janeiro 2   1.067.624,20    1.176.126,66    +10%
    Porto Alegre 3       834.059,43    1.020.548,95    +22%

Por Amount, Salvador e Rio ficam separados por R$ 112. Pelo campo certo,
Salvador lidera por 100 mil. O ranking VIRA com o campo errado -- e vira de
um jeito convincente, que e o pior tipo de erro.

Reimplementar a formula exigiria ainda recriar os filtros de onze
relatorios (faturamento, backlog, ED, upgrade, canceladas) e acertar como o
dashboard os combina. O componente ja entrega isso pronto. Lemos o
resultado; nao refazemos a conta.

O DADO TEM IDADE

O dashboard responde com o ULTIMO REFRESH dele, nao com o instante da
leitura. `refresh_em` vai para o banco junto com o valor: sem isso, dado de
ontem passa por dado de agora -- erro que a carga de presenca ja custou uma
vez neste projeto. O script NAO dispara refresh: isso mexeria no dashboard
que a rede inteira olha, e nao e nossa alcada.

SO LEITURA NO SALESFORCE. Escreve unicamente em fato_ranking_unidades, que
nao pertence a nenhum outro fluxo -- fora do grupo de concorrencia
`salesforce-data-sync` e sem tocar em fato_base_alunos nem
fato_pagamento_base (handoff de 02/09/2026).

Uso:
    python etl/ranking_unidades_sync.py --diagnostico   # mostra, nao grava
    python etl/ranking_unidades_sync.py                 # grava

Variaveis de ambiente: as mesmas do salesforce_api_sync.py
(SALESFORCE_*, SUPABASE_URL, SUPABASE_SERVICE_KEY).
"""

import os
import sys
import traceback
from datetime import date, datetime

import requests

from salesforce_api_sync import API_VERSION, Salesforce, load_env

DASHBOARD_ID = os.getenv("RANKING_DASHBOARD_ID", "01ZV2000000cOxNMAU")
COMPONENTE_ID = os.getenv("RANKING_COMPONENTE_ID", "01aV2000000QRe9IAG")

# O rotulo que o agregado do componente PRECISA ter. Se o dashboard for
# reconfigurado para somar outra coluna, o script aborta em vez de gravar
# numero errado com cara de certo -- mesma disciplina do `assert_report` no
# salesforce_api_sync.py.
AGREGADO_ESPERADO = ("CDF2", "CONVERSAO BC", "CONVERSÃO BC")


def log(m):
    print(m, flush=True)


def sem_acento(t):
    return (str(t or "").upper()
            .replace("Ã", "A").replace("Á", "A").replace("Â", "A")
            .replace("É", "E").replace("Ê", "E").replace("Í", "I")
            .replace("Ó", "O").replace("Ô", "O").replace("Õ", "O")
            .replace("Ú", "U").replace("Ç", "C"))


def componente_do_ranking(dashboard):
    """Acha o componente pelo id, e falha dizendo o que existe.

    Erro silencioso aqui viraria ranking vazio gravado como se fosse um mes
    sem vendas. Melhor quebrar e mostrar os ids disponiveis.
    """
    componentes = [c for c in (dashboard.get("componentData") or []) if isinstance(c, dict)]
    for c in componentes:
        if c.get("componentId") == COMPONENTE_ID:
            return c
    ids = ", ".join(str(c.get("componentId")) for c in componentes) or "(nenhum)"
    raise RuntimeError(
        f"Componente {COMPONENTE_ID} nao esta no dashboard {DASHBOARD_ID}. "
        f"Componentes presentes: {ids}")


def confere_agregado(resultado):
    """O componente soma a coluna certa?

    Se der para ler o rotulo e ele nao for o CDF2/Conversao BC, aborta. Se
    a estrutura nao trouxer rotulo alcancavel, avisa e segue -- prefiro um
    aviso no log a um abort baseado num formato que nunca vi.
    """
    meta = resultado.get("reportExtendedMetadata") or {}
    colunas = meta.get("aggregateColumnInfo") or {}
    agregados = ((resultado.get("reportMetadata") or {}).get("aggregates")) or []
    if not agregados:
        log("  aviso: componente sem lista de agregados; nao consegui conferir o rotulo")
        return
    primeiro = agregados[0]
    rotulo = (colunas.get(primeiro) or {}).get("label") or primeiro
    if not any(alvo in sem_acento(rotulo) or alvo in sem_acento(primeiro)
               for alvo in AGREGADO_ESPERADO):
        raise RuntimeError(
            f"O componente passou a somar {rotulo!r} ({primeiro!r}), e nao a "
            f"Conversao BC. Abortando para nao gravar a coluna errada.")
    log(f"  agregado conferido: {rotulo}")


def _inicio_do_filtro(filtros, coluna):
    """Menor data de um filtro >= naquela coluna. None se nao houver."""
    datas = []
    for f in filtros:
        if not isinstance(f, dict):
            continue
        if coluna not in str(f.get("column") or ""):
            continue
        if f.get("operator") not in ("greaterOrEqual", "greaterThan"):
            continue
        valor = str(f.get("value") or "")[:10]
        try:
            datas.append(date.fromisoformat(valor))
        except ValueError:
            continue
    return min(datas) if datas else None


def mes_de_referencia(resultado, refresh_em):
    """Qual mes este ranking representa.

    NAO e o `standardDateFilter`: nele o relatorio traz CREATED_DATE de
    2022-01-01 a 2026-08-31, uma janela larga que nao recorta mes nenhum.
    Deduzir dali dava 01/2022 -- e os proprios numeros desmentiam, porque
    somando desde 2022 Salvador teria milhoes, nao 1,17 milhao.

    O mes verdadeiro esta no par de filtros sobre `DataContrato__c`:

        >= 2026-08-01T03:00:00Z   (meia-noite de 01/08 em Brasilia)
        <= 2026-09-01T02:59:00Z   (23:59 de 31/08 em Brasilia)

    Agosto exato, em horario local. Uso a borda inferior, que ja vem no dia
    1 -- e como o offset empurra para 03:00Z e nao para tras, a data em UTC
    cai no mesmo dia; nao ha virada de mes a corrigir.

    Os filtros de `Data_de_Aprova_o__c` (05/08 a 04/09, e 01/08 a 04/08) sao
    a janela COMERCIAL de aprovacao, que corre do dia 5 ao dia 4. Servem para
    o recorte do faturamento, nao como rotulo do mes -- por isso ficam de
    reserva, e so entram se o contrato nao estiver la.

    Tambem nao deduzo do nome ('Fat com Plano de Pag.Fran.08'): o nome nao
    tem ano, e a virada de dezembro viraria um bug anual silencioso.
    """
    filtros = (resultado.get("reportMetadata") or {}).get("reportFilters") or []

    d = _inicio_do_filtro(filtros, "DataContrato__c")
    if d:
        return d.replace(day=1), f"filtro DataContrato ({d.isoformat()})"

    d = _inicio_do_filtro(filtros, "Data_de_Aprova")
    if d:
        log("  aviso: sem filtro de DataContrato; usei a janela de aprovacao")
        return d.replace(day=1), f"janela de aprovacao ({d.isoformat()})"

    base = refresh_em or datetime.now()
    log("  aviso: nenhum filtro de data reconhecido; usando o mes do refresh")
    return date(base.year, base.month, 1), "mes do refresh"


def linhas_do_componente(resultado):
    """groupings -> [(unidade, chave, valor)] na ordem que o Salesforce deu.

    Caminho confirmado no diagnostico do Codex (PR #89):
      unidade = groupingsDown.groupings[n].label
      chave   = groupingsDown.groupings[n].key
      valor   = factMap["<chave>!T"].aggregates[0].value
    """
    grupos = ((resultado.get("groupingsDown") or {}).get("groupings")) or []
    fatos = resultado.get("factMap") or {}
    saida = []
    for g in grupos:
        if not isinstance(g, dict):
            continue
        chave = g.get("key")
        celula = fatos.get(f"{chave}!T") or {}
        agregados = [a for a in (celula.get("aggregates") or []) if isinstance(a, dict)]
        if not agregados:
            continue
        valor = agregados[0].get("value")
        if valor is None:
            continue
        saida.append((g.get("label"), chave, float(valor)))
    return saida


def gravar(linhas, mes, refresh_em):
    url = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    corpo = [{
        "mes": mes.isoformat(),
        "unidade": unidade,
        "unidade_chave": chave_grupo,
        "valor": valor,
        "posicao": i,
        "refresh_em": refresh_em.isoformat() if refresh_em else None,
    } for i, (unidade, chave_grupo, valor) in enumerate(linhas, start=1)]

    r = requests.post(
        f"{url}/rest/v1/fato_ranking_unidades",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}",
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates"},
        json=corpo, timeout=120)
    if not r.ok:
        raise RuntimeError(f"{r.status_code} {r.text[:400]}")
    return len(corpo)


def main(diagnostico=False):
    load_env()
    sf = Salesforce()

    dashboard = sf.get(f"/services/data/v{API_VERSION}/analytics/dashboards/{DASHBOARD_ID}")

    # O metodo da casa: antes de interpretar, mostrar o que a fonte devolveu.
    # A primeira execucao morreu num `.get` sobre None sem dizer onde, o que e
    # o mesmo erro de sempre -- escrever o mapper pelo formato que se imagina,
    # nao pelo que a API manda.
    if diagnostico:
        log(f"  forma: dashboard e {type(dashboard).__name__}")
        if isinstance(dashboard, dict):
            log(f"  chaves do topo: {sorted(dashboard.keys())}")
            cd = dashboard.get("componentData")
            log(f"  componentData e {type(cd).__name__}"
                + (f" com {len(cd)} itens" if isinstance(cd, (list, dict)) else ""))
            if isinstance(cd, list):
                for i, c in enumerate(cd[:6]):
                    if isinstance(c, dict):
                        log(f"    [{i}] componentId={c.get('componentId')} "
                            f"chaves={sorted(c.keys())}")
                    else:
                        log(f"    [{i}] {type(c).__name__}: {str(c)[:120]}")
            elif isinstance(cd, dict):
                log(f"    chaves: {sorted(cd.keys())[:10]}")

    componente = componente_do_ranking(dashboard)
    resultado = componente.get("reportResult") or {}

    bruto = (componente.get("status") or {}).get("refreshDate") or dashboard.get("refreshDate")
    refresh_em = None
    if bruto:
        try:
            refresh_em = datetime.fromisoformat(str(bruto).replace("Z", "+00:00"))
        except ValueError:
            log(f"  aviso: refreshDate ilegivel ({bruto!r})")

    confere_agregado(resultado)

    # O `standardDateFilter` veio 2022-01-01 e o mes saiu 01/2022 -- errado:
    # se o relatorio somasse desde 2022, Salvador teria milhoes acumulados, e
    # nao 1,17 milhao. O recorte do mes esta em outro filtro. Aqui mostro os
    # filtros crus para descobrir QUAL, em vez de deduzir do nome do
    # relatorio (que nao tem ano e quebraria na virada de dezembro).
    if diagnostico:
        rm = resultado.get("reportMetadata") or {}
        log(f"  relatorio: {rm.get('name')!r} (id {rm.get('id')})")
        log(f"  standardDateFilter: {rm.get('standardDateFilter')}")
        for f in (rm.get("reportFilters") or []):
            log(f"  reportFilter: {f}")
        log(f"  reportBooleanFilter: {rm.get('reportBooleanFilter')}")

    mes, origem_do_mes = mes_de_referencia(resultado, refresh_em)
    linhas = linhas_do_componente(resultado)

    log(f"ranking: {len(linhas)} unidades · mes {mes:%m/%Y} ({origem_do_mes})")
    log(f"         dashboard atualizado em {refresh_em or '(desconhecido)'}")

    # A virada do mes e o momento perigoso: relatorio de agosto ainda no ar
    # em setembro faria o agente narrar a corrida do mes passado como se
    # fosse a de agora.
    hoje = date.today().replace(day=1)
    if mes != hoje:
        log(f"         ATENCAO: o ranking e de {mes:%m/%Y}, e estamos em {hoje:%m/%Y}. "
            f"O dashboard pode nao ter virado o mes.")

    if not linhas:
        raise RuntimeError("Componente devolveu zero unidades; nao vou gravar mes vazio.")

    # Rotulo de mes errado e pior que carga que falha: entra em silencio e so
    # aparece meses depois, quando o agente comparar meses que nao existem.
    # Se o mes derivado esta longe do refresh, e porque a deducao furou.
    if refresh_em is not None:
        distancia = (refresh_em.year - mes.year) * 12 + (refresh_em.month - mes.month)
        if not diagnostico and not (0 <= distancia <= 2):
            raise RuntimeError(
                f"Mes derivado ({mes:%m/%Y}) esta a {distancia} meses do refresh "
                f"({refresh_em:%m/%Y}). Nao vou gravar com rotulo em que nao confio.")

    for i, (unidade, _, valor) in enumerate(linhas, start=1):
        log(f"  {i:2}. {unidade:<32} {valor:>14,.2f}")

    if diagnostico:
        log("ranking: DIAGNOSTICO — nada foi gravado.")
        return

    n = gravar(linhas, mes, refresh_em)
    log(f"ranking: {n} linhas gravadas em fato_ranking_unidades")


if __name__ == "__main__":
    try:
        main(diagnostico="--diagnostico" in sys.argv)
    except Exception as e:
        # RuntimeError aqui e trava nossa, com mensagem escrita para ser lida.
        # Qualquer outra coisa e defeito de codigo, e ai o traceback importa
        # mais que a frase -- a primeira execucao falhou com
        # "'NoneType' object has no attribute 'get'" e nao disse a linha.
        log(f"ERRO: {e}")
        if not isinstance(e, RuntimeError):
            traceback.print_exc()
        sys.exit(1)
