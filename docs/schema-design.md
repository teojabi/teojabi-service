# 데이터베이스 스키마 설계안 (Prisma Models)

본 문서는 터잡이 서비스의 기본 요구사항을 바탕으로 작성된 Prisma 스키마(`schema.prisma`)의 초안 설계입니다. PostGIS 확장을 활용하기 위한 기본 설정과 User, Property, Reservation 테이블의 관계 구조를 정의합니다.

## 1. 기본 설정 및 PostGIS 연동
```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  // Supabase의 PostGIS 확장을 사용하기 위한 설정
  extensions = [postgis(version: "3.3.2", schema: "public")]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"] // 확장 기능(GIS) 사용 명시
}
```

## 2. 모델 구조 정의

### User (사용자 및 권한)
소셜 로그인(NestJS Passport) 연동과 자체 회원 관리를 위한 모델입니다.
```prisma
model User {
  id            String    @id @default(uuid())
  email         String?   @unique
  name          String?
  image         String?   @db.Text
  role          Role      @default(USER)     // 권한 등급
  provider      String?                      // kakao, naver, google 등 소셜 연동 출처
  providerId    String?                      // 소셜 연동 고유 ID
  
  // Relations
  properties    Property[]                   // 등록/찜한 매물
  reservations  Reservation[]                // 상담 예약 내역

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([provider, providerId])           // 동일 공급자의 고유 ID 중복 방지
}

enum Role {
  USER            // 일반 사용자 (무료: 기본 열람 및 관심매물 담기)
  PREMIUM_BASIC   // 기본 프리미엄 사용자
  PREMIUM_PLUS    // 상위 프리미엄 사용자 (상세 정보 조회 권한, 컨설팅 우선권 등 차등 혜택 적용 예정)
  ADMIN           // 관리자 (매물 등록/수정/삭제 등 최고 권한)
}
```

### Property (부동산 컨설팅 매물)
지번 주소를 키로 하는 갤러리형 매물 정보입니다.
```prisma
model Property {
  id            String    @id @default(uuid())
  title         String                         // 매물/컨설팅 제목
  description   String    @db.Text             // 매물 상세 설명
  address       String    @unique              // 지번 주소 (PK 역할 수행)
  beforeImage   String?   @map("before_image") // 전 이미지
  afterImage    String?   @map("after_image")  // 후 이미지
  price         Decimal?  @db.Decimal(15,2)    // 가격 정보
  
  // GIS 기반 위치 정보 (PostGIS Point 타입)
  location      Unsupported("geometry(Point, 4326)")? 

  // Relations
  ownerId       String?                        // 매물 담당자 또는 등록자 (ADMIN)
  owner         User?     @relation(fields: [ownerId], references: [id])
  reservations  Reservation[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([location], type: Gist)              // 공간 쿼리용 GIST 인덱스
  @@map("properties")
}
```


### 공공데이터 상세 수집 모델 (Public Data Collection)
수집된 공공데이터(건축물대장, 토지대장 등)를 체계적으로 관리하기 위한 모델 그룹입니다.

