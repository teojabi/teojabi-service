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
    phone TEXT,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
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
COMMENT ON COLUMN "user".phone IS '사용자 전화번호';
COMMENT ON COLUMN "user".phone_verified IS '전화번호 인증 여부';
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

-- 5. 프리미엄 상담 신청(reservation) 테이블
DROP TYPE IF EXISTS "ReservationType";
CREATE TYPE "ReservationType" AS ENUM ('GENERAL', 'PROPERTY', 'REPORT');

CREATE TABLE IF NOT EXISTS reservation (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type "ReservationType" NOT NULL DEFAULT 'GENERAL',
    date TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    status "ResStatus" NOT NULL DEFAULT 'PENDING',
    message TEXT,
    admin_feedback TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    property_id TEXT REFERENCES property(id) ON DELETE SET NULL ON UPDATE CASCADE,
    pnu CHAR(19), -- 특정 매물이 아닌 일반 필지에서 신청할 경우를 위한 PNU
    address TEXT, -- 신청 당시의 주소 정보 저장
    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE reservation IS '프리미엄 상담 신청 정보';
COMMENT ON COLUMN reservation.id IS '신청 고유 식별자 (UUID)';
COMMENT ON COLUMN reservation.type IS '신청 분류 (GENERAL: 일반 필지, PROPERTY: 등록 매물, REPORT: 전문가 리포트)';
COMMENT ON COLUMN reservation.date IS '상담 희망 일시';
COMMENT ON COLUMN reservation.status IS '신청 상태 (PENDING, CONFIRMED, CANCELLED, COMPLETED)';
COMMENT ON COLUMN reservation.message IS '신청 시 남긴 메시지';
COMMENT ON COLUMN reservation.admin_feedback IS '관리자가 남긴 상담 피드백';
COMMENT ON COLUMN reservation.user_id IS '신청자 (user.id FK)';
COMMENT ON COLUMN reservation.property_id IS '대상 매물 (property.id FK, 일반 필지 신청 시 NULL)';
COMMENT ON COLUMN reservation.pnu IS '대상 필지고유번호 (일반 필지 신청 시 사용)';
COMMENT ON COLUMN reservation.address IS '상담 대상 주소';
COMMENT ON COLUMN reservation.created_at IS '신청 생성일시';
COMMENT ON COLUMN reservation.updated_at IS '신청 정보 수정일시';

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

-- 구독 플랜
CREATE TABLE IF NOT EXISTS subscription_plan (
                                                 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                                 code TEXT NOT NULL UNIQUE,                 -- BASIC_MONTHLY, PLUS_MONTHLY
                                                 name TEXT NOT NULL,
                                                 amount NUMERIC(12,2) NOT NULL,
                                                 currency TEXT NOT NULL DEFAULT 'KRW',
                                                 interval_unit TEXT NOT NULL CHECK (interval_unit IN ('DAY','WEEK','MONTH','YEAR')),
                                                 interval_count INT NOT NULL DEFAULT 1,
                                                 trial_days INT NOT NULL DEFAULT 0,
                                                 active BOOLEAN NOT NULL DEFAULT TRUE,
                                                 created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                 updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 사용자 구독 마스터
CREATE TABLE IF NOT EXISTS user_subscription (
                                                 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                                 user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                                 plan_id TEXT NOT NULL REFERENCES subscription_plan(id) ON DELETE RESTRICT ON UPDATE CASCADE,
                                                 status TEXT NOT NULL CHECK (status IN ('PENDING','ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
                                                 start_at TIMESTAMP(3) WITH TIME ZONE,
                                                 current_period_start TIMESTAMP(3) WITH TIME ZONE,
                                                 current_period_end TIMESTAMP(3) WITH TIME ZONE,
                                                 cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
                                                 cancelled_at TIMESTAMP(3) WITH TIME ZONE,
                                                 ended_at TIMESTAMP(3) WITH TIME ZONE,
                                                 created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                 updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_subscription_user_id ON user_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscription_status ON user_subscription(status);

-- 결제수단(빌링키)
CREATE TABLE IF NOT EXISTS billing_key (
                                           id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                           user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                           portone_customer_id TEXT NOT NULL,        -- 포트원 customer.id
                                           billing_key TEXT NOT NULL UNIQUE,         -- 민감정보: 운영 시 암호화 저장 권장
                                           channel_key TEXT NOT NULL,
                                           provider TEXT,                            -- tosspayments/kcp 등
                                           card_company TEXT,
                                           card_last4 TEXT,
                                           card_expiry_year TEXT,
                                           card_expiry_month TEXT,
                                           is_active BOOLEAN NOT NULL DEFAULT TRUE,
                                           issued_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                           deleted_at TIMESTAMP(3) WITH TIME ZONE,
                                           created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                           updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_key_user_active
    ON billing_key(user_id, is_active)
    WHERE is_active = TRUE;

-- 구독 청구/결제 이력
CREATE TABLE IF NOT EXISTS subscription_invoice (
                                                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                                    subscription_id TEXT NOT NULL REFERENCES user_subscription(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                                    billing_key_id TEXT REFERENCES billing_key(id) ON DELETE SET NULL ON UPDATE CASCADE,
                                                    portone_payment_id TEXT NOT NULL UNIQUE,  -- 내부 주문번호(paymentId)
                                                    portone_tx_id TEXT,
                                                    amount NUMERIC(12,2) NOT NULL,
                                                    currency TEXT NOT NULL DEFAULT 'KRW',
                                                    status TEXT NOT NULL CHECK (status IN ('READY','PAID','FAILED','CANCELLED')),
                                                    fail_reason TEXT,
                                                    paid_at TIMESTAMP(3) WITH TIME ZONE,
                                                    requested_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                    raw_payload JSONB,                         -- 포트원 응답 원문 저장(감사/장애 대응)
                                                    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoice_subscription_id ON subscription_invoice(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoice_status ON subscription_invoice(status);

-- 분석 요청 크레딧 지갑
CREATE TABLE IF NOT EXISTS user_credit_wallet (
                                               id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                               user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                               total_credits INT NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
                                               used_credits INT NOT NULL DEFAULT 0 CHECK (used_credits >= 0),
                                               created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                               updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 일별 분석 요청 사용량(일 50회 제한 기준)
CREATE TABLE IF NOT EXISTS user_credit_daily_usage (
                                                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                                    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                                    usage_date DATE NOT NULL,
                                                    used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
                                                    created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                    UNIQUE (user_id, usage_date)
);

-- 선택: 웹훅 이벤트 저장(중복 방지)
CREATE TABLE IF NOT EXISTS payment_webhook_event (
                                                     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                                                     event_id TEXT UNIQUE,
                                                     payment_id TEXT,
                                                     event_type TEXT,
                                                     status TEXT,
                                                     payload JSONB NOT NULL,
                                                     received_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                     processed_at TIMESTAMP(3) WITH TIME ZONE,
                                                     process_result TEXT
);


-- =========================================================
-- subscription_plan
-- =========================================================
COMMENT ON TABLE subscription_plan IS '구독 상품(플랜) 마스터 테이블';

COMMENT ON COLUMN subscription_plan.id IS '구독 플랜 PK(UUID 문자열)';
COMMENT ON COLUMN subscription_plan.code IS '플랜 코드(예: BASIC_MONTHLY, PLUS_MONTHLY), 유니크';
COMMENT ON COLUMN subscription_plan.name IS '플랜명';
COMMENT ON COLUMN subscription_plan.amount IS '결제 금액';
COMMENT ON COLUMN subscription_plan.currency IS '통화 코드(기본 KRW)';
COMMENT ON COLUMN subscription_plan.interval_unit IS '청구 주기 단위(DAY/WEEK/MONTH/YEAR)';
COMMENT ON COLUMN subscription_plan.interval_count IS '청구 주기 수량(예: 1개월이면 MONTH + 1)';
COMMENT ON COLUMN subscription_plan.trial_days IS '무료 체험 일수';
COMMENT ON COLUMN subscription_plan.active IS '플랜 활성 여부';
COMMENT ON COLUMN subscription_plan.created_at IS '생성 시각';
COMMENT ON COLUMN subscription_plan.updated_at IS '수정 시각';

-- =========================================================
-- user_subscription
-- =========================================================
COMMENT ON TABLE user_subscription IS '사용자별 구독 상태/기간 관리 마스터 테이블';

COMMENT ON COLUMN user_subscription.id IS '사용자 구독 PK(UUID 문자열)';
COMMENT ON COLUMN user_subscription.user_id IS '사용자 ID(FK: user.id)';
COMMENT ON COLUMN user_subscription.plan_id IS '구독 플랜 ID(FK: subscription_plan.id)';
COMMENT ON COLUMN user_subscription.status IS '구독 상태(PENDING/ACTIVE/PAST_DUE/CANCELLED/EXPIRED)';
COMMENT ON COLUMN user_subscription.start_at IS '구독 시작 시각';
COMMENT ON COLUMN user_subscription.current_period_start IS '현재 결제 주기 시작 시각';
COMMENT ON COLUMN user_subscription.current_period_end IS '현재 결제 주기 종료 시각';
COMMENT ON COLUMN user_subscription.cancel_at_period_end IS '주기 종료 시 해지 여부';
COMMENT ON COLUMN user_subscription.cancelled_at IS '해지 요청/처리 시각';
COMMENT ON COLUMN user_subscription.ended_at IS '구독 완전 종료 시각';
COMMENT ON COLUMN user_subscription.created_at IS '생성 시각';
COMMENT ON COLUMN user_subscription.updated_at IS '수정 시각';

-- =========================================================
-- billing_key
-- =========================================================
COMMENT ON TABLE billing_key IS '사용자 결제수단(빌링키) 저장 테이블';

COMMENT ON COLUMN billing_key.id IS '빌링키 레코드 PK(UUID 문자열)';
COMMENT ON COLUMN billing_key.user_id IS '사용자 ID(FK: user.id)';
COMMENT ON COLUMN billing_key.portone_customer_id IS '포트원 customer.id';
COMMENT ON COLUMN billing_key.billing_key IS 'PG에서 발급된 빌링키(민감정보)';
COMMENT ON COLUMN billing_key.channel_key IS '포트원 채널 키';
COMMENT ON COLUMN billing_key.provider IS 'PG 제공사 식별값(예: tosspayments, kcp 등)';
COMMENT ON COLUMN billing_key.card_company IS '카드사명/코드';
COMMENT ON COLUMN billing_key.card_last4 IS '카드번호 뒤 4자리';
COMMENT ON COLUMN billing_key.card_expiry_year IS '카드 만료년도';
COMMENT ON COLUMN billing_key.card_expiry_month IS '카드 만료월';
COMMENT ON COLUMN billing_key.is_active IS '현재 활성 빌링키 여부';
COMMENT ON COLUMN billing_key.issued_at IS '빌링키 발급 시각';
COMMENT ON COLUMN billing_key.deleted_at IS '빌링키 비활성/삭제 시각(소프트 삭제)';
COMMENT ON COLUMN billing_key.created_at IS '생성 시각';
COMMENT ON COLUMN billing_key.updated_at IS '수정 시각';

-- =========================================================
-- subscription_invoice
-- =========================================================
COMMENT ON TABLE subscription_invoice IS '구독 청구/결제 이력(인보이스) 테이블';

COMMENT ON COLUMN subscription_invoice.id IS '인보이스 PK(UUID 문자열)';
COMMENT ON COLUMN subscription_invoice.subscription_id IS '구독 ID(FK: user_subscription.id)';
COMMENT ON COLUMN subscription_invoice.billing_key_id IS '빌링키 ID(FK: billing_key.id)';
COMMENT ON COLUMN subscription_invoice.portone_payment_id IS '내부 결제주문번호(paymentId), 유니크';
COMMENT ON COLUMN subscription_invoice.portone_tx_id IS '포트원/PG 트랜잭션 ID';
COMMENT ON COLUMN subscription_invoice.amount IS '청구 금액';
COMMENT ON COLUMN subscription_invoice.currency IS '통화 코드(기본 KRW)';
COMMENT ON COLUMN subscription_invoice.status IS '결제 상태(READY/PAID/FAILED/CANCELLED)';
COMMENT ON COLUMN subscription_invoice.fail_reason IS '결제 실패 사유';
COMMENT ON COLUMN subscription_invoice.paid_at IS '결제 완료 시각';
COMMENT ON COLUMN subscription_invoice.requested_at IS '결제 요청 시각';
COMMENT ON COLUMN subscription_invoice.raw_payload IS '포트원 응답 원문(JSONB)';
COMMENT ON COLUMN subscription_invoice.created_at IS '생성 시각';
COMMENT ON COLUMN subscription_invoice.updated_at IS '수정 시각';

-- =========================================================
-- user_credit_wallet
-- =========================================================
COMMENT ON TABLE user_credit_wallet IS '사용자별 분석 요청 크레딧 총량/사용량을 저장하는 지갑 테이블';
COMMENT ON COLUMN user_credit_wallet.id IS '크레딧 지갑 PK(UUID 문자열)';
COMMENT ON COLUMN user_credit_wallet.user_id IS '사용자 ID(FK: user.id), 사용자별 1행 유지';
COMMENT ON COLUMN user_credit_wallet.total_credits IS '지급된 총 크레딧 수량';
COMMENT ON COLUMN user_credit_wallet.used_credits IS '사용한 크레딧 수량';
COMMENT ON COLUMN user_credit_wallet.created_at IS '생성 시각';
COMMENT ON COLUMN user_credit_wallet.updated_at IS '수정 시각';

-- =========================================================
-- user_credit_daily_usage
-- =========================================================
COMMENT ON TABLE user_credit_daily_usage IS '사용자별 일자 단위 AI 분석 요청 사용량(일일 제한 검증용) 테이블';
COMMENT ON COLUMN user_credit_daily_usage.id IS '일별 사용량 PK(UUID 문자열)';
COMMENT ON COLUMN user_credit_daily_usage.user_id IS '사용자 ID(FK: user.id)';
COMMENT ON COLUMN user_credit_daily_usage.usage_date IS '사용 집계 기준 일자';
COMMENT ON COLUMN user_credit_daily_usage.used_count IS '해당 일자 누적 사용 건수';
COMMENT ON COLUMN user_credit_daily_usage.created_at IS '생성 시각';
COMMENT ON COLUMN user_credit_daily_usage.updated_at IS '수정 시각';

-- =========================================================
-- payment_webhook_event
-- =========================================================
COMMENT ON TABLE payment_webhook_event IS '포트원 웹훅 수신 원문/처리결과 저장(멱등 처리용) 테이블';

COMMENT ON COLUMN payment_webhook_event.id IS '웹훅 이벤트 PK(UUID 문자열)';
COMMENT ON COLUMN payment_webhook_event.event_id IS '포트원 이벤트 ID(중복 방지용 유니크)';
COMMENT ON COLUMN payment_webhook_event.payment_id IS '결제 식별자(paymentId)';
COMMENT ON COLUMN payment_webhook_event.event_type IS '이벤트 타입';
COMMENT ON COLUMN payment_webhook_event.status IS '이벤트 수신 시점 결제 상태';
COMMENT ON COLUMN payment_webhook_event.payload IS '웹훅 원문 payload(JSONB)';
COMMENT ON COLUMN payment_webhook_event.received_at IS '웹훅 수신 시각';
COMMENT ON COLUMN payment_webhook_event.processed_at IS '웹훅 처리 완료 시각';
COMMENT ON COLUMN payment_webhook_event.process_result IS '처리 결과/메시지';