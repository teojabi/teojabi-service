# 프론트엔드 핵심 화면 및 공통 컴포넌트 구조도 (Frontend UI Architecture)

이 문서는 터잡이 서비스의 Next.js (App Router) 기반 프론트엔드 화면 구성과 재사용 가능한 컴포넌트(Shadcn/UI 기반) 구조를 정의합니다.

## 1. 전역 디렉토리 구조 (App Router)
```text
frontend/src/
├── app/                  # 페이지 기반 라우팅 계층
│   ├── (auth)/           # 로그인/회원가입 관련 페이지
│   │   └── login/
│   ├── (main)/           # 서비스 핵심 페이지 그룹
│   │   ├── search/       # 네이버 지도 검색 화면
│   │   ├── gallery/      # 부동산 매물 갤러리 게시판
│   │   └── properties/   # 매물 상세 정보 및 상담/예약 신청 화면
│   ├── mypage/           # 내 정보 및 관심 매물 관리 
│   ├── api/auth/         # NextAuth 관련 설정 엔드포인트
│   ├── layout.tsx        # 최상위 Root Layout (헤더/내비게이션, 푸터 포함)
│   └── page.tsx          # 랜딩 페이지 (서비스 소개 및 시작하기)
├── components/           # 재사용 가능한 UI 컴포넌트
│   ├── ui/               # 기본 원자 컴포넌트 (Shadcn/UI 컴포넌트 등 - Button, Input)
│   ├── common/           # 애플리케이션 공통 컴포넌트 (Header, Footer, Sidebar 등)
│   ├── map/              # 네이버 지도 관련 특화 컴포넌트
│   ├── property/         # 매물 리스트(Card), 갤러리, 뱃지 등 부동산 도메인 관련 컴포넌트
│   └── publicAPI/        # 공시지가, 토지이음 정보 출력용 위젯/데이터 표
├── hooks/                # 커스텀 훅 (예: useNaverMap, useGeolocation)
├── lib/                  # 유틸리티 함수, API 통신 모듈(Axios/Fetch 래퍼)
└── store/                # 클라이언트 상태 관리 (Zustand 등, 필요 시)
```

## 2. 주요 핵심 화면 설계 명세

### 2.1 랜딩 & 로그인 화면 (`/`, `/login`)
*   **목적**: 서비스 진입 및 방문자 소셜 로그인 유도 구현
*   **주요 컴포넌트**: Hero Banner, 서비스 특장점 섹션, 소셜(네이버/카카오/구글) 로그인 `Button` (`components/ui/button`)

### 2.2 부동산 매물 이미지 갤러리 (`/gallery`)
*   **목적**: 지번 주소를 포함한 등록 매물의 시각적인 썸네일 리스트(무한 스크롤 또는 페이지네이션)
*   **주요 컴포넌트**:
    *   `PropertyCard`: 매물 이미지, 제목, 주소 요약이 표시되는 갤러리 아이템 (Shadcn `Card` 컴포넌트 사용)
    *   `FilterBar`: 지역/가격대 등 조건 필터링 바

### 2.3 네이버 지도 검색 화면 (`/search`)
*   **목적**: 일반 부동산 및 등록된 매물을 지도 기반으로 검색하고 마커로 시각화
*   **주요 컴포넌트**:
    *   `NaverMapWrapper`: 외부 스크립트(Next.js `Script` 태그)로 지도를 로드하는 컨테이너
    *   `MarkerManager`: PostGIS로 넘어온 위치 속성(`lat, lng`) 배열을 지도 마커 그룹으로 렌더링
    *   `SearchBox`: 주소 또는 지번 입력 필드 (자동 완성)
    *   `FloatingList`: 모바일 및 우측 패널에서 현재 지도 범위에 있는 매물을 리스트로 보여주는 오버레이

### 2.4 매물 상세 및 공공데이터 연동 화면 (`/properties/[id]`)
*   **목적**: 특정 매물 클릭 시 주소, 컨설팅 내용, 실거래가/공시지가 등을 표출하고 예약 신청
*   **주요 컴포넌트**:
    *   `ImageCarousel`: 다중 이미지 스와이퍼
    *   `PublicDataPanel`: 국토부 연동 데이터(시세 정보), 토지 이용 계획(토지이음) 정보 섹션
    *   `ReservationForm`: 하단 또는 사이드에 붙어있는 "상담 예약하기" CTA 모달 (Shadcn `Dialog` 또는 `Sheet`)

### 2.5 마이페이지 (`/mypage`)
*   **목적**: 내가 찜(관심)한 매물 목록, 프로필 정보, 과거/대기중인 상담 예약 리스트 표시
*   **주요 컴포넌트**:
    *   `UserProfile` (이미지 및 등급 뱃지)
    *   `Tabs` (내 관심 매물 / 내 예약 내역 탭 전환)

## 3. UI/UX 구현 기본 원칙
*   모든 디자인은 Tailwind CSS 유틸리티 클래스 기반으로 일관성 유지.
*   공통 UI는 재사용성을 극대화하기 위해 `components/ui` 폴더 내의 Shadcn 컴포넌트에 의존함.
*   모바일 환경 (Mobile-first) 대응을 필수로 하여, 갤러리 및 지도의 모바일 사용성을 최우선으로 조정.
