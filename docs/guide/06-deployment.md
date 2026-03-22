# 배포 가이드

이 문서는 터잡이 서비스의 프론트엔드와 백엔드를 운영 환경에 배포하는 과정을 안내합니다.
GitHub Actions를 통한 자동 배포(CI/CD)를 기본으로 하며, 수동 배포 방법도 함께 설명합니다.

---

## 1. 배포 아키텍처 요약

| 계층 | 호스팅 | 배포 방식 | 트리거 |
|---|---|---|---|
| **프론트엔드** | Porkbun (정적 호스팅) | FTP 업로드 | `main` 브랜치 `frontend/**` 변경 시 |
| **백엔드** | NCP 서버 | SSH → git pull → 빌드 → PM2 재시작 | `main` 브랜치 `backend/**` 변경 시 |

---

## 2. 사전 준비: GitHub Secrets 등록

GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** 에서 아래 시크릿을 등록합니다.

### 프론트엔드 배포용

| Secret 이름 | 설명 |
|---|---|
| `FTP_SERVER` | Porkbun FTP 서버 주소 |
| `FTP_USERNAME` | FTP 사용자명 |
| `FTP_PASSWORD` | FTP 비밀번호 |

### 백엔드 배포용

| Secret 이름 | 설명 |
|---|---|
| `NCP_SSH_HOST` | NCP 서버 IP 주소 |
| `NCP_SSH_USER` | SSH 접속 사용자명 |
| `NCP_SSH_KEY` | SSH 비공개 키 (PEM 형식) |

### 프론트엔드 빌드 시 주입 (선택)

| Secret 이름 | 설명 |
|---|---|
| `NAVER_MAP_CLIENT_ID` | 네이버 지도 SDK Client ID (config.js 자동 생성용) |

---

## 3. 프론트엔드 자동 배포

### 3.1 워크플로우: `.github/workflows/frontend-deploy.yml`

```yaml
name: Deploy Frontend to Porkbun

on:
  push:
    branches: [ "main" ]
    paths:
      - 'frontend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Upload to Porkbun via FTP
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          local-dir: ./frontend/
          server-dir: /public_html/
```

> **참고**: 프론트엔드는 순수 HTML/CSS/JS이므로 빌드 단계가 필요 없습니다. 정적 파일을 FTP로 직접 업로드합니다.

### 3.2 수동 배포

FTP 클라이언트(FileZilla 등)로 `frontend/` 폴더의 파일들을 Porkbun 서버의 `/public_html/` 경로에 업로드합니다.

---

## 4. 백엔드 자동 배포

### 4.1 워크플로우: `.github/workflows/backend-deploy.yml`

```yaml
name: Deploy Backend to NCP

on:
  push:
    branches: [ "main" ]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Deploy to NCP via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.NCP_SSH_HOST }}
          username: ${{ secrets.NCP_SSH_USER }}
          key: ${{ secrets.NCP_SSH_KEY }}
          script: |
            cd /path/to/teojabi-service/backend
            git pull origin main
            npm install
            npm run build
            pm2 restart teojabi-backend
```

### 4.2 NCP 서버 초기 설정 (최초 1회)

NCP 서버에 처음 배포할 때 아래 설정이 필요합니다:

```bash
# 1. Node.js 설치 (nvm 권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 20
nvm use 20

# 2. PM2 전역 설치
npm install -g pm2

# 3. 저장소 클론
git clone https://github.com/{organization}/teojabi-service.git
cd teojabi-service/backend

# 4. 의존성 설치 및 빌드
npm install
npm run build

# 5. 환경변수 설정
cp .env.example .env
# .env 파일 편집 → 운영 환경 값 입력

# 6. PM2로 서비스 시작
pm2 start dist/main.js --name teojabi-backend
pm2 save
pm2 startup  # 서버 재부팅 시 자동 시작 설정
```

### 4.3 수동 배포

NCP 서버에 SSH 접속 후 아래 명령어를 실행합니다:

```bash
cd /path/to/teojabi-service/backend
git pull origin main
npm install
npm run build
pm2 restart teojabi-backend
```

---

## 5. 배포 확인

### 프론트엔드
- `https://www.teojabi.com` 접속 → HTML 페이지 정상 로드 확인

### 백엔드
- `https://api.teojabi.com/api/docs` 접속 → Swagger 문서 표시 확인
- `https://api.teojabi.com/api/v1/properties` → API 응답 확인

---

## 6. 운영 환경 체크리스트

- [ ] GitHub Secrets에 FTP/SSH 시크릿 등록 완료
- [ ] NCP 서버에 Node.js, PM2 설치 완료
- [ ] 운영 `.env` 파일에 실제 키 값 설정 완료
- [ ] CORS 설정에 운영 프론트엔드 도메인(`https://www.teojabi.com`) 추가
- [ ] SSL/HTTPS 인증서 적용 완료
- [ ] PM2 자동 시작(startup) 설정 완료
