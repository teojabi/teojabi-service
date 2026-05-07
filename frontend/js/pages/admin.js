

import { checkAuthStatus, authState } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 권한 체크: ADMIN이 아니면 홈으로 튕겨냄
    await checkAuthStatus();
    if (!authState.isAuthenticated || authState.user?.role !== 'ADMIN') {
        alert('관리자 권한이 필요합니다.');
        window.location.href = '/';
        return;
    }

    // --- 매물 목록 조회 컨테이너 (switchTab 내 fetchMyProperties 호출을 위해 먼저 선언)
    const propertyListContainer = document.getElementById('property-list-container');

    // 탭 전환 함수
    function switchTab(targetId) {
        const navItems = document.querySelectorAll('.admin-nav .nav-item');
        const panels = document.querySelectorAll('.admin-content .panel');

        navItems.forEach(nav => nav.classList.remove('active'));
        const activeNav = document.querySelector(`.admin-nav .nav-item[data-target="${targetId}"]`);
        if (activeNav) activeNav.classList.add('active');

        panels.forEach(panel => {
            if (panel.id === targetId) {
                panel.classList.remove('hidden');
                if (targetId === 'prop-manage') {
                    fetchMyProperties();
                } else if (targetId === 'reserv-manage') {
                    fetchReservations();
                } else if (targetId === 'settings-manage') {
                    fetchSettings();
                }
            } else {
                panel.classList.add('hidden');
            }
        });

        // 모바일 드롭다운 닫기
        const dropdown = document.getElementById('mobile-user-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    // sessionStorage 또는 URL 쿼리 파라미터로 초기 탭 설정 (없으면 prop-manage가 기본)
    const urlParams = new URLSearchParams(window.location.search);
    const savedTab = sessionStorage.getItem('adminTab');
    sessionStorage.removeItem('adminTab');
    const initialTab = savedTab || urlParams.get('tab') || 'prop-manage';
    switchTab(initialTab);

    // 탭 전환 로직 (사이드바 nav)
    const navItems = document.querySelectorAll('.admin-nav .nav-item');
    const panels = document.querySelectorAll('.admin-content .panel');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchTab(item.getAttribute('data-target'));
        });
    });

    // --- 매물 목록 조회 및 렌더링 ---
    const btnRefreshProperties = document.getElementById('btn-refresh-properties');

    if (btnRefreshProperties) {
        btnRefreshProperties.addEventListener('click', fetchMyProperties);
    }

    const btnGoPropRegister = document.getElementById('btn-go-prop-register');
    if (btnGoPropRegister) {
        btnGoPropRegister.addEventListener('click', () => {
            // 폼 초기화 (수정 모드 잔여 데이터 제거)
            const form = document.getElementById('property-form');
            if (form) {
                form.reset();
                delete form.dataset.editId;
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.innerHTML = '<i class="ri-save-3-line"></i> 매물 저장하고 게시하기';
                const previewBefore = document.getElementById('preview-before');
                const previewAfter = document.getElementById('preview-after');
                if (previewBefore) previewBefore.style.display = 'none';
                if (previewAfter) previewAfter.style.display = 'none';
                const geocodeResult = document.getElementById('geocode-result');
                if (geocodeResult) geocodeResult.textContent = '';
                const priceKr = document.getElementById('price-kr');
                if (priceKr) priceKr.textContent = '';
            }
            switchTab('prop-register');
        });
    }

    // --- 예약 관리 상태 ---
    let reservationState = {
        page: 1,
        limit: 10,
        type: 'ALL',
        status: 'ALL'
    };

    async function fetchReservations() {
        const container = document.getElementById('reservation-list-container');
        if (!container) return;

        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i class="ri-loader-4-line ri-spin" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                예약 목록을 불러오는 중입니다...
            </div>`;

        try {
            const query = new URLSearchParams({
                page: reservationState.page,
                limit: reservationState.limit,
                type: reservationState.type,
                status: reservationState.status
            }).toString();

            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/reservations?${query}`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error('목록을 불러오지 못했습니다.');

            const data = await res.json();
            renderReservationList(data.items);
            renderReservationPagination(data.meta);
        } catch (err) {
            console.error(err);
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                    <i class="ri-error-warning-line" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    에러: ${err.message}
                </div>`;
        }
    }

    function renderReservationList(reservations) {
        const container = document.getElementById('reservation-list-container');
        if (!container) return;

        if (!reservations || reservations.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:3rem; color:var(--text-muted);">신청된 예약이 없습니다.</p>';
            return;
        }

        let html = '';

        reservations.forEach(resv => {
            const statusMap = {
                'PENDING': { label: '대기중', color: 'orange' },
                'CONFIRMED': { label: '확정됨', color: 'green' },
                'CANCELLED': { label: '취소됨', color: 'red' },
                'COMPLETED': { label: '완료됨', color: 'blue' }
            };
            const status = statusMap[resv.status] || { label: resv.status, color: 'gray' };
            const typeLabel = resv.type === 'REPORT' ? '리포트 신청' : (resv.type === 'PROPERTY' ? '매물 상담' : '일반 상담');
            const dateStr = new Date(resv.date).toLocaleString();
            const createdAtStr = new Date(resv.createdAt).toLocaleDateString();

            html += `
                <div class="reservation-card">
                    <div class="resv-header">
                        <div>
                            <span style="font-weight:600; color:var(--primary-color);">${typeLabel}</span>
                            <span style="font-size:0.8rem; color:var(--text-muted); margin-left:8px;">희망: ${dateStr}</span>
                        </div>
                        <span style="background:${status.color}; color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${status.label}</span>
                    </div>
                    <div class="resv-body">
                        <div class="resv-info-grid">
                            <div class="resv-info-item">
                                <label>신청자</label>
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-weight: 600;">${resv.user?.name || '이름없음'}</span>
                                    <span style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                                        <i class="ri-mail-line" style="font-size: 0.9rem;"></i> ${resv.user?.email || '-'}
                                    </span>
                                    <span style="font-size: 0.85rem; color: var(--text-main); display: flex; align-items: center; gap: 4px;">
                                        <i class="ri-phone-line" style="font-size: 0.9rem;"></i> ${resv.user?.phone || '연락처 미등록'}
                                        ${resv.user?.phoneVerified ? '<span style="font-size: 0.7rem; color: var(--primary-color); border: 1px solid var(--primary-color); padding: 0 4px; border-radius: 4px;">인증</span>' : ''}
                                    </span>
                                </div>
                            </div>
                            <div class="resv-info-item">
                                <label>대상 주소</label>
                                <span>${resv.address || (resv.property ? resv.property.address : '-')}</span>
                            </div>
                            <div class="resv-info-item">
                                <label>신청 일자</label>
                                <span>${createdAtStr}</span>
                            </div>
                        </div>
                        <div class="resv-message">
                            ${resv.message || '남긴 메시지가 없습니다.'}
                        </div>
                    </div>
                    <div class="resv-footer">
                        <div style="font-size:0.85rem; color:var(--text-muted);">상태 변경</div>
                        <select onchange="window.updateReservationStatus('${resv.id}', this.value)" style="padding:6px 10px; border-radius:4px; border:1px solid var(--border-color); outline:none; cursor:pointer; background:#fff;">
                            <option value="PENDING" ${resv.status === 'PENDING' ? 'selected' : ''}>대기중</option>
                            <option value="CONFIRMED" ${resv.status === 'CONFIRMED' ? 'selected' : ''}>확정</option>
                            <option value="COMPLETED" ${resv.status === 'COMPLETED' ? 'selected' : ''}>완료</option>
                            <option value="CANCELLED" ${resv.status === 'CANCELLED' ? 'selected' : ''}>취소</option>
                        </select>
                    </div>
                </div>`;
        });

        container.innerHTML = html;
    }

    function renderReservationPagination(meta) {
        const paginationContainer = document.getElementById('reservation-pagination');
        if (!paginationContainer) return;

        const { page, totalPages } = meta;
        let html = '';

        if (totalPages > 1) {
            // 이전 버튼
            html += `<button class="btn btn-sm btn-outline" ${page === 1 ? 'disabled' : ''} onclick="window.changeReservationPage(${page - 1})">이전</button>`;

            // 페이지 번호
            for (let i = 1; i <= totalPages; i++) {
                html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-outline'}" onclick="window.changeReservationPage(${i})">${i}</button>`;
            }

            // 다음 버튼
            html += `<button class="btn btn-sm btn-outline" ${page === totalPages ? 'disabled' : ''} onclick="window.changeReservationPage(${page + 1})">다음</button>`;
        }

        paginationContainer.innerHTML = html;
    }

    window.changeReservationPage = (page) => {
        reservationState.page = page;
        fetchReservations();
    };

    // 필터링 이벤트 바인딩
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // UI 업데이트
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.remove('active');
                b.classList.add('btn-outline');
            });
            e.target.classList.add('active');
            e.target.classList.remove('btn-outline');

            // 상태 업데이트 및 재조회
            reservationState.type = e.target.dataset.type;
            reservationState.page = 1; // 필터 변경 시 첫 페이지로
            fetchReservations();
        });
    });

    const btnRefreshReservations = document.getElementById('btn-refresh-reservations');
    if (btnRefreshReservations) {
        btnRefreshReservations.addEventListener('click', fetchReservations);
    }

    window.updateReservationStatus = async function (id, newStatus) {
        if (!confirm('예약 상태를 변경하시겠습니까?')) return;

        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/reservations/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error('상태 변경에 실패했습니다.');
            alert('변경되었습니다.');
            fetchReservations();
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    };

    async function fetchMyProperties() {
        if (!propertyListContainer) return;

        propertyListContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i class="ri-loader-4-line ri-spin" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                목록을 갱신 중입니다...
            </div>`;

        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/properties/me`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error('목록을 불러오지 못했습니다.');

            const properties = await res.json();
            renderPropertyList(properties);
        } catch (err) {
            console.error(err);
            propertyListContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                    <i class="ri-error-warning-line" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    에러: ${err.message}
                </div>`;
        }
    }

    function renderPropertyList(properties) {
        if (!properties || properties.length === 0) {
            propertyListContainer.innerHTML = `
                <div style="text-align: center; padding: 4rem; background: var(--bg-muted); border-radius: var(--radius-md);">
                    <i class="ri-inbox-line" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1rem; display: block;"></i>
                    등록된 매물이 없습니다.
                </div>`;
            return;
        }

        const listHtml = properties.map(prop => `
            <div class="property-card-admin">
                <!-- 모바일: 카드형 이미지 영역 -->
                <div class="prop-admin-images">
                    <div class="prop-admin-img-wrap">
                        ${prop.before_image
                ? `<img src="${prop.before_image}" alt="Before">`
                : `<div class="prop-admin-img-placeholder"><i class="ri-image-line"></i></div>`}
                        <span class="prop-admin-img-label">Before</span>
                    </div>
                    <div class="prop-admin-img-wrap">
                        ${prop.after_image
                ? `<img src="${prop.after_image}" alt="After">`
                : `<div class="prop-admin-img-placeholder"><i class="ri-image-line"></i></div>`}
                        <span class="prop-admin-img-label">After</span>
                    </div>
                </div>
                <!-- 정보 + 버튼 영역 -->
                <div class="prop-admin-bottom">
                    <div class="prop-admin-info">
                        <h3>${prop.title}</h3>
                        <p class="prop-admin-address"><i class="ri-map-pin-line"></i> ${prop.address}</p>
                        <p class="prop-admin-price">${formatPrice(prop.price)}</p>
                        <p class="prop-admin-date">${prop.created_at ? new Date(prop.created_at).toLocaleDateString() : ''}</p>
                    </div>
                    <div class="prop-admin-actions">
                        <button class="btn btn-outline btn-sm" onclick="editProperty('${prop.id}')">수정</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteProperty('${prop.id}')">삭제</button>
                    </div>
                </div>
            </div>
        `).join('');

        propertyListContainer.innerHTML = listHtml;
    }

    // --- 글로벌 함수 노출 (onclick용) ---
    window.deleteProperty = async (id) => {
        if (!confirm('정말 삭제하시겠습니까? 관련 이미지도 모두 삭제됩니다.')) return;

        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/properties/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (res.ok) {
                alert('삭제되었습니다.');
                fetchMyProperties();
            } else {
                const errData = await res.json();
                alert('삭제 실패: ' + (errData.message || '알 수 없는 오류'));
            }
        } catch (err) {
            console.error(err);
            alert('에러 발생: ' + err.message);
        }
    };

    window.editProperty = async (id) => {
        // 수정 모드: 해당 매물 데이터를 불러와서 폼에 채우고, submit 시 PATCH로 동작하게 함
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/properties/${id}`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
            const prop = await res.json();

            // 탭 전환
            switchTab('prop-register');

            // 폼 채우기
            const form = document.getElementById('property-form');
            form.querySelector('input[name="title"]').value = prop.title;
            form.querySelector('input[name="address"]').value = prop.address;
            form.querySelector('textarea[name="description"]').value = prop.description;
            const priceField = form.querySelector('input[name="price"]');
            priceField.value = prop.price || '';
            priceField.dispatchEvent(new Event('input')); // 한글 표기도 업데이트되게 이벤트 발생

            // 기존에 저장된 위경도/PNU가 있으면 세팅
            const latInput = form.querySelector('input[name="lat"]');
            const lngInput = form.querySelector('input[name="lng"]');
            const pnuInput = form.querySelector('input[name="pnu"]');
            const geocodeResult = document.getElementById('geocode-result');
            if (latInput) latInput.value = prop.lat || '';
            if (lngInput) lngInput.value = prop.lng || '';
            if (pnuInput) pnuInput.value = prop.pnu || '';
            if (geocodeResult) {
                if (prop.lat && prop.lng) {
                    geocodeResult.textContent = `저장된 좌표 - 위도: ${prop.lat.toFixed(4)}, 경도: ${prop.lng.toFixed(4)}` + (prop.pnu ? ` (PNU: ${prop.pnu})` : '');
                    geocodeResult.style.color = 'var(--text-muted)';
                } else {
                    geocodeResult.textContent = '';
                }
            }

            // 기존 이미지 미리보기 표시
            const previewBefore = document.getElementById('preview-before');
            const previewBeforeImg = document.getElementById('preview-before-img');
            const previewAfter = document.getElementById('preview-after');
            const previewAfterImg = document.getElementById('preview-after-img');
            if (previewBefore && previewBeforeImg) {
                if (prop.before_image) {
                    previewBeforeImg.src = prop.before_image;
                    previewBefore.style.display = 'block';
                } else {
                    previewBefore.style.display = 'none';
                }
            }
            if (previewAfter && previewAfterImg) {
                if (prop.after_image) {
                    previewAfterImg.src = prop.after_image;
                    previewAfter.style.display = 'block';
                } else {
                    previewAfter.style.display = 'none';
                }
            }

            // 데이터 속성 저장 (수정 모드 식별용)
            form.dataset.editId = id;
            form.querySelector('button[type="submit"]').innerHTML = '<i class="ri-save-3-line"></i> 매물 정보 수정하기';

            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            console.error(err);
            alert('에러: ' + err.message);
        }
    };

    function formatPrice(price) {
        if (window.formatPriceToKorean) return window.formatPriceToKorean(price);
        if (!price) return '가격 정보 없음';
        const num = Number(price);
        if (isNaN(num)) return price;
        if (num === 0) return '0원';

        if (num >= 100000000) { // 1억 이상
            const uk = Math.floor(num / 100000000);
            const man = Math.floor((num % 100000000) / 10000);
            return `${uk.toLocaleString()}억${man > 0 ? ' ' + man.toLocaleString() + '만' : ''}원`;
        } else if (num >= 10000) { // 1만 이상 1억 미만
            const man = Math.floor(num / 10000);
            const won = num % 10000;
            return `${man.toLocaleString()}만${won > 0 ? ' ' + won.toLocaleString() : ''}원`;
        } else { // 1만 미만
            return `${num.toLocaleString()}원`;
        }
    }

    // 실시간 한글 금액 표시
    const priceInput = document.querySelector('input[name="price"]');
    const priceKrSpan = document.getElementById('price-kr');
    if (priceInput && priceKrSpan) {
        priceInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (!val) {
                priceKrSpan.textContent = '';
                return;
            }
            priceKrSpan.textContent = `(${formatPrice(val)})`;
        });
    }

    // 주소 조회 및 Geocoding 로직 (네이버 JS SDK 자체 해결)
    const btnGeocode = document.getElementById('btn-geocode-address');
    const addressInput = document.getElementById('admin-address-input');
    const latInput = document.getElementById('admin-lat');
    const lngInput = document.getElementById('admin-lng');
    const pnuInput = document.getElementById('admin-pnu');
    const geocodeResult = document.getElementById('geocode-result');

    if (btnGeocode && addressInput) {
        btnGeocode.addEventListener('click', () => {
            const addr = addressInput.value.trim();
            if (!addr) {
                alert("주소를 입력해주세요."); return;
            }
            if (typeof naver === 'undefined' || !naver.maps || !naver.maps.Service) {
                alert("네이버 지도 API가 로드되지 않았습니다. 잠시 후 다시 시도해주세요."); return;
            }

            geocodeResult.textContent = "좌표를 검색하는 중입니다 (JS SDK)...";
            geocodeResult.style.color = "var(--text-muted)";

            console.log("addr:", addr);
            console.log("naver:", naver);
            console.log("naver.maps:", naver.maps);
            console.log("naver.maps.Service:", naver.maps.Service);
            console.log("naver.maps.Service.geocode:", naver.maps.Service.geocode);

            naver.maps.Service.geocode({ query: addr }, function (status, response) {
                if (status === naver.maps.Service.Status.ERROR) {
                    geocodeResult.textContent = "주소 검색 오류가 발생했습니다. (Web Dynamic Map 허용 도메인 설정 문제)";
                    geocodeResult.style.color = "var(--danger-color)";
                    return;
                }
                if (!response.v2.meta || response.v2.meta.totalCount === 0) {
                    geocodeResult.textContent = "검색된 주소가 없습니다. 일반적인 도로명/지번 주소를 입력해주세요.";
                    geocodeResult.style.color = "var(--danger-color)";
                    return;
                }

                const item = response.v2.addresses[0];
                const lat = item.y;
                const lng = item.x;
                latInput.value = lat;
                lngInput.value = lng;

                // PNU 추출을 위한 역지오코딩
                naver.maps.Service.reverseGeocode({
                    coords: new naver.maps.LatLng(lat, lng),
                    orders: [naver.maps.Service.OrderType.ADDR]
                }, function (revStatus, revResponse) {
                    if (revStatus !== naver.maps.Service.Status.OK) {
                        geocodeResult.textContent = `좌표 변환 성공 (lat:${lat}, lng:${lng}) - 단, PNU 조회 실패`;
                        geocodeResult.style.color = "var(--primary-color)";
                        return;
                    }

                    let pnu = '';
                    if (revResponse.v2 && revResponse.v2.results) {
                        revResponse.v2.results.forEach(r => {
                            if (r.name === 'addr' && r.land) {
                                const land = r.land;
                                const codeId = r.code?.id || '';
                                const landType = land?.type || '1';
                                const num1 = String(land?.number1 || '').padStart(4, '0');
                                const num2 = String(land?.number2 || '').padStart(4, '0');
                                pnu = codeId + landType + num1 + num2;
                            }
                        });
                    }

                    if (pnu && pnu.length === 19) {
                        pnuInput.value = pnu;
                        geocodeResult.textContent = `확인 완료 - 위도: ${parseFloat(lat).toFixed(4)}, 경도: ${parseFloat(lng).toFixed(4)} (PNU: ${pnu})`;
                        geocodeResult.style.color = "var(--primary-color)";
                    } else {
                        geocodeResult.textContent = `좌표 변환 성공 (lat:${lat}, lng:${lng}) - PNU 생성 불가`;
                        geocodeResult.style.color = "var(--primary-color)";
                    }
                });
            });
        });
    }

    // 매물 등록 폼 로직
    const propertyForm = document.getElementById('property-form');
    if (propertyForm) {
        propertyForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = propertyForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 저장 및 업로드 중...';

            try {
                // 1. 값 수집
                const title = propertyForm.querySelector('input[name="title"]').value;
                const address = propertyForm.querySelector('input[name="address"]').value;
                const description = propertyForm.querySelector('textarea[name="description"]').value;
                const price = propertyForm.querySelector('input[name="price"]').value;
                const fileInputBefore = document.getElementById('image-upload-before');
                const fileInputAfter = document.getElementById('image-upload-after');

                let beforeFile = null;
                let afterFile = null;

                if (fileInputBefore && fileInputBefore.files && fileInputBefore.files.length > 0) {
                    beforeFile = fileInputBefore.files[0];
                    if (beforeFile.size > 5 * 1024 * 1024) {
                        alert('Before 이미지 파일 크기는 5MB를 초과할 수 없습니다.');
                        return;
                    }
                }

                if (fileInputAfter && fileInputAfter.files && fileInputAfter.files.length > 0) {
                    afterFile = fileInputAfter.files[0];
                    if (afterFile.size > 5 * 1024 * 1024) {
                        alert('After 이미지 파일 크기는 5MB를 초과할 수 없습니다.');
                        return;
                    }
                }

                // 2. FormData 조립 (multipart/form-data)
                const formData = new FormData();
                formData.append('title', title);
                formData.append('address', address);
                formData.append('description', description);
                if (price) formData.append('price', price);

                const lat = propertyForm.querySelector('input[name="lat"]')?.value;
                const lng = propertyForm.querySelector('input[name="lng"]')?.value;
                const pnu = propertyForm.querySelector('input[name="pnu"]')?.value;

                if (lat) formData.append('lat', lat);
                if (lng) formData.append('lng', lng);
                if (pnu) formData.append('pnu', pnu);

                if (beforeFile) {
                    formData.append('beforeImage', beforeFile);
                }
                if (afterFile) {
                    formData.append('afterImage', afterFile);
                }

                // 4. API 전송 (수정 모드 여부에 따라 URL 및 Method 변경)
                const editId = propertyForm.dataset.editId;
                const apiUrl = editId
                    ? `${CONFIG.API_BASE_URL}/api/v1/properties/${editId}`
                    : `${CONFIG.API_BASE_URL}/api/v1/properties`;
                const method = editId ? 'PATCH' : 'POST';

                const res = await fetch(apiUrl, {
                    method: method,
                    body: formData,
                    credentials: 'include'
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || '매물 정보 저장에 실패했습니다.');
                }

                const resultData = await res.json();
                console.log('저장 성공', resultData);
                alert(editId ? '매물 정보가 성공적으로 수정되었습니다!' : '매물이 성공적으로 등록 및 업로드 되었습니다!');

                // 5. UI 초기화
                propertyForm.reset();
                delete propertyForm.dataset.editId;
                submitBtn.innerHTML = '<i class="ri-save-3-line"></i> 매물 저장하고 게시하기';

                // 이미지 미리보기 초기화
                const previewBefore = document.getElementById('preview-before');
                const previewAfter = document.getElementById('preview-after');
                if (previewBefore) previewBefore.style.display = 'none';
                if (previewAfter) previewAfter.style.display = 'none';
                const priceKr = document.getElementById('price-kr');
                if (priceKr) priceKr.textContent = '';

                // 등록/수정 성공 후 목록 갱신 및 매물 관리 탭으로 이동
                fetchMyProperties();
                switchTab('prop-manage');

            } catch (err) {
                console.error(err);
                alert('에러 발생: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // --- 서비스 설정 관리 ---
    async function fetchSettings() {
        const sampleReportUrlInput = document.getElementById('setting-sample-report-url');
        if (!sampleReportUrlInput) return;

        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/settings/sample_report_url`, {
                credentials: 'include'
            });
            const json = await res.json();
            if (json.success && json.data) {
                sampleReportUrlInput.value = json.data.value || '';
            }
        } catch (err) {
            console.error('설정 로드 실패:', err);
        }
    }

    const btnSaveSampleReportUrl = document.getElementById('btn-save-sample-report-url');
    if (btnSaveSampleReportUrl) {
        btnSaveSampleReportUrl.addEventListener('click', async () => {
            const val = document.getElementById('setting-sample-report-url').value.trim();
            if (!val) {
                alert('URL을 입력해주세요.');
                return;
            }

            btnSaveSampleReportUrl.disabled = true;
            btnSaveSampleReportUrl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 저장 중...';

            try {
                const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'sample_report_url', value: val }),
                    credentials: 'include'
                });

                if (res.ok) {
                    alert('저장되었습니다.');
                } else {
                    const errData = await res.json();
                    alert('저장 실패: ' + (errData.message || '알 수 없는 오류'));
                }
            } catch (err) {
                console.error(err);
                alert('에러 발생: ' + err.message);
            } finally {
                btnSaveSampleReportUrl.disabled = false;
                btnSaveSampleReportUrl.innerHTML = '저장';
            }
        });
    }
});
