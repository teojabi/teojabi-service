// 네이버 지도 검색 화면 메인 로직

// ────────────────────────────────────────
// 전역 상태
// ────────────────────────────────────────
let map = null;
let cadastralLayer = null;
let searchMarker = null;
let clickMarker = null;
let propertyMarkers = [];
let currentPropertyData = null;
let currentPanelPnu = null;
let currentPanelAddress = null;
let aiNewbuildRequestPending = false;

function canSeeFullAddress() {
    return window.currentUserRole === 'ADMIN';
}

function getDisplayAddress(prop) {
    if (canSeeFullAddress()) {
        return prop.address || '-';
    }
    return prop.legal_dong_name || prop.address || '-';
}

const mapRenderState = {
    overlay: null,
    motionPending: false,
    asyncPendingCount: 0,
    hideTimer: null,
    forceHideTimer: null
};

// ────────────────────────────────────────
// 진입점: 네이버 지도 SDK 로드 콜백
// ────────────────────────────────────────
window.initMap = function() {
    // SDK 및 서브모듈(geocoder, cadastral, transcoord)이 전역에 완전히 등록되지 않았을 수 있으므로 체크
    if (typeof naver === 'undefined' || 
        typeof naver.maps === 'undefined' || 
        typeof naver.maps.Service === 'undefined' || 
        typeof naver.maps.Service.Status === 'undefined' ||
        typeof naver.maps.CadastralLayer === 'undefined') {
        setTimeout(window.initMap, 100);
        return;
    }
    
    // 1. 지도 초기화
    map = new naver.maps.Map('map-container', {
        center: new naver.maps.LatLng(37.5665, 126.9780), // 서울 시청
        zoom: 15,
        minZoom: 7,
        maxZoom: 21,
        logoControl: true,
        mapTypeControl: false,
        zoomControl: false,
        scaleControl: true
    });

    // 2. 지적도 레이어 준비
    if (naver.maps.CadastralLayer) {
        cadastralLayer = new naver.maps.CadastralLayer();
    }

    // 3. 이벤트 바인딩
    bindEvents();
    addTeojabiEvents();

    // 4. 컨설팅 매물 마커 표시
    loadPropertyMarkers();
}

