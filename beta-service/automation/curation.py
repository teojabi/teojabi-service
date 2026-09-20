"""Local-only candidate snapshots and review decisions. Never writes source tables."""
import json
import os
import math
import re
import sys
import random
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from decimal import Decimal
from statistics import median
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor, Json
from service_database import service_config as local_config

TYPES = {'commercial':110, 'residential':45, 'office':25, 'land':20}
LABELS = {'commercial':'상업·근생·숙박', 'residential':'단독·다가구', 'office':'업무용 건물', 'land':'토지'}
BUDGETS = [60,60,40,25,15]
STATES = ('unreviewed','selected','hold','rejected')
CONTACT = ('pending','agreed','declined')
PICK_STATUS = ('draft','ready','published','hidden')
TABLE = 'public.teojabi_curation_candidates'
HIDDEN_FILE = Path(__file__).resolve().parents[1] / ('.local/supabase' if os.getenv('TEOJABI_DATA_SOURCE') in ('supabase','remote') else '.local') / 'curation-hidden.json'
REGISTERED_SNAPSHOT_FILE = Path(__file__).resolve().parents[1] / ('.local/supabase' if os.getenv('TEOJABI_DATA_SOURCE') in ('supabase','remote') else '.local') / 'curation-registered.json'
SOURCE_SNAPSHOT_FILE = Path(__file__).resolve().parents[1] / ('.local/supabase' if os.getenv('TEOJABI_DATA_SOURCE') in ('supabase','remote') else '.local') / 'curation-sources.json'

def catalog_id(table,sid):
    return f"naver-land:{sid}" if table=='naver_land' else f"premium:{sid}" if table=='premium' else f"naver:{sid}"

def read_hidden_ids():
    try:
        data=json.loads(HIDDEN_FILE.read_text(encoding='utf-8'))
        return set(str(x) for x in data.get('ids',[]) if isinstance(x,str))
    except FileNotFoundError:
        return set()

def write_hidden_ids(ids):
    HIDDEN_FILE.parent.mkdir(parents=True,exist_ok=True)
    payload={'updatedAt':datetime.now(timezone.utc).isoformat(),'ids':sorted(ids)}
    HIDDEN_FILE.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')

def number(value):
    try:
        n=float(value)
        return n if math.isfinite(n) and n>0 else None
    except (ValueError,TypeError):
        return None

def clean(value):
    if isinstance(value, Decimal): return float(value)
    if isinstance(value, dict): return {k:clean(v) for k,v in value.items()}
    if isinstance(value, list): return [clean(v) for v in value]
    return value

def bucket(price):
    return next((i for i,upper in enumerate((20,40,70,100)) if price<upper),4)

def prepare(raw, table):
    price=number(raw.get('거래가격')); land=number(raw.get('대지면적'))
    lat=number(raw.get('lat')); lng=number(raw.get('lng'))
    address=str(raw.get('대지위치') or '').strip()
    aid=str(raw.get('매물번호') or '')
    if not(price and price>=10 and land and address and aid.isdigit() and lat and lng and
           37.3<=lat<=37.8 and 126.7<=lng<=127.3 and raw.get('상태') in ('신규','유지')): return None
    if not address.startswith('서울'): return None
    description=str(raw.get('매물특징') or '')
    if re.search(r'지분\s*(매매|매각)|구분\s*(매매|매각)|분양권|경매\s*물건|공매\s*물건',description): return None
    use=str(raw.get('주용도코드명') or '')
    if table=='naver_land' or use=='토지': category='land'
    elif use=='단독주택': category='residential'
    elif use=='업무시설': category='office'
    elif any(word in use for word in ('근린생활','숙박','판매시설','위락시설')): category='commercial'
    else: return None
    floor=number(raw.get('연면적'))
    if category!='land' and not floor: return None
    pnu=str(raw.get('pnu') or '')
    pnu=pnu if re.fullmatch(r'\d{19}',pnu) else None
    # A candidate grouping, not proof that all parcels or units have been resolved.
    key=re.sub(r'\s+','',address)
    broker=str(raw.get('중개사') or '').strip()
    phone=str(raw.get('중개사_전화번호') or '').strip()
    purpose={'commercial':'임대 운영 검토','residential':'직접 거주·임대 검토','office':'사옥·임대 운영 검토','land':'토지 활용 검토'}[category]
    return dict(source_table=table,source_id=aid,group_key=key,category=category,budget=bucket(price),
        address=address,district=raw.get('구') or '',neighborhood=raw.get('동') or '',price=price,
        areaM2=land,floorAreaM2=floor,position={'lat':lat,'lng':lng},pnu=pnu,mainUse=use or '토지',
        floorInfo=raw.get('층정보'),aboveFloors=raw.get('지상층수'),approvalDate=raw.get('사용승인일자'),
        zoning=raw.get('용도지역'),road=number(raw.get('도로폭_m')),broker=broker,phone=phone,
        description=description,purpose=purpose,sourceStatus=raw.get('상태'),
        priority=int(bool(phone))+int(bool(pnu))+int(bool(raw.get('용도지역'))),
        reasons=[f'{LABELS[category]} 구성 후보',f'{price:g}억원 가격대 선택지',purpose],
        questions=['현재 매매 가능 여부와 호가 확인','구성 필지·전체 매매 범위 확인','공동중개와 터잡이 광고 동의 확인']+
            (['임대료·보증금·공실·명도 조건 확인'] if category!='land' else ['실제 접도·토지 현황 확인']),
        scopeStatus='통매입 여부 확인 필요' if category!='land' else '매각 필지 범위 확인 필요')