#### BuildingInfo (건축물 기본 정보)
```prisma
model BuildingInfo {
  id               Int      @id @default(autoincrement())
  pnu              String   @unique @db.Char(19)      // 필지고유번호
  bldNm            String?  @map("bld_nm")            // 건물 명칭
  platArea         Decimal? @db.Decimal(15, 2) @map("plat_area")  // 대지면적(m2)
  archArea         Decimal? @db.Decimal(15, 2) @map("arch_area")  // 건축면적(m2)
  bcRat            Decimal? @db.Decimal(5, 2) @map("bc_rat")      // 건폐율(%)
  vlRat            Decimal? @db.Decimal(7, 2) @map("vl_rat")      // 용적률(%)
  totArea          Decimal? @db.Decimal(15, 2) @map("tot_area")   // 연면적(m2)
  grndFlrCnt       Int?     @map("grnd_flr_cnt")      // 지상 층수
  ugndFlrCnt       Int?     @map("ugnd_flr_cnt")      // 지하 층수
  strctCdNm        String?  @map("strct_cd_nm")       // 구조 명칭
  mainPurpsCdNm    String?  @map("main_purps_cd_nm")  // 주용도 명칭
  useAprDay        DateTime? @db.Date @map("use_apr_day") // 사용승인일
  createdAt        DateTime @default(now()) @map("created_at")

  // Relations
  landInfo         LandInfo?
  floorStatuses    FloorStatus[]
  stores           StoreInfo[]

  @@map("building_info")
}
```
/
#### LandInfo (토지 및 공시지가 정보)
```prisma
model LandInfo {
  pnu            String   @id @db.Char(19)
  jimokNm        String?  @map("jimok_nm")         // 지목
  ladArea        Decimal? @db.Decimal(15, 2) @map("lad_area") // 토지 면적(m2)
  prposAreaNm    String?  @map("prpos_area_nm")    // 용도지역
  pblntfPclnd    BigInt?  @map("pblntf_pclnd")     // 공시지가(원/m2)
  lastUpdated    DateTime? @db.Date @map("last_updated") // 공시지가 기준일자

  // Relations
  buildingInfo   BuildingInfo @relation(fields: [pnu], references: [pnu], onDelete: Cascade)

  @@map("land_info")
}
```

#### FloorStatus (건물 층별 현황)
```prisma
model FloorStatus {
  id             Int      @id @default(autoincrement())
  pnu            String   @db.Char(19)
  flrNo          Int?     @map("flr_no")           // 층 번호
  flrNoNm        String?  @map("flr_no_nm")        // 층 번호 명칭
  flrArea        Decimal? @db.Decimal(15, 2) @map("flr_area") // 해당 층 면적(m2)
  flrMainPurps   String?  @map("flr_main_purps")   // 해당 층 주용도
  strctCdNm      String?  @map("strct_cd_nm")      // 해당 층 구조

  // Relations
  buildingInfo   BuildingInfo @relation(fields: [pnu], references: [pnu], onDelete: Cascade)

  @@map("floor_status")
}
```

#### StoreInfo (상가 및 업소 정보)
```prisma
model StoreInfo {
  storeId        String   @id @map("store_id")     // 상가업소번호
  pnu            String   @db.Char(19)
  storeNm        String   @map("store_nm")         // 상호명
  cateLargeNm    String?  @map("cate_large_nm")    // 업종 대분류
  cateMidNm      String?  @map("cate_mid_nm")      // 업종 중분류
  flrNo          String?  @map("flr_no")           // 입점 층
  hoNo           String?  @map("ho_no")            // 입점 호수
  createdAt      DateTime @default(now()) @map("created_at")

  // Relations
  buildingInfo   BuildingInfo @relation(fields: [pnu], references: [pnu], onDelete: Cascade)

  @@map("store_info")
}
```

### Reservation (상담 예약)
사용자가 특정 매물에 대해 상담을 예약하는 정보입니다.
```prisma
model Reservation {
  id            String    @id @default(uuid())
  date          DateTime                       // 예약 일시
  status        ResStatus @default(PENDING)    // 예약 상태
  message       String?   @db.Text             // 상담 시 요청 사항

  // Relations
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  propertyId    String
  property      Property  @relation(fields: [propertyId], references: [id])

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum ResStatus {
  PENDING    // 예약 대기
  CONFIRMED  // 예약 확정
  CANCELLED  // 예약 취소
  COMPLETED  // 상담 완료
}
```

## 3. 요약 및 시사점
*   **PostGIS 활용**: `Property` 모델에 `Unsupported("geometry")` 필드와 `Gist` 인덱스를 추가하여 지도 검색 및 마커 표시 속도를 최적화합니다.
*   **소셜 로그인**: `User` 테이블에 NestJS 서버사이드 연동을 위한 기본적인 Provider 필드들이 구현되었습니다.
*   **지번 주소 키**: `Property`의 `address` 필드를 `@unique`로 잡아 지번을 기준으로 매물이 고유하게 식별되도록 설계했습니다.
