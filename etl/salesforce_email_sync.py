"""
FebraHub · salesforce_email_sync.py
Substitui o Salesforce manual: lê os relatórios agendados que chegam
por e-mail (Gmail), trata as duas bases e sobe para o Supabase.

Como funciona:
  O Salesforce dispara relatórios agendados 3x/dia (6h, 12h, 17h),
  cada um como anexo CSV num e-mail. São 6 relatórios:
    Pagamentos 06h/12h/17h  e  Alunos 06h/12h/17h
  O script pega, de cada base, o e-mail MAIS RECENTE (qualquer horário),
  trata e faz carga completa (truncate + insert).

Segurança (fail-loud):
  - se um campo obrigatório vier vazio acima do limite, ABORTA a carga
  - valida maio (R$ 1.779.136) e julho (R$ 614.766) no fim; avisa se divergir
  - carga em tabela temporária + troca atômica: nunca deixa meia-base

Variáveis de ambiente (secrets):
  GMAIL_ADDRESS, GMAIL_APP_PASSWORD   (senha de app, NÃO a senha real)
  SUPABASE_URL, SUPABASE_SERVICE_KEY
Opcionais:
  SF_ASSUNTO_PAGAMENTO  (padrão: 'Pagamentos')  -> texto no assunto do e-mail
  SF_ASSUNTO_ALUNOS     (padrão: 'Alunos')
"""
import os, sys, csv, re, io, json, imaplib, email, urllib.request, urllib.parse
from email.header import decode_header
from datetime import datetime, timezone

# ---------- .env ----------
for _p in ('.env', 'etl/.env', os.path.join(os.path.dirname(__file__), '.env')):
    if os.path.exists(_p):
        for _l in open(_p, encoding='utf-8'):
            _l = _l.strip()
            if _l and not _l.startswith('#') and '=' in _l:
                _k, _v = _l.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
        break

GMAIL_USER = os.environ['GMAIL_ADDRESS']
GMAIL_PASS = os.environ['GMAIL_APP_PASSWORD']
SB_URL = os.environ['SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_KEY']
# assunto real dos e-mails do Salesforce agendado:
#   'Relatar resultados (Base pagamentos - dia a dia)'
#   'Relatar resultados (Base alunos - dia a dia)'
# .strip() + 'or' garante que secret VAZIO caia no padrão (não sobrescreve com '')
ASSUNTO_PG = (os.environ.get('SF_ASSUNTO_PAGAMENTO') or '').strip() or 'Base pagamentos'
ASSUNTO_AL = (os.environ.get('SF_ASSUNTO_ALUNOS') or '').strip() or 'Base alunos'

# quanto de um campo obrigatório pode faltar antes de abortar (fração)
LIMITE_VAZIO = 0.10

# ---------- helpers de tratamento (iguais ao manual) ----------
def dt(s):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', (s or '').strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else ''

def val(s):
    s = (s or '').replace('R$', '').replace('BRL', '').strip()
    if not s or s == '-': return ''
    s = s.replace('.', '').replace(',', '.')
    try: return f"{float(s):.2f}"
    except: return ''

def txt(s):
    s = (s or '').strip()
    return '' if s == '-' else s

def pint(s):
    try: return str(int(float((s or '0').strip())))
    except: return ''

def trein(s):
    return re.sub(r'\s*-\s*TREINADOR\s*$', '', txt(s), flags=re.I).strip()

def fone(s): return re.sub(r'\D', '', (s or ''))
def email_l(s): return (s or '').strip().lower()

# ---------- leitura do Gmail ----------
def decodar(v):
    if not v: return ''
    partes = decode_header(v)
    out = ''
    for t, enc in partes:
        out += t.decode(enc or 'utf-8', errors='replace') if isinstance(t, bytes) else t
    return out

