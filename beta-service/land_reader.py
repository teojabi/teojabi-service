from source_relations import ledger_relation
"""One indexed, read-only ledger lookup for the selected listing."""
import re
from psycopg2.extras import RealDictCursor


def read_land_record(connection, source_id, reference=None):
    if not re.fullmatch(r'(?:\d{1,30}|[a-f0-9-]{36}|[A-Za-z0-9]{4,24})' if reference else r'\d{1,30}',source_id or ''):
        raise ValueError('Invalid listing')
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        source_sql='public.naver'
        params=(source_id,)
        if reference is not None:
            source_sql='(SELECT %s::text AS "매물번호",%s::text AS pnu,%s::text AS "대지위치")'
            params=(source_id,reference.get('pnu'),reference['address'],source_id)
        cursor.execute('''SELECT to_jsonb(l) AS "recordFields", n."매물번호" AS "sourceId",n.pnu,n."대지위치" AS "listingAddress",
            l.pnu AS "ledgerPnu",l."법정동명" AS "legalDong",l."지번" AS jibun,
            l."대장구분명" AS "registerType",l."지목명" AS "landCategory",l."면적" AS "officialArea",
            l."소유구분명" AS "ownershipType",l."축척구분명" AS scale,
            l."데이터기준일자" AS "dataDate",l.source_snapshot_date AS "snapshotDate",
            m."대지면적" AS "masterArea",p.calc_area AS "mapArea"
            FROM '''+source_sql+''' n LEFT JOIN '''+ledger_relation()+''' l USING(pnu)
            LEFT JOIN public.master_land m USING(pnu) LEFT JOIN public.seoul_parcel_map p USING(pnu)
            WHERE n."매물번호"=%s LIMIT 2''',params)
        return {'status':'ready','rows':cursor.fetchall()}
