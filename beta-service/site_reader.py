from source_relations import ledger_relation
"""Bounded, read-only parcel lookup for the site's existing 'My land' flow."""
import re
from psycopg2.extras import RealDictCursor


def read_site_parcels(connection, query):
    prefix = ''
    if set(query) == {'pnu'} and re.fullmatch(r'11\d{17}', str(query['pnu'])):
        source = 'SELECT pnu,"대지위치" AS address FROM public.master_land WHERE pnu=%s LIMIT 2'
        params = (query['pnu'],)
    elif set(query) == {'address'} and isinstance(query['address'], str) and 6 <= len(query['address']) <= 150:
        address = re.sub(r'\s+', ' ', query['address']).strip()
        address = re.sub(r'^서울(?:시)? ', '서울특별시 ', address)
        address = re.sub(r'번지$', '', address).strip()
        variants = [address, address+'번지', address.replace('서울특별시 ', '서울시 ', 1)]
        source = 'SELECT pnu,"대지위치" AS address FROM public.master_land WHERE "대지위치"=ANY(%s) LIMIT 41'
        params = (variants,)
    elif set(query) == {'lat', 'lng'} and all(type(query[k]) in (int, float) for k in query) and 37.3 <= query['lat'] <= 37.9 and 126.6 <= query['lng'] <= 127.4:
        prefix = 'center AS (SELECT ST_Transform(ST_SetSRID(ST_Point(%s,%s),4326),5174) AS geom),'
        source = '''SELECT m.pnu,m."대지위치" AS address FROM public.master_land m,center c
                    WHERE m.geom && ST_Expand(c.geom,100)
                    ORDER BY m.geom <-> c.geom LIMIT 41'''
        params = (query['lng'], query['lat'])
    else:
        raise ValueError('Invalid parcel query')
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(f'''WITH {prefix} candidates AS ({source})
            SELECT c.pnu,c.address,l."면적" AS "officialArea",l.source_snapshot_date AS "ledgerDate",
                CASE WHEN ST_IsValid(p.geom) AND NOT ST_IsEmpty(p.geom)
                AND ST_SRID(p.geom)=5174 AND GeometryType(p.geom) IN ('POLYGON','MULTIPOLYGON')
                THEN ST_AsGeoJSON(ST_ForcePolygonCCW(ST_Transform(p.geom,4326)))::json END AS geometry
            FROM candidates c LEFT JOIN public.seoul_parcel_map p ON p.pnu=c.pnu
            LEFT JOIN '''+ledger_relation()+''' l ON l.pnu=c.pnu LIMIT 42''', params)
        return {'status': 'ready', 'rows': cursor.fetchall()}