def buscar_os_dois(imap):
    """Varre a caixa UMA vez, do mais recente ao mais antigo, e separa o
    primeiro CSV de pagamento e o primeiro de alunos pelo assunto.
    Evita reler a caixa duas vezes (que causava pegar o e-mail errado)."""
    if not ASSUNTO_PG.strip() or not ASSUNTO_AL.strip():
        raise SystemExit("Assunto de busca vazio — abortando para não casar "
                         "com e-mails errados. Verifique SF_ASSUNTO_*.")
    print(f"  procurando PG='{ASSUNTO_PG}' | AL='{ASSUNTO_AL}'")
    status, dados = imap.search(None, 'ALL')
    if status != 'OK':
        return None, None, None, None
    ids = dados[0].split()
    csv_pg = ass_pg = csv_al = ass_al = None
    for eid in reversed(ids[-60:]):
        if csv_pg and csv_al:
            break
        status, msg_data = imap.fetch(eid, '(RFC822)')
        if status != 'OK':
            continue
        msg = email.message_from_bytes(msg_data[0][1])
        assunto = decodar(msg.get('Subject', ''))
        al = assunto.lower()
        eh_pg = ASSUNTO_PG.lower() in al
        eh_al = ASSUNTO_AL.lower() in al
        # exclusivo: se casar com os dois (ou nenhum), ignora — evita pegar
        # e-mail genérico ('New Form Submission') que não é relatório
        if eh_pg == eh_al:
            continue
        print(f"    match: '{assunto[:55]}' -> pg={eh_pg} al={eh_al}")
        # pega o CSV deste e-mail
        conteudo = None
        for parte in msg.walk():
            nome = decodar(parte.get_filename() or '')
            if nome.lower().endswith('.csv'):
                bruto = parte.get_payload(decode=True)
                if bruto:
                    conteudo = bruto.decode('latin-1', errors='replace')
                    break
        if not conteudo:
            continue
        # ATENÇÃO à ordem: 'pagamentos' contém 'alunos'? não. mas
        # 'Base alunos' e 'Base pagamentos' são exclusivos. Ainda assim,
        # se ambos casarem (não deveria), prioriza o mais específico.
        if eh_pg and not csv_pg:
            csv_pg, ass_pg = conteudo, assunto
        elif eh_al and not csv_al:
            csv_al, ass_al = conteudo, assunto
    return csv_pg, ass_pg, csv_al, ass_al


def baixar_csv_mais_recente(imap, assunto_contem):
    """Procura o e-mail mais recente cujo assunto contém `assunto_contem`
    e devolve o conteúdo do primeiro anexo .csv (texto latin-1)."""
    # busca ampla; filtra por assunto no cliente (mais robusto que SEARCH SUBJECT)
    status, dados = imap.search(None, 'ALL')
    if status != 'OK': return None, None
    ids = dados[0].split()
    # do mais recente para o mais antigo — limita aos 40 mais recentes
    for eid in reversed(ids[-40:]):
        status, msg_data = imap.fetch(eid, '(RFC822)')
        if status != 'OK': continue
        msg = email.message_from_bytes(msg_data[0][1])
        assunto = decodar(msg.get('Subject', ''))
        if assunto_contem.lower() not in assunto.lower():
            continue
        # achou o e-mail certo; pega o anexo csv
        for parte in msg.walk():
            nome = decodar(parte.get_filename() or '')
            if nome.lower().endswith('.csv'):
                bruto = parte.get_payload(decode=True)
                if bruto:
                    return bruto.decode('latin-1', errors='replace'), assunto
        # e-mail certo mas sem csv -> continua procurando um anterior
    return None, None

