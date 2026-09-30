-- 필지별 지구단위계획 값 + 지구단위별 근거자료 + 미해결 사유 + 용도지역 법정 기준 (2026-09-30)
-- Supabase Edge 'data' 함수가 호출한다.
--   · parcels : dgm_parcel_reg(필지별 값, master_land 승격 원본) + 근거파일 URL
--   · zones   : dgm_district_regulation(지구단위별 값/근거자료 링크)
--   · plans   : 이 필지를 포함하는 지구단위계획구역
--   · legal   : master_land.법정기준용도지역/최대용적률/최대건폐율
--   · status  : ready(필지 값 있음) / district-only(구역 값만) / not-in-plan
-- 전제 테이블: dgm_parcel_reg, dgm_district_regulation, district_file_list, district_far_regulation

CREATE OR REPLACE FUNCTION public.teojabi_parcel_district(p_pnu text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with p as (
    select ST_MakeValid(ST_Transform(geom,4326)) as geom
    from public.seoul_parcel_map
    where pnu = p_pnu and ST_IsValid(geom) and ST_SRID(geom) = 5174
  ),
  covering as (
    select d.id as "districtId", d.dgm_nm as "dgmName"
    from public.district_unit_plan d join p on d.geom && p.geom
    where ST_Intersects(ST_MakeValid(d.geom), p.geom)
  ),
  parcel_rows as (
    select r.pnu, r.district_id as "districtId", r.dgm_nm as "dgmName",
           r.zone_name as "zoneName", r.zone_code as "zoneCode",
           r.far_standard as "farStandard", r.far_allowed as "farAllowed", r.far_upper as "farUpper",
           r.bcr, r.height_m as "heightM", r.floors,
           r.far_text as "farText", r.height_text as "heightText",
           r.method, r.confidence, r.source_file as "sourceFile",
           coalesce(df.file_url_enc, df.file_url, r.source_url) as "sourceUrl"
    from public.dgm_parcel_reg r
    left join public.district_file_list df
      on df.district_id = r.district_id and df.file_name = r.source_file
    where r.pnu = p_pnu
  ),
  district_ids as (
    select "districtId" from parcel_rows where "districtId" is not null
    union
    select "districtId" from covering
  ),
  zone_rows as (
    select z.district_id as "districtId", z.dgm_nm as "dgmName",
           z.zone_name as "zoneName", z.zone_code as "zoneCode",
           z.far_standard as "farStandard", z.far_basic as "farBasic", z.far_allowed as "farAllowed",
           z.far_upper as "farUpper", z.bcr, z.height_m as "heightM", z.floors,
           z.source_file as "sourceFile", z.source_sheet as "sourceSheet", z.source_page as "sourcePage",
           coalesce(z.source_url_enc, z.source_url) as "sourceUrl",
           z.method, z.confidence
    from public.dgm_district_regulation z
    where z.district_id in (select "districtId" from district_ids)
  ),
  legal_row as (
    select "법정기준용도지역" as zone, "용도지역" as "originalZone",
           "최대용적률" as far, "최대건폐율" as bcr, "법정기준상태" as state
    from public.master_land where pnu = p_pnu limit 1
  )
  select jsonb_build_object(
    'status', case
        when (select count(*) from parcel_rows) > 0 then 'ready'
        when (select count(*) from covering) > 0 then 'district-only'
        else 'not-in-plan' end,
    'pnu', p_pnu,
    'parcels', coalesce((select jsonb_agg(to_jsonb(parcel_rows)) from parcel_rows), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(covering)) from covering), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(to_jsonb(zone_rows)) from zone_rows), '[]'::jsonb),
    'hasDistrictValue', exists (
        select 1 from public.district_far_regulation f
        where f.dgm_nm in (select "dgmName" from covering)
    ),
    'legal', (select to_jsonb(legal_row) from legal_row)
  );
$function$;
