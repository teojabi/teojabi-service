# 터잡이 서비스 (Teojabi Service) 요구사항 및 정보 기록

이 문서는 멘토와 멘티 간의 대화를 바탕으로 프로젝트에 필요한 요소, 확인된 정보, 체크해야 할 기록 등을 지속적으로 업데이트하기 위한 용도로 작성되었습니다.

## 논의 중/확인된 항목

- [x] **API 연동을 위한 키 관리 방안**:
  - **공통 원칙**: 모든 시크릿, API 키 식별자, DB 접속 정보 등은 GitHub 원격 저장소 코드 내에 평문으로 커밋을 엄격히 금지함.
  - **프론트엔드 (Pure HTML/JS)**:
    - 클라이언트 노출 키(카카오 지도 SDK 키 등): 별도의 환경변수 파일 관리 대신 CI/CD나 빌드 주입/스크립트 내 하드코딩(보안 주의) 혹은 별도의 config.js 파일로 관리
    - 소셜 로그인 처리가 백엔드로 이관됨에 따라 프론트엔드는 단순 JWT 송수신 상태만 확인. **실제 토큰 관리는 HttpOnly, Secure, SameSite 속성이 적용된 보안 쿠키**를 백엔드에서 전담 발급하여 브라우저가 자동 관리하도록 위임
  - **백엔드 (NestJS)**:
    - 데이터베이스(Supabase) 접속 URI, 공공데이터 포털 API 인코딩/디코딩 키는 루트 `.env`를 통해 관리하고 `@nestjs/config` 패키지의 `ConfigService`로 타입 안정성을 부여하여 동적 주입
    - **CORS 설정**: 프론트엔드(Porkbun)와 백엔드(NCP) 도메인이 분리되어 있으므로, `main.ts`에 프론트엔드 도메인 화이트리스트 및 `credentials: true` 설정을 필수로 반영
  - **배포 환경 (CI/CD)**:
    - GitHub Actions: 프론트엔드 정적 호스팅(Porkbun) 배포용 FTP 시크릿(`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`)과 백엔드(NCP) 배포용 SSH 접속 정보는 **GitHub Repository Secrets**에 등록하여 Workflow에서만 접근 가능하도록 설정
    - 배포 서버: 네이버 클라우드 플랫폼(NCP) 등 호스팅 환경에 맞게 Product용 키를 `.env` 형식으로 주입
- [x] **주요 핵심 기능 정의**:
  1. 지번 주소를 키로 하는 부동산 컨설팅 매물 이미지 갤러리형 게시판
  2. 네이버 지도 서비스 기반 부동산 검색 및 매물 마커 표시
  3. 사용자 인터랙션 (상담 예약, 마이페이지/관심 매물 관리)
  4. 공공 API 연동: 실거래가, 공시지가 (공공데이터 포털) 및 토지이음 API (실시간 Proxy가 아닌 **서비스 DB에 주기적으로 적재 및 갱신(Caching)** 구조 적용하여 속도 보장)
  5. 인증 (Authentication): NestJS 백엔드(Passport.js)에서 네이버, 카카오, 구글 소셜 로그인을 전담하여 프론트엔드로 **HttpOnly 보안 쿠키** 발급
  6. 권한: 사용자별 권한 등급 및 콘텐츠 접근 제어
- [x] **데이터베이스 활용 고려사항**:
  - Supabase PostgreSQL에서 PostGIS 확장을 활용하여 지리/공간 정보(지도 마커) 쿼리 최적화

## 추가적인 체크 리스트

- [x] 3-Tier 기반 아키텍처 및 폴더 구조 세팅
- [x] 기술 스택 논의 및 결정 완료
  - **프론트엔드 (Frontend)**: HTML, CSS, Vanilla JS
  - **백엔드 (Backend)**: NestJS
  - **데이터베이스 (Database)**: PostgreSQL (Supabase)
- [x] 인프라 호스팅 및 CI/CD 파이프라인 논의 완료
  - **프론트엔드 호스팅**: Porkbun (정적 호스팅 및 FTP 배포)
  - **백엔드 호스팅**: 네이버 클라우드 플랫폼 (NCP) 서버
  - **데이터베이스 호스팅**: Supabase (PostgreSQL + PostGIS)
  - **CI/CD 플랫폼**: GitHub Actions (코드 푸시 시 Porkbun FTP 업로드 및 NCP 서버 SSH 갱신/빌드)

---

## Supabase 설정 가이드 (Database + Storage)

> 게시판 형태의 서비스 개발 시, Supabase의 PostgreSQL 데이터베이스와 스토리지(이미지 업로드)를 함께 사용하기 위한 단계별 가이드입니다.

---

### 1단계: Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 에 접속하여 **GitHub 계정으로 로그인**합니다.
2. 대시보드에서 **"New project"** 버튼을 클릭합니다.
3. 다음 항목을 입력합니다:
   - **Organization**: 본인 계정 또는 팀 선택
   - **Project name**: 예) `teojabi-service`
   - **Database Password**: 강력한 비밀번호 입력 (반드시 기록해 두세요)
   - **Region**: `Northeast Asia (Seoul)` 선택 → 국내 서비스는 Seoul이 가장 빠름
4. **"Create new project"** 클릭 후 프로비저닝이 완료될 때까지 약 1~2분 대기합니다.

---

### 2단계: 프로젝트 연결 정보(API Keys) 확인

1. 좌측 사이드바 → **"Project Settings"** → **"API"** 탭으로 이동합니다.
2. 아래 두 값을 복사해 둡니다:

   | 항목 | 용도 |
   |------|------|
   | `Project URL` | 백엔드에서 Supabase 연결 시 사용하는 Base URL |
   | `anon / public` 키 | 클라이언트/공개 요청용 (Row Level Security 적용 전제) |
   | `service_role` 키 | 서버 전용 (RLS 우회 가능, **절대 외부 노출 금지**) |

