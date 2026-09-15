from source_relations import building_relation, remote_mode
"""On-demand local evidence for one listing. The caller supplies a read-only connection."""
import re
from datetime import datetime, timezone


def read_risk(connection, source_id, include_registers=True, include_context=True, parcel_pnu=None, reference=None):
    if not re.fullmatch(r'(?:\d{1,30}|[a-f0-9-]{36})' if reference else r'\d{1,30}', source_id or ''):
        raise ValueError('Invalid listing')

    def fetch(sql, params=()):
        # Isolate a source failure without exposing SQL or connection details.
        try:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                names = [column.name for column in cursor.description]
                return {'status': 'ready', 'rows': [dict(zip(names, row)) for row in cursor.fetchall()]}
        except Exception:
            connection.rollback()
            return {'status': 'error', 'rows': []}

    def remote_zone(table,pnu):
        if table not in ('education_safezones','tour_zones'): raise ValueError('Invalid zone')
        return fetch('''WITH p AS (SELECT ST_Transform(geom,4326) AS geom FROM public.seoul_parcel_map WHERE pnu=%s),
            candidates AS (SELECT md5(coalesce(z.name,'')||ST_AsEWKT(z.geom)) AS id,z.name,
                CASE WHEN ST_IsValid(z.geom) AND NOT ST_IsEmpty(z.geom) THEN ST_Relate(z.geom,p.geom,'T********') END AS "overlaps",
                CASE WHEN ST_IsValid(z.geom) AND NOT ST_IsEmpty(z.geom) THEN ST_Covers(z.geom,p.geom) END AS covers,
                CASE WHEN ST_IsValid(z.geom) AND NOT ST_IsEmpty(z.geom) THEN ST_Touches(z.geom,p.geom) END AS touches
                FROM public.'''+table+''' z JOIN p ON z.geom && p.geom)
            SELECT *,count(*) OVER() AS total FROM candidates
            WHERE "overlaps" IS TRUE OR touches IS TRUE OR "overlaps" IS NULL ORDER BY id LIMIT 31''',(pnu,))

    if parcel_pnu is not None and not re.fullmatch(r'11\d{17}', parcel_pnu):
        raise ValueError('Invalid parcel')
    if reference is not None:
        found={'status':'ready','rows':[reference]}
    else:
        found = fetch('SELECT "대지위치" AS address, pnu FROM public.master_land WHERE pnu=%s LIMIT 2', (parcel_pnu,)) if parcel_pnu else fetch('SELECT "대지위치" AS address, pnu FROM public.naver WHERE "매물번호"=%s LIMIT 2', (source_id,))
    if found['status'] != 'ready' or len(found['rows']) != 1:
        raise ValueError('Listing unavailable')
    listing = found['rows'][0]
    address = re.sub(r'\s+', ' ', listing['address'] or '').strip()
    address = re.sub(r'^서울시 ', '서울특별시 ', address)
    address = re.sub(r'번지$', '', address).strip()
    # Exact address variants only; never drop a lot suffix or guess an adjoining parcel.
    addresses = list({address, address + '번지', listing['address']}) if address else []
    address_parts = address.split()
    district = next((part for part in address_parts if part.endswith(('구', '군'))), '')
    neighborhood = next((part for part in address_parts if part.endswith(('동', '가', '읍', '면'))), '')
    structured_lot = None
    if isinstance(listing.get('pnu'), str) and re.fullmatch(r'11\d{17}', listing['pnu']):
        main_lot = str(int(listing['pnu'][11:15]))
        sub_lot = str(int(listing['pnu'][15:19]))
        lot_text = main_lot if sub_lot == '0' else f'{main_lot}-{sub_lot}'
        structured_lot = ([lot_text, lot_text + '번지'], [main_lot, main_lot.zfill(4)], [sub_lot, sub_lot.zfill(4)])
    register_where = '''"대지위치"=ANY(%s)'''
    register_params = [addresses]
    if structured_lot and district and neighborhood:
        address_patterns = [f'%{district}%{neighborhood}% {structured_lot[0][0]}', f'%{district}%{neighborhood}% {structured_lot[0][1]}']
        register_where += ''' OR ("시군구코드명" IN (%s,%s) AND "법정동코드명"=%s AND ("주지번"=ANY(%s) OR ("주지번"=ANY(%s) AND COALESCE("부지번",'0')=ANY(%s)))) OR "대지위치" LIKE ANY(%s)'''
        register_params.extend([district, '서울특별시 ' + district, neighborhood, *structured_lot, address_patterns])
    recap = fetch('''
        SELECT to_jsonb(r) AS "recordFields", "건축물대장일련번호" AS serial, "대지위치" AS address,
               "대장구분코드명" AS category, "대장종류코드명" AS type,
               "대지면적" AS "landArea", "연면적" AS "floorArea",
               "주건축물수" AS "mainCount", "부속건축물수" AS "accessoryCount",
               "총주차수" AS parking, "주용도코드명" AS use,
               "사용승인일자" AS "approvalDate", COUNT(*) OVER() AS total
        FROM public.seoul_building_register r WHERE pnu=%s OR ('''+register_where+''')
        ORDER BY "건축물대장일련번호" LIMIT 31
    ''', tuple([listing.get('pnu')] + register_params)) if include_registers and addresses else {'status': 'skipped' if not include_registers else 'missing-address', 'rows': []}
    if remote_mode():
        buildings = fetch('''
        SELECT to_jsonb(r) AS "recordFields", id::text AS serial, %s::text AS address,
               '표제부'::text AS category, '건축물 현황'::text AS type,
               bld_nm AS name, NULL::text AS role,
               plat_area AS "landArea", tot_area AS "floorArea",
               strct_cd_nm AS structure, main_purps_cd_nm AS use,
               grnd_flr_cnt AS "aboveFloors", ugnd_flr_cnt AS "belowFloors",
               use_apr_day AS "approvalDate", COUNT(*) OVER() AS total
        FROM public.building_info r WHERE pnu=%s
        ORDER BY id LIMIT 31
        ''', (address, listing.get('pnu')))
    else:
        buildings = fetch('''
        SELECT to_jsonb(r) AS "recordFields", "건축물대장일련번호" AS serial, "대지위치" AS address,
               "대장구분코드명" AS category, "대장종류코드명" AS type,
               "동명" AS name, "주부속구분코드명" AS role,
               "대지면적" AS "landArea", "연면적" AS "floorArea",
               "구조코드명" AS structure, "주용도코드명" AS use,
               "지상층수" AS "aboveFloors", "지하층수" AS "belowFloors",
               "사용승인일자" AS "approvalDate", COUNT(*) OVER() AS total
        FROM '''+building_relation()+''' r WHERE '''+register_where+'''
        ORDER BY "건축물대장일련번호" LIMIT 31
        ''', tuple(register_params)) if include_registers and addresses else {'status': 'skipped' if not include_registers else 'missing-address', 'rows': []}
    pnu = listing['pnu']
    if not include_context:
        return {'sourceId': source_id, 'address': address, 'pnu': pnu,
                'recap': recap, 'buildings': buildings}
    parcel = {'status': 'missing', 'rows': []}
    plans = {'status': 'missing-parcel', 'rows': []}
    education = {'status': 'missing-parcel', 'rows': []}
    tourism = {'status': 'missing-parcel', 'rows': []}
    road = {'status': 'missing-parcel', 'rows': []}
    heritage = {'status': 'missing-parcel', 'rows': []}
    if isinstance(pnu, str) and re.fullmatch(r'11\d{17}', pnu):
        road = fetch('''SELECT pnu,"도로폭_m" AS "widthM", "최대용적률" AS far,"최대건폐율" AS bcr,
            "용도지역" AS "originalZone","법정기준용도지역" AS zone,"법정기준상태" AS "baselineStatus",
            "서울도심" AS downtown FROM public.master_land WHERE pnu=%s LIMIT 2''', (pnu,))
        parcel = fetch('''
            SELECT ST_IsValid(geom) AS valid, ST_SRID(geom) AS srid,
                CASE WHEN ST_IsValid(geom) AND ST_SRID(geom)=5174
                          AND GeometryType(geom) IN ('POLYGON','MULTIPOLYGON')
                     THEN ST_Area(ST_Transform(geom,4326)::geography) END AS "mapArea"
            FROM public.seoul_parcel_map WHERE pnu=%s LIMIT 2
        ''', (pnu,))
        if parcel['status'] == 'ready' and len(parcel['rows']) == 1 and parcel['rows'][0]['mapArea']:
            heritage = fetch('''
                WITH p AS (SELECT ST_Transform(geom,4326) AS geom FROM public.seoul_parcel_map WHERE pnu=%s), candidates AS (
                    SELECT h.id::text AS id,concat_ws(' ',NULLIF(h.heritage_name,''),h.display_name) AS name,h.category AS code,
                        h.flat_height_m AS "flatHeightM",h.slope_height_m AS "slopeHeightM",h.regulation_label AS "heightNote",
                        CASE WHEN ST_SRID(h.the_geom)=4326 AND ST_IsValid(h.the_geom) AND NOT ST_IsEmpty(h.the_geom)
                            AND GeometryType(h.the_geom) IN ('POLYGON','MULTIPOLYGON')
                            THEN ST_Relate(h.the_geom,p.geom,'T********') END AS "overlaps",
                        CASE WHEN ST_SRID(h.the_geom)=4326 AND ST_IsValid(h.the_geom) AND NOT ST_IsEmpty(h.the_geom)
                            AND GeometryType(h.the_geom) IN ('POLYGON','MULTIPOLYGON')
                            THEN ST_Covers(h.the_geom,p.geom) END AS "covers",
                        CASE WHEN ST_SRID(h.the_geom)=4326 AND ST_IsValid(h.the_geom) AND NOT ST_IsEmpty(h.the_geom)
                            AND GeometryType(h.the_geom) IN ('POLYGON','MULTIPOLYGON')
                            THEN ST_Touches(h.the_geom,p.geom) END AS "touches"
                    FROM public.heritage_layers h JOIN p ON h.the_geom && p.geom
                    WHERE h.layer_name IN ('CHL_PMPG_AS_1','CHL_PMPG_AS_23')
                ) SELECT *,COUNT(*) OVER() AS total FROM candidates
                    WHERE "overlaps" IS TRUE OR "touches" IS TRUE OR "overlaps" IS NULL ORDER BY id LIMIT 31
            ''', (pnu,))
            plans = fetch('''
                WITH p AS (
                    SELECT ST_Transform(geom,4326) AS geom FROM public.seoul_parcel_map
                    WHERE pnu=%s AND ST_IsValid(geom) AND ST_SRID(geom)=5174
                ), candidates AS (
                    SELECT d.id, d.zone_name AS name, d.notice_title AS title,
                           d.notice_date AS "noticeDate", d.notice_no AS "noticeNumber",
                           d.notice_pdf_name AS "pdfName", d.notice_pdf_url AS "pdfUrl",
                           d.drawings, d.updated_at AS "storedAt",
                           CASE WHEN ST_SRID(d.geom)=4326 AND ST_IsValid(d.geom) AND NOT ST_IsEmpty(d.geom)
                                THEN ST_Relate(d.geom,p.geom,'T********') END AS "overlaps",
                           CASE WHEN ST_SRID(d.geom)=4326 AND ST_IsValid(d.geom) AND NOT ST_IsEmpty(d.geom)
                                THEN ST_Covers(d.geom,p.geom) END AS "covers",
                           CASE WHEN ST_SRID(d.geom)=4326 AND ST_IsValid(d.geom) AND NOT ST_IsEmpty(d.geom)
                                THEN ST_Touches(d.geom,p.geom) END AS "touches"
                    FROM public.district_unit_plan d JOIN p ON d.geom && p.geom
                )
                SELECT *, COUNT(*) OVER() AS total FROM candidates
                WHERE "overlaps" IS TRUE OR "touches" IS TRUE OR "overlaps" IS NULL
                ORDER BY "noticeDate" DESC NULLS LAST, id LIMIT 21
            ''', (pnu,))
            # Transform the single parcel, keeping source geometries indexed and unchanged.
            education = remote_zone('education_safezones',pnu) if remote_mode() else fetch('''
                WITH p AS (SELECT geom FROM public.seoul_parcel_map WHERE pnu=%s), candidates AS (
                    SELECT e.objt_id::text AS id, e."보호구역명" AS name, e.pros_cd AS code,
                        e.ntfc_year AS "noticeYear", e.ntfc_no AS "noticeNumber",
                        CASE WHEN ST_SRID(e.geom_5174)=5174 AND ST_IsValid(e.geom_5174)
                                  AND NOT ST_IsEmpty(e.geom_5174) AND GeometryType(e.geom_5174) IN ('POLYGON','MULTIPOLYGON')
                             THEN ST_Relate(e.geom_5174,p.geom,'T********') END AS "overlaps",
                        CASE WHEN ST_SRID(e.geom_5174)=5174 AND ST_IsValid(e.geom_5174)
                                  AND NOT ST_IsEmpty(e.geom_5174) AND GeometryType(e.geom_5174) IN ('POLYGON','MULTIPOLYGON')
                             THEN ST_Covers(e.geom_5174,p.geom) END AS "covers",
                        CASE WHEN ST_SRID(e.geom_5174)=5174 AND ST_IsValid(e.geom_5174)
                                  AND NOT ST_IsEmpty(e.geom_5174) AND GeometryType(e.geom_5174) IN ('POLYGON','MULTIPOLYGON')
                             THEN ST_Touches(e.geom_5174,p.geom) END AS "touches"
                    FROM public.education_protection e JOIN p ON e.geom_5174 && p.geom
                ) SELECT *, COUNT(*) OVER() AS total FROM candidates
                  WHERE "overlaps" IS TRUE OR "touches" IS TRUE OR "overlaps" IS NULL
                  ORDER BY id LIMIT 31
            ''', (pnu,))
            tourism = remote_zone('tour_zones',pnu) if remote_mode() else fetch('''
                WITH p AS (SELECT ST_Transform(geom,4326) AS geom FROM public.seoul_parcel_map WHERE pnu=%s), candidates AS (
                    SELECT t.id::text AS id, t.zone_name AS name, t.zone_type AS type,
                        t.notice_date AS "noticeDate", t.notice_no AS "noticeNumber",
                        d.notice_pdf_url AS "pdfUrl", d.notice_pdf_name AS "pdfName",
                        CASE WHEN ST_SRID(t.geom)=4326 AND ST_IsValid(t.geom) AND NOT ST_IsEmpty(t.geom)
                             THEN ST_Relate(t.geom,p.geom,'T********') END AS "overlaps",
                        CASE WHEN ST_SRID(t.geom)=4326 AND ST_IsValid(t.geom) AND NOT ST_IsEmpty(t.geom)
                             THEN ST_Covers(t.geom,p.geom) END AS "covers",
                        CASE WHEN ST_SRID(t.geom)=4326 AND ST_IsValid(t.geom) AND NOT ST_IsEmpty(t.geom)
                             THEN ST_Touches(t.geom,p.geom) END AS "touches"
                    FROM public.tourist_accommodation_zone t JOIN p ON t.geom && p.geom
                    LEFT JOIN public.district_unit_plan d ON d.id=t.district_plan_id
                ) SELECT *, COUNT(*) OVER() AS total FROM candidates
                  WHERE "overlaps" IS TRUE OR "touches" IS TRUE OR "overlaps" IS NULL
                  ORDER BY "noticeDate" DESC NULLS LAST, id LIMIT 31
            ''', (pnu,))
    return {'sourceId': source_id, 'address': address, 'pnu': pnu,
            'observedAt': datetime.now(timezone.utc).isoformat(),
            'recap': recap, 'buildings': buildings, 'parcel': parcel, 'plans': plans,
            'education': education, 'tourism': tourism, 'heritage': heritage, 'road': road}
