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
        // 서버 환경(예: serve)에서 .html 확장자를 생략하는 경우 301 리다이렉트 시 쿼리 파라미터가 유실되는 것을 방지합니다.
        card.onclick = () => {
            const hasHtmlExt = window.location.pathname.endsWith('.html');
            const targetPath = hasHtmlExt ? '/properties.html' : '/properties';
            window.location.href = `${targetPath}?id=${prop.id}&pnu=${prop.pnu || ''}`;
        };

        let imageHTML = '';
        if (prop.before_image && prop.after_image) {
            imageHTML = `
                <div style="display: flex; height: 200px;">
                    <div style="flex: 1; position: relative;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.6); color: white; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.8rem; z-index: 1;">Before</div>
                        <img src="${prop.before_image}" style="width: 100%; height: 100%; object-fit: cover;" alt="시공 전">
                    </div>
                    <div style="flex: 1; position: relative; border-left: 2px solid white;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.6); color: white; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.8rem; z-index: 1;">After</div>
                        <img src="${prop.after_image}" style="width: 100%; height: 100%; object-fit: cover;" alt="시공 후">
                    </div>
                </div>
            `;
        } else if (prop.after_image || prop.before_image || prop.thumb) {
            const singleImg = prop.after_image || prop.before_image || prop.thumb;
            imageHTML = `<img src="${singleImg}" class="card-image" alt="매물 썸네일">`;
        } else {
            imageHTML = `<div class="card-image"><i class="ri-building-4-line"></i></div>`;
        }

        const formattedPrice = window.formatPriceToKorean ? window.formatPriceToKorean(prop.price) : prop.price;

        card.innerHTML = `
            ${imageHTML}
            <div class="card-body">
                <h3 class="card-title">${prop.title}</h3>
                <p class="card-address"><i class="ri-map-pin-line"></i> ${prop.address}</p>
                <p class="card-price">${formattedPrice}</p>
            </div>
        `;
        container.appendChild(card);
    });
}
