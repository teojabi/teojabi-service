"""Read-only local preview bridge. Never imports or runs the user's ETL scripts."""
import ast
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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
    if os.getenv('TEOJABI_SERVICE_MODE') == 'production' and mode != 'supabase':
        raise ValueError('Production requires Supabase')
    if mode in ('supabase', 'remote'):
        dsn = os.getenv('TEOJABI_DATABASE_URL') or os.getenv('DATABASE_URL')
        if not dsn:
            raise ValueError('Remote database URL required')
        # Prisma accepts client-only URL options that libpq/psycopg2 rejects.
        # Remove only those options and preserve the database endpoint and SSL options.
        parts = urlsplit(dsn)
        query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
                 if key not in ('pgbouncer', 'connection_limit')]
        dsn = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
        return dsn, 'supabase'
    return _local_dsn(), 'local'


def connect():
    dsn, mode = _data_dsn()
    config = parse_dsn(dsn)
    host = config.get('host') or ''
    port = config.get('port')
    if mode == 'local':
        if host not in ('localhost', '127.0.0.1') or port != '5433':
            raise ValueError('Local database required')
    else:
        if not (host.endswith('.supabase.co') or 'pooler.supabase.com' in host):
            raise ValueError('Supabase database required')
        if port not in ('5432', '6543'):
            raise ValueError('Unexpected Supabase port')
        config.setdefault('sslmode', 'require')
    return psycopg2.connect(**config, connect_timeout=10, application_name='teojabi_beta_preview',
                           options='-c default_transaction_read_only=on -c statement_timeout=20000')


