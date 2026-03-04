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
├── frontend/             # Tier 1: 프론트엔드 프로젝트
│   ├── src/              # 프론트엔드 소스코드 (컴포넌트, 페이지 등)
│   ├── public/           # 정적 파일 (이미지, 폰트 등)
│   └── package.json      # 모듈 의존성 정의
├── backend/              # Tier 2: 백엔드 프로젝트
│   ├── src/              # 백엔드 소스코드 (컨트롤러, 서비스, 모델 등)
│   ├── tests/            # 단위/통합 테스트 코드
│   └── package.json      # (또는 build.gradle, requirements.txt 등 백엔드 언어에 맞게)
├── database/             # Tier 3: 데이터베이스 관리
│   ├── init/             # DB 초기 세팅 스크립트 (DDL, 테이블 생성 스크립트 등)
│   └── docker-compose.yml # 로컬 개발용 DB 환경 구축 (선택 사항)
└── .gitignore            # Git 관리에서 제외할 파일 목록
```

## 4. 향후 확장을 위한 고려사항
각 폴더 내부에 들어갈 세부적인 프레임워크(예: React, Spring Boot, Node.js + MySQL 등)가 결정되면, 해당 구조 내에서 프레임워크가 권장하는 폴더 패턴을 하위 레벨로 적용하게 됩니다.
