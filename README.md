# 터잡이 서비스 (Teojabi Service)

부동산 컨설팅 매물을 지도 기반으로 탐색하고, 공공데이터(건축물대장·토지대장·공시지가)와 결합하여 실질적인 부동산 정보를 제공하는 웹 서비스입니다.

## 기술 스택

| 계층 | 기술 |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | NestJS, TypeScript, Passport.js, Swagger |
| **Database** | PostgreSQL (Supabase), Prisma ORM, PostGIS 3.3.2 |
| **인증** | JWT (HttpOnly 쿠키), OAuth 2.0 (네이버·카카오·구글) |
| **지도** | 네이버 지도 API v3 |
| **배포** | Frontend: Porkbun (FTP) / Backend: NCP (PM2) / CI/CD: GitHub Actions |

## 프로젝트 구조

```
teojabi-service/
├── frontend/           # Tier 1 — 정적 프론트엔드 (HTML/CSS/JS)
├── backend/            # Tier 2 — NestJS 백엔드 (REST API)
├── database/           # Tier 3 — DB 초기화 스크립트 및 CSV 데이터
└── docs/               # 프로젝트 문서
    ├── design/         # 설계 문서
    └── guide/          # 가이드 문서
```

## 문서

### 설계 문서 (`docs/design/`)

| # | 문서 | 내용 |
|---|---|---|
| 01 | [프로젝트 개요](docs/design/01-overview.md) | 서비스 소개, 3-Tier 아키텍처, 기술 스택, 보안 원칙, 명명 규칙 |
| 02 | [DB 스키마 설계](docs/design/02-database-schema.md) | Prisma 모델 정의, PostGIS 연동, 테이블 관계도 |
| 03 | [REST API 명세](docs/design/03-api-spec.md) | 인증·매물·공공데이터·예약 API 엔드포인트 |
| 04 | [프론트엔드 구조](docs/design/04-frontend-architecture.md) | 디렉토리 구조, 6개 화면 설계, UI/UX 원칙 |
| 05 | [인프라 및 CI/CD](docs/design/05-infra-cicd.md) | 호스팅 구성, GitHub Actions 파이프라인, 환경 설정 |
| 06 | [개발 컨벤션](docs/design/06-conventions.md) | 코드·DB 명명 규칙, 브랜치 전략, 커밋 메시지 규칙 |

### 가이드 문서 (`docs/guide/`)

| # | 문서 | 내용 |
|---|---|---|
| 01 | [로컬 개발 환경 세팅](docs/guide/01-local-setup.md) | Node.js, 환경변수, 프론트/백엔드 실행 방법 |
| 02 | [OAuth 소셜 로그인 설정](docs/guide/02-oauth-setup.md) | 카카오·네이버·구글 앱 등록 및 키 발급 |
| 03 | [Supabase 설정](docs/guide/03-supabase-setup.md) | 프로젝트 생성, RLS, Storage 버킷, NestJS 연동 |
| 04 | [네이버 지도 v3 설정](docs/guide/04-naver-map-setup.md) | Maps JS API v3 발급, SDK 로드, 검색 API 프록시 |
| 05 | [공공데이터 배치 운영](docs/guide/05-public-data-batch.md) | CSV 벌크 로드, 스테이징 테이블, CRON 스케줄러 |
| 06 | [배포 가이드](docs/guide/06-deployment.md) | Porkbun FTP, NCP SSH, GitHub Actions 자동 배포 |

## 빠른 시작

```bash
# 1. 저장소 클론
git clone https://github.com/{organization}/teojabi-service.git
cd teojabi-service

# 2. 백엔드 설정 및 실행
cd backend
cp .env.example .env   # → .env 파일 편집 후 실제 값 입력
npm install
npx prisma generate
npm run start:dev      # http://localhost:3001

# 3. 프론트엔드 실행
cd ../frontend
npx serve -l 3000      # http://localhost:3000
```

> 상세한 환경 설정은 [로컬 개발 환경 세팅 가이드](docs/guide/01-local-setup.md)를 참고하세요.
