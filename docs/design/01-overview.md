# 터잡이 서비스 — 프로젝트 개요 및 아키텍처

## 1. 서비스 소개

**터잡이(Teojabi)** 는 부동산 컨설팅 매물을 지도 기반으로 탐색하고, 공공데이터(건축물대장·토지대장·공시지가)와 결합하여 실질적인 부동산 정보를 제공하는 웹 서비스입니다.

| 항목 | 내용 |
|---|---|
| 서비스명 | 터잡이 (Teojabi) |
| 주요 기능 | 네이버 지도 기반 매물 탐색, 공공데이터 조회, 소셜 로그인, 상담 예약 |
| 대상 사용자 | 부동산 정보를 직관적으로 탐색하고 싶은 일반 사용자 및 관리자 |

---

## 2. 핵심 기능 정의

1. **지번 주소 기반 부동산 컨설팅 매물(Property) 관리** — 갤러리형 이미지 게시판 및 지도 마커
2. **네이버 지도 v3 기반 부동산 검색** — 매물 마커 표시 및 지적도 오버레이
3. **사용자 인터랙션** — 상담 예약, 마이페이지, 관심 매물 관리
4. **공공 API 연동** — 실거래가, 공시지가, 토지이음 (서비스 DB에 주기적 적재/캐싱)
5. **소셜 로그인 인증** — NestJS 백엔드(Passport.js)에서 네이버, 카카오, 구글 OAuth 전담 처리, HttpOnly 보안 쿠키 발급
6. **역할 기반 접근 제어** — USER / PREMIUM_BASIC / PREMIUM_PLUS / ADMIN 4단계 권한

---

## 3. 기술 스택 요약

| 계층 | 기술 |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (No Framework) |
| **Backend** | NestJS, TypeScript, Passport.js, Swagger |
| **Database** | PostgreSQL (Supabase 호스팅), Prisma ORM, PostGIS 3.3.2 |
| **인증** | JWT (HttpOnly 쿠키), OAuth 2.0 (네이버 · 카카오 · 구글) |
| **지도** | 네이버 지도 API v3 (NCP Maps JS API) |
| **파일 저장** | Supabase Storage |
| **배포** | Frontend: Porkbun 정적 호스팅 (FTP) / Backend: NCP 서버 (PM2) |
| **CI/CD** | GitHub Actions |

---

## 4. 3-Tier 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Tier 1 — Frontend (Presentation Layer)                 │
│  Porkbun 정적 호스팅                                     │
│  HTML / CSS / Vanilla JS                                │
│  ├── index.html       (랜딩 + 소셜 로그인 모달)          │
│  ├── search.html      (네이버 지도 v3 + 슬라이딩 패널)   │
│  ├── gallery.html     (매물 갤러리 → properties로 진입)   │
│  ├── properties.html  (매물 상세 — 핵심 화면)             │
│  ├── mypage.html      (마이페이지)                        │
│  └── admin.html       (관리자 페이지)                     │
└────────────────────┬────────────────────────────────────┘
                     │ REST API (HTTPS, CORS, credentials: true)
                     │ Port: 3001
┌────────────────────▼────────────────────────────────────┐
│  Tier 2 — Backend (Application / Business Logic Layer)  │
│  NCP 서버 · NestJS · PM2                                 │
│  ├── auth        (Passport OAuth + JWT 쿠키 발급)        │
│  ├── users       (프로필 조회/수정)                       │
│  ├── properties  (매물 CRUD + PostGIS 지도 쿼리)          │
│  ├── reservations(상담 예약 관리)                          │
│  ├── public-data (공공데이터 조회 + CRON 배치)             │
│  └── supabase    (Storage 업로드 서비스)                   │
└────────────────────┬────────────────────────────────────┘
                     │ Prisma ORM (PostgreSQL + PostGIS 3.3.2)
┌────────────────────▼────────────────────────────────────┐
│  Tier 3 — Database (Data Access Layer)                  │
│  Supabase PostgreSQL + PostGIS 확장                      │
│  ├── users            (사용자 · 권한)                     │
│  ├── properties       (컨설팅 매물 · GIS 위치)            │
│  ├── reservations     (상담 예약)                         │
│  ├── building_info    (건축물대장 표제부)                  │
│  ├── land_info        (토지대장 · 공시지가)                │
│  ├── floor_status     (층별 현황)                         │
│  └── store_info       (상가 업소 정보)                    │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 모노레포 폴더 구조

```
teojabi-service/
├── docs/               # 프로젝트 문서
│   ├── design/         # 설계 문서 (본 폴더)
│   └── guide/          # 실행 가이드 문서
├── frontend/           # Tier 1 — 정적 프론트엔드
│   ├── *.html          # 페이지 진입점 (6개)
│   ├── css/            # 글로벌 스타일 / 컴포넌트 스타일
│   ├── js/             # 공통 로직 / 인증 / 컴포넌트 / 페이지별 로직
│   └── img/            # 이미지 에셋
├── backend/            # Tier 2 — NestJS 백엔드
│   ├── src/
│   │   ├── auth/           (OAuth 전략 · JWT Guard · 역할 데코레이터)
│   │   ├── users/          (유저 CRUD)
│   │   ├── properties/     (매물 CRUD + GIS)
│   │   ├── reservations/   (예약 CRUD)
│   │   ├── public-data/    (공공데이터 + 배치 서비스)
│   │   ├── supabase/       (Storage 서비스)
│   │   └── prisma/         (Prisma 모듈)
│   ├── prisma/
│   │   └── schema.prisma   (DB 스키마 정의)
│   └── .env.example        (환경변수 템플릿)
└── database/           # Tier 3 — DB 초기화 스크립트
    ├── init/           (SQL 스크립트 01~06)
    └── supabase/       (Supabase Local CLI 설정)
```

