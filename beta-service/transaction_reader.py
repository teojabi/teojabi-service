"""Bounded nearby transaction lookup against the local spatial index only."""
import math
from psycopg2.extras import RealDictCursor


def read_transactions(connection, query):
    lat, lng = float(query['lat']), float(query['lng'])
    if not (math.isfinite(lat) and math.isfinite(lng) and 37.3 <= lat <= 37.8 and 126.7 <= lng <= 127.3):
        raise ValueError('Invalid position')
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        # Expand the index envelope a little; exact WGS84 distances and the
        # 36-month window are checked by the server policy after this query.
        cursor.execute('''
            SELECT d.id::text, d.pnu, d.t, d.pt, d.p::text, d.y,
                   d.ea::float8, d.la::float8, d.lat::float8, d.lng::float8,
                   d.dt, d.drt
            FROM public.disco_raw d
            WHERE d.geom && ST_Expand(ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),4326),5174),1200)
              AND d.y >= to_char((current_timestamp AT TIME ZONE 'Asia/Seoul') - interval '35 months','YYYYMM')
              AND d.t IN (1,5) AND d.p > 0 AND d.pt=0
            ORDER BY d.id LIMIT 5001
        ''', (lng, lat))
        rows = cursor.fetchall()
        if len(rows) > 5000:
            return {'status': 'error', 'reason': 'TRANSACTION_LIMIT_EXCEEDED'}
        return {'status': 'ready', 'rows': rows}
