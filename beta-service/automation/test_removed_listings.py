import unittest
from unittest.mock import MagicMock, patch
from curation import audit_removed

class RemovedListingsTest(unittest.TestCase):
    def connection(self, marker=True, verified=True):
        conn=MagicMock(); cursor=conn.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect=[{'relation':'sync' if marker else None}, {'completed_at':'2026-09-16','deletion_allowed':verified}]
        cursor.fetchall.side_effect=[
            [{'address':'서울특별시 강서구 화곡동 1075-42'}],
            [{'source_table':'naver','source_id':'1','snapshot':{'address':'서울시 강서구 화곡동 1075-42'}},
             {'source_table':'naver','source_id':'2','snapshot':{'address':'서울특별시 중구 황학동 12-3'}},
             {'source_table':'naver','source_id':'3','snapshot':{'address':'중구'}}],
            [{'source_id':'uuid','address':'서울특별시 종로구 숭인동 123','title':'픽'}]]
        return conn
    @patch('curation.read_hidden_ids',return_value=set())
    def test_address_relisting_and_premium(self, _):
        result=audit_removed(self.connection())
        self.assertEqual([r['source_id'] for r in result['rows']],['2','uuid'])
        self.assertTrue(result['rows'][1]['pick'])
    def test_missing_success_marker(self):
        self.assertEqual(audit_removed(self.connection(marker=False))['status'],'unavailable')
    def test_incomplete_sync(self):
        self.assertEqual(audit_removed(self.connection(verified=False))['rows'],[])

if __name__=='__main__': unittest.main()
