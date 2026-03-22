# 데이터베이스 스키마 설계 (Prisma Models)

본 문서는 터잡이 서비스의 Prisma 스키마(`schema.prisma`) 설계를 정의합니다.
PostGIS 확장을 활용한 공간 데이터 처리와 소셜 로그인, 매물 관리, 공공데이터 수집을 위한 테이블 구조를 포함합니다.

---

## 1. 명명 규칙

> **모든 DB 테이블명과 컬럼명은 소문자 스네이크케이스(`snake_case`)를 사용합니다.**

| 구분 | 규칙 | 예시 |
|---|---|---|
| **Prisma 모델명** | PascalCase, 단수형 | `User`, `Property`, `Reservation` |
| **DB 테이블명** | snake_case, **복수형** (`@@map()` 사용) | `users`, `properties`, `reservations` |
| **DB 컬럼명** | snake_case (`@map()` 사용) | `created_at`, `bld_nm`, `plat_area` |

---

## 2. 기본 설정 및 PostGIS 연동

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [postgis(version: "3.3.2", schema: "public")]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

---

## 3. 모델 구조 정의

### 3.1 User (사용자 및 권한)

소셜 로그인(NestJS Passport) 연동과 자체 회원 관리를 위한 모델입니다.

```prisma
model User {
  id            String    @id @default(uuid())
  email         String?   @unique
  name          String?
  image         String?   @db.Text
  role          Role      @default(USER)
  provider      String?                       // kakao, naver, google 등
  providerId    String?   @map("provider_id") // 소셜 연동 고유 ID

  // Relations
  properties    Property[]
  reservations  Reservation[]

  createdAt     DateTime  @default(now())  @map("created_at")
  updatedAt     DateTime  @updatedAt       @map("updated_at")

  @@unique([provider, providerId])
  @@map("users")
}

enum Role {
  USER            // 일반 사용자
  PREMIUM_BASIC   // 기본 프리미엄
  PREMIUM_PLUS    // 상위 프리미엄
  ADMIN           // 관리자 (최고 권한)
}
```

### 3.2 Property (부동산 컨설팅 매물)

지번 주소를 키로 하는 갤러리형 매물 정보입니다. `gallery.html`과 `properties.html`에서 조회되며, 모든 매물 관련 프로세스의 중심 모델입니다.

```prisma
model Property {
  id            String    @id @default(uuid())
  title         String                          // 매물/컨설팅 제목
  description   String    @db.Text              // 매물 상세 설명
  address       String    @unique               // 지번 주소 (고유 식별)
  beforeImage   String?   @map("before_image")  // 전 이미지
  afterImage    String?   @map("after_image")   // 후 이미지
  price         Decimal?  @db.Decimal(15, 2)    // 가격 정보

  // GIS 기반 위치 정보 (PostGIS Point 타입)
  location      Unsupported("geometry(Point, 4326)")?

  // Relations
  ownerId       String?   @map("owner_id")
  owner         User?     @relation(fields: [ownerId], references: [id])
  reservations  Reservation[]

  createdAt     DateTime  @default(now())  @map("created_at")
  updatedAt     DateTime  @updatedAt       @map("updated_at")

  @@index([location], type: Gist)
  @@map("properties")
}
```

### 3.3 Reservation (상담 예약)

사용자가 특정 매물에 대해 상담을 예약하는 정보입니다.

```prisma
model Reservation {
  id            String    @id @default(uuid())
  date          DateTime                        // 예약 일시
  status        ResStatus @default(PENDING)     // 예약 상태
  message       String?   @db.Text              // 상담 시 요청 사항

  // Relations
  userId        String    @map("user_id")
  user          User      @relation(fields: [userId], references: [id])
  propertyId    String    @map("property_id")
  property      Property  @relation(fields: [propertyId], references: [id])

  createdAt     DateTime  @default(now())  @map("created_at")
  updatedAt     DateTime  @updatedAt       @map("updated_at")

  @@map("reservations")
}

enum ResStatus {
  PENDING     // 예약 대기
  CONFIRMED   // 예약 확정
  CANCELLED   // 예약 취소
  COMPLETED   // 상담 완료
}
```

---

## 4. 공공데이터 수집 모델 (Public Data Collection)

수집된 공공데이터(건축물대장, 토지대장 등)를 체계적으로 관리하기 위한 모델 그룹입니다.

### 4.1 BuildingInfo (건축물 기본 정보)