// ────────────────────────────────────────
// 이벤트 바인딩
// ────────────────────────────────────────
function bindEvents() {
    // 검색 입력창
    const searchInput = document.getElementById('search-input');
    const searchSubmitBtn = document.getElementById('btn-search-submit');
    const searchClearBtn = document.getElementById('btn-search-clear');
    const autocompleteContainer = document.getElementById('search-autocomplete');

    // 검색 실행 (엔터)
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchByQuery(searchInput.value);
            autocompleteContainer.classList.remove('open');
        }
    });

    // 검색 버튼 클릭
    searchSubmitBtn.addEventListener('click', () => {
        searchByQuery(searchInput.value);
        autocompleteContainer.classList.remove('open');
    });

    // 입력창 텍스트 변경 시 클리어 버튼 제어 및 자동완성
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (query.length > 0) {
            searchClearBtn.classList.add('visible');
            if (query.length >= 2) {
                runAutocomplete(query);
            } else {
                autocompleteContainer.classList.remove('open');
            }
        } else {
            searchClearBtn.classList.remove('visible');
            autocompleteContainer.classList.remove('open');
        }
    });

    // 입력창 포커스 시 값이 있으면 자동완성 다시 표시 시도
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2 && autocompleteContainer.innerHTML !== '') {
            autocompleteContainer.classList.add('open');
        }
    });

    // 외부 클릭 시 자동완성 닫기
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-wrapper')) {
            autocompleteContainer.classList.remove('open');
        }
    });

    // 클리어 버튼 클릭
    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.classList.remove('visible');
        autocompleteContainer.classList.remove('open');
        searchInput.focus();
    });

    // 지도 클릭 → 위치 정보 패널 열기
    naver.maps.Event.addListener(map, 'click', function(e) {
        handleMapClick(e.coord);
    });

    // 패널 닫기 버튼
    document.getElementById('btn-panel-close').addEventListener('click', closePanel);

    // 컨설팅 패널 닫기 버튼
    document.getElementById('btn-consulting-panel-close').addEventListener('click', closeConsultingPanel);

    // 탭 전환
    document.querySelectorAll('.panel-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            const target = this.getAttribute('data-tab');
            document.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            ['building', 'ai-newbuild', 'land', 'floor'].forEach(function(name) {
                document.getElementById('panel-tab-' + name).style.display = target === name ? 'block' : 'none';
            });
        });
    });

    // ai 신축 제미나이 분석 요청
    const aiRequestBtn = document.getElementById('btn-ai-newbuild-request');
    if (aiRequestBtn) {
        aiRequestBtn.addEventListener('click', function() {
            loadAiNewbuildAnalysis(currentPanelPnu);
        });
    }

    // 지도 컨트롤: 지적도
    document.getElementById('btn-ctrl-cadastral').addEventListener('click', function() {
        if (!cadastralLayer) return;
        const isVisible = cadastralLayer.getMap();
        if (isVisible) {
            cadastralLayer.setMap(null);
            this.classList.remove('active');
        } else {
            cadastralLayer.setMap(map);
            this.classList.add('active');
        }
    });

    // 패널 하단 푸터 액션 버튼들
    // 1. 프리미엄 상담 신청
    document.getElementById('btn-panel-action1').addEventListener('click', async function() {
        if (typeof window.requestPremiumConsultation === 'function') {
            await window.requestPremiumConsultation({
                type: 'GENERAL',
                pnu: currentPanelPnu,
                address: currentPanelAddress
            });
        } else {
            alert('상담 신청 기능을 불러올 수 없습니다.');
        }
    });

    // 2. 전문가 리빌딩 리포트
    document.getElementById('btn-panel-action2').addEventListener('click', async function() {
        if (typeof window.requestPremiumConsultation === 'function') {
            await window.requestPremiumConsultation({
                type: 'REPORT',
                pnu: currentPanelPnu,
                address: currentPanelAddress
            });
        } else {
            alert('리포트 신청 기능을 불러올 수 없습니다.');
        }
    });

    // 3. 리포트 예시 (새 창으로 띄우기)
    document.getElementById('btn-panel-action3').addEventListener('click', async function() {
        let reportUrl = 'https://teojabi.com/samples/sample_report.pdf'; // 기본값
        
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/settings/sample_report_url`);
            const json = await res.json();
            if (json.success && json.data && json.data.value) {
                reportUrl = json.data.value;
            }
        } catch (err) {
            console.error('리포트 URL 로드 실패, 기본값 사용:', err);
        }
        
        window.open(reportUrl, '_blank');
    });

}

function getMapWaitOverlay() {
    if (!mapRenderState.overlay) {
        mapRenderState.overlay = document.getElementById('map-wait-overlay');
    }
    return mapRenderState.overlay;
}

function showMapWaitOverlay() {
    const overlay = getMapWaitOverlay();
    if (!overlay) return;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    if (mapRenderState.forceHideTimer) {
        clearTimeout(mapRenderState.forceHideTimer);
    }

    mapRenderState.forceHideTimer = setTimeout(function() {
        mapRenderState.motionPending = false;
        mapRenderState.asyncPendingCount = 0;
        hideMapWaitOverlay();
    }, 8000);
}

function hideMapWaitOverlay() {
    const overlay = getMapWaitOverlay();
    if (!overlay) return;

    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');

    if (mapRenderState.forceHideTimer) {
        clearTimeout(mapRenderState.forceHideTimer);
        mapRenderState.forceHideTimer = null;
    }
}

function scheduleMapWaitHide() {
    if (mapRenderState.hideTimer) {
        clearTimeout(mapRenderState.hideTimer);
    }

    mapRenderState.hideTimer = setTimeout(function() {
        if (!mapRenderState.motionPending && mapRenderState.asyncPendingCount === 0) {
            hideMapWaitOverlay();
        }
    }, 120);
}

function startMapMotionWait() {
    if (!teojabiState.isActive) return;
    mapRenderState.motionPending = true;
    showMapWaitOverlay();
}

function finishMapMotionWait() {
    if (!teojabiState.isActive) return;
    mapRenderState.motionPending = false;

    if (mapRenderState.asyncPendingCount > 0) {
        return;
    }

    scheduleMapWaitHide();
}

function beginMapAsyncWait() {
    mapRenderState.asyncPendingCount += 1;
    showMapWaitOverlay();
}

function endMapAsyncWait() {
    mapRenderState.asyncPendingCount = Math.max(0, mapRenderState.asyncPendingCount - 1);

    if (mapRenderState.motionPending || mapRenderState.asyncPendingCount > 0) {
        return;
    }

    scheduleMapWaitHide();
}

function runMapQuickRefreshWait(duration) {
    if (!teojabiState.isActive) return;
    beginMapAsyncWait();
    setTimeout(endMapAsyncWait, duration || 220);
}

function bindMapRenderWaitEvents() {
    naver.maps.Event.addListener(map, 'dragstart', startMapMotionWait);
    naver.maps.Event.addListener(map, 'zoom_changed', startMapMotionWait);
    naver.maps.Event.addListener(map, 'idle', finishMapMotionWait);
}

// ────────────────────────────────────────
// 컨설팅 매물 마커
// ────────────────────────────────────────
async function loadPropertyMarkers() {
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/properties`);
        const data = await res.json();
        if (!Array.isArray(data)) return;

        // 기존 마커 제거
        propertyMarkers.forEach(m => m.setMap(null));
        propertyMarkers = [];

        data.forEach(prop => {
            if (!prop.lat || !prop.lng) return;
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(prop.lat, prop.lng),
                map: map,
                title: prop.title || '',
                icon: {
                    content: `<div style="
                        width: 28px; height: 28px;
                        background: #e53935;
                        border: 2.5px solid #fff;
                        border-radius: 50% 50% 50% 0;
                        transform: rotate(-45deg);
                        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                    "></div>`,
                    anchor: new naver.maps.Point(14, 28)
                }
            });

            naver.maps.Event.addListener(marker, 'click', () => {
                openConsultingPanel(prop);
            });

            propertyMarkers.push(marker);
        });
    } catch (e) {
        console.error('컨설팅 매물 마커 로드 실패:', e);
    }
}

// ────────────────────────────────────────
// 검색 기능 (Geocoder + POI 통합)
// ────────────────────────────────────────
let autocompleteTimer = null;

