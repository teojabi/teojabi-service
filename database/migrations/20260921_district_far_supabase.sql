-- 지구단위계획 용적률·고시정보 서빙 뷰를 운영(Supabase)에 생성한다.
-- 전제: public.district_unit_plan 이 운영 DB에 이미 존재해야 한다(id 일치).
-- 데이터 적재는 automation/sync_district_far.py 가 담당한다(이 파일은 스키마 전용).

BEGIN;

-- 1) 원본 테이블 ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.district_far_regulation (
    id integer NOT NULL,
    district_id integer,
    dgm_nm character varying(300),
    singu_cd character varying(10),
    zone_type character varying(100),
    applied_area text,
    block_code character varying(50),
    change_type character varying(20),
    far_standard numeric(8,2),
    far_basic numeric(8,2),
    far_allowed numeric(8,2),
    far_upper numeric(8,2),
    far_standard_text text,
    far_allowed_text text,
    far_upper_text text,
    bcr numeric(8,2),
    bcr_text text,
    height_m numeric(8,2),
    floors integer,
    source_pdf text NOT NULL,
    source_page integer,
    source_article character varying(100),
    method character varying(20),
    confidence character varying(10),
    raw jsonb,
    created_at timestamp without time zone DEFAULT now(),
    zone_norm character varying,
    zone_class character varying,
    zone_detail character varying,
    road_side character varying,
    road_name character varying,
    label_quality character varying,
    label_note text
);
CREATE SEQUENCE IF NOT EXISTS public.district_far_regulation_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.district_far_regulation_id_seq OWNED BY public.district_far_regulation.id;
ALTER TABLE public.district_far_regulation ALTER COLUMN id SET DEFAULT nextval('public.district_far_regulation_id_seq'::regclass);
ALTER TABLE public.district_far_regulation DROP CONSTRAINT IF EXISTS district_far_regulation_pkey;
ALTER TABLE public.district_far_regulation ADD CONSTRAINT district_far_regulation_pkey PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS public.district_file_list (
    id integer NOT NULL,
    district_id integer,
    singu_cd character varying(10),
    present_sn character varying(40),
    present_date date,
    notice_no character varying(40),
    title text,
    group_code character varying(10),
    file_name text,
    file_url text,
    file_seq bigint,
    is_earliest boolean DEFAULT false,
    has_far boolean,
    has_height boolean,
    has_bcr boolean,
    used_far boolean,
    used_height boolean,
    used_bcr boolean,
    used_declared boolean
);
CREATE SEQUENCE IF NOT EXISTS public.district_file_list_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.district_file_list_id_seq OWNED BY public.district_file_list.id;
ALTER TABLE public.district_file_list ALTER COLUMN id SET DEFAULT nextval('public.district_file_list_id_seq'::regclass);
ALTER TABLE public.district_file_list DROP CONSTRAINT IF EXISTS district_file_list_pkey;
ALTER TABLE public.district_file_list ADD CONSTRAINT district_file_list_pkey PRIMARY KEY (id);

-- 2) 인덱스 -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dfr_district ON public.district_far_regulation USING btree (district_id);
CREATE INDEX IF NOT EXISTS idx_dfr_singu ON public.district_far_regulation USING btree (singu_cd);
CREATE INDEX IF NOT EXISTS idx_dfr_zone ON public.district_far_regulation USING btree (zone_type);
CREATE INDEX IF NOT EXISTS idx_far_dgm_nm ON public.district_far_regulation USING btree (dgm_nm);
CREATE INDEX IF NOT EXISTS idx_far_zone_class ON public.district_far_regulation USING btree (zone_class);
CREATE INDEX IF NOT EXISTS idx_far_zone_detail ON public.district_far_regulation USING btree (zone_detail);
CREATE INDEX IF NOT EXISTS idx_dfl_district ON public.district_file_list USING btree (district_id);
CREATE INDEX IF NOT EXISTS idx_dfl_group ON public.district_file_list USING btree (group_code);
CREATE INDEX IF NOT EXISTS idx_dfl_sn ON public.district_file_list USING btree (present_sn);

