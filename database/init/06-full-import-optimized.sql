-- database/init/06-full-import-optimized.sql
-- 고속 벌크 임포트 및 데이터 이관 스크립트 (한글 컬럼명 대응 및 성능 최적화 버전)

-- 타임아웃 방지 (무제한 또는 충분히 큰 값 설정)
SET statement_timeout = 0;

-- 1. 스테이징 테이블 생성 (CSV 헤더와 동일한 한글 컬럼명 사용)
DROP TABLE IF EXISTS staging_building_info;
CREATE UNLOGGED TABLE staging_building_info (
    "대지위치" TEXT, "시군구코드명" TEXT, "법정동코드명" TEXT, "대지구분코드명" TEXT, "주지번" TEXT, "부지번" TEXT, "특 수지명" TEXT, "블록번호" TEXT, "로트번호" TEXT,
    "새주소도로코드명" TEXT, "새주소법정동코드명" TEXT, "새주소지 상지하구분코드명" TEXT, "새주소주지번" TEXT, "새주소부지번" TEXT, "건축물대장일련번호" TEXT, "대장구분코드명" TEXT,
    "대장종류코드명" TEXT, "동명" TEXT, "주부속구분코드명" TEXT, "대지면적" TEXT, "건축면적" TEXT, "건폐율" TEXT, "연면적" TEXT, "용적률산정연면적" TEXT, "용적률" TEXT,
    "구조코드명" TEXT, "기타구조정보" TEXT, "주용도코드명" TEXT, "기타용도내용" TEXT, "지붕코드명" TEXT, "기타지붕명" TEXT, "세대수" TEXT, "가구수" TEXT,
    "호수" TEXT, "지상층수" TEXT, "지하층수" TEXT, "높이" TEXT, "승용승강기수" TEXT, "비상용승강기수" TEXT, "부속건축물수" TEXT, "부속건축물면적" TEXT,
    "총동연면적" TEXT, "옥내기계식대수" TEXT, "옥내기계식면적" TEXT, "옥외기계식대수" TEXT, "옥외기계식면적" TEXT, "옥내자주식대수" TEXT, "옥내자주식면적" TEXT,
    "옥외자주식대수" TEXT, "옥외자주식면적" TEXT, "허가일자" TEXT, "착공일자" TEXT, "사용승인일자" TEXT, "에너지효율등급값" TEXT, "에너지절감률" TEXT, "EPI점수" TEXT,
    "친환경건축물등급값" TEXT, "친환경건축물인증점수" TEXT, "지능형건축물등급값" TEXT, "지능형건축물인증점수" TEXT, "내진설계적용여부" TEXT, "내진능력내용" TEXT
);

DROP TABLE IF EXISTS staging_floor_status;
CREATE UNLOGGED TABLE staging_floor_status (
    "대지위치" TEXT, "시군구코드명" TEXT, "법정동코드명" TEXT, "대지구분코드명" TEXT, "주지번" TEXT, "부지번" TEXT, "특 수지명" TEXT, "블록번호" TEXT, "로트번호" TEXT,
    "새주소도로코드명" TEXT, "새주소법정동코드명" TEXT, "새주소지 상지하구분코드명" TEXT, "새주소주지번" TEXT, "새주소부지번" TEXT, "층별개요일련번호" TEXT, "건축물대장일련번호" TEXT,
    "층구분코드명" TEXT, "층번호" TEXT, "층번호명" TEXT, "구조코드명" TEXT, "기타구조정보" TEXT, "주용도코드명" TEXT, "기타용도내용" TEXT, "면적" TEXT,
    "주부속구분코드명" TEXT, "면적제외여부" TEXT
);

