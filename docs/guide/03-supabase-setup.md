# Supabase 설정 가이드 (Database + Storage)

게시판 형태의 서비스 개발 시, Supabase의 PostgreSQL 데이터베이스와 스토리지(이미지 업로드)를 함께 사용하기 위한 단계별 가이드입니다.

---

## 1단계: Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 에 접속하여 **GitHub 계정으로 로그인**합니다.
2. 대시보드에서 **"New project"** 버튼을 클릭합니다.
3. 다음 항목을 입력합니다:
   - **Organization**: 본인 계정 또는 팀 선택
   - **Project name**: `teojabi-service`
   - **Database Password**: 강력한 비밀번호 입력 (반드시 기록)
   - **Region**: `Northeast Asia (Seoul)` 선택
4. **"Create new project"** 클릭 후 약 1~2분 대기합니다.

---

## 2단계: API Keys 확인 및 `.env` 설정

1. 좌측 사이드바 → **"Project Settings"** → **"API"** 탭으로 이동합니다.
2. 아래 값을 복사합니다:

| 항목 | 용도 |
|---|---|
| `Project URL` | Supabase 연결 Base URL |
| `anon / public` 키 | 클라이언트/공개 요청용 (RLS 적용 전제) |
| `service_role` 키 | 서버 전용 (RLS 우회 가능, **외부 노출 절대 금지**) |

3. `backend/.env`에 추가합니다:
   ```env
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
   ```

> ⚠️ `service_role` 키는 백엔드 서버에서만 사용하고, 프론트엔드 코드나 GitHub에 절대 노출하지 마세요.

---

## 3단계: 데이터베이스 테이블 생성

SQL Editor에서 쿼리로 테이블을 생성합니다. (버전 관리 용이)

1. 좌측 사이드바 → **"SQL Editor"** 이동
2. 프로젝트의 `database/init/` 폴더에 있는 SQL 스크립트를 순서대로 실행:
   - `01-schema.sql` → 기본 테이블 생성
   - `02-public-data.sql` → 공공데이터 및 건축물대장 테이블
3. **"Run"** 버튼 → **"Table Editor"** 에서 생성 확인

---

## 4단계: Row Level Security (RLS) 설정

게시판 서비스 기준 기본 정책:

```sql
-- RLS 활성화
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- 누구나 조회 가능 (공개 게시판)
CREATE POLICY "Anyone can read properties"
  ON properties FOR SELECT
  USING (true);

-- 로그인한 사용자만 작성 가능
CREATE POLICY "Authenticated users can insert"
  ON properties FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 본인 게시글만 수정/삭제 가능
CREATE POLICY "Owner can update their properties"
  ON properties FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owner can delete their properties"
  ON properties FOR DELETE
  USING (auth.uid() = owner_id);
```

> 💡 NestJS 백엔드에서 `service_role` 키를 사용할 경우 RLS를 우회하므로, 백엔드에서 별도 권한 체크를 구현해야 합니다.

---

## 5단계: Storage 버킷 생성 (이미지 업로드용)

1. 좌측 사이드바 → **"Storage"** 탭 이동
2. **"New bucket"** 클릭:
   - **Bucket name**: `post-images`
   - **Public bucket**: ✅ 체크 (갤러리 이미지 공개 조회용)
3. **"Create bucket"** 클릭

### Storage 접근 정책 설정

```sql
-- 누구나 이미지 조회 가능
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

-- 로그인한 사용자만 업로드 가능
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
  );

-- 본인 파일만 삭제 가능
CREATE POLICY "Uploader can delete their files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

> 💡 업로드 시 파일 경로를 `{user_id}/{filename}` 형태로 지정하면 폴더명 기반 소유권 판별이 작동합니다.

---

## 6단계: NestJS 백엔드에서 Supabase 연동

### 패키지 설치

```bash
npm install @supabase/supabase-js
```

### Supabase 클라이언트 서비스

`src/supabase/supabase.service.ts`:

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
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
```

### 이미지 업로드 예시

```typescript
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

  const { data: urlData } = this.supabaseService
    .getClient()
    .storage
    .from('post-images')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}
```

---

## 체크리스트

- [ ] Supabase 프로젝트 생성 (Seoul 리전)
- [ ] API Keys 확인 → `.env` 등록
- [ ] SQL Editor에서 테이블 생성
- [ ] RLS 정책 설정
- [ ] `post-images` Storage 버킷 생성
- [ ] NestJS에 `@supabase/supabase-js` 설치 및 서비스 구현