-- 3) 서빙 뷰 (의존 순서) ----------------------------------------------------
DROP VIEW IF EXISTS public.v_far_serving_full;
DROP VIEW IF EXISTS public.v_district_sources;
DROP VIEW IF EXISTS public.v_district_rep_source;
DROP VIEW IF EXISTS public.v_district_far_link;
DROP VIEW IF EXISTS public.v_far_serving;

CREATE VIEW public.v_far_serving AS
 SELECT id, dgm_nm, singu_cd, zone_type AS zone_raw, zone_norm, zone_class, zone_detail,
        road_side, road_name, label_quality, label_note, change_type,
        far_standard, far_allowed, far_upper,
        far_standard_text, far_allowed_text, far_upper_text,
        bcr, bcr_text, height_m, floors, source_article, method, confidence, source_pdf
   FROM public.district_far_regulation;

CREATE VIEW public.v_district_far_link AS
 WITH b AS (
         SELECT DISTINCT ON (district_file_list.district_id) district_file_list.district_id,
            district_file_list.notice_no AS bn,
            district_file_list.present_date AS bd,
            district_file_list.file_name AS bfn,
            district_file_list.file_url AS bfu
           FROM public.district_file_list
          WHERE (((district_file_list.group_code)::text = 'DFL01'::text) AND district_file_list.is_earliest)
          ORDER BY district_file_list.district_id, district_file_list.present_date
        ), l AS (
         SELECT DISTINCT ON (district_file_list.district_id) district_file_list.district_id,
            district_file_list.notice_no AS ln,
            district_file_list.present_date AS ld,
            district_file_list.file_name AS lfn,
            district_file_list.file_url AS lfu
           FROM public.district_file_list
          WHERE ((district_file_list.group_code)::text = 'DFL01'::text)
          ORDER BY district_file_list.district_id, district_file_list.present_date DESC
        )
 SELECT u.id AS district_id, u.dgm_nm, u.singu_cd,
    u.notice_no AS unit_notice_no, u.notice_date AS unit_notice_date,
    b.bn AS base_notice_no, b.bd AS base_notice_date, b.bfn AS base_notice_name, b.bfu AS base_notice_url,
    l.ln AS latest_notice_no, l.ld AS latest_notice_date, l.lfn AS latest_notice_name, l.lfu AS latest_notice_url,
    ( SELECT count(*) FROM public.district_file_list f WHERE ((f.district_id = u.id) AND f.used_far)) AS n_used_far,
    ( SELECT count(*) FROM public.district_file_list f WHERE ((f.district_id = u.id) AND f.has_far AND ((f.group_code)::text = 'DFL02'::text))) AS n_farmap,
    ( SELECT count(*) FROM public.district_file_list f WHERE ((f.district_id = u.id) AND f.has_height)) AS n_height,
    ( SELECT count(*) FROM public.district_file_list f WHERE ((f.district_id = u.id) AND f.has_bcr)) AS n_bcr,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('name', f.file_name, 'url', f.file_url, 'used_far', COALESCE(f.used_far, false)) ORDER BY f.present_date DESC) FILTER (WHERE (f.has_far AND ((f.group_code)::text = 'DFL02'::text))), '[]'::jsonb)
           FROM public.district_file_list f WHERE (f.district_id = u.id)) AS far_maps,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('name', f.file_name, 'url', f.file_url, 'used_far', COALESCE(f.used_far, false)) ORDER BY f.present_date DESC) FILTER (WHERE f.used_far), '[]'::jsonb)
           FROM public.district_file_list f WHERE (f.district_id = u.id)) AS used_files
   FROM ((public.district_unit_plan u
     LEFT JOIN b ON ((b.district_id = u.id)))
     LEFT JOIN l ON ((l.district_id = u.id)));

