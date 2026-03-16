// js/pages/search.js
// 네이버 지도 검색 화면 메인 로직

// ────────────────────────────────────────
// 전역 상태
// ────────────────────────────────────────
let map = null;
let isCadastralOn = false;
let cadastralLayer = null;
let propertyMarkers = [];
let currentPanelType = null; // 'land' | 'property'
let debounceTimer = null;
let searchResults = [];           // geocode 자동완성 결과 캐시
let activeAutocompleteIdx = -1;   // 키보드 탐색용

const API_BASE = 'http://localhost:3001/api/v1';
const BACKEND_PROXY_SEARCH = `${API_BASE}/search/local`; // 추후 백엔드 구현 시 활성화

// ────────────────────────────────────────
// 진입점: 네이버 지도 SDK 로드 콜백
// ────────────────────────────────────────
function initMap() {
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780), // 서울 시청
        zoom: 15,
        zoomControl: true,
        zoomControlOptions: {
            style: naver.maps.ZoomControlStyle.SMALL,
            position: naver.maps.Position.RIGHT_CENTER,
        },
        mapTypeControl: true,
        mapTypeControlOptions: {
            style: naver.maps.MapTypeControlStyle.BUTTON,
            position: naver.maps.Position.TOP_RIGHT,
        },
    };

    map = new naver.maps.Map('map-container', mapOptions);

    // 지적도 레이어 준비 (숨김 상태)
    cadastralLayer = new naver.maps.CadastralLayer();

    bindMapEvents();
    bindMapClick();
    initSearchBar();

    // 초기 뷰에서 매물 마커 한 번 로드
    fetchPropertiesInBounds();
}

// ────────────────────────────────────────
// 지도 이벤트 바인딩
// ────────────────────────────────────────
function bindMapEvents() {
    naver.maps.Event.addListener(map, 'dragend', fetchPropertiesInBounds);
    naver.maps.Event.addListener(map, 'zoom_changed', fetchPropertiesInBounds);
}

// ────────────────────────────────────────
// 백엔드 매물 마커 로드
// ────────────────────────────────────────
async function fetchPropertiesInBounds() {
    const bounds = map.getBounds();
    const ne = bounds.getNE();
    const sw = bounds.getSW();

    try {
        const res = await fetch(
            `${API_BASE}/properties/map?ne=${ne.lat()},${ne.lng()}&sw=${sw.lat()},${sw.lng()}`,
            { credentials: 'include' }
        );
        if (!res.ok) return;
        const data = await res.json();
        renderPropertyMarkers(data);
    } catch (err) {
        // 백엔드 미연결 시 무시 (지도는 정상 동작)
        console.debug('[search] fetchPropertiesInBounds skipped:', err.message);
    }
}

// ────────────────────────────────────────
// 커스텀 마커 렌더링
// ────────────────────────────────────────
function renderPropertyMarkers(properties) {
    // 기존 마커 전부 제거
    propertyMarkers.forEach(m => m.setMap(null));
    propertyMarkers = [];

    if (!Array.isArray(properties)) return;

    properties.forEach(prop => {
        if (!prop.lat || !prop.lng) return;

        const priceLabel = formatPrice(prop.price);
        const markerContent = `
            <div class="custom-marker">
                <div class="custom-marker-bubble">${priceLabel}</div>
                <div class="custom-marker-tail"></div>
            </div>`;

        const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(prop.lat, prop.lng),
            map,
            icon: {
                content: markerContent,
                anchor: new naver.maps.Point(0, 0),
            },
        });

        naver.maps.Event.addListener(marker, 'click', () => {
            openPropertyPanel(prop);
        });

        propertyMarkers.push(marker);
    });
}

// ────────────────────────────────────────
// 지도 클릭 → 일반 위치(땅) 정보 조회
// ────────────────────────────────────────
function bindMapClick() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        const latlng = e.coord;
        reversGeocodeAndOpenPanel(latlng);
    });
}

