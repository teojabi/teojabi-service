# 프론트엔드 핵심 화면 및 공통 아키텍처

이 문서는 터잡이 서비스의 순수 HTML, CSS, Vanilla JS 기반 프론트엔드 화면 구성과 폴더 구조를 정의합니다.
정적 웹 호스팅(Porkbun FTP) 환경에 최적화되어 있습니다.

---

## 1. 전역 디렉토리 구조 (Static Site)

프론트엔드 프로젝트는 별도의 빌드 도구 없이 브라우저에서 바로 실행 가능한 순수 정적 파일들로 구성됩니다.

```text
frontend/
├── index.html            # 랜딩 페이지 및 통합 진입점 (모달 로그인 포함)
├── search.html           # 네이버 지도 v3 검색 화면 (매물 슬라이딩 패널 표출)
├── gallery.html          # 부동산 매물 갤러리 (properties 데이터 기반 렌더링)
├── properties.html       # 매물 상세 정보 (갤러리 진입, 공공데이터 조회 단독 화면)
├── mypage.html           # 내 정보 및 관심 매물 관리
├── admin.html            # 관리자 전용 페이지 (매물 등록/수정/삭제, 예약 관리)
├── css/
│   ├── style.css         # 글로벌 & 공통 CSS (초기화, 폰트, CSS 변수)
│   ├── components.css    # 재사용 컴포넌트(버튼, 카드 등) 스타일
│   └── pages/            # 각 페이지별 개별 스타일
├── js/
│   ├── app.js            # 글로벌 공통 로직 (헤더/푸터 렌더링, 공통 유틸)
│   ├── auth.js           # 인증 상태 확인, CORS credentials Fetch 유틸
│   ├── config.js          # API 키 설정 파일 (.gitignore 처리)
│   ├── components/       # 재사용 UI 컴포넌트 렌더링 함수
│   │   ├── header.js
│   │   ├── footer.js
│   │   └── login-modal.js # 공통 소셜 로그인 레이어 모달
│   └── pages/            # 페이지별 독립적인 비즈니스 로직
│       ├── search.js     # 네이버 지도 v3, 마커, 클러스터링 로직
│       ├── gallery.js    # properties API 호출 → 카드 UI 동적 생성
│       └── properties.js # 매물 상세 API 호출 → 공공데이터 바인딩
└── img/                  # 정적 파일 (이미지, 아이콘 등)
```

---

## 2. 주요 핵심 화면 설계 명세

### 2.1 랜딩 & 로그인 화면 (`index.html` + Login Modal)

- **목적**: 서비스 진입 안내 및 레이어 모달(Layer Modal)을 통한 소셜 로그인 유도
- **주요 로직**:
  - Hero Banner와 서비스 설명 섹션 제공
  - 로그인 버튼 클릭 시 `login-modal.js`를 통해 레이어 모달 표시 (페이지 이동 없음)
  - 모달 내 소셜(네이버/카카오/구글) 버튼 → 백엔드 `/api/v1/auth/...` 리다이렉트

### 2.2 매물 갤러리 (`gallery.html`)

- **목적**: 등록 매물의 시각적 썸네일 리스트 제공 (조회 전용)
- **주요 로직**:
  - `gallery.js`에서 `/api/v1/properties` Fetch API 호출
  - JS 템플릿 리터럴로 `<div class="property-card">` DOM 요소 동적 생성
  - 카드 클릭 시 `properties.html?id=UUID`로 매물 상세 화면 전환

### 2.3 네이버 지도 검색 화면 (`search.html`)

- **목적**: 매물을 지도 기반으로 검색/조회하고, 좌측 슬라이딩 패널로 상세 정보 시각화

- **레이아웃 구조**:
  - **헤더**: 고정 높이(60px), 통합 검색 인풋(주소/키워드) 포함
  - **지도 영역**: `height: calc(100vh - 60px)` 뷰포트 전체
  - **좌측 슬라이딩 패널**: `position: fixed`, 닫힌 상태 `translateX(-100%)`, 너비 360~400px (모바일: 전체 너비)

- **주요 로직** (`search.js`):
  - **초기 로드**: 네이버 지도 v3 SDK 로드 후 `initMap()` 초기화
  - **통합 검색**:
    - 주소 검색: `naver.maps.Service.geocode()` → 좌표 변환 → 지도 이동
    - 키워드 검색: 백엔드 `/api/v1/public-data/search` 프록시 호출 → 결과 드롭다운
    - Debounce(300ms) 적용 자동완성
  - **지도 이벤트**: `dragend`, `zoom_changed` 시 `/api/v1/properties/map?ne=&sw=` 호출 → 마커 갱신
  - **좌측 패널 로직**:
    - 일반 위치 클릭 → `reverseGeocode` → 공공데이터(공시지가, 실거래율, 토지이용규제) 요약
    - 커스텀 마커(등록 매물) 클릭 → 컨설팅 내용, 이미지, 가격, 예약 버튼
  - **지적도 레이어 토글**: `naver.maps.MapTypeId.CADASTRAL` 전환 버튼

### 2.4 매물 상세 화면 (`properties.html`)

- **목적**: 특정 매물의 상세 컨설팅 기록과 공공데이터를 풀 페이지 렌더링, 상담 예약
- **주요 로직**:
  - `URLSearchParams`에서 `?id=UUID` 추출
  - `/api/v1/properties/:id` API 호출 → 컨설팅 상세, 이미지, 실거래가, 토지이음 바인딩
  - 예약 버튼 → DOM 기반 예약 모달/스텝퍼 제공

### 2.5 마이페이지 (`mypage.html`)

- **목적**: 관심 매물 목록, 프로필, 상담 예약 리스트 관리
- **주요 로직**:
  - `auth.js`의 `/api/v1/users/me` 검증 (미인증 시 로그인 유도)
  - 프로필 컴포넌트, 관심 매물, 예약 내역 탭 렌더링

### 2.6 관리자 페이지 (`admin.html`)

- **목적**: ADMIN 권한 사용자가 매물 등록/수정/삭제 및 예약 관리
- **주요 로직**:
  - JWT 페이로드 내 Role이 `ADMIN`인지 검증 (미달 시 `index.html` 리다이렉트)
  - 매물 등록 폼 → `/api/v1/properties` POST/PATCH/DELETE
  - 이미지 업로드 → Supabase Storage → CDN URL 저장
  - 지도 핀 지정 → PostGIS 좌표 데이터 조합

---

## 3. UI/UX 구현 기본 원칙

- **순수 CSS 디자인**: CSS3 + CSS 변수(`:root { --primary-color: #...; }`)로 테마 관리
- **컴포넌트화 지향**: Vanilla JS 함수 기반 템플릿 리터럴로 헤더/푸터 등 반복 HTML 일괄 주입
- **Mobile-first 대응**: 갤러리 및 지도의 모바일 사용성 최우선으로 CSS 미디어 쿼리 구성
- **Property 중심 일관성**: 모든 매물 관련 화면(gallery, search, properties, admin)이 동일한 `properties` API를 사용하여 데이터 일관성 유지
