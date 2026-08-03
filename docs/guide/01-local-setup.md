# 로컬 개발 환경 세팅 가이드

이 문서는 터잡이 서비스를 로컬에서 개발하기 위한 환경 구축 과정을 순서대로 안내합니다.

---

## 사전 요구사항

| 소프트웨어 | 최소 버전 | 확인 명령어 |
|---|---|---|
| Node.js | v20.x 이상 | `node -v` |
| npm | v10.x 이상 | `npm -v` |
| Git | 최신 | `git --version` |


---

## 1단계: 저장소 클론

```bash
git clone https://github.com/{organization}/teojabi-service.git
cd teojabi-service
```

---

## 2단계: 백엔드 환경 설정

### 2.1 의존성 설치

```bash
cd backend
npm install
```

### 2.2 환경변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

`.env` 파일을 열고 아래 값들을 실제 발급받은 값으로 변경합니다.

```env
# DB 연결
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres"

# 서버 설정
PORT=3001
FRONTEND_URL="http://localhost:3000"

# JWT
JWT_SECRET="개발용_임의_문자열"

# Supabase
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"

# 소셜 로그인 (각 플랫폼 가이드 참조)
NAVER_CLIENT_ID="YOUR_NAVER_CLIENT_ID"
NAVER_CLIENT_SECRET="YOUR_NAVER_CLIENT_SECRET"
NAVER_CALLBACK_URL="http://localhost:3001/api/v1/auth/naver/callback"

KAKAO_CLIENT_ID="YOUR_KAKAO_CLIENT_ID"
KAKAO_CLIENT_SECRET="YOUR_KAKAO_CLIENT_SECRET"
KAKAO_CALLBACK_URL="http://localhost:3001/api/v1/auth/kakao/callback"

GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_CALLBACK_URL="http://localhost:3001/api/v1/auth/google/callback"
```

> ⚠️ `.env` 파일은 `.gitignore`에 포함되어 있으므로 Git에 커밋되지 않습니다. 소셜 로그인 키 발급은 [02-oauth-setup.md](./02-oauth-setup.md)를 참고하세요.

### 2.3 Prisma 클라이언트 생성

```bash
npx prisma generate
```

---

## 3단계: 프론트엔드 환경 설정

### 3.1 config.js 생성

`frontend/js/config.example.js`를 복사하여 `config.js`를 생성합니다.

```bash
cd ../frontend/js
cp config.example.js config.js
```

`config.js`를 열어 네이버 지도 API 키를 입력합니다.

```javascript
// frontend/js/config.js (Git 제외)
const CONFIG = {
    NAVER_MAP_CLIENT_ID: 'YOUR_NCP_CLIENT_ID',
};
```

> 네이버 지도 API 키 발급은 [04-naver-map-setup.md](./04-naver-map-setup.md)를 참고하세요.

---

## 4단계: 개발 서버 실행

### 4.1 백엔드 서버 실행

```bash
cd backend
npm run start:dev
```

정상 실행 시 다음 URL에서 접근 가능합니다:
- **API 서버**: `http://localhost:3001`
- **Swagger 문서**: `http://localhost:3001/api/docs`

### 4.2 프론트엔드 서버 실행

프론트엔드는 순수 HTML/CSS/JS이므로 별도의 빌드가 필요 없습니다.
정적 파일 서버를 사용합니다.

```bash
cd frontend

# 방법 1: npx 사용
npx serve -l 3000

# 방법 2: Python 사용
python -m http.server 3000

# 방법 3: VS Code Live Server 확장
# index.html을 우클릭 → Open with Live Server
```

정상 실행 시 `http://localhost:3000`에서 접근 가능합니다.

---

## 5단계: 데이터베이스 확인 (선택)

### Supabase Cloud 사용 시

`.env`의 `DATABASE_URL`에 Supabase 대시보드의 연결 문자열을 입력하면 바로 사용 가능합니다.

---

## 포트 요약

| 서비스 | 포트 | URL |
|---|---|---|
| 프론트엔드 | 3000 | `http://localhost:3000` |
| 백엔드 (NestJS) | 3001 | `http://localhost:3001` |
| Swagger 문서 | 3001 | `http://localhost:3001/api/docs` |
