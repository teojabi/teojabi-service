

import { checkAuthStatus, authState } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 권한 체크: ADMIN이 아니면 홈으로 튕겨냄
    await checkAuthStatus();
    if (!authState.isAuthenticated || authState.user?.role !== 'ADMIN') {
        alert('관리자 권한이 필요합니다.');
        window.location.href = '/';
        return;
    }

    // 탭 전환 로직
    const navItems = document.querySelectorAll('.admin-nav .nav-item');
    const panels = document.querySelectorAll('.admin-content .panel');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            const targetId = item.getAttribute('data-target');
            panels.forEach(panel => {
                if (panel.id === targetId) {
                    panel.classList.remove('hidden');
                    // 등록 매물 관리 탭 활성화 시 목록 새로고침
                    if (targetId === 'prop-manage') {
                        fetchMyProperties();
                    }
                } else {
                    panel.classList.add('hidden');
                }
            });
        });
    });

    // --- 매물 목록 조회 및 렌더링 ---
    const propertyListContainer = document.getElementById('property-list-container');
    const btnRefreshProperties = document.getElementById('btn-refresh-properties');

    if (btnRefreshProperties) {
        btnRefreshProperties.addEventListener('click', fetchMyProperties);
    }

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
            <div class="property-card-admin" style="display: flex; gap: 20px; padding: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 1rem; align-items: center; background: #fff;">
                <div style="width: 100px; height: 100px; background: var(--bg-muted); border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0;">
                    ${prop.images && prop.images[0] 
                        ? `<img src="${prop.images[0]}" style="width: 100%; height: 100%; object-fit: cover;">` 
                        : `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--border-color);"><i class="ri-image-line" style="font-size: 2rem;"></i></div>`}
                </div>
                <div style="flex-grow: 1;">
                    <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem;">${prop.title}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.3rem;"><i class="ri-map-pin-line"></i> ${prop.address}</p>
                    <p style="font-weight: 700; color: var(--primary-color);">${formatPrice(prop.price)}</p>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">${new Date(prop.createdAt).toLocaleDateString()}</div>
                    <button class="btn btn-outline btn-sm" onclick="editProperty('${prop.id}')">수정</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProperty('${prop.id}')" style="margin-left: 5px; background-color: var(--error-color); color: white; border: none;">삭제</button>
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
            navItems.forEach(n => n.classList.remove('active'));
            const registerNavItem = document.querySelector('[data-target="prop-register"]');
            if (registerNavItem) registerNavItem.classList.add('active');

            panels.forEach(p => p.classList.add('hidden'));
            const registerPanel = document.getElementById('prop-register');
            if (registerPanel) registerPanel.classList.remove('hidden');

            // 폼 채우기
            const form = document.getElementById('property-form');
            form.querySelector('input[name="title"]').value = prop.title;
            form.querySelector('input[name="address"]').value = prop.address;
            form.querySelector('textarea[name="description"]').value = prop.description;
            form.querySelector('input[name="price"]').value = prop.price || '';
            
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
        if (!price) return '가격 정보 없음';
        const num = Number(price);
        if (num >= 10000) {
            const uk = Math.floor(num / 10000);
            const man = num % 10000;
            return `${uk}억 ${man > 0 ? man.toLocaleString() : ''}원`.trim();
        }
        return `${num.toLocaleString()}만원`;
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
                const fileInput = document.getElementById('image-upload');

                let file = null;
                if (fileInput.files && fileInput.files.length > 0) {
                    file = fileInput.files[0];
                    // 클라이언트 단 1차 유효성 검사 (5MB 제한)
                    if (file.size > 5 * 1024 * 1024) {
                        alert('이미지 파일 크기는 5MB를 초과할 수 없습니다.');
                        return; // finally 구문으로 이동하여 버튼 복구
                    }
                }

                // 2. 주소를 좌표로 변환 (NCP Geocoding API 프록시 또는 직접 호출)
                // 구현 편의상 search.js와 비슷하게 직접 쏘는 방향
                let lat = 0;
                let lng = 0;

                const geocodeResult = await new Promise((resolve) => {
                    const checkService = () => {
                        if (typeof naver !== 'undefined' && naver.maps && naver.maps.Service && naver.maps.Service.geocode) {
                            naver.maps.Service.geocode({ query: address }, function (status, response) {
                                if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                                    const item = response.v2.addresses[0];
                                    resolve({ lat: parseFloat(item.y), lng: parseFloat(item.x) });
                                } else {
                                    resolve(null);
                                }
                            });
                        } else {
                            // SDK 로딩 지연 대응 (최대 3초 대기)
                            if (!window._retryCount) window._retryCount = 0;
                            if (window._retryCount < 30) {
                                window._retryCount++;
                                setTimeout(checkService, 100);
                            } else {
                                console.warn('Naver Maps JS SDK (geocoder) is not loaded after 3s.');
                                resolve(null);
                            }
                        }
                    };
                    checkService();
                });

                if (geocodeResult) {
                    lat = geocodeResult.lat;
                    lng = geocodeResult.lng;
                } else {
                    const confirmProceed = confirm('입력하신 주소의 좌표(위/경도)를 찾지 못했습니다.\n그래도 등록하시겠습니까? (지도에는 표시되지 않을 수 있습니다)');
                    if (!confirmProceed) return;
                }

                // 3. FormData 조립 (multipart/form-data)
                const formData = new FormData();
                formData.append('title', title);
                formData.append('address', address);
                formData.append('description', description);
                if (price) formData.append('price', price);
                formData.append('lat', lat.toString());
                formData.append('lng', lng.toString());

                if (file) {
                    formData.append('image', file); // 백엔드 FileInterceptor('image') 이름과 일치해야 함
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

                // 등록 성공 후 목록 갱신 (만약 탭을 이동하지 않더라도 미리 받아둠)
                fetchMyProperties();

            } catch (err) {
                console.error(err);
                alert('에러 발생: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});
