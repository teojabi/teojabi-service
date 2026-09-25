"""Read-only public-auction (온비드/캠코) reader for the beta data service.

Operations (invoked as: onbid_reader.py <op> [json|value]):
- list   {"gu","usage","q","minPrice","maxPrice","prptDivCd","sort","page","size"}
- map    {"swLng","swLat","neLng","neLat","limit", <same filters as list>}
- detail "<cltrMngNo>" or "<cltrMngNo>::<pbctCdtnNo>"

Reads public.onbid_item / public.onbid_detail. Never writes.
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
    return psycopg2.connect(**config, connect_timeout=10, application_name='teojabi_onbid',
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


def _tokens(value):
    if value is None:
        return []
    if isinstance(value, str):
        raw = value.replace('\n', ',').split(',')
    elif isinstance(value, (list, tuple)):
        raw = value
    else:
        raw = [value]
    return [str(t).strip()[:30] for t in raw if str(t).strip()]


LIST_COLUMNS = ('onbid_cltrno, cltr_mng_no, pbct_cdtn_no, cltr_nm, prpt_div_cd, prpt_div_nm, '
                'dsps_mthod_nm, bid_mthod_nm, cptn_mthod_nm, usg_lcls_nm, usg_mcls_nm, usg_scls_nm, '
                'appraised_amt, lowst_bid_prc, lowst_bid_disp, apsl_ctrs_lowst_ratio, bid_begin_dt, '
                'bid_end_dt, sido, sigu, dong, lot_no, full_address, pnu, lat, lng')


def _where(payload):
    where = ['cltr_mng_no IS NOT NULL']
    params = {}
    gus = _tokens(payload.get('gu'))
    usages = _tokens(payload.get('usage'))
    q = _text(payload.get('q'), 60)
    prpt = _text(payload.get('prptDivCd'), 10)
    min_price = _num(payload.get('minPrice'))
    max_price = _num(payload.get('maxPrice'))
    if gus:
        where.append('sigu = ANY(%(gus)s)')
        params['gus'] = gus
    if usages:
        clauses = []
        for index, token in enumerate(usages[:6]):
            key = f'usage{index}'
            clauses.append(f'usg_mcls_nm ILIKE %({key})s')
            params[key] = f'%{token}%'
        where.append('(' + ' OR '.join(clauses) + ')')
    if prpt:
        where.append('prpt_div_cd = %(prpt)s')
        params['prpt'] = prpt
    if q:
        where.append("(coalesce(cltr_nm,'') ILIKE %(q)s OR coalesce(full_address,'') ILIKE %(q)s)")
        params['q'] = f'%{q}%'
    if min_price is not None:
        where.append('lowst_bid_prc >= %(minp)s')
        params['minp'] = min_price
    if max_price is not None:
        where.append('lowst_bid_prc <= %(maxp)s')
        params['maxp'] = max_price
    return where, params


ORDER = {
    'price': 'lowst_bid_prc ASC NULLS LAST',
    'price_desc': 'lowst_bid_prc DESC NULLS LAST',
    'appraisal': 'appraised_amt DESC NULLS LAST',
    'bid': 'bid_end_dt ASC NULLS LAST',
}


def do_list(payload):
    page = _int(payload.get('page'), 1, 1, 500)
    size = _int(payload.get('size'), 20, 1, 200)
    sort = payload.get('sort') or 'bid'
    order = ORDER.get(sort, ORDER['bid'])
    where, params = _where(payload)
    clause = ' AND '.join(where)
    params['limit'] = size
    params['offset'] = (page - 1) * size
    with connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f'SELECT count(*) AS n FROM public.onbid_item WHERE {clause}', params)
            total = cur.fetchone()['n']
            cur.execute(f'''SELECT {LIST_COLUMNS} FROM public.onbid_item
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
            cur.execute(f'''SELECT cltr_mng_no, pbct_cdtn_no, cltr_nm, lowst_bid_prc, appraised_amt,
                                   bid_end_dt, lat, lng, sigu, dong
                            FROM public.onbid_item WHERE {clause} LIMIT %(limit)s''', params)
            rows = cur.fetchall()
    return {'status': 'ready', 'rows': rows}


def do_detail(value):
    cltr, _, pbct = (value or '').partition('::')
    with connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if pbct:
                cur.execute('SELECT * FROM public.onbid_item WHERE cltr_mng_no=%s AND pbct_cdtn_no=%s LIMIT 1', [cltr, pbct])
            else:
                cur.execute('SELECT * FROM public.onbid_item WHERE cltr_mng_no=%s LIMIT 1', [cltr])
            item = cur.fetchone()
            if not item:
                return {'status': 'missing'}
            cur.execute('SELECT * FROM public.onbid_detail WHERE cltr_mng_no=%s LIMIT 1', [cltr])
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