DROP TABLE IF EXISTS staging_store_info;
CREATE UNLOGGED TABLE staging_store_info (
    "상가업소번호" TEXT, "상호명" TEXT, "지점명" TEXT, "상권업종대분류코드" TEXT, "상권업종대분류명" TEXT, "상권업종중분류코드" TEXT, "상권업종중분류명" TEXT, 
    "상권업종소분류코드" TEXT, "상권업종소분류명" TEXT, "표준산업분류코드" TEXT, "표준산업분류명" TEXT, "시도코드" TEXT, "시도명" TEXT, 
    "시군구코드" TEXT, "시군구명" TEXT, "행정동코드" TEXT, "행정동명" TEXT, "법정동코드" TEXT, "법정동명" TEXT, 
    "지번코드" TEXT, "대지구분코드" TEXT, "대지구분명" TEXT, "지번본번지" TEXT, "지번부번지" TEXT, "지번주소" TEXT, 
    "도로명코드" TEXT, "도로명" TEXT, "건물본번지" TEXT, "건물부 번지" TEXT, "건물관리번호" TEXT, "건물명" TEXT, 
    "도로명주소" TEXT, "구우편번호" TEXT, "신우편번호" TEXT, "동정보" TEXT, "층정보" TEXT, "호정보" TEXT, 
    "경도" TEXT, "위도" TEXT
);

-- 인덱스 생성 (조인 성능 최적화)
-- 주의: CSV 데이터를 \copy로 로드한 후에 이 인덱스를 생성해야 함. 
CREATE INDEX IF NOT EXISTS idx_staging_building_info_plat ON staging_building_info("대지위치");
CREATE INDEX IF NOT EXISTS idx_staging_floor_status_plat ON staging_floor_status("대지위치");
CREATE INDEX IF NOT EXISTS idx_staging_store_info_addr ON staging_store_info("지번주소");

-- 2. 데이터 변환 및 운영 테이블 이관 로직

-- [1] building_info 이관 (법정동코드 매핑 테이블 사용)
-- legal_dong_codes 테이블을 사용하여 시군구/법정동명으로부터 10자리 법정동코드를 추출하고 PNU를 생성합니다.
INSERT INTO building_info (pnu, bld_nm, plat_area, arch_area, bc_rat, vl_rat, tot_area,
                           grnd_flr_cnt, ugnd_flr_cnt, strct_cd_nm, main_purps_cd_nm, use_apr_day)
SELECT DISTINCT ON (pnu) 
    pnu,
    bld_nm,
    plat_area,
    arch_area,
    bc_rat,
    vl_rat,
    tot_area,
    grnd_flr_cnt,
    ugnd_flr_cnt,
    strct_cd_nm,
    main_purps_cd_nm,
    use_apr_day
FROM (
    -- 1) 건축물대장 데이터를 기반으로 PNU 생성 및 이관
    SELECT 
        (m.code || 
         CASE WHEN b."대지구분코드명" = '산' THEN '2' ELSE '1' END || 
         LPAD(TRIM(b."주지번"), 4, '0') || 
         LPAD(TRIM(b."부지번"), 4, '0')) AS pnu,
        b."동명" AS bld_nm,
        NULLIF(TRIM(b."대지면적"::TEXT), '')::NUMERIC AS plat_area,
        NULLIF(TRIM(b."건축면적"::TEXT), '')::NUMERIC AS arch_area,
        CASE
            WHEN NULLIF(TRIM(b."건폐율"::TEXT), '') IS NULL THEN NULL
            WHEN ABS(NULLIF(REPLACE(TRIM(b."건폐율"::TEXT), ',', ''), '')::NUMERIC) < 1000
                THEN NULLIF(REPLACE(TRIM(b."건폐율"::TEXT), ',', ''), '')::NUMERIC(5, 2)
            ELSE NULL END AS bc_rat,
        CASE
            WHEN NULLIF(TRIM(b."용적률"::TEXT), '') IS NULL THEN NULL
            WHEN ABS(NULLIF(REPLACE(TRIM(b."용적률"::TEXT), ',', ''), '')::NUMERIC) < 100000
                THEN NULLIF(REPLACE(TRIM(b."용적률"::TEXT), ',', ''), '')::NUMERIC(7, 2)
            ELSE NULL END AS vl_rat,
        NULLIF(TRIM(b."연면적"::TEXT), '')::NUMERIC AS tot_area,
        NULLIF(TRIM(b."지상층수"::TEXT), '')::INTEGER AS grnd_flr_cnt,
        NULLIF(TRIM(b."지하층수"::TEXT), '')::INTEGER AS ugnd_flr_cnt,
        b."구조코드명" AS strct_cd_nm,
        b."주용도코드명" AS main_purps_cd_nm,
        CASE
            WHEN TRIM(b."사용승인일자"::TEXT) ~ '^\d{8}$'
                THEN TO_DATE(TRIM(b."사용승인일자"::TEXT), 'YYYYMMDD')
            ELSE NULL END AS use_apr_day
    FROM staging_building_info b
    JOIN legal_dong_codes m ON (b."시군구코드명" || ' ' || b."법정동코드명") = m.name
    WHERE b."시군구코드명" IS NOT NULL AND b."법정동코드명" IS NOT NULL

    UNION ALL

    -- 2) 상가정보에만 존재하는 데이터 처리 (지번코드를 PNU로 직접 사용)
    SELECT 
        SUBSTR(s."지번코드", 1, 19) AS pnu,
        s."건물명" AS bld_nm,
        NULL AS plat_area,
        NULL AS arch_area,
        NULL AS bc_rat,
        NULL AS vl_rat,
        NULL AS tot_area,
        NULL AS grnd_flr_cnt,
        NULL AS ugnd_flr_cnt,
        NULL AS strct_cd_nm,
        NULL AS main_purps_cd_nm,
        NULL AS use_apr_day
    FROM staging_store_info s
    WHERE s."지번코드" IS NOT NULL AND s."지번코드" <> ''
) all_pnu
ON CONFLICT (pnu) DO UPDATE SET 
    bld_nm = COALESCE(building_info.bld_nm, EXCLUDED.bld_nm),
    tot_area = COALESCE(EXCLUDED.tot_area, building_info.tot_area),
    use_apr_day = COALESCE(EXCLUDED.use_apr_day, building_info.use_apr_day);

