# 보안 정책 (Security Policy)

## 비밀값 취급 원칙

- 비밀값(토큰·API 키·DB 비밀번호·OAuth 시크릿)은 **저장소에 커밋하지 않는다.**
- 저장 위치는 다음만 사용한다.
  - 백엔드/서비스 런타임: GitHub Actions Secrets → 배포 시 서버 환경변수
  - 데이터베이스 내부 함수/잡: **Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`)
  - 로컬 개발: `.env` (gitignore 대상)
- 예시 값은 `YOUR_...` 형태의 자리표시자만 사용한다.

## 노출 사고 대응 (회전 우선)

비밀값이 노출된 것을 인지하면 **정리보다 회전이 먼저**다.

1. **즉시 회전(revoke)** — 해당 토큰/키를 발급처에서 무효화하고 새 값을 발급한다.
   - Telegram 봇: @BotFather → `/mybots` → API Token → Revoke
   - Supabase/서비스 키: 대시보드에서 재발급
   - GitHub PAT: Settings → Developer settings → revoke
2. 새 값을 **Vault / Actions Secrets**에 저장한다.
3. 코드에서 하드코딩을 제거하고 저장소에서 읽도록 수정한다.
4. 필요 시 저장소 히스토리에서 문자열을 제거한다(`git filter-repo --replace-text`) 후 force-push.
   - GitHub는 재작성 전 커밋을 SHA로 한동안 제공할 수 있다. 회전했다면 실질 위험은 없다.
5. 남은 노출(포크·캐시·Actions 로그)을 점검한다.

## 정기 점검

- Secret Scan 워크플로(`.github/workflows/secret-scan.yml`, gitleaks)가 push/PR마다 검사한다.
- Dependabot(`.github/dependabot.yml`)가 의존성 취약점 업데이트 PR을 만든다.
- 로컬에서 커밋 전 확인: `gitleaks detect --no-banner` 또는 `git diff --cached | gitleaks detect --no-git -v`

## 저장소 설정 권장

- Code security: **Secret scanning** + **Push protection** 활성화
- Dependabot alerts / security updates 활성화
- `main` 브랜치 보호: Require PR, force push 금지, status check 필수
- Actions: Default permissions → **Read-only**, 허용 Actions 제한
- 계정 2FA, PAT는 fine-grained·최소권한·만료 설정

## 대량 크롤링 / 봇 방어

애플리케이션 레벨 제한(백엔드·beta-service·Edge Function)은 IP를 바꾸는 크롤러를 완전히 막지 못한다.
최종 방어선은 Cloudflare에서 설정한다.

1. **Security → Bots**: `Block AI bots`(또는 Bot Fight Mode) 활성화
2. **Security → WAF → Rate limiting rules**에 아래 규칙을 추가한다.
   - `api-rate-limit`: `http.host eq "api.teojabi.com" and (starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/beta/api/"))`
     → IP당 **20 requests / 10 seconds**, 초과 시 **Block 10초**
   - `site-rate-limit` (유료 플랜): `(http.host eq "teojabi.com" or http.host eq "www.teojabi.com") and not starts_with(http.request.uri.path, "/assets/")`
     → IP당 **120 requests / 1 minute** (정적 HTML 대량 수집 완화)
   - **무료 플랜 제한**: rate limiting 규칙 1개, `period`는 10초, `mitigation_timeout`은 10초만 허용된다.
     그래서 무료 플랜에서는 API·베타 API를 하나의 규칙(20회/10초)으로 묶어 적용했다.
3. **Supabase Edge Function**은 `*.supabase.co`로 직접 노출되어 Cloudflare를 우회한다.
   가능하면 `data.teojabi.com` 같은 **Cloudflare 프록시 커스텀 도메인**을 붙이고 위 rate limit을 적용한다.
4. 코드 레벨 기본값은 아래 환경변수로 조정한다.
   - 백엔드: `RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_MAX_REQUESTS`, `DATA_RATE_LIMIT_MAX_REQUESTS`, `BLOCK_AI_CRAWLERS`
   - beta-service: `TEOJABI_API_RATE_LIMIT`, `TEOJABI_HEAVY_RATE_LIMIT`, `TEOJABI_STATIC_RATE_LIMIT`, `TEOJABI_BLOCK_AI_CRAWLERS`
5. `frontend/robots.txt`는 AI 학습 크롤러 전체를 차단한다. 단, robots.txt는 비강제이므로 Cloudflare 규칙과 함께 사용해야 한다.

## 프리미엄 데이터 접근 통제

- 아래 경로는 **로그인 필수**다. (`beta-service/server-access.mjs`의 `authorizeUser`)
  - `/api/catalog`, `/api/recommendations`, `/api/assistant`, `/api/listings/*`
  - `/api/site-parcels`, `/api/parcel-context/*`, `/api/parcel-documents/*`
  - `/api/risk/*`, `/api/site-context/*`, `/api/building-records/*`, `/api/land-record/*`
  - `/api/nearby-transactions/*`, `/api/commercial*`, `/api/surrounding`, `/api/redevelop-*`, `/api/land-use/*`
- 웹은 회원 전용 요청을 `api.teojabi.com/beta`로 보내 HttpOnly 쿠키로 인증한다.
- 앱은 `Authorization: Bearer` 토큰으로 같은 beta-service를 인증한다.
- Supabase Edge Function(`data`)은 위 프리미엄 경로를 **403 `AUTH_REQUIRED`**로 차단한다. 공개 경로는 `runtime`, `health`, `neighborhoods`, `activity`, `parcels`(필지 경계)만 허용한다.
- 비로그인 상태에서 프리미엄 API가 401을 반환하면 프론트엔드가 로그인 창을 띄운다.
- 로그인 사용자에게도 **시간당 프리미엄 조회 쿼터**를 적용한다. (`beta-service/premium-guard.mjs`)
  - 기본 `TEOJABI_PREMIUM_HOURLY_QUOTA=900`회/시간
- **PNU/매물 열거 탐지**: 같은 사용자가 10분 안에 서로 다른 필지·매물을 비정상적으로 많이 조회하면 30분 차단한다.
  - 기본 `TEOJABI_PNU_ENUM_MAX=200` (10분), `TEOJABI_PNU_ENUM_PER_MINUTE=90` (1분), `TEOJABI_PNU_ENUM_BLOCK_MS=1800000`
  - 동일 매물의 상세 API 여러 개는 하나로 계산한다.
  - 차단 시 `429` + `Retry-After`와 `enumeration-blocked` 코드를 반환하고 서버 로그에 남긴다.

## 신고

보안 문제는 저장소 이슈가 아니라 운영자에게 비공개로 알린다.
