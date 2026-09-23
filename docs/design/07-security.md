# 보안 설계 및 운영 명세

이 문서는 터잡이 서비스에 적용된 보안 조치를 계층별로 정리한 기록입니다.
데이터 대량 추출(스크래핑)·봇·원본 우회·DB 직접 접근을 막기 위한 방어를 다층으로 구성합니다.

> 목표: "어떻게 내보내는지 못 알게" 만드는 것은 불가능(프론트 JS는 공개)하므로,
> **대량 추출을 비현실적으로 만들고(요청 제한), 원본·DB를 보호하며, 우회를 차단**하는 데 둔다.

---

## 1. 전체 구조

```
사용자 브라우저
   │  https (www/apex/api 모두 Cloudflare 프록시)
   ▼
Cloudflare  ── WAF Rate limiting(429) · SSL Full(strict) · Always HTTPS · Bot Fight
   │  443 (Cloudflare IP 대역만 허용: NCP ACG)
   ▼
NCP 서버 nginx  ── limit_req 15r/s · limit_conn 20 · server_tokens off · 보안 헤더 · real_ip(CF-Connecting-IP)
   ├─ /beta/  → beta-service(Node serve.mjs)  : Origin/Referer 가드(스크래퍼 403)
   └─ /api/   → backend(NestJS, 127.0.0.1:3001): loopback 바인딩 · 요청제한 · CORS · 보안 헤더
   ▼
Supabase  ── RLS ON(전 테이블) · anon/authenticated 권한 회수 · service_role만 접근
```

외부에 열려 있는 포트: **22(SSH), 80(HTTP, 인증서 갱신), 443(HTTPS)** 만.
(3000·3001·3389·4173·5432 등은 외부 차단)

---

## 2. Cloudflare (DNS/CDN/WAF)

| 항목 | 값 |
|---|---|
| 네임서버 | `ivan.ns.cloudflare.com`, `leah.ns.cloudflare.com` (Porkbun에서 변경) |
| 프록시 | `teojabi.com`, `www`, `api` 모두 Proxied(주황) |
| SSL/TLS | **Full (strict)**, Always Use HTTPS ON, Minimum TLS 1.2 |
| Rate limiting rule | 이름 `api-rate-limit` · 조건 `URI Path contains /api/` · `30 requests / 10 seconds` · Action **Block** · Duration 10s |
| Bot Fight Mode | (선택) Security → Settings에서 ON |

- Cloudflare IP 대역(방화벽 허용용): https://www.cloudflare.com/ips-v4 , https://www.cloudflare.com/ips-v6
- 주의: 프록시 시 클라이언트 IP가 Cloudflare IP가 되므로, **nginx에서 실제 IP 복원(real_ip)** 이 필수다(4장).

---

## 3. NCP ACG (원본 우회 차단)

- ACG 이름: **`teojabi-vpc-default-acg`** (VPC `teojabi-vpc`)
- 콘솔 위치: **Menu → All Services → Compute → Server → ACG 탭 → ACG 선택 → [ACG 설정]**

**Inbound 규칙**

| 프로토콜 | 접근 소스 | 허용 포트 | 비고 |
|---|---|---|---|
| TCP | Cloudflare IPv4 대역 15개 (각각 규칙) | 443 | Cloudflare만 원본 접근 허용 |
| TCP | 0.0.0.0/0 | 80 | Let's Encrypt HTTP-01 갱신용 (필수) |
| TCP | 0.0.0.0/0 | 22 | SSH (가능하면 관리자 IP로 제한 권장) |

- 삭제한 규칙: `3001`, `3000`, `3389`(RDP) → 불필요.
- 효과: `49.50.130.137:443` 직접 접속 차단(검증: TCP connect False, curl 타임아웃).
- 주의: 80을 닫으면 인증서 갱신 실패. Cloudflare 대역이 바뀌면 규칙 갱신 필요(연 1~2회).

---

## 4. nginx (`beta-service-deploy.yml`에서 자동 설정)

배포 시 `/etc/nginx/conf.d/00-teojabi-ratelimit.conf`, `00-teojabi-realip.conf`,
`/etc/nginx/snippets/teojabi-security.conf` 를 생성하고 api.teojabi.com server 블록에 지시자를 추가한다.

| 파일/지시자 | 값 |
|---|---|
| `00-teojabi-ratelimit.conf` | `limit_req_zone $binary_remote_addr zone=teojabi_api:10m rate=15r/s;` · `limit_conn_zone ... teojabi_conn:10m;` · status 429 |
| server 블록 | `limit_req zone=teojabi_api burst=40 nodelay;` · `limit_conn teojabi_conn 20;` · `server_tokens off;` |
| `00-teojabi-realip.conf` | Cloudflare 대역 `set_real_ip_from` + `real_ip_header CF-Connecting-IP;` |
| `teojabi-security.conf` | `X-Frame-Options DENY` · `X-Content-Type-Options nosniff` · `Referrer-Policy strict-origin-when-cross-origin` · `Permissions-Policy camera=(), microphone=(), geolocation=()` |
| HSTS | `Strict-Transport-Security "max-age=31536000; includeSubDomains" always` |

