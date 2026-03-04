# 프로젝트 개발 규칙 (Rules & Conventions)

이 문서는 3-Tier 시스템을 하나의 완성도 높은 서비스로 일관성 있게 구성하고 개발하기 위한 기본 협업 가이드라인입니다.

## 1. 코드 컨벤션 (Code Conventions)

일관된 코드 스타일은 팀원 간 코드 가독성을 높이고 유지보수 비용을 줄입니다.

- **포맷팅 자동화**: 프론트엔드와 백엔드 프로젝트 모두 린터(Linter)와 코드 포매터(Formatter)를 필수로 도입합니다 (예: Prettier, ESLint, SonarLint 등). 구체적인 툴은 기술 스택 확정 후 각 폴더에 세팅합니다.
- **명명 규칙 (Naming)**:
  - 디렉토리 및 파일명: 소문자 케밥 케이스(`kebab-case`) 사용 권장. (예: `user-profile.js`)
  - 변수, 함수명: 카멜 케이스(`camelCase`).
  - 클래스 및 컴포넌트명: 파스칼 케이스(`PascalCase`).
  - 상수(Constant): 대문자 스네이크 케이스(`UPPER_SNAKE_CASE`).

## 2. 브랜치 전략 (Git Branching)

안정적인 소스와 개발 소스를 분리 관리하기 위한 깃 전략입니다. (GitHub Flow 또는 Git Flow 간소화 버전)

- `main` 브랜치: 운영(Production) 환경에 배포 가능한 안정 상태를 유지합니다.
- `develop` 브랜치: 다음 릴리즈를 준비하는 통합 테스트용 브랜치입니다.
- `feature/{기능명}` 브랜치: 새로운 기능을 개발할 때 `develop`에서 분기(Branch)하여 생성합니다. 개발 완료 후 Pull Request 창구를 통해 리뷰 후 병합됩니다. (예: `feature/user-login`)

## 3. 커밋 메시지 규칙 (Commit Messages)

Conventional Commits 구조를 활용하여 목적을 분명히 밝힙니다.

- `feat:` 새로운 기능을 추가할 때
- `fix:` 버그를 수정할 때
- `docs:` 문서 위주의 변경사항 (예: README, spec.md 등)
- `style:` 코드 포맷팅, 세미콜론 누락, 공백 수정 등 로직에 변화가 없을 때
- `refactor:` 프로덕션 코드를 리팩토링할 때
- `test:` 테스트 코드 수정 및 추가
- `chore:` 패키지 매니저 환경설정, 빌드 작업 등 개발 환경 구성 변경

## 4. 커뮤니케이션 및 설계 원칙

### API 통신 규약
- 프론트엔드와 백엔드가 데이터를 주고받는 통신은 RESTful 원칙을 지향합니다.
- 응답 데이터는 일관된 인터페이스를 가집니다.
  ```json
  {
    "status": "success",  // 또는 error, fail 등 상태 표현
    "data": { ... },      // 실제 결과 데이터 묶음
    "message": ""         // 필요한 경우 안내 메시지나 에러 내용
  }
  ```

### 계층별 독립성 (Separation of Concerns)
- 변경의 여파가 다른 계층으로 최소화되어야 합니다.
- 프론트엔드는 백엔드의 내부 비즈니스 로직을 알 필요 없이 정의된 API 스펙에만 의존하며,
- 백엔드 역시 프론트엔드가 어떻게 화면을 그리는지 몰라도 API만 안정적으로 응답해 줍니다.
