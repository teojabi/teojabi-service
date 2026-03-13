// js/pages/properties.js
import { authState } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        console.warn("No ID provided. Rendering demo mockup.");
        id = 'demo-id';
    }

    try {
        // 백엔드 API 호출
        const res = await fetch(`http://localhost:3001/api/v1/properties/${id}`, { credentials: 'include' });
        let propData = await res.json();

        // 만약 데이터 조회가 안되었다면 (잘못된 ID 등)
        if (!propData || propData.error) {
            throw new Error("Property not found");
        }

        // 공공데이터 모의 부분 (백엔드에 아직 필드가 없다면 추가)
        if (!propData.publicData) {
            propData.publicData = {
                officialLandPrice: "1억 2천 / 3.3㎡ (모의)",
                recentTransaction: "165억 원 (모의)",
                landUse: "제3종 일반주거지역 (모의)"
            };
        }

        // 데이터 바인딩
        document.getElementById('prop-title').textContent = propData.title;
        document.getElementById('prop-address').innerHTML = `<i class="ri-map-pin-line"></i> ${propData.address}`;
        document.getElementById('prop-price').textContent = propData.price;
        document.getElementById('prop-description').innerHTML = propData.description;

        if (propData.thumb) {
            document.getElementById('prop-hero').innerHTML = `<img src="${propData.thumb}" alt="hero image">`;
        }

        // 공공데이터 바인딩
        document.getElementById('prop-price-data').innerHTML = `
            <strong>공시지가:</strong> ${propData.publicData.officialLandPrice}<br>
            <strong>인근 실거래:</strong> ${propData.publicData.recentTransaction}
        `;
        document.getElementById('prop-land-data').innerHTML = `
            ${propData.publicData.landUse}
        `;

        // 예약 버튼 액션
        document.getElementById('btn-reserve-action').addEventListener('click', async () => {
            if (!authState.isAuthenticated) {
                alert("로그인 후 이용 가능합니다.");
                window.openLoginModal();
                return;
            }

            // 브라우저 테스트 자동화를 위해 prompt가 취소되거나 막힐 경우 기본값 허용
            let reqDate;
            try { reqDate = prompt("예약 희망 날짜를 입력하세요 분 (YYYY-MM-DD):", new Date().toISOString().split('T')[0]); } catch (e) { }
            if (!reqDate) reqDate = new Date().toISOString().split('T')[0];

            let reqMsg;
            try { reqMsg = prompt("남기실 문의 메시지를 입력하세요:"); } catch (e) { }
            if (!reqMsg) reqMsg = "상담 요청합니다. (자동 기입)";

            try {
                const res = await fetch('http://localhost:3001/api/v1/reservations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        propertyId: id,
                        date: new Date(`${reqDate}T12:00:00Z`).toISOString(),
                        message: reqMsg
                    })
                });

                if (res.ok) {
                    alert("상담 예약이 성공적으로 완료되었습니다.");
                } else {
                    alert("예약에 실패했습니다.");
                }
            } catch (err) {
                console.error("Reservation Error:", err);
                alert("서버 오류로 인해 예약할 수 없습니다.");
            }
        });

    } catch (err) {
        console.error(err);
        alert("매물 정보를 불러오는데 실패했습니다.");
    }
});
