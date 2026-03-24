-- database/init/02-public-data.sql
-- 공공데이터 기초 참조 테이블 정의 (법정동코드 등)

-- 1. 법정동코드 매핑 테이블 (legal_dong_codes)
-- 건축물대장의 시군구코드+법정동코드명(텍스트)을 실제 10자리 법정동코드(code)로 매핑하기 위해 사용됩니다.
CREATE TABLE IF NOT EXISTS legal_dong_codes (
    code VARCHAR(10) PRIMARY KEY,      -- 10자리 법정동/행정동 코드
    name VARCHAR(255) NOT NULL        -- '서울특별시 종로구 청운동' 형태의 전체 명칭
);

-- 법정동명 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_legal_dong_codes_name ON legal_dong_codes(name);

COMMENT ON TABLE legal_dong_codes IS '법정동코드 및 명칭 매핑 테이블';
COMMENT ON COLUMN legal_dong_codes.code IS '10자리 법정동코드';
COMMENT ON COLUMN legal_dong_codes.name IS '텍스트 형태의 시군구/법정동 전체 명칭';

-- database/init/03-building-data.sql
-- 서울시 건축물대장 및 공공데이터 테이블 정의 (설계 문서 및 Prisma 동기화)

-- 1. 건축물 기본 정보 (building_info)
CREATE TABLE IF NOT EXISTS building_info (
    id SERIAL PRIMARY KEY,
    pnu CHAR(19) UNIQUE NOT NULL,             -- 필지고유번호 (PK 대신 Unique + Serial PK 사용)
    bld_nm VARCHAR(255),                      -- 건물 명칭
    plat_area NUMERIC(15, 2),                 -- 대지면적(m2)
    arch_area NUMERIC(15, 2),                 -- 건축면적(m2)
    bc_rat NUMERIC(5, 2),                     -- 건폐율(%)
    vl_rat NUMERIC(7, 2),                     -- 용적률(%)
    tot_area NUMERIC(15, 2),                  -- 연면적(m2)
    grnd_flr_cnt INTEGER,                     -- 지상 층수
    ugnd_flr_cnt INTEGER,                     -- 지하 층수
    strct_cd_nm VARCHAR(100),                 -- 구조 명칭
    main_purps_cd_nm VARCHAR(100),            -- 주용도 명칭
    use_apr_day DATE,                         -- 사용승인일
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE building_info IS '서울시 건축물대장 표제부 정보';

-- 2. 토지 및 공시지가 정보 (land_info)
CREATE TABLE IF NOT EXISTS land_info (
    pnu CHAR(19) PRIMARY KEY REFERENCES building_info(pnu) ON DELETE CASCADE,
    jimok_nm VARCHAR(50),                     -- 지목
    lad_area NUMERIC(15, 2),                  -- 토지 면적(m2)
    prpos_area_nm VARCHAR(100),               -- 용도지역
    pblntf_pclnd BIGINT,                      -- 공시지가(원/m2)
    last_updated DATE                         -- 공시지가 기준일자
);

COMMENT ON TABLE land_info IS '토지 및 공시지가 정보';

-- 3. 건물 층별 현황 (floor_status)
CREATE TABLE IF NOT EXISTS floor_status (
    id SERIAL PRIMARY KEY,
    pnu CHAR(19) NOT NULL REFERENCES building_info(pnu) ON DELETE CASCADE,
    flr_no INTEGER,                           -- 층 번호
    flr_no_nm VARCHAR(50),                    -- 층 번호 명칭
    flr_area NUMERIC(15, 2),                  -- 해당 층 면적(m2)
    flr_main_purps VARCHAR(100),              -- 해당 층 주용도
    strct_cd_nm VARCHAR(100)                  -- 해당 층 구조
);

COMMENT ON TABLE floor_status IS '서울시 건축물대장 층별 현황 정보';

-- 4. 상가 및 업소 정보 (store_info)
CREATE TABLE IF NOT EXISTS store_info (
    store_id VARCHAR(50) PRIMARY KEY,         -- 상가업소번호
    pnu CHAR(19) NOT NULL REFERENCES building_info(pnu) ON DELETE CASCADE,
    store_nm VARCHAR(255) NOT NULL,           -- 상호명
    cate_large_nm VARCHAR(100),               -- 업종 대분류
    cate_mid_nm VARCHAR(100),                 -- 업종 중분류
    flr_no VARCHAR(20),                       -- 입점 층
    ho_no VARCHAR(20),                        -- 입점 호수
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE store_info IS '건물 내 입점 상가 및 업소 정보';

-- 빠른 조회를 위한 PNU(필지고유번호) 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_floor_status_pnu ON floor_status(pnu);
CREATE INDEX IF NOT EXISTS idx_store_info_pnu ON store_info(pnu);