function reversGeocodeAndOpenPanel(latlng) {
    setLandPanelLoading();
    naver.maps.Service.reverseGeocode(
        {
            coords: latlng,
            orders: [
                naver.maps.Service.OrderType.ADDR,
                naver.maps.Service.OrderType.ROAD_ADDR,
            ].join(','),
        },
        (status, response) => {
            if (status !== naver.maps.Service.Status.OK) {
                openLandPanel({ address: '주소를 불러올 수 없습니다.', roadAddress: '', latlng });
                return;
            }
            const result = response.v2?.address || {};
            openLandPanel({
                address: result.jibunAddress || '지번 주소 없음',
                roadAddress: result.roadAddress || '',
                latlng,
            });
        }
    );
}

// ────────────────────────────────────────
// 패널 열기/닫기
// ────────────────────────────────────────
function openLandPanel(data) {
    currentPanelType = 'land';
    const panel = document.getElementById('map-panel');
    const titleEl = panel.querySelector('.panel-title');
    const bodyEl = panel.querySelector('.panel-body');
    const ctaEl = document.getElementById('panel-cta');

    titleEl.innerHTML = `<i class="ri-map-pin-2-line"></i> 토지 정보`;
    ctaEl.classList.add('hidden');

    bodyEl.innerHTML = `
        <div class="panel-address-section">
            <div class="panel-address-tag"><i class="ri-map-pin-fill"></i> 지번 주소</div>
            <div class="panel-address-main">${data.address}</div>
            ${data.roadAddress ? `<div class="panel-address-sub">도로명: ${data.roadAddress}</div>` : ''}
            <div class="panel-address-sub" style="margin-top:6px;color:var(--text-muted);font-size:0.78rem;">
                위도 ${data.latlng.lat().toFixed(6)} / 경도 ${data.latlng.lng().toFixed(6)}
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-title">공공데이터 (준비 중)</div>
            <div class="panel-info-grid">
                <div class="panel-info-card">
                    <div class="panel-info-card-label">공시지가</div>
                    <div class="panel-info-card-value">-</div>
                </div>
                <div class="panel-info-card">
                    <div class="panel-info-card-label">실거래가</div>
                    <div class="panel-info-card-value">-</div>
                </div>
                <div class="panel-info-card">
                    <div class="panel-info-card-label">토지이용규제</div>
                    <div class="panel-info-card-value">-</div>
                </div>
                <div class="panel-info-card">
                    <div class="panel-info-card-label">지목</div>
                    <div class="panel-info-card-value">-</div>
                </div>
            </div>
        </div>

        <p style="font-size:0.8rem;color:var(--text-muted);text-align:center;margin-top:16px;">
            공공데이터 API 연동 후 자동으로 표시됩니다.
        </p>
    `;

    panel.classList.add('open');
}

function openPropertyPanel(prop) {
    currentPanelType = 'property';
    const panel = document.getElementById('map-panel');
    const titleEl = panel.querySelector('.panel-title');
    const bodyEl = panel.querySelector('.panel-body');
    const ctaEl = document.getElementById('panel-cta');

    titleEl.innerHTML = `<i class="ri-building-2-line"></i> 매물 정보`;
    ctaEl.classList.remove('hidden');

    const imageHtml = prop.imageUrl
        ? `<div class="panel-property-images"><img src="${prop.imageUrl}" alt="매물 이미지"></div>`
        : `<div class="panel-property-images" style="display:flex;align-items:center;justify-content:center;background:var(--bg-muted);">
                <i class="ri-image-line" style="font-size:2.5rem;color:var(--border-color);"></i>
           </div>`;

    bodyEl.innerHTML = `
        ${imageHtml}

        <div class="panel-property-price">${formatPrice(prop.price)}</div>
        <div class="panel-property-price-label">${prop.priceType || '매매가'}</div>

        <div class="panel-tag-row">
            ${prop.landType ? `<span class="panel-tag primary">${prop.landType}</span>` : ''}
            ${prop.area ? `<span class="panel-tag">${prop.area}㎡</span>` : ''}
            ${prop.zoning ? `<span class="panel-tag">${prop.zoning}</span>` : ''}
        </div>

        <div class="panel-address-section" style="margin-bottom:16px;">
            <div class="panel-address-tag"><i class="ri-map-pin-fill"></i> 위치</div>
            <div class="panel-address-main">${prop.address || '주소 정보 없음'}</div>
        </div>

        ${prop.description ? `<div class="panel-description">${prop.description}</div>` : ''}

        <div class="panel-section">
            <div class="panel-section-title">공공데이터</div>
            <div class="panel-info-grid">
                <div class="panel-info-card">
                    <div class="panel-info-card-label">공시지가</div>
                    <div class="panel-info-card-value">${prop.officialPrice || '-'}</div>
                </div>
                <div class="panel-info-card">
                    <div class="panel-info-card-label">실거래가</div>
                    <div class="panel-info-card-value">${prop.dealPrice || '-'}</div>
                </div>
            </div>
        </div>
    `;

    panel.classList.add('open');
}

