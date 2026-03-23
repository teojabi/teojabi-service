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

-- 4. 매물/부동산(property) 테이블
CREATE TABLE IF NOT EXISTS property (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT UNIQUE NOT NULL,
    before_image TEXT,
    after_image TEXT,
    price DECIMAL(15, 2),
    location geometry(Point, 4326),
    owner_id TEXT REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- 6. 관심 매물(favorite) 테이블
CREATE TABLE IF NOT EXISTS favorite (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    property_id TEXT NOT NULL REFERENCES property(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, property_id)
);

-- 7. Updated_at 자동 갱신 트리거 함수
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
END $$;
