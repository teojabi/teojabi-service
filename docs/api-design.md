# REST API 스펙 명세 (초안)

본 문서는 프론트엔드(Next.js)와 백엔드(NestJS) 간 데이터 통신을 위한 기본 API 스펙을 정의합니다. 백엔드 구현 시 Swagger(`@nestjs/swagger`)를 통해 자동 형상 관리가 이루어집니다.

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
인증은 Front에서 NextAuth가 대부분 관장하지만, 권한 제어 및 백엔드 연동을 위한 API입니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | 현재 내 프로필 및 권한 조회 | USER |
| `PATCH` | `/api/v1/users/me` | 내 프로필 정보(이름, 아바타 등) 업데이트 | USER |
| `POST` | `/api/v1/auth/sync` | (필요시) NextAuth 세션으로 백엔드 JWT 재발급 | ANY |

---

## 2. Property API (매물 및 지도 정보)
지번 주소 기준 매물 조회 및 네이버 지도 연동을 위한 API입니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `GET` | `/api/v1/properties` | 매물 리스트(갤러리형) 페이징 조회 | ANY |
| `GET` | `/api/v1/properties/map?lat=&lng=&radius=` | **[핵심]** 특정 위경도 반경 내 매물 마커 조회 (PostGIS 쿼리로 지도 표시용 데이터 응답) | ANY |
| `GET` | `/api/v1/properties/:id` | 매물 상세(이미지, 공시지가, 실거래가 등) 조회 | ANY |
| `GET` | `/api/v1/properties/search?address=` | 지번 주소 키워드 검색 | ANY |
| `POST` | `/api/v1/properties` | 신규 매물 컨설팅 정보 등록 (이미지 포함) | ADMIN |
| `PATCH` | `/api/v1/properties/:id` | 기존 매물 정보 수정 | ADMIN |
| `DELETE`| `/api/v1/properties/:id` | 등록된 매물 삭제 | ADMIN |

---

## 3. Public Data 연동 API (Proxy)
프론트엔드에서 공공데이터 포털 API로 직접 요청할 경우 CORS 문제가 발생하거나 키가 노출될 수 있으므로, 백엔드에서 중계(Proxy) 및 캐싱하는 API입니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `GET` | `/api/v1/public/actual-price?address=` | 도로명/지번 기반 국토부 실거래가 조회 결과 반환 | ANY |
| `GET` | `/api/v1/public/official-land-price?address=` | 국토부 공시지가 결과 릴레이 응답 | ANY |
| `GET` | `/api/v1/public/tojieum?address=` | 토지이음 API를 통한 토지이용계획 결과 응답 | ANY |

---

## 4. Reservation & Interaction API (예약 및 마이페이지)
사용자의 상담 예약 및 관심 매물(찜) 처리 기능입니다.

| Method | Endpoint | Description | Role / Auth |
|---|---|---|---|
| `POST` | `/api/v1/reservations` | 특정 매물(`propertyId`)에 대한 상담 예약 신청 | USER |
| `GET` | `/api/v1/reservations/me` | 회원의 내 상담 예약 내역 조회 (마이페이지용) | USER |
| `PATCH` | `/api/v1/reservations/:id/status` | 예약 상태 변경 (확정, 취소 등) | ADMIN/USER |
| `POST` | `/api/v1/properties/:id/like` | 마이페이지 관심 매물 풀에 특정 매물 추가/삭제 (Toggle) | USER |
