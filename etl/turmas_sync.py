# -*- coding: utf-8 -*-
"""Sincroniza o calendario de turmas do Salesforce para dim_turmas.

POR QUE ESTE ARQUIVO EXISTE

`dim_turmas` era mantida a mao, por carga de relatorio. Em 04/09/2026 as 234
linhas tinham `sincronizado_em` NULO, e a IF37 -- cancelada -- ainda constava
como aberta, sustentando R$ 38.649 da meta de outubro. O calendario e a base
de metodo da meta da Loja e da fila de represados do Pedagogico; enquanto for
manual, os dois herdam a idade do ultimo relatorio.

AS QUATRO ARMADILHAS, todas conferidas contra a producao em 04/09/2026.
Estao no cabecalho de db/187 tambem, porque quem mexe numa raramente le a
outra.

1. O NOME DA TURMA NAO IDENTIFICA A TURMA. "2026 - CIS-GL252" existe umas 40
   vezes no Salesforce, uma por unidade, e `Unidade__c`, `Cidade__c` e
   `Local__c` sao NULOS -- inclusive nas nossas. Filtrar por unidade devolve 3
   turmas, todas com data de 2039.

   SAO DUAS PORTAS, e cada uma responde a uma pergunta diferente:

   a) O DONO. `Turma__c.OwnerId` da turma nossa e o usuario
      PEDAGOGICO FEBRACIS BAHIA. Sao as turmas que ESTA unidade REALIZA --
      inclusive as que ainda nao venderam nada. E a porta do CALENDARIO, e a
      que a meta da Loja precisa.

   b) A VENDA. Opportunity com `Unidade_Geradora_Venda__r.Name = UNIDADE`
      devolve turmas em que NOSSOS ALUNOS estao, inclusive realizadas em outra
      cidade (Goiania, Sao Paulo). E a porta do PEDAGOGICO.

   As duas juntas, sem repetir. Medido em 04/09 na janela de 400 dias: 92 pelo
   dono, 174 pela venda, 188 na uniao -- e 14 turmas NOSSAS que so a venda nao
   acharia (BHPPV-GL, LLPASS001, IAPN-ON01, CI010 DM, TCBRF, LIVRAOMCIS001,
   CIS-GL255 e outras). So a venda acha as de fora, que o Pedagogico precisa.

   Conferido: para outubro a uniao devolve exatamente as quatro turmas que a
   meta ja usava -- IF37, CIS-GL252, TV09 e BHP26 -- com as mesmas datas.

   Antes de achar o dono eu usava so a venda, e a consequencia era feia: turma
   futura sem nenhuma venda ainda era INVISIVEL -- exatamente a turma sobre a
   qual a meta mais precisa saber, porque e a que ainda vai encher a loja.

2. AS DATAS SAO DATETIME EM UTC. `Data_Final__c` da IF37 e
   2026-10-12T02:59:59Z, que em America/Bahia e 11/10 23:59:59. Cortar a
   string em 10 caracteres -- o obvio -- inventaria um quarto dia de IF e
   somaria R$ 12.883 a meta. Com a conversao, as datas batem exatamente com o
   que ja estava gravado nas quatro turmas de outubro.

3. IDs TEM 15 OU 18 CARACTERES. `dim_turmas.sf_turma_id` guarda 15; a API
   devolve 18. Comparar sem normalizar nao da erro: da INSERT em vez de
   UPDATE, e a tabela ganha uma copia de cada turma.

4. O SALESFORCE NAO SABE DE TUDO. A IF37 esta la como 'Aberta', com
   LastModifiedDate de 24/07 -- o cancelamento de 04/09 nunca foi lancado.
   Por isso este script NUNCA escreve `status` de linha existente. O que o
   Salesforce acha vai para `status_sf`, ao lado, e a discordancia aparece em
   `vw_turma_divergencia`.

5. NEM TODA TURMA NOSSA ACONTECE AQUI. Pela porta da venda vem o que a unidade
   vendeu para turma realizada em outra cidade -- `2026 - CIS252 - Goiania`,
   `2026 - PB001 - Sao Paulo`. Sao 12 curtas so em 2026. Certo para o
   Pedagogico (o aluno e nosso), errado para a meta da Loja (o predio nao
   enche).

   `acontece_aqui` = O DONO E O NOSSO PEDAGOGICO. Nao e chute de nome: e o
   mesmo campo da porta (a). Conferido -- `2026 - TCE01 - TOUR PV SALVADOR`
   tem sufixo de cidade e sai como NOSSO; Feira de Santana, Belo Horizonte e
   Curitiba saem como de outro dono. Uma heuristica de nome precisaria de uma
   excecao para SALVADOR; o campo nao precisa de excecao nenhuma.

   O sync escreve `acontece_aqui` na PRIMEIRA vez que toca a linha
   (`sincronizado_em` nulo), para substituir o chute inicial da db/187 pelo
   dado real. Depois disso a coluna e da pessoa e ele nao encosta mais.

6. O SALESFORCE TEM LINHA DE MENTIRA. GREEN BELT, GOLDEN BELT e COMBO tem data
   2039-08-16 a 2040-08-16 e aparecem TRES vezes cada, com Ids diferentes e o
   mesmo nome. Sao registros-modelo, nao turmas. Duas defesas: data absurda
   nao entra, e nome repetido dentro do mesmo lote nao entra -- o upsert do
   PostgREST falha quando a mesma chave aparece duas vezes na carga.

MODO PADRAO E DIAGNOSTICO. Sem `--aplicar` nada e gravado. Isso e deliberado:
a primeira execucao de um sync sobre uma tabela mantida a mao tem que ser lida
por uma pessoa antes de escrever.
"""

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from salesforce_api_sync import (  # noqa: E402
    Salesforce, Supabase, canonical_salesforce_id, load_env, log)

