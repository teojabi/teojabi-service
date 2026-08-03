# 프로젝트 개발 규칙 (Rules & Conventions)

이 문서는 3-Tier 시스템을 하나의 완성도 높은 서비스로 일관성 있게 개발하기 위한 협업 가이드라인입니다.

---

## 1. 코드 컨벤션 (Code Conventions)

### 1.1 포맷팅 자동화

프론트엔드와 백엔드 프로젝트 모두 린터(Linter)와 포매터(Formatter)를 필수로 도입합니다.

| 도구 | 설정 파일 | 용도 |
|---|---|---|
| **Prettier** | `.prettierrc` | 코드 포맷팅 통일 |
| **ESLint** | `.eslintrc.js` | 코드 품질 및 규칙 검사 |

### 1.2 명명 규칙 (Naming)

| 대상 | 규칙 | 예시 |
|---|---|---|
| 디렉토리 및 파일명 | 소문자 케밥 케이스(`kebab-case`) | `user-profile.js`, `login-modal.js` |
| 변수, 함수명 | 카멜 케이스(`camelCase`) | `getUserInfo()`, `propertyList` |
| 클래스 및 생성자 | 파스칼 케이스(`PascalCase`) | `AuthService`, `PropertyController` |
| 상수(Constant) | 대문자 스네이크 케이스(`UPPER_SNAKE_CASE`) | `MAX_FILE_SIZE`, `API_BASE_URL` |

### 1.3 데이터베이스 명명 규칙

> **DB 테이블명과 컬럼명은 반드시 소문자 스네이크케이스(`snake_case`)를 사용합니다.**

| 대상 | 규칙 | 예시 |
|---|---|---|
| **Prisma 모델명** | PascalCase, 단수형 | `User`, `Property` |
| **DB 테이블명** | snake_case, **복수형** | `users`, `properties`, `reservations` |
| **DB 컬럼명** | snake_case | `created_at`, `owner_id`, `bld_nm` |
| **FK 컬럼명** | `{참조테이블 단수}_id` | `user_id`, `property_id` |

Prisma 모델에서 `@@map()`과 `@map()` 어노테이션을 사용하여 코드(PascalCase/camelCase)와 DB(snake_case) 간 매핑을 수행합니다.

```prisma
// 예시
model User {
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("users")
}
```

### 1.4 영어 명칭 일관성

프론트엔드와 백엔드에서 동일한 영어 명칭을 사용하여 혼란을 방지합니다.

| 영역 | 통일 명칭 | ❌ 사용 금지 |
|---|---|---|
| API 경로 | `/api/v1/users` | ~~`/api/v1/user`~~ |
| API 경로 | `/api/v1/properties` | ~~`/api/v1/property`~~ |
| API 경로 | `/api/v1/reservations` | ~~`/api/v1/reservation`~~ |
| NestJS 모듈 폴더 | `users/`, `properties/` | ~~`user/`, `property/`~~ |

---

## 2. 브랜치 전략 (Git Branching)

GitHub Flow 기반의 간소화된 브랜치 전략을 사용합니다.

| 브랜치 | 역할 |
|---|---|
| `main` | 운영(Production) 배포 가능한 안정 상태 유지 |
| `develop` | 다음 릴리즈 준비용 통합 테스트 브랜치 |
| `feature/{기능명}` | `develop`에서 분기, 완료 후 PR 통해 병합 |

**예시**: `feature/user-login`, `feature/property-gallery`

---

## 3. 커밋 메시지 규칙 (Conventional Commits)

```
<type>: <description>
```

| 타입 | 용도 |
|---|---|
| `feat:` | 새로운 기능 추가 |
| `fix:` | 버그 수정 |
| `docs:` | 문서 변경사항 |
| `style:` | 포맷팅, 세미콜론 등 로직 미변경 |
| `refactor:` | 코드 리팩토링 |
| `test:` | 테스트 코드 추가/수정 |
| `chore:` | 빌드, 패키지 환경 설정 변경 |

---

## 4. API 통신 규약

### 4.1 RESTful 원칙

프론트엔드와 백엔드 간 통신은 RESTful 원칙을 준수합니다.

### 4.2 응답 데이터 인터페이스

```json
{
  "status": "success",
  "data": { ... },
  "message": ""
}
```

### 4.3 계층별 독립성 (Separation of Concerns)

- 프론트엔드는 API 스펙에만 의존하며, 백엔드 내부 로직을 알 필요 없음
- 백엔드는 프론트엔드 렌더링 방식에 무관하게 API만 안정적으로 응답
- 변경의 여파가 다른 계층으로 최소화되어야 함
