-- database/init/02-public-data.sql
-- 공공데이터 기초 참조 테이블 정의 (법정동코드 등)

-- 1. 법정동코드 매핑 테이블 (legal_dong_codes)
-- 건축물대장의 시군구코드+법정동코드명(텍스트)을 실제 10자리 법정동코드(code)로 매핑하기 위해 사용됩니다.
CREATE TABLE IF NOT EXISTS legal_dong_codes (
    code VARCHAR(10) PRIMARY KEY,      -- 10자리 법정동/행정동 코드
    name VARCHAR(255) NOT NULL,        -- '서울특별시 종로구 청운동' 형태의 전체 명칭
    is_active BOOLEAN DEFAULT true,    -- 폐지 여부 (존재 시 true)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 법정동명 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_legal_dong_codes_name ON legal_dong_codes(name);

COMMENT ON TABLE legal_dong_codes IS '법정동코드 및 명칭 매핑 테이블';
COMMENT ON COLUMN legal_dong_codes.code IS '10자리 법정동코드';
COMMENT ON COLUMN legal_dong_codes.name IS '텍스트 형태의 시군구/법정동 전체 명칭';