```prisma
model BuildingInfo {
  id               Int       @id @default(autoincrement())
  pnu              String    @unique @db.Char(19)       // 필지고유번호
  bldNm            String?   @map("bld_nm")             // 건물 명칭
  platArea         Decimal?  @db.Decimal(15, 2) @map("plat_area")   // 대지면적(㎡)
  archArea         Decimal?  @db.Decimal(15, 2) @map("arch_area")   // 건축면적(㎡)
  bcRat            Decimal?  @db.Decimal(5, 2)  @map("bc_rat")      // 건폐율(%)
  vlRat            Decimal?  @db.Decimal(7, 2)  @map("vl_rat")      // 용적률(%)
  totArea          Decimal?  @db.Decimal(15, 2) @map("tot_area")    // 연면적(㎡)
  grndFlrCnt       Int?      @map("grnd_flr_cnt")       // 지상 층수
  ugndFlrCnt       Int?      @map("ugnd_flr_cnt")       // 지하 층수
  strctCdNm        String?   @map("strct_cd_nm")        // 구조 명칭
  mainPurpsCdNm    String?   @map("main_purps_cd_nm")   // 주용도 명칭
  useAprDay        DateTime? @db.Date @map("use_apr_day")// 사용승인일
  createdAt        DateTime  @default(now()) @map("created_at")

  // Relations
  landInfo         LandInfo?
  floorStatuses    FloorStatus[]
  stores           StoreInfo[]

  @@map("building_info")
}
```

### 4.2 LandInfo (토지 및 공시지가 정보)

```prisma
model LandInfo {
  pnu            String    @id @db.Char(19)
  jimokNm        String?   @map("jimok_nm")          // 지목
  ladArea        Decimal?  @db.Decimal(15, 2) @map("lad_area")  // 토지 면적(㎡)
  prposAreaNm    String?   @map("prpos_area_nm")     // 용도지역
  pblntfPclnd    BigInt?   @map("pblntf_pclnd")      // 공시지가(원/㎡)
  lastUpdated    DateTime? @db.Date @map("last_updated")

  // Relations
  buildingInfo   BuildingInfo @relation(fields: [pnu], references: [pnu], onDelete: Cascade)

  @@map("land_info")
}
```

### 4.3 FloorStatus (건물 층별 현황)

```prisma
model FloorStatus {
  id             Int       @id @default(autoincrement())
  pnu            String    @db.Char(19)
  flrNo          Int?      @map("flr_no")            // 층 번호
  flrNoNm        String?   @map("flr_no_nm")         // 층 번호 명칭
  flrArea        Decimal?  @db.Decimal(15, 2) @map("flr_area")  // 해당 층 면적(㎡)
  flrMainPurps   String?   @map("flr_main_purps")    // 해당 층 주용도
  strctCdNm      String?   @map("strct_cd_nm")       // 해당 층 구조

  // Relations
  buildingInfo   BuildingInfo @relation(fields: [pnu], references: [pnu], onDelete: Cascade)

  @@map("floor_status")
}
```

### 4.4 StoreInfo (상가 및 업소 정보)

```prisma
model StoreInfo {
  storeId        String    @id @map("store_id")      // 상가업소번호
  pnu            String    @db.Char(19)
  storeNm        String    @map("store_nm")           // 상호명
  cateLargeNm    String?   @map("cate_large_nm")      // 업종 대분류
  cateMidNm      String?   @map("cate_mid_nm")        // 업종 중분류
  flrNo          String?   @map("flr_no")             // 입점 층
  hoNo           String?   @map("ho_no")              // 입점 호수
  createdAt      DateTime  @default(now()) @map("created_at")

  // Relations
  buildingInfo   BuildingInfo @relation(fields: [pnu], references: [pnu], onDelete: Cascade)

  @@map("store_info")
}
```

---

## 5. 테이블 관계도

```
┌─────────┐     1:N      ┌──────────────┐     1:N      ┌──────────────┐
│  users  │──────────────▶│  properties  │──────────────▶│ reservations │
│         │◀──────────────│              │               │              │
└─────────┘       N:1     └──────────────┘               └──────────────┘
     │                                                         ▲
     │                           1:N                           │
     └─────────────────────────────────────────────────────────┘

┌────────────────┐    1:1     ┌───────────┐
│ building_info  │────────────│ land_info │
│                │            └───────────┘
│                │    1:N     ┌──────────────┐
│                │────────────│ floor_status │
│                │            └──────────────┘
│                │    1:N     ┌────────────┐
│                │────────────│ store_info │
└────────────────┘            └────────────┘
```

## 6. 시사점

- **PostGIS 활용**: `properties` 테이블에 `geometry(Point, 4326)` 필드와 `Gist` 인덱스를 적용하여 지도 검색 및 마커 표시 속도를 최적화합니다.
- **소셜 로그인**: `users` 테이블에 `provider` + `providerId` 복합 유니크 인덱스로 소셜 계정 중복 방지.
- **지번 주소 키**: `properties.address` 필드를 `@unique`로 설정하여 지번 기준 매물 고유 식별.
- **공공데이터 분리**: 공공데이터 테이블(`building_info`, `land_info`, `floor_status`, `store_info`)은 서비스 핵심 테이블(`users`, `properties`, `reservations`)과 독립적으로 관리됩니다.