def allocate(cells, types, budgets):
    """Integral min-cost flow: match totals and spread each type across budgets."""
    capacity=defaultdict(int); neighbours=defaultdict(list)
    total=max(1,sum(types.values()))
    def edge(a,b,n):
        capacity[a,b]=n; neighbours[a].append(b); neighbours[b].append(a)
    for cat,n in types.items():
        edge('s',cat,n)
        for b in range(len(budgets)): edge(cat,f'b{b}',len(cells[cat,b]))
    for b,n in enumerate(budgets): edge(f'b{b}','t',n)
    initial=dict(capacity)
    while True:
        parent={'s':None}; queue=deque(['s']);distance={'s':0};queued={'s'}
        def cost(a,b):
            if a in types and b.startswith('b'):
                used=initial[a,b]-capacity[a,b];expected=types[a]*budgets[int(b[1:])]/total
                return round((2*used+1-2*expected)*100)
            if b in types and a.startswith('b'):
                used=initial[b,a]-capacity[b,a];expected=types[b]*budgets[int(a[1:])]/total
                return -round((2*(used-1)+1-2*expected)*100)
            return 0
        while queue:
            a=queue.popleft()
            queued.remove(a)
            for b in neighbours[a]:
                if capacity[a,b]>0 and distance.get(b,float('inf'))>distance[a]+cost(a,b):
                    distance[b]=distance[a]+cost(a,b);parent[b]=a
                    if b not in queued:queue.append(b);queued.add(b)
        if 't' not in parent: break
        n=1; b='t'
        while parent[b] is not None: a=parent[b]; n=min(n,capacity[a,b]); b=a
        b='t'
        while parent[b] is not None:
            a=parent[b]; capacity[a,b]-=n; capacity[b,a]+=n; b=a
    return {(cat,b):initial[cat,f'b{b}']-capacity[cat,f'b{b}'] for cat in types for b in range(len(budgets))}

def select_candidates(rows, types=None, budgets=None):
    types=dict(types or TYPES); budgets=list(budgets or BUDGETS)
    groups=defaultdict(list)
    for r in rows: groups[r['group_key']].append(r)
    unique=[]
    for items in groups.values():
        items.sort(key=lambda r:(-r['priority'],r['price'],r['source_table'],r['source_id']))
        row=dict(items[0]); seen=set(); row['alternatives']=[]
        for item in items:
            key=(item['source_table'],item['source_id'])
            if key in seen: continue
            seen.add(key)
            row['alternatives'].append({k:item[k] for k in ('source_table','source_id','broker','phone','price')})
        row['questions'].append('같은 주소의 광고 간 면적·매매 범위 차이 확인')
        unique.append(row)
    peers=defaultdict(list)
    for r in unique: peers[r['category'],r['district']].append(r['price']/r['areaM2'])
    cells=defaultdict(list);outliers=0
    for r in unique:
        values=peers[r['category'],r['district']]
        # A conservative unit/error check, not a claim about fair market value.
        if len(values)>=10 and r['price']/r['areaM2']>8*median(values):outliers+=1;continue
        cells[r['category'],r['budget']].append(r)
    allocation=allocate(cells, types, budgets); selected=[]; district=Counter(); brokers=Counter()
    for (cat,b),count in allocation.items():
        pool=list(cells[cat,b])
        for _ in range(count):
            if not pool: break
            row=min(pool,key=lambda r:(district[r['district']],brokers[r['broker']],-r['priority'],r['price'],r['source_id']))
            pool.remove(row); selected.append(row); district[row['district']]+=1; brokers[row['broker']]+=1
    # Keep shortfall visible rather than silently relaxing agreed quotas.
    selected.sort(key=lambda r:(r['budget'],list(types).index(r['category']),r['district'],r['price'],r['source_id']))
    return selected,dict(eligible=len(rows),unique=len(unique),priceOutliersDeferred=outliers,selected=len(selected),
        categoryTargets=types,priceTargets=budgets,
        categoryActual=dict(Counter(r['category'] for r in selected)),
        priceActual=dict(Counter(str(r['budget']) for r in selected)),
        districts=dict(Counter(r['district'] for r in selected)),
        method='가격·유형 배정 후 지역·중개사 분산, 연락·필지·용도 정보 완성도 우선. 투자수익·저평가 순위 아님.')

