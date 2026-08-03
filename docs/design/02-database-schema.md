# 데이터베이스 스키마 설계 (Prisma Models)

본 문서는 터잡이 서비스의 Prisma 스키마(`schema.prisma`) 설계를 정의합니다.
PostGIS 확장을 활용한 공간 데이터 처리와 소셜 로그인, 매물 관리, 공공데이터 수집을 위한 테이블 구조를 포함합니다.

---

## 1. 명명 규칙

> **모든 DB 테이블명과 컬럼명은 소문자 스네이크케이스(`snake_case`)를 사용합니다.**

| 구분 | 규칙 | 예시 |
|---|---|---|
| **Prisma 모델명** | PascalCase, 단수형 | `User`, `Property`, `Reservation` |
| **DB 테이블명** | snake_case, **단수형** (`@@map()` 사용) | `user`, `property`, `reservation` |
| **DB 컬럼명** | snake_case (`@map()` 사용) | `created_at`, `bld_nm`, `plat_area` |

---

## 2. 기본 설정 및 PostGIS 연동

```prisma
datasource db {
  provider   = "postgresql"
  extensions = [postgis(schema: "public")]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

> 참고: 실제 연결 문자열(`DATABASE_URL`, `DIRECT_URL`)은 Prisma 설정 파일/실행 환경에서 주입되며,
> 현재 `schema.prisma`의 `datasource` 블록에는 명시하지 않습니다.

---

## 3. 서비스 모델 정의

### 3.1 User (사용자 및 권한)

소셜 로그인 + 회원가입 동의 + 이메일 검증 + 구독/결제를 모두 연결하는 핵심 모델입니다.

```prisma
model User {
  id                     String    @id @default(uuid())
  email                  String?
  emailVerified          Boolean   @default(false) @map("email_verified")
  emailVerifiedAt        DateTime? @map("email_verified_at")
  lastVerificationSentAt DateTime? @map("last_verification_sent_at")
  name                   String?
  image                  String?   @db.Text
  role                   Role      @default(USER)
  provider               String?
  providerId             String?   @map("provider_id")
  phone                  String?
  phoneVerified          Boolean   @default(false) @map("phone_verified")

  properties              Property[]
  reservations            Reservation[]
  favorites               Favorite[]
  subscriptions           UserSubscription[]
  billingKeys             BillingKey[]
  emailVerificationTokens EmailVerificationToken[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([provider, providerId])
  @@map("user")
}

enum Role {
  USER
  PREMIUM_BASIC
  PREMIUM_PLUS
  ADMIN
}
```

### 3.2 Property (부동산 컨설팅 매물)

지번 주소를 키로 하는 갤러리형 매물 정보입니다. `gallery.html`과 `properties.html`에서 조회되며, 모든 매물 관련 프로세스의 중심 모델입니다.

```prisma
model Property {
  id            String    @id @default(uuid())
  title         String                            // 매물/컨설팅 제목
  description   String    @db.Text                // 매물 상세 설명
  address       String    @unique                 // 지번 주소 (고유 식별)
  beforeImage   String?   @map("before_image")    // 전 이미지
  afterImage    String?   @map("after_image")     // 후 이미지
  price         Decimal?  @db.Decimal(15, 2)      // 가격 정보
  pnu           String?   @db.Char(19)            // 필지고유번호

  // GIS 기반 위치 정보 (PostGIS Point 타입)
  location      Unsupported("geometry(Point, 4326)")?

  ownerId       String?   @map("owner_id")
  owner         User?     @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  reservations  Reservation[]
  favorites     Favorite[]

  createdAt     DateTime  @default(now())  @map("created_at")
  updatedAt     DateTime  @updatedAt       @map("updated_at")

  @@index([location], type: Gist)
  @@map("property")
}
```

### 3.3 Reservation (프리미엄 상담 신청)

사용자가 특정 매물 또는 일반 필지에 대해 '프리미엄 상담'을 신청하는 정보입니다.
용어 통일을 위해 기존 '상담 예약'에서 '프리미엄 상담 신청'으로 명칭을 변경하였습니다.

```prisma
model Reservation {
  id            String          @id @default(uuid())
  type          ReservationType @default(GENERAL)       // 신청 분류
  date          DateTime                                // 상담 희망 일시
  status        ResStatus       @default(PENDING)       // 신청 상태
  message       String?         @db.Text                // 상담 시 요청 사항
  pnu           String?         @db.Char(19)            // 일반 필지 신청 시 대상 PNU
  address       String?                                 // 신청 당시 대상 주소

  userId        String    @map("user_id")
  user          User      @relation(fields: [userId], references: [id])
  propertyId    String?   @map("property_id")     // 컨설팅 매물 신청 시 연결 (일반 필지는 null)
  property      Property? @relation(fields: [propertyId], references: [id])

  createdAt     DateTime  @default(now())  @map("created_at")
  updatedAt     DateTime  @updatedAt       @map("updated_at")

  @@map("reservation")
}

enum ReservationType {
  GENERAL   // 일반 필지 상담 신청
  PROPERTY  // 등록된 컨설팅 매물 상담 신청
  REPORT    // 전문가 리포트 요청
}

enum ResStatus {
  PENDING     // 신청 대기
  CONFIRMED   // 신청 확정
  CANCELLED   // 신청 취소
  COMPLETED   // 상담 완료
}
```

### 3.4 Favorite (즐겨찾기)

사용자가 관심 매물을 즐겨찾기에 추가하는 모델입니다.

```prisma
model Favorite {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  propertyId  String   @map("property_id")
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([userId, propertyId])
  @@map("favorite")
}
```

### 3.5 EmailVerificationToken (이메일 인증 토큰)

리포트 요청 전 이메일 인증 절차를 위한 일회성 토큰 저장 모델입니다.

```prisma
model EmailVerificationToken {
  id        String    @id @default(uuid())
  userId    String?   @map("user_id")
  user      User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
  email     String
  tokenHash String    @unique @map("token_hash")
  purpose   String    @default("REPORT_DELIVERY_VERIFICATION")
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  requestIp String?   @db.Inet @map("request_ip")
  userAgent String?   @map("user_agent")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  @@index([userId])
  @@index([email])
  @@index([expiresAt])
  @@map("email_verification_token")
}
```

### 3.6 SubscriptionPlan (구독 플랜)

전자 결재(PortOne) 정기결제의 상품 마스터 모델입니다.

```prisma
model SubscriptionPlan {
  id            String  @id @default(uuid())
  code          String  @unique
  name          String
  amount        Decimal @db.Decimal(12, 2)
  currency      String  @default("KRW")
  intervalUnit  String  @db.Text @map("interval_unit")
  intervalCount Int     @default(1) @map("interval_count")
  trialDays     Int     @default(0) @map("trial_days")
  active        Boolean @default(true)

  subscriptions UserSubscription[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("subscription_plan")
}
```

### 3.7 UserSubscription (사용자 구독 상태)

사용자별 구독 라이프사이클(PENDING/ACTIVE/PAST_DUE/CANCELLED/EXPIRED) 추적 모델입니다.

```prisma
model UserSubscription {
  id                 String           @id @default(uuid())
  userId             String           @map("user_id")
  user               User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  planId             String           @map("plan_id")
  plan               SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Restrict)
  status             String           @db.Text
  startAt            DateTime?        @map("start_at")
  currentPeriodStart DateTime?        @map("current_period_start")
  currentPeriodEnd   DateTime?        @map("current_period_end")
  cancelAtPeriodEnd  Boolean          @default(false) @map("cancel_at_period_end")
  cancelledAt        DateTime?        @map("cancelled_at")
  endedAt            DateTime?        @map("ended_at")

  invoices SubscriptionInvoice[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@index([status])
  @@map("user_subscription")
}
```

### 3.8 BillingKey / SubscriptionInvoice / PaymentWebhookEvent

정기결제 키 보관, 청구 이력, 웹훅 이벤트 이력(중복 방지) 모델입니다.

```prisma
model BillingKey {
  id                String    @id @default(uuid())
  userId            String    @map("user_id")
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  portoneCustomerId String    @map("portone_customer_id")
  billingKey        String    @unique @map("billing_key")
  channelKey        String    @map("channel_key")
  provider          String?
  cardCompany       String?   @map("card_company")
  cardLast4         String?   @map("card_last4")
  cardExpiryYear    String?   @map("card_expiry_year")
  cardExpiryMonth   String?   @map("card_expiry_month")
  isActive          Boolean   @default(true) @map("is_active")
  issuedAt          DateTime  @default(now()) @map("issued_at")
  deletedAt         DateTime? @map("deleted_at")

  invoices SubscriptionInvoice[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("billing_key")
}

model SubscriptionInvoice {
  id               String           @id @default(uuid())
  subscriptionId   String           @map("subscription_id")
  subscription     UserSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  billingKeyId     String?          @map("billing_key_id")
  billingKey       BillingKey?      @relation(fields: [billingKeyId], references: [id], onDelete: SetNull)
  portonePaymentId String           @unique @map("portone_payment_id")
  portoneTxId      String?          @map("portone_tx_id")
  amount           Decimal          @db.Decimal(12, 2)
  currency         String           @default("KRW")
  status           String           @db.Text
  failReason       String?          @map("fail_reason")
  paidAt           DateTime?        @map("paid_at")
  requestedAt      DateTime         @default(now()) @map("requested_at")
  rawPayload       Json?            @map("raw_payload")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([subscriptionId])
  @@index([status])
  @@map("subscription_invoice")
}

model PaymentWebhookEvent {
  id            String    @id @default(uuid())
  eventId       String?   @unique @map("event_id")
  paymentId     String?   @map("payment_id")
  eventType     String?   @map("event_type")
  status        String?
  payload       Json
  receivedAt    DateTime  @default(now()) @map("received_at")
  processedAt   DateTime? @map("processed_at")
  processResult String?   @map("process_result")

  @@map("payment_webhook_event")
}
```

### 3.9 구독/결제 상태 enum

```prisma
enum SubscriptionStatus {
  PENDING
  ACTIVE
  PAST_DUE
  CANCELLED
  EXPIRED
}

enum InvoiceStatus {
  READY
  PAID
  FAILED
  CANCELLED
}

enum IntervalUnit {
  DAY
  WEEK
  MONTH
  YEAR
}
```

---

## 4. 공공데이터 수집 모델 (Public Data Collection)

수집된 공공데이터(건축물대장, 토지이용계획, 공시지가 등)를 체계적으로 관리하기 위한 모델 그룹입니다.

### 4.1 BuildingInfo (건축물 기본 정보)

서울시 건축물대장 표제부 정보를 저장하는 모델입니다.

```prisma
model BuildingInfo {
  id               Int       @id @default(autoincrement())
  pnu              String    @unique @db.Char(19)                      // 필지고유번호 (19자리)
  bldNm            String?   @map("bld_nm")                            // 건물 명칭
  platArea         Decimal?  @map("plat_area") @db.Decimal(15, 2)      // 대지면적 (㎡)
  archArea         Decimal?  @map("arch_area") @db.Decimal(15, 2)      // 건축면적 (㎡)
  bcRat            Decimal?  @map("bc_rat") @db.Decimal(5, 2)          // 건폐율 (%)
  vlRat            Decimal?  @map("vl_rat") @db.Decimal(7, 2)          // 용적률 (%)
  totArea          Decimal?  @map("tot_area") @db.Decimal(15, 2)       // 연면적 (㎡)
  grndFlrCnt       Int?      @map("grnd_flr_cnt")                      // 지상 층수
  ugndFlrCnt       Int?      @map("ugnd_flr_cnt")                      // 지하 층수
  buildingHeight   Decimal?  @map("building_height") @db.Decimal(10, 2) // 건물 높이 (m)
  strctCdNm        String?   @map("strct_cd_nm")                       // 구조 명칭
  mainPurpsCdNm    String?   @map("main_purps_cd_nm")                  // 주용도 명칭
  useAprDay        String?   @map("use_apr_day")                       // 사용승인일 (부분 날짜 포함 가능: YYYYMMDD, YYYY-MM, YYYY 등)
  createdAt        DateTime  @default(now()) @map("created_at")        // 데이터 생성일시

  floorStatuses    FloorStatus[]                                       // 층별 현황 (1:N)
  stores           StoreInfo[]                                         // 입점 상가 (1:N)

  @@map("building_info")
}
```

### 4.2 FloorStatus (건물 층별 현황)

건축물대장의 층별 현황 정보를 저장하는 모델입니다.

```prisma
model FloorStatus {
  id             Int          @id @default(autoincrement())
  pnu            String       @db.Char(19)                             // 필지고유번호
  building       BuildingInfo @relation(fields: [pnu], references: [pnu])
  flrNo          Int?         @map("flr_no")                           // 층 번호
  flrNoNm        String?      @map("flr_no_nm")                       // 층 번호 명칭
  flrSortNo      Int?         @map("flr_sort_no")                     // 정렬 번호 (옥탑=3000+층, 지상=2000+층, 지하=1000-층)
  flrArea        Decimal?     @map("flr_area") @db.Decimal(15, 2)     // 해당 층 면적 (㎡)
  flrMainPurps   String?      @map("flr_main_purps")                  // 해당 층 주용도
  strctCdNm      String?      @map("strct_cd_nm")                     // 해당 층 구조
  createdAt      DateTime     @default(now()) @map("created_at")      // 데이터 생성일시

  @@index([pnu])
  @@map("floor_status")
}
```

### 4.3 StoreInfo (상가 및 업소 정보)

건물 내 입점 상가 및 업소 정보를 저장하는 모델입니다.

```prisma
model StoreInfo {
  storeId        String       @id @map("store_id")                    // 상가업소번호
  pnu            String       @db.Char(19)                             // 필지고유번호
  building       BuildingInfo @relation(fields: [pnu], references: [pnu])
  storeNm        String       @map("store_nm")                        // 상호명
  cateLargeNm    String?      @map("cate_large_nm")                   // 업종 대분류
  cateMidNm      String?      @map("cate_mid_nm")                     // 업종 중분류
  flrNo          String?      @map("flr_no")                          // 입점 층
  hoNo           String?      @map("ho_no")                           // 입점 호수
  createdAt      DateTime     @default(now()) @map("created_at")      // 데이터 생성일시

  @@index([pnu])
  @@map("store_info")
}
```

### 4.4 LandUseInfo (토지이용계획 정보)

토지이용계획정보 CSV에서 용도지역지구 정보를 PNU 기준으로 이관하여 저장하는 테이블입니다.
하나의 필지(PNU)에 여러 용도지역지구가 지정될 수 있으므로 1:N 관계입니다.

```prisma
model LandUseInfo {
  id             Int       @id @default(autoincrement())
  pnu            String    @db.Char(19)                                // 필지고유번호
  zoneClsCd      String?   @map("zone_cls_cd")                        // 용도지역지구코드
  zoneClsNm      String?   @map("zone_cls_nm")                        // 용도지역지구명
  note           String?                                               // 비고내용
  createdAt      DateTime  @default(now()) @map("created_at")          // 데이터 생성일시

  @@index([pnu])
  @@map("land_use_info")
}
```

- **데이터 출처**: 국토교통부 토지이용계획정보 (`staging_land_use_plan.csv`)
- **PNU 생성**: 법정동코드 + 대장구분코드 + 지번으로 조합
- **이관 조건**: `building_info`에 해당 PNU가 존재하는 행만 이관

### 4.5 OfficialLandPrice (공시지가)

매년 1월 1일 기준 공시지가를 연도별로 저장하는 모델입니다.
하나의 필지(PNU)에 여러 연도의 공시지가가 존재하므로 1:N 관계입니다.

```prisma
model OfficialLandPrice {
  id            Int    @id @default(autoincrement())
  pnu           String @db.VarChar(19)                                 // 필지고유번호
  refYear       Int    @map("ref_year")                                // 기준년도
  pricePerSqm   BigInt @map("price_per_sqm")                          // 공시지가 (원/㎡)

  @@unique([pnu, refYear])
  @@index([pnu])
  @@map("official_land_price")
}
```

- **데이터 출처**: 국토교통부 개별공시지가 CSV (2021~2025년)
- **이관 조건**: 기준년월이 1월(`LIKE '%-01-01'`)인 데이터만 이관, `ON CONFLICT DO NOTHING`으로 기존 데이터 보존

### 4.6 ZoningRegulation (용도지역별 건폐율·용적률 참조)

법정 건폐율·용적률 상한값을 저장하는 **읽기 전용 참조 테이블**입니다.
제44조(건폐율) 및 제48조(용적률) 기준 16개 용도지역 데이터가 초기 데이터로 삽입됩니다.

```prisma
model ZoningRegulation {
  id             Int       @id @default(autoincrement())
  zoneName       String    @unique @map("zone_name")                   // 용도지역명
  bcrLimit       Decimal   @map("bcr_limit") @db.Decimal(5, 1)        // 건폐율 상한 (%)
  farLimit       Decimal   @map("far_limit") @db.Decimal(6, 1)        // 용적률 상한 (%)
  farLimitNote   String?   @map("far_limit_note")                     // 용적률 비고 (서울도심 예외 등)

  @@map("zoning_regulation")
}
```

- **활용**: `land_use_info.zone_cls_nm`과 `zone_name`을 매칭하여 해당 필지의 법정 건폐율/용적률 조회

### 4.7 Setting (서비스 설정)

서비스 운영에 필요한 다양한 설정값(예: 샘플 보고서 URL 등)을 Key-Value 형태로 저장하는 모델입니다.

```prisma
model Setting {
  id    Int     @id @default(autoincrement())
  key   String  @unique                      // 설정 키 (예: sample_report_url)
  value String? @db.Text                     // 설정 값

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("setting")
}
```

- **용도**: 관리자 페이지에서 동적으로 변경 가능한 시스템 변수 관리
- **예시**: `sample_report_url` 키를 통해 지도 검색 화면의 리포트 예시 링크 주소 관리

### 4.8 GeomScoreLayer (지오메트리 스코어 레이어)

지도/분석용 멀티폴리곤 스코어 레이어를 저장하는 공간 테이블입니다.

```prisma
model GeomScoreLayer {
  id         Int                                          @id @default(autoincrement())
  pnu        String                                       @db.Char(19)
  geom       Unsupported("geometry(MultiPolygon, 4326)")?
  scoreGrade Int                                          @map("score_grade")
  createdAt  DateTime                                     @default(now()) @map("created_at")

  @@index([geom], type: Gist)
  @@map("geom_score_layer")
}
```

### 4.9 Prisma 미관리 보조 테이블

- `legal_dong_codes`: 데이터 이관(SQL) 단계에서 PNU 생성에 사용하는 참조 테이블
- 위 테이블은 현재 Prisma `schema.prisma`에는 포함되어 있지 않으며, 애플리케이션 런타임 조회 대상이 아닙니다.

---

## 5. 테이블 관계도

```
┌─────────┐ 1:N ┌──────────────┐ 1:N ┌──────────────────────┐
│  user   │────▶│ user_subscription │───▶│ subscription_invoice │
│         │     └──────────────┘     └──────────────────────┘
│         │ 1:N ┌──────────────┐
│         ├────▶│  billing_key  │
│         │
│         │ 1:N ┌──────────────────────────┐
│         ├────▶│ email_verification_token │
│         │
│         │ 1:N ┌──────────────┐ 1:N ┌──────────────┐
│         ├────▶│  property     │────▶│ reservation  │
│         │     └──────────────┘     └──────────────┘
│         │            │
│         │            └──1:N──▶ favorite
└─────────┘

subscription_plan ──1:N──▶ user_subscription
payment_webhook_event (독립 이벤트 로그)

┌────────────────┐    1:N     ┌──────────────────┐
│ building_info  │────────────│ land_use_info    │
│                │            └──────────────────┘
│                │    1:N     ┌──────────────────────┐
│                │────────────│ official_land_price  │
│                │            └──────────────────────┘
│                │    1:N     ┌──────────────┐
│                │────────────│ floor_status │
│                │            └──────────────┘
│                │    1:N     ┌────────────┐
│                │────────────│ store_info │
└────────────────┘            └────────────┘

┌────────────────────┐
│ zoning_regulation  │  (독립 참조 테이블, land_use_info.zone_cls_nm으로 JOIN)
└────────────────────┘

┌────────────────────┐
│ geom_score_layer   │  (공간 분석 레이어, GIST 인덱스)
└────────────────────┘

┌────────────────────┐
│     setting        │  (독립 설정 테이블, 서비스 운영 변수 관리)
└────────────────────┘

┌────────────────────┐
│ legal_dong_codes   │  (Prisma 미관리, SQL 이관 보조 테이블)
└────────────────────┘
```

---

## 6. 시사점

- **PostGIS 활용**: `property` 테이블에 `geometry(Point, 4326)` 필드와 `Gist` 인덱스를 적용하여 지도 검색 및 마커 표시 속도를 최적화합니다.
- **소셜 로그인/회원가입 분기**: `user.provider + user.provider_id` 복합 유니크 인덱스로 소셜 식별자 중복을 방지하고, 신규 가입은 동의 절차 완료 후 저장합니다.
- **이메일 검증 이력화**: `email_verification_token`으로 토큰 만료/사용/재전송 추적이 가능하며, 요청 IP/UA 감사 정보를 보관합니다.
- **전자 결재 연동**: `billing_key` + `subscription_invoice` + `payment_webhook_event` 분리로 결제 시도/결과/웹훅을 독립적으로 추적합니다.
- **지번 주소 키**: `property.address` 필드를 `@unique`로 설정하여 지번 기준 매물 고유 식별.
- **공공데이터 분리**: 공공데이터 테이블(`building_info`, `floor_status`, `store_info`, `land_use_info`, `official_land_price`, `zoning_regulation`, `geom_score_layer`)은 서비스 핵심 테이블(`user`, `property`, `reservation`)과 독립적으로 관리됩니다.
- **토지 정보 조합**: 토지 정보는 `building_info`(대지면적), `land_use_info`(용도지역 복수), `official_land_price`(연도별 공시지가), `zoning_regulation`(법정 건폐율/용적률)을 조합하여 API에서 `land` 객체로 제공합니다.