async function runAutocomplete(query) {
    if (autocompleteTimer) clearTimeout(autocompleteTimer);
    
    // 타이핑 중 잦은 API 호출 방지 (Debounce 200ms)
    autocompleteTimer = setTimeout(async () => {
        let allResults = [];

        // 1. 주소 검색 (Geocoder)
        const geocodePromise = new Promise((resolve) => {
            if (!naver.maps.Service || !naver.maps.Service.geocode) return resolve([]);
            naver.maps.Service.geocode({ query }, (status, response) => {
                if (status !== naver.maps.Service.Status.OK) return resolve([]);
                const items = response.v2.addresses.map(item => ({
                    type: 'ADDRESS',
                    title: item.roadAddress || item.jibunAddress,
                    subTitle: item.roadAddress ? item.jibunAddress : '',
                    x: item.x,
                    y: item.y,
                    raw: item
                }));
                resolve(items);
            });
        });

        // 2. POI 검색 (Backend Proxy)
        const poiPromise = fetch(`${CONFIG.API_BASE_URL}/api/v1/public-data/search?query=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(json => {
                let data = json.data;
                if (json.success && data && !Array.isArray(data)) {
                    data = [data];
                }

                if (json.success && Array.isArray(data)) {
                    return data.map(item => ({
                        type: 'POI',
                        title: item.title,
                        subTitle: item.address,
                        category: item.category,
                        mapx: item.mapx, 
                        mapy: item.mapy,
                        raw: item
                    }));
                }
                return [];
            })
            .catch(() => []);

        // 두 검색 결과를 합침
        const [addresses, pois] = await Promise.all([geocodePromise, poiPromise]);
        allResults = [...addresses, ...pois];

        renderAutocomplete(allResults);
    }, 200);
}

function renderAutocomplete(items) {
    const container = document.getElementById('search-autocomplete');
    const searchInput = document.getElementById('search-input');
    
    if (!items || items.length === 0) {
        container.innerHTML = '';
        container.classList.remove('open');
        return;
    }

    let html = '';
    items.forEach((item, index) => {
        const icon = item.type === 'ADDRESS' ? 'ri-map-pin-line' : 'ri-building-4-line';
        const label = item.type === 'POI' && item.category ? `<span class="poi-category">${item.category}</span>` : '';
        
        html += `
            <div class="autocomplete-item" data-index="${index}">
                <i class="${icon}"></i>
                <div class="autocomplete-item-text">
                    <div class="autocomplete-item-main">${item.title} ${label}</div>
                    ${item.subTitle ? `<div class="autocomplete-item-sub">${item.subTitle}</div>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.classList.add('open');

    // 항목 클릭 이벤트
    container.querySelectorAll('.autocomplete-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = el.getAttribute('data-index');
            const selectedItem = items[idx];
            
            selectSearchResult(selectedItem);
            
            container.classList.remove('open');
            searchInput.value = selectedItem.title;
            document.getElementById('btn-search-clear').classList.add('visible');
        });
    });
}

async function searchByQuery(query) {
    if (!query || query.trim().length < 2) {
        alert('검색어를 2자 이상 입력해 주세요.');
        return;
    }

    // 1. 주소 검색 시도
    const geocodePromise = new Promise((resolve) => {
        if (!naver.maps.Service || !naver.maps.Service.geocode) return resolve(null);
        naver.maps.Service.geocode({ query }, (status, response) => {
            if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                const item = response.v2.addresses[0];
                return resolve({
                    type: 'ADDRESS',
                    title: item.roadAddress || item.jibunAddress,
                    x: item.x,
                    y: item.y,
                    raw: item
                });
            }
            resolve(null);
        });
    });

    const addressResult = await geocodePromise;
    if (addressResult) {
        selectSearchResult(addressResult);
        return;
    }

    // 2. 주소 결과 없으면 POI 검색 시도
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/public-data/search?query=${encodeURIComponent(query)}`);
        const json = await res.json();
        
        let data = json.data;
        if (json.success && data && !Array.isArray(data)) {
            data = [data];
        }

        if (json.success && Array.isArray(data) && data.length > 0) {
            const item = data[0];
            selectSearchResult({
                type: 'POI',
                title: item.title,
                subTitle: item.address,
                category: item.category,
                mapx: item.mapx,
                mapy: item.mapy,
                raw: item
            });
            return;
        }
        
        // 데이터가 비어있는 경우 (정상 검색 성공이나 결과 없음)
        if (json.success && Array.isArray(data) && data.length === 0) {
            alert('검색 결과가 없습니다.');
            return;
        }

        // 백엔드에서 명시적으로 오류 응답을 보낸 경우 (success: false)
        if (json.success === false) {
            alert(json.message || '검색 과정에서 오류가 발생했습니다.');
            return;
        }
    } catch (err) {
        console.error('[search] POI search failed:', err);
    }

    // 예외적인 폴백 (여기까지 오면 결과가 없는 것으로 간주)
    alert('검색 결과가 없습니다.');
}

// ────────────────────────────────────────
// 검색 결과 선택 및 지도 이동
// ────────────────────────────────────────
function selectSearchResult(item) {
    let latlng = null;

    if (item.type === 'ADDRESS') {
        const y = parseFloat(item.y);
        const x = parseFloat(item.x);
        if (!isNaN(y) && !isNaN(x)) {
            latlng = new naver.maps.LatLng(y, x);
        }
    } else if (item.type === 'POI') {
        // 네이버 로컬 검색 API의 mapx/mapy는 WGS84 좌표에 1e7을 곱한 정수값
        // 예: mapx=1269780000 → 경도 126.9780, mapy=375665000 → 위도 37.5665
        const mapx = Number(item.mapx);
        const mapy = Number(item.mapy);

        if (!isNaN(mapx) && !isNaN(mapy) && mapx > 0 && mapy > 0) {
            const lng = mapx / 1e7;
            const lat = mapy / 1e7;
            if (lat > 30 && lat < 45 && lng > 120 && lng < 135) {
                latlng = new naver.maps.LatLng(lat, lng);
            }
        }
    }

    if (!latlng) {
        console.error('[search] Failed to get valid coordinates for:', JSON.stringify(item));
        alert('선택한 장소의 위치 정보를 확인할 수 없습니다.');
        return;
    }

    if (map && latlng) {
        startMapMotionWait();
        try {
            // 네이버 지도 API 예제(tutorial-5-map-moves.example.html) 참고: morph가 가장 부드럽고 안정적임
            map.morph(latlng, 17);
        } catch (e) {
            map.setCenter(latlng);
            map.setZoom(17);
        }
    }

    // 마커 표시
    if (searchMarker) searchMarker.setMap(null);
    searchMarker = new naver.maps.Marker({
        position: latlng,
        map: map,
        animation: naver.maps.Animation.DROP
    });

    console.log('[search] Navigation completed for:', item.title);
}

// ────────────────────────────────────────
// 컨설팅 패널 제어
// ────────────────────────────────────────
function openConsultingPanel(prop) {
    currentPropertyData = prop;
    const panel = document.getElementById('consulting-panel');
    panel.classList.add('open');

    // 로딩 상태
    document.getElementById('cp-loading').style.display = 'flex';
    document.getElementById('cp-content').style.display = 'none';

    // 매물 상세 API 호출
    fetch(`${CONFIG.API_BASE_URL}/api/v1/properties/${prop.id}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            renderConsultingPanel(data);
        })
        .catch(() => {
            // API 실패 시 목록 데이터로 렌더링
            renderConsultingPanel(prop);
        });
}

function closeConsultingPanel() {
    document.getElementById('consulting-panel').classList.remove('open');
    currentPropertyData = null;
}

function renderConsultingPanel(prop) {
    document.getElementById('cp-loading').style.display = 'none';
    document.getElementById('cp-content').style.display = 'block';

    // 이미지
    const imagesEl = document.getElementById('cp-images');
    if (prop.before_image && prop.after_image) {
        imagesEl.innerHTML = `
            <div class="cp-image-box">
                <div class="cp-image-label">Before</div>
                <img src="${prop.before_image}" alt="시공 전">
            </div>
            <div class="cp-image-box">
                <div class="cp-image-label">After</div>
                <img src="${prop.after_image}" alt="시공 후">
            </div>`;
    } else if (prop.after_image || prop.before_image || prop.thumb) {
        const img = prop.after_image || prop.before_image || prop.thumb;
        imagesEl.innerHTML = `<div class="cp-image-box"><img src="${img}" alt="매물 이미지"></div>`;
    } else {
        imagesEl.innerHTML = `<div class="cp-image-placeholder"><i class="ri-building-4-line"></i></div>`;
    }

    // 가격
    const formattedPrice = window.formatPriceToKorean ? window.formatPriceToKorean(prop.price) : (prop.price || '-');
    document.getElementById('cp-price').textContent = formattedPrice;

    // 제목 & 주소
    document.getElementById('cp-title').textContent = prop.title || '-';
    document.getElementById('cp-address').textContent = getDisplayAddress(prop);

    // 상세 보기 버튼
    const detailBtn = document.getElementById('cp-btn-detail');
    detailBtn.onclick = () => {
        const hasHtmlExt = window.location.pathname.endsWith('.html');
        const targetPath = hasHtmlExt ? '/properties.html' : '/properties';
        window.location.href = `${targetPath}?id=${prop.id}&pnu=${prop.pnu || ''}`;
    };

    // 프리미엄 상담 신청 버튼 (오른쪽 패널)
    document.getElementById('cp-btn-consult').onclick = async () => {
        if (typeof window.requestPremiumConsultation === 'function') {
            await window.requestPremiumConsultation({
                type: 'PROPERTY',
                propertyId: prop.id,
                pnu: prop.pnu,
                address: prop.address
            });
        } else {
            alert('상담 신청 기능을 불러올 수 없습니다.');
        }
    };
}

// ────────────────────────────────────────
// 지도 클릭 핸들러
// ────────────────────────────────────────
function handleMapClick(coord, skipClickMarker, fixedPnu) {
    // 클릭 마커 표시
    if (!skipClickMarker) {
        if (clickMarker) clickMarker.setMap(null);
        clickMarker = new naver.maps.Marker({
            position: coord,
            map: map,
            icon: {
                content: '<div class="click-marker"><i class="ri-map-pin-fill"></i></div>',
                anchor: new naver.maps.Point(12, 28)
            }
        });
    }

    // 패널 열고 로딩 상태로 초기화
    openPanel();
    setPanelLoading(true);

    // 역지오코딩으로 주소 조회
    naver.maps.Service.reverseGeocode(
        { coords: coord, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR] },
        function(status, response) {
            if (status !== naver.maps.Service.Status.OK) {
                setPanelLoading(false);
                showPanelError('주소 정보를 가져올 수 없습니다.');
                return;
            }

            const results = response.v2.results;
            let jibunAddress = '';
            let roadAddress = '';
            let pnu = (typeof fixedPnu === 'string' ? fixedPnu.trim() : '');

            results.forEach(function(r) {
                if (r.name === 'addr') {
                    const region = r.region;
                    const land = r.land;
                    jibunAddress = [
                        region.area1.name,
                        region.area2.name,
                        region.area3.name,
                        region.area4.name,
                        land ? (land.number1 + (land.number2 ? '-' + land.number2 : '')) : ''
                    ].filter(Boolean).join(' ');

                    // PNU 생성: 법정동코드(10) + 구분(1) + 본번(4) + 부번(4)
                    const codeId = r.code && r.code.id ? r.code.id : '';
                    const landType = land && land.type ? land.type : '1';
                    const num1 = land && land.number1 ? String(land.number1).padStart(4, '0') : '0000';
                    const num2 = land && land.number2 ? String(land.number2).padStart(4, '0') : '0000';
                    if (!pnu) {
                        pnu = codeId + landType + num1 + num2;
                    }
                } else if (r.name === 'roadaddr') {
                    const region = r.region;
                    const land = r.land;
                    roadAddress = [
                        region.area1.name,
                        region.area2.name,
                        land ? land.name : '',
                        land ? land.number1 : ''
                    ].filter(Boolean).join(' ');
                }
            });

            // 주소 섹션 표시
            currentPanelPnu = pnu;
            currentPanelAddress = jibunAddress;
            document.getElementById('panel-jibun-address').textContent = jibunAddress || '주소 미확인';
            document.getElementById('panel-road-address').textContent = roadAddress ? '도로명: ' + roadAddress : '도로명 정보 없음';
            document.getElementById('panel-address-section').style.display = 'block';
            document.getElementById('panel-tabs').style.display = 'flex';

            // PNU가 없으면 DB 조회 불가
            if (!pnu || pnu.length !== 19) {
                setPanelLoading(false);
                showPanelError('필지 정보를 확인할 수 없습니다.');
                return;
            }

            // 백엔드 위치 정보 API 호출 (PNU 기반)
            fetch(`${CONFIG.API_BASE_URL}/api/v1/public-data/location-info?pnu=${encodeURIComponent(pnu)}`)
                .then(function(res) { return res.json(); })
                .then(function(json) {
                    setPanelLoading(false);
                    if (json.success && json.data) {
                        renderLocationInfo(json.data);
                    } else {
                        showPanelError('해당 필지의 건물·토지 정보가 없습니다.');
                    }
                })
                .catch(function(err) {
                    console.error('[panel] location-info API error:', err);
                    setPanelLoading(false);
                    showPanelError('정보를 불러오는 중 오류가 발생했습니다.');
                });
        }
    );
}

async function loadAiNewbuildAnalysis(pnu) {
    const el = document.getElementById('ai-newbuild-response');
    if (!el || !pnu || aiNewbuildRequestPending) {
        return;
    }

    setAiNewbuildLoading(true);

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/public-data/ai-newbuild?pnu=${encodeURIComponent(pnu)}`);
        const json = await res.json();

        if (json.success && json.data && json.data.summary) {
            el.innerHTML = renderAiMarkdown(json.data.summary);
            return;
        }

        el.textContent = 'AI 분석 결과를 불러오지 못했습니다.';
    } catch (e) {
        console.error('[panel] ai-newbuild API error:', e);
        el.textContent = '네트워크 오류로 AI 분석을 불러오지 못했습니다.';
    } finally {
        setAiNewbuildLoading(false);
    }
}

function setAiNewbuildLoading(isLoading) {
    aiNewbuildRequestPending = isLoading;

    const loadingEl = document.getElementById('ai-newbuild-loading');
    if (loadingEl) {
        loadingEl.style.display = isLoading ? 'inline-flex' : 'none';
    }

    const requestBtn = document.getElementById('btn-ai-newbuild-request');
    if (requestBtn) {
        requestBtn.disabled = isLoading;
        requestBtn.style.display = isLoading ? 'none' : 'inline-flex';
    }
}

function resetAiNewbuildPanel() {
    setAiNewbuildLoading(false);

    const aiNewBuildResponseEl = document.getElementById('ai-newbuild-response');
    if (aiNewBuildResponseEl) {
        aiNewBuildResponseEl.textContent = 'AI 응답이 준비되면 이 영역에 표시됩니다.';
    }
}

function renderAiMarkdown(markdown) {
    if (typeof markdown !== 'string' || !markdown.trim()) {
        return '';
    }

    const escaped = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const lines = escaped.split(/\r?\n/);
    const html = [];
    let inList = false;

    const closeListIfOpen = function() {
        if (inList) {
            html.push('</ul>');
            inList = false;
        }
    };

    lines.forEach(function(line) {
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);

        if (!line.trim()) {
            closeListIfOpen();
            return;
        }

        if (heading) {
            closeListIfOpen();
            const level = Math.min(heading[1].length + 2, 6);
            html.push(`<h${level}>${applyInlineMarkdown(heading[2])}</h${level}>`);
            return;
        }

        if (bullet) {
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            html.push(`<li>${applyInlineMarkdown(bullet[1])}</li>`);
            return;
        }

        closeListIfOpen();
        html.push(`<p>${applyInlineMarkdown(line)}</p>`);
    });

    closeListIfOpen();
    return html.join('');
}

