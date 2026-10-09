"""Maestros Recife: Salesforce -> snapshot próprio no Supabase.

Padrão: diagnóstico sem gravar nem imprimir dados pessoais.
Local: python etl/maestros_recife_sync.py --org FebraHub
Carga: acrescente --write depois de aplicar db/210_maestros_recife.sql.
GitHub Actions reutiliza a autenticação Salesforce do salesforce_api_sync.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

import requests
from salesforce_api_sync import (
    Salesforce, API_VERSION, REPORT_ALUNOS, allowed_enrollment_types,
    resolve_picklist_values, load_env, nested, digits, iso_day,
)

UNIDADE = 'FEBRACIS RECIFE 2'


class SalesforceCLI:
    """Sessão local existente, sem exportar tokens para arquivos ou logs."""
    def __init__(self, org):
        self.org = org
        self.executable = shutil.which('sf.cmd') or shutil.which('sf')
        if not self.executable:
            raise RuntimeError('CLI Salesforce não encontrada.')

    def call(self, arguments):
        result = subprocess.run(
            [self.executable, *arguments, '--target-org', self.org, '--json'],
            capture_output=True, text=True, encoding='utf-8', timeout=180,
        )
        try:
            body = json.loads(result.stdout)
        except ValueError:
            raise RuntimeError('A CLI Salesforce não devolveu JSON válido.') from None
        if result.returncode or body.get('status', 0):
            raise RuntimeError(body.get('message', 'Falha na consulta Salesforce.'))
        value = body.get('result', body)
        return json.loads(value) if isinstance(value, str) else value

    def get(self, path, params=None):
        if params:
            raise RuntimeError('Parâmetros inesperados na consulta local.')
        response = self.call(['api', 'request', 'rest', path])
        if response.get('statusCode', 200) >= 300:
            raise RuntimeError('Consulta REST Salesforce recusada.')
        body = response.get('body', response)
        return json.loads(body) if isinstance(body, str) else body

    def query(self, soql):
        result = self.call(['data', 'query', '--query', soql])
        records = result.get('records', [])
        if len(records) != result.get('totalSize'):
            raise RuntimeError('Consulta Salesforce truncada; carga bloqueada.')
        return records

    def report_description(self, report_id):
        return self.get(f'/services/data/v{API_VERSION}/analytics/reports/{report_id}/describe')


def literal_id(value):
    if not re.fullmatch(r'[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?', value or ''):
        raise RuntimeError('Identificador Salesforce inválido.')
    return "'" + value + "'"


def query_chunks(sf, ids, template):
    records = []
    ordered = sorted(set(ids))
    for start in range(0, len(ordered), 100):
        values = ','.join(literal_id(value) for value in ordered[start:start + 100])
        records.extend(sf.query(template.format(ids=values)))
    return records


def aluno_key(record):
    cpf = digits(nested(record, 'Account.CPFun__c'))
    if cpf:
        return cpf.zfill(11) if len(cpf) <= 11 else cpf
    email = str(nested(record, 'Account.PersonEmail', '')).strip().lower()
    return email or 'sf:' + record['AccountId']


def montar(records, credentials, presence, maestro_accounts):
    # Una pessoa por CPF/e-mail; AccountId é fallback quando faltam ambos.
    groups = defaultdict(list)
    maestro_keys = {aluno_key(r) for r in records if r['AccountId'] in maestro_accounts
                    and nested(r, 'NomeCurso__r.Name') == 'MAESTRIA'}
    for record in records:
        if nested(record, 'Unidade_Geradora_Venda__r.Name') != UNIDADE:
            raise RuntimeError('Outra unidade na extração; carga bloqueada.')
        if record.get('StageName') != 'Aprovada':
            raise RuntimeError('Venda não aprovada na extração; carga bloqueada.')
        if aluno_key(record) in maestro_keys:
            groups[aluno_key(record)].append(record)
    sales = {r['Id']: aluno_key(r) for rs in groups.values() for r in rs}
    customers = {r['AccountId']: aluno_key(r) for rs in groups.values() for r in rs}
    attended = {r['Credenciamento__c'] for r in presence if r.get('Credenciamento__c')}
    measured = defaultdict(dict)
    for credential in credentials:
        key = sales.get(credential.get('Venda__c'))
        customer = credential.get('Nome_do_Cliente__c')
        if customer and customers.get(customer) != key:
            continue
        if not key or str(credential.get('Tipo_de_Matricula_Atual__c')) in {'13', '22', '27'}:
            continue
        # Uma turma por aluno, ainda que existam vários registros de presença.
        turma = credential.get('Turma__c')
        if turma:
            measured[key][turma] = measured[key].get(turma, False) or credential['Id'] in attended
    rows = []
    for key, purchases in sorted(groups.items()):
        purchases = sorted(purchases, key=lambda r: (iso_day(r.get('Data_de_Aprova_o__c')
                           or r.get('CloseDate')) or '', r['Id']), reverse=True)
        dates = [iso_day(r.get('Data_de_Aprova_o__c') or r.get('CloseDate')) for r in purchases]
        maestria_dates = [iso_day(r.get('Data_de_Aprova_o__c') or r.get('CloseDate'))
                         for r in purchases if nested(r, 'NomeCurso__r.Name') == 'MAESTRIA']
        if not all(dates) or not maestria_dates or not all(maestria_dates):
            raise RuntimeError('Compra sem data; carga bloqueada.')
        def latest(path):
            return next((nested(r, path) for r in purchases if nested(r, path)), None)
        nome = latest('Account.Name')
        if not nome:
            raise RuntimeError('Maestro sem nome; carga bloqueada.')
        total = sum((Decimal(str(r.get('Amount') or 0)) for r in purchases), Decimal(0))
        classes = measured[key]
        rows.append({
            'cpf': key, 'nome': nome,
            'email': str(latest('Account.PersonEmail') or '').strip().lower() or None,
            'telefone': digits(latest('Account.PersonMobilePhone') or latest('Account.Phone') or latest('Account.PersonHomePhone')) or None,
            'data_nascimento': iso_day(latest('Account.Data_de_Nascimento__c')),
            'consultor': latest('Owner.Name'), 'total_cursos': len(purchases),
            'total_investido': int(total.quantize(Decimal('1'), rounding=ROUND_HALF_UP)),
            'primeira_compra': min(dates), 'ultima_compra': max(dates),
            'data_maestria': max(maestria_dates),
            'aulas_compareceu': sum(classes.values()),
            'aulas_faltou': len(classes) - sum(classes.values()),
        })
    if not rows:
        raise RuntimeError('Extração de maestros vazia; carga bloqueada.')
    return rows


def extrair(sf):
    metadata = sf.report_description(REPORT_ALUNOS)['reportMetadata']
    labels = resolve_picklist_values(sf, 'Opportunity', 'Tipo_de_Matricula__c',
                                    allowed_enrollment_types(metadata))
    fields = ('Id,AccountId,Account.Name,Account.CPFun__c,Account.PersonEmail,'
              'Account.PersonMobilePhone,Account.Phone,Account.PersonHomePhone,Account.Data_de_Nascimento__c,Owner.Name,Data_de_Aprova_o__c,CloseDate,'
              'Amount,StageName,Tipo_de_Matricula__c,NomeCurso__r.Name,'
              'Turma__c,Unidade_Geradora_Venda__r.Name')
    seeds = sf.query(f"SELECT {fields} FROM Opportunity WHERE StageName = 'Aprovada' "
                     f"AND Unidade_Geradora_Venda__r.Name = '{UNIDADE}' "
                     "AND NomeCurso__r.Name = 'MAESTRIA'")
    seeds = [r for r in seeds if r.get('Tipo_de_Matricula__c') in labels]
    accounts = {r['AccountId'] for r in seeds if r.get('AccountId')}
    if not accounts:
        raise RuntimeError('Nenhuma compra elegível de Maestria em Recife.')
    records = query_chunks(sf, accounts,
        f"SELECT {fields} FROM Opportunity WHERE StageName = 'Aprovada' "
        f"AND Unidade_Geradora_Venda__r.Name = '{UNIDADE}' AND AccountId IN ({{ids}})")
    records = [r for r in records if r.get('Tipo_de_Matricula__c') in labels]
    if len({r['Id'] for r in records}) != len(records):
        raise RuntimeError('Vendas duplicadas na extração.')
    credentials = query_chunks(sf, [r['Id'] for r in records],
        'SELECT Id,Venda__c,Nome_do_Cliente__c,Turma__c,Tipo_de_Matricula_Atual__c FROM Credenciamento__c '
        'WHERE Venda__c IN ({ids})')
    presence = query_chunks(sf, [r['Id'] for r in credentials],
        'SELECT Id,Credenciamento__c FROM Presenca__c WHERE Credenciamento__c IN ({ids})')
    rows = montar(records, credentials, presence, accounts)
    print(json.dumps({'unidade': UNIDADE, 'compras_maestria': len(seeds),
                      'maestros': len(rows), 'compras_historico': len(records),
                      'credenciamentos': len(credentials), 'presencas': len(presence),
                      'sem_email': sum(not r['email'] for r in rows),
                      'sem_telefone': sum(not r['telefone'] for r in rows)}, ensure_ascii=False))
    return rows


def gravar(rows):
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_KEY']
    response = requests.post(url + '/rest/v1/rpc/sincronizar_maestros_recife',
        headers={'apikey': key, 'Authorization': 'Bearer ' + key},
        json={'p_linhas': rows}, timeout=120)
    if not response.ok:
        raise RuntimeError(f'Carga recusada pelo Supabase (HTTP {response.status_code}). '
                           'Confira a aplicação da migration 210.')
    if response.json() != len(rows):
        raise RuntimeError('Contagem da carga diferente da extração.')
    print(f'Maestros Recife sincronizados: {len(rows)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org', help='Alias Salesforce CLI (somente execução local)')
    parser.add_argument('--write', action='store_true', help='Gravar snapshot validado no Supabase')
    args = parser.parse_args()
    load_env()
    sf = SalesforceCLI(args.org) if args.org else Salesforce()
    rows = extrair(sf)
    if args.write:
        gravar(rows)
    else:
        print('Diagnóstico concluído; nenhuma escrita realizada.')


if __name__ == '__main__':
    main()




