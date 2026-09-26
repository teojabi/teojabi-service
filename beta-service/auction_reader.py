"""Read-only auction reader for the beta data service.

Operations (invoked as: auction_reader.py <op> [json|value]):
- list   {"gu","usage","kind","q","minPrice","maxPrice","minFail","maxFail","saleFrom","saleTo","sort","page","size"}
- map    {"swLng","swLat","neLng","neLat","limit", <same filters as list>}
- detail <docid>

Reads public.auction_item / public.auction_detail from the configured data DB
(local 5433 or Supabase). Never writes. No rights analysis; facts only.
Apartments are excluded from every query (service focuses on commercial/land/houses).
"""
import json
import os
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from pathlib import Path
import ast

import psycopg2
from psycopg2.extensions import parse_dsn
from psycopg2.extras import RealDictCursor

# 서비스 대상에서 제외하는 용도(콤마로 나눈 토큰 기준). 상가·토지·개인주택 위주.
EXCLUDED_USAGE = ('아파트', '자동차')
# 토지 계열로 보는 용도 키워드. '전답'·'잡종지' 등은 '전'·'답'을 포함한다.
LAND_PATTERN = '토지|대지|임야|전답|잡종지|과수원|목장|답|전'


def _local_dsn():
    source = Path('C:/opencode/database/build_master_land.py')
    tree = ast.parse(source.read_text(encoding='utf-8-sig'))
    return next(ast.literal_eval(n.value) for n in tree.body
                if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'DB' for t in n.targets))


def _data_dsn():
    mode = (os.getenv('TEOJABI_DATA_SOURCE') or 'local').strip().lower()
    if mode in ('supabase', 'remote'):
        dsn = os.getenv('TEOJABI_DATABASE_URL') or os.getenv('DATABASE_URL')
        if not dsn:
            raise ValueError('Remote database URL required')
        parts = urlsplit(dsn)
        query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                 if k not in ('pgbouncer', 'connection_limit')]
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)), 'supabase'
    return _local_dsn(), 'local'


def connect():
    dsn, mode = _data_dsn()
    config = parse_dsn(dsn)
    if mode == 'local':
        if config.get('host') not in ('localhost', '127.0.0.1') or config.get('port') != '5433':
            raise ValueError('Local database required')
    else:
        host = config.get('host') or ''
        if not (host.endswith('.supabase.co') or 'pooler.supabase.com' in host):
            raise ValueError('Supabase database required')
        config.setdefault('sslmode', 'require')
    return psycopg2.connect(**config, connect_timeout=10, application_name='teojabi_auction',
                           options='-c default_transaction_read_only=on -c statement_timeout=20000')


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value, default, lo, hi):
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _text(value, max_len=60):
    text = str(value or '').strip()
    return text[:max_len] or None


def _usage_list(value):
    if value is None:
        return []
    if isinstance(value, str):
        raw = re.split(r'[,\n]', value)
    elif isinstance(value, (list, tuple)):
        raw = value
    else:
        raw = [value]
    return [token.strip()[:30] for token in raw if str(token).strip()]


LIST_COLUMNS = ('docid, court_name, dept_name, case_no, usage_name, appraised_amt, min_price, '
                'noti_min_price, noti_min_rate, fail_count, sale_date, sale_hour, sido, sigu, dong, '
                'lot_no, building_list, jimok, area_min, area_max, lat, lng, pnu, use_zone, '
                'road_width_m, full_address, source_url, deal_type, sale_kind, flags, detail_address, '
                'obj_area_m2, building_area_m2, land_area_m2, deal_type_final, area_source')


