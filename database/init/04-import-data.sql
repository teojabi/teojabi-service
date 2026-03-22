-- database/init/04-import-data.sql
-- 기초 참조 데이터(법정동코드 등) 임포트 스크립트
-- psql 클라이언트에서 실행: psql -h [host] -d [db] -f 04-import-data.sql
-- 실제 CSV 로드는 psql의 \copy 명령어를 사용합니다.

-- 1. 법정동코드 스테이징 테이블 (CSV 임시 적재용)
DROP TABLE IF EXISTS staging_legal_dong_codes;
CREATE UNLOGGED TABLE staging_legal_dong_codes (
    "법정동코드" TEXT,
    "법정동명" TEXT,
    "폐지여부" TEXT
);

-- 2. 고속 벌크 로드 (psql 전용 명령어이므로 주석 처리됨. 실제로는 셸 백그라운드나 서버에서 실행)
-- \copy staging_legal_dong_codes FROM 'database/법정동코드 조회자료.csv' WITH (FORMAT CSV, HEADER, ENCODING 'EUC-KR', QUOTE '"', NULL '');
-- (인코딩이 UTF8인 경우 ENCODING 'UTF8' 로 변경)

-- 3. 운영 테이블로 데이터 이관 (폐지된 동 코드를 제외하지 않고 모두 유지하거나 '존재'만 유지할지 결정)
-- 변환 로직: "법정동코드" -> code, "법정동명" -> name, "폐지여부" -> is_active(존재 시 true)
INSERT INTO legal_dong_codes (code, name, is_active)
SELECT 
    TRIM("법정동코드") AS code,
    TRIM("법정동명") AS name,
    CASE WHEN TRIM("폐지여부") = '존재' THEN true ELSE false END AS is_active
FROM staging_legal_dong_codes
WHERE "법정동코드" IS NOT NULL AND TRIM("법정동코드") <> ''
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

-- 4. 스테이징 정리
DROP TABLE IF EXISTS staging_legal_dong_codes;
ANALYZE legal_dong_codes;