function applyInlineMarkdown(text) {
    return text
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// ────────────────────────────────────────
// 패널 제어 함수
// ────────────────────────────────────────
function openPanel() {
    document.getElementById('map-panel').classList.add('open');
    document.body.classList.add('panel-open');
}

function closePanel() {
    document.getElementById('map-panel').classList.remove('open');
    document.body.classList.remove('panel-open');
    currentPanelPnu = null;
    currentPanelAddress = null;
    resetAiNewbuildPanel();
    if (clickMarker) {
        clickMarker.setMap(null);
        clickMarker = null;
    }
}

function setPanelLoading(isLoading) {
    document.getElementById('panel-loading').style.display = isLoading ? 'flex' : 'none';
    if (isLoading) {
        document.getElementById('panel-remaining-far').textContent = '-';
        document.getElementById('panel-teojabi-score').textContent = '-';
        document.getElementById('panel-address-section').style.display = 'none';
        document.getElementById('panel-tabs').style.display = 'none';
        document.getElementById('panel-tab-building').style.display = 'none';
        document.getElementById('panel-tab-ai-newbuild').style.display = 'none';
        document.getElementById('panel-tab-land').style.display = 'none';
        document.getElementById('panel-tab-floor').style.display = 'none';
    }
}

function showPanelError(message) {
    const loading = document.getElementById('panel-loading');
    document.getElementById('panel-tabs').style.display = 'none';
    document.getElementById('panel-tab-building').style.display = 'none';
    document.getElementById('panel-tab-ai-newbuild').style.display = 'none';
    document.getElementById('panel-tab-land').style.display = 'none';
    document.getElementById('panel-tab-floor').style.display = 'none';
    loading.style.display = 'flex';
    loading.innerHTML = `<p style="color:var(--danger-color);"><i class="ri-error-warning-line"></i> ${message}</p>`;
}

// ────────────────────────────────────────
// 위치 정보 렌더링
// ────────────────────────────────────────
function renderLocationInfo(data) {
    const b = data.building || {};
    const l = data.land || null;
    const floors = data.floorStatuses || [];
    const stores = data.stores || [];
    const metrics = data.metrics || {};

    resetAiNewbuildPanel();

    function formatMetricValue(value, suffix) {
        if (value == null) {
            return '-';
        }

        var numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue === 0) {
            return '-';
        }

        return Math.trunc(numericValue).toLocaleString() + suffix;
    }

    document.getElementById('panel-remaining-far').textContent = formatMetricValue(metrics.remainingFar, '%');
    document.getElementById('panel-teojabi-score').textContent = formatMetricValue(metrics.teojabiScore, '점');

    // 건물 기본정보
    document.getElementById('b-name').textContent            = b.name || '-';
    document.getElementById('b-main-purpose').textContent    = b.mainPurpose || '-';
    document.getElementById('b-structure').textContent       = b.structure || '-';
    document.getElementById('b-approval-date').textContent   = b.approvalDate || '-';

    // 건물 면적/규모
    document.getElementById('b-plat-area').textContent       = b.platArea ? Number(b.platArea).toLocaleString() + ' ㎡' : '-';
    document.getElementById('b-arch-area').textContent       = b.archArea ? Number(b.archArea).toLocaleString() + ' ㎡' : '-';
    document.getElementById('b-total-floor-area').textContent = b.totalFloorArea ? Number(b.totalFloorArea).toLocaleString() + ' ㎡' : '-';
    document.getElementById('b-coverage-ratio').textContent  = b.buildingCoverageRatio ? Number(b.buildingCoverageRatio).toFixed(2) + ' %' : '-';
    document.getElementById('b-floor-area-ratio').textContent = b.floorAreaRatio ? Number(b.floorAreaRatio).toFixed(2) + ' %' : '-';
    document.getElementById('b-ground-floors').textContent   = b.groundFloors != null ? b.groundFloors + '층' : '-';
    document.getElementById('b-underground-floors').textContent = b.undergroundFloors != null ? b.undergroundFloors + '층' : '-';
    document.getElementById('b-height').textContent            = b.buildingHeight != null ? Number(b.buildingHeight).toLocaleString() + ' m' : '-';

    // 토지 정보
    if (l) {
        document.getElementById('l-land-category').textContent = l.jimok || '-';
        document.getElementById('l-land-area').textContent = l.platArea ? Number(l.platArea).toLocaleString() + ' ㎡' : '-';

        // 법정 건폐율/용적률
        if (l.regulation) {
            document.getElementById('l-bcr-limit').textContent = Number(l.regulation.bcrLimit).toFixed(1) + ' %';
            document.getElementById('l-far-limit').textContent = Number(l.regulation.farLimit).toFixed(1) + ' %' + (l.regulation.farLimitNote ? ' (' + l.regulation.farLimitNote + ')' : '');
        } else {
            document.getElementById('l-bcr-limit').textContent = '-';
            document.getElementById('l-far-limit').textContent = '-';
        }

        // 용도지역지구 목록
        var zoneListEl = document.getElementById('l-zone-list');
        if (l.zoneTypes && l.zoneTypes.length > 0) {
            zoneListEl.innerHTML = l.zoneTypes.map(function(z) {
                return '<div class="panel-zone-item">' +
                    '<span class="panel-zone-name">' + (z.name || '-') + '</span>' +
                    (z.note ? '<span class="panel-zone-note">' + z.note + '</span>' : '') +
                    '</div>';
            }).join('');
        } else {
            zoneListEl.innerHTML = '<p class="panel-empty-msg">용도지역 정보가 없습니다.</p>';
        }

        // 연도별 공시지가
        var priceListEl = document.getElementById('l-price-list');
        var priceChartEl = document.getElementById('l-price-chart');
        if (l.officialPrices && l.officialPrices.length > 0) {
            // 연도 오름차순 정렬
            var sorted = l.officialPrices.slice().sort(function(a, b) { return a.year - b.year; });
            priceListEl.innerHTML = sorted.map(function(p) {
                return '<div class="panel-price-row">' +
                    '<span class="panel-price-year">' + p.year + '년</span>' +
                    '<span class="panel-price-value">' + Number(p.pricePerSqm).toLocaleString() + ' 원/㎡</span>' +
                    '</div>';
            }).join('');

            // 꺾은선 차트
            priceChartEl.style.display = 'block';
            if (window._priceChart) { window._priceChart.destroy(); }
            window._priceChart = new Chart(priceChartEl, {
                type: 'line',
                data: {
                    labels: sorted.map(function(p) { return p.year + ''; }),
                    datasets: [{
                        label: '공시지가 (원/㎡)',
                        data: sorted.map(function(p) { return p.pricePerSqm; }),
                        borderColor: '#4A7CFE',
                        backgroundColor: 'rgba(74,124,254,0.1)',
                        fill: true,
                        tension: 0,
                        pointRadius: 4,
                        pointBackgroundColor: '#4A7CFE'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) { return Number(ctx.raw).toLocaleString() + ' 원/㎡'; }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            ticks: { callback: function(v) { return (v / 10000).toLocaleString() + '만'; } },
                            grid: { color: 'rgba(0,0,0,0.06)' }
                        }
                    }
                }
            });
        } else {
            priceListEl.innerHTML = '<p class="panel-empty-msg">공시지가 정보가 없습니다.</p>';
            priceChartEl.style.display = 'none';
        }
    } else {
        document.getElementById('l-land-category').textContent = '-';
        document.getElementById('l-land-area').textContent = '-';
        document.getElementById('l-bcr-limit').textContent = '-';
        document.getElementById('l-far-limit').textContent = '-';
    }

    // 층별현황 렌더링
    var floorListEl = document.getElementById('floor-list');
    if (floors.length > 0) {
        floorListEl.innerHTML = floors.map(function(f) {
            return '<div class="panel-floor-item">' +
                '<span class="panel-floor-no">' + (f.flrNoNm || (f.flrNo != null ? f.flrNo + '층' : '-')) + '</span>' +
                '<span class="panel-floor-purps">' + (f.flrMainPurps || '-') + '</span>' +
                '<span class="panel-floor-area">' + (f.flrArea ? Number(f.flrArea).toLocaleString() + ' ㎡' : '-') + '</span>' +
                '</div>';
        }).join('');
    } else {
        floorListEl.innerHTML = '<p class="panel-empty-msg">층별 정보가 없습니다.</p>';
    }

    // 상가 렌더링
    var storeListEl = document.getElementById('store-list');
    if (stores.length > 0) {
        storeListEl.innerHTML = stores.map(function(s) {
            return '<div class="panel-store-item">' +
                '<span class="panel-store-nm">' + (s.storeNm || '-') + '</span>' +
                '<span class="panel-store-cate">' + [s.cateLargeNm, s.cateMidNm].filter(Boolean).join(' > ') + '</span>' +
                '<span class="panel-store-loc">' + (s.flrNo ? s.flrNo + '층' : '') + (s.hoNo ? ' ' + s.hoNo + '호' : '') + '</span>' +
                '</div>';
        }).join('');
    } else {
        storeListEl.innerHTML = '<p class="panel-empty-msg">상가 정보가 없습니다.</p>';
    }

    // 건물 탭을 기본으로 활성화
    document.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelector('.panel-tab[data-tab="building"]').classList.add('active');
    document.getElementById('panel-tab-building').style.display = 'block';
    document.getElementById('panel-tab-ai-newbuild').style.display = 'none';
    document.getElementById('panel-tab-land').style.display = 'none';
    document.getElementById('panel-tab-floor').style.display = 'none';
}
// ────────────────────────────────────────
// 터잡이 레이어(GeoJSON)
// ────────────────────────────────────────
const teojabiState = {
    isActive: false,
    layer: null,
    debugBox: null,
    abortController: null,
    requestSeq: 0,
    listeners: {
        idle: null,
        zoomChanged: null,
        dragStart: null
    }
};

