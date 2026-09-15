import json,random,os
import psycopg2
from inspect_naver_sync import remote_config
from service_database import service_config

with psycopg2.connect(**(service_config() if os.getenv('TEOJABI_DATA_SOURCE') else remote_config()),connect_timeout=10,options='-c statement_timeout=20000') as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(174209151)')
        cur.execute('''CREATE TABLE IF NOT EXISTS public.teojabi_listing_number (
            listing_id text PRIMARY KEY,teojabi_no text NOT NULL UNIQUE CHECK(teojabi_no ~ '^[0-9]{4}$'),
            created_at timestamptz NOT NULL DEFAULT now())''')
        cur.execute('ALTER TABLE public.teojabi_listing_number ENABLE ROW LEVEL SECURITY')
        cur.execute('REVOKE ALL ON public.teojabi_listing_number FROM anon,authenticated')
        cur.execute('SELECT listing_id,teojabi_no FROM public.teojabi_listing_number')
        existing=dict(cur.fetchall());used=set(existing.values())
        cur.execute("SELECT CASE WHEN source_table='naver' THEN 'naver:' ELSE 'naver-land:' END||source_id,snapshot->'teojabiPick'->>'pickNo' FROM public.teojabi_curation_candidates UNION ALL SELECT 'premium:'||id,NULL FROM public.property")
        rows=cur.fetchall();free=[str(n) for n in range(1000,10000) if str(n) not in used];random.SystemRandom().shuffle(free)
        added=0
        for ident,preferred in sorted(rows,key=lambda r:not bool(r[1])):
            if ident in existing:continue
            if preferred and len(preferred)==4 and preferred.isdigit() and preferred not in used:value=preferred
            else:
                while free and free[-1] in used:free.pop()
                if not free:raise ValueError('Number capacity reached')
                value=free.pop()
            cur.execute('INSERT INTO public.teojabi_listing_number(listing_id,teojabi_no) VALUES(%s,%s)',(ident,value));used.add(value);added+=1
        print(json.dumps({'assigned':added,'total':len(existing)+added}))