def _where(payload):
    where = ["court_code IS NOT NULL"]
    params = {}
    for index, token in enumerate(EXCLUDED_USAGE):
        key = f'excluded{index}'
        where.append(f"NOT (%({key})s = ANY(string_to_array(coalesce(usage_name, ''), ',')))")
        params[key] = token
    deal_type = (payload.get('dealType') or '').strip().lower() or None
    gus = _usage_list(payload.get('gu'))
    q = _text(payload.get('q'), 60)
    kind = (payload.get('kind') or '').strip().lower() or None
    usages = _usage_list(payload.get('usage'))
    zones = _usage_list(payload.get('zone'))
    min_area = _num(payload.get('minArea'))
    max_area = _num(payload.get('maxArea'))
    min_price = _num(payload.get('minPrice'))
    max_price = _num(payload.get('maxPrice'))
    max_rate = _num(payload.get('maxBidRate'))
    min_fail = _num(payload.get('minFail'))
    max_fail = _num(payload.get('maxFail'))
    sale_from = _text(payload.get('saleFrom'), 10)
    sale_to = _text(payload.get('saleTo'), 10)
    if gus:
        where.append('sigu = ANY(%(gus)s)')
        params['gus'] = gus
    if usages:
        clauses = []
        for index, token in enumerate(usages[:6]):
            key = f'usage{index}'
            clauses.append(f'usage_name ILIKE %({key})s')
            params[key] = f'%{token}%'
        where.append('(' + ' OR '.join(clauses) + ')')
    if kind == 'land':
        where.append(f"coalesce(usage_name, '') ~ %(landpat)s")
        params['landpat'] = LAND_PATTERN
    elif kind == 'building':
        where.append(f"coalesce(usage_name, '') !~ %(landpat)s")
        params['landpat'] = LAND_PATTERN
    if deal_type in ('whole', 'floor', 'unit', 'land'):
        where.append('deal_type = %(dealtype)s')
        params['dealtype'] = deal_type
    if zones:
        clauses = []
        for index, token in enumerate(zones[:4]):
            key = f'zone{index}'
            clauses.append(f'use_zone ILIKE %({key})s')
            params[key] = f'%{token}%'
        where.append('(' + ' OR '.join(clauses) + ')')
    if min_area is not None:
        where.append('area_max >= %(minarea)s')
        params['minarea'] = min_area
    if max_area is not None:
        where.append('area_max <= %(maxarea)s')
        params['maxarea'] = max_area
    if q:
        where.append("(coalesce(full_address, '') ILIKE %(q)s OR coalesce(case_no, '') ILIKE %(q)s "
                     "OR coalesce(usage_name, '') ILIKE %(q)s OR coalesce(dong, '') ILIKE %(q)s)")
        params['q'] = f'%{q}%'
    if min_price is not None:
        where.append('min_price >= %(minp)s')
        params['minp'] = min_price
    if max_price is not None:
        where.append('min_price <= %(maxp)s')
        params['maxp'] = max_price
    if max_rate is not None:
        where.append('noti_min_rate <= %(maxrate)s')
        params['maxrate'] = max_rate
    if min_fail is not None:
        where.append('fail_count >= %(minf)s')
        params['minf'] = min_fail
    if max_fail is not None:
        where.append('fail_count <= %(maxf)s')
        params['maxf'] = max_fail
    if sale_from:
        where.append('sale_date >= %(sfrom)s')
        params['sfrom'] = sale_from
    if sale_to:
        where.append('sale_date <= %(sto)s')
        params['sto'] = sale_to
    return where, params


ORDER = {
    'price': 'min_price ASC NULLS LAST',
    'price_desc': 'min_price DESC NULLS LAST',
    'fail': 'fail_count DESC NULLS LAST',
    'area': 'area_max DESC NULLS LAST',
    'sale': 'sale_date ASC NULLS LAST',
}


def do_list(payload):
    page = _int(payload.get('page'), 1, 1, 500)
    size = _int(payload.get('size'), 20, 1, 200)
    sort = payload.get('sort') or 'sale'
    order = ORDER.get(sort, ORDER['sale'])
    where, params = _where(payload)
    clause = ' AND '.join(where)
    params['limit'] = size
    params['offset'] = (page - 1) * size
    with connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f'SELECT count(*) AS n FROM public.auction_item WHERE {clause}', params)
            total = cur.fetchone()['n']
            cur.execute(f'''SELECT {LIST_COLUMNS} FROM public.auction_item
                            WHERE {clause} ORDER BY {order} LIMIT %(limit)s OFFSET %(offset)s''', params)
            rows = cur.fetchall()
    return {'status': 'ready', 'total': total, 'page': page, 'size': size, 'sort': sort, 'rows': rows}


def do_map(payload):
    sw_lng, sw_lat = _num(payload.get('swLng')), _num(payload.get('swLat'))
    ne_lng, ne_lat = _num(payload.get('neLng')), _num(payload.get('neLat'))
    if None in (sw_lng, sw_lat, ne_lng, ne_lat):
        return {'status': 'invalid', 'rows': []}
    limit = _int(payload.get('limit'), 800, 1, 2000)
    where, params = _where(payload)
    where.append('lat BETWEEN %(swlat)s AND %(nelat)s')
    where.append('lng BETWEEN %(swlng)s AND %(nelng)s')
    params.update(swlat=min(sw_lat, ne_lat), nelat=max(sw_lat, ne_lat),
                  swlng=min(sw_lng, ne_lng), nelng=max(sw_lng, ne_lng), limit=limit)
    clause = ' AND '.join(where)
    with connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f'''SELECT docid, usage_name, min_price, appraised_amt, fail_count, sale_date,
                                   lat, lng, sigu, dong
                            FROM public.auction_item WHERE {clause} LIMIT %(limit)s''', params)
            rows = cur.fetchall()
    return {'status': 'ready', 'rows': rows}


def do_detail(docid):
    with connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT * FROM public.auction_item WHERE docid = %s', [docid])
            item = cur.fetchone()
            if not item:
                return {'status': 'missing'}
            cur.execute('SELECT * FROM public.auction_detail WHERE docid = %s', [docid])
            detail = cur.fetchone()
    return {'status': 'ready', 'item': item, 'detail': detail}


def main():
    if len(sys.argv) < 2:
        raise SystemExit('operation required')
    op = sys.argv[1]
    value = sys.argv[2] if len(sys.argv) > 2 else None
    if op == 'list':
        result = do_list(json.loads(value or '{}'))
    elif op == 'map':
        result = do_map(json.loads(value or '{}'))
    elif op == 'detail':
        result = do_detail(value)
    else:
        raise ValueError('Unsupported operation')
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
