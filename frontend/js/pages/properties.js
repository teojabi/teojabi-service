// js/pages/properties.js
import { authState } from '../auth.js';

function canSeeFullAddress() {
    return authState.isAuthenticated && authState.user?.role === 'ADMIN';
}

function getDisplayAddress(prop) {
    if (canSeeFullAddress()) {
        return prop.address || '-';
    }
    return prop.legal_dong_name || prop.address || '-';
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const pnu = params.get('pnu'); // 갤러리/어드민에서 전달된 PNU 

    console.log("ID:", id);
    console.log("PNU:", pnu);
    if (!id || id === 'undefined' || id === 'null' || id.trim() === '') {
        console.error("Missing or invalid ID. Current URL:", window.location.href);
        alert("잘못된 접근입니다. 매물 ID가 올바르지 않습니다.");
        window.location.href = '/gallery.html';
        return;
    }

    let propData;

    try {
        // 백엔드 API 호출
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/properties/${id}`, { credentials: 'include' });
        propData = await res.json();
        if (!propData || propData.error) {
            throw new Error("Property not found");
        }

        // --- 기본 데이터 바인딩 ---
        document.getElementById('prop-title').textContent = propData.title || '-';
        document.getElementById('prop-address').innerHTML = `<i class="ri-map-pin-line"></i> ${getDisplayAddress(propData)}`;
        document.getElementById('prop-price').textContent = window.formatPriceToKorean ? window.formatPriceToKorean(propData.price) : propData.price;
        document.getElementById('prop-description').innerHTML = propData.description || '';

        const beforeBox = document.getElementById('prop-before');
        const afterBox = document.getElementById('prop-after');
        if (propData.before_image) {
            beforeBox.innerHTML = `<img src="${propData.before_image}" alt="before image"><span class="image-label">Before</span>`;
        }
        if (propData.after_image) {
            afterBox.innerHTML = `<img src="${propData.after_image}" alt="after image"><span class="image-label">After</span>`;
        }

        // 0. 관심 매물 초기 상태 확인
        const btnFavorite = document.getElementById('btn-favorite-action');
        if (authState.isAuthenticated) {
            try {
                const favRes = await fetch(`${CONFIG.API_BASE_URL}/api/v1/favorites/check/${id}`, { credentials: 'include' });
                const favData = await favRes.json();
                if (favData.isFavorite) {
                    btnFavorite.innerHTML = `<i class="ri-heart-3-fill" style="color:var(--primary-color);"></i> 관심 매물 취소`;
                } else {
                    btnFavorite.innerHTML = `<i class="ri-heart-3-line"></i> 관심 매물로 저장`;
                }
            } catch (err) {
                console.error("Favorite check error:", err);
            }
        }

        // 1. 공공 데이터 로딩 인디케이터 초기화
        const publicDataLoading = document.getElementById('public-data-loading');
        const publicDataContent = document.getElementById('public-data-content');

        // 2. 전달받은 PNU로 공공데이터 즉시 조회 (역지오코딩 제거)
        if (pnu && pnu.length === 19) {
            try {
                const pdRes = await fetch(`${CONFIG.API_BASE_URL}/api/v1/public-data/location-info?pnu=${encodeURIComponent(pnu)}`);
                const pdJson = await pdRes.json();

                if (pdJson.success && pdJson.data) {
                    renderPublicData(pdJson.data);
                    publicDataLoading.style.display = 'none';
                    publicDataContent.style.display = 'block';
                } else {
                    throw new Error('No public data found in backend DB');
                }
            } catch (err) {
                console.error('[properties] Public data fetch error:', err);
                showPublicDataError('해당 매물의 상세 공공데이터를 불러올 수 없습니다.');
            }
        } else {
            showPublicDataError('정확한 필지 번호(PNU)가 없어 공공데이터를 조회할 수 없습니다.');
        }

        function showPublicDataError(msg) {
            publicDataLoading.innerHTML = `<i class="ri-error-warning-line" style="font-size: 2rem; color: var(--text-muted); display: block; margin-bottom: 1rem;"></i><p>${msg}</p>`;
        }

        function renderPublicData(data) {
            const b = data.building || {};
            const l = data.land || null;
            const floors = data.floorStatuses || [];
            const stores = data.stores || [];

            // 건물 정보
            document.getElementById('b-name').textContent = b.name || '-';
            document.getElementById('b-main-purpose').textContent = b.mainPurpose || '-';
            document.getElementById('b-structure').textContent = b.structure || '-';
            document.getElementById('b-approval-date').textContent = b.approvalDate || '-';
            const plat = b.platArea ? Number(b.platArea).toLocaleString() + ' ㎡' : '-';
            const arch = b.archArea ? Number(b.archArea).toLocaleString() + ' ㎡' : '-';
            const tot = b.totalFloorArea ? Number(b.totalFloorArea).toLocaleString() + ' ㎡' : '-';
            document.getElementById('b-areas').textContent = `대지: ${plat} / 연: ${tot} (건축: ${arch})`;
            const cov = b.buildingCoverageRatio ? Number(b.buildingCoverageRatio).toFixed(2) + ' %' : '-';
            const far = b.floorAreaRatio ? Number(b.floorAreaRatio).toFixed(2) + ' %' : '-';
            document.getElementById('b-ratios').textContent = `${cov} / ${far}`;
            const gr = b.groundFloors != null ? b.groundFloors + '층' : '';
            const ug = b.undergroundFloors != null && b.undergroundFloors > 0 ? ` (B${b.undergroundFloors})` : '';
            document.getElementById('b-floors').textContent = (gr + ug) || '-';
            const htEl = document.getElementById('b-height');
            if (htEl) htEl.textContent = b.buildingHeight != null ? Number(b.buildingHeight).toLocaleString() + ' m' : '-';

            // 토지 정보
            if (l) {
                document.getElementById('l-land-category').textContent = l.jimok || '-';
                document.getElementById('l-land-area').textContent = l.platArea ? Number(l.platArea).toLocaleString() + ' ㎡' : '-';

                // 법정 건폐율/용적률
                if (l.regulation) {
                    document.getElementById('l-bcr-limit').textContent = Number(l.regulation.bcrLimit).toFixed(1) + ' %';
                    document.getElementById('l-far-limit').textContent = Number(l.regulation.farLimit).toFixed(1) + ' %' + (l.regulation.farLimitNote ? ' (' + l.regulation.farLimitNote + ')' : '');
                }

                // 용도지역지구 목록
                const zoneListEl = document.getElementById('l-zone-list');
                if (l.zoneTypes && l.zoneTypes.length > 0) {
                    zoneListEl.innerHTML = l.zoneTypes.map(z => {
                        return `<div class="data-list-item">
                            <span style="font-weight:600; color:var(--primary-color)">${z.name || '-'}</span>
                            <span style="text-align:right">${z.note || ''}</span>
                        </div>`;
                    }).join('');
                }

                // 연도별 공시지가
                const priceListEl = document.getElementById('l-price-list');
                if (l.officialPrices && l.officialPrices.length > 0) {
                    const sorted = [...l.officialPrices].sort((a, b) => a.year - b.year);
                    priceListEl.innerHTML = sorted.map(p => {
                        return `<div class="data-list-item">
                            <span style="font-weight:600">${p.year}년</span>
                            <span style="text-align:right; font-weight:700; color:var(--primary-color)">${Number(p.pricePerSqm).toLocaleString()} 원/㎡</span>
                        </div>`;
                    }).join('');

                    // 꺾은선 그래프
                    const chartWrapper = document.getElementById('price-chart-wrapper');
                    chartWrapper.style.display = 'block';
                    const ctx = document.getElementById('price-chart').getContext('2d');
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: sorted.map(p => p.year + '년'),
                            datasets: [{
                                label: '공시지가 (원/㎡)',
                                data: sorted.map(p => Number(p.pricePerSqm)),
                                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#6366f1',
                                backgroundColor: 'rgba(99,102,241,0.1)',
                                fill: true,
                                tension: 0,
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        label: ctx => ctx.parsed.y.toLocaleString() + ' 원/㎡'
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    ticks: { callback: v => v.toLocaleString() },
                                    beginAtZero: false
                                }
                            }
                        }
                    });
                }
            }

            // 층별 현황
            const floorEl = document.getElementById('floor-list');
            if (floors.length > 0) {
                floorEl.innerHTML = floors.map(f => {
                    const no = f.flrNoNm || (f.flrNo != null ? f.flrNo + '층' : '-');
                    const area = f.flrArea ? Number(f.flrArea).toLocaleString() + ' ㎡' : '-';
                    return `<div class="data-list-item three-col">
                        <span style="font-weight:600; color:var(--primary-color)">${no}</span>
                        <span>${f.flrMainPurps || '-'}</span>
                        <span style="text-align:right">${area}</span>
                    </div>`;
                }).join('');
            }

            // 상가 정보
            const storeEl = document.getElementById('store-list');
            if (stores.length > 0) {
                storeEl.innerHTML = stores.map(s => {
                    const cate = [s.cateLargeNm, s.cateMidNm].filter(Boolean).join(' > ');
                    const loc = (s.flrNo ? s.flrNo + '층' : '') + (s.hoNo ? ' ' + s.hoNo + '호' : '');
                    return `<div class="data-list-item three-col">
                        <span style="font-weight:600">${s.storeNm || '-'}</span>
                        <span style="color:var(--text-muted); font-size: 0.85rem;">${cate || '-'}</span>
                        <span style="text-align:right">${loc || '-'}</span>
                    </div>`;
                }).join('');
            }
        }

        // 예약 버튼 액션
        document.getElementById('btn-reserve-action').addEventListener('click', async () => {
            if (typeof window.requestPremiumConsultation === 'function') {
                await window.requestPremiumConsultation({
                    type: 'PROPERTY',
                    propertyId: id,
                    pnu: pnu,
                    address: propData.address
                });
            } else {
                alert('상담 신청 기능을 불러올 수 없습니다.');
            }
        });

        // 관심 매물 토글 액션
        btnFavorite.addEventListener('click', async () => {
            if (!authState.isAuthenticated) {
                alert("로그인 후 이용 가능합니다.");
                window.openLoginModal();
                return;
            }

            try {
                const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/favorites/${id}`, {
                    method: 'POST',
                    credentials: 'include'
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.isFavorite) {
                        btnFavorite.innerHTML = `<i class="ri-heart-3-fill" style="color:var(--primary-color);"></i> 관심 매물 취소`;
                    } else {
                        btnFavorite.innerHTML = `<i class="ri-heart-3-line"></i> 관심 매물로 저장`;
                    }
                } else {
                    alert("찜하기 처리에 실패했습니다.");
                }
            } catch (err) {
                console.error("Favorite toggle error:", err);
                alert("서버 오류로 인해 관심 매물을 변경할 수 없습니다.");
            }
        });

    } catch (err) {
        console.error(err);
        alert("매물 정보를 불러오는데 실패했습니다.");
    }
});
