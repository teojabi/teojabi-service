import unittest
from unittest.mock import MagicMock, patch
from curation import audit_removed, update


class FakeCursor:
    def __init__(self, sync=True, verified=True, naver=None, naver_land=None,
                 candidates=None, premium=None, naver_exists=True,
                 naver_land_exists=True, property_exists=True):
        self.sync=sync; self.verified=verified
        self.naver=naver or []; self.naver_land=naver_land or []
        self.candidates=candidates or []; self.premium=premium or []
        self.naver_exists=naver_exists; self.naver_land_exists=naver_land_exists
        self.property_exists=property_exists
        self._one=None; self._rows=[]
    def __enter__(self): return self
    def __exit__(self,*_): return False
    def execute(self, sql, params=None):
        s=' '.join(str(sql).split())
        if 'to_regclass' in s:
            if 'teojabi_naver_sync_state' in s:
                self._one={'relation':'sync' if self.sync else None}
            else:
                if params:
                    table=params[0]
                else:
                    table=next(t for t in ('public.naver_land','public.naver','public.property') if t in s)
                exists={'public.naver':self.naver_exists,
                        'public.naver_land':self.naver_land_exists,
                        'public.property':self.property_exists}.get(table,True)
                self._one={'relation':table if exists else None}
        elif 'completed_at' in s and 'deletion_allowed' in s:
            self._one={'completed_at':'2026-09-16','deletion_allowed':self.verified}
        elif 'FROM public.naver_land' in s:
            self._rows=[{'address':a} for a in self.naver_land]
        elif 'FROM public.naver' in s:
            self._rows=[{'address':a} for a in self.naver]
        elif 'FROM public.property' in s:
            self._rows=self.premium
        elif 'teojabi_curation_candidates' in s:
            self._rows=self.candidates
        else:
            self._rows=[]
    def fetchone(self): return self._one
    def fetchall(self): return self._rows


def connection(**kwargs):
    conn=MagicMock()
    conn.cursor.return_value.__enter__.return_value=FakeCursor(**kwargs)
    return conn


class RemovedListingsTest(unittest.TestCase):
    @patch('curation.read_hidden_ids',return_value=set())
    def test_address_relisting_and_premium(self,_):
        conn=connection(
            naver=['서울특별시 강서구 화곡동 1075-42'],
            candidates=[{'source_table':'naver','source_id':'1','snapshot':{'address':'서울시 강서구 화곡동 1075-42'}},
                        {'source_table':'naver','source_id':'2','snapshot':{'address':'서울특별시 중구 황학동 12-3'}},
                        {'source_table':'naver','source_id':'3','snapshot':{'address':'중구'}}],
            premium=[{'source_id':'uuid','address':'서울특별시 종로구 숭인동 123','title':'픽'}])
        result=audit_removed(conn)
        self.assertEqual([r['source_id'] for r in result['rows']],['2','uuid'])
        self.assertTrue(result['rows'][1]['pick'])
        self.assertTrue(result['deletionAllowed'])

    @patch('curation.read_hidden_ids',return_value=set())
    def test_land_listing_alive_only_in_naver_land(self,_):
        conn=connection(
            naver=['서울특별시 강서구 화곡동 1075-42'],
            naver_land=['서울특별시 강남구 자곡동 2-13'],
            candidates=[{'source_table':'naver_land','source_id':'9','snapshot':{'address':'서울특별시 강남구 자곡동 2-13'}}])
        self.assertEqual(audit_removed(conn)['rows'],[])

    @patch('curation.read_hidden_ids',return_value=set())
    def test_land_listing_gone_from_naver_land(self,_):
        conn=connection(
            naver_land=['서울특별시 강남구 자곡동 2-13'],
            candidates=[{'source_table':'naver_land','source_id':'9','snapshot':{'address':'서울특별시 서초구 염곡동 97-16'}}])
        self.assertEqual([r['source_id'] for r in audit_removed(conn)['rows']],['9'])

    @patch('curation.read_hidden_ids',return_value=set())
    def test_missing_naver_land_table_is_skipped(self,_):
        conn=connection(
            naver_land=['서울특별시 강남구 자곡동 2-13'], naver_land_exists=False,
            candidates=[{'source_table':'naver_land','source_id':'9','snapshot':{'address':'서울특별시 서초구 염곡동 97-16'}}])
        self.assertEqual(audit_removed(conn)['rows'],[])

    def test_missing_success_marker(self):
        self.assertEqual(audit_removed(connection(sync=False))['status'],'unavailable')

    @patch('curation.read_hidden_ids',return_value=set())
    def test_unverified_sync_lists_but_flags_deletion(self,_):
        conn=connection(verified=False,naver=['서울특별시 강서구 화곡동 1075-42'],
                        candidates=[{'source_table':'naver','source_id':'9','snapshot':{'address':'서울특별시 서초구 염곡동 97-16'}}])
        result=audit_removed(conn)
        self.assertEqual(result['status'],'checked')
        self.assertFalse(result['deletionAllowed'])
        self.assertEqual([r['source_id'] for r in result['rows']],['9'])

    @patch('curation.read_hidden_ids',return_value=set())
    def test_delete_blocked_until_verified(self,_):
        conn=connection(verified=False,naver=['서울특별시 강서구 화곡동 1075-42'],
                        candidates=[{'source_table':'naver','source_id':'9','snapshot':{'address':'서울특별시 서초구 염곡동 97-16'}}])
        result=update(conn,{'action':'delete_removed','source_table':'naver','source_id':'9'})
        self.assertEqual(result['status'],'conflict')


if __name__=='__main__': unittest.main()