function setLandPanelLoading() {
    const panel = document.getElementById('map-panel');
    const titleEl = panel.querySelector('.panel-title');
    const bodyEl = panel.querySelector('.panel-body');
    const ctaEl = document.getElementById('panel-cta');

    titleEl.innerHTML = `<i class="ri-map-pin-2-line"></i> 토지 정보`;
    ctaEl.classList.add('hidden');
    bodyEl.innerHTML = `
        <div class="panel-loading">
            <i class="ri-loader-4-line"></i>
            <span>주소를 불러오는 중...</span>
        </div>`;

    panel.classList.add('open');
}

function closePanel() {
    const panel = document.getElementById('map-panel');
    panel.classList.remove('open');
    currentPanelType = null;
}

// ────────────────────────────────────────
// 지적도 레이어 토글
// ────────────────────────────────────────
function toggleCadastral() {
    const btn = document.getElementById('btn-cadastral');
    isCadastralOn = !isCadastralOn;

    if (isCadastralOn) {
        cadastralLayer.setMap(map);
        btn.classList.add('active');
        btn.querySelector('span').textContent = '지적도 ON';
    } else {
        cadastralLayer.setMap(null);
        btn.classList.remove('active');
        btn.querySelector('span').textContent = '지적도';
    }
}

// ────────────────────────────────────────
// 검색바 (주소 검색 + 자동완성)
// ────────────────────────────────────────
function initSearchBar() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('btn-search-clear');
    const submitBtn = document.getElementById('btn-search-submit');
    const dropdown = document.getElementById('search-autocomplete');

    // 입력 이벤트 → debounce 자동완성
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.classList.toggle('visible', q.length > 0);

        if (debounceTimer) clearTimeout(debounceTimer);

        if (q.length < 2) {
            closeAutocomplete();
            return;
        }

        debounceTimer = setTimeout(() => {
            runGeocodeAutocomplete(q);
        }, 300);
    });

    // 키보드 탐색 (↑↓ Enter Esc)
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeAutocompleteIdx = Math.min(activeAutocompleteIdx + 1, items.length - 1);
            highlightAutocompleteItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeAutocompleteIdx = Math.max(activeAutocompleteIdx - 1, -1);
            highlightAutocompleteItem(items);
        } else if (e.key === 'Enter') {
            if (activeAutocompleteIdx >= 0 && searchResults[activeAutocompleteIdx]) {
                selectSearchResult(searchResults[activeAutocompleteIdx]);
            } else {
                searchByQuery(input.value.trim());
            }
        } else if (e.key === 'Escape') {
            closeAutocomplete();
        }
    });

    // 클리어 버튼
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('visible');
        closeAutocomplete();
        input.focus();
    });

    // 검색 버튼
    submitBtn.addEventListener('click', () => {
        searchByQuery(input.value.trim());
    });

    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-wrapper')) {
            closeAutocomplete();
        }
    });
}

