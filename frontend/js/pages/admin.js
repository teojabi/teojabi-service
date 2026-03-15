

document.addEventListener('DOMContentLoaded', () => {
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
                } else {
                    panel.classList.add('hidden');
                }
            });
        });
    });

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
                    if (typeof naver === 'undefined' || !naver.maps || !naver.maps.Service) {
                        console.warn('Naver Maps JS SDK (geocoder) is not loaded.');
                        resolve(null);
                        return;
                    }

                    naver.maps.Service.geocode({ query: address }, function (status, response) {
                        if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                            const item = response.v2.addresses[0];
                            resolve({ lat: parseFloat(item.y), lng: parseFloat(item.x) });
                        } else {
                            resolve(null);
                        }
                    });
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

                // 4. 백엔드 API (authFetch 활용 - credentials 포함)
                // 만약 authFetch가 FormData를 지원하도록 확장되지 않았다면, 브라우저 내장 fetch 사용 권장
                const res = await fetch('http://localhost:3001/api/v1/properties', {
                    method: 'POST',
                    body: formData, // FormData는 Headers의 Content-Type을 브라우저가 자동 설정(boundary 포함)하게 두어야 함
                    // authFetch를 쓰지 않을 경우 JWT가 쿠키로 자동 전송되도록 설정
                    credentials: 'include' // 같은 도메인이거나 프록시 상황일 때 쿠키 포함
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || '매물 등록에 실패했습니다.');
                }

                const resultData = await res.json();
                console.log('등록 성공', resultData);
                alert('매물이 성공적으로 등록 및 업로드 되었습니다!');

                // 폼 초기화
                propertyForm.reset();

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
