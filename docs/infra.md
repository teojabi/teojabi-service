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
  4. Next.js 빌드 (`npm run build`) -> 정적 파일 생성 (Porkbun 호스팅 조건에 맞춤)
  5. FTP 또는 SSH를 통해 Porkbun 웹 호스팅 서버로 빌드 결과물 배포

### 2. 백엔드 워크플로우 (`.github/workflows/backend-deploy.yml`)
- **트리거**: `main` 브랜치의 `backend/**` 경로에 변경사항이 푸시될 때 실행
- **프로세스**:
  - (현재 백엔드 호스팅 환경 미정이므로, 테스트 환경 구축 시 구체화 예정)
  1. 저장소 체크아웃
  2. Node.js 환경 세팅
  3. 의존성 설치 (`npm ci`)
  4. 테스트 코드 실행 및 빌드

## 인프라 호스팅 구성

- **프론트엔드**: Porkbun 웹 호스팅
  - Next.js의 정적 내보내기(Static Export - `output: 'export'`) 기능을 활용해 배포하거나, Porkbun에서 Node.js를 지원할 경우 서버 사이드 렌더링(SSR) 유지
- **백엔드**: (논의 중)
- **데이터베이스**: (논의 중)