---

## 6. 핵심 데이터 흐름

### 6.1 소셜 로그인 흐름

```
사용자 클릭
  → Frontend: /api/v1/auth/{provider} 리다이렉트
  → Backend: Passport OAuth 처리
  → 소셜 플랫폼 인증
  → Backend: JWT 생성 → HttpOnly 쿠키 발급
  → Frontend: 쿠키 자동 저장 (JS 접근 불가 — XSS 방어)
```

### 6.2 지도 매물 탐색 흐름

```
사용자 지도 이동/줌
  → Frontend: /api/v1/properties/map?ne=&sw= 호출
  → Backend: PostGIS ST_Within 쿼리
  → DB: geometry(Point, 4326) 인덱스(GIST) 스캔
  → Frontend: 마커 렌더링 / 클릭 시 슬라이딩 패널 표시
```

### 6.3 공공데이터 최신화 흐름

```
최초 서비스 오픈 전
  → database/init/ SQL 스크립트로 건축물대장 일괄 적재
  → psql \copy 명령으로 CSV → building_info, floor_status 테이블 삽입

주기적 갱신 (매주 일요일 새벽 3시)
  → NestJS CRON 스케줄러 작동
  → child_process → psql \copy 실행
  → 스테이징 테이블 → 운영 테이블 UPSERT
```

---

## 7. 보안 설계 원칙

| 영역 | 설계 |
|---|---|
| **JWT 토큰 보관** | HttpOnly + Secure + SameSite 쿠키 (JS 접근 불가) |
| **CORS** | backend main.ts에서 FRONTEND_URL만 화이트리스트 허용, `credentials: true` |
| **환경변수** | 모든 시크릿은 `.env` 또는 GitHub Secrets 관리, 코드 커밋 금지 |
| **역할 기반 접근** | `USER / PREMIUM_BASIC / PREMIUM_PLUS / ADMIN` 4단계 권한 |
| **파일 업로드** | Multer(백엔드 검증) + Supabase Storage RLS 정책 이중 방어 |
| **공공데이터 부하** | 실시간 프록시 대신 CRON 캐싱 적재로 Rate Limit 회피 |

---

## 8. 명명 규칙 통일 원칙

프로젝트 전반에서 **영어 명칭의 일관성**을 유지합니다.

| 영역 | 규칙 | 예시 |
|---|---|---|
| **DB 테이블명** | 소문자 스네이크케이스, **복수형** | `users`, `properties`, `reservations` |
| **DB 컬럼명** | 소문자 스네이크케이스 | `created_at`, `bld_nm`, `plat_area` |
| **API 경로** | 소문자, **복수형** (DB 테이블과 동일) | `/api/v1/users`, `/api/v1/properties` |
| **NestJS 모듈/폴더** | 소문자, **복수형** | `users/`, `properties/`, `reservations/` |
| **Prisma 모델명** | PascalCase, **단수형** | `User`, `Property`, `Reservation` |

> **핵심**: API 경로, DB 테이블, 백엔드 모듈 폴더 모두 **복수형**으로 통일합니다.
> Prisma 모델은 단수형이지만 `@@map()` 어노테이션으로 DB 테이블은 복수형으로 매핑합니다.

---

## 9. 관련 설계 문서 목록

| 문서 | 경로 |
|---|---|
| DB 스키마 설계 | [02-database-schema.md](./02-database-schema.md) |
| REST API 명세 | [03-api-spec.md](./03-api-spec.md) |
| 프론트엔드 구조 | [04-frontend-architecture.md](./04-frontend-architecture.md) |
| 인프라 및 CI/CD | [05-infra-cicd.md](./05-infra-cicd.md) |
| 개발 규칙/컨벤션 | [06-conventions.md](./06-conventions.md) |

### 가이드 문서

| 문서 | 경로 |
|---|---|
| 로컬 개발 환경 세팅 | [../guide/01-local-setup.md](../guide/01-local-setup.md) |
| OAuth 소셜 로그인 설정 | [../guide/02-oauth-setup.md](../guide/02-oauth-setup.md) |
| Supabase 설정 | [../guide/03-supabase-setup.md](../guide/03-supabase-setup.md) |
| 네이버 지도/검색 API 설정 | [../guide/04-naver-map-setup.md](../guide/04-naver-map-setup.md) |
| 공공데이터 배치 운영 | [../guide/05-public-data-batch.md](../guide/05-public-data-batch.md) |
| 배포 가이드 | [../guide/06-deployment.md](../guide/06-deployment.md) |
