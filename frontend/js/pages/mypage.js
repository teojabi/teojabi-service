// js/pages/mypage.js
import { authState } from '../auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // 탭 UI 전환 로직
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`tab-${target}`).classList.add('active');
        });
    });

    // auth.js의 checkAuthStatus()가 끝난 후 UI 바인딩을 위해 약간의 딜레이
    setTimeout(() => {
        if (!authState.isAuthenticated) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = '/';
            return;
        }

        // 인증된 사용자 정보 바인딩
        bindProfileUI(authState.user);

        // 최초 로그인 여부 확인: URL에 ?newUser=1 파라미터가 있는 경우에만
        const params = new URLSearchParams(window.location.search);
        if (params.get('newUser') === '1') {
            openWelcomeModal(authState.user);
            // 파라미터를 URL에서 제거 (새로고침 시 재표시 방지)
            history.replaceState(null, '', window.location.pathname);
        }

        // fetchMyReservations();
        fetchMyLikes();

    }, 500); // app.js의 글로벌 auth 로드 대기
});

function bindProfileUI(user) {
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    if (profileName) profileName.textContent = user.name || '사용자';
    if (profileEmail) profileEmail.textContent = user.email || '이메일 미설정';
}

// ── 정보 수정 모달 ──────────────────────────────────────────

window.openEditModal = function () {
    const user = authState.user;
    document.getElementById('edit-name').value = user.name || '';
    document.getElementById('edit-email').value = user.email || '';
    document.getElementById('edit-email-error').style.display = 'none';
    document.getElementById('edit-modal').classList.add('active');
};

window.closeEditModal = function () {
    document.getElementById('edit-modal').classList.remove('active');
};

window.submitEditProfile = async function () {
    const name = document.getElementById('edit-name').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    const emailError = document.getElementById('edit-email-error');

    if (!email) {
        emailError.style.display = 'block';
        return;
    }
    emailError.style.display = 'none';

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/users/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: name || authState.user.name, email }),
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.message || '저장에 실패했습니다.');
            return;
        }

        const updated = await res.json();
        authState.user = updated;
        bindProfileUI(updated);
        window.closeEditModal();
    } catch (e) {
        console.error('updateProfile error:', e);
        alert('저장 중 오류가 발생했습니다.');
    }
};

// ── 최초 로그인 환영 모달 ────────────────────────────────────

function openWelcomeModal(user) {
    document.getElementById('welcome-name').value = user.name || '';
    document.getElementById('welcome-email').value = user.email || '';
    document.getElementById('welcome-email-error').style.display = 'none';
    document.getElementById('welcome-modal').classList.add('active');
}

window.closeWelcomeModal = function () {
    // 이메일이 없으면 닫기 불가 (강제)
    if (!authState.user.email) {
        document.getElementById('welcome-email-error').style.display = 'block';
        document.getElementById('welcome-email').focus();
        return;
    }
    document.getElementById('welcome-modal').classList.remove('active');
};

window.submitWelcomeProfile = async function () {
    const name = document.getElementById('welcome-name').value.trim();
    const email = document.getElementById('welcome-email').value.trim();
    const emailError = document.getElementById('welcome-email-error');

    if (!email) {
        emailError.style.display = 'block';
        return;
    }
    emailError.style.display = 'none';

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/users/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: name || authState.user.name, email }),
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.message || '저장에 실패했습니다.');
            return;
        }

        const updated = await res.json();
        authState.user = updated;
        bindProfileUI(updated);
        document.getElementById('welcome-modal').classList.remove('active');
    } catch (e) {
        console.error('welcomeProfile error:', e);
        alert('저장 중 오류가 발생했습니다.');
    }
};

// ── 관심 매물 ────────────────────────────────────────────────

async function fetchMyLikes() {
    const tabLikes = document.getElementById('tab-likes');
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/favorites/me`, { credentials: 'include' });
        const data = await res.json();

        let contentHtml = `<h3 style="margin-bottom: 1.5rem;">찜한 매물</h3>`;

        if (!data || data.length === 0) {
            contentHtml += `
            <div style="text-align: center; padding: 4rem; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
                <i class="ri-heart-3-line" style="font-size: 3rem; margin-bottom: 1rem; display:block;"></i>
                관심 매물로 등록한 항목이 없습니다.
            </div>`;
            tabLikes.innerHTML = contentHtml;
            return;
        }

        const gridContainer = document.createElement('div');
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
        gridContainer.style.gap = '1.5rem';

        data.forEach(prop => {
            const card = document.createElement('div');
            card.className = 'property-card';
            card.style.cursor = 'pointer';
            card.onclick = () => {
                const targetPath = window.location.pathname.endsWith('.html') ? '/properties.html' : '/properties';
                window.location.href = `${targetPath}?id=${prop.id}&pnu=${prop.pnu || ''}`;
            };

            let imageHTML = '';
            if (prop.after_image || prop.before_image || prop.thumb) {
                const singleImg = prop.after_image || prop.before_image || prop.thumb;
                imageHTML = `<img src="${singleImg}" class="card-image" style="height:200px; width:100%; object-fit:cover;" alt="매물 썸네일">`;
            } else {
                imageHTML = `<div class="card-image" style="height:200px; display:flex; align-items:center; justify-content:center; background:#f4f4f4; color:#aaa; font-size:2rem;"><i class="ri-building-4-line"></i></div>`;
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
            gridContainer.appendChild(card);
        });

        tabLikes.innerHTML = contentHtml;
        tabLikes.appendChild(gridContainer);

    } catch (err) {
        console.error("fetchMyLikes error:", err);
        tabLikes.innerHTML = `<h3 style="margin-bottom: 1.5rem;">찜한 매물</h3>
            <p style="color:var(--danger-color); text-align:center;">관심 매물 목록을 불러오는데 실패했습니다.</p>`;
    }
}