# America/Bahia nao tem horario de verao desde 2012, entao o deslocamento fixo
# e correto e evita depender de tzdata no runner do GitHub Actions.
BAHIA = timezone(timedelta(hours=-3))

UNIDADE = os.getenv("SALESFORCE_UNIDADE", "FEBRACIS SALVADOR 2")

# Colunas que o Salesforce manda. Tudo que NAO esta aqui e da pessoa e nao e
# tocado em linha existente -- ver os comentarios de coluna em db/187.
COLUNAS_DO_SALESFORCE = ("curso", "data_inicio", "data_fim", "capacidade",
                         "status_sf", "sf_modificado_em", "sf_turma_id")

# Depois disto nao e calendario, e registro-modelo. Ver armadilha 6.
ANOS_DE_HORIZONTE = 3

# O usuario dono das turmas que ESTA unidade realiza. Resolvido por username e
# nao por Id fixo: Id de usuario nao diz nada a quem le, e um dia alguem troca.
PEDAGOGICO_USERNAME = os.getenv(
    "SALESFORCE_PEDAGOGICO_USERNAME",
    "pedagogicobahia@febracis.com.br.producao")


def id_do_pedagogico(sf):
    linhas = sf.query(
        f"SELECT Id FROM User WHERE Username = '{PEDAGOGICO_USERNAME}'")
    if not linhas:
        raise RuntimeError(
            f"usuario {PEDAGOGICO_USERNAME} nao encontrado -- sem ele nao da "
            "para saber que turma acontece aqui; abortando sem gravar")
    return canonical_salesforce_id(linhas[0]["Id"])


def dia_local(valor):
    """Datetime do Salesforce -> data em America/Bahia. Ver armadilha 2."""
    if not valor:
        return None
    texto = str(valor).replace("Z", "+00:00")
    return datetime.fromisoformat(texto).astimezone(BAHIA).date().isoformat()


