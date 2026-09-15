"""Read-only local preview bridge. Never imports or runs the user's ETL scripts."""
import ast
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

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
    if operation not in ('catalog', 'parcel', 'risk', 'context', 'registers', 'site-parcels', 'parcel-context', 'parcel-documents', 'land-record', 'nearby-transactions', 'selected-risk', 'selected-context', 'selected-registers', 'selected-land-record'):
        raise ValueError('Unsupported operation')
    if operation == 'parcel' and not re.fullmatch(r'\d{19}', value or ''):
        raise ValueError('Invalid parcel')
    connection = connect()
    try:
        if operation.startswith('selected-'):
            reference=json.loads(value)
            if not isinstance(reference,dict) or not re.fullmatch(r'(?:\d{1,30}|[a-f0-9-]{36})',reference.get('sourceId','')):
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