// Geocode API로 주소 자동완성 후보 가져오기
function runGeocodeAutocomplete(query) {
    naver.maps.Service.geocode({ query }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK) {
            closeAutocomplete();
            return;
        }
        const items = response.v2?.addresses || [];
        searchResults = items;
        renderAutocomplete(items);
    });
}

function renderAutocomplete(items) {
    const dropdown = document.getElementById('search-autocomplete');
    activeAutocompleteIdx = -1;

    if (!items.length) {
        closeAutocomplete();
        return;
    }

    dropdown.innerHTML = items.slice(0, 6).map((item, idx) => `
        <div class="autocomplete-item" data-idx="${idx}">
            <i class="ri-map-pin-2-line"></i>
            <div>
                <div class="autocomplete-item-text">${item.roadAddress || item.jibunAddress}</div>
                ${item.roadAddress && item.jibunAddress
                    ? `<div class="autocomplete-item-sub">${item.jibunAddress}</div>`
                    : ''}
            </div>
        </div>
    `).join('');

    dropdown.querySelectorAll('.autocomplete-item').forEach((el) => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx);
            selectSearchResult(searchResults[idx]);
        });
    });

    dropdown.classList.add('open');
}

function highlightAutocompleteItem(items) {
    items.forEach((el, i) => {
        el.classList.toggle('active', i === activeAutocompleteIdx);
    });
}

function closeAutocomplete() {
    const dropdown = document.getElementById('search-autocomplete');
    dropdown.classList.remove('open');
    activeAutocompleteIdx = -1;
}

function selectSearchResult(item) {
    const input = document.getElementById('search-input');
    input.value = item.roadAddress || item.jibunAddress;
    closeAutocomplete();

    const lat = parseFloat(item.y);
    const lng = parseFloat(item.x);
    if (!isNaN(lat) && !isNaN(lng)) {
        const latlng = new naver.maps.LatLng(lat, lng);
        map.panTo(latlng);
        map.setZoom(17);
        // 검색 결과 위치에 임시 마커
        showSearchResultMarker(latlng, item.roadAddress || item.jibunAddress);
    }
}

// 직접 검색어 입력 후 엔터/버튼
function searchByQuery(query) {
    if (!query) return;
    closeAutocomplete();

    naver.maps.Service.geocode({ query }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK || !response.v2?.addresses?.length) {
            alert(`"${query}"에 대한 검색 결과를 찾을 수 없습니다.`);
            return;
        }
        selectSearchResult(response.v2.addresses[0]);
    });
}

// 검색 결과 임시 마커 (3초 후 자동 제거)
let searchResultMarker = null;
function showSearchResultMarker(latlng, label) {
    if (searchResultMarker) searchResultMarker.setMap(null);

    searchResultMarker = new naver.maps.Marker({
        position: latlng,
        map,
        icon: {
            content: `
                <div class="custom-marker">
                    <div class="custom-marker-bubble" style="background:#10b981;">${label}</div>
                    <div class="custom-marker-tail" style="border-top-color:#10b981;"></div>
                </div>`,
            anchor: new naver.maps.Point(0, 0),
        },
    });

    setTimeout(() => {
        if (searchResultMarker) {
            searchResultMarker.setMap(null);
            searchResultMarker = null;
        }
    }, 4000);
}

// ────────────────────────────────────────
// 유틸
// ────────────────────────────────────────
function formatPrice(price) {
    if (!price && price !== 0) return '가격 문의';
    if (price >= 100000000) {
        const eok = Math.floor(price / 100000000);
        const man = Math.floor((price % 100000000) / 10000);
        return man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
    }
    if (price >= 10000) {
        return `${Math.floor(price / 10000).toLocaleString()}만`;
    }
    return price.toLocaleString() + '원';
}

// ────────────────────────────────────────
// 전역 노출 (HTML onclick 및 SDK 콜백용)
// ────────────────────────────────────────
window.initMap = initMap;
window.closePanel = closePanel;
window.toggleCadastral = toggleCadastral;