def turmas_com_venda_nossa(sf, desde):
    """Ids das turmas em que ESTA unidade vendeu. Ver armadilha 1.

    Agregado do SOQL nao aceita campo de relacionamento no GROUP BY, entao sai
    so o Id e a contagem; os campos vem na consulta seguinte.
    """
    soql = ("SELECT Turma__c, COUNT(Id) vendas FROM Opportunity "
            f"WHERE Unidade_Geradora_Venda__r.Name = '{UNIDADE}' "
            "AND Turma__c != null "
            f"AND Turma__r.Data_Inicial__c >= {desde}T00:00:00Z "
            "GROUP BY Turma__c")
    linhas = sf.query(soql)
    return {canonical_salesforce_id(l["Turma__c"]): int(l["vendas"])
            for l in linhas if l.get("Turma__c")}


def turmas_que_realizamos(sf, dono, desde):
    """Ids das turmas cujo dono e o nosso pedagogico. Ver armadilha 1, porta (a).

    E a unica porta que enxerga turma futura ainda sem venda -- justamente a
    que a meta mais precisa.
    """
    linhas = sf.query(
        "SELECT Id FROM Turma__c "
        f"WHERE OwnerId = '{dono}' "
        f"AND Data_Inicial__c >= {desde}T00:00:00Z")
    return {canonical_salesforce_id(l["Id"]) for l in linhas}


def detalhe_das_turmas(sf, ids_18):
    """Campos da Turma__c, em lotes -- clausula IN nao aguenta lista longa."""
    campos = ("Id,Name,Curso__r.Name,Data_Inicial__c,Data_Final__c,"
              "Status__c,Capacidade__c,QuantidadeVagas__c,LastModifiedDate")
    saida = []
    ids = sorted(ids_18)
    for i in range(0, len(ids), 150):
        lote = "','".join(ids[i:i + 150])
        saida.extend(sf.query(
            f"SELECT {campos} FROM Turma__c WHERE Id IN ('{lote}')"))
    return saida


def transformar(registros, vendas=None, hoje=None):
    """Devolve (linhas por sf_id, descartadas com o motivo).

    QUANDO DOIS Ids TEM O MESMO NOME, ganha o que ESTA UNIDADE mais vendeu.
    Acontece de verdade: CIS-GL248, 249 e 251 vem duplicadas. Nao e criterio
    perfeito, mas e o unico com significado disponivel -- a turma em que nossos
    alunos estao e a nossa. Sem desempate seria a ordem que o Salesforce
    devolveu, que nao quer dizer nada.
    """
    hoje = hoje or datetime.now(BAHIA).date()
    vendas = vendas or {}
    limite = hoje.replace(year=hoje.year + ANOS_DE_HORIZONTE).isoformat()
    linhas, descartadas, nomes = {}, [], {}

    # Mais vendidas primeiro, para que a vencedora do desempate chegue antes.
    registros = sorted(
        registros,
        key=lambda r: -vendas.get(canonical_salesforce_id(r["Id"]), 0))

    for r in registros:
        sf_id = canonical_salesforce_id(r["Id"])
        inicio = dia_local(r.get("Data_Inicial__c"))
        if not inicio:
            # data_inicio e NOT NULL no banco; turma sem data nao entra.
            descartadas.append((r.get("Name"), "sem data de inicio"))
            continue
        if inicio > limite:
            descartadas.append((r.get("Name"), f"data em {inicio[:4]} -- registro-modelo"))
            continue
        nome = r.get("Name")
        if nome in nomes:
            # Mesmo nome, outro Id, no mesmo lote: o upsert quebraria.
            descartadas.append((
                nome,
                f"nome repetido; ficou o Id com mais vendas nossas "
                f"({nomes[nome]}, {vendas.get(nomes[nome], 0)} vendas contra "
                f"{vendas.get(sf_id, 0)})"))
            continue
        nomes[nome] = sf_id
        capacidade = r.get("Capacidade__c") or r.get("QuantidadeVagas__c")
        linhas[sf_id] = {
            "turma_id": r.get("Name"),
            "sf_turma_id": sf_id,
            "curso": (r.get("Curso__r") or {}).get("Name"),
            "data_inicio": inicio,
            "data_fim": dia_local(r.get("Data_Final__c")),
            # capacidade tem CHECK (> 0): zero vira nulo em vez de estourar.
            "capacidade": int(float(capacidade)) if capacidade else None,
            "status_sf": r.get("Status__c"),
            "sf_modificado_em": r.get("LastModifiedDate"),
        }
    return linhas, descartadas