3. 백엔드 NestJS 프로젝트의 `.env` 파일에 아래와 같이 추가합니다:
   ```
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
   ```
   > ⚠️ `service_role` 키는 반드시 백엔드 서버에서만 사용하고, 프론트엔드 코드나 GitHub에 절대 노출하지 마세요.

---

### 3단계: 데이터베이스 테이블 생성

Supabase는 PostgreSQL을 사용하므로 SQL로 테이블을 직접 생성합니다.

1. 좌측 사이드바 → **"Table Editor"** 또는 **"SQL Editor"** 로 이동합니다.
2. **SQL Editor**에서 직접 쿼리로 생성하는 방법을 권장합니다 (버전 관리 용이):

**예시: 게시글 테이블 (posts)**
```sql
-- 게시글 테이블
CREATE TABLE posts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT,
  author_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url   TEXT,              -- Storage에 업로드한 이미지 URL 저장
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

3. **"Run"** 버튼을 클릭하여 테이블을 생성합니다.
4. 좌측 **"Table Editor"** 에서 생성된 테이블을 GUI로 확인할 수 있습니다.

---

### 4단계: Row Level Security (RLS) 설정

Supabase의 모든 테이블은 기본적으로 RLS가 활성화되어 있어 정책 없이는 데이터에 접근할 수 없습니다.  
게시판 서비스 기준의 기본 정책 예시입니다:

```sql
-- RLS 활성화
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 누구나 게시글 조회 가능 (공개 게시판)
CREATE POLICY "Anyone can read posts"
  ON posts FOR SELECT
  USING (true);

-- 로그인한 사용자만 게시글 작성 가능
CREATE POLICY "Authenticated users can insert"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 본인 게시글만 수정/삭제 가능
CREATE POLICY "Author can update their posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Author can delete their posts"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);
```

> 💡 NestJS 백엔드에서 `service_role` 키를 사용할 경우 RLS를 우회하므로, 백엔드에서 직접 권한 체크를 구현해야 합니다.

---

### 5단계: Storage 버킷 생성 (이미지 업로드용)

1. 좌측 사이드바 → **"Storage"** 탭으로 이동합니다.
2. **"New bucket"** 버튼 클릭 후 다음 설정:
   - **Bucket name**: `post-images` (영문 소문자, 하이픈 허용)
   - **Public bucket**: 게시판 이미지를 누구나 볼 수 있어야 한다면 **체크**, 비공개라면 해제
3. **"Create bucket"** 클릭으로 생성합니다.

**Storage 접근 정책 설정 (SQL)**

```sql
-- Storage 버킷 정책: 누구나 이미지 조회 가능 (public bucket인 경우)
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

-- 로그인한 사용자만 이미지 업로드 가능
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
  );

-- 본인이 업로드한 파일만 삭제 가능
CREATE POLICY "Uploader can delete their files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

> 💡 업로드 시 파일 경로를 `{user_id}/{filename}` 형태로 지정하면, 위 정책의 폴더명 기반 소유권 판별이 작동합니다.

---

### 6단계: NestJS 백엔드에서 Supabase 연동

**패키지 설치**
```bash
npm install @supabase/supabase-js
```

**Supabase 클라이언트 모듈 생성**

`src/supabase/supabase.service.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.client = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'), // 백엔드는 service_role 사용
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
```

**게시글 조회 예시**
```typescript
// posts.service.ts
async findAll() {
  const { data, error } = await this.supabaseService
    .getClient()
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
```

**이미지 업로드 예시**
```typescript
// posts.service.ts
async uploadImage(file: Express.Multer.File, userId: string) {
  const filePath = `${userId}/${Date.now()}_${file.originalname}`;

  const { data, error } = await this.supabaseService
    .getClient()
    .storage
    .from('post-images')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(error.message);

  // 업로드된 파일의 Public URL 반환
  const { data: urlData } = this.supabaseService
    .getClient()
    .storage
    .from('post-images')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}
```

---

### 7단계: 로컬 개발 환경에서 Supabase 사용하기 (선택)

클라우드 Supabase를 그대로 로컬 개발에 사용해도 무방하지만, 완전한 로컬 환경이 필요하면 **Supabase CLI**를 사용합니다.

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 초기화 (최초 1회)
supabase init

# 로컬 Supabase 실행 (Docker 필요)
supabase start

# 로컬 실행 후 출력되는 URL과 키를 .env.local에 적용
# API URL: http://localhost:54321
# anon key: (출력된 값 복사)
```

> 💡 로컬에서는 클라우드와 별개의 DB/스토리지 인스턴스가 실행되므로, 스키마 마이그레이션 파일(`supabase/migrations/`)로 관리하면 팀 협업 시 일관성을 유지할 수 있습니다.

---

### 요약: 체크리스트

- [ ] Supabase 프로젝트 생성 및 Seoul 리전 선택
- [ ] API Keys (URL, anon key, service_role key) 확인 및 `.env`에 등록
- [ ] SQL Editor에서 필요한 테이블 생성
- [ ] RLS(Row Level Security) 정책 설정
- [ ] Storage 버킷 생성 (`post-images` 등) 및 접근 정책 설정
- [ ] NestJS에 `@supabase/supabase-js` 패키지 설치 및 `SupabaseService` 모듈 생성
- [ ] 게시글 CRUD 및 이미지 업로드 API 구현
- [ ] (선택) Supabase CLI로 로컬 개발 환경 구성 및 migration 파일 관리
