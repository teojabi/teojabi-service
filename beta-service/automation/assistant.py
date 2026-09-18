"""Read-only assistant search over public.naver with nearest-station distance and origin split.

Input (stdin JSON): { districts?, q?, budgetWon?, minAreaM2?, maxAreaM2?, kind?,
                       zones?, stationName?, maxDistanceM?, minRoadWidthM?, purpose?,
                       sort?, limit? }
Output (stdout JSON): { status, total, groups, districts, station, relaxations, conditionConflict }

Every row carries origin: 'premium' (터잡이 추천), 'registered' (터잡이 등록), or 'naver'.
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
WALK_METERS_PER_MIN = 80
MAX_LIMIT = 60
PREVIEW = 5


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and n > 0 else None
    except (ValueError, TypeError):
        return None


def clean(value, max_len=60):
    return str(value or '').strip()[:max_len]


def origin_expression():
    """Classify each naver row using the curation candidate table when it exists."""
    return '''CASE
        WHEN c.snapshot->'teojabiPick'->>'status' = 'published' THEN 'premium'
        WHEN c.source_id IS NOT NULL THEN 'registered'
        ELSE 'naver' END'''


def resolve_station(cur, name):
    token = re.sub(r'\s+', '', clean(name, 30))
    token = re.sub(r'역$', '', token)
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
    if kind == 'land':
        where.append("n.\"주용도코드명\"='토지'")
    elif kind == 'building':
        where.append("n.\"주용도코드명\"<>'토지'")
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
    road = number(filters.get('minRoadWidthM'))
    if road:
        where.append('n."도로폭_m" >= %s')
        params.append(road)
    purpose = filters.get('purpose')
    if purpose == 'new-build':
        where.append("COALESCE(n.\"사용승인일자\",'') <> '' AND n.\"사용승인일자\" < '2000-01-01'")
    if station:
        max_distance = number(filters.get('maxDistanceM'))
        if max_distance:
            where.append('ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography) <= %s')
            params += [station['lng'], station['lat'], max_distance]
    return where, params


def station_distance_params(station):
    """역 기준 정렬에 쓰는 (lng, lat) 파라미터. build_where의 거리 필터와 별개로 항상 붙는다."""
    return [station['lng'], station['lat']] if station else []


def row_dto(row, station, requested):
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
        'approvalDate': row['사용승인일자'] or '',
        'pnu': row['pnu'] if row.get('pnu') else None,
        'origin': row['origin'],
        'teojabiNo': row.get('teojabi_no') or None,
    }
    if station is not None and row.get('requested_dist_m') is not None:
        meters = round(float(row['requested_dist_m']))
        out['station'] = {'name': station['station_name'], 'distM': meters, 'walkMin': max(1, round(meters / WALK_METERS_PER_MIN))}
    elif row['station_name']:
        meters = round(float(row['dist_m']))
        out['station'] = {'name': row['station_name'], 'distM': meters, 'walkMin': max(1, round(meters / WALK_METERS_PER_MIN))}
    return out


def count(cur, where, params):
    cur.execute('SELECT count(*) AS total FROM public.naver n WHERE ' + ' AND '.join(where), params)
    return int(cur.fetchone()['total'])


def relaxations(cur, filters, station, base_where, base_params, base_total):
    """Offer concrete alternatives that change the result count, cheapest first."""
    out = []
    step = number(filters.get('budgetWon'))
    if step:
        for factor, label in ((1.5, '까지 높이기'), (2.0, '까지 높이기')):
            bigger = int(round(step * factor / 1e7) * 1e7)
            trial = dict(filters); trial['budgetWon'] = bigger
            where, params = build_where(trial, station)
            total = count(cur, where, params)
            if total != base_total:
                out.append({'label': f'예산 {round(bigger/1e8):g}억{label}', 'patch': {'budgetWon': bigger}, 'count': total})
                break
    distance = number(filters.get('maxDistanceM'))
    if distance:
        for bigger in (round(distance * 1.5), round(distance * 2)):
            trial = dict(filters); trial['maxDistanceM'] = bigger
            where, params = build_where(trial, station)
            total = count(cur, where, params)
            if total != base_total:
                out.append({'label': f'{station["station_name"]}역 {bigger}m까지', 'patch': {'maxDistanceM': bigger}, 'count': total})
                break
    road = number(filters.get('minRoadWidthM'))
    if road:
        trial = dict(filters); trial.pop('minRoadWidthM', None)
        where, params = build_where(trial, station)
        total = count(cur, where, params)
        if total != base_total:
            out.append({'label': '도로폭 조건 빼기', 'patch': {'minRoadWidthM': None}, 'count': total})
    if filters.get('zones'):
        trial = dict(filters); trial.pop('zones', None)
        where, params = build_where(trial, station)
        total = count(cur, where, params)
        if total != base_total:
            out.append({'label': '용도지역 조건 빼기', 'patch': {'zones': None}, 'count': total})
    if filters.get('districts'):
        trial = dict(filters); trial.pop('districts', None)
        where, params = build_where(trial, station)
        total = count(cur, where, params)
        if total != base_total:
            out.append({'label': '서울 전체로 넓히기', 'patch': {'districts': None}, 'count': total})
    if filters.get('kind') == 'land':
        trial = dict(filters); trial['kind'] = 'building'
        where, params = build_where(trial, station)
        total = count(cur, where, params)
        out.append({'label': '건물도 함께 보기', 'patch': {'kind': 'building'}, 'count': total})
    return out


def search(conn, filters):
    limit = int(number(filters.get('limit')) or MAX_LIMIT)
    limit = max(5, min(MAX_LIMIT, limit))
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        station = resolve_station(cur, filters.get('stationName')) if filters.get('stationName') else None
        where, params = build_where(filters, station)
        where_sql = ' AND '.join(where)
        total = count(cur, where, params)
        cur.execute('SELECT "구", count(*) AS n FROM public.naver n WHERE ' + where_sql + ' GROUP BY "구" ORDER BY n DESC LIMIT 6', params)
        districts = [{'name': r['구'], 'count': int(r['n'])} for r in cur.fetchall() if r['구']]
        has_curation = bool(cur.execute("SELECT to_regclass('public.teojabi_curation_candidates') AS name") or cur.fetchone()['name'])
        join = '' if not has_curation else 'LEFT JOIN public.teojabi_curation_candidates c ON c.source_id=n."매물번호" AND c.source_table IN (\'naver\',\'naver_land\')'
        origin = "'naver'" if not has_curation else origin_expression()
        pick_no = "NULL" if not has_curation else "c.snapshot->'teojabiPick'->>'pickNo'"
        select_point = ''
        if station:
            # 요청한 역까지의 거리를 결과에 실어 보낸다. ORDER BY와 같은 좌표를 두 번 쓰지 않는다.
            select_point = ''', ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography,
                          ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography) AS requested_dist_m'''
        order = 'CASE WHEN ' + origin + "='naver' THEN 1 ELSE 0 END, n.\"거래가격\""
        if station:
            order = 'ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography), ' + order
        # SQL 파라미터 순서는 SELECT(요청 역 거리) → WHERE → ORDER BY(역 기준 정렬) → LIMIT 이다.
        query_params = station_distance_params(station) + params + station_distance_params(station) + [limit]
        row_sql = '''SELECT n."매물번호", n."대지위치", n."거래가격", n."대지면적", n."연면적", n."층정보",
                            n."구", n."동", n."주용도코드명", n."용도지역", n."매물특징", n."도로폭_m",
                            n."사용승인일자", n.pnu, n.lat, n.lng, s.station_name, s.dist_m,
                            ''' + origin + ''' AS origin, ''' + pick_no + ''' AS teojabi_no''' + select_point + '''
                     FROM public.naver n ''' + join + '''
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
                     LIMIT %s'''
        cur.execute(row_sql, query_params)
        rows = [row_dto(r, station, station) for r in cur.fetchall()]
        grouped = {'premium': [], 'registered': [], 'naver': []}
        for row in rows:
            grouped[row['origin']].append(row)
        # 터잡이 추천·등록을 먼저 보여주고, 남은 자리를 네이버로 채운다.
        ordered = grouped['premium'] + grouped['registered'] + grouped['naver']
        groups = [{'key': row['id'], 'pnu': row.get('pnu'), 'representative': None, 'listings': []} for row in ordered[:limit]]
        for group, row in zip(groups, ordered[:limit]):
            group['representative'] = row
        counts = {k: len(v) for k, v in grouped.items()}
        origin_totals = {}
        for key, clause in (('premium', "c.snapshot->'teojabiPick'->>'status'='published'"),
                            ('registered', "c.source_id IS NOT NULL AND COALESCE(c.snapshot->'teojabiPick'->>'status','')<>'published'")):
            if not has_curation:
                origin_totals[key] = 0; continue
            trial_where = where + [clause]
            trial_params = params + []
            try:
                cur.execute('SELECT count(*) AS total FROM public.naver n LEFT JOIN public.teojabi_curation_candidates c ON c.source_id=n."매물번호" AND c.source_table IN (\'naver\',\'naver_land\') WHERE ' + ' AND '.join(trial_where), trial_params)
                origin_totals[key] = int(cur.fetchone()['total'])
            except Exception:
                conn.rollback(); origin_totals[key] = 0
        origin_totals['naver'] = total - origin_totals.get('premium', 0) - origin_totals.get('registered', 0)
        relax = relaxations(cur, filters, station, where, params, total) if total == 0 else []
    result = {'status': 'ready', 'total': total, 'groups': groups, 'districts': districts,
              'originTotals': origin_totals, 'relaxations': relax,
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
