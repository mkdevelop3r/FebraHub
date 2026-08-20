"""
etl/presenca_email_sync.py

Lê o relatório de PRESENÇA do Salesforce que chega por e-mail e alimenta
fato_presenca. Roda 1x/dia às 17h Salvador, pelo sync-presenca.yml.

O QUE ESTE SCRIPT NÃO FAZ — e é de propósito:

  Não apaga nada. Pagamentos e alunos apagam e reinserem por janela de
  data de aprovação; presença é ACUMULATIVA. A promoção usa
  `on conflict (cpf, turma, dia) do update`, então reprocessar o mesmo
  arquivo é inofensivo e nenhum histórico se perde.

  Se você veio copiar a lógica do salesforce_email_sync.py: não traga o
  delete por janela nem a trava de 120 dias. Não há delete a proteger.

  Não faz transformação. Toda a limpeza mora em promover_presenca()
  (arquivo 93): extração do dia por regex, zeros à esquerda do CPF,
  dedupe, conversão de data. Aqui só se enche a staging e chama a função.

ARMADILHAS DO ARQUIVO, medidas no relatório real:

  encoding      ISO-8859-1 (latin1). Sem converter, acento vira lixo.
  dia da aula   embutido no texto do campo "Presença", como
                "NOME-SIGLA-Dia N". A função extrai o N.
  data          "Presença: Data de criação" é quando o registro foi
                criado no Salesforce, NÃO a data da aula. Nunca use
                para filtrar janela.
  sem CPF       ~26 linhas. Descartadas pela função. É esperado.
  duplicatas    ~180 linhas idênticas. O distinct on resolve.

Variáveis de ambiente:
  GMAIL_ADDRESS, GMAIL_APP_PASSWORD   senha de APP, não a senha real
  SUPABASE_URL, SUPABASE_SERVICE_KEY
  SF_ASSUNTO_PRESENCA                 padrão: 'Base presenca'
"""

import csv
import email
import imaplib
import io
import os
import sys
from email.header import decode_header

import requests

GMAIL = os.environ["GMAIL_ADDRESS"]
SENHA = os.environ["GMAIL_APP_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ASSUNTO = os.environ.get("SF_ASSUNTO_PRESENCA") or "Base presenca"

# Ordem das colunas no relatório. Se o Salesforce mudar o relatório,
# é aqui que quebra — e é melhor quebrar alto do que gravar torto.
COLUNAS_ESPERADAS = [
    "Cliente: Nome do cliente",
    "Unidade Geradora da Venda",
    "Unidade",
    "Curso",
    "Presença: Presença",
    "Presença: Data de criação",
    "Turma do Credenciamento",
    "CPF",
]

DESTINO = ["nome", "unidade_venda", "unidade", "curso",
           "presenca_txt", "data_registro", "turma", "cpf"]

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def log(msg):
    print(msg, flush=True)


def baixar_anexo():
    """Pega o anexo CSV do e-mail mais recente com o assunto configurado."""
    m = imaplib.IMAP4_SSL("imap.gmail.com")
    m.login(GMAIL, SENHA)
    m.select("INBOX")

    ok, dados = m.search(None, f'(SUBJECT "{ASSUNTO}")')
    if ok != "OK" or not dados[0]:
        raise SystemExit(
            f"Nenhum e-mail com assunto '{ASSUNTO}'. "
            "Confira o agendamento do relatório no Salesforce."
        )

    ids = dados[0].split()
    ultimo = ids[-1]
    ok, msg_dados = m.fetch(ultimo, "(RFC822)")
    msg = email.message_from_bytes(msg_dados[0][1])

    assunto = decode_header(msg.get("Subject", ""))[0][0]
    if isinstance(assunto, bytes):
        assunto = assunto.decode("utf-8", "replace")
    log(f"E-mail: {assunto} · {msg.get('Date')}")

    for parte in msg.walk():
        nome = parte.get_filename()
        if nome and nome.lower().endswith(".csv"):
            m.logout()
            return parte.get_payload(decode=True), nome

    m.logout()
    raise SystemExit("E-mail encontrado, mas sem anexo .csv.")


def ler_csv(bruto):
    """latin1 -> utf8, valida o cabeçalho, devolve lista de dicts."""
    texto = bruto.decode("iso-8859-1")
    leitor = csv.reader(io.StringIO(texto), delimiter=";")

    cabecalho = next(leitor)
    if [c.strip() for c in cabecalho] != COLUNAS_ESPERADAS:
        raise SystemExit(
            "O relatório mudou de formato.\n"
            f"  esperado: {COLUNAS_ESPERADAS}\n"
            f"  recebido: {cabecalho}\n"
            "Ajuste COLUNAS_ESPERADAS ou o relatório no Salesforce."
        )

    linhas = []
    for l in leitor:
        if len(l) != len(DESTINO):
            continue
        linhas.append(dict(zip(DESTINO, [c.strip() for c in l])))
    return linhas


def post(caminho, corpo=None, params=""):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{caminho}{params}",
        headers=HEADERS, json=corpo, timeout=120,
    )
    r.raise_for_status()
    return r


def limpar_staging():
    requests.delete(
        f"{SUPABASE_URL}/rest/v1/stg_presenca?cpf=not.is.null",
        headers=HEADERS, timeout=120,
    ).raise_for_status()
    requests.delete(
        f"{SUPABASE_URL}/rest/v1/stg_presenca?cpf=is.null",
        headers=HEADERS, timeout=120,
    ).raise_for_status()


def main():
    bruto, nome_arquivo = baixar_anexo()
    log(f"Anexo: {nome_arquivo} · {len(bruto)} bytes")

    linhas = ler_csv(bruto)
    log(f"Linhas lidas: {len(linhas)}")

    if not linhas:
        raise SystemExit("Arquivo vazio. Nada a fazer.")

    # Guarda-costas: relatório muito menor que o normal é sinal de filtro
    # errado no Salesforce, não de dia fraco. Melhor abortar que gravar
    # meia base e todo mundo achar que a presença caiu.
    if len(linhas) < 1000:
        raise SystemExit(
            f"Só {len(linhas)} linhas — o relatório traz ~14 mil. "
            "Provável filtro errado no Salesforce. Abortando sem gravar."
        )

    limpar_staging()

    for i in range(0, len(linhas), 1000):
        lote = linhas[i:i + 1000]
        post("stg_presenca", lote)
        log(f"  staging: {i + len(lote)}/{len(linhas)}")

    r = post("rpc/promover_presenca", {})
    resultado = r.json()
    log(f"Promovido: {resultado}")

    limpar_staging()
    log("Staging limpa. Fim.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        log(f"ERRO: {e}")
        sys.exit(1)