def normalize_criteria(criteria):
    """관리자가 정한 유형·가격대 배분을 검증한다. 없으면 기본값(200개)을 쓴다."""
    if not isinstance(criteria,dict) or not criteria:
        return dict(TYPES),list(BUDGETS)
    raw_types=criteria.get('types') if isinstance(criteria.get('types'),dict) else {}
    types={}
    for key,default in TYPES.items():
        try: value=int(raw_types.get(key,default))
        except (TypeError,ValueError): value=default
        types[key]=max(0,min(1000,value))
    raw_budgets=criteria.get('budgets') if isinstance(criteria.get('budgets'),list) else []
    budgets=[]
    for i,default in enumerate(BUDGETS):
        try: value=int(raw_budgets[i]) if i<len(raw_budgets) else default
        except (TypeError,ValueError): value=default
        budgets.append(max(0,min(1000,value)))
    total=sum(types.values())
    if total<=0 or sum(budgets)!=total: raise ValueError('Invalid criteria')
    return types,budgets

def delete_all_registered(conn):
    """등록 매물(터잡이픽 포함)을 모두 삭제한다. 관리자 확인 후에만 호출된다."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(174209151)')
        cur.execute('SELECT to_regclass(%s) AS name',(TABLE,))
        if not cur.fetchone()['name']: return {'status':'refreshed','deleted':0,'selected':0}
        cur.execute(f'DELETE FROM {TABLE}')
        return {'status':'refreshed','deleted':cur.rowcount,'selected':0}

def refresh_auto_selection(conn, criteria=None):
    """Rebuild only the automatic cohort and preserve manually registered rows."""
    types,budgets=normalize_criteria(criteria)
    total=sum(types.values())
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(174209151)')
        cur.execute(f"SELECT source_table,source_id,group_key FROM {TABLE} WHERE snapshot ? 'teojabiPick'")
        protected=cur.fetchall()
        protected_sources={(r['source_table'],r['source_id']) for r in protected}
        protected_groups={r['group_key'] for r in protected}
        all_rows=[];scanned={}
        for table in ('naver','naver_land'):
            cur.execute(f'''SELECT to_jsonb(n)-'geom' AS row FROM public.{table} n
                            WHERE "상태" IN ('신규','유지') AND "거래가격">=10''')
            source=cur.fetchall();scanned[table]=len(source)
            for item in source:
                row=prepare(item['row'],table)
                if row and (row['source_table'],row['source_id']) not in protected_sources and row['group_key'] not in protected_groups:
                    all_rows.append(row)
        selected,meta=select_candidates(all_rows,types,budgets)
        if len(selected)!=total: raise ValueError('Automatic selection did not produce the requested count')
        now=datetime.now(timezone.utc).isoformat();meta.update(scanned=scanned,snapshotAt=now,criteriaVersion='v1-2026-09-16',criteria={'types':types,'budgets':budgets})
        cur.execute(f"DELETE FROM {TABLE} WHERE NOT (snapshot ? 'teojabiPick')")
        for rank,row in enumerate(selected,1):
            row['snapshotAt']=now;row.pop('priority',None)
            cur.execute(f'''INSERT INTO {TABLE}(source_table,source_id,group_key,rank,category,budget,snapshot,selection_meta)
                            VALUES(%s,%s,%s,%s,%s,%s,%s,%s)''',
                        (row['source_table'],row['source_id'],row['group_key'],rank,row['category'],row['budget'],Json(clean(row)),Json(meta)))
        return {'status':'refreshed','selected':len(selected),'preserved':len(protected),'snapshotAt':now,
                'criteria':{'types':types,'budgets':budgets},
                'sourceIds':[f"{row['source_table']}:{row['source_id']}" for row in selected]}

def seed(conn,rebalance=False):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(174209151)')
        cur.execute(f'''CREATE TABLE IF NOT EXISTS {TABLE} (
            id bigserial PRIMARY KEY, source_table text NOT NULL, source_id text NOT NULL,
            group_key text NOT NULL UNIQUE, rank integer NOT NULL, category text NOT NULL,
            budget integer NOT NULL CHECK(budget BETWEEN 0 AND 4),
            snapshot jsonb NOT NULL, selection_meta jsonb NOT NULL,
            review_status text NOT NULL DEFAULT 'unreviewed' CHECK(review_status IN ('unreviewed','selected','hold','rejected')),
            cooperation_status text NOT NULL DEFAULT 'pending' CHECK(cooperation_status IN ('pending','agreed','declined')),
            advertising_status text NOT NULL DEFAULT 'pending' CHECK(advertising_status IN ('pending','agreed','declined')),
            notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
            version integer NOT NULL DEFAULT 1, history jsonb NOT NULL DEFAULT '[]',
            created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )''')
        cur.execute(f'SELECT * FROM {TABLE} ORDER BY rank FOR UPDATE')
        existing=cur.fetchall()
        if existing and not rebalance:
            return {'status':'existing','message':'기존 후보와 검토 기록을 유지했습니다.'}
        if rebalance and any(r['review_status']!='unreviewed' or r['notes'] or r['cooperation_status']!='pending' or r['advertising_status']!='pending' or any('event' not in h for h in r['history']) for r in existing):
            return {'status':'review_started','message':'사용자 검토가 시작돼 기존 후보를 보존했습니다.'}
        all_rows=[]; scanned={}
        for table in ('naver','naver_land'):
            cur.execute(f'SELECT to_jsonb(n)-\'geom\' AS row FROM public.{table} n WHERE "상태" IN (\'신규\',\'유지\') AND "거래가격">=10')
            sources=cur.fetchall(); scanned[table]=len(sources)
            for item in sources:
                row=prepare(item['row'],table)
                if row: all_rows.append(row)
        selected,meta=select_candidates(all_rows); meta['scanned']=scanned
        meta['snapshotAt']=datetime.now(timezone.utc).isoformat(); meta['criteriaVersion']='v1-2026-09-15'
        matched={(r['source_table'],r['source_id']):r for r in existing}
        retained={(r['source_table'],r['source_id']) for r in selected}
        free=iter([r for r in existing if (r['source_table'],r['source_id']) not in retained])
        if existing:
            if len(selected)!=len(existing):raise ValueError('Rebalance would change candidate count')
            cur.execute(f"UPDATE {TABLE} SET group_key='rebalance:' || id::text")
        for rank,row in enumerate(selected,1):
            row['snapshotAt']=meta['snapshotAt']; row.pop('priority',None)
            values=(row['source_table'],row['source_id'],row['group_key'],rank,row['category'],row['budget'],Json(clean(row)),Json(meta))
            if existing:
                old=matched.get((row['source_table'],row['source_id']))
                if old is None:old=next(free)
                cur.execute(f'''UPDATE {TABLE} SET source_table=%s,source_id=%s,group_key=%s,rank=%s,category=%s,budget=%s,snapshot=%s,selection_meta=%s,
                    history=history || jsonb_build_array(jsonb_build_object('at',now(),'event','initial_budget_type_balancing','previous_snapshot',snapshot)),
                    version=version+1,updated_at=now() WHERE id=%s''',values+(old['id'],))
            else:
                cur.execute(f'''INSERT INTO {TABLE}(source_table,source_id,group_key,rank,category,budget,snapshot,selection_meta)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',values)
        return {'status':'seeded',**meta}



def write_registered_snapshot(result):
    REGISTERED_SNAPSHOT_FILE.parent.mkdir(parents=True,exist_ok=True)
    payload={**result,'cachedAt':datetime.now(timezone.utc).isoformat()}
    REGISTERED_SNAPSHOT_FILE.write_text(json.dumps(clean(payload),ensure_ascii=False,default=str,allow_nan=False),encoding='utf-8')
    return result
def write_source_snapshot(result):
    SOURCE_SNAPSHOT_FILE.parent.mkdir(parents=True,exist_ok=True)
    payload={**result,'cachedAt':datetime.now(timezone.utc).isoformat()}
    SOURCE_SNAPSHOT_FILE.write_text(json.dumps(clean(payload),ensure_ascii=False,default=str,allow_nan=False),encoding='utf-8')
    return result
def listing(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f'''SELECT id,rank,category,budget,snapshot,review_status,cooperation_status,
            advertising_status,notes,version,created_at,updated_at FROM {TABLE} ORDER BY rank,id''')
        rows=cur.fetchall()
        cur.execute(f'SELECT selection_meta FROM {TABLE} ORDER BY id LIMIT 1')
        meta=cur.fetchone()
        return write_registered_snapshot({'status':'ready','rows':rows,'meta':meta['selection_meta'] if meta else {}})

def source_listing(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f'''CREATE TABLE IF NOT EXISTS {TABLE} (
            id bigserial PRIMARY KEY, source_table text NOT NULL, source_id text NOT NULL,
            group_key text NOT NULL UNIQUE, rank integer NOT NULL, category text NOT NULL,
            budget integer NOT NULL CHECK(budget BETWEEN 0 AND 4),
            snapshot jsonb NOT NULL, selection_meta jsonb NOT NULL,
            review_status text NOT NULL DEFAULT 'unreviewed' CHECK(review_status IN ('unreviewed','selected','hold','rejected')),
            cooperation_status text NOT NULL DEFAULT 'pending' CHECK(cooperation_status IN ('pending','agreed','declined')),
            advertising_status text NOT NULL DEFAULT 'pending' CHECK(advertising_status IN ('pending','agreed','declined')),
            notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
            version integer NOT NULL DEFAULT 1, history jsonb NOT NULL DEFAULT '[]',
            created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )''')
        registered={}
        cur.execute(f"SELECT id,source_table,source_id,snapshot,version,updated_at FROM {TABLE} WHERE snapshot ? 'teojabiPick'")
        for row in cur.fetchall():
            registered[(row['source_table'],row['source_id'])]=row
        cur.execute(f"SELECT snapshot FROM {TABLE} WHERE NOT (snapshot ? 'teojabiPick') ORDER BY rank,id")
        automatic=[row['snapshot'] for row in cur.fetchall()]
        rows=[];scanned={};seen=set()
        for table in ('naver','naver_land'):
            try:
                cur.execute(f'''SELECT to_jsonb(n)-'geom' AS row FROM public.{table} n WHERE "상태" IN ('신규','유지') AND "거래가격">=10''')
            except Exception:
                scanned[table]='missing'; continue
            source=cur.fetchall(); scanned[table]=len(source)
            for item in source:
                candidate=prepare(item['row'],table)
                if not candidate: continue
                candidate['snapshotAt']=datetime.now(timezone.utc).isoformat()
                candidate.pop('priority',None)
                reg=registered.get((candidate['source_table'],candidate['source_id']))
                seen.add((candidate['source_table'],candidate['source_id']))
                rows.append({'id':f"{candidate['source_table']}:{candidate['source_id']}",'source_table':candidate['source_table'],'source_id':candidate['source_id'],
                    'category':candidate['category'],'budget':candidate['budget'],'snapshot':clean(candidate),'registered':bool(reg),
                    'registered_id':reg['id'] if reg else None,'version':reg['version'] if reg else None,'updated_at':reg['updated_at'] if reg else None})
        for candidate in automatic:
            key=(candidate['source_table'],candidate['source_id'])
            if key in seen: continue
            rows.append({'id':f"{key[0]}:{key[1]}",'source_table':key[0],'source_id':key[1],
                'category':candidate['category'],'budget':candidate['budget'],'snapshot':clean(candidate),'registered':False,
                'registered_id':None,'version':None,'updated_at':None})
        return write_source_snapshot({'status':'ready','rows':rows,'meta':{'scanned':scanned,'snapshotAt':datetime.now(timezone.utc).isoformat()}})

def used_pick_numbers(cur):
    cur.execute(f"SELECT snapshot->'teojabiPick'->>'pickNo' AS no FROM {TABLE} WHERE snapshot->'teojabiPick'->>'pickNo' IS NOT NULL")
    used={str(r['no']) for r in cur.fetchall() if r.get('no')}
    cur.execute("SELECT to_regclass('public.teojabi_listing_number') AS name")
    if cur.fetchone()['name']:
        cur.execute('SELECT teojabi_no AS no FROM public.teojabi_listing_number')
        used.update(str(r['no']) for r in cur.fetchall())
    return used

def next_pick_no(cur):
    used=used_pick_numbers(cur)
    for _ in range(5000):
        value=str(random.randint(1000,9999))
        if value not in used: return value
    for n in range(1000,10000):
        if str(n) not in used: return str(n)
    raise ValueError('No pick numbers left')

def register_pick(conn,data):
    if not isinstance(data,dict): raise ValueError('Invalid fields')
    table=str(data.get('source_table') or '')
    sid=str(data.get('source_id') or '')
    if table not in ('naver','naver_land') or not sid.isdigit(): raise ValueError('Invalid source')
    description=str(data.get('description') or '').strip()[:120]
    pick_no=str(data.get('pickNo') or '').strip()
    if pick_no and not re.fullmatch(r'\d{4}',pick_no): raise ValueError('Invalid pick number')
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(174209151)')
        cur.execute("SELECT to_regclass('public.teojabi_listing_number') AS name")
        if cur.fetchone()['name']:
            key=('naver:' if table=='naver' else 'naver-land:')+sid
            cur.execute('SELECT teojabi_no FROM public.teojabi_listing_number WHERE listing_id=%s',(key,))
            stable=cur.fetchone()
            if stable: pick_no=stable['teojabi_no']
            elif pick_no in used_pick_numbers(cur):pick_no=next_pick_no(cur)
        cur.execute(f'''CREATE TABLE IF NOT EXISTS {TABLE} (
            id bigserial PRIMARY KEY, source_table text NOT NULL, source_id text NOT NULL,
            group_key text NOT NULL UNIQUE, rank integer NOT NULL, category text NOT NULL,
            budget integer NOT NULL CHECK(budget BETWEEN 0 AND 4), snapshot jsonb NOT NULL, selection_meta jsonb NOT NULL,
            review_status text NOT NULL DEFAULT 'unreviewed' CHECK(review_status IN ('unreviewed','selected','hold','rejected')),
            cooperation_status text NOT NULL DEFAULT 'pending' CHECK(cooperation_status IN ('pending','agreed','declined')),
            advertising_status text NOT NULL DEFAULT 'pending' CHECK(advertising_status IN ('pending','agreed','declined')),
            notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), version integer NOT NULL DEFAULT 1, history jsonb NOT NULL DEFAULT '[]',
            created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())''')
        cur.execute(f"SELECT snapshot->'teojabiPick'->>'pickNo' AS no FROM {TABLE} WHERE snapshot->'teojabiPick'->>'pickNo'=%s AND NOT(source_table=%s AND source_id=%s)",(pick_no,table,sid))
        if pick_no and cur.fetchone(): pick_no=next_pick_no(cur)
        if not pick_no: pick_no=next_pick_no(cur)
        cur.execute(f'''SELECT to_jsonb(n)-'geom' AS row FROM public.{table} n WHERE "매물번호"::text=%s LIMIT 1''',(sid,))
        item=cur.fetchone()
        if not item: raise ValueError('Missing source')
        candidate=prepare(item['row'],table)
        if not candidate: raise ValueError('Invalid source')
        candidate['snapshotAt']=datetime.now(timezone.utc).isoformat(); candidate.pop('priority',None)
        candidate['teojabiPick']={'status':'published' if data.get('publish') is True else 'curated','pickNo':pick_no,'headline':description,'publicMemo':'','tags':[]}
        meta={'method':'관리자가 네이버 원자료에서 직접 등록','snapshotAt':candidate['snapshotAt']}
        cur.execute(f'SELECT id,version FROM {TABLE} WHERE source_table=%s AND source_id=%s FOR UPDATE',(table,sid))
        old=cur.fetchone()
        if old:
            cur.execute(f'''UPDATE {TABLE} SET snapshot=%s,category=%s,budget=%s,review_status='selected',notes=%s,
                history=history || jsonb_build_array(jsonb_build_object('at',now(),'event','admin_pick_updated','previous_snapshot',snapshot)),
                version=version+1,updated_at=now() WHERE id=%s RETURNING id,rank,category,budget,snapshot,review_status,notes,version,updated_at''',
                (Json(clean(candidate)),candidate['category'],candidate['budget'],description,old['id']))
        else:
            cur.execute(f'SELECT COALESCE(MAX(rank),0)+1 AS rank FROM {TABLE}')
            rank=cur.fetchone()['rank']
            cur.execute(f'''INSERT INTO {TABLE}(source_table,source_id,group_key,rank,category,budget,snapshot,selection_meta,review_status,notes)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'selected',%s)
                ON CONFLICT(group_key) DO UPDATE SET source_table=EXCLUDED.source_table,source_id=EXCLUDED.source_id,snapshot=EXCLUDED.snapshot,
                category=EXCLUDED.category,budget=EXCLUDED.budget,review_status='selected',notes=EXCLUDED.notes,version={TABLE}.version+1,updated_at=now()
                RETURNING id,rank,category,budget,snapshot,review_status,notes,version,updated_at''',
                (candidate['source_table'],candidate['source_id'],candidate['group_key'],rank,candidate['category'],candidate['budget'],Json(clean(candidate)),Json(meta),description))
        row=cur.fetchone()
        return {'status':'saved','row':row}

def bulk_register_picks(conn,data):
    items=data.get('items') if isinstance(data,dict) else None
    if not isinstance(items,list) or not items or len(items)>120: raise ValueError('Invalid bulk items')
    rows=[]
    seen=set()
    for item in items:
        if not isinstance(item,dict): raise ValueError('Invalid bulk item')
        key=(str(item.get('source_table') or ''),str(item.get('source_id') or ''))
        if key in seen: continue
        seen.add(key)
        # The database allocates an unused four-digit number inside the locked transaction.
        rows.append(register_pick(conn,{
            'source_table':key[0],
            'source_id':key[1],
            'description':str(item.get('description') or '')[:120],
            'pickNo':'',
            'publish':False
        })['row'])
    return {'status':'saved','saved':len(rows),'rows':rows}

def delete_pick(conn,data):
    if not isinstance(data,dict): raise ValueError('Invalid fields')
    table=str(data.get('source_table') or '')
    sid=str(data.get('source_id') or '')
    if table not in ('naver','naver_land','premium') or not sid: raise ValueError('Invalid source')
    cid=catalog_id(table,sid)
    hidden=read_hidden_ids(); hidden.add(cid); write_hidden_ids(hidden)
    deleted=0
    if table in ('naver','naver_land') and sid.isdigit():
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT pg_advisory_xact_lock(174209151)')
            cur.execute(f'''CREATE TABLE IF NOT EXISTS {TABLE} (
                id bigserial PRIMARY KEY, source_table text NOT NULL, source_id text NOT NULL,
                group_key text NOT NULL UNIQUE, rank integer NOT NULL, category text NOT NULL,
                budget integer NOT NULL CHECK(budget BETWEEN 0 AND 4), snapshot jsonb NOT NULL, selection_meta jsonb NOT NULL,
                review_status text NOT NULL DEFAULT 'unreviewed' CHECK(review_status IN ('unreviewed','selected','hold','rejected')),
                cooperation_status text NOT NULL DEFAULT 'pending' CHECK(cooperation_status IN ('pending','agreed','declined')),
                advertising_status text NOT NULL DEFAULT 'pending' CHECK(advertising_status IN ('pending','agreed','declined')),
                notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), version integer NOT NULL DEFAULT 1, history jsonb NOT NULL DEFAULT '[]',
                created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())''')
            cur.execute(f'DELETE FROM {TABLE} WHERE source_table=%s AND source_id=%s RETURNING id',(table,sid))
            deleted=cur.rowcount
    return {'status':'deleted','id':cid,'deleted':deleted}

def repair_duplicates(conn):
    """Replace only untouched duplicate-address rows, preserving IDs and all user decisions."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT pg_advisory_xact_lock(174209151)')
        cur.execute(f'SELECT * FROM {TABLE} ORDER BY rank FOR UPDATE')
        existing=cur.fetchall(); address_key=lambda r:re.sub(r'\s+','',r['snapshot']['address'])
        grouped=defaultdict(list)
        for r in existing: grouped[address_key(r)].append(r)
        used=set(grouped); replacements=[]; retained_reviewed=0
        for items in grouped.values():
            items.sort(key=lambda r:(r['version']==1,r['rank']))
            for row in items[1:]:
                if row['version']!=1 or row['notes'] or row['review_status']!='unreviewed': retained_reviewed+=1;continue
                replacements.append(row)
        if not replacements: return {'status':'unchanged','retainedReviewedDuplicates':retained_reviewed}
        pool=[]
        for table in ('naver','naver_land'):
            cur.execute(f'SELECT to_jsonb(n)-\'geom\' AS row FROM public.{table} n WHERE "상태" IN (\'신규\',\'유지\') AND "거래가격">=10')
            for item in cur.fetchall():
                candidate=prepare(item['row'],table)
                if candidate and candidate['group_key'] not in used: pool.append(candidate)
        by_address=defaultdict(list)
        for r in pool: by_address[r['group_key']].append(r)
        pool=[]
        for items in by_address.values():
            items.sort(key=lambda r:(-r['priority'],r['price'],r['source_id']))
            row=dict(items[0]);row['alternatives']=[{k:r[k] for k in ('source_table','source_id','broker','phone','price')} for r in items]
            row['questions'].append('같은 주소의 광고 간 면적·매매 범위 차이 확인');pool.append(row)
        changed=0
        for old in replacements:
            eligible=[r for r in pool if r['group_key'] not in used and r['category']==old['category'] and r['budget']==old['budget']]
            if not eligible:continue
            candidate=min(eligible,key=lambda r:(sum(e['snapshot']['district']==r['district'] for e in existing),-r['priority'],r['price'],r['source_id']))
            candidate=dict(candidate);candidate.pop('priority',None);candidate['snapshotAt']=datetime.now(timezone.utc).isoformat()
            used.add(candidate['group_key'])
            cur.execute(f'''UPDATE {TABLE} SET source_table=%s,source_id=%s,group_key=%s,snapshot=%s,version=version+1,updated_at=now(),
                history=history || jsonb_build_array(jsonb_build_object('at',now(),'event','untouched_duplicate_replaced','previous_snapshot',snapshot)) WHERE id=%s''',
                (candidate['source_table'],candidate['source_id'],candidate['group_key'],Json(clean(candidate)),old['id']))
            old['snapshot']=candidate;changed+=1
        cur.execute(f"UPDATE {TABLE} SET selection_meta=selection_meta || %s::jsonb",(Json({'duplicateRepair':{'replaced':changed,'retainedReviewedDuplicates':retained_reviewed},'grouping':'주소별 연락 후보. 실제 매매 대상 범위는 확인 필요'}),))
        return {'status':'repaired','replaced':changed,'retainedReviewedDuplicates':retained_reviewed}

