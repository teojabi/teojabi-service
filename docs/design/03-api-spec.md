# REST API 스펙 명세

본 문서는 프론트엔드(Vanilla JS/HTML)와 백엔드(NestJS) 간 데이터 통신을 위한 최신 API 스펙을 정의합니다.
실행 시점 기준 상세 응답 스키마는 Swagger(`/api/docs`)를 최종 기준으로 확인합니다.

---

## 1. 기본 응답 규약 (Common Response)

모든 API가 완전히 동일한 envelope를 사용하지는 않지만, 서비스 전반의 기본 원칙은 아래 형태를 따릅니다.

```json
// Success
{
  "status": "success",
  "data": { "...": "..." },
  "message": "요청이 성공적으로 처리되었습니다."
}

// Error
{
  "status": "error",
  "data": null,
  "statusCode": 400,
  "message": "요청 파라미터가 올바르지 않습니다."
}
```

---

## 2. 인증/회원 API (`/api/v1/auth`, `/api/v1/users`)

백엔드(NestJS + Passport)가 소셜 인증을 전담하고, JWT를 `HttpOnly` 쿠키(`access_token`)로 발급합니다.
신규 소셜 사용자는 즉시 가입하지 않고, `pending_signup_token` 기반 약관 동의 절차를 거쳐 최종 가입됩니다.

### 2.1 Auth API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/auth/naver` | 네이버 OAuth 시작 | NONE |
| `GET` | `/api/v1/auth/naver/callback` | 네이버 콜백 처리 | NONE |
| `GET` | `/api/v1/auth/kakao` | 카카오 OAuth 시작 | NONE |
| `GET` | `/api/v1/auth/kakao/callback` | 카카오 콜백 처리 | NONE |
| `GET` | `/api/v1/auth/google` | 구글 OAuth 시작 | NONE |
| `GET` | `/api/v1/auth/google/callback` | 구글 콜백 처리 | NONE |
| `GET` | `/api/v1/auth/social/pending-signup-status` | pending 가입 정보 조회(동의 필요 여부) | NONE |
| `POST` | `/api/v1/auth/social/complete-signup` | 약관 동의 후 소셜 회원가입 완료 | NONE |
| `POST` | `/api/v1/auth/logout` | 인증 쿠키 제거 | ANY |

> `GET /api/v1/auth/mock-login`은 로컬 테스트용 임시 엔드포인트로 운영 문서 범위에서는 제외합니다.

### 2.2 Users API

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | 내 프로필/권한 조회 | USER |
| `PATCH` | `/api/v1/users/me` | 내 프로필(이름, 이메일, 전화번호) 수정 | USER |

### 2.3 소셜 로그인/회원가입 절차

1. 프론트가 `/api/v1/auth/{provider}`로 이동하여 OAuth 인증 시작
2. 콜백에서 백엔드가 `(provider, providerId)`로 기존 사용자 조회
3. 기존 사용자면 `access_token` 쿠키 발급 후 마이페이지로 리다이렉트
4. 신규 사용자면 `pending_signup_token`, `pending_signup_provider` 쿠키 발급
5. 프론트가 `/api/v1/auth/social/pending-signup-status`로 가입 필요 여부 확인
6. 약관 동의 후 `/api/v1/auth/social/complete-signup` 호출
7. 백엔드가 사용자 생성 후 `access_token` 발급, pending 쿠키 삭제

---

## 3. 이메일 인증 API (`/api/v1/email-verification`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/email-verification/send` | 인증 메일 발송 | USER |
| `GET` | `/api/v1/email-verification/confirm?token=` | 인증 토큰 확인/완료 | NONE |

---

## 4. 전자 결재·구독 API (`/api/v1/subscriptions`)

