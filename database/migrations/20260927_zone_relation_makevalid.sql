-- 구역 경계(교육보호·관광숙박특화·지구단위계획·문화재) 도형이 invalid이면
-- ST_Relate/ST_Covers가 NULL을 돌려주어 '경계 확인 필요(확인하지 못했어요)'로 표시되던 문제를
-- ST_MakeValid로 보정한다. (2026-09-27)
-- 대상 RPC: teojabi_zone, teojabi_plans, teojabi_heritage (Supabase Edge 'data' 함수가 호출)

CREATE OR REPLACE FUNCTION public.teojabi_zone(p_table text, p_pnu text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare res jsonb;
begin
  if p_table not in ('education_safezones','tour_zones') then raise exception 'invalid zone'; end if;
  execute format($f$
    with p as (select ST_MakeValid(ST_Transform(geom,4326)) as geom from public.seoul_parcel_map where pnu=$1),
    cand as (
      select md5(coalesce(z.name,'')||ST_AsEWKT(z.geom)) as id, z.name,
        case when not ST_IsEmpty(z.geom) then ST_Relate(ST_MakeValid(z.geom),p.geom,'T********') end as "overlaps",
        case when not ST_IsEmpty(z.geom) then ST_Covers(ST_MakeValid(z.geom),p.geom) end as covers,
        case when not ST_IsEmpty(z.geom) then ST_Touches(ST_MakeValid(z.geom),p.geom) end as touches
      from public.%I z join p on z.geom && p.geom
    ),
    res as (select cand.*, count(*) over() as total from cand
      where "overlaps" is true or touches is true or "overlaps" is null order by id limit 31)
    select jsonb_build_object('status','ready','rows', coalesce(jsonb_agg(to_jsonb(res) order by res.id),'[]'::jsonb)) from res
  $f$, p_table) into res using p_pnu;
  return res;
end $function$;

CREATE OR REPLACE FUNCTION public.teojabi_plans(p_pnu text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with p as (select ST_MakeValid(ST_Transform(geom,4326)) as geom from public.seoul_parcel_map where pnu=p_pnu and ST_IsValid(geom) and ST_SRID(geom)=5174),
  cand as (
    select d.id, d.dgm_nm as "dgmName", d.zone_name as name, d.notice_title as title,
      d.notice_date as "noticeDate", d.notice_no as "noticeNumber",
      d.notice_pdf_name as "pdfName", d.notice_pdf_url as "pdfUrl",
      d.drawings, d.updated_at as "storedAt",
      case when ST_SRID(d.geom)=4326 and not ST_IsEmpty(d.geom) then ST_Relate(ST_MakeValid(d.geom),p.geom,'T********') end as "overlaps",
      case when ST_SRID(d.geom)=4326 and not ST_IsEmpty(d.geom) then ST_Covers(ST_MakeValid(d.geom),p.geom) end as "covers",
      case when ST_SRID(d.geom)=4326 and not ST_IsEmpty(d.geom) then ST_Touches(ST_MakeValid(d.geom),p.geom) end as "touches"
    from public.district_unit_plan d join p on d.geom && p.geom
  ),
  res as (select cand.*, count(*) over() as total from cand
    where "overlaps" is true or "touches" is true or "overlaps" is null
    order by "noticeDate" desc nulls last, id limit 21)
  select jsonb_build_object('status','ready','rows', coalesce(jsonb_agg(to_jsonb(res) order by res."noticeDate" desc nulls last, res.id),'[]'::jsonb)) from res;
$function$;

CREATE OR REPLACE FUNCTION public.teojabi_heritage(p_pnu text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with p as (select ST_MakeValid(ST_Transform(geom,4326)) as geom from public.seoul_parcel_map where pnu=p_pnu),
  cand as (
    select h.id::text as id, concat_ws(' ', nullif(h.heritage_name,''), h.display_name) as name, h.category as code,
      h.flat_height_m as "flatHeightM", h.slope_height_m as "slopeHeightM", h.regulation_label as "heightNote",
      case when ST_SRID(h.the_geom)=4326 and not ST_IsEmpty(h.the_geom) and GeometryType(h.the_geom) in ('POLYGON','MULTIPOLYGON') then ST_Relate(ST_MakeValid(h.the_geom),p.geom,'T********') end as "overlaps",
      case when ST_SRID(h.the_geom)=4326 and not ST_IsEmpty(h.the_geom) and GeometryType(h.the_geom) in ('POLYGON','MULTIPOLYGON') then ST_Covers(ST_MakeValid(h.the_geom),p.geom) end as "covers",
      case when ST_SRID(h.the_geom)=4326 and not ST_IsEmpty(h.the_geom) and GeometryType(h.the_geom) in ('POLYGON','MULTIPOLYGON') then ST_Touches(ST_MakeValid(h.the_geom),p.geom) end as "touches"
    from public.heritage_layers h join p on h.the_geom && p.geom
    where h.layer_name in ('CHL_PMPG_AS_1','CHL_PMPG_AS_23')
  ),
  res as (select cand.*, count(*) over() as total from cand
    where "overlaps" is true or "touches" is true or "overlaps" is null order by id limit 31)
  select jsonb_build_object('status','ready','rows', coalesce(jsonb_agg(to_jsonb(res) order by res.id),'[]'::jsonb)) from res;
$function$;
