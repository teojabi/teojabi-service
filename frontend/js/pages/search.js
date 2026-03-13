// js/pages/search.js

// 검색 페이지 전용 스크립트 모듈
document.addEventListener('DOMContentLoaded', () => {
    console.log("Search page initialized.");

    const leftPanel = document.getElementById('panel-general');
    const rightPanel = document.getElementById('panel-premium');
    const btnCloseLeft = document.getElementById('btn-close-left');
    const btnCloseRight = document.getElementById('btn-close-right');

    const contentGeneral = document.getElementById('content-general');
    const contentPremium = document.getElementById('content-premium');

    // 패널 닫기 이벤트 바인딩
    if (btnCloseLeft) {
        btnCloseLeft.addEventListener('click', () => {
            leftPanel.classList.remove('active');
        });
    }

    if (btnCloseRight) {
        btnCloseRight.addEventListener('click', () => {
            rightPanel.classList.remove('active');
        });
    }

    // --- 네이버 지도 초기화 로직 ---
    let map = null;
    if (typeof naver !== 'undefined' && naver.maps) {
        const mapOptions = {
            center: new naver.maps.LatLng(37.3595704, 127.105399), // 기본 중심 좌표 (예: 네이버 그린팩토리)
            zoom: 15, // 초기 줌 레벨
            zoomControl: true, // 줌 컨트롤 표시 여부
            zoomControlOptions: {
                position: naver.maps.Position.TOP_RIGHT
            }
        };

        // 지도를 그릴 HTML 요소의 id('naver-map')와 옵션을 전달하여 지도 객체 생성
        map = new naver.maps.Map('naver-map', mapOptions);
        console.log("Naver Map initialized successfully.");

        // 지도 클릭 이벤트 예시: 일반 지역 클릭 시 좌측 팝업
        naver.maps.Event.addListener(map, 'click', function (e) {
            // latlng에서 주소를 역지오코딩하는 로직이 향후 필요함. 현재는 임시 주소 표시
            const latlng = e.coord;
            window.simulateLeftPopup(`임시 주소 (위도: ${latlng.lat().toFixed(4)}, 경도: ${latlng.lng().toFixed(4)})`);
        });

        // --- 지적도(Cadastral Layer) 기능 ---
        let cadastralLayer = new naver.maps.CadastralLayer();
        const btnCadastral = document.getElementById('btn-cadastral');
        let isCadastralOn = false;

        if (btnCadastral) {
            btnCadastral.addEventListener('click', () => {
                isCadastralOn = !isCadastralOn;
                if (isCadastralOn) {
                    cadastralLayer.setMap(map); // 레이어 켜기
                    btnCadastral.innerHTML = '<i class="ri-map-2-fill"></i> 지적도 끄기';
                    btnCadastral.style.background = 'var(--bg-muted)';
                    btnCadastral.style.color = 'var(--text-main)';
                } else {
                    cadastralLayer.setMap(null); // 레이어 끄기
                    btnCadastral.innerHTML = '<i class="ri-map-2-line"></i> 지적도 켜기';
                    btnCadastral.style.background = 'white';
                    btnCadastral.style.color = '';
                }
            });
        }

        // --- 임시 마커 추가 (테스트용) ---
        const dummyMarker = new naver.maps.Marker({
            position: new naver.maps.LatLng(37.3596, 127.1049),
            map: map,
            title: '테스트 컨설팅 매물',
            icon: {
                content: `<div style="background-color:var(--primary-color); color:white; padding:5px 10px; border-radius:var(--radius-md); font-weight:bold; cursor:pointer; box-shadow:var(--shadow-md);">T 터잡이 매물</div>`,
                anchor: new naver.maps.Point(40, 15)
            }
        });

        // 마커 클릭 이벤트: 프리미엄 에셋(오른쪽 패널) 노출
        naver.maps.Event.addListener(dummyMarker, 'click', function (e) {
            // 이벤트 전파(버블링) 방지하여 맵 클릭 이벤트가 중복 실행되지 않게 함
            // (Naver Maps 이벤트에서는 기본적으로 리스너 레벨에서 분리됨)
            window.simulateRightPopup('demo-property-id');
        });

        // --- 주소 검색(Geocoding) 기능 초안 ---
        const inputSearch = document.getElementById('map-search-input');
        const btnSearch = document.getElementById('btn-search');

        const executeSearch = () => {
            const query = inputSearch.value.trim();
            if (!query) {
                alert('검색어를 입력해주세요.');
                return;
            }

            // NOTE: 네이버 지도 Geocode API 서브모듈(geocoder)이 HTML에 추가되어 있어야 실제 동작함.
            // 구현 예시 (실 사용시 HTML Script 태그에 &submodules=geocoder 추가 필요)
            if (naver.maps.Service && naver.maps.Service.geocode) {
                naver.maps.Service.geocode({ query: query }, function (status, response) {
                    if (status !== naver.maps.Service.Status.OK || response.v2.addresses.length === 0) {
                        return alert('검색 결과가 없습니다.');
                    }
                    const item = response.v2.addresses[0];
                    const point = new naver.maps.Point(item.x, item.y);
                    map.setCenter(point);
                    map.setZoom(16);
                });
            } else {
                alert('Geocode API 모듈이 로드되지 않았습니다.\n(테스트용: 검색된 척 중심좌표만 임의로 이동합니다)');
                map.setCenter(new naver.maps.LatLng(37.3596, 127.1049));
                map.setZoom(16);
            }
        };

        btnSearch.addEventListener('click', executeSearch);
        inputSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeSearch();
        });

    } else {
        console.warn("Naver Maps API is not loaded. Please check your NCP Client ID.");
        document.getElementById('naver-map').innerHTML = `
            <div style="display:flex; height:100%; align-items:center; justify-content:center; flex-direction:column; color: var(--text-muted);">
                <i class="ri-error-warning-line" style="font-size:3rem; margin-bottom:1rem;"></i>
                <p>네이버 지도 API를 불러올 수 없습니다.</p>
                <p style="font-size:0.9rem;">Client ID 발급 및 index.html 스크립트 연결을 확인해주세요.</p>
            </div>
        `;
    }
    // --- 지도 초기화 종료 ---

    // TODO: 네이버 지도 로드 확정 후 아래 이벤트들은 네이버 지도 Marker click 리스너 안으로 이관해야 함.
    // 시뮬레이션을 위한 임시 디버깅용 전역 함수. 실제 구현시 네이버 지도 API의 `naver.maps.Event.addListener` 사용
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