PortOne 정기결제 연동 API입니다.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/subscriptions/prepare-billing` | 결제 준비(플랜 검증, PortOne 식별값 반환) | USER |
| `POST` | `/api/v1/subscriptions/confirm-billing` | billingKey 저장 후 1차 결제 실행/구독 생성 | USER |
| `POST` | `/api/v1/subscriptions/webhook` | PortOne 웹훅 수신 및 결제 상태 후처리 | NONE |
| `GET` | `/api/v1/subscriptions/my-paid-summary` | 내 결제/구독 요약 조회 | USER |

### 4.1 전자 결재 연동 절차

1. 프론트가 `prepare-billing` 호출 → 플랜 검증 및 `storeId/channelKey/customerId` 획득
2. PortOne SDK에서 카드 등록 후 `billingKey` 확보
3. 프론트가 `confirm-billing` 호출 (`planCode`, `billingKey`, `customerId`)
4. 백엔드 트랜잭션 처리
   - 기존 활성 `billing_key` 비활성화 후 신규 저장
   - `user_subscription(PENDING)` 생성
   - `subscription_invoice(READY)` 생성
   - PortOne 즉시 결제 요청
5. 결제 성공 시
   - `subscription_invoice=PAID`, `user_subscription=ACTIVE`
   - 권한/크레딧 동기화
6. 결제 실패 시
   - `subscription_invoice=FAILED`, `user_subscription=PAST_DUE`
7. 웹훅 수신 시
   - `payment_webhook_event` 저장(중복 eventId 방지)
   - 상태(`PAID/FAILED/CANCELLED`) 기준 후처리 재동기화

---

## 5. Property API (`/api/v1/properties`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/properties` | 매물 리스트(갤러리형) 조회 | ANY |
| `GET` | `/api/v1/properties/map?ne=&sw=` | 지도 바운더리 내 매물 마커 조회 | ANY |
| `GET` | `/api/v1/properties/:id` | 매물 상세 조회 | ANY |
| `GET` | `/api/v1/properties/search?address=` | 지번 주소 검색 | ANY |
| `POST` | `/api/v1/properties` | 매물 등록 | ADMIN |
| `PATCH` | `/api/v1/properties/:id` | 매물 수정 | ADMIN |
| `DELETE` | `/api/v1/properties/:id` | 매물 삭제 | ADMIN |

---

## 6. Reservation/Favorites API

### 6.1 Reservation (`/api/v1/reservations`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/reservations/report-payment/prepare` | 리포트 결제 사전 검증/준비 | USER |
| `POST` | `/api/v1/reservations/report-payment/confirm` | 리포트 결제 승인/확정 | USER |
| `POST` | `/api/v1/reservations` | 상담 신청 생성 | USER |
| `GET` | `/api/v1/reservations` | 전체 상담 신청 목록 조회 | ADMIN |
| `GET` | `/api/v1/reservations/me` | 내 상담 신청 목록 | USER |
| `PATCH` | `/api/v1/reservations/:id/status` | 상담 상태 변경 | ADMIN/USER |
| `PATCH` | `/api/v1/reservations/:id/feedback` | 관리자 피드백 저장 | ADMIN |

### 6.2 Favorites (`/api/v1/favorites`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/favorites/:propertyId` | 관심 매물 토글 | USER |
| `GET` | `/api/v1/favorites/me` | 내 관심 매물 목록 | USER |
| `GET` | `/api/v1/favorites/check/:propertyId` | 관심 매물 여부 확인 | USER |

---

## 7. Public Data API (`/api/v1/public-data`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/public-data/actual-price?address=` | 실거래가 이력 조회 | ANY |
| `GET` | `/api/v1/public-data/official-land-price?address=` | 공시지가 조회 | ANY |
| `GET` | `/api/v1/public-data/tojieum?address=` | 토지이음 규제/이용계획 조회 | ANY |
| `GET` | `/api/v1/public-data/search?query=` | 지역 검색(네이버 API 프록시) | ANY |

공공데이터는 실시간 프록시가 아닌 DB 적재/갱신 방식으로 제공되며, CRON 배치로 주기 동기화합니다.