-- [2] floor_status 이관
INSERT INTO floor_status (
    pnu, flr_no, flr_no_nm, flr_area, flr_main_purps, strct_cd_nm
)
SELECT 
    (m.code || 
     CASE WHEN f."대지구분코드명" = '산' THEN '2' ELSE '1' END || 
     LPAD(TRIM(f."주지번"), 4, '0') || 
     LPAD(TRIM(f."부지번"), 4, '0')),
    NULLIF(TRIM(f."층번호"::TEXT), '')::INTEGER, 
    f."층번호명", 
    NULLIF(TRIM(f."면적"::TEXT), '')::NUMERIC, 
    f."주용도코드명",
    f."구조코드명"
FROM staging_floor_status f
JOIN legal_dong_codes m ON (f."시군구코드명" || ' ' || f."법정동코드명") = m.name
WHERE EXISTS (
    SELECT 1 FROM building_info bi 
    WHERE bi.pnu = (m.code || 
                    CASE WHEN f."대지구분코드명" = '산' THEN '2' ELSE '1' END || 
                    LPAD(TRIM(f."주지번"), 4, '0') || 
                    LPAD(TRIM(f."부지번"), 4, '0'))
);

-- [3] store_info 이관
INSERT INTO store_info (
    store_id, pnu, store_nm, cate_large_nm, cate_mid_nm, flr_no, ho_no
)
SELECT 
    "상가업소번호", 
    SUBSTR("지번코드", 1, 19), 
    "상호명", 
    "상권업종대분류명", 
    "상권업종중분류명", 
    "층정보",
    "호정보" 
FROM staging_store_info s
WHERE "상가업소번호" IS NOT NULL AND "상가업소번호" <> ''
  AND EXISTS (SELECT 1 FROM building_info bi WHERE bi.pnu = SUBSTR(s."지번코드", 1, 19))
ON CONFLICT (store_id) DO UPDATE SET
    store_nm = EXCLUDED.store_nm, pnu = EXCLUDED.pnu;

-- 3. 스테이징 데이터 비우기 (테이블은 유지)
TRUNCATE TABLE staging_building_info;
TRUNCATE TABLE staging_floor_status;
TRUNCATE TABLE staging_store_info;

-- 4. 통계 정보 업데이트
ANALYZE building_info;
ANALYZE floor_status;
ANALYZE store_info;
