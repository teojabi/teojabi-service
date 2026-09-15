import os

def remote_mode():
    return os.getenv('TEOJABI_DATA_SOURCE','local') in ('supabase','remote')

def building_relation():
    return 'public.staging_building_info' if remote_mode() else 'public.bldg_register'

def ledger_relation():
    if not remote_mode():
        return 'public.seoul_land_ledger'
    # Only the official ledger fields already loaded in master_land are exposed.
    # Polygon area / listing area must never substitute for missing ledger area.
    return '''(SELECT pnu, "법정동코드명" AS "법정동명",
        concat_ws('-',nullif(ltrim("주지번",'0'),''),nullif(ltrim("부지번",'0'),'')) AS "지번",
        ledger_register_type AS "대장구분명",ledger_land_category AS "지목명",
        ledger_area_m2 AS "면적",NULL::text AS "소유구분명",NULL::text AS "축척구분명",
        ledger_data_date AS "데이터기준일자",ledger_snapshot_date AS source_snapshot_date
        FROM public.master_land WHERE ledger_area_m2 IS NOT NULL)'''
