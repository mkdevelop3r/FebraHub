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
from datetime import date, datetime, timedelta

import requests

from salesforce_api_sync import API_VERSION, Salesforce, load_env

# O corporativo cria UM DASHBOARD POR MES, nomeado assim:
#
#   FATURAMENTO FRANQUIAS + ED AGOSTO_2026
#   FATURAMENTO FRANQUIAS + ED JULHO_2026
#
# Por isso o id nao pode ser fixo: em setembro nasce outro, com outro id, e um
# script preso ao de agosto leria o mes errado para sempre -- sem erro nenhum,
# que e a pior forma de errar. Procuramos pelo NOME do mes esperado.
#
# As duas variaveis abaixo existem para PINAR um dashboard especifico (refazer
# um mes antigo, por exemplo). Vazias, o script descobre sozinho.
DASHBOARD_ID = os.getenv("RANKING_DASHBOARD_ID", "")
COMPONENTE_ID = os.getenv("RANKING_COMPONENTE_ID", "")

PADRAO_DASHBOARD = "FATURAMENTO FRANQUIAS"
MESES_PT = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO",
            "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]

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


def nome_esperado(mes):
    """date(2026,8,1) -> 'AGOSTO_2026', o sufixo que nomeia o dashboard do mes."""
    return f"{MESES_PT[mes.month - 1]}_{mes.year}"


def achar_dashboard(sf, mes):
    """Descobre o id do dashboard do mes pelo nome.

    Falha ALTO quando nao acha ou acha mais de um: ler o dashboard errado
    produz um ranking plausivel do mes errado, e isso ninguem percebe.
    """
    if DASHBOARD_ID:
        log(f"  dashboard pinado por variavel de ambiente: {DASHBOARD_ID}")
        return DASHBOARD_ID

    dados = sf.get(f"/services/data/v{API_VERSION}/analytics/dashboards")
    lista = (dados.get("dashboards") if isinstance(dados, dict) else dados) or []
    alvo = nome_esperado(mes)

    achados = []
    for d in lista:
        if not isinstance(d, dict):
            continue
        nome = sem_acento(d.get("name") or d.get("label") or "")
        if PADRAO_DASHBOARD in nome and alvo in nome.replace(" ", "_"):
            achados.append((d.get("id"), d.get("name")))

    if len(achados) == 1:
        log(f"  dashboard de {mes:%m/%Y}: {achados[0][1]!r} ({achados[0][0]})")
        return achados[0][0]

    if len(achados) > 1:
        raise RuntimeError(
            f"Mais de um dashboard casa com {mes:%m/%Y}: {achados}. "
            f"Pine o certo com RANKING_DASHBOARD_ID.")

    # O do mes esperado ainda nao existe. Isso e NORMAL nos primeiros dias:
    # o corporativo publica o dashboard novo quando publica. Cair em vermelho
    # todo dia ate la seria alarme falso -- e alarme falso diario ensina a
    # ignorar o alarme.
    #
    # Entao usamos o mais recente que existir. Os dados dele continuam
    # legitimos (o mes anterior ainda recebe lancamento), o mes gravado sai
    # certo porque vem do filtro de DataContrato, e a trava de mes atrasado
    # decide se ja e hora de gritar.
    disponiveis = []
    for d in lista:
        if not isinstance(d, dict):
            continue
        nome = sem_acento(d.get("name") or d.get("label") or "")
        if PADRAO_DASHBOARD not in nome:
            continue
        chave = nome.replace(" ", "_")
        for i, m in enumerate(MESES_PT, start=1):
            for ano in range(mes.year - 1, mes.year + 2):
                if f"{m}_{ano}" in chave:
                    disponiveis.append((date(ano, i, 1), d.get("id"), d.get("name")))

    if disponiveis:
        disponiveis.sort(reverse=True)
        quando, ident, nome = disponiveis[0]
        log(f"  aviso: nao ha dashboard de {mes:%m/%Y}; usando o mais recente, "
            f"{nome!r} ({quando:%m/%Y})")
        return ident

    parecidos = sorted({str(d.get("name")) for d in lista if isinstance(d, dict)
                        and PADRAO_DASHBOARD in sem_acento(d.get("name") or "")})[:8]
    raise RuntimeError(
        f"Nao achei nenhum dashboard {PADRAO_DASHBOARD!r} com mes no nome. "
        f"Parecidos: {parecidos or '(nenhum)'}. Se o corporativo mudou o padrao, "
        f"ajuste PADRAO_DASHBOARD ou pine com RANKING_DASHBOARD_ID.")


def rotulo_do_agregado(resultado):
    """Rotulo da primeira coluna somada, ou None se nao der para ler."""
    colunas = ((resultado.get("reportExtendedMetadata") or {})
               .get("aggregateColumnInfo")) or {}
    agregados = ((resultado.get("reportMetadata") or {}).get("aggregates")) or []
    if not agregados:
        return None
    return (colunas.get(agregados[0]) or {}).get("label") or agregados[0]


