import sys,unittest
from pathlib import Path
from unittest.mock import Mock,patch
import requests
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'etl'))
from salesforce_api_sync import Salesforce

class RetryTests(unittest.TestCase):
    def setUp(self):
        self.sf=Salesforce.__new__(Salesforce)
        self.sf.instance='https://example.test'
        self.sf.headers={'Authorization':'Bearer test'}
    def response(self,status=200,data=None):
        r=Mock(status_code=status)
        r.json.return_value=data or {'records':[],'done':True}
        if status>=400: r.raise_for_status.side_effect=requests.HTTPError(str(status))
        return r
    @patch('salesforce_api_sync.time.sleep')
    @patch('salesforce_api_sync.requests.get')
    def test_timeout_then_success(self,get,sleep):
        get.side_effect=[requests.ReadTimeout('secret-query'),self.response()]
        self.assertEqual(self.sf.get('/query'),{'records':[],'done':True})
        self.assertEqual(get.call_count,2)
        sleep.assert_called_once_with(2)
    @patch('salesforce_api_sync.time.sleep')
    @patch('salesforce_api_sync.requests.get')
    def test_exhausted_timeout_aborts(self,get,sleep):
        get.side_effect=requests.ReadTimeout('secret-query')
        with self.assertRaisesRegex(RuntimeError,'3 tentativas') as error:self.sf.get('/query')
        self.assertNotIn('secret-query',str(error.exception))
        self.assertEqual(get.call_count,3)
        self.assertEqual(sleep.call_count,2)
    @patch('salesforce_api_sync.time.sleep')
    @patch('salesforce_api_sync.requests.get')
    def test_transient_http_then_success(self,get,sleep):
        for status in (429,500,502,503,504):
            get.reset_mock();sleep.reset_mock()
            get.side_effect=[self.response(status),self.response()]
            self.sf.get('/query');self.assertEqual(get.call_count,2)
    @patch('salesforce_api_sync.time.sleep')
    @patch('salesforce_api_sync.requests.get')
    def test_permanent_errors_not_retried(self,get,sleep):
        for status in (400,401,403):
            get.reset_mock();get.side_effect=None;get.return_value=self.response(status)
            with self.assertRaises(requests.HTTPError):self.sf.get('/query')
            self.assertEqual(get.call_count,1)
        sleep.assert_not_called()
    @patch('salesforce_api_sync.time.sleep')
    @patch('salesforce_api_sync.requests.get')
    def test_pagination_timeout_does_not_duplicate_rows(self,get,sleep):
        get.side_effect=[self.response(data={'records':[{'Id':'a'}],'done':False,'nextRecordsUrl':'/next'}),requests.ReadTimeout(),self.response(data={'records':[{'Id':'b'}],'done':True})]
        self.assertEqual(self.sf.query('SELECT Id FROM Account'),[{'Id':'a'},{'Id':'b'}])
        self.assertEqual(get.call_args_list[1].args,get.call_args_list[2].args)
    @patch('salesforce_api_sync.time.sleep')
    @patch('salesforce_api_sync.requests.get')
    def test_last_http_failure_aborts(self,get,sleep):
        get.return_value=self.response(503)
        with self.assertRaises(requests.HTTPError):self.sf.get('/query')
        self.assertEqual(get.call_count,3)

if __name__=='__main__': unittest.main()
