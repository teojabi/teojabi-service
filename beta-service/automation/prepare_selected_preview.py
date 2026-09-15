"""Freeze the explicitly requested 200-candidate preview; never changes review/consent or source tables."""
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
from service_database import service_config as local_config

ROOT = Path(__file__).resolve().parents[1]

def number(text, pattern):
    match = re.search(pattern, text)
    return float(match[1].replace(',', '')) if match else None

def premium_register_record(cur, address):
    variants = [address, address+'번지', address.replace('서울특별시', '서울시', 1)]
    cur.execute('''SELECT "건축물대장일련번호", "연면적", "지상층수", "지하층수"
                   FROM '''+('public.staging_building_info' if os.getenv('TEOJABI_DATA_SOURCE') in ('supabase','remote') else 'public.bldg_register')+'''
                   WHERE "대지위치"=ANY(%s) AND "연면적" IS NOT NULL AND "연면적"::text<>''
                   ORDER BY CASE WHEN "대장종류코드명"='일반건축물' THEN 0 ELSE 1 END, "건축물대장일련번호" LIMIT 1''',
                (variants,))
    return cur.fetchone()

def normalize_floor_info(value):
    text = str(value or '').strip()
    match = re.fullmatch(r'-?(\d+)\s*/\s*(\d+)', text)
    if not match:
        return text
    below = int(match[1]) if text.startswith('-') else 0
    above = int(match[2])
    parts = []
    if below:
        parts.append(f'지하 {below}층')
    if above:
        parts.append(f'지상 {above}층')
    return ' / '.join(parts) or text

def naver_building_facts(cur, source_id=None, pnu=None, address=None, price=None):
    where, params = [], []
    if source_id:
        where.append('"매물번호"=%s')
        params.append(str(source_id))
    else:
        variants = [address, address+'번지', address.replace('서울특별시', '서울시', 1)] if address else []
        if pnu and re.fullmatch(r'11\d{17}', str(pnu)):
            where.append('pnu=%s')
            params.append(str(pnu))
        elif variants:
            where.append('"대지위치"=ANY(%s)')
            params.append(variants)
        else:
            return {}
    order = ''
    if price:
        order = 'ORDER BY CASE WHEN "거래가격"=%s THEN 0 ELSE 1 END, "매물번호" LIMIT 1'
        params.append(float(price) / 100000000)
    else:
        order = 'LIMIT 1'
    cur.execute(f'''SELECT "대지면적","연면적","층정보","용적률","주용도코드명","사용승인일자"
                    FROM public.naver WHERE {' OR '.join(where)} {order}''', params)
    row = cur.fetchone()
    if not row:
        return {}
    facts = {}
    if row.get('대지면적'):
        facts['landAreaM2'] = float(row['대지면적'])
    if row.get('연면적'):
        facts['floorAreaM2'] = float(row['연면적'])
    floor_info = normalize_floor_info(row.get('층정보'))
    if floor_info:
        facts['floorScale'] = floor_info
    if row.get('용적률'):
        facts['farPercent'] = float(row['용적률'])
    if row.get('주용도코드명'):
        facts['mainUse'] = str(row['주용도코드명']).strip()
    if row.get('사용승인일자'):
        facts['approvalDate'] = str(row['사용승인일자']).strip()
    return facts

def premium_floor_info(cur, premium, address):
    price = int(premium['price']) / 100000000
    if re.fullmatch(r'11\d{17}', str(premium.get('pnu') or '')):
        cur.execute('''SELECT "층정보", "매물번호" FROM public.naver
                       WHERE pnu=%s AND NULLIF("층정보",'') IS NOT NULL
                       ORDER BY CASE WHEN "거래가격"=%s THEN 0 ELSE 1 END, "매물번호" LIMIT 1''',
                    (premium['pnu'], price))
        match = cur.fetchone()
        if match:
            return match['층정보'], str(match['매물번호'])
    variants = [address, address+'번지', address.replace('서울특별시', '서울시', 1)]
    cur.execute('''SELECT "층정보", "매물번호" FROM public.naver
                   WHERE "대지위치"=ANY(%s) AND NULLIF("층정보",'') IS NOT NULL
                   ORDER BY CASE WHEN "거래가격"=%s THEN 0 ELSE 1 END, "매물번호" LIMIT 1''',
                (variants, price))
    match = cur.fetchone()
    return (match['층정보'], str(match['매물번호'])) if match else ('', None)