- real_ip 설정이 있어야 Cloudflare 프록시 뒤에서도 요청 제한이 **개별 사용자 IP** 기준으로 동작한다.

---

## 5. beta-service (`serve.mjs`, `server-access.mjs`)

- **봇 가드**: 운영(`TEOJABI_SERVICE_MODE=production`)에서 `/api/*` 요청에 대해
  - `Origin`이 있으면 허용 출처(`TEOJABI_WEB_ORIGINS`)만 허용
  - `Origin`이 없으면 `Referer`가 같은 호스트/허용 출처여야 통과
  - **둘 다 없으면 403** (curl·python 등 단순 스크래퍼 차단)
  - 긴급 해제: 서버 `.env`에 `TEOJABI_API_GUARD=off`
- **관리자 검증 내부 호출**: `ACCOUNT_API_INTERNAL_BASE=http://127.0.0.1:3001` 로 루프백 백엔드를 사용
  (Cloudflare 프록시 우회 → 봇 차단/헤어핀 문제 방지)
- `/api/curation`(관리자 쓰기)은 로그인 쿠키 + ADMIN 역할 검증.

---

## 6. backend (NestJS, `backend/src/main.ts`)

- **바인딩**: 운영에서 `BIND_HOST`(기본 `127.0.0.1`) → nginx만 접근, 외부 직접 노출 차단
- **요청 제한**: IP당 분당 300건(일반) / 60건(인증 경로) → 초과 시 429
- **보안 헤더**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS(운영)
- **CORS**: `FRONTEND_URL`/`FRONTEND_URLS` 화이트리스트만 허용
- **검증**: `ValidationPipe`(whitelist, forbidNonWhitelisted)

---

## 7. Supabase (DB/Storage)

- 전 `public` 테이블 **RLS ON**. 정책이 없으므로 `anon`/`authenticated`는 아무 행도 볼 수 없다(기본 거부).
- 추가 방어로 **`anon`·`authenticated`의 테이블 권한을 전면 회수**했다.
  - 검증: `SET ROLE anon`으로 `user`·`billing_key`·`property`·`naver` 등 접근 시 `permission denied`.
- 앱(백엔드·베타 서비스)은 **service_role(postgres)** 로 접속하므로 영향 없음.
- Storage: `post-images` 버킷은 public(건축사/매물 이미지 표시용). 민감 파일 혼입 주의.
- 점검/적용 스크립트(`웹설계_v1/automation/`):
  - `audit_rls.py` — 테이블별 RLS/정책/권한 현황 보고(읽기 전용)
  - `harden_rls.py` — RLS 활성화 + anon/authenticated 권한 회수(멱등)

---

## 8. 운영 / 유지보수

| 상황 | 대응 |
|---|---|
| 정상 사용자가 429/403 | Cloudflare Rate limit 값(30/10s) 또는 nginx `rate`/`burst` 상향 |
| 봇 가드가 정상 클라이언트 차단 | `.env`에 `TEOJABI_API_GUARD=off` 후 재배포 |
| Cloudflare 대역 변경 | ACG·`00-teojabi-realip.conf` 대역 갱신 |
| 원본 우회 긴급 허용 | ACG 443 규칙을 잠시 `0.0.0.0/0`으로 |
| DB 권한 재점검 | `python audit_rls.py` |

---

## 9. 남은 항목 (TODO)

- [ ] Cloudflare **Bot Fight Mode** 활성화(무료)
- [ ] Cloudflare `Security → Analytics`로 429/차단 추이 주기 점검
- [ ] SSH(22) 접근을 관리자 IP로 제한
- [ ] Supabase Storage 비공개 전환 + 서명 URL 검토(이미지가 민감해질 경우)
- [ ] (선택) 요청 서명 토큰 도입 — 진입장벽 상향(완전 차단은 아님)

---

## 10. 관련 커밋 / 파일

- 워크플로: `.github/workflows/beta-service-deploy.yml` (nginx 요청제한·real_ip·보안헤더)
- 베타 서비스: `beta-service/serve.mjs`, `beta-service/server-access.mjs`
- 백엔드: `backend/src/main.ts`
- RLS 스크립트: `웹설계_v1/automation/audit_rls.py`, `harden_rls.py`
- 프리미엄 건물정보 갱신: `웹설계_v1/automation/refresh_property_facts.py` (일일 작업 `Teojabi-Property-Facts-Daily`)
