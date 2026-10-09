import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from maestros_recife_sync import montar, SalesforceCLI, UNIDADE


def purchase(sale, account='A', course='MAESTRIA', day='2026-01-08', amount=10000):
    return {'Id': sale, 'AccountId': account, 'Account': {
        'Name': 'Pessoa teste', 'CPFun__c': '123.456.789-00',
        'PersonEmail': 'teste@example.test', 'PersonMobilePhone': '(81) 99999-0000'},
        'NomeCurso__r': {'Name': course}, 'Unidade_Geradora_Venda__r': {'Name': UNIDADE},
        'StageName': 'Aprovada', 'Data_de_Aprova_o__c': day, 'Amount': amount,
        'Owner': {'Name': 'Consultor teste'}}


class MaestrosRecifeTests(unittest.TestCase):
    def test_renewal_and_history_grouped_by_person(self):
        rows = montar([purchase('sale1'), purchase('sale2', course='CIS', amount=5000),
                       purchase('sale3', day='2026-08-10')], [], [], {'A'})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['total_cursos'], 3)
        self.assertEqual(rows[0]['total_investido'], 25000)
        self.assertEqual(rows[0]['data_maestria'], '2026-08-10')
        self.assertEqual(rows[0]['primeira_compra'], '2026-01-08')

    def test_attendance_counts_class_once_and_excludes_ineligible(self):
        credentials = [
            {'Id': 'c1', 'Venda__c': 'sale1', 'Turma__c': 'T1', 'Tipo_de_Matricula_Atual__c': '28'},
            {'Id': 'c2', 'Venda__c': 'sale1', 'Turma__c': 'T1', 'Tipo_de_Matricula_Atual__c': '28'},
            {'Id': 'c3', 'Venda__c': 'sale1', 'Turma__c': 'T2', 'Tipo_de_Matricula_Atual__c': '28'},
            {'Id': 'c4', 'Venda__c': 'sale1', 'Turma__c': 'T3', 'Tipo_de_Matricula_Atual__c': '13'},
        ]
        rows = montar([purchase('sale1')], credentials,
                      [{'Credenciamento__c': 'c1'}, {'Credenciamento__c': 'c1'}], {'A'})
        self.assertEqual(rows[0]['aulas_compareceu'], 1)
        self.assertEqual(rows[0]['aulas_faltou'], 1)

    def test_buyer_does_not_inherit_another_participants_attendance(self):
        credentials = [{'Id': 'c1', 'Venda__c': 'sale1', 'Turma__c': 'T1',
                        'Nome_do_Cliente__c': 'Other', 'Tipo_de_Matricula_Atual__c': '28'}]
        row = montar([purchase('sale1')], credentials,
                     [{'Credenciamento__c': 'c1'}], {'A'})[0]
        self.assertEqual((row['aulas_compareceu'], row['aulas_faltou']), (0, 0))

    def test_no_attendance_does_not_invent_absences(self):
        row = montar([purchase('sale1')], [], [], {'A'})[0]
        self.assertEqual((row['aulas_compareceu'], row['aulas_faltou']), (0, 0))

    def test_without_cpf_or_email_accounts_remain_distinct(self):
        records = [purchase('sale1', account='A'), purchase('sale2', account='B')]
        for r in records:
            r['Account']['CPFun__c'] = None
            r['Account']['PersonEmail'] = None
        rows = montar(records, [], [], {'A', 'B'})
        self.assertEqual({r['cpf'] for r in rows}, {'sf:A', 'sf:B'})

    def test_latest_nonempty_contact_and_leading_zero_cpf(self):
        earlier = purchase('sale1')
        earlier['Account']['CPFun__c'] = '1234567890'
        later = copy.deepcopy(earlier)
        later.update(Id='sale2', Data_de_Aprova_o__c='2026-08-10')
        later['Account']['PersonEmail'] = None
        rows = montar([earlier, later], [], [], {'A'})
        self.assertEqual(rows[0]['cpf'], '01234567890')
        self.assertEqual(rows[0]['email'], 'teste@example.test')

    def test_bad_source_or_empty_snapshot_rejected(self):
        record = purchase('sale1')
        record['Unidade_Geradora_Venda__r']['Name'] = 'FEBRACIS SALVADOR 2'
        with self.assertRaises(RuntimeError):
            montar([record], [], [], {'A'})
        with self.assertRaises(RuntimeError):
            montar([], [], [], set())
        record = purchase('sale2', day=None)
        with self.assertRaises(RuntimeError):
            montar([record], [], [], {'A'})

    def test_cli_response_body_decoded(self):
        with patch('maestros_recife_sync.shutil.which', return_value='sf.cmd'):
            sf = SalesforceCLI('Test')
        with patch.object(sf, 'call', return_value={'statusCode': 200, 'body': '{"reportMetadata": {}}'}):
            self.assertEqual(sf.get('/report'), {'reportMetadata': {}})
        with patch.object(sf, 'call', return_value={'statusCode': 403}):
            with self.assertRaises(RuntimeError):
                sf.get('/report')


if __name__ == '__main__':
    unittest.main()