def premium_floor_area(cur, premium, address):
    price = int(premium['price']) / 100000000
    if re.fullmatch(r'11\d{17}', str(premium.get('pnu') or '')):
        cur.execute('''SELECT "연면적", "매물번호" FROM public.naver
                       WHERE pnu=%s AND "연면적" IS NOT NULL AND "연면적"::text<>''
                       ORDER BY CASE WHEN "거래가격"=%s THEN 0 ELSE 1 END, "매물번호" LIMIT 1''',
                    (premium['pnu'], price))
        match = cur.fetchone()
        if match and match['연면적']:
            return float(match['연면적']), str(match['매물번호'])
    variants = [address, address+'번지', address.replace('서울특별시', '서울시', 1)]
    cur.execute('''SELECT "연면적", "매물번호" FROM public.naver
                   WHERE "대지위치"=ANY(%s) AND "연면적" IS NOT NULL AND "연면적"::text<>''
                   ORDER BY CASE WHEN "거래가격"=%s THEN 0 ELSE 1 END, "매물번호" LIMIT 1''',
                (variants, price))
    match = cur.fetchone()
    return (float(match['연면적']), str(match['매물번호'])) if match and match['연면적'] else (None, None)

def prepare():
    remote=os.getenv('TEOJABI_DATA_SOURCE') in ('supabase','remote')
    premiums = [] if remote else json.loads((ROOT / '.local/original-properties.json').read_text(encoding='utf-8-sig'))
    numbers={}
    rows = []
    with psycopg2.connect(**local_config(), options='-c default_transaction_read_only=on -c statement_timeout=20000') as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if remote:
                cur.execute('SELECT id,title,description,address,price,pnu,ST_Y(location::geometry) AS lat,ST_X(location::geometry) AS lng FROM public.property ORDER BY id')
                premiums=cur.fetchall()
                cur.execute('SELECT listing_id,teojabi_no FROM public.teojabi_listing_number')
                numbers={r['listing_id']:r['teojabi_no'] for r in cur.fetchall()}
            cur.execute("SELECT id,snapshot FROM public.teojabi_curation_candidates WHERE NOT (snapshot ? 'teojabiPick') ORDER BY rank,id")
            automatic = cur.fetchall()
            cur.execute("SELECT id,snapshot FROM public.teojabi_curation_candidates WHERE snapshot ? 'teojabiPick' ORDER BY rank,id")
            manual = cur.fetchall()
            for candidate in automatic + manual:
                s = candidate['snapshot']
                pick = s.get('teojabiPick') or {}
                facts = naver_building_facts(cur, source_id=s['source_id']) if s['source_table']=='naver' else {}
                rows.append(dict(id=('naver:' if s['source_table']=='naver' else 'naver-land:')+s['source_id'],
                    source=s['source_table'],sourceId=s['source_id'],cohort='existing' if pick.get('status')=='published' else 'curated',
                    teojabiNo=pick.get('pickNo') or None,
                    address=s['address'],district=s['district'],neighborhood=s['neighborhood'],
                    pnu=s.get('pnu'),position=s['position'],priceWon=round(float(s['price'])*100000000),
                    areaM2=s['areaM2'],floorAreaM2=s.get('floorAreaM2'),floorInfo=s.get('floorInfo',''),
                    description=pick.get('headline') or s.get('description',''),category=s['category'],
                    buildingFacts=facts,
                    kind='land' if s['category']=='land' else 'building'))

            for p in premiums:
                description=p.get('description') or ''
                cur.execute('SELECT "대지위치" AS address,"시군구코드명" AS district,"법정동코드명" AS neighborhood FROM public.master_land WHERE pnu=%s LIMIT 2',(p.get('pnu'),))
                matches=cur.fetchall()
                m=matches[0] if len(matches)==1 else {}
                address=m.get('address') or ' '.join(filter(None,[p.get('legal_dong_name'),re.search(r'\d+(?:-\d+)?$',p['address'])[0] if re.search(r'\d+(?:-\d+)?$',p['address']) else None])) or p['address']
                district_match=re.search(r'([가-힣]+구)',address)
                neighborhood_match=re.search(r'[가-힣]+구\s+(\S+)',address)
                # Import existing specifications, not speculative development/return calculations.
                basic=re.search(r'▣ 건물 현황\s*([\s\S]*?)(?:▣|$)',description)
                spec=basic[1].strip() if basic else ''
                area=number(description,r'대지면적\s*:\s*([\d,.]+)\s*(?:㎡|m2|m²)')
                floor=number(description,r'(?:기존\s*)연면적\s*:\s*([\d,.]+)\s*(?:㎡|m2|m²)')
                floor_source_label = 'original-record' if floor else None
                floor_info, floor_source = premium_floor_info(cur, p, address)
                floor_source_id = None
                if not floor:
                    floor, floor_source_id = premium_floor_area(cur, p, address)
                    floor_source_label = 'naver' if floor_source_id else None
                register = None
                if not floor or not floor_info:
                    register = premium_register_record(cur, address)
                if not floor and register:
                    floor = float(register['연면적'])
                    floor_source_label = 'building-register'
                    floor_source_id = str(register['건축물대장일련번호'])
                if not floor_info and register:
                    above = int(float(register['지상층수'] or 0))
                    below = int(float(register['지하층수'] or 0))
                    floor_info = f'-{below}/{above}' if below else f'0/{above}'
                    floor_source = str(register['건축물대장일련번호'])
                rows.append(dict(id='premium:'+p['id'],source='property',sourceId=p['id'],cohort='existing',
                    address=address,district=district_match[1] if district_match else '',
                    neighborhood=neighborhood_match[1] if neighborhood_match else '',
                    pnu=p.get('pnu'),position={'lat':float(p['lat']),'lng':float(p['lng'])},
                    priceWon=int(p['price']),areaM2=area,floorAreaM2=floor,
                    floorAreaSource=floor_source_label, floorAreaSourceId=floor_source_id,
                    floorInfo=floor_info or '',
                    floorInfoSource='building-register' if register and str(register['건축물대장일련번호'])==str(floor_source) else 'naver' if floor_info else None, floorInfoSourceId=floor_source,
                    buildingFacts=naver_building_facts(cur, pnu=p.get('pnu'), address=address, price=p.get('price')),
                    description=p.get('title') or spec or '기존 등록 매물입니다. 상세 현황은 상담 시 확인해 주세요.',
                    category='commercial',kind='building'))
    output={'source':'selected-preview-v1','observedAt':datetime.now(timezone.utc).isoformat(),
            'curatedCount':len(automatic)+sum(1 for r in manual if (r['snapshot'].get('teojabiPick') or {}).get('status')!='published'),
            'existingCount':len(premiums)+sum(1 for r in manual if (r['snapshot'].get('teojabiPick') or {}).get('status')=='published'),'rows':rows}
    for row in rows:
        row['teojabiNo']=numbers.get(row['id']) or row.get('teojabiNo')
    target=ROOT/('.local/supabase' if remote else '.local')/'selected-catalog.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_suffix('.tmp')
    temp.write_text(json.dumps(output,ensure_ascii=False,default=str),encoding='utf-8')
    temp.replace(target)
    print(json.dumps({'input':len(rows),'curated':output['curatedCount'],'existing':output['existingCount'],
                      'missingArea':[r['id'] for r in rows if not r['areaM2']],
                      'districts':dict(Counter(r['district'] for r in rows))},ensure_ascii=False))

if __name__=='__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    prepare()