def read(operation, value=None):
    if operation not in ('catalog', 'parcel', 'risk', 'context', 'registers', 'site-parcels', 'parcel-context', 'parcel-documents', 'land-record', 'nearby-transactions', 'selected-risk', 'selected-context', 'selected-registers', 'selected-land-record', 'naver-listing', 'disco-listing', 'commercial', 'commercial-areas'):
        raise ValueError('Unsupported operation')
    if operation == 'parcel' and not re.fullmatch(r'\d{19}', value or ''):
        raise ValueError('Invalid parcel')
    connection = connect()
    try:
        if operation == 'naver-listing':
            if not re.fullmatch(r'\d{1,30}', value or ''):
                raise ValueError('Invalid listing number')
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute('''SELECT "매물번호" AS "sourceId", "대지위치" AS address, "구" AS district, "동" AS neighborhood,
                                         pnu, lat, lng, "거래가격" AS price, "대지면적" AS landArea, "연면적" AS floorArea,
                                         "층정보" AS floorInfo, "주용도코드명" AS mainUse, "매물특징" AS description,
                                         "용도지역" AS zoning, "도로폭_m" AS roadWidth, "사용승인일자" AS approvalDate
                                  FROM public.naver WHERE "매물번호"=%s LIMIT 1''', (value,))
                row = cursor.fetchone()
            if not row:
                return {'status': 'missing'}
            # RealDictCursor lowercases unquoted aliases like landArea; read positionally to stay exact.
            keys = ['sourceId', 'address', 'district', 'neighborhood', 'pnu', 'lat', 'lng', 'price',
                    'landArea', 'floorArea', 'floorInfo', 'mainUse', 'description', 'zoning', 'roadWidth', 'approvalDate']
            data = dict(zip(keys, list(row.values())))
            price = data['price']
            zoning_text = str(data['zoning'] or '').strip()
            broad = None
            for label, key in (('주거지역', '주거'), ('상업지역', '상업'), ('공업지역', '공업'), ('녹지지역', '녹지')):
                if key in zoning_text:
                    broad = label; break
            return {'status': 'ready', 'sourceId': str(data['sourceId']), 'address': data['address'] or '',
                    'district': data['district'] or '', 'neighborhood': data['neighborhood'] or '',
                    'pnu': data['pnu'] if data['pnu'] and re.fullmatch(r'\d{19}', str(data['pnu'])) else None,
                    'position': {'lat': float(data['lat']), 'lng': float(data['lng'])} if data['lat'] and data['lng'] else None,
                    'priceWon': int(round(float(price) * 100000000)) if price is not None else None,
                    'areaM2': float(data['landArea']) if data['landArea'] else None,
                    'floorAreaM2': float(data['floorArea']) if data['floorArea'] else None,
                    'floorInfo': data['floorInfo'] or '', 'description': data['description'] or '',
                    'approvalDate': data['approvalDate'] or '', 'roadWidthM': float(data['roadWidth']) if data['roadWidth'] else None,
                    'zoning': {'status': 'matched', 'groups': [broad] if broad else [], 'entries': [{'name': zoning_text}]} if zoning_text else {'status': 'missing', 'groups': [], 'entries': []},
                    'kind': 'land' if data['mainUse'] == '토지' else 'building'}
        if operation == 'disco-listing':
            if not re.fullmatch(r'[A-Za-z0-9]{4,24}', value or ''):
                raise ValueError('Invalid disco listing')
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute('''SELECT did::text AS "sourceId", address, gu, dong, pnu, lat, lng,
                                         price_manwon, land_area_m2, floor_area_m2, ts, use_zone, road_width_m
                                  FROM public.disco_listing WHERE did::text=%s AND active LIMIT 1''', (value,))
                row = cursor.fetchone()
            if not row:
                return {'status': 'missing'}
            data = dict(row)
            zoning_text = str(data['use_zone'] or '').strip()
            broad = None
            for label, key in (('주거지역', '주거'), ('상업지역', '상업'), ('공업지역', '공업'), ('녹지지역', '녹지')):
                if key in zoning_text:
                    broad = label; break
            price = data['price_manwon']
            return {'status': 'ready', 'sourceId': str(data['sourceId']), 'address': data['address'] or '',
                    'district': data['gu'] or '', 'neighborhood': data['dong'] or '',
                    'pnu': data['pnu'] if data['pnu'] and re.fullmatch(r'\d{19}', str(data['pnu'])) else None,
                    'position': {'lat': float(data['lat']), 'lng': float(data['lng'])} if data['lat'] is not None and data['lng'] is not None else None,
                    'priceWon': int(round(float(price) * 10000)) if price is not None else None,
                    'areaM2': float(data['land_area_m2']) if data['land_area_m2'] else None,
                    'floorAreaM2': float(data['floor_area_m2']) if data['floor_area_m2'] else None,
                    'kind': 'land' if str(data['ts']) == '1' else 'building',
                    'roadWidthM': float(data['road_width_m']) if data['road_width_m'] else None,
                    'zoning': {'status': 'matched', 'groups': [broad] if broad else [], 'entries': [{'name': zoning_text}]} if zoning_text else {'status': 'missing', 'groups': [], 'entries': []}}
        if operation.startswith('selected-'):
            reference=json.loads(value)
            if not isinstance(reference,dict) or not re.fullmatch(r'(?:\d{1,30}|[a-f0-9-]{36}|[A-Za-z0-9]{4,24})',reference.get('sourceId','')):
                raise ValueError('Invalid selected listing')
            if reference.get('pnu') is not None and not re.fullmatch(r'11\d{17}',reference['pnu']):
                raise ValueError('Invalid parcel')
            if not isinstance(reference.get('address'),str) or len(reference['address'])>300:
                raise ValueError('Invalid address')
            if operation=='selected-land-record':
                from land_reader import read_land_record
                return read_land_record(connection,reference['sourceId'],reference=reference)
            from risk_reader import read_risk
            return read_risk(connection,reference['sourceId'],include_registers=operation!='selected-context',include_context=operation!='selected-registers',reference=reference)
        if operation == 'nearby-transactions':
            from transaction_reader import read_transactions
            return read_transactions(connection, json.loads(value))
        if operation == 'parcel-context':
            from risk_reader import read_risk
            return read_risk(connection, value, include_registers=False, parcel_pnu=value)
        if operation == 'parcel-documents':
            if not re.fullmatch(r'11\d{17}', value or ''):
                raise ValueError('Invalid parcel')
            from risk_reader import read_risk
            from land_reader import read_land_record
            risk = read_risk(connection, value, include_context=False, parcel_pnu=value)
            return {'status': 'ready', 'pnu': value, 'address': risk.get('address'),
                    'registers': risk,
                    'land': read_land_record(connection, value, reference={'pnu': value, 'address': risk.get('address') or ''})}
        if operation == 'land-record':
            from land_reader import read_land_record
            return read_land_record(connection, value)
        if operation in ('risk', 'context', 'registers'):
            from risk_reader import read_risk
            return read_risk(connection, value, include_registers=operation != 'context', include_context=operation != 'registers')
        if operation == 'site-parcels':
            from site_reader import read_site_parcels
            return read_site_parcels(connection, json.loads(value))
        if operation in ('commercial', 'commercial-areas'):
            from commercial_reader import read_commercial, read_commercial_areas
            if operation == 'commercial':
                return read_commercial(connection, value or '{}')
            return read_commercial_areas(connection, value or '{}')
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            if operation == 'catalog':
                cursor.execute('''
                    SELECT "매물번호" AS "sourceId", "거래가격" AS "askingPrice",
                           "대지면적" AS "landArea", "연면적" AS "floorArea",
                           "층정보" AS "floorInfo", "구" AS district, "동" AS neighborhood,
                           "매물특징" AS description, "대지위치" AS address, pnu, "상태" AS status,
                           "주용도코드명" AS "mainUse",
                           lat AS "sourceLat", lng AS "sourceLng",
                           CASE WHEN ST_SRID(geom)=5174 AND GeometryType(geom)='POINT'
                                THEN ST_Y(ST_Transform(geom,4326)) END AS latitude,
                           CASE WHEN ST_SRID(geom)=5174 AND GeometryType(geom)='POINT'
                                THEN ST_X(ST_Transform(geom,4326)) END AS longitude
                    FROM public.naver ORDER BY "매물번호"
                ''')
                return {'observedAt': datetime.now(timezone.utc).isoformat(), 'rows': cursor.fetchall()}
            cursor.execute('''
                SELECT ST_IsValid(geom) AS valid, ST_SRID(geom) AS srid,
                       CASE WHEN ST_IsValid(geom) AND ST_SRID(geom)=5174
                            THEN ST_AsGeoJSON(ST_ForcePolygonCCW(ST_Transform(geom,4326)))::json
                       END AS geometry
                FROM public.seoul_parcel_map WHERE pnu=%s LIMIT 2
            ''', (value,))
            rows = cursor.fetchall()
            if len(rows) != 1:
                return {'status': 'ambiguous' if rows else 'missing', 'pnu': value}
            row = rows[0]
            if not row['valid'] or row['srid'] != 5174 or row['geometry'] is None:
                return {'status': 'invalid', 'pnu': value}
            return {'status': 'ready', 'pnu': value, 'geometry': row['geometry'], 'source': 'seoul_parcel_map'}
    finally:
        connection.rollback()
        connection.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        print(json.dumps(read(*sys.argv[1:]), ensure_ascii=False, default=str, allow_nan=False))
    except Exception:
        # Never send connection details, credentials, or raw SQL errors to the browser.
        print(json.dumps({'status': 'error', 'reason': 'LOCAL_DATA_UNAVAILABLE'}))
        sys.exit(1)
