# 프로젝트 아키텍처 및 폴더 구조 명세 (Specification)

## 1. 개요
본 프로젝트는 Frontend, Backend, Database로 구성된 3-Tier 아키텍처를 기반으로 합니다. 프로젝트 전반의 일관성을 유지하고 협업 효율을 높이기 위해 명확한 역할 분담과 폴더 구조를 정의합니다.

## 2. 3-Tier 아키텍처 역할의 정의

- **Tier 1: Frontend (Presentation Layer)**
  - 사용자와 직접 상호작용하는 화면(UI)과 사용자 경험(UX) 영역
  - 사용자의 입력을 받아 백엔드 API를 호출하고 결과를 화면에 렌더링
- **Tier 2: Backend (Application/Business Logic Layer)**
  - 시스템의 핵심 비즈니스 로직과 데이터 처리를 담당
  - 프론트엔드의 요청을 받아 유효성 검사, 연산 처리를 수행하고 Database와 상호작용
- **Tier 3: Database (Data Access Layer)**
  - 정보의 영구적인 저장, 관리, 조회, 무결성 보장을 담당

## 3. 베이스 폴더 구조 제안
아래는 모노레포 형태 또는 단일 저장소 내에서 3계층을 분리 관리하기 위한 템플릿입니다.

```text
teojabi-service/
├── docs/                 # 프로젝트 관련 문서 보관 (기획, 설계 등)
│   ├── RESEARCH.md       # 요구사항 및 리서치 (현재 논의중)
│   ├── rule.md           # 프로젝트 규칙 및 협업 컨벤션
│   └── spec.md           # 아키텍처 및 시스템 스펙 명세 (본 문서)
├── frontend/             # Tier 1: 정적 프론트엔드 프로젝트
│   ├── css/              # 스타일시트 분리
│   ├── js/               # Vanilla JS 로직 및 컴포넌트 스크립트
│   ├── assets/           # 정적 에셋 (이미지, 폰트 등)
│   └── *.html            # HTML 페이지 진입점 (`index.html`, `search.html`, `gallery.html`, `properties.html`, `admin.html` 등)
├── backend/              # Tier 2: 백엔드 프로젝트
│   ├── src/              # 백엔드 소스코드 (컨트롤러, 서비스, 모델 등)
│   ├── tests/            # 단위/통합 테스트 코드
│   └── package.json      # (또는 build.gradle, requirements.txt 등 백엔드 언어에 맞게)
├── database/             # Tier 3: 데이터베이스 관리
│   ├── init/             # DB 초기 세팅 스크립트 (DDL, 테이블 생성 스크립트 등)
│   └── supabase/         # Supabase Local CLI 설정 폴더 (로컬 개발용 DB 환경 구축)
└── .gitignore            # Git 관리에서 제외할 파일 목록
```

## 4. 확정된 기술 스택 및 아키텍처 상세
본 프로젝트는 다음의 기술 스택을 기반으로 구현됩니다.

- **프론트엔드 (Tier 1)**: 순수 HTML, CSS, Vanilla JS
  - 빌드 과정 없는 완전 정적 호스팅 포맷 완성
  - 주요 기능: 네이버 지도 API 직접 연동, 부동산 갤러리 렌더링 컴포넌트화 구축
  - 통신/인증: JWT 인증 확인과 `credentials: true` 속성을 활용한 CORS 기반 통신 처리
- **백엔드 (Tier 2)**: NestJS, TypeScript, REST API (NCP 서버 배포)
  - 인증(보안): Passport.js 기반 통합 소셜 로그인 제공 및 XSS 방지를 위한 **HttpOnly/Secure/SameSite** 쿠키 직접 발급
  - 데이터 중계(성능): 주기율 스케줄러(CRON)를 가동하여 공공포털 데이터를 내부 DB에 능동 적재·캐싱 (API 실시간 부하 해결)
  - CORS 통제: `main.ts` 레벨에서 프론트엔드 도메인 자격 증명(CORS 화이트리스트) 명시
  - 문서화: Swagger를 통한 API 명세서 자동 연동 제공
- **데이터베이스 (Tier 3)**: PostgreSQL (Supabase 호스팅)
  - ORM: Prisma
  - 지리 정보 처리(GIS): PostGIS 익스텐션 활성화 및 마커/범위 검색 최적화 적용
