-- =============================================================================
-- database/init/02-public-data.sql
-- 공공데이터 테이블 정의 및 기초 데이터 삽입
-- =============================================================================
-- 실행 순서:
--   1. 법정동코드 매핑 테이블 (legal_dong_codes)
--   2. 건축물 기본 정보 (building_info)
--   3. 건물 층별 현황 (floor_status)
--   4. 상가 및 업소 정보 (store_info)
--   5. 용도지역별 건폐율·용적률 참조 테이블 (zoning_regulation) + 기초 데이터
--   6. 공시지가 (official_land_price)
--   7. 토지이용계획 정보 (land_use_info)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 법정동코드 매핑 테이블 (legal_dong_codes)
--    건축물대장의 시군구코드+법정동코드명(텍스트)을 실제 10자리 법정동코드로 매핑
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_dong_codes (
    code VARCHAR(10) PRIMARY KEY,      -- 10자리 법정동/행정동 코드
    name VARCHAR(255) NOT NULL         -- '서울특별시 종로구 청운동' 형태의 전체 명칭
);

CREATE INDEX IF NOT EXISTS idx_legal_dong_codes_name ON legal_dong_codes(name);

COMMENT ON TABLE legal_dong_codes IS '법정동코드 및 명칭 매핑 테이블';
COMMENT ON COLUMN legal_dong_codes.code IS '10자리 법정동코드';
COMMENT ON COLUMN legal_dong_codes.name IS '텍스트 형태의 시군구/법정동 전체 명칭';


