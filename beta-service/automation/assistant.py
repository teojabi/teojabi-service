"""Read-only assistant search over public.naver with nearest-station distance.

Input (stdin JSON): { districts?, q?, budgetWon?, minAreaM2?, maxAreaM2?, kind?,
                       zones?, stationName?, maxDistanceM?, sort?, limit? }
Output (stdout JSON): { status, total, rows, districts, station? }

No writes. Never returns broker contacts or review fields.
"""
import json
import math
import re
import sys
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import RealDictCursor
from service_database import service_config as local_config

BROAD = {'주거지역': '주거', '상업지역': '상업', '공업지역': '공업', '녹지지역': '녹지'}
KIND_SQL = {'land': '"주용도코드명"=\'토지\'', 'building': '"주용도코드명"<>\'토지\''}
WALK_METERS_PER_MIN = 80
MAX_LIMIT = 60


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and n > 0 else None
    except (ValueError, TypeError):
        return None


def clean(value, max_len=60):
    return str(value or '').strip()[:max_len]


def resolve_station(cur, name):
    token = re.sub(r'\s+', '', clean(name, 30))
    token = re.sub(r'(역)$', '', token)
    if not token:
        return None
    cur.execute('''SELECT station_name, line_no, lat, lng
                   FROM public.seoul_subway_stations
                   WHERE replace(station_name,' ','') LIKE %s AND lat IS NOT NULL
                   ORDER BY length(station_name) LIMIT 1''', ('%' + token + '%',))
    return cur.fetchone()


def build_where(filters, station):
    where = ['n."상태" IN (\'신규\',\'유지\')', 'n.lat IS NOT NULL', 'n.lng IS NOT NULL']
    params = []
    budget = number(filters.get('budgetWon'))
    if budget:
        where.append('n."거래가격"*100000000 <= %s')
        params.append(budget)
    area_min = number(filters.get('minAreaM2'))
    area_max = number(filters.get('maxAreaM2'))
    if area_min:
        where.append('n."대지면적" >= %s')
        params.append(area_min)
    if area_max:
        where.append('n."대지면적" <= %s')
        params.append(area_max)
    districts = [d for d in (filters.get('districts') or []) if clean(d, 10)]
    if districts:
        where.append('n."구" = ANY(%s)')
        params.append(districts)
    kind = filters.get('kind')
    if kind in KIND_SQL:
        where.append(KIND_SQL[kind])
    keyword = clean(filters.get('q'), 40)
    if keyword:
        where.append('(n."대지위치" ILIKE %s OR n."동" ILIKE %s OR n."매물번호"=%s OR n."주용도코드명" ILIKE %s)')
        params += ['%' + keyword + '%', '%' + keyword + '%', keyword, '%' + keyword + '%']
    zones = [z for z in (filters.get('zones') or []) if z in BROAD]
    if zones:
        clauses = []
        for zone in zones:
            clauses.append('n."용도지역" LIKE %s')
            params.append('%' + BROAD[zone] + '%')
        where.append('(' + ' OR '.join(clauses) + ')')
    if station:
        max_distance = number(filters.get('maxDistanceM'))
        point_sql = 'ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography'
        if max_distance:
            where.append('ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography, ' + point_sql + ') <= %s')
            params += [station['lng'], station['lat'], max_distance]
    return where, params


def row_dto(row, station, requested):
    nearest = row['station_name']
    nearest_dist = round(float(row['dist_m'])) if row['dist_m'] is not None else None
    out = {
        'id': 'naver:' + str(row['매물번호']),
        'sourceId': str(row['매물번호']),
        'address': row['대지위치'] or '',
        'district': row['구'] or '',
        'neighborhood': row['동'] or '',
        'position': {'lat': float(row['lat']), 'lng': float(row['lng'])},
        'priceWon': int(round(float(row['거래가격']) * 100000000)) if row['거래가격'] is not None else None,
        'areaM2': number(row['대지면적']),
        'floorAreaM2': number(row['연면적']),
        'floorInfo': row['층정보'] or '',
        'mainUse': row['주용도코드명'] or '',
        'zoning': row['용도지역'] or '',
        'description': (row['매물특징'] or '')[:300],
        'kind': 'land' if row['주용도코드명'] == '토지' else 'building',
        'roadWidthM': number(row['도로폭_m']),
    }
    if requested is not None and row.get('requested_dist_m') is not None:
        meters = round(float(row['requested_dist_m']))
        out['station'] = {'name': requested['station_name'], 'distM': meters,
                          'walkMin': max(1, round(meters / WALK_METERS_PER_MIN))}
    elif nearest:
        meters = nearest_dist
        out['station'] = {'name': nearest, 'distM': meters,
                          'walkMin': max(1, round(meters / WALK_METERS_PER_MIN))}
    return out


def search(conn, filters):
    limit = int(number(filters.get('limit')) or MAX_LIMIT)
    limit = max(5, min(MAX_LIMIT, limit))
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        station = resolve_station(cur, filters.get('stationName')) if filters.get('stationName') else None
        where, params = build_where(filters, station)
        where_sql = ' AND '.join(where)
        cur.execute('SELECT count(*) AS total FROM public.naver n WHERE ' + where_sql, params)
        total = int(cur.fetchone()['total'])
        cur.execute('''SELECT "구", count(*) AS n FROM public.naver n WHERE ''' + where_sql +
                    ''' GROUP BY "구" ORDER BY n DESC LIMIT 6''', params)
        districts = [{'name': r['구'], 'count': int(r['n'])} for r in cur.fetchall() if r['구']]
        select_point = ''
        select_params = []
        if station:
            select_point = ''', ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography,
                          ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography) AS requested_dist_m'''
            select_params = [station['lng'], station['lat']]
        order = 'n."거래가격"'
        if station:
            order = '''ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography,
                        ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography), n."거래가격"'''
        cur.execute('''SELECT n."매물번호", n."대지위치", n."거래가격", n."대지면적", n."연면적", n."층정보",
                              n."구", n."동", n."주용도코드명", n."용도지역", n."매물특징", n."도로폭_m",
                              n.lat, n.lng, s.station_name, s.dist_m''' + select_point + '''
                       FROM public.naver n
                       CROSS JOIN LATERAL (
                           SELECT station_name,
                                  ST_Distance(ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography,
                                              ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography) AS dist_m
                           FROM public.seoul_subway_stations
                           WHERE lat IS NOT NULL
                           ORDER BY ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography <->
                                    ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography
                           LIMIT 1
                       ) s
                       WHERE ''' + where_sql + '''
                       ORDER BY ''' + order + '''
                       LIMIT %s''',
                    select_params + params + ([station['lng'], station['lat']] if station else []) + [limit])
        rows = [row_dto(r, station, station) for r in cur.fetchall()]
    result = {'status': 'ready', 'total': total, 'rows': rows, 'districts': districts,
              'searchedAt': datetime.now(timezone.utc).isoformat()}
    if station:
        result['station'] = {'name': station['station_name'], 'lineNo': station['line_no'],
                             'lat': float(station['lat']), 'lng': float(station['lng'])}
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    filters = json.loads(sys.stdin.read(200000) or '{}')
    with psycopg2.connect(**local_config(), connect_timeout=5,
                          options='-c statement_timeout=20000 -c default_transaction_read_only=on') as conn:
        result = search(conn, filters)
    print(json.dumps(result, ensure_ascii=False, default=str, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'status': 'error', 'errorType': type(exc).__name__}, ensure_ascii=False))
        sys.exit(1)
