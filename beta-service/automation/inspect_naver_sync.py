"""Read-only schema check for the daily listing sync; never prints credentials."""
import ast
import json
import os
from pathlib import Path

import psycopg2
from psycopg2.extensions import parse_dsn


def local_config():
    tree = ast.parse(Path('C:/opencode/database/build_master_land.py').read_text(encoding='utf-8-sig'))
    dsn = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
               and any(isinstance(t, ast.Name) and t.id == 'DB' for t in n.targets))
    config = parse_dsn(dsn)
    assert config.get('host') in ('localhost', '127.0.0.1') and config.get('port') == '5433'
    return config


def remote_config():
    return dict(host='db.tvrfrgozfoiucoeojrta.supabase.co', port=5432, dbname='postgres',
                user='postgres', password=os.environ['TEOJABI_SUPABASE_DB_PASSWORD'], sslmode='require')


def inspect(config, local=False):
    with psycopg2.connect(**config, connect_timeout=10,
                         options='-c default_transaction_read_only=on -c statement_timeout=20000') as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT table_name,column_name,udt_name,is_nullable,column_default,
                           is_identity,is_generated
                           FROM information_schema.columns WHERE table_schema='public'
                           AND table_name IN ('naver','naver_land') ORDER BY table_name,ordinal_position""")
            columns = cur.fetchall()
            cur.execute("""SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='public'
                           AND tablename IN ('naver','naver_land','master_land','seoul_parcel_map')""")
            indexes = cur.fetchall()
            cur.execute("""SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                           JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
                           AND c.relname IN ('naver','naver_land') AND NOT t.tgisinternal""")
            triggers = cur.fetchall()
            counts = {}
            for table in sorted({r[0] for r in columns}):
                cur.execute(f'SELECT count(*),count(DISTINCT "매물번호"),count(*) FILTER (WHERE pnu IS NOT NULL) FROM public.{table}')
                counts[table] = cur.fetchone()
            if local:
                cur.execute("""SELECT table_name,column_name,udt_name FROM information_schema.columns
                               WHERE table_schema='public' AND table_name IN ('master_land','seoul_parcel_map')
                               AND column_name IN ('pnu','geom','대지위치','A3','A4','용도지역','최대건폐율','최대용적률','도로폭_m')""")
                parcel_columns = cur.fetchall()
                cur.execute('SELECT "구", count(*) FROM public.naver GROUP BY "구" ORDER BY "구"')
                districts = cur.fetchall()
            else:
                parcel_columns, districts = [], []
            return dict(columns=columns,indexes=indexes,triggers=triggers,counts=counts,
                        parcel_columns=parcel_columns,districts=districts)


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    root = Path(__file__).resolve().parents[1] / '.local/naver-daily'
    root.mkdir(parents=True, exist_ok=True)
    result = {}
    for name, config in [('local', local_config()), ('supabase', remote_config())]:
        try:
            result[name] = inspect(config, local=name == 'local')
            print(json.dumps({name:result[name]}, ensure_ascii=False, default=str))
        except Exception as exc:
            print(json.dumps({'target':name,'errorType':type(exc).__name__,
                              'code':getattr(exc,'pgcode',None)}, ensure_ascii=False))
            raise SystemExit(1)
    (root/'schema-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
