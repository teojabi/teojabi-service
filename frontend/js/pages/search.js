// js/pages/search.js
// Naver Maps SDK의 callback=initNaverMap 방식을 사용합니다.
// SDK + geocoder 서브모듈이 완전히 로드된 후 window.initNaverMap()이 호출됩니다.

// DOM이 준비된 후 UI 이벤트만 먼저 등록
document.addEventListener('DOMContentLoaded', () => {
    console.log("Search page DOM ready.");

    const leftPanel = document.getElementById('panel-general');
    const rightPanel = document.getElementById('panel-premium');
    const btnCloseLeft = document.getElementById('btn-close-left');
    const btnCloseRight = document.getElementById('btn-close-right');
    const contentGeneral = document.getElementById('content-general');
    const contentPremium = document.getElementById('content-premium');

    // 패널 닫기 이벤트 바인딩
    if (btnCloseLeft) {
        btnCloseLeft.addEventListener('click', () => leftPanel.classList.remove('active'));
    }
    if (btnCloseRight) {
        btnCloseRight.addEventListener('click', () => rightPanel.classList.remove('active'));
    }

    // --- 좌측 패널 팝업 (일반 공공 데이터) ---
    window.simulateLeftPopup = (address) => {
        rightPanel.classList.remove('active');
        leftPanel.classList.add('active');
        contentGeneral.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <h4 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${address}</h4>
                <span style="font-size: 0.85rem; color: #fff; background: var(--text-muted); padding: 2px 6px; border-radius: 4px;">일반 조회 구역</span>
            </div>
            <div style="background: var(--bg-muted); padding: 1rem; border-radius: var(--radius-md);">
                <p style="font-size: 0.9rem; margin-bottom: 0.5rem;"><strong>가장 최근 실거래가 (국토부)</strong></p>
                <p style="font-size: 1.2rem; font-weight: 700; color: var(--danger-color); margin-bottom: 1rem;">조회 중...</p>
                <p style="font-size: 0.9rem; margin-bottom: 0.5rem;"><strong>공시지가</strong></p>
                <p style="font-size: 1.1rem;">조회 중...</p>
            </div>
            <div style="margin-top: 1rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                <p style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.5rem;">토지 규제/용도</p>
                <p style="font-size: 0.85rem; color: var(--text-muted);">제1종일반주거지역, 상대보호구역...</p>
            </div>
        `;
    };

    // --- 우측 패널 팝업 (프리미엄 컨설팅 매물) ---
    window.simulateRightPopup = (propertyId) => {
        leftPanel.classList.remove('active');
        rightPanel.classList.add('active');
        contentPremium.innerHTML = `
            <div style="width: 100%; height: 200px; background: #cbd5e1; border-radius: var(--radius-md); margin-bottom: 1rem; display:flex; align-items:center; justify-content:center;">
                <i class="ri-image-line" style="font-size: 2rem; color: #94a3b8;"></i>
            </div>
            <h4 style="font-size: 1.2rem; margin-bottom: 0.5rem;">강남 테헤란로 프리미엄 오피스 부지</h4>
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;"><i class="ri-map-pin-line"></i> 서울시 강남구 테헤란로 123</p>
            <div style="margin-bottom: 1.5rem;">
                <h5 style="margin-bottom: 0.5rem;">컨설팅 내용 요약</h5>
                <p style="font-size: 0.9rem; line-height: 1.6;">본 부지는 용적률 상향 가능성이 높은 구역으로, 오피스텔 단지 재가공에 매우 적합합니다...</p>
            </div>
            <div style="background: var(--bg-muted); padding: 1rem; border-radius: var(--radius-md); font-size: 0.9rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <span style="color:var(--text-muted)">매매 호가</span>
                    <strong style="color:var(--danger-color)">450억 원</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:var(--text-muted)">최근 실거래가</span>
                    <strong>410억 원 (24.01)</strong>
                </div>
            </div>
        `;
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// Naver Maps SDK callback: SDK + geocoder 서브모듈이 완전히 로드된 후 실행됩니다.
// search.html의 script src에 &callback=initNaverMap 으로 등록되어 있습니다.
// ─────────────────────────────────────────────────────────────────────────────
window.initNaverMap = function () {
    console.log("Naver Maps SDK fully loaded (including geocoder). Initializing map...");

    const leftPanel = document.getElementById('panel-general');
    const rightPanel = document.getElementById('panel-premium');

    // --- 지도 초기화 ---
    const mapOptions = {
        center: new naver.maps.LatLng(37.3595704, 127.105399),
        zoom: 15,
        zoomControl: true,
        zoomControlOptions: {
            position: naver.maps.Position.TOP_RIGHT
        }
    };
    const map = new naver.maps.Map('naver-map', mapOptions);
    console.log("Naver Map initialized successfully.");

    // --- 지도 클릭 이벤트 (역지오코딩으로 실제 주소 조회 후 좌측 패널 표시) ---
    naver.maps.Event.addListener(map, 'click', function (e) {
        const latlng = e.coord;

        naver.maps.Service.reverseGeocode(
            { coords: latlng, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR] },
            function (status, response) {
                let address = '주소를 불러올 수 없습니다.';
                if (status === naver.maps.Service.Status.OK) {
                    const result = response.v2.address;
                    // 도로명 주소 우선, 없으면 지번 주소 사용
                    address = result.roadAddress || result.jibunAddress || address;
                }
                window.simulateLeftPopup(address);
            }
        );
    });

    // --- 지적도(Cadastral Layer) ---
    const cadastralLayer = new naver.maps.CadastralLayer();
    const btnCadastral = document.getElementById('btn-cadastral');
    let isCadastralOn = false;

    if (btnCadastral) {
        btnCadastral.addEventListener('click', () => {
            isCadastralOn = !isCadastralOn;
            if (isCadastralOn) {
                cadastralLayer.setMap(map);
                btnCadastral.innerHTML = '<i class="ri-map-2-fill"></i> 지적도 끄기';
                btnCadastral.style.background = 'var(--bg-muted)';
            } else {
                cadastralLayer.setMap(null);
                btnCadastral.innerHTML = '<i class="ri-map-2-line"></i> 지적도 켜기';
                btnCadastral.style.background = 'white';
            }
        });
    }

    // --- 임시 테스트 마커 ---
    const dummyMarker = new naver.maps.Marker({
        position: new naver.maps.LatLng(37.3596, 127.1049),
        map: map,
        title: '테스트 컨설팅 매물',
        icon: {
            content: `<div style="background-color:var(--primary-color); color:white; padding:5px 10px; border-radius:var(--radius-md); font-weight:bold; cursor:pointer; box-shadow:var(--shadow-md);">T 터잡이 매물</div>`,
            anchor: new naver.maps.Point(40, 15)
        }
    });

    naver.maps.Event.addListener(dummyMarker, 'click', function () {
        window.simulateRightPopup('demo-property-id');
    });

    // --- 주소 검색 (Geocoding) ---
    const inputSearch = document.getElementById('map-search-input');
    const btnSearch = document.getElementById('btn-search');

    const executeSearch = async () => {
        const query = inputSearch.value.trim();
        if (!query) {
            alert('검색어를 입력해주세요.');
            return;
        }

        btnSearch.disabled = true;
        btnSearch.textContent = '검색 중...';

        try {
            // 1단계: Geocoding API (도로명/지번 주소 검색)
            const geocodeResult = await new Promise((resolve) => {
                naver.maps.Service.geocode({ query }, function (status, response) {
                    if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                        const item = response.v2.addresses[0];
                        resolve({ x: parseFloat(item.x), y: parseFloat(item.y) });
                    } else {
                        resolve(null); // 주소 검색 실패 → 2단계로 폴백
                    }
                });
            });

            if (geocodeResult) {
                map.setCenter(new naver.maps.Point(geocodeResult.x, geocodeResult.y));
                map.setZoom(16);
                return;
            }

            // 2단계: 키워드(장소명/학교명 등) 검색 → 백엔드 프록시 (네이버 로컬 검색 API)
            const res = await fetch(`http://localhost:3001/api/v1/public-data/search?query=${encodeURIComponent(query)}`);
            const json = await res.json();

            if (json.success && json.data) {
                const { x, y, title, address } = json.data;
                map.setCenter(new naver.maps.Point(x, y));
                map.setZoom(16);
                console.log(`키워드 검색 결과: ${title} (${address})`);
            } else {
                alert(`"${query}"에 대한 검색 결과가 없습니다.\n도로명 주소나 지번 주소로도 시도해보세요.`);
            }
        } catch (err) {
            console.error('검색 오류:', err);
            alert('검색 중 오류가 발생했습니다.');
        } finally {
            btnSearch.disabled = false;
            btnSearch.textContent = '검색';
        }
    };

    btnSearch.addEventListener('click', executeSearch);
    inputSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeSearch();
    });
};
