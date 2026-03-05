# CI/CD 및 인프라 설계 명세

이 문서는 터잡이 서비스의 배포 파이프라인(CI/CD)과 인프라 호스팅 아키텍처를 정의합니다.

## CI/CD 파이프라인: GitHub Actions
프론트엔드와 백엔드를 독립적으로 빌드 및 배포하기 위해 각각 별도의 워크플로우를 구성합니다.

### 1. 프론트엔드 워크플로우 (`.github/workflows/frontend-deploy.yml`)
- **트리거**: `main` 브랜치의 `frontend/**` 경로에 변경사항이 푸시될 때 실행
- **프로세스**: 
  1. 저장소 체크아웃
  2. Node.js 환경 세팅
  3. 의존성 설치 (`npm ci`)
  4. Next.js 빌드 (`npm run build`) -> 정적 파일 생성 (`output: 'export'`)
  5. GitHub Actions에서 FTP-Deploy-Action 등을 사용하여 Porkbun 서버로 빌드 결과물 자동 업로드

### 2. 백엔드 워크플로우 (`.github/workflows/backend-deploy.yml`)
- **트리거**: `main` 브랜치의 `backend/**` 경로에 변경사항이 푸시될 때 실행
- **프로세스**: GitHub Actions에서 Railway CLI(또는 Railway GitHub 통합 앱)를 활용해 자동으로 Docker 빌드 후 Railway 서버로 배포

## 인프라 호스팅 구성 및 기술 스택 상세

- **프론트엔드 (Tier 1)**: Porkbun 호스팅 (정적 웹 호스팅)
  - 프레임워크: Next.js 14 App Router, TypeScript (정적 내보내기 `output: 'export'` 필수)
  - UI 구성: Tailwind CSS, Shadcn/UI
  - 인증: 백엔드(NestJS)에서 발급한 JWT 쿠키/토큰 보관 및 Authorization 헤더 전송
- **백엔드 (Tier 2)**: Railway 호스팅
  - 프레임워크: NestJS, REST API 구조
  - 문서화: Swagger를 필수적으로 적용하여 모든 API 명세화
- **데이터베이스 (Tier 3)**: Supabase (PostgreSQL 호스팅)
  - ORM: Prisma
  - 특화 기능: 네이버 지도 마커 및 지리 정보 검색을 위한 **PostGIS** 확장 기능 사용
