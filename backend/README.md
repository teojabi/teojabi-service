# 터잡이 백엔드 (Teojabi Backend)

터잡이 서비스의 백엔드 API 서버입니다.

## 기술 스택

- **Framework**: NestJS 10 (TypeScript)
- **ORM**: Prisma
- **Database**: PostgreSQL (Supabase)
- **인증**: JWT + 소셜 로그인 (네이버, 카카오, 구글)
- **파일 저장소**: Supabase Storage
- **프로세스 관리**: PM2
- **배포**: NCP 서버 (GitHub Actions CI/CD)

## 프로젝트 구조

```
src/
├── auth/           # 인증 (JWT, 소셜 로그인, Guards, Strategies)
├── users/          # 사용자 관리
├── properties/     # 매물 관리
├── reservations/   # 예약 관리
├── favorites/      # 즐겨찾기
├── public-data/    # 공공데이터 연동
├── prisma/         # Prisma 서비스
├── supabase/       # Supabase 연동 (Storage 등)
├── app.module.ts
└── main.ts
```

## 시작하기

### 사전 요구사항

- Node.js 20+
- npm 10+
- PostgreSQL (또는 Supabase 프로젝트)

### 환경변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 값을 채웁니다:

```bash
cp .env.example .env
```

주요 환경변수:

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | DB 연결 문자열 (Supabase Connection Pooler) |
| `DIRECT_URL` | DB 직접 연결 URL (Prisma migrate 전용) |
| `PORT` | 서버 포트 (기본: 3001) |
| `FRONTEND_URL` | 프론트엔드 URL (CORS) |
| `JWT_SECRET` | JWT 시크릿 키 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | Supabase Anonymous Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `SUPABASE_BUCKET` | Supabase Storage 버킷명 |

### 설치 및 실행

```bash
# 의존성 설치
npm install

# Prisma 클라이언트 생성
npx prisma generate

# 개발 모드 실행 (watch mode)
npm run start:dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행 (로컬 테스트용)
npm run start:prod
```

> **⚠️ 운영 서버(NCP)에서는 `npm run start:prod`가 아닌 PM2로 실행합니다.**
> PM2는 프로세스 자동 재시작, 로그 관리, 클러스터 모드 등을 지원하여 안정적인 운영이 가능합니다.
>
> ```bash
> # 최초 실행
> pm2 start dist/main.js --name teojabi-backend
>
> # 재시작 (배포 시)
> pm2 restart teojabi-backend
>
> # 상태 확인
> pm2 status
>
> # 로그 확인
> pm2 logs teojabi-backend
> ```

### DB 마이그레이션

```bash
# 마이그레이션 실행
npx prisma migrate dev

# DB 스키마 확인
npx prisma studio
```

## API 문서

서버 실행 후 Swagger UI에서 API 문서를 확인할 수 있습니다:

```
http://localhost:3001/api
```

## 배포

배포 관련 상세 내용은 [배포 가이드](../docs/guide/06-deployment.md)를 참고하세요.

- `main` 브랜치의 `backend/**` 경로 변경 시 GitHub Actions를 통해 NCP 서버에 자동 배포됩니다.
- PM2로 프로세스를 관리합니다.
- NCP 자동배포 어렵다.
- 패스워드 방식 사용 시도
- 리스타트는 npx, pm2, 프록시 모두 재시작 해주자.
