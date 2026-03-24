-- database/init/04-import-from-staging-tables.sql
-- 고속 벌크 임포트 데이터 이관 및 후처리 스크립트
-- 스테이징 테이블에 \copy 로 적재된 CSV 데이터를 실제 운영 테이블로 정제하여 이관합니다.

-- 1. 대용량 작업용 타임아웃 방지
SET statement_timeout = 0;

-- 2. 법정동코드 데이터 이관
-- 변환 로직: "법정동코드" -> code, "법정동명" -> name
-- 법정동 코드는 데이터양이 적기 때문에 스테이징 없이 바로 저장 가능
/*INSERT INTO legal_dong_codes (code, name)
SELECT
    TRIM("법정동코드") AS code,
    TRIM("법정동명") AS name
FROM staging_legal_dong_codes
WHERE "법정동코드" IS NOT NULL AND TRIM("법정동코드") <> ''
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name;*/

-- 3. 조인 성능 최적화를 위한 스테이징 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_staging_building_info_plat ON staging_building_info("시군구코드명", "법정동코드명");
CREATE INDEX IF NOT EXISTS idx_staging_floor_status_plat ON staging_floor_status("시군구코드명", "법정동코드명");

-- 4. building_info 이관
-- legal_dong_codes 매핑으로 19자리 PNU 생성. 
-- "산"이면 2, 일반이면 1 + 주지번 4자리 + 부지번 4자리
INSERT INTO building_info (pnu, bld_nm, plat_area, arch_area, bc_rat, vl_rat, tot_area,
                           grnd_flr_cnt, ugnd_flr_cnt, strct_cd_nm, main_purps_cd_nm, use_apr_day)
SELECT DISTINCT ON (pnu) (m.code ||
                          CASE WHEN b."대지구분코드명" = '산' THEN '2' ELSE '1' END ||
                          LPAD(TRIM(b."주지번"::text), 4, '0') ||
                          LPAD(TRIM(b."부지번"::text), 4, '0'))       AS pnu,
                         b."동명"                                    AS bld_nm,
                         NULLIF(TRIM(b."대지면적"), '')::NUMERIC       AS plat_area,
                         NULLIF(TRIM(b."건축면적"::text), '')::NUMERIC AS arch_area,
                         CASE
                             WHEN NULLIF(TRIM(b."건폐율"), '') IS NULL THEN NULL
                             WHEN ABS(NULLIF(REPLACE(TRIM(b."건폐율"), ',', ''), '')::NUMERIC) < 1000
                                 THEN NULLIF(REPLACE(TRIM(b."건폐율"), ',', ''), '')::NUMERIC(5, 2)
                             ELSE NULL END                         AS bc_rat,
                         CASE
                             WHEN NULLIF(TRIM(b."용적률"), '') IS NULL THEN NULL
                             WHEN ABS(NULLIF(REPLACE(TRIM(b."용적률"), ',', ''), '')::NUMERIC) < 100000
                                 THEN NULLIF(REPLACE(TRIM(b."용적률"), ',', ''), '')::NUMERIC(7, 2)
                             ELSE NULL END                         AS vl_rat,
                         NULLIF(TRIM(b."연면적"::text), '')::NUMERIC  AS tot_area,
                         NULLIF(TRIM(b."지상층수"), '')::INTEGER       AS grnd_flr_cnt,
                         NULLIF(TRIM(b."지하층수"), '')::INTEGER       AS ugnd_flr_cnt,
                         b."구조코드명"                                 AS strct_cd_nm,
                         b."주용도코드명"                                AS main_purps_cd_nm,
                         CASE
                             WHEN TRIM(b."사용승인일자") ~ '^\d{8}$'
                                 THEN TO_DATE(TRIM(b."사용승인일자"), 'YYYYMMDD')
                             ELSE NULL END                         AS use_apr_day
