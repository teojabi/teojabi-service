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
소셜 로그인(NextAuth) 연동과 자체 회원 관리를 위한 모델입니다.
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
  USER       // 일반 사용자 (무료: 기본 열람 및 관심매물 담기)
  PREMIUM    // 유료/프리미엄 사용자 (상세 정보 조회 권한, 컨설팅 우선권 등 차등 혜택 적용 예정)
  ADMIN      // 관리자 (매물 등록/수정/삭제 등 최고 권한)
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
  images        String[]                       // 이미지 갤러리용 URL 배열
  price         Decimal?  @db.Decimal(15,2)    // 가격 정보
  
  // GIS 기반 위치 정보 (PostGIS Point 타입)
  // Prisma 스키마에서 직접 표현이 어려운 특수 타입은 Unsupported 예약어 사용
  // 실 구현 시 원시 SQL 쿼리($queryRaw)를 통해 위경도 삽입 및 거리 검색 수행
  location      Unsupported("geometry(Point, 4326)")? 

  // 공공데이터 연동 캐싱 필드 (선택적)
  officialPrice Decimal?  @db.Decimal(15,2)    // 공시지가
  actualPrice   Decimal?  @db.Decimal(15,2)    // 실거래가 (참조용)

  // Relations
  ownerId       String?                        // 매물 담당자 또는 등록자 (ADMIN)
  owner         User?     @relation(fields: [ownerId], references: [id])
  reservations  Reservation[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([location], type: Gist)              // 공간 쿼리용 GIST 인덱스
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
*   **소셜 로그인**: `User` 테이블에 NextAuth 연동을 위한 기본적인 Provider 필드들이 구현되었습니다.
*   **지번 주소 키**: `Property`의 `address` 필드를 `@unique`로 잡아 지번을 기준으로 매물이 고유하게 식별되도록 설계했습니다.