function createTeojabiLayer() {
    const layer = new naver.maps.Data();
    layer.setStyle(function(f) {
        const color = getTeojabiColor(f.getProperty("scoreGrade"));
        return {
            fillColor: color,
            fillOpacity: 0.6,
            strokeColor: color,
            strokeWeight: 1,
            zIndex: 100,
            clickable: true
        };
    });

    naver.maps.Event.addListener(layer, 'click', function(e) {
        if (!teojabiState.isActive) return;

        const coord = e && (e.coord || e.latLng);
        if (!coord) return;

        const featurePnu = e.feature && typeof e.feature.getProperty === 'function'
            ? String(e.feature.getProperty('pnu') || '').trim()
            : '';

        handleMapClick(coord, false, featurePnu);
    });

    return layer;
}

function ensureTeojabiLayer() {
    if (!teojabiState.layer) {
        teojabiState.layer = createTeojabiLayer();
    }
}

function abortTeojabiRequest() {
    if (teojabiState.abortController) {
        teojabiState.abortController.abort();
        teojabiState.abortController = null;
    }
}

function clearTeojabiDebugBox() {
    if (teojabiState.debugBox) {
        teojabiState.debugBox.setMap(null);
    }
}

function updateTeojabiDebugBox(bounds) {
    if (!teojabiState.debugBox) {
        teojabiState.debugBox = new naver.maps.Rectangle({
            map: map,
            bounds: bounds,
            strokeColor: '#0000ff',
            strokeWeight: 2,
            fillOpacity: 0,
            clickable: false
        });
        return;
    }

    teojabiState.debugBox.setBounds(bounds);
    teojabiState.debugBox.setMap(map);
}

