// js/pages/gallery.js

document.addEventListener('DOMContentLoaded', async () => {
    const galleryContainer = document.getElementById('gallery-container');

    try {
        // 실제 연동 시 FETCH
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/properties`, { credentials: 'include' });
        const data = await res.json();

        // 데이터가 없으면 안내 메시지 출력을 위해 renderGallery가 처리
        renderGallery(data, galleryContainer);
    } catch (error) {
        galleryContainer.innerHTML = `<p style="text-align:center; color: var(--danger-color)">매물 정보를 불러올 수 없습니다.</p>`;
    }
});

function renderGallery(properties, container) {
    container.innerHTML = '';

    if (properties.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color: var(--text-muted);">등록된 컨설팅 매물이 없습니다.</p>`;
        return;
    }

    properties.forEach(prop => {
        const card = document.createElement('div');
        card.className = 'property-card';
        // 카드 클릭 시 properties.html 단독 상세 페이지로 이동
        card.onclick = () => {
            window.location.href = `/properties.html?id=${prop.id}`;
        };

        const imageHTML = prop.thumb
            ? `<img src="${prop.thumb}" class="card-image" alt="매물 썸네일">`
            : `<div class="card-image"><i class="ri-building-4-line"></i></div>`;

        card.innerHTML = `
            ${imageHTML}
            <div class="card-body">
                <h3 class="card-title">${prop.title}</h3>
                <p class="card-address"><i class="ri-map-pin-line"></i> ${prop.address}</p>
                <p class="card-price">${prop.price}</p>
            </div>
        `;
        container.appendChild(card);
    });
}