-- -----------------------------------------------------------------------------
-- 2. 건축물 기본 정보 (building_info)
--    서울시 건축물대장 표제부 정보
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS building_info (
    id SERIAL PRIMARY KEY,
    pnu CHAR(19) UNIQUE NOT NULL,             -- 필지고유번호 (PK 대신 Unique + Serial PK 사용)
    bld_nm VARCHAR(255),                      -- 건물 명칭
    plat_area NUMERIC(15, 2),                 -- 대지면적(m²)
    arch_area NUMERIC(15, 2),                 -- 건축면적(m²)
    bc_rat NUMERIC(5, 2),                     -- 건폐율(%)
    vl_rat NUMERIC(7, 2),                     -- 용적률(%)
    tot_area NUMERIC(15, 2),                  -- 연면적(m²)
    grnd_flr_cnt INTEGER,                     -- 지상 층수
    ugnd_flr_cnt INTEGER,                     -- 지하 층수
    building_height NUMERIC(10, 2),           -- 건물 높이(m)
    strct_cd_nm VARCHAR(100),                 -- 구조 명칭
    main_purps_cd_nm VARCHAR(100),            -- 주용도 명칭
    use_apr_day TEXT,                         -- 사용승인일
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE building_info IS '서울시 건축물대장 표제부 정보';
COMMENT ON COLUMN building_info.id IS '건축물 정보 고유 식별자 (Serial PK)';
COMMENT ON COLUMN building_info.pnu IS '필지고유번호 (19자리, 고유)';
COMMENT ON COLUMN building_info.bld_nm IS '건물 명칭';
COMMENT ON COLUMN building_info.plat_area IS '대지면적 (m²)';
COMMENT ON COLUMN building_info.arch_area IS '건축면적 (m²)';
COMMENT ON COLUMN building_info.bc_rat IS '건폐율 (%)';
COMMENT ON COLUMN building_info.vl_rat IS '용적률 (%)';
COMMENT ON COLUMN building_info.tot_area IS '연면적 (m²)';
COMMENT ON COLUMN building_info.grnd_flr_cnt IS '지상 층수';
COMMENT ON COLUMN building_info.ugnd_flr_cnt IS '지하 층수';
COMMENT ON COLUMN building_info.building_height IS '건물 높이 (m)';
COMMENT ON COLUMN building_info.strct_cd_nm IS '구조 명칭';
COMMENT ON COLUMN building_info.main_purps_cd_nm IS '주용도 명칭';
COMMENT ON COLUMN building_info.use_apr_day IS '사용승인일(문자열)';
COMMENT ON COLUMN building_info.created_at IS '데이터 생성일시';


-- -----------------------------------------------------------------------------
-- 3. 건물 층별 현황 (floor_status)
--    서울시 건축물대장 층별 현황 정보
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS floor_status (
    id SERIAL PRIMARY KEY,
    pnu CHAR(19) NOT NULL,
    flr_no INTEGER,                           -- 층 번호
    flr_no_nm VARCHAR(50),                    -- 층 번호 명칭
    flr_sort_no INTEGER,                      -- 정렬 번호 (옥탑=3000+층, 지상=2000+층, 지하=1000-층)
    flr_area NUMERIC(15, 2),                  -- 해당 층 면적(m²)
    flr_main_purps VARCHAR(100),              -- 해당 층 주용도
    strct_cd_nm VARCHAR(100),                 -- 해당 층 구조
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_floor_status_pnu ON floor_status(pnu);

COMMENT ON TABLE floor_status IS '서울시 건축물대장 층별 현황 정보';
COMMENT ON COLUMN floor_status.id IS '층별 현황 고유 식별자 (Serial PK)';
COMMENT ON COLUMN floor_status.pnu IS '필지고유번호 (19자리)';
COMMENT ON COLUMN floor_status.flr_no IS '층 번호';
COMMENT ON COLUMN floor_status.flr_no_nm IS '층 번호 명칭';
COMMENT ON COLUMN floor_status.flr_sort_no IS '정렬 번호 (옥탑=3000번대, 지상=2000번대, 지하=1000-층번호)';
COMMENT ON COLUMN floor_status.flr_area IS '해당 층 면적 (m²)';
COMMENT ON COLUMN floor_status.flr_main_purps IS '해당 층 주용도';
COMMENT ON COLUMN floor_status.strct_cd_nm IS '해당 층 구조';
COMMENT ON COLUMN floor_status.created_at IS '데이터 생성일시';


-- -----------------------------------------------------------------------------
-- 4. 상가 및 업소 정보 (store_info)
--    건물 내 입점 상가 및 업소 정보
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_info (
    store_id VARCHAR(50) PRIMARY KEY,         -- 상가업소번호
    pnu CHAR(19) NOT NULL,
    store_nm VARCHAR(255) NOT NULL,           -- 상호명
    cate_large_nm VARCHAR(100),               -- 업종 대분류
    cate_mid_nm VARCHAR(100),                 -- 업종 중분류
    flr_no VARCHAR(20),                       -- 입점 층
    ho_no VARCHAR(20),                        -- 입점 호수
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_info_pnu ON store_info(pnu);

COMMENT ON TABLE store_info IS '건물 내 입점 상가 및 업소 정보';
COMMENT ON COLUMN store_info.store_id IS '상가업소번호 (PK)';
COMMENT ON COLUMN store_info.pnu IS '필지고유번호 (19자리)';
COMMENT ON COLUMN store_info.store_nm IS '상호명';
COMMENT ON COLUMN store_info.cate_large_nm IS '업종 대분류';
COMMENT ON COLUMN store_info.cate_mid_nm IS '업종 중분류';
COMMENT ON COLUMN store_info.flr_no IS '입점 층';
COMMENT ON COLUMN store_info.ho_no IS '입점 호수';
COMMENT ON COLUMN store_info.created_at IS '데이터 생성일시';


-- -----------------------------------------------------------------------------
-- 5. 용도지역별 건폐율·용적률 참조 테이블 (zoning_regulation)
--    국토의 계획 및 이용에 관한 법률 제44조(건폐율), 제48조(용적률) 기준
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_regulation (
    id              SERIAL PRIMARY KEY,
    zone_name       TEXT NOT NULL UNIQUE,          -- 용도지역명
    bcr_limit       NUMERIC(5, 1) NOT NULL,        -- 건폐율 상한 (%)
    far_limit       NUMERIC(6, 1) NOT NULL,        -- 용적률 상한 (%)
    far_limit_note  TEXT                            -- 용적률 비고 (서울도심 등 예외)
);

COMMENT ON TABLE zoning_regulation IS '용도지역별 건폐율·용적률 법정 상한 참조 테이블 (제44조, 제48조)';
COMMENT ON COLUMN zoning_regulation.id IS '고유 식별자';
COMMENT ON COLUMN zoning_regulation.zone_name IS '용도지역명';
COMMENT ON COLUMN zoning_regulation.bcr_limit IS '건폐율 상한 (%, 제44조)';
COMMENT ON COLUMN zoning_regulation.far_limit IS '용적률 상한 (%, 제48조)';
COMMENT ON COLUMN zoning_regulation.far_limit_note IS '용적률 비고 (서울도심 예외 등)';

-- 용도지역별 건폐율·용적률 기초 데이터 삽입 (16개 용도지역)
INSERT INTO zoning_regulation (zone_name, bcr_limit, far_limit, far_limit_note) VALUES
    ('제1종전용주거지역', 50,   100,  NULL),
    ('제2종전용주거지역', 40,   120,  NULL),
    ('제1종일반주거지역', 60,   150,  NULL),
    ('제2종일반주거지역', 60,   200,  NULL),
    ('제3종일반주거지역', 50,   250,  NULL),
    ('준주거지역',       60,   400,  NULL),
    ('중심상업지역',     60,  1000,  '서울도심: 800%'),
    ('일반상업지역',     60,   800,  '서울도심: 600%'),
    ('근린상업지역',     60,   600,  '서울도심: 500%'),
    ('유통상업지역',     60,   600,  '서울도심: 500%'),
    ('전용공업지역',     60,   200,  NULL),
    ('일반공업지역',     60,   200,  NULL),
    ('준공업지역',       60,   400,  NULL),
    ('보전녹지지역',     20,    50,  NULL),
    ('생산녹지지역',     20,    50,  NULL),
    ('자연녹지지역',     20,    50,  NULL)
ON CONFLICT (zone_name) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 6. 공시지가 (official_land_price)
--    매년 1월 1일 기준 공시지가 정보
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_land_price (
    id              SERIAL PRIMARY KEY,
    pnu             VARCHAR(19) NOT NULL,
    ref_year        INTEGER NOT NULL,
    price_per_sqm   BIGINT NOT NULL,
    UNIQUE (pnu, ref_year)
);

CREATE INDEX IF NOT EXISTS idx_official_land_price_pnu ON official_land_price(pnu);

COMMENT ON TABLE official_land_price IS '공시지가 (매년 1월 1일 기준 공시지가)';
COMMENT ON COLUMN official_land_price.id IS '고유 식별자';
COMMENT ON COLUMN official_land_price.pnu IS '필지고유번호 (19자리, 토지코드)';
COMMENT ON COLUMN official_land_price.ref_year IS '기준년도';
COMMENT ON COLUMN official_land_price.price_per_sqm IS '공시지가 (원/㎡)';


-- -----------------------------------------------------------------------------
-- 7. 토지이용계획 정보 (land_use_info)
--    용도지역지구 정보 (PNU당 복수 행 가능)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS land_use_info (
    id              SERIAL PRIMARY KEY,
    pnu             CHAR(19) NOT NULL,
    zone_cls_cd     VARCHAR(20),                  -- 용도지역지구코드
    zone_cls_nm     VARCHAR(100),                 -- 용도지역지구명
    note            TEXT,                         -- 비고내용
    created_at      TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_land_use_info_pnu ON land_use_info(pnu);
CREATE INDEX IF NOT EXISTS idx_land_use_info_pnu_zone ON land_use_info(pnu, zone_cls_cd);

COMMENT ON TABLE land_use_info IS '토지이용계획 정보 (용도지역지구)';
COMMENT ON COLUMN land_use_info.id IS '고유 식별자 (Serial PK)';
COMMENT ON COLUMN land_use_info.pnu IS '필지고유번호 (19자리)';
COMMENT ON COLUMN land_use_info.zone_cls_cd IS '용도지역지구코드';
COMMENT ON COLUMN land_use_info.zone_cls_nm IS '용도지역지구명';
COMMENT ON COLUMN land_use_info.note IS '비고내용';
COMMENT ON COLUMN land_use_info.created_at IS '데이터 생성일시';
