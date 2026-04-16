-- 01-schema.sql
-- 터잡이 서비스 핵심 도메인 스키마 (Prisma 스키마 동기화)

-- 1. PostGIS 확장 활성화 (지도 좌표 및 공간 검색용)
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;

-- 2. ENUM 타입 정의
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
        CREATE TYPE "Role" AS ENUM ('USER', 'PREMIUM_BASIC', 'PREMIUM_PLUS', 'ADMIN');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResStatus') THEN
        CREATE TYPE "ResStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
    END IF;
END $$;

-- 3. 사용자(user) 테이블
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE,
    name TEXT,
    image TEXT,
    role "Role" NOT NULL DEFAULT 'USER',
    provider TEXT,
    provider_id TEXT,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
);

COMMENT ON TABLE "user" IS '서비스 사용자 정보';
COMMENT ON COLUMN "user".id IS '사용자 고유 식별자 (UUID)';
COMMENT ON COLUMN "user".email IS '이메일 주소';
COMMENT ON COLUMN "user".name IS '사용자 이름';
COMMENT ON COLUMN "user".image IS '프로필 이미지 URL';
COMMENT ON COLUMN "user".role IS '사용자 권한 (USER, PREMIUM_BASIC, PREMIUM_PLUS, ADMIN)';
COMMENT ON COLUMN "user".provider IS '소셜 로그인 제공자 (naver, kakao, google)';
COMMENT ON COLUMN "user".provider_id IS '소셜 로그인 제공자의 사용자 고유 ID';
COMMENT ON COLUMN "user".created_at IS '계정 생성일시';
COMMENT ON COLUMN "user".updated_at IS '계정 정보 수정일시';

-- 4. 매물/부동산(property) 테이블
CREATE TABLE IF NOT EXISTS property (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT UNIQUE NOT NULL,
    pnu CHAR(19),
    before_image TEXT,
    after_image TEXT,
    price DECIMAL(15, 2),
    location geometry(Point, 4326),
    owner_id TEXT REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE property IS '매물/부동산 정보';
COMMENT ON COLUMN property.id IS '매물 고유 식별자 (UUID)';
COMMENT ON COLUMN property.title IS '매물 제목';
COMMENT ON COLUMN property.description IS '매물 상세 설명';
COMMENT ON COLUMN property.address IS '매물 주소 (고유)';
COMMENT ON COLUMN property.pnu IS '필지고유번호 (19자리 PNU 코드)';
COMMENT ON COLUMN property.before_image IS '리모델링 전 이미지 URL';
COMMENT ON COLUMN property.after_image IS '리모델링 후 이미지 URL';
COMMENT ON COLUMN property.price IS '매물 가격';
COMMENT ON COLUMN property.location IS '매물 위치 좌표 (PostGIS Point, SRID 4326)';
COMMENT ON COLUMN property.owner_id IS '매물 등록자 (user.id FK)';
COMMENT ON COLUMN property.created_at IS '매물 등록일시';
COMMENT ON COLUMN property.updated_at IS '매물 정보 수정일시';

-- property.location 컬럼 공간 인덱스 생성
CREATE INDEX IF NOT EXISTS property_location_idx ON property USING GIST (location);

-- 5. 상담 예약(reservation) 테이블
CREATE TABLE IF NOT EXISTS reservation (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    status "ResStatus" NOT NULL DEFAULT 'PENDING',
    message TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    property_id TEXT NOT NULL REFERENCES property(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE reservation IS '상담 예약 정보';
COMMENT ON COLUMN reservation.id IS '예약 고유 식별자 (UUID)';
COMMENT ON COLUMN reservation.date IS '상담 예약 일시';
COMMENT ON COLUMN reservation.status IS '예약 상태 (PENDING, CONFIRMED, CANCELLED, COMPLETED)';
COMMENT ON COLUMN reservation.message IS '예약 시 남긴 메시지';
COMMENT ON COLUMN reservation.user_id IS '예약자 (user.id FK)';
COMMENT ON COLUMN reservation.property_id IS '예약 대상 매물 (property.id FK)';
COMMENT ON COLUMN reservation.created_at IS '예약 생성일시';
COMMENT ON COLUMN reservation.updated_at IS '예약 정보 수정일시';

-- 6. 관심 매물(favorite) 테이블
CREATE TABLE IF NOT EXISTS favorite (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    property_id TEXT NOT NULL REFERENCES property(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, property_id)
);

COMMENT ON TABLE favorite IS '사용자 관심 매물 목록';
COMMENT ON COLUMN favorite.id IS '관심 매물 고유 식별자 (UUID)';
COMMENT ON COLUMN favorite.user_id IS '사용자 (user.id FK)';
COMMENT ON COLUMN favorite.property_id IS '관심 매물 (property.id FK)';
COMMENT ON COLUMN favorite.created_at IS '관심 매물 등록일시';

-- 7. 서비스 설정(setting) 테이블
CREATE TABLE IF NOT EXISTS setting (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE setting IS '서비스 설정 정보 (Key-Value 스토어)';
COMMENT ON COLUMN setting.id IS '설정 고유 식별자 (자동 증가)';
COMMENT ON COLUMN setting.key IS '설정 키 (Unique)';
COMMENT ON COLUMN setting.value IS '설정 값 (Text)';
COMMENT ON COLUMN setting.created_at IS '설정 생성일시';
COMMENT ON COLUMN setting.updated_at IS '설정 수정일시';

-- 8. Updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 적용
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_modtime') THEN
        CREATE TRIGGER update_user_modtime
        BEFORE UPDATE ON "user"
        FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_property_modtime') THEN
        CREATE TRIGGER update_property_modtime
        BEFORE UPDATE ON property
        FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_reservation_modtime') THEN
        CREATE TRIGGER update_reservation_modtime
        BEFORE UPDATE ON reservation
        FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_setting_modtime') THEN
        CREATE TRIGGER update_setting_modtime
        BEFORE UPDATE ON setting
        FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;