def planejar(novas, existentes, nossas=frozenset()):
    """Decide o que criar e o que atualizar, respeitando o contrato de db/187.

    Devolve (criar, atualizar, conflitos_de_nome, sem_curso).
    """
    por_sf = {e["sf_turma_id"]: e for e in existentes if e.get("sf_turma_id")}
    por_nome = {e["turma_id"]: e for e in existentes}

    criar, atualizar, conflitos, sem_curso = [], [], [], []

    for sf_id, nova in novas.items():
        if not nova["curso"]:
            # curso e NOT NULL. Sem ele a linha nao pode nascer -- e sem curso
            # a meta nao sabe classificar o dia, entao entrar pela metade seria
            # pior que ficar de fora.
            sem_curso.append(nova["turma_id"])
            continue

        atual = por_sf.get(sf_id)
        if atual:
            mudanca = {c: nova[c] for c in COLUNAS_DO_SALESFORCE
                       if c in nova and str(nova[c] or "") != str(atual.get(c) or "")}
            # PRIMEIRO TOQUE: a db/187 chutou `acontece_aqui` pelo nome, porque
            # SQL nao consulta Salesforce. Aqui o chute e substituido pelo dado
            # real. So nesta vez -- depois a coluna e da pessoa.
            if atual.get("sincronizado_em") is None:
                real = sf_id in nossas
                if bool(atual.get("acontece_aqui", True)) != real:
                    mudanca["acontece_aqui"] = real
            if mudanca:
                atualizar.append({"turma_id": atual["turma_id"], **mudanca,
                                  "_antes": atual})
            continue

        homonima = por_nome.get(nova["turma_id"])
        if homonima and homonima.get("sf_turma_id"):
            # Mesmo nome, outro Id: gravar sobrescreveria uma turma diferente.
            conflitos.append(nova["turma_id"])
            continue
        if homonima:
            # Linha antiga sem sf_turma_id: e a mesma turma, so nunca foi
            # vinculada. Vira update, e ganha o vinculo.
            atualizar.append({"turma_id": nova["turma_id"],
                              **{c: nova[c] for c in COLUNAS_DO_SALESFORCE if c in nova},
                              "_antes": homonima})
            continue

        criar.append({
            **nova,
            "status": nova["status_sf"] and
                      ("cancelada" if "cancel" in nova["status_sf"].lower() else "aberta")
                      or "planejada",
            # Dono nosso = acontece aqui. Ver armadilha 5.
            "acontece_aqui": sf_id in nossas,
        })
    return criar, atualizar, conflitos, sem_curso


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--aplicar", action="store_true",
                   help="grava no Supabase; sem isto so diagnostica")
    p.add_argument("--dias", type=int, default=400,
                   help="quanto do passado entra na janela (padrao 400)")
    args = p.parse_args()

    load_env()
    sf, sb = Salesforce(), Supabase()

    desde = (datetime.now(BAHIA).date() - timedelta(days=args.dias)).isoformat()
    log(f"janela: turmas com inicio a partir de {desde}")

    dono = id_do_pedagogico(sf)
    nossas = turmas_que_realizamos(sf, dono, desde)
    vendas = turmas_com_venda_nossa(sf, desde)
    log(f"turmas realizadas por nos (dono {PEDAGOGICO_USERNAME}): {len(nossas)}")
    log(f"turmas com venda desta unidade: {len(vendas)}")
    log(f"so pela venda, {len(nossas - set(vendas))} turmas nossas ficariam de fora")

    alvo = nossas | set(vendas)
    if not alvo:
        # Trava igual as do sync-salesforce-api: extracao vazia nunca escreve.
        raise RuntimeError("nenhuma turma retornada -- abortando sem gravar")

    registros = detalhe_das_turmas(sf, alvo)
    novas, descartadas = transformar(registros, vendas)
    log(f"turmas com data utilizavel: {len(novas)}")

    existentes = sb.select_all(
        "dim_turmas",
        "turma_id,sf_turma_id,curso,data_inicio,data_fim,capacidade,"
        "status,status_sf,sf_modificado_em,acontece_aqui,sincronizado_em",
        [("data_inicio", f"gte.{desde}")])
    log(f"turmas ja no banco dentro da janela: {len(existentes)}")

    criar, atualizar, conflitos, sem_curso = planejar(novas, existentes, nossas)

    vinculadas = {e["sf_turma_id"] for e in existentes if e.get("sf_turma_id")}
    reencontradas = len(vinculadas & set(novas))
    if vinculadas and reencontradas < len(vinculadas) * 0.7:
        raise RuntimeError(
            f"so {reencontradas} de {len(vinculadas)} turmas ja vinculadas "
            "voltaram na consulta (<70%) -- abortando sem gravar")

    orfas = [e["turma_id"] for e in existentes
             if e.get("sf_turma_id") and e["sf_turma_id"] not in novas]

    log("")
    log("-" * 68)
    log(f"  criar ...................... {len(criar)}")
    log(f"  atualizar .................. {len(atualizar)}")
    log(f"  sem venda nossa (ignoradas)  {len(orfas)}")
    log(f"  conflito de nome ........... {len(conflitos)}")
    log(f"  sem curso no Salesforce .... {len(sem_curso)}")
    log(f"  descartadas na origem ...... {len(descartadas)}")
    log("-" * 68)

    for c in criar:
        onde = "" if c["acontece_aqui"] else "   [FORA DA LOJA]"
        log(f"  + {c['turma_id']:<28} {c['data_inicio']} a {c['data_fim']}  "
            f"{(c['curso'] or '')[:30]}{onde}")
    for u in atualizar:
        antes = u["_antes"]
        campos = [k for k in u if k not in ("turma_id", "_antes")]
        detalhe = "; ".join(
            f"{k}: {antes.get(k) or '(vazio)'} -> {u[k]}" for k in campos)
        log(f"  ~ {u['turma_id']:<28} {detalhe[:110]}")
    for nome in conflitos:
        log(f"  ! {nome}: mesmo nome, outro Id no Salesforce -- NAO gravado")
    for nome in sem_curso:
        log(f"  ! {nome}: sem curso no Salesforce -- NAO gravado")
    for nome in orfas:
        log(f"  . {nome}: nenhuma venda desta unidade -- fora do alcance do sync")
    for nome, motivo in descartadas:
        log(f"  x {nome}: {motivo}")

    # A discordancia de status nao e resolvida aqui, so anunciada. Ver
    # armadilha 4 e vw_turma_divergencia.
    for u in atualizar:
        antes, sfs = u["_antes"], u.get("status_sf")
        if antes.get("status") == "cancelada" and sfs and "cancel" not in sfs.lower():
            log(f"  * {u['turma_id']}: cancelada AQUI e '{sfs}' no Salesforce. "
                "O status local foi mantido.")

    if not args.aplicar:
        log("")
        log("MODO DIAGNOSTICO -- nada foi gravado. Use --aplicar para escrever.")
        return

    agora = datetime.now(timezone.utc).isoformat()
    linhas = []
    for c in criar:
        linhas.append({**c, "sincronizado_em": agora, "atualizado_em": agora})
    for u in atualizar:
        linhas.append({**{k: v for k, v in u.items() if k != "_antes"},
                       "sincronizado_em": agora})
    if linhas:
        sb.upsert("dim_turmas", linhas, "turma_id")
    log("")
    log(f"GRAVADO: {len(criar)} criadas, {len(atualizar)} atualizadas.")

    sb.upsert("integracao_status", [{
        "fonte": "salesforce_turmas", "nome_exibicao": "Turmas (Salesforce)",
        "ultima_sync": agora, "status": "ok", "atualizado_em": agora}], "fonte")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ERRO: {exc}")
        sys.exit(1)