function detachTeojabiLayer() {
    if (teojabiState.layer) {
        teojabiState.layer.setMap(null);
    }
}

function swapTeojabiLayer(nextLayer) {
    const prevLayer = teojabiState.layer;
    teojabiState.layer = nextLayer;

    if (teojabiState.isActive) {
        teojabiState.layer.setMap(map);
    }

    if (prevLayer) {
        prevLayer.setMap(null);
    }
}

function resetTeojabiLayerEmpty() {
    const emptyLayer = createTeojabiLayer();
    swapTeojabiLayer(emptyLayer);
}

function removeTeojabiListeners() {
    if (teojabiState.listeners.idle) {
        naver.maps.Event.removeListener(teojabiState.listeners.idle);
        teojabiState.listeners.idle = null;
    }
    if (teojabiState.listeners.zoomChanged) {
        naver.maps.Event.removeListener(teojabiState.listeners.zoomChanged);
        teojabiState.listeners.zoomChanged = null;
    }
    if (teojabiState.listeners.dragStart) {
        naver.maps.Event.removeListener(teojabiState.listeners.dragStart);
        teojabiState.listeners.dragStart = null;
    }
}

/**
 * 터잡이 레이어 데이터를 백엔드에서 가져와 갱신합니다.
 */
async function updateTeojabiLayer() {
    if (!teojabiState.isActive) return;

    const zoom = map.getZoom();
    if (zoom < 17) {
        abortTeojabiRequest();
        clearTeojabiDebugBox();
        resetTeojabiLayerEmpty();
        return;
    }

    beginMapAsyncWait();

    const bounds = map.getBounds();
    const sw = bounds.getSW();
    const ne = bounds.getNE();

    updateTeojabiDebugBox(bounds);
    console.log(`[teojabi-layer] Request Update - Zoom: ${zoom}`);

    abortTeojabiRequest();
    const controller = new AbortController();
    teojabiState.abortController = controller;
    const requestSeq = ++teojabiState.requestSeq;

    try {
        const url = `${CONFIG.API_BASE_URL}/api/v1/public-data/score-layer?minLat=${sw.lat()}&minLng=${sw.lng()}&maxLat=${ne.lat()}&maxLng=${ne.lng()}`;
        const res = await fetch(url, { signal: controller.signal });
        const json = await res.json();

        if (controller.signal.aborted) return;
        if (requestSeq !== teojabiState.requestSeq) return;
        if (!teojabiState.isActive || map.getZoom() < 17) return;

        if (!json.success || !json.data) {
            console.warn("[teojabi-layer] Invalid response payload", json);
            return;
        }

        const nextLayer = createTeojabiLayer();
        const features = Array.isArray(json.data.features) ? json.data.features : [];

        if (features.length > 0) {
            nextLayer.addGeoJson(json.data);
            console.log(`[teojabi-layer] Render Success: ${features.length} features added.`);
        } else {
            console.log("[teojabi-layer] No features found in this area.");
        }

        if (requestSeq !== teojabiState.requestSeq) return;
        if (!teojabiState.isActive || map.getZoom() < 17) return;

        swapTeojabiLayer(nextLayer);
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log("[teojabi-layer] Request aborted by new interaction");
        } else {
            console.error("[teojabi-layer] Update failed:", e);
        }
    } finally {
        if (teojabiState.abortController === controller) {
            teojabiState.abortController = null;
        }
        endMapAsyncWait();
    }
}

