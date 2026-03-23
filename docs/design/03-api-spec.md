# REST API 스펙 명세

본 문서는 프론트엔드(Vanilla JS/HTML)와 백엔드(NestJS) 간 데이터 통신을 위한 API 스펙을 정의합니다.
백엔드 구현 시 Swagger(`@nestjs/swagger`)를 통해 자동 형상 관리가 이루어지며, 런타임 API 문서는 `/api/docs`에서 확인 가능합니다.

---

## 1. 기본 응답 규약 (Common Response)

성공 및 실패 응답의 형태를 통일합니다.

```json
// Success
{
  "status": "success",
  "data": { ... },
  "message": "요청이 성공적으로 처리되었습니다."
}

// Error
{
  "status": "error",
  "data": null,
  "statusCode": 404,
  "message": "해당 매물을 찾을 수 없습니다."
}
```

---

## 2. Authentication & User API (`/api/v1/auth`, `/api/v1/users`)

백엔드(NestJS + Passport.js)에서 소셜 로그인을 전담하여 JWT를 발급하며, **HttpOnly, Secure, SameSite 쿠키**로 전송합니다.
프론트엔드(Vanilla JS)는 `credentials: true`(CORS)를 사용하여 API 호출 시 쿠키를 자동 동봉합니다.

### 2.1 인증 (Auth)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/auth/naver` | 네이버 로그인 화면으로 리다이렉트 (Passport OAuth 시작) | NONE |
| `GET` | `/api/v1/auth/naver/callback` | 네이버 콜백 처리 및 JWT 쿠키 발급 | NONE |
| `GET` | `/api/v1/auth/kakao` | 카카오 로그인 화면으로 리다이렉트 | NONE |
| `GET` | `/api/v1/auth/kakao/callback` | 카카오 콜백 처리 및 JWT 쿠키 발급 | NONE |
| `GET` | `/api/v1/auth/google` | 구글 로그인 화면으로 리다이렉트 | NONE |
| `GET` | `/api/v1/auth/google/callback` | 구글 콜백 처리 및 JWT 쿠키 발급 | NONE |

### 2.2 사용자 (Users)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | 현재 내 프로필 및 권한 조회 | USER |
| `PATCH` | `/api/v1/users/me` | 내 프로필 정보(이름, 아바타 등) 업데이트 | USER |

---

## 3. Property API (`/api/v1/properties`)

지번 주소 기준 매물 조회 및 네이버 지도 연동을 위한 API입니다.
매물(Property)은 서비스의 핵심 도메인으로, 갤러리(`gallery.html`)와 상세(`properties.html`) 화면 모두에서 이 API를 사용합니다.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/properties` | 매물 리스트(갤러리형) 페이징 조회 | ANY |
| `GET` | `/api/v1/properties/map?ne=&sw=` | **[핵심]** 지도 바운더리 내 매물 마커 조회 (PostGIS 쿼리) | ANY |
| `GET` | `/api/v1/properties/:id` | 매물 상세(이미지, 공시지가, 실거래가 등) 조회 | ANY |
| `GET` | `/api/v1/properties/search?address=` | 지번 주소 키워드 검색 | ANY |
| `POST` | `/api/v1/properties` | 신규 매물 등록 (이미지는 Supabase Storage 업로드 후 CDN URL 저장) | ADMIN |
| `PATCH` | `/api/v1/properties/:id` | 기존 매물 정보 수정 | ADMIN |
| `DELETE` | `/api/v1/properties/:id` | 등록된 매물 삭제 | ADMIN |

---

## 4. Public Data API (`/api/v1/public-data`)

공공데이터 포털 API의 속도 및 Rate Limiting 문제를 해결하기 위해 **서비스 DB에 사전 적재/갱신**된 데이터를 서비스합니다.
새로운 데이터는 CRON 스케줄러가 주기적으로 동기화합니다.

### 4.1 조회 API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/public-data/actual-price?address=` | DB 적재 주소 기준 실거래가 이력 | ANY |
| `GET` | `/api/v1/public-data/official-land-price?address=` | DB 적재 공시지가 | ANY |
| `GET` | `/api/v1/public-data/tojieum?address=` | DB 적재 토지이음 규제/이용계획 | ANY |
| `GET` | `/api/v1/public-data/search?query=` | 네이버 지역 검색 API 프록시 (키워드 → 좌표 변환) | ANY |

### 4.2 공공데이터 일괄 적재 (Bulk Load — One Time Job)

런칭 전 빈 화면에서 공공데이터 누락을 방지하기 위해, **서비스 오픈 전 최초 1회** 전국 기초주소 등의 공공데이터를 DB에 미리 적재하는 배치 스크립트가 구동됩니다.

### 4.3 백그라운드 스케줄러 (CRON Module) 설계

NestJS의 `@nestjs/schedule` 모듈을 통해 아래 로직으로 데이터를 갱신합니다.

1. **대상 추출**: `synced_at`이 특정 기간(30~90일)을 초과한 레코드를 `N`개 추출
2. **동기화**: 추출된 주소에 대해 공공 API를 순차 호출 (1초 지연 Throttling)
3. **주기율 설정**: 새벽 시간대(`0 2 * * *` 또는 매주 일요일 새벽 3시) 배치 실행

---

## 5. Reservation API (`/api/v1/reservations`)

사용자의 상담 예약 및 관심 매물(찜) 처리 기능입니다.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/reservations` | 특정 매물(`propertyId`)에 대한 상담 예약 신청 | USER |
| `GET` | `/api/v1/reservations/me` | 내 상담 예약 내역 조회 (마이페이지용) | USER |
| `PATCH` | `/api/v1/reservations/:id/status` | 예약 상태 변경 (확정, 취소 등) | ADMIN/USER |

---

## 6. Favorites API (`/api/v1/favorites`)

사용자의 관심 매물(찜) 처리 기능입니다. 상담 예약 시스템과 분리된 독립된 모듈입니다.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/favorites/:propertyId` | 관심 매물 추가/삭제 (Toggle) | USER |
| `GET` | `/api/v1/favorites/me` | 내 관심 매물 목록 조회 (마이페이지용) | USER |
| `GET` | `/api/v1/favorites/check/:propertyId` | 현재 로그인한 사용자가 해당 매물을 찜했는지 여부 확인 | USER |