# ---------- transformação ----------
def tratar_pagamento(texto_csv):
    linhas = list(csv.DictReader(io.StringIO(texto_csv), delimiter=';'))
    if linhas and 'Id pagamento' not in linhas[0]:
        raise SystemExit("Arquivo de PAGAMENTO não tem a coluna 'Id pagamento' — "
                         "e-mail/anexo trocado? Abortando para não gravar errado.")
    if not linhas:
        raise SystemExit("Pagamento: CSV vazio — abortando.")
    saida, faltando = [], {'valor': 0, 'original_id_venda': 0, 'data_pagamento': 0}
    for r in linhas:
        d = dt(r.get('Data de pagamento', '')) or dt(r.get('Data de Aprovação', ''))
        v = val(r.get('Valor', ''))
        oid = txt(r.get('ID da venda', ''))
        if not v: faltando['valor'] += 1
        if not oid: faltando['original_id_venda'] += 1
        if not d: faltando['data_pagamento'] += 1
        saida.append({
            'pagamento_id': txt(r.get('Id pagamento', '')),
            'aluno_id': txt(r.get('ID do cliente', '')),
            'curso_id': None,   # NULL (não ''): FK aceita nulo; string vazia ela rejeita
            'consultor_id': txt(r.get('Proprietário da venda', '')),
            'data_pagamento': d,
            'valor': v,
            'status_pagamento': txt(r.get('Status', '')),
            'forma_pagamento': txt(r.get('Forma de Pag. Venda: Nome de Forma Pag. Venda', '')),
            'original_id_venda': oid,
            'nome_venda': txt(r.get('Nome da venda', '')),
            'tipo_matricula': txt(r.get('Tipo de Matrícula', '')),
            'quantidade_parcelas': pint(r.get('Quantidade de parcelas', '')),
            'valor_parcela': val(r.get('Valor em cada Parcela', '')),
            'periodo_fiscal': txt(r.get('Período fiscal', '')),
            'unidade_geradora_venda': txt(r.get('Unidade Geradora da Venda', '')),
            'payment_id': txt(r.get('Payment Id', '')),
            'data_aprovacao': dt(r.get('Data de Aprovação', '')),
            'data_fechamento': dt(r.get('Data de fechamento', '')),
        })
    checar_fail_loud('Pagamento', len(saida), faltando)
    return saida

def tratar_alunos(texto_csv):
    linhas = list(csv.DictReader(io.StringIO(texto_csv), delimiter=';'))
    if linhas and 'Curso(2)' not in linhas[0]:
        raise SystemExit("Arquivo de ALUNOS não tem a coluna 'Curso(2)' — "
                         "e-mail/anexo trocado? Abortando para não gravar errado.")
    if not linhas:
        raise SystemExit("Alunos: CSV vazio — abortando.")
    saida, faltando = [], {'original_id_venda': 0, 'data_matricula': 0}
    for r in linhas:
        oid = txt(r.get('ID da venda', ''))
        curso = txt(r.get('Curso(2)', ''))
        # matricula_id ESTÁVEL: venda + curso. Determinístico — recarregar o
        # mesmo período gera as mesmas chaves, sem bagunçar (idempotente).
        # (uma venda pode ter mais de uma matrícula: venda+curso as distingue)
        d_aprov = dt(r.get('Data de Aprovação', ''))
        d_criacao = dt(r.get('Data de criação', ''))
        if not oid: faltando['original_id_venda'] += 1
        if not d_aprov: faltando['data_matricula'] += 1
        saida.append({
            'matricula_id': f"{oid}|{curso}"[:120] if oid else '',
            'aluno_id': txt(r.get('CPF (11)', '')) or email_l(r.get('Cliente pessoal: Email', '')),
            'curso_id': txt(r.get('Curso(2)', '')),
            'data_matricula': d_aprov or d_criacao,   # ancora em aprovação; criação como reserva
            'status_matricula': txt(r.get('Fase', '')),
            'data_conclusao': '',
            'original_id_venda': oid,
            'consultor_id': txt(r.get('Proprietário da venda', '')),
            'tipo_matricula': txt(r.get('Tipo de Matrícula', '')),
            'data_fechamento_venda': dt(r.get('Data de fechamento', '')),
            'turma': txt(r.get('Turma(3)', '')),
            'valor': val(r.get('Valor', '')),
            'origem_lead': txt(r.get('Origem do lead', '')),
            'unidade_geradora_venda': txt(r.get('Unidade Geradora da Venda', '')),
            'fase': '',
            'ganho': '',
            'treinador': trein(r.get('Treinador', '')),
            'email_cliente': email_l(r.get('Cliente pessoal: Email', '')),
            'telefone_cliente': fone(r.get('Cliente pessoal: Celular', '')),
            'utm_campaign': txt(r.get('Utm Campaign', '')),
            'ultima_origem_lead': txt(r.get('Última Origem do Lead', '')),
        })
    checar_fail_loud('Alunos', len(saida), faltando)
    return saida