CREATE VIEW public.v_district_rep_source AS
 WITH cand AS (
         SELECT d.district_id, u.dgm_nm, d.singu_cd, d.file_name, d.file_url, d.present_date, d.notice_no, d.group_code,
            COALESCE(d.used_far, false) AS used_far, COALESCE(d.has_far, false) AS has_far,
                CASE d.group_code
                    WHEN 'DFL02'::text THEN 0 WHEN 'DFL05'::text THEN 1 WHEN 'DFL04'::text THEN 2
                    WHEN 'DFL03'::text THEN 3 WHEN 'DFL06'::text THEN 4 WHEN 'DFL01'::text THEN 5 ELSE 6 END AS gpri,
                CASE
                    WHEN (d.file_name ~ '용적률'::text) THEN 0 WHEN (d.file_name ~ '건축물'::text) THEN 1
                    WHEN (d.file_name ~ '획지'::text) THEN 2 WHEN (d.file_name ~ '건폐율|높이'::text) THEN 3 ELSE 4 END AS kw,
            row_number() OVER (PARTITION BY d.district_id ORDER BY
                CASE d.group_code
                    WHEN 'DFL02'::text THEN 0 WHEN 'DFL05'::text THEN 1 WHEN 'DFL04'::text THEN 2
                    WHEN 'DFL03'::text THEN 3 WHEN 'DFL06'::text THEN 4 WHEN 'DFL01'::text THEN 5 ELSE 6 END,
                COALESCE(d.used_far, false) DESC,
                CASE
                    WHEN (d.file_name ~ '용적률'::text) THEN 0 WHEN (d.file_name ~ '건축물'::text) THEN 1
                    WHEN (d.file_name ~ '획지'::text) THEN 2 WHEN (d.file_name ~ '건폐율|높이'::text) THEN 3 ELSE 4 END,
                d.present_date, d.file_seq) AS rn
           FROM (public.district_file_list d
             JOIN public.district_unit_plan u ON ((u.id = d.district_id)))
          WHERE (d.has_far OR COALESCE(d.used_far, false))
        )
 SELECT district_id, dgm_nm, singu_cd, file_name AS rep_name, file_url AS rep_url,
    present_date AS rep_date, notice_no AS rep_notice, group_code AS rep_group,
    used_far AS rep_used, has_far AS rep_has_far,
        CASE group_code
            WHEN 'DFL02'::text THEN 'map'::text WHEN 'DFL05'::text THEN 'guideline_public'::text
            WHEN 'DFL04'::text THEN 'guideline_private'::text WHEN 'DFL03'::text THEN 'decision_doc'::text
            WHEN 'DFL06'::text THEN 'plan_desc'::text WHEN 'DFL01'::text THEN 'notice'::text ELSE 'other'::text END AS rep_kind
   FROM cand WHERE (rn = 1);

CREATE VIEW public.v_district_sources AS
 SELECT l.district_id, l.dgm_nm, l.singu_cd,
    l.base_notice_no, l.base_notice_date, l.base_notice_name, l.base_notice_url,
    l.latest_notice_no, l.latest_notice_date,
    r.rep_kind, r.rep_group, r.rep_name, r.rep_url, r.rep_date, r.rep_used,
    ( SELECT jsonb_agg(jsonb_build_object('name', f.file_name, 'url', f.file_url, 'grp', f.group_code) ORDER BY f.present_date DESC)
           FROM public.district_file_list f
          WHERE ((f.district_id = l.district_id) AND ((f.group_code)::text = ANY ((ARRAY['DFL04'::character varying, 'DFL05'::character varying])::text[])))) AS guidelines
   FROM (public.v_district_far_link l
     LEFT JOIN public.v_district_rep_source r ON ((r.district_id = l.district_id)));

CREATE VIEW public.v_far_serving_full AS
 SELECT fs.id, fs.dgm_nm, fs.singu_cd, fs.zone_raw, fs.zone_class, fs.zone_detail,
    fs.road_side, fs.label_quality, fs.change_type,
    fs.far_standard, fs.far_allowed, fs.far_upper, fs.bcr, fs.height_m, fs.floors,
    fs.source_article, fs.method, fs.confidence,
    lnk.base_notice_no, lnk.base_notice_date, lnk.base_notice_name, lnk.base_notice_url,
    sf.file_name AS source_file_name, sf.file_url AS source_file_url, sf.group_code AS source_group
   FROM ((public.v_far_serving fs
     LEFT JOIN public.v_district_far_link lnk ON (((lnk.dgm_nm)::text = (fs.dgm_nm)::text)))
     LEFT JOIN LATERAL ( SELECT d.file_name, d.file_url, d.group_code
           FROM public.district_file_list d
          WHERE (regexp_replace(fs.source_pdf, '^.*[\\/]'::text, ''::text) = d.file_name)
          ORDER BY (d.used_far IS TRUE) DESC NULLS LAST
         LIMIT 1) sf ON (true));

COMMIT;
