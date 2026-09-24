"""Read-only auction reader for the beta data service.

Operations (invoked as: auction_reader.py <op> [json|value]):
- list   {"gu","usage","minPrice","maxPrice","failMax","saleFrom","saleTo","sort","page","size"}
- map    {"swLng","swLat","neLng","neLat","limit"}
- detail <docid>

Reads public.auction_item / public.auction_detail from the configured data DB
(local 5433 or Supabase). Never writes. No rights analysis; facts only.
"""
import json
import os
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from pathlib import Path
import ast

import psycopg2
from psycopg2.extensions import parse_dsn
from psycopg2.extras import RealDictCursor


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


LIST_COLUMNS = ('docid, court_name, dept_name, case_no, usage_name, appraised_amt, min_price, '
                'noti_min_price, noti_min_rate, fail_count, sale_date, sale_hour, sido, sigu, dong, '
                'lot_no, building_list, area_min, area_max, lat, lng, pnu, use_zone, road_width_m, full_address')


def do_list(payload):
    gu = (payload.get('gu') or '').strip() or None
    usage = (payload.get('usage') or '').strip() or None
    min_price = _num(payload.get('minPrice'))
    max_price = _num(payload.get('maxPrice'))
    fail_max = _num(payload.get('failMax'))
    sale_from = (payload.get('saleFrom') or '').strip() or None
    sale_to = (payload.get('saleTo') or '').strip() or None
    sort = payload.get('sort') or 'sale'
    page = _int(payload.get('page'), 1, 1, 500)
    size = _int(payload.get('size'), 20, 1, 100)
    order = {'price': 'min_price ASC NULLS LAST',
             'price_desc': 'min_price DESC NULLS LAST',
             'fail': 'fail_count DESC NULLS LAST',
             'area': 'area_max DESC NULLS LAST'}.get(sort, 'sale_date ASC NULLS LAST')
    where = ["court_code IS NOT NULL"]
    params = {}
    if gu:
        where.append('sigu = %(gu)s'); params['gu'] = gu
    if usage:
        where.append('usage_name ILIKE %(usage)s'); params['usage'] = f'%{usage}%'
    if min_price is not None:
        where.append('min_price >= %(minp)s'); params['minp'] = min_price
    if max_price is not None:
        where.append('min_price <= %(maxp)s'); params['maxp'] = max_price
    if fail_max is not None:
        where.append('fail_count <= %(fail)s'); params['fail'] = fail_max
    if sale_from:
        where.append('sale_date >= %(from)s'); params['from'] = sale_from
    if sale_to:
        where.append('sale_date <= %(to)s'); params['to'] = sale_to
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
    return {'status': 'ready', 'total': total, 'page': page, 'size': size, 'rows': rows}


def do_map(payload):
    sw_lng, sw_lat = _num(payload.get('swLng')), _num(payload.get('swLat'))
    ne_lng, ne_lat = _num(payload.get('neLng')), _num(payload.get('neLat'))
    if None in (sw_lng, sw_lat, ne_lng, ne_lat):
        return {'status': 'invalid', 'rows': []}
    limit = _int(payload.get('limit'), 800, 1, 2000)
    with connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('''SELECT docid, usage_name, min_price, appraised_amt, fail_count, sale_date,
                                  lat, lng, sigu, dong
                           FROM public.auction_item
                           WHERE lat BETWEEN %s AND %s AND lng BETWEEN %s AND %s
                           LIMIT %s''',
                        [min(sw_lat, ne_lat), max(sw_lat, ne_lat),
                         min(sw_lng, ne_lng), max(sw_lng, ne_lng), limit])
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