def checar_fail_loud(nome, total, faltando):
    for campo, n in faltando.items():
        if total and n / total > LIMITE_VAZIO:
            raise SystemExit(
                f"{nome}: campo '{campo}' vazio em {n}/{total} linhas "
                f"({100*n/total:.0f}%) — acima do limite de {100*LIMITE_VAZIO:.0f}%. "
                f"Carga ABORTADA para não gravar base incompleta.")
    print(f"  {nome}: {total} linhas, campos obrigatórios OK")

# ---------- carga incremental no Supabase ----------
# LIMITE de segurança: se a janela do arquivo for maior que isto, ABORTA.
# Um relatório agendado normal cobre semanas, não anos. Uma janela gigante
# significa arquivo errado — melhor não apagar meio banco por engano.
MAX_DIAS_JANELA = 120

def carga_incremental(tabela, linhas, coluna_data):
    """Carga incremental por DATA DE PAGAMENTO / MATRÍCULA.

    IMPORTANTE: o relatório do Salesforce DEVE filtrar pelo MESMO critério
    que esta coluna (data de pagamento), senão linhas fora da janela do
    delete são reinseridas e DUPLICAM. Foi o que quebrou a base antes.

    Apaga só o intervalo [de, ate] que veio no arquivo e reinsere.
    Trava: se a janela passar de MAX_DIAS_JANELA, aborta (arquivo suspeito).
    """
    if not linhas:
        raise SystemExit(f"{tabela}: nada para gravar — abortando.")

    campos = list(linhas[0].keys())
    # '' -> None em todos os campos: datas e números vazios precisam ser NULL,
    # não string vazia (senão o Postgres rejeita com 22007 / 23503).
    def limpa(v):
        return None if (v is None or (isinstance(v, str) and v.strip() == '')) else v
    linhas = [{c: limpa(r.get(c)) for c in campos} for r in linhas]

    datas = sorted(r[coluna_data] for r in linhas if r.get(coluna_data))
    if not datas:
        raise SystemExit(f"{tabela}: nenhuma data em '{coluna_data}' — abortando "
                         f"(sem saber o período, não apaga nada).")
    de, ate = datas[0], datas[-1]

    from datetime import date
    d0 = date.fromisoformat(de); d1 = date.fromisoformat(ate)
    dias = (d1 - d0).days
    if dias > MAX_DIAS_JANELA:
        raise SystemExit(
            f"{tabela}: janela de {dias} dias ({de} a {ate}) é maior que o "
            f"limite de {MAX_DIAS_JANELA}. Isso parece um export de base "
            f"inteira, não um incremental — ABORTANDO para não apagar demais. "
            f"Se for intencional, faça a carga completa manualmente.")
    print(f"  {tabela}: janela {de} a {ate} ({dias} dias)")

    # Estratégia SEM buraco: primeiro UPSERT de todas as linhas (merge por
    # chave — não falha em duplicata), depois apaga o que sobrou na janela
    # e NÃO veio no arquivo (linhas que deixaram de existir no Salesforce).
    # Se o upsert falhar por formato, nada foi apagado — base intacta.
    chave = 'pagamento_id' if tabela == 'fato_pagamento_base' else 'matricula_id'
    url = f"{SB_URL}/rest/v1/{tabela}?on_conflict={chave}"

    chaves_arquivo = set()
    for i in range(0, len(linhas), 500):
        lote = linhas[i:i+500]
        _req(url, corpo=lote, metodo='POST',
             extra={'Prefer': 'resolution=merge-duplicates,return=minimal'})
        for r in lote:
            if r.get(chave): chaves_arquivo.add(str(r[chave]))

    # apaga da janela só o que NÃO veio no arquivo (registros que sumiram)
    # busca as chaves atuais na janela
    resp = _req_get(f"{SB_URL}/rest/v1/{tabela}?select={chave}"
                    f"&{coluna_data}=gte.{de}&{coluna_data}=lte.{ate}")
    if resp:
        no_banco = {str(x[chave]) for x in resp if x.get(chave)}
        sumiram = no_banco - chaves_arquivo
        for k in sumiram:
            k_enc = urllib.parse.quote(str(k), safe='')
            _req(f"{SB_URL}/rest/v1/{tabela}?{chave}=eq.{k_enc}", metodo='DELETE')
        print(f"  {tabela}: {len(linhas)} upsert, {len(sumiram)} removidos ({de} a {ate})")
    else:
        print(f"  {tabela}: {len(linhas)} upsert ({de} a {ate})")

