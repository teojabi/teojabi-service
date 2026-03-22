# 소셜 로그인 (OAuth 2.0) 설정 가이드

본 문서는 터잡이 서비스의 소셜 로그인(카카오, 네이버, 구글) 기능 연동을 위해 각 플랫폼에서 앱을 등록하고 API 키를 발급받는 과정을 순서대로 안내합니다.

---

## 1. 앱 등록 관리 전략 (로컬 vs 운영)

### 권장: 개발용 / 운영용 앱 분리

각 플랫폼에서 **개발용**과 **운영용** 앱을 따로 생성하여 환경을 분리합니다.

| 환경 | 앱 이름 (예시) | 키 관리 위치 |
|---|---|---|
| **운영용** | `터잡이` | **GitHub Secrets** (CI/CD 배포 시 주입) |
| **개발용** | `터잡이 (개발용)` | 로컬 `.env` 파일 (`.gitignore` 처리) |

**장점**: 개발 중 설정 변경이 운영에 영향을 주지 않아 안전합니다. 통계/에러 로그도 분리됩니다.

### 간편한 방법: 단일 앱에 주소 추가

하나의 앱에 로컬 주소와 운영 주소를 모두 등록하여 사용합니다.
관리는 편하지만, 개발 중 설정 실수가 운영에 영향을 줄 수 있습니다.

---

## 2. 카카오 (Kakao) 설정

> 💡 카카오 디벨로퍼스가 2025년 12월에 대규모 개편되었습니다. 아래는 최신 UI 기준입니다.

### 2.1 앱 생성 및 키 복사

1. [카카오 디벨로퍼스](https://developers.kakao.com/) 접속 → **[내 애플리케이션]** → **[애플리케이션 추가하기]** (이름: 터잡이)
2. 앱 클릭 → 좌측 **[앱] → [플랫폼 키]** → **[REST API 키]** 복사
3. `.env` 파일에 저장:
   ```env
   KAKAO_CLIENT_ID="복사한_REST_API_키"
   ```

### 2.2 사이트 도메인 등록

1. **[앱] → [플랫폼 키]** → **[JavaScript 키]** 클릭
2. **[사이트 도메인]** 등록:
   - `http://localhost:3000`
   - `http://localhost:3001`

### 2.3 Redirect URI 등록

1. **[앱] → [플랫폼 키]** → **[REST API 키]** 클릭
2. **[리다이렉트 URI]** 등록:
   ```
   http://localhost:3001/api/v1/auth/kakao/callback
   ```

### 2.4 카카오 로그인 활성화

1. **[제품 설정] → [카카오 로그인]** → **[활성화 설정]** → **ON**

### 2.5 Client Secret 확인

1. **[앱] → [플랫폼 키]** → **[REST 무빙 키]** 클릭
2. **[Client Secret]** 값을 `.env`에 저장:
   ```env
   KAKAO_CLIENT_SECRET="복사한_Client_Secret"
   ```

### 2.6 동의항목 설정

1. **[제품 설정] → [카카오 로그인] → [동의항목]**
2. 프로필 정보(닉네임/사진), 카카오계정(이메일) → **[필수 동의]** 설정

---

## 3. 네이버 (Naver) 설정

### 3.1 앱 생성

1. [네이버 디벨로퍼스](https://developers.naver.com/) 접속
2. **[Application]** → **[애플리케이션 등록]** (이름: 터잡이)

### 3.2 환경 설정

| 항목 | 값 |
|---|---|
| 사용 API | **[네이버 로그인]** 선택 (이름, 이메일 [필수]) |
| 환경 | **[PC 웹]** |
| 서비스 URL | `http://localhost:3000` |
| Callback URL | `http://localhost:3001/api/v1/auth/naver/callback` |

### 3.3 키 복사

완료 화면에 나타나는 값을 `.env`에 저장:

```env
NAVER_CLIENT_ID="복사한_Client_ID"
NAVER_CLIENT_SECRET="복사한_Client_Secret"
```

---

## 4. 구글 (Google) 설정

> 💡 구글 클라우드 콘솔의 OAuth 메뉴가 2024~2025년 개편되었습니다. 기존 'API 및 서비스' 대신 **Google Auth Platform**을 사용합니다.

### 4.1 프로젝트 생성

1. [구글 클라우드 콘솔](https://console.cloud.google.com/) 접속
2. 상단 프로젝트 선택 바 → **[새 프로젝트]** (이름: Teojabi)

### 4.2 OAuth 동의 화면 구성

1. 좌측 메뉴(☰) → **[Google Auth Platform]** 클릭
2. **[브랜딩(Branding)]** 또는 **[개요 → 시작하기]** 클릭
3. User Type: **외부(External)** 선택
4. 앱 이름(터잡이) 및 지원 이메일 입력 후 저장
5. **중요**: **[앱 게시]**를 눌러 "테스트" → "프로덕션" 상태로 변경

### 4.3 클라이언트 생성

1. **[Google Auth Platform] → [클라이언트(Clients)]** 클릭
2. **[클라이언트 만들기]** → 유형: **웹 애플리케이션**
3. 설정:

| 항목 | 값 |
|---|---|
| 승인된 자바스크립트 원본 | `http://localhost:3000` |
| 승인된 리디렉션 URI | `http://localhost:3001/api/v1/auth/google/callback` |

4. **[만들기]** 클릭

### 4.4 키 복사

생성 후 나타나는 값을 `.env`에 저장:

```env
GOOGLE_CLIENT_ID="복사한_Client_ID"
GOOGLE_CLIENT_SECRET="복사한_Client_Secret"
```

---

## 5. 최종 환경변수 체크리스트

`.env` 파일에 아래 항목이 모두 설정되어 있는지 확인합니다.

```env
# 카카오
KAKAO_CLIENT_ID="..."
KAKAO_CLIENT_SECRET="..."
KAKAO_CALLBACK_URL="http://localhost:3001/api/v1/auth/kakao/callback"

# 네이버
NAVER_CLIENT_ID="..."
NAVER_CLIENT_SECRET="..."
NAVER_CALLBACK_URL="http://localhost:3001/api/v1/auth/naver/callback"

# 구글
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALLBACK_URL="http://localhost:3001/api/v1/auth/google/callback"
```