/**
 * 등급 점수에 따른 색상을 반환합니다.
 */
function getTeojabiColor(grade) {
    const s = Number(grade);
    if (s == 100) return '#F44336';
    if (s >= 95) return '#E53935';
    if (s >= 90) return '#F4511E';
    if (s >= 85) return '#FB8C00';
    if (s >= 80) return '#FDD835';
    if (s >= 75) return '#FFEB3B';
    if (s >= 70) return '#FFF176';
    if (s >= 65) return '#DCE775';
    if (s >= 60) return '#CDDC39';
    if (s >= 55) return '#8BC34A';
    return '#4CAF50';
}

/**
 * 터잡이 레이어 초기화 및 이벤트 바인딩
 */
function addTeojabiEvents() {
    ensureTeojabiLayer();

    document.getElementById("btn-ctrl-teojabi").addEventListener("click", function() {
        if (teojabiState.isActive) {
            teojabiState.isActive = false;
            this.classList.remove("active");
            abortTeojabiRequest();
            removeTeojabiListeners();
            clearTeojabiDebugBox();
            detachTeojabiLayer();
            resetTeojabiLayerEmpty();
        } else {
            if (map.getZoom() < 17) {
                alert("터잡이 레이어는 줌 레벨 17 이상에서만 확인할 수 있습니다. 지도를 확대해 주세요.");
                return;
            }

            teojabiState.isActive = true;
            this.classList.add("active");

            ensureTeojabiLayer();
            teojabiState.layer.setMap(map);

            updateTeojabiLayer();

            teojabiState.listeners.idle = naver.maps.Event.addListener(map, "idle", function() {
                updateTeojabiLayer();
            });

            teojabiState.listeners.zoomChanged = naver.maps.Event.addListener(map, "zoom_changed", function() {
                if (!teojabiState.isActive) return;
                abortTeojabiRequest();
                if (map.getZoom() < 17) {
                    clearTeojabiDebugBox();
                    resetTeojabiLayerEmpty();
                }
            });

            teojabiState.listeners.dragStart = naver.maps.Event.addListener(map, "dragstart", function() {
                if (!teojabiState.isActive) return;
                abortTeojabiRequest();
            });
        }
    });
}

