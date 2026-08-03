# 네이버 지도 v3 & 검색 API 설정 가이드

이 문서는 터잡이 서비스에서 사용하는 네이버 지도 v3 API와 검색 API의 발급 및 연동 설정을 안내합니다.

> ⚠️ 터잡이 서비스는 **네이버 지도 API v3**을 사용합니다. v2 SDK와는 호환되지 않으므로 반드시 NCP(네이버 클라우드 플랫폼)에서 v3 전용 키를 발급받아야 합니다.

---

## 사용 API 목록

| API | 플랫폼 | 용도 | 키 종류 |
|---|---|---|---|
| Maps JS API v3 | NCP (네이버 클라우드) | 지도 렌더링, 지적도, 마커 | `ncpClientId` |
| Geocoding (submodule) | NCP (네이버 클라우드) | 주소 → 위경도 변환 | `ncpClientId` (동일) |
| 지역 검색 API | 네이버 개발자센터 | 키워드 → 위경도 변환 (백엔드 프록시) | `Client ID` + `Client Secret` |

---

## 1. NCP 네이버 지도 API v3 (Maps JS + Geocoding)

> 지도 렌더링과 주소 검색에 사용합니다. 프론트엔드에서 직접 로드합니다.

### 1.1 API 상품 신청

1. [NCP 콘솔](https://console.ncloud.com/) 접속 → **AI·NAVER API** → **Maps**
2. 아래 상품을 신청합니다:
   - ✅ Maps — **Maps JS API** (지도 렌더링)
   - ✅ Maps — **Geocoding** (주소 → 좌표 변환)

### 1.2 허용 도메인 등록

> 보안을 위해 **반드시** 허용 도메인을 등록해야 합니다.

| 환경 | 등록값 |
|---|---|
| 로컬 개발 | `http://localhost:3000` |
| 운영 배포 | `https://teojabi.com` |

### 1.3 프론트엔드 키 설정

`frontend/js/config.js`에 발급받은 Client ID를 입력합니다:

```javascript
// frontend/js/config.js (Git 제외)
const CONFIG = {
    NAVER_MAP_CLIENT_ID: 'YOUR_NCP_CLIENT_ID',
};
```

> 팀원은 `config.example.js`를 복사하여 `config.js`로 이름을 바꿔 사용합니다.

### 1.4 SDK 로드 방법 (search.html)

```html
<script src="/js/config.js"></script>
<script>
    const script = document.createElement('script');
    // v3 SDK 로드 + geocoder 서브모듈 + callback 파라미터 필수
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${CONFIG.NAVER_MAP_CLIENT_ID}&submodules=geocoder&callback=initNaverMap`;
    document.head.appendChild(script);
</script>
```

> ⚠️ **`&callback=initNaverMap` 파라미터가 반드시 필요합니다.** 이 파라미터가 없으면 geocoder 서브모듈 로딩 전에 JS가 실행되어 **"Geocode API 모듈이 로드되지 않았습니다"** 오류가 발생합니다.

### 1.5 v3 주요 API 레퍼런스

| 기능 | API | 설명 |
|---|---|---|
| 주소 → 좌표 | `naver.maps.Service.geocode()` | 도로명/지번 주소를 좌표로 변환 |
| 좌표 → 주소 | `naver.maps.Service.reverseGeocode()` | 좌표를 주소로 변환 |
| 지적도 오버레이 | `naver.maps.MapTypeId.CADASTRAL` | 지적 경계선 표시 |
| 마커 생성 | `new naver.maps.Marker()` | 지도 위 마커 |
| 지도 이동 | `map.panTo()` | 부드러운 지도 이동 |

---

## 2. 네이버 지역 검색 API (키워드 검색용)

> 학교명, 지역명, 상호명 등 키워드로 좌표를 찾을 때 사용합니다. **백엔드를 통한 프록시 호출** 방식입니다.

### 2.1 API 신청

1. [네이버 개발자센터](https://developers.naver.com/) → **내 애플리케이션** → 앱 선택
2. API 설정에서 **"검색"** 항목 체크
3. **WEB 설정** 선택 → 웹 서비스 URL 입력:
   - 로컬: `http://localhost:3001` (NestJS 백엔드 포트)
   - 운영: `https://api.teojabi.com`

> 💡 여기서 입력하는 URL은 API를 **호출하는 서버(백엔드)의 주소**입니다.

### 2.2 백엔드 환경변수 설정

`backend/.env`:

```env
# 소셜 로그인과 동일한 앱 키 사용 가능 (검색 API가 활성화된 경우)
NAVER_CLIENT_ID=YOUR_NAVER_CLIENT_ID
NAVER_CLIENT_SECRET=YOUR_NAVER_CLIENT_SECRET
```

### 2.3 검색 흐름 (2단계 폴백)

```
사용자 입력
    │
    ▼
1단계: naver.maps.Service.geocode (v3 주소 검색)
    │ 결과 없음
    ▼
2단계: GET /api/v1/public-data/search?query=키워드
       (NestJS 백엔드 → 네이버 지역 검색 API 프록시)
    │
    ▼
지도 중심 이동
```

---

## 체크리스트

- [ ] NCP 콘솔에서 Maps JS API v3 + Geocoding 상품 신청
- [ ] NCP 허용 도메인에 `http://localhost:3000` 및 운영 도메인 등록
- [ ] `frontend/js/config.js` 생성 (`NAVER_MAP_CLIENT_ID` 입력)
- [ ] search.html에서 `&callback=initNaverMap` 파라미터 포함하여 v3 SDK 로드
- [ ] 네이버 개발자센터에서 **검색 API** 신청 + WEB 환경 URL 등록
- [ ] `backend/.env`에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 설정
- [ ] GitHub Secrets에 `NAVER_MAP_CLIENT_ID` 등록
