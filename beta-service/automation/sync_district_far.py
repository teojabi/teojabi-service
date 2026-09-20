# -*- coding: utf-8 -*-
"""지구단위계획 용적률·고시정보 서빙 데이터를 로컬 DB에서 운영(Supabase) DB로 이관한다.

- 스키마(테이블·인덱스·뷰): database/migrations/20260921_district_far_supabase.sql 적용
- 데이터: district_far_regulation, district_file_list 두 테이블을 TRUNCATE 후 COPY
- 전제: 운영 DB에 public.district_unit_plan 이 이미 있고 id 체계가 로컬과 같아야 한다.

사용 (로컬 PC에서):
    set TEOJABI_DATABASE_URL=postgresql://postgres.xxxx:비밀번호@aws-0-...pooler.supabase.com:5432/postgres
    python beta-service/automation/sync_district_far.py

로컬 DSN은 C:/opencode/database/build_master_land.py 의 DB 상수를 그대로 읽는다.
"""
import ast
import io
import os
import re
import sys
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / 'database' / 'migrations' / '20260921_district_far_supabase.sql'
TABLES = ['district_far_regulation', 'district_file_list']


def local_dsn():
    source = Path('C:/opencode/database/build_master_land.py')
    tree = ast.parse(source.read_text(encoding='utf-8-sig'))
    return next(ast.literal_eval(node.value) for node in tree.body
                if isinstance(node, ast.Assign) and any(getattr(t, 'id', None) == 'DB' for t in node.targets))


def remote_dsn():
    dsn = os.getenv('TEOJABI_DATABASE_URL') or os.getenv('DATABASE_URL')
    if not dsn:
        raise SystemExit('TEOJABI_DATABASE_URL 또는 DATABASE_URL 환경변수가 필요합니다.')
    return dsn


def copy_table(local, remote, table):
    with local.cursor() as src:
        src.execute(f'SELECT * FROM public.{table} ORDER BY id')
        columns = [desc[0] for desc in src.description]
        buffer = io.StringIO()
        src.copy_expert(f'COPY (SELECT * FROM public.{table} ORDER BY id) TO STDOUT WITH CSV', buffer)
    buffer.seek(0)
    with remote.cursor() as dst:
        dst.execute(f'TRUNCATE public.{table} CASCADE')
        column_list = ','.join(f'"{name}"' for name in columns)
        dst.copy_expert(f'COPY public.{table} ({column_list}) FROM STDIN WITH CSV', buffer)
        dst.execute(f"SELECT setval(pg_get_serial_sequence('public.{table}','id'), COALESCE((SELECT max(id) FROM public.{table}), 1))")
    return len(columns)


def precheck(local, remote):
    with local.cursor() as lc:
        lc.execute('SELECT count(*), min(id), max(id) FROM public.district_unit_plan')
        local_range = lc.fetchone()
        lc.execute('SELECT count(DISTINCT district_id) FROM public.district_file_list')
        local_ids = [row[0] for row in lc.fetchall()][0]
        lc.execute('SELECT DISTINCT district_id FROM public.district_file_list')
        ids = [row[0] for row in lc.fetchall()]
    with remote.cursor() as rc:
        rc.execute('SELECT count(*), min(id), max(id) FROM public.district_unit_plan')
        remote_range = rc.fetchone()
        rc.execute('SELECT count(*) FROM public.district_unit_plan WHERE id = ANY(%s)', (ids,))
        matched = rc.fetchone()[0]
    print('district_unit_plan local:', local_range, '/ remote:', remote_range)
    print(f'file_list district_id {local_ids}개 중 운영 매칭: {matched}')
    if matched < local_ids:
        print('경고: 운영 district_unit_plan id 체계가 로컬과 다릅니다. 뷰 조인이 비어 보일 수 있습니다.')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    if not SCHEMA.exists():
        raise SystemExit(f'스키마 파일이 없습니다: {SCHEMA}')

    local = psycopg2.connect(local_dsn())
    remote = psycopg2.connect(remote_dsn())
    remote.autocommit = False
    try:
        precheck(local, remote)
        schema_sql = re.sub(r'(?im)^\s*(BEGIN|COMMIT)\s*;\s*$', '', SCHEMA.read_text(encoding='utf-8'))
        with remote.cursor() as cursor:
            cursor.execute(schema_sql)
        print('스키마 적용 완료 (테이블·인덱스·뷰)')

        for table in TABLES:
            count = copy_table(local, remote, table)
            with remote.cursor() as cursor:
                cursor.execute(f'SELECT count(*) FROM public.{table}')
                print(f'  {table}: {cursor.fetchone()[0]} rows / {count} cols')

        remote.commit()

        with remote.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM public.v_far_serving_full')
            print('v_far_serving_full:', cursor.fetchone()[0])
            cursor.execute('SELECT count(*) FROM public.v_district_sources')
            print('v_district_sources:', cursor.fetchone()[0])
            cursor.execute('SELECT count(*) FROM public.v_district_sources WHERE base_notice_url IS NOT NULL')
            print('기준고시 URL 보유 지구:', cursor.fetchone()[0])
        print('이관 완료')
    except Exception:
        remote.rollback()
        raise
    finally:
        local.close()
        remote.close()


if __name__ == '__main__':
    main()