def audit_removed(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT to_regclass('public.teojabi_naver_sync_state') AS relation")
        if not cur.fetchone()['relation']:
            return {'status':'unavailable','rows':[], 'message':'정상 완료된 네이버 전체 동기화 기록이 아직 없습니다.'}
        cur.execute('SELECT completed_at,deletion_allowed FROM public.teojabi_naver_sync_state WHERE id=1')
        sync=cur.fetchone()
        if not sync or not sync['deletion_allowed']:
            return {'status':'unavailable','rows':[], 'message':'전체 수집·삭제 검증이 완료된 동기화 자료가 필요합니다.'}
        cur.execute('SELECT "대지위치" AS address FROM public.naver WHERE "상태" IS DISTINCT FROM %s',('삭제',))
        def address_key(value):
            value=re.sub(r'^서울(?:특별시|시)?\s*','',str(value or '').strip())
            return re.sub(r'\s+','',re.sub(r'번지$','',value))
        active={address_key(r['address']) for r in cur.fetchall() if r['address']}
        if not active:
            return {'status':'unavailable','rows':[], 'message':'원자료가 비어 있어 삭제 후보를 판정하지 않습니다.'}
        cur.execute(f'SELECT source_table,source_id,snapshot FROM {TABLE}')
        candidates=cur.fetchall()
        cur.execute('SELECT id::text AS source_id,address,title FROM public.property')
        candidates += [{'source_table':'premium','source_id':r['source_id'],'snapshot':{'address':r['address'],'description':r['title']}} for r in cur.fetchall()]
        hidden=read_hidden_ids(); rows=[]
        for row in candidates:
            s=row['snapshot']; address=s.get('address'); key=address_key(address)
            # A dong and lot number are required; vague/partial addresses are never deletion candidates.
            if not address or not re.search(r'(?:동|가|리)\s+산?\s*\d+(?:-\d+)?(?:번지)?$',address): continue
            if catalog_id(row['source_table'],row['source_id']) in hidden: continue
            if key not in active:
                rows.append({'source_table':row['source_table'],'source_id':row['source_id'],
                             'address':address,'teojabiNo':s.get('teojabiPick',{}).get('pickNo',''),
                             'pick':row['source_table']=='premium' or s.get('teojabiPick',{}).get('status')=='published'})
        return {'status':'checked','rows':rows,'completedAt':sync['completed_at']}

def update(conn,data):
    if isinstance(data,dict) and data.get('action')=='audit_removed':
        return audit_removed(conn)
    if isinstance(data,dict) and data.get('action')=='delete_removed':
        audit=audit_removed(conn)
        if audit['status']!='checked' or not any(r['source_table']==data.get('source_table') and r['source_id']==data.get('source_id') for r in audit['rows']):
            return {'status':'conflict','message':'동일 주소의 매물이 다시 확인됐거나 동기화 검증이 필요합니다.'}
        result=delete_pick(conn,data); listing(conn); return result
    if isinstance(data,dict) and data.get('action')=='register':
        result=register_pick(conn,data); listing(conn); return result
    if isinstance(data,dict) and data.get('action')=='bulk_register':
        result=bulk_register_picks(conn,data); listing(conn); return result
    if isinstance(data,dict) and data.get('action')=='delete':
        result=delete_pick(conn,data); listing(conn); return result
    if isinstance(data,dict) and data.get('action')=='auto_select_200':
        result=refresh_auto_selection(conn, data.get('criteria')); listing(conn); source_listing(conn); return result
    if isinstance(data,dict) and data.get('action')=='delete_all':
        result=delete_all_registered(conn); listing(conn); return result
    base_keys={'id','version','review_status','cooperation_status','advertising_status','notes'}
    if not isinstance(data,dict) or not base_keys.issubset(data) or any(k not in base_keys|{'pick'} for k in data): raise ValueError('Invalid fields')
    if type(data['id']) is not int or type(data['version']) is not int or data['id']<1 or data['version']<1: raise ValueError('Invalid version')
    if data['review_status'] not in STATES or data['cooperation_status'] not in CONTACT or data['advertising_status'] not in CONTACT: raise ValueError('Invalid state')
    if not isinstance(data['notes'],str) or len(data['notes'])>2000: raise ValueError('Invalid notes')
    pick=data.get('pick') or {}
    if not isinstance(pick,dict): raise ValueError('Invalid pick')
    pick_status=pick.get('status','draft')
    if pick_status not in PICK_STATUS: raise ValueError('Invalid pick status')
    def text(name,max_len):
        value=pick.get(name,'')
        if not isinstance(value,str): raise ValueError('Invalid pick text')
        return value.strip()[:max_len]
    tags=pick.get('tags',[])
    if not isinstance(tags,list): raise ValueError('Invalid pick tags')
    tags=[str(t).strip()[:20] for t in tags if isinstance(t,str) and str(t).strip()]
    pick_clean={'status':pick_status,'pickNo':text('pickNo',12),'headline':text('headline',80),'publicMemo':text('publicMemo',500),'tags':list(dict.fromkeys(tags))[:8]}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f'''UPDATE {TABLE} SET review_status=%s,cooperation_status=%s,advertising_status=%s,notes=%s,
            snapshot=jsonb_set(snapshot,'{{teojabiPick}}',%s::jsonb,true),
            history=history || jsonb_build_array(jsonb_build_object('at',now(),'version',version,
                'review_status',review_status,'cooperation_status',cooperation_status,'advertising_status',advertising_status,'notes',notes,'teojabiPick',snapshot->'teojabiPick')),
            version=version+1,updated_at=now() WHERE id=%s AND version=%s
            RETURNING id,review_status,cooperation_status,advertising_status,notes,version,updated_at,snapshot''',
            (data['review_status'],data['cooperation_status'],data['advertising_status'],data['notes'],Json(pick_clean),data['id'],data['version']))
        row=cur.fetchone()
        return {'status':'saved','row':row} if row else {'status':'conflict','message':'다른 화면에서 변경됐습니다. 새로고침 후 다시 저장해 주세요.'}

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    operation=sys.argv[1]
    if operation not in ('seed','list','sources','update','repair-duplicates','rebalance'): raise ValueError('Invalid operation')
    opts='-c statement_timeout=30000' + (' -c default_transaction_read_only=on' if operation=='list' else '')
    with psycopg2.connect(**local_config(),connect_timeout=5,options=opts) as conn:
        result=seed(conn,operation=='rebalance') if operation in ('seed','rebalance') else listing(conn) if operation=='list' else source_listing(conn) if operation=='sources' else repair_duplicates(conn) if operation=='repair-duplicates' else update(conn,json.loads(sys.stdin.read(256000)))
    print(json.dumps(result,ensure_ascii=False,default=str,allow_nan=False))

if __name__=='__main__':
    try: main()
    except ValueError:
        print(json.dumps({'status':'invalid'},ensure_ascii=False)); sys.exit(2)
    except Exception as exc:
        print(json.dumps({'status':'error','errorType':type(exc).__name__},ensure_ascii=False)); sys.exit(1)