def componente_do_ranking(dashboard):
    """Acha o componente pelo id, e falha dizendo o que existe.

    Erro silencioso aqui viraria ranking vazio gravado como se fosse um mes
    sem vendas. Melhor quebrar e mostrar os ids disponiveis.
    """
    componentes = [c for c in (dashboard.get("componentData") or []) if isinstance(c, dict)]

    if COMPONENTE_ID:
        for c in componentes:
            if c.get("componentId") == COMPONENTE_ID:
                return c
        ids = ", ".join(str(c.get("componentId")) for c in componentes) or "(nenhum)"
        raise RuntimeError(f"Componente pinado {COMPONENTE_ID} nao esta neste "
                           f"dashboard. Componentes presentes: {ids}")

    # Sem pino: acha pelo CONTEUDO. O id do componente muda junto com o
    # dashboard todo mes, entao procurar por id fixo teria a mesma doenca que
    # procurar o dashboard por id fixo. A assinatura do painel certo e somar
    # Conversao BC (CDF2) agrupando por unidade.
    candidatos = []
    for c in componentes:
        resultado = c.get("reportResult") or {}
        rotulo = rotulo_do_agregado(resultado)
        if not rotulo:
            continue
        if not any(alvo in sem_acento(rotulo) for alvo in AGREGADO_ESPERADO):
            continue
        grupos = ((resultado.get("groupingsDown") or {}).get("groupings")) or []
        # Ranking de unidade tem dezenas de linhas comecando por FEBRACIS. Um
        # painel de total geral, ou agrupado por outra coisa, nao tem.
        unidades = sum(1 for g in grupos if isinstance(g, dict)
                       and "FEBRACIS" in sem_acento(g.get("label")))
        if unidades >= 5:
            candidatos.append((unidades, c, rotulo))

    if not candidatos:
        resumo = [f"{c.get('componentId')}={rotulo_do_agregado(c.get('reportResult') or {})!r}"
                  for c in componentes]
        raise RuntimeError(
            "Nenhum componente deste dashboard soma Conversao BC agrupado por "
            f"unidade. Componentes: {resumo}")

    # O de mais unidades e o ranking; os outros painels com CDF2 sao recortes.
    candidatos.sort(key=lambda t: t[0], reverse=True)
    n_unidades, escolhido, rotulo = candidatos[0]
    log(f"  componente do ranking: {escolhido.get('componentId')} "
        f"({rotulo}, {n_unidades} unidades)")
    return escolhido


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


def mes_esperado(hoje=None):
    """Qual mes o dashboard deveria estar mostrando agora.

    A janela comercial vai do dia 5 ao dia 4 do mes seguinte -- esta nos
    filtros do relatorio (aprovacao de 05/08 a 04/09). Ate o dia 4, o
    relatorio corrente ainda e o do mes anterior.
    """
    hoje = hoje or date.today()
    if hoje.day >= 5:
        return hoje.replace(day=1)
    return (hoje.replace(day=1) - timedelta(days=1)).replace(day=1)


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
    # `dia` entra explicito (migration 178): a chave e (mes, unidade, dia), e
    # e ele que preserva a serie. Deixar no default do banco funcionaria, mas
    # amarra a data ao relogio do Postgres em vez do da execucao -- e uma
    # rodada que vira a meia-noite gravaria dois dias diferentes no mesmo lote.
    hoje = date.today().isoformat()
    corpo = [{
        "mes": mes.isoformat(),
        "unidade": unidade,
        "dia": hoje,
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

    alvo = mes_esperado()
    dash_id = achar_dashboard(sf, alvo)
    dashboard = sf.get(f"/services/data/v{API_VERSION}/analytics/dashboards/{dash_id}")

    # O metodo da casa: antes de interpretar, mostrar o que a fonte devolveu.
    # A primeira execucao morreu num `.get` sobre None sem dizer onde, o que e
    # o mesmo erro de sempre -- escrever o mapper pelo formato que se imagina,
    # nao pelo que a API manda.
    if diagnostico:
        log(f"  forma: dashboard {dash_id} e {type(dashboard).__name__}")
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

    # A virada do mes e o momento perigoso: relatorio do mes passado ainda no
    # ar faria o agente narrar a corrida errada como se fosse a de agora.
    #
    # Mas "mes passado" aqui nao e o do calendario. Os filtros mostram que a
    # janela comercial corre do DIA 5 AO DIA 4 (aprovacao de 05/08 a 04/09),
    # entao o relatorio de agosto continua sendo o corrente ate 04/09. Comparar
    # com o mes do calendario faria o aviso gritar nos primeiros quatro dias de
    # todo mes -- e aviso que grita a toa e aviso que se aprende a ignorar.
    esperado = mes_esperado()
    mes_atrasado = mes != esperado

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

    if mes_atrasado:
        log(f"         ATENCAO: o ranking e de {mes:%m/%Y}, e o esperado hoje era "
            f"{esperado:%m/%Y}. O dashboard pode nao ter virado o mes.")

    if diagnostico:
        log("ranking: DIAGNOSTICO — nada foi gravado.")
        return

    n = gravar(linhas, mes, refresh_em)
    log(f"ranking: {n} linhas gravadas em fato_ranking_unidades")

    # Grava ANTES de reclamar: se o dashboard nao virou, os numeros do mes
    # anterior ainda sao legitimos (a janela comercial deixa agosto se mexer
    # ate 04/09) e nao ha razao para descartar a atualizacao.
    #
    # Mas depois de gravar, MORRE EM VERMELHO. Se o corporativo criar um
    # dashboard novo para o mes seguinte, o nosso id fica velho e este script
    # regravaria o mesmo mes todo dia, para sempre, sem erro nenhum -- a falha
    # mais perigosa que existe aqui, porque parece sucesso. Aviso em log
    # ninguem le; execucao vermelha o GitHub notifica.
    if mes_atrasado:
        raise RuntimeError(
            f"O dashboard ainda mostra {mes:%m/%Y}, e o esperado hoje era "
            f"{esperado:%m/%Y}. Os dados de {mes:%m/%Y} foram atualizados, mas o "
            f"mes novo NAO esta chegando: o dashboard {dash_id} foi encontrado "
            f"pelo nome do mes esperado, entao os FILTROS dele e que devem estar "
            f"atrasados. Confira com o corporativo.")


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
