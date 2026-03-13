// js/pages/admin.js
import { authState } from '../auth.js';

document.addEventListener('DOMContentLoaded', () => {

    // Auth Check Delay (임시로 프론트엔드 UI 확인을 위해 주석 처리)
    setTimeout(() => {
        // if (!authState.isAuthenticated || authState.user?.role !== 'ADMIN') {
        //     alert('관리자 권한이 없습니다.');
        //     window.location.href = '/';
        //     return;
        // }

        bindAdminUI();
    }, 500);

});

function bindAdminUI() {
    // 탭 내비게이션
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.panel');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');

            navItems.forEach(i => i.classList.remove('active'));
            panels.forEach(p => p.classList.add('hidden'));

            item.classList.add('active');
            document.getElementById(target).classList.remove('hidden');
        });
    });

    // 폼 제출 이벤트
    const form = document.getElementById('property-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 1. 이미지 선 업로드 로직 (Supabase Storage 연동 가정)
            const fileInput = document.getElementById('image-upload');
            // const formData = new FormData();
            // ... 파일 append 로직
            // const uploadRes = await fetch('http://localhost:3001/api/v1/properties/upload', { method: 'POST', body: formData, credentials: 'include' });
            // const cdnUrls = await uploadRes.json();

            // 2. 본 데이터 POST 로직
            const payload = {
                title: form.title.value,
                address: form.address.value,
                description: form.description.value,
                price: parseFloat(form.price.value) || 0,
                // 임시 위경도 부여 (추후 주소 -> 좌표 변환 지오코딩 필요)
                lat: 37.4979,
                lng: 127.0276,
                images: [] // cdnUrls
            };

            console.log("Submit Payload:", payload);

            try {
                const res = await fetch('http://localhost:3001/api/v1/properties', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    credentials: 'include'
                });

                if (res.ok) {
                    alert("매물이 정상적으로 등록되었습니다.");
                    form.reset();
                } else {
                    const errorData = await res.json();
                    alert("등록 실패: " + (errorData.message || JSON.stringify(errorData)));
                }
            } catch (err) {
                console.error("Property creation error:", err);
                alert("서버 연결에 실패했습니다.");
            }
        });
    }
}