FROM staging_building_info b
         JOIN legal_dong_codes m ON (TRIM(b."시군구코드명") || ' ' || TRIM(b."법정동코드명")) = m.name
ON CONFLICT (pnu) DO UPDATE SET bld_nm      = COALESCE(building_info.bld_nm, EXCLUDED.bld_nm),
                                tot_area    = COALESCE(EXCLUDED.tot_area, building_info.tot_area),
                                use_apr_day = COALESCE(EXCLUDED.use_apr_day, building_info.use_apr_day);;

-- 5. floor_status 이관
-- 먼저 대상 PNU를 임시로 계산해두고, 그 대상만 삭제/삽입합니다.
CREATE TEMP TABLE tmp_floor_target_pnu AS
SELECT DISTINCT
    (m.code ||
     CASE WHEN f."대지구분코드명" = '산' THEN '2' ELSE '1' END ||
     LPAD(TRIM(f."주지번"), 4, '0') ||
     LPAD(TRIM(f."부지번"), 4, '0')) AS pnu
FROM staging_floor_status f
JOIN legal_dong_codes m
  ON (TRIM(f."시군구코드명") || ' ' || TRIM(f."법정동코드명")) = m.name;

DELETE FROM floor_status
WHERE pnu IN (SELECT pnu FROM tmp_floor_target_pnu);

INSERT INTO floor_status (pnu, flr_no, flr_no_nm, flr_area, flr_main_purps, strct_cd_nm)
SELECT
    (m.code ||
     CASE WHEN f."대지구분코드명" = '산' THEN '2' ELSE '1' END ||
     LPAD(TRIM(f."주지번"), 4, '0') ||
     LPAD(TRIM(f."부지번"), 4, '0')) AS pnu,
    NULLIF(TRIM(f."층번호"), '')::INTEGER,
    f."층번호명",
    NULLIF(TRIM(f."면적"), '')::NUMERIC,
    f."주용도코드명",
    f."구조코드명"
FROM staging_floor_status f
JOIN legal_dong_codes m
  ON (TRIM(f."시군구코드명") || ' ' || TRIM(f."법정동코드명")) = m.name
JOIN building_info bi
  ON bi.pnu = (m.code ||
               CASE WHEN f."대지구분코드명" = '산' THEN '2' ELSE '1' END ||
               LPAD(TRIM(f."주지번"), 4, '0') ||
               LPAD(TRIM(f."부지번"), 4, '0'));

DROP TABLE tmp_floor_target_pnu;

-- 6. store_info 이관
INSERT INTO store_info (
    store_id, pnu, store_nm, cate_large_nm, cate_mid_nm, flr_no, ho_no
)
SELECT 
    TRIM("상가업소번호"), 
    SUBSTR(TRIM("지번코드"), 1, 19), 
    TRIM("상호명") || NULLIF(' '||TRIM("지점명"),''),
    TRIM("상권업종대분류명"), 
    TRIM("상권업종중분류명"), 
    TRIM("층정보"),
    TRIM("호정보") 
FROM staging_store_info s
WHERE TRIM("상가업소번호") <> ''
  AND EXISTS (SELECT 1 FROM building_info bi WHERE bi.pnu = SUBSTR(TRIM(s."지번코드"), 1, 19))
ON CONFLICT (store_id) DO UPDATE SET
    store_nm = EXCLUDED.store_nm, pnu = EXCLUDED.pnu;

-- 7. 스테이징 데이터 비우기 (디스크 공간 확보)
-- TRUNCATE TABLE staging_legal_dong_codes;  -- 법정동코드는 스테이징 할 필요가 없음
TRUNCATE TABLE staging_building_info;
TRUNCATE TABLE staging_floor_status;
TRUNCATE TABLE staging_store_info;

-- 8. 옵티마이저 통계 정보 업데이트 고도화
ANALYZE legal_dong_codes;
ANALYZE building_info;
ANALYZE floor_status;
ANALYZE store_info;
