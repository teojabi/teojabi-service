# -*- coding: utf-8 -*-
"""지구단위계획 서빙 데이터를 로컬 DB에서 운영(Supabase) DB로 이관한다.

로컬 스키마를 그대로 따라가므로, 컬럼·뷰 정의가 바뀌어도 다시 실행하면 맞춰진다.
- 기본 테이블(district_far_regulation, district_file_list): 누락 컬럼 추가 후 TRUNCATE + COPY
- v_district% / v_far% 뷰: 의존 순서를 계산해 DROP CASCADE 후 로컬 정의로 재생성
- 전제: 운영 DB에 public.district_unit_plan 이 이미 있고 id 체계가 로컬과 같아야 한다.

사용 (로컬 PC에서):
    set TEOJABI_DATABASE_URL=postgresql://postgres.xxxx:비밀번호@...pooler.supabase.com:5432/postgres
    python beta-service/automation/sync_district_far.py
"""
import ast
import io
import os
import sys
from pathlib import Path

import psycopg2

TABLES = ['district_far_regulation', 'district_file_list']
VIEW_PREFIXES = ('v_district', 'v_far')


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


def local_columns(connection, table):
    with connection.cursor() as cursor:
        cursor.execute('''
            SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
                   a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum
        ''', (f'public.{table}',))
        return cursor.fetchall()


def ensure_table(remote, local, table):
    columns = local_columns(local, table)
    create_parts = []
    for name, type_name, not_null, default in columns:
        piece = f'"{name}" {type_name}'
        if default and 'nextval' not in default:
            piece += f' DEFAULT {default}'
        if not_null:
            piece += ' NOT NULL'
        create_parts.append(piece)
    with remote.cursor() as cursor:
        cursor.execute(f'CREATE TABLE IF NOT EXISTS public.{table} ({", ".join(create_parts)})')
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
        existing = {row[0] for row in cursor.fetchall()}
        for name, type_name, _not_null, _default in columns:
            if name not in existing:
                cursor.execute(f'ALTER TABLE public.{table} ADD COLUMN "{name}" {type_name}')
        cursor.execute(f"SELECT 1 FROM pg_constraint WHERE conrelid='public.{table}'::regclass AND contype='p'")
        if not cursor.fetchone():
            cursor.execute(f'ALTER TABLE public.{table} ADD CONSTRAINT {table}_pkey PRIMARY KEY (id)')
        cursor.execute(f'CREATE SEQUENCE IF NOT EXISTS public.{table}_id_seq')
        cursor.execute(f"ALTER TABLE public.{table} ALTER COLUMN id SET DEFAULT nextval('public.{table}_id_seq')")


def copy_table(local, remote, table):
    with local.cursor() as src:
        src.execute(f'SELECT * FROM public.{table} ORDER BY id')
        columns = [desc[0] for desc in src.description]
        buffer = io.StringIO()
        src.copy_expert(f'COPY (SELECT * FROM public.{table} ORDER BY id) TO STDOUT WITH CSV', buffer)
    buffer.seek(0)
    column_list = ','.join(f'"{name}"' for name in columns)
    with remote.cursor() as dst:
        dst.execute(f'TRUNCATE public.{table} CASCADE')
        dst.copy_expert(f'COPY public.{table} ({column_list}) FROM STDIN WITH CSV', buffer)
        dst.execute(f"SELECT setval(pg_get_serial_sequence('public.{table}','id'), COALESCE((SELECT max(id) FROM public.{table}), 1))")
    return len(columns)


def view_list(local):
    with local.cursor() as cursor:
        cursor.execute('''
            SELECT viewname FROM pg_views
            WHERE schemaname='public' AND (viewname LIKE 'v_district%' OR viewname LIKE 'v_far%')
            ORDER BY viewname
        ''')
        return [row[0] for row in cursor.fetchall()]


def view_dependencies(local, views):
    with local.cursor() as cursor:
        cursor.execute('''
            SELECT dependent.relname, referenced.relname
            FROM pg_depend d
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class dependent ON dependent.oid = r.ev_class
            JOIN pg_class referenced ON referenced.oid = d.refobjid
            WHERE referenced.relkind = 'v' AND dependent.relname = ANY(%s) AND referenced.relname = ANY(%s)
        ''', (views, views))
        deps = {}
        for dependent, referenced in cursor.fetchall():
            deps.setdefault(dependent, set()).add(referenced)
    return deps


def view_order(local, views):
    deps = view_dependencies(local, views)
    order, done, visiting = [], set(), set()

    def visit(name):
        if name in done or name in visiting:
            return
        visiting.add(name)
        for dependency in sorted(deps.get(name, ())):
            visit(dependency)
        visiting.discard(name)
        done.add(name)
        order.append(name)

    for view in views:
        visit(view)
    return order


def view_definitions(local, views):
    definitions = {}
    with local.cursor() as cursor:
        for view in views:
            cursor.execute("SELECT pg_get_viewdef(%s::regclass, true)", (f'public.{view}',))
            definitions[view] = cursor.fetchone()[0]
    return definitions


def recreate_views(local, remote, views):
    order = view_order(local, views)
    definitions = view_definitions(local, views)
    with remote.cursor() as cursor:
        cursor.execute('SET search_path TO public, pg_catalog')
        for view in order:
            cursor.execute(f'DROP VIEW IF EXISTS public.{view} CASCADE')
        for view in order:
            cursor.execute(f'CREATE VIEW public.{view} AS {definitions[view]}')
    return order


def precheck(local, remote):
    with local.cursor() as cursor:
        cursor.execute('SELECT count(*), min(id), max(id) FROM public.district_unit_plan')
        local_range = cursor.fetchone()
        cursor.execute('SELECT DISTINCT district_id FROM public.district_file_list')
        ids = [row[0] for row in cursor.fetchall()]
    with remote.cursor() as cursor:
        cursor.execute('SELECT count(*), min(id), max(id) FROM public.district_unit_plan')
        remote_range = cursor.fetchone()
        cursor.execute('SELECT count(*) FROM public.district_unit_plan WHERE id = ANY(%s)', (ids,))
        matched = cursor.fetchone()[0]
    print('district_unit_plan local:', local_range, '/ remote:', remote_range)
    print(f'file_list district_id {len(ids)}개 중 운영 매칭: {matched}')
    if matched < len(ids):
        print('경고: 운영 district_unit_plan id 체계가 로컬과 다릅니다. 뷰 조인이 비어 보일 수 있습니다.')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    local = psycopg2.connect(local_dsn())
    remote = psycopg2.connect(remote_dsn())
    remote.autocommit = False
    try:
        precheck(local, remote)
        for table in TABLES:
            ensure_table(remote, local, table)
        for table in TABLES:
            count = copy_table(local, remote, table)
            with remote.cursor() as cursor:
                cursor.execute(f'SELECT count(*) FROM public.{table}')
                print(f'  {table}: {cursor.fetchone()[0]} rows / {count} cols')

        views = view_list(local)
        order = recreate_views(local, remote, views)
        print('뷰 재생성:', ', '.join(order))

        remote.commit()

        with remote.cursor() as cursor:
            for view in ['v_district_sources', 'v_far_serving_full']:
                cursor.execute(f'SELECT count(*) FROM public.{view}')
                print(f'{view}: {cursor.fetchone()[0]}')
            cursor.execute('SELECT count(*) FROM public.v_district_sources WHERE std_notice_url IS NOT NULL')
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
