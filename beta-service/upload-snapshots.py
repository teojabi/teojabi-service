"""스냅샷 파일을 Supabase `public.snapshots` 테이블에 upsert한다. (서버 공용)

beta-service 는 SUPABASE_SERVICE_ROLE_KEY 대신 TEOJABI_DATABASE_URL(psycopg2)을 쓴다.
큐레이션으로 스냅샷이 재생성되면 serve.mjs 가 이 스크립트를 호출해 서버리스와 값을 공유한다.
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2

ROOT = Path(__file__).resolve().parent

FILES = {
    'selected-catalog': '.local/supabase/selected-catalog.json',
    'selected-zoning': '.local/supabase/selected-zoning.json',
    'selected-development': '.local/supabase/selected-development.json',
    'curation-hidden': '.local/curation-hidden.json',
    'neighborhoods': 'neighborhoods.json',
    'inventory-summary': '.local/inventory-summary.json',
    'disco-activity': '.local/disco-daily/activity.json',
}


def data_dsn():
    dsn = os.getenv('TEOJABI_DATABASE_URL') or os.getenv('DATABASE_URL')
    if not dsn:
        raise SystemExit('TEOJABI_DATABASE_URL 이 필요합니다.')
    parts = urlsplit(dsn)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if k not in ('pgbouncer', 'connection_limit')]
    cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    if 'sslmode=' not in cleaned:
        cleaned += ('&' if '?' in cleaned else '?') + 'sslmode=require'
    return cleaned


def load(relative):
    path = ROOT / relative
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    rows = []
    for name, relative in FILES.items():
        data = load(relative)
        if data is None:
            continue
        rows.append((name, json.dumps(data, ensure_ascii=False)))
    if not rows:
        print('업로드할 스냅샷이 없습니다.')
        return
    with psycopg2.connect(data_dsn(), connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                'insert into public.snapshots (name, data, updated_at) values (%s, %s::jsonb, now()) '
                'on conflict (name) do update set data = excluded.data, updated_at = now()',
                rows,
            )
        conn.commit()
    print('스냅샷 업로드 완료:', ', '.join(name for name, _ in rows))


if __name__ == '__main__':
    main()
