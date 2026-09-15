"""Build a local zoning cache with indexed, read-only parcel lookups. No remote writes."""
import importlib.util
from source_relations import remote_mode
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent
CACHE = root / '.local' / 'supabase' if remote_mode() else root / '.local'
spec = importlib.util.spec_from_file_location('local_reader', root / 'local-reader.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

def refresh(selected=False):
    pnus=sorted({r['pnu'] for r in json.loads((CACHE/'selected-catalog.json').read_text(encoding='utf-8'))['rows'] if r.get('pnu')}) if selected else None
    ids_sql='SELECT unnest(%s::text[]) AS pnu' if selected else "SELECT DISTINCT pnu FROM public.naver WHERE pnu ~ '^11[0-9]{17}$'"
    connection = reader.connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout='60000'")
            cursor.execute('''
                SELECT DISTINCT u."고유번호", u."저촉여부코드", u."저촉여부",
                       u."용도지역지구코드", u."용도지역지구명", u."데이터기준일자"
                FROM ('''+ids_sql+''') n
                CROSS JOIN LATERAL (
                    SELECT "고유번호", "저촉여부코드", "저촉여부", "용도지역지구코드",
                           "용도지역지구명", "데이터기준일자"
                    FROM public.staging_land_use_plan s
                    WHERE s."고유번호"=n.pnu AND s."용도지역지구코드" LIKE 'UQA%%'
                    OFFSET 0
                ) u
            ''', (pnus,) if selected else ())
            rows = [dict(zip(['pnu','relationCode','relation','code','name','sourceDate'], row))
                    for row in cursor.fetchall()]
            source_name='staging_land_use_plan'
            if selected and remote_mode() and not rows:
                cursor.execute('SELECT pnu,coalesce(nullif("법정기준용도지역",\'\'),"용도지역") FROM public.master_land WHERE pnu=ANY(%s)',(pnus,))
                rows=[{'pnu':r[0],'name':r[1]} for r in cursor.fetchall()]
                source_name='master_land'
        target = CACHE / ('selected-zoning.json' if selected else 'zoning-source.json')
        target.parent.mkdir(parents=True,exist_ok=True)
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps({'source':source_name,
            'observedAt':datetime.now(timezone.utc).isoformat(), 'rows':rows},
            ensure_ascii=False), encoding='utf-8')
        temporary.replace(target)
        print(json.dumps({'rows':len(rows),'parcels':len({r['pnu'] for r in rows}),
            'source':source_name}, ensure_ascii=False))
    finally:
        connection.rollback()
        connection.close()

if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    refresh(selected='--selected' in sys.argv)
