// 네이버 지도 검색 화면 메인 로직

// ────────────────────────────────────────
// 전역 상태
// ────────────────────────────────────────
let map = null;
let cadastralLayer = null;
let searchMarker = null;
let clickMarker = null;

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

    // 탭 전환
    document.querySelectorAll('.panel-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            const target = this.getAttribute('data-tab');
            document.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            ['building', 'land', 'floor', 'store'].forEach(function(name) {
                document.getElementById('panel-tab-' + name).style.display = target === name ? 'block' : 'none';
            });
        });
    });

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

    // 지도 컨트롤: 현위치
    document.getElementById('btn-ctrl-current').addEventListener('click', function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const latlng = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
                    map.morph(latlng, 17); // 부드럽게 이동 및 줌
                },
                (err) => {
                    alert('현재 위치를 가져올 수 없습니다. 권한을 확인해 주세요.');
                }
            );
        } else {
            alert('이 브라우저는 위치 정보 기능을 지원하지 않습니다.');
        }
    });
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
// 지도 클릭 핸들러
// ────────────────────────────────────────
function handleMapClick(coord) {
    // 클릭 마커 표시
    if (clickMarker) clickMarker.setMap(null);
    clickMarker = new naver.maps.Marker({
        position: coord,
        map: map,
        icon: {
            content: '<div class="click-marker"><i class="ri-map-pin-fill"></i></div>',
            anchor: new naver.maps.Point(12, 28)
        }
    });

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
            let pnu = '';

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
                    pnu = codeId + landType + num1 + num2;
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
            document.getElementById('panel-jibun-address').textContent = jibunAddress || '주소 미확인';
            document.getElementById('panel-road-address').textContent = roadAddress ? '도로명: ' + roadAddress : '도로명 정보 없음';
            document.getElementById('panel-header-address').textContent = jibunAddress || '위치 정보';
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
    if (clickMarker) {
        clickMarker.setMap(null);
        clickMarker = null;
    }
}

function setPanelLoading(isLoading) {
    document.getElementById('panel-loading').style.display = isLoading ? 'flex' : 'none';
    if (isLoading) {
        document.getElementById('panel-address-section').style.display = 'none';
        document.getElementById('panel-tabs').style.display = 'none';
        document.getElementById('panel-tab-building').style.display = 'none';
        document.getElementById('panel-tab-land').style.display = 'none';
        document.getElementById('panel-tab-floor').style.display = 'none';
        document.getElementById('panel-tab-store').style.display = 'none';
    }
}

function showPanelError(message) {
    const loading = document.getElementById('panel-loading');
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

    // 건물 기본정보
    document.getElementById('b-name').textContent            = b.name || '-';
    document.getElementById('b-main-purpose').textContent    = b.mainPurpose || '-';
    document.getElementById('b-structure').textContent       = b.structure || '-';
    document.getElementById('b-approval-date').textContent   = b.approvalDate ? new Date(b.approvalDate).toLocaleDateString('ko-KR') : '-';

    // 건물 면적/규모
    document.getElementById('b-plat-area').textContent       = b.platArea ? Number(b.platArea).toLocaleString() + ' ㎡' : '-';
    document.getElementById('b-arch-area').textContent       = b.archArea ? Number(b.archArea).toLocaleString() + ' ㎡' : '-';
    document.getElementById('b-total-floor-area').textContent = b.totalFloorArea ? Number(b.totalFloorArea).toLocaleString() + ' ㎡' : '-';
    document.getElementById('b-coverage-ratio').textContent  = b.buildingCoverageRatio ? Number(b.buildingCoverageRatio).toFixed(2) + ' %' : '-';
    document.getElementById('b-floor-area-ratio').textContent = b.floorAreaRatio ? Number(b.floorAreaRatio).toFixed(2) + ' %' : '-';
    document.getElementById('b-ground-floors').textContent   = b.groundFloors != null ? b.groundFloors + '층' : '-';
    document.getElementById('b-underground-floors').textContent = b.undergroundFloors != null ? b.undergroundFloors + '층' : '-';

    // 토지 정보
    if (l) {
        document.getElementById('l-land-category').textContent  = l.landCategory || '-';
        document.getElementById('l-land-area').textContent      = l.landArea ? Number(l.landArea).toLocaleString() + ' ㎡' : '-';
        document.getElementById('l-zone-type').textContent      = l.zoneType || '-';
        document.getElementById('l-price-date').textContent     = l.priceDate ? new Date(l.priceDate).toLocaleDateString('ko-KR') : '-';
        document.getElementById('l-official-price').textContent = l.officialLandPrice ? Number(l.officialLandPrice).toLocaleString() + ' 원/㎡' : '-';
    } else {
        ['l-land-category', 'l-land-area', 'l-zone-type', 'l-price-date', 'l-official-price'].forEach(function(id) {
            document.getElementById(id).textContent = '-';
        });
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
    document.getElementById('panel-tab-land').style.display = 'none';
    document.getElementById('panel-tab-floor').style.display = 'none';
    document.getElementById('panel-tab-store').style.display = 'none';
}
