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

### 백엔드 환경변수 (운영서버 .env 자동 생성용)

| Secret 이름 | 설명 |
|---|---|
| `DATABASE_URL` | 운영 DB 연결 문자열 (PostgreSQL, Supabase Connection Pooler) |
| `DIRECT_URL` | DB 직접 연결 URL (Prisma migrate/db push 전용) |
| `PORT` | 백엔드 서버 포트 |
| `FRONTEND_URL` | 운영 프론트엔드 URL (CORS 등) |
| `JWT_SECRET` | JWT 인증 시크릿 키 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | Supabase Anonymous Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `SUPABASE_BUCKET` | Supabase Storage 버킷명 |
| `NAVER_CLIENT_ID` | 네이버 소셜 로그인 Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 소셜 로그인 Client Secret |
| `NAVER_CALLBACK_URL` | 네이버 소셜 로그인 콜백 URL (운영) |
| `KAKAO_CLIENT_ID` | 카카오 소셜 로그인 Client ID |
| `KAKAO_CLIENT_SECRET` | 카카오 소셜 로그인 Client Secret |
| `KAKAO_CALLBACK_URL` | 카카오 소셜 로그인 콜백 URL (운영) |
| `GOOGLE_CLIENT_ID` | 구글 소셜 로그인 Client ID |
| `GOOGLE_CLIENT_SECRET` | 구글 소셜 로그인 Client Secret |
| `GOOGLE_CALLBACK_URL` | 구글 소셜 로그인 콜백 URL (운영) |

### 프론트엔드 빌드 시 주입

| Secret 이름 | 설명 |
|---|---|
| `API_BASE_URL` | 백엔드 API 기본 URL (config.js 자동 생성용) |
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
          server-dir: /
```

> **참고**: 프론트엔드는 순수 HTML/CSS/JS이므로 빌드 단계가 필요 없습니다. 정적 파일을 FTP로 직접 업로드합니다.

### 3.2 수동 배포

FTP 클라이언트(FileZilla 등)로 `frontend/` 폴더의 파일들을 Porkbun 서버의 `/` 경로에 업로드합니다.

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
            cd ~/teojabi-service/backend
            git pull origin main
            npm install
            npx prisma generate
            npm run build
            pm2 restart teojabi-backend
```

### 4.2 NCP 서버 초기 설정 (최초 1회)

NCP 서버에 처음 배포할 때 아래 단계를 **순서대로** 진행합니다.

#### Step 1. Node.js 설치

```bash
# nvm 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# 터미널을 새로 열거나 아래 명령어로 nvm 활성화
source ~/.bashrc

# Node.js 20 설치 및 사용
nvm install 20
nvm use 20

# 설치 확인
node -v   # v20.x.x 출력되면 성공
npm -v    # 10.x.x 출력되면 성공
```

#### Step 2. PM2 전역 설치

```bash
npm install -g pm2

# 설치 확인
pm2 -v   # 버전 출력되면 성공
```

#### Step 3. GitHub 저장소 클론을 위한 SSH Deploy Key 설정

GitHub는 비밀번호 인증을 지원하지 않으므로, SSH 키를 등록해야 합니다.

**3-1. NCP 서버에서 SSH 키 생성**

```bash
ssh-keygen -t ed25519 -C "teojabi@gmail.com" -f ~/.ssh/id_ed25519 -N ""
```

- `-N ""`: 패스프레이즈 없이 생성 (자동배포에 필수)
- 이미 키가 있다면 덮어쓸지 묻습니다. 기존 키가 없으면 그대로 진행합니다.

**3-2. 생성된 공개키 확인 및 복사**

```bash
cat ~/.ssh/id_ed25519.pub
```

출력된 내용 전체(`ssh-ed25519 AAAA...`)를 복사합니다.

**3-3. GitHub에 Deploy Key 등록**

1. 브라우저에서 GitHub 저장소 페이지로 이동
2. **Settings** 탭 클릭
3. 왼쪽 메뉴에서 **Deploy keys** 클릭
4. **Add deploy key** 버튼 클릭
5. 아래와 같이 입력:
   - **Title**: `NCP Server` (자유롭게 작성)
   - **Key**: 위에서 복사한 공개키 붙여넣기
   - **Allow write access**: 체크 해제 (읽기 전용이면 충분)
6. **Add key** 버튼 클릭

**3-4. GitHub SSH 호스트 등록**

```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

> 이 단계를 건너뛰면 첫 접속 시 `Are you sure you want to continue connecting?` 프롬프트가 뜨면서 자동배포가 멈춥니다.

**3-5. SSH 연결 테스트**

```bash
ssh -T git@github.com
```

아래와 같은 메시지가 나오면 성공입니다:
```
Hi teojabi/teojabi-service! You've successfully authenticated, but GitHub does not provide shell access.
```

#### Step 4. 저장소 클론

> **중요**: 반드시 SSH URL(`git@github.com:...`)을 사용합니다. HTTPS URL은 동작하지 않습니다.

```bash
cd ~
git clone git@github.com:teojabi/teojabi-service.git
```

클론이 완료되면 디렉토리를 확인합니다:
```bash
ls teojabi-service/
# backend  database  docs  frontend  README.md 등이 보이면 성공
```

#### Step 5. 백엔드 의존성 설치 및 빌드

```bash
cd ~/teojabi-service/backend
npm install
npx prisma generate
npm run build
```

#### Step 6. 환경변수 설정

```bash
cp .env.example .env
nano .env   # 또는 vi .env
```

`.env` 파일을 열어 운영 환경에 맞는 실제 값을 입력합니다.
(자동배포가 활성화되면 GitHub Secrets에서 `.env`가 자동 생성되므로, 이 단계는 최초 수동 실행 시에만 필요합니다.)

#### Step 7. PM2로 서비스 시작

```bash
cd ~/teojabi-service/backend
pm2 start dist/main.js --name teojabi-backend

# 현재 상태 확인 — status가 "online"이면 성공
pm2 status

# 서버 재부팅 시 자동 시작 설정
pm2 save
pm2 startup
```

`pm2 startup` 실행 후 출력되는 명령어(예: `sudo env PATH=... pm2 startup systemd ...`)를 **그대로 복사하여 실행**합니다.

### 4.3 수동 배포

NCP 서버에 SSH 접속 후 아래 명령어를 실행합니다:

```bash
cd ~/teojabi-service/backend
git pull origin main
npm install
npx prisma generate
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
- [ ] NCP 서버에 SSH Deploy Key 등록 및 저장소 클론 완료
- [ ] NCP 서버에 Node.js, PM2 설치 완료
- [ ] 운영 `.env` 파일에 실제 키 값 설정 완료
- [ ] CORS 설정에 운영 프론트엔드 도메인(`https://www.teojabi.com`) 추가
- [ ] SSL/HTTPS 인증서 적용 완료
- [ ] PM2 자동 시작(startup) 설정 완료