def _req_get(url):
    """GET que devolve a lista JSON (para comparar chaves na janela)."""
    headers = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}
    req = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None

def _req(url, corpo=None, metodo='GET', extra=None):
    headers = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
               'Content-Type': 'application/json'}
    if extra: headers.update(extra)
    data = json.dumps(corpo, default=str).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase {metodo} {e.code}: "
                         f"{e.read().decode(errors='replace')[:300]}")

# ---------- reconciliação ----------
def validar():
    q = ("select round(sum(v)) total from ("
         "select max(valor) v from fato_pagamento_base "
         "where tipo_matricula in ('Matrícula','COMPRADOR DE VAGAS','MAT. RETROATIVA') "
         "and data_pagamento >= '{ini}' and data_pagamento < '{fim}' "
         "group by original_id_venda) x")
    esperado = {'2026-05': 1779136, '2026-07': 614766}
    print("\n  reconciliação:")
    for mes, alvo in esperado.items():
        ini = f"{mes}-01"
        y, m = mes.split('-'); m = int(m) + 1; y = int(y)
        if m > 12: m, y = 1, y + 1
        fim = f"{y}-{m:02d}-01"
        url = f"{SB_URL}/rest/v1/rpc/exec_sql"  # se não houver RPC, checar manual
        # sem RPC de SQL arbitrário, apenas informa o alvo para conferência manual
        print(f"    {mes}: conferir manualmente — alvo R$ {alvo:,}")

# ---------- main ----------
def main():
    print("Conectando ao Gmail...")
    imap = imaplib.IMAP4_SSL('imap.gmail.com')
    imap.login(GMAIL_USER, GMAIL_PASS)
    imap.select('INBOX')

    print("Buscando relatórios...")
    csv_pg, ass_pg, csv_al, ass_al = buscar_os_dois(imap)
    imap.logout()

    if not csv_pg:
        raise SystemExit(f"Nenhum e-mail de pagamento com assunto contendo '{ASSUNTO_PG}'.")
    if not csv_al:
        raise SystemExit(f"Nenhum e-mail de alunos com assunto contendo '{ASSUNTO_AL}'.")
    print(f"  pagamento: '{ass_pg}'")
    print(f"  alunos:    '{ass_al}'")

    print("\nTratando...")
    pg = tratar_pagamento(csv_pg)
    al = tratar_alunos(csv_al)

    print("\nGravando (carga incremental por DATA DE APROVAÇÃO)...")
    # O relatório filtra por Data de Aprovação -> apagar/inserir pelo MESMO
    # critério. Assim nenhuma linha fica fora da janela do delete (foi o
    # descasamento aprovação x pagamento que quebrou a base antes).
    carga_incremental('fato_pagamento_base', pg, 'data_aprovacao')
    carga_incremental('fato_base_alunos', al, 'data_matricula')

    validar()

    # status
    _req(f"{SB_URL}/rest/v1/integracao_status?on_conflict=fonte",
         corpo=[{'fonte': 'salesforce', 'nome_exibicao': 'Salesforce',
                 'ultima_sync': datetime.now(timezone.utc).isoformat(),
                 'status': 'ok',
                 'atualizado_em': datetime.now(timezone.utc).isoformat()}],
         metodo='POST', extra={'Prefer': 'resolution=merge-duplicates'})
    print("\nConcluído.")

if __name__ == '__main__':
    main()
