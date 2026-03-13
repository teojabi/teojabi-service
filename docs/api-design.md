# REST API 스펙 명세 (초안)

본 문서는 프론트엔드(Vanilla JS/HTML)와 백엔드(NestJS) 간 데이터 통신을 위한 기본 API 스펙을 정의합니다. 백엔드 구현 시 Swagger(`@nestjs/swagger`)를 통해 자동 형상 관리가 이루어집니다.

## 기본 응답 규약 (Common Response)
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

## 1. Authentication & User API (Auth)
백엔드(NestJS + Passport.js)에서 소셜 로그인을 전담하여 JWT를 발급하며, 발급 시 프론트엔드의 접근을 방지하는 **HttpOnly, Secure, SameSite 쿠키**로 전송합니다. 프론트엔드(Vanilla JS)는 `credentials: true`(CORS)를 사용하여 API 호출 시 쿠키를 자동 동봉합니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | 현재 내 프로필 및 권한 조회 | USER |
| `PATCH` | `/api/v1/users/me` | 내 프로필 정보(이름, 아바타 등) 업데이트 | USER |
| `GET` | `/api/v1/auth/naver` | 네이버 로그인 화면으로 리다이렉트 (Passport OAuth 시작) | NONE |
| `GET` | `/api/v1/auth/naver/callback` | 네이버 콜백 처리 및 클라이언트로 JWT 쿠키/응답 전달 | NONE |
| `GET` | `/api/v1/auth/kakao` | 카카오 로그인 화면으로 리다이렉트 | NONE |
| `GET` | `/api/v1/auth/kakao/callback` | 카카오 콜백 처리 및 클라이언트로 JWT 쿠키/응답 전달 | NONE |
| `GET` | `/api/v1/auth/google` | 구글 로그인 화면으로 리다이렉트 | NONE |
| `GET` | `/api/v1/auth/google/callback` | 구글 콜백 처리 및 클라이언트로 JWT 쿠키/응답 전달 | NONE |

---

## 2. Property API (매물 및 지도 정보)
지번 주소 기준 매물 조회 및 네이버 지도 연동을 위한 API입니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `GET` | `/api/v1/properties` | 매물 리스트(갤러리형) 페이징 조회 | ANY |
| `GET` | `/api/v1/properties/map?lat=&lng=&radius=` | **[핵심]** 특정 위경도 반경 내 매물 마커 조회 (PostGIS 쿼리로 지도 표시용 데이터 응답) | ANY |
| `GET` | `/api/v1/properties/:id` | 매물 상세(이미지, 공시지가, 실거래가 등) 조회 | ANY |
| `GET` | `/api/v1/properties/search?address=` | 지번 주소 키워드 검색 | ANY |
| `POST` | `/api/v1/properties` | 신규 매물 컨설팅 정보 등록 (이미지는 사전/동시 Supabase Storage에 업로드 후 반환받은 CDN URL 배열을 저장) | ADMIN |
| `PATCH` | `/api/v1/properties/:id` | 기존 매물 정보 수정 | ADMIN |
| `DELETE`| `/api/v1/properties/:id` | 등록된 매물 삭제 | ADMIN |

---

## 3. Public Data 연동 API (Caching & Batch Sync)
공공데이터 포털 API(실거래가, 공시지가, 토지이음)의 속도 및 Rate Limiting 부하 문제를 방지하기 위해 실시간 Proxy 대신 **서비스 DB(Supabase)에 사전 적재/갱신**된 데이터를 서비스합니다. 새로운 주소의 데이터는 백그라운드 스케줄러(CRON)가 순차적으로 동기화합니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `GET` | `/api/v1/public/actual-price?address=` | DB에 적재된 주소 기준 실거래가 이력 응답 | ANY |
| `GET` | `/api/v1/public/official-land-price?address=` | DB에 적재된 공시지가 응답 | ANY |
| `GET` | `/api/v1/public/tojieum?address=` | DB에 적재된 토지이음 규제/이용계획 결과 응답 | ANY |

### 3.1 공공데이터 일괄 적재 (Bulk Load - One Time Job)
런칭 전 빈 지도 화면에서 공공데이터가 누락되는(Cache Miss) 현상을 근본적으로 해결하기 위해, **서비스 오픈 전 최초 1회, 전국 기초주소 등 필요한 범위의 공공데이터를 모두 뽑아 서비스 DB(`PublicData`)에 미리 적재(Bulk SQL Insert)하는 파이프라인 스크립트**가 구동되어야 합니다.

### 3.2 백그라운드 스케줄러 (CRON Module) 설계
최초 1회로 일괄 적재된 방대한 `PublicData`의 최신성을 유지함과 동시에, 외부 공공 API의 호출 한도(Rate Limit) 초과를 방지하기 위해 다음과 같은 로직으로 NestJS의 `@nestjs/schedule` 모듈이 동작합니다.

1. **대상 추출 (Target Selection)**
   최우선 조건: 이미 적재된 테이블 내에서 `syncedAt`이 특정 기간(예: 30일, 90일)을 초과하여 갱신이 시급한 레코드를 최우선으로 `N`개(예: 50개) LIMIT 조회.
2. **동기화 및 갱신 (Batch Syncing)**
   추출된 대상 주소들에 대해 국토교통부 실거래가/공시지가 및 토지이음 API를 순차적으로 호출. 응답 속도 제어(예: 1초 지연)를 통해 429 Too Many Requests 에러 방어(Throttling).
3. **주기율 설정 (Cron Expression)**
   서버 부하가 적은 새벽 시간대(`0 2 * * *` 등)에 배치 워커를 작동시켜 오래된 캐싱 데이터를 서서히 최신화.

---

## 4. Reservation & Interaction API (예약 및 마이페이지)
사용자의 상담 예약 및 관심 매물(찜) 처리 기능입니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `POST` | `/api/v1/reservations` | 특정 매물(`propertyId`)에 대한 상담 예약 신청 | USER |
| `GET` | `/api/v1/reservations/me` | 회원의 내 상담 예약 내역 조회 (마이페이지용) | USER |
| `PATCH` | `/api/v1/reservations/:id/status` | 예약 상태 변경 (확정, 취소 등) | ADMIN/USER |
| `POST` | `/api/v1/properties/:id/like` | 마이페이지 관심 매물 풀에 특정 매물 추가/삭제 (Toggle) | USER |
