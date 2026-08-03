# CI/CD 및 인프라 설계 명세

이 문서는 터잡이 서비스의 배포 파이프라인(CI/CD)과 인프라 호스팅 아키텍처를 정의합니다.

---

## 1. 인프라 호스팅 구성

```
┌─────────────────────────────────────────────────────────┐
│  사용자 브라우저                                          │
│  https://www.teojabi.com                                 │
└──────────┬──────────────────────┬───────────────────────┘
           │ 정적 파일             │ REST API 호출
           ▼                      ▼
┌─────────────────┐    ┌──────────────────────────┐
│  Porkbun         │    │  NCP 서버                 │
│  (정적 호스팅)    │    │  (NestJS + PM2)           │
│  - HTML/CSS/JS   │    │  - Port: 3001             │
│  - FTP 배포      │    │  - SSH 배포               │
└─────────────────┘    └───────────┬──────────────┘
                                   │ Prisma ORM
                                   ▼
                       ┌──────────────────────────┐
                       │  Supabase                 │
                       │  - PostgreSQL + PostGIS   │
                       │  - Storage (이미지)        │
                       │  - Region: Seoul          │
                       └──────────────────────────┘
```

### 호스팅 상세

| 계층 | 호스팅 | 기술 스택 | 비고 |
|---|---|---|---|
| **프론트엔드** (Tier 1) | Porkbun (정적 호스팅) | HTML, CSS, Vanilla JS | 빌드 불필요, FTP 업로드 |
| **백엔드** (Tier 2) | NCP 서버 | NestJS, PM2, Swagger | SSH 접속 → git pull → 빌드 → PM2 재시작 |
| **데이터베이스** (Tier 3) | Supabase | PostgreSQL, PostGIS 3.3.2, Prisma | Seoul 리전, Storage 포함 |

---

## 2. CI/CD 파이프라인: GitHub Actions

프론트엔드와 백엔드를 **독립적으로** 빌드 및 배포합니다.
각 경로에 변경사항이 푸시될 때만 해당 워크플로우가 트리거됩니다.

### 2.1 프론트엔드 워크플로우 (`.github/workflows/frontend-deploy.yml`)

- **트리거**: `main` 브랜치의 `frontend/**` 경로 변경 시
- **프로세스**:
  1. 저장소 체크아웃
  2. FTP-Deploy-Action으로 `frontend/` 하위 정적 파일을 Porkbun 서버에 업로드

> **참고**: 프론트엔드는 순수 HTML/CSS/JS이므로 빌드 단계가 필요하지 않습니다. 워크플로우에서 빌드 관련 설정은 제거되어야 합니다.

### 2.2 백엔드 워크플로우 (`.github/workflows/backend-deploy.yml`)

- **트리거**: `main` 브랜치의 `backend/**` 경로 변경 시
- **프로세스**:
  1. NCP 서버로 SSH 접속 (GitHub Secrets 활용)
  2. 서버에서 `git pull origin main` 수행
  3. `npm install` → `npm run build`
  4. PM2 재시작 (`pm2 restart teojabi-backend`)

### 2.3 필수 GitHub Secrets 목록

| Secret 이름 | 용도 | 사용 워크플로우 |
|---|---|---|
| `FTP_SERVER` | Porkbun FTP 호스트 주소 | frontend-deploy |
| `FTP_USERNAME` | Porkbun FTP 사용자명 | frontend-deploy |
| `FTP_PASSWORD` | Porkbun FTP 비밀번호 | frontend-deploy |
| `NCP_SSH_HOST` | NCP 서버 IP 주소 | backend-deploy |
| `NCP_SSH_USER` | NCP 서버 SSH 사용자명 | backend-deploy |
| `NCP_SSH_KEY` | NCP 서버 SSH 비공개 키 | backend-deploy |
| `NAVER_MAP_CLIENT_ID` | 네이버 지도 SDK Client ID | frontend-deploy (config.js 생성) |

---

## 3. 환경별 설정

### 3.1 로컬 개발 환경

| 항목 | 값 |
|---|---|
| 프론트엔드 URL | `http://localhost:3000` |
| 백엔드 URL | `http://localhost:3001` |
| 데이터베이스 | Supabase Cloud |

### 3.2 운영 환경

| 항목 | 값 |
|---|---|
| 프론트엔드 URL | `https://www.teojabi.com` |
| 백엔드 URL | `https://api.teojabi.com` |
| 데이터베이스 | Supabase Cloud (Seoul 리전) |
