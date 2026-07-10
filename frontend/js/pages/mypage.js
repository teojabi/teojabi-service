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

        fetchMyReservations();
        fetchMyLikes();
        fetchMyPaidMembership();

    }, 500); // app.js의 글로벌 auth 로드 대기
});

function bindProfileUI(user) {
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const phoneBadge = document.getElementById('phone-status-badge');

    if (profileName) profileName.textContent = user.name || '사용자';
    if (profileEmail) profileEmail.textContent = user.email || '이메일 미설정';
    if (profilePhone) profilePhone.textContent = user.phone || '연락처 미등록';
    if (phoneBadge) {
        phoneBadge.style.display = user.phoneVerified ? 'inline-block' : 'none';
    }
}

// ── 정보 수정 모달 ──────────────────────────────────────────

window.openEditModal = function () {
    const user = authState.user;
    document.getElementById('edit-name').value = user.name || '';
    document.getElementById('edit-email').value = user.email || '';
    document.getElementById('edit-phone').value = user.phone || '';
    document.getElementById('edit-email-error').style.display = 'none';
    document.getElementById('edit-modal').classList.add('active');
};

window.closeEditModal = function () {
    document.getElementById('edit-modal').classList.remove('active');
};

window.submitEditProfile = async function () {
    const name = document.getElementById('edit-name').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
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
            body: JSON.stringify({ name: name || authState.user.name, email, phone }),
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
    document.getElementById('welcome-phone').value = user.phone || '';
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
    const phone = document.getElementById('welcome-phone').value.trim();
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
            body: JSON.stringify({ name: name || authState.user.name, email, phone }),
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

function openCenteredConfirmPopup({ title, message, confirmText = '확인', cancelText = '취소' }) {
    return new Promise(resolve => {
        if (!document.body) {
            resolve(window.confirm(`${title}\n\n${message}`));
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0, 0, 0, 0.45)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '1rem';
        overlay.style.zIndex = '9999';

        const popup = document.createElement('div');
        popup.style.width = 'min(92vw, 420px)';
        popup.style.background = 'var(--card-bg, #ffffff)';
        popup.style.border = '1px solid var(--border-color, #e5e7eb)';
        popup.style.borderRadius = '12px';
        popup.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.2)';
        popup.style.padding = '1.1rem';

        const titleEl = document.createElement('h4');
        titleEl.textContent = title;
        titleEl.style.margin = '0 0 0.75rem 0';
        titleEl.style.fontSize = '1rem';
        titleEl.style.fontWeight = '700';
        titleEl.style.color = 'var(--text-color, #111827)';

        const messageWrap = document.createElement('div');
        messageWrap.style.background = 'var(--bg-muted, #f8fafc)';
        messageWrap.style.border = '1px solid var(--border-color, #e5e7eb)';
        messageWrap.style.borderRadius = '8px';
        messageWrap.style.padding = '0.75rem';
        messageWrap.style.marginBottom = '1rem';

        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        messageEl.style.margin = '0';
        messageEl.style.whiteSpace = 'pre-line';
        messageEl.style.lineHeight = '1.45';
        messageEl.style.fontSize = '0.92rem';
        messageEl.style.color = 'var(--text-color, #111827)';

        const actionWrap = document.createElement('div');
        actionWrap.style.display = 'flex';
        actionWrap.style.justifyContent = 'flex-end';
        actionWrap.style.gap = '0.5rem';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = cancelText;
        cancelBtn.className = 'btn btn-outline';
        cancelBtn.style.padding = '0.45rem 0.75rem';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = confirmText;
        confirmBtn.className = 'btn';
        confirmBtn.style.padding = '0.45rem 0.75rem';
        confirmBtn.style.background = 'var(--danger-color, #e53e3e)';
        confirmBtn.style.color = '#fff';

        let closed = false;
        const close = (result) => {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', handleKeydown);
            overlay.remove();
            resolve(result);
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                close(true);
            }
        };

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close(false);
            }
        });
        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));

        messageWrap.appendChild(messageEl);
        actionWrap.appendChild(cancelBtn);
        actionWrap.appendChild(confirmBtn);
        popup.appendChild(titleEl);
        popup.appendChild(messageWrap);
        popup.appendChild(actionWrap);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        document.addEventListener('keydown', handleKeydown);
        confirmBtn.focus();
    });
}

// ── 관심 매물 ────────────────────────────────────────────────

async function fetchMyReservations() {
    const tabReservations = document.getElementById('tab-reservations');
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/reservations/me`, { credentials: 'include' });
        const data = await res.json();

        let contentHtml = `<h3 style="margin-bottom: 1.5rem;">나의 상담 예약 내역</h3>`;

        if (!data || data.length === 0) {
            contentHtml += `
            <div style="text-align: center; padding: 4rem; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
                <i class="ri-calendar-close-line" style="font-size: 3rem; margin-bottom: 1rem; display:block;"></i>
                예약된 상담 내역이 없습니다.
            </div>`;
            tabReservations.innerHTML = contentHtml;
            return;
        }

        const listContainer = document.createElement('div');
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.gap = '1rem';

        data.forEach(resv => {
            const item = document.createElement('div');
            item.className = 'property-card resv-item-card'; // 스타일 재활용 및 커스텀 클래스 추가
            item.style.display = 'flex';
            item.style.flexDirection = 'column'; // 모바일 우선 세로 배치
            item.style.padding = '1.5rem';
            item.style.gap = '1rem';

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

            item.innerHTML = `
                <div style="width: 100%;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap: wrap;">
                        <span style="background:${status.color}; color:white; padding:2px 8px; border-radius:4px; font-size:0.8rem;">${status.label}</span>
                        <span style="color:var(--primary-color); font-weight:600; font-size:0.85rem;">${typeLabel}</span>
                        <span style="color:var(--text-muted); font-size:0.8rem; margin-left:auto;">신청일: ${createdAtStr}</span>
                    </div>
                    <h4 style="margin-bottom:8px; font-size:1.1rem; line-height:1.4;">${resv.address || (resv.property ? resv.property.address : '주소 정보 없음')}</h4>
                    <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
                        <p style="color:var(--text-main); font-size:0.9rem; display:flex; align-items:center; gap:5px;">
                            <i class="ri-calendar-line" style="color:var(--primary-color);"></i> 
                            <span style="color:var(--text-muted); margin-right:4px;">희망 일시:</span> ${dateStr}
                        </p>
                    </div>
                    <div style="background:var(--bg-muted); padding:12px; border-radius:var(--radius-sm); font-size:0.9rem; color:var(--text-main); border-left:3px solid var(--border-color);">
                        ${resv.message || '남긴 메시지가 없습니다.'}
                    </div>
                    <div style="margin-top:12px; background:#f7fbff; padding:12px; border-radius:var(--radius-sm); border-left:3px solid var(--primary-color);">
                        <div style="font-size:0.8rem; color:var(--primary-color); font-weight:600; margin-bottom:4px;">관리자 피드백</div>
                        <div style="font-size:0.9rem; color:var(--text-main);">${resv.adminFeedback || '아직 등록된 피드백이 없습니다.'}</div>
                    </div>
                </div>
            `;
            listContainer.appendChild(item);
        });

        tabReservations.innerHTML = contentHtml;
        tabReservations.appendChild(listContainer);

    } catch (err) {
        console.error("fetchMyReservations error:", err);
        tabReservations.innerHTML = `<h3 style="margin-bottom: 1.5rem;">나의 상담 예약 내역</h3>
            <p style="color:var(--danger-color); text-align:center;">예약 내역을 불러오는데 실패했습니다.</p>`;
    }
}

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
            const hasBefore = !!prop.beforeImage;
            const hasAfter = !!prop.afterImage;

            if (hasBefore && hasAfter) {
                // 비포/애프터 두 개 나란히 표시
                imageHTML = `
                    <div class="card-image-container" style="height:200px; display:flex; gap:2px; background:#eee; position:relative;">
                        <div style="width:50%; height:100%; position:relative; overflow:hidden;">
                            <img src="${prop.beforeImage}" style="width:100%; height:100%; object-fit:cover;" alt="Before">
                            <span class="card-image-label" style="left:8px;">Before</span>
                        </div>
                        <div style="width:50%; height:100%; position:relative; overflow:hidden;">
                            <img src="${prop.afterImage}" style="width:100%; height:100%; object-fit:cover;" alt="After">
                            <span class="card-image-label" style="right:8px;">After</span>
                        </div>
                    </div>`;
            } else if (hasAfter || hasBefore || prop.thumb) {
                const singleImg = prop.afterImage || prop.beforeImage || prop.thumb;
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

function formatKrw(amount) {
    const numeric = Number(amount || 0);
    return `${numeric.toLocaleString('ko-KR')}원`;
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR');
}

async function fetchMyPaidMembership() {
    const tabPaid = document.getElementById('tab-paid-membership');
    if (!tabPaid) return;

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/subscriptions/my-paid-summary`, { credentials: 'include' });
        const data = await res.json();

        const subscription = data?.subscription;
        const credit = data?.credit;
        const invoices = Array.isArray(data?.invoices) ? data.invoices : [];

        const subscriptionStatus = String(subscription?.status || '').toUpperCase();
        const subscriptionPlanCode = String(subscription?.plan?.code || '').toUpperCase();
        const hasSubscriptionInfo = Boolean(subscription);
        const hasActiveSubscription = subscriptionStatus === 'ACTIVE';
        const isLightOrProPlan =
            subscriptionPlanCode.includes('LIGHT') ||
            subscriptionPlanCode.includes('BASIC') ||
            subscriptionPlanCode.includes('PRO') ||
            subscriptionPlanCode.includes('PLUS');
        const canChangeSubscriptionPlan =
            hasSubscriptionInfo &&
            ['ACTIVE', 'PENDING', 'PAST_DUE'].includes(subscriptionStatus) &&
            isLightOrProPlan;
        const shouldShowSubscriptionGuide = !hasSubscriptionInfo || subscriptionStatus === 'CANCELLED';

        const createSubscriptionActions = ({ compact = false, align = 'flex-end' } = {}) => {
            const minWidthStyle = compact ? '' : 'min-width:120px; ';
            const actionButtonStyle = `${minWidthStyle}padding:${compact ? '0.4rem 0.7rem' : '0.45rem 0.75rem'}; font-size:${compact ? '0.82rem' : '0.85rem'};`;
            const actions = [];

            if (shouldShowSubscriptionGuide) {
                actions.push(
                    `<a href="/paid-service.html" class="btn btn-outline" style="${actionButtonStyle}text-align:center;">구독서비스 안내</a>`,
                );
            }

            if (canChangeSubscriptionPlan) {
                actions.push(
                    `<button type="button" class="btn btn-outline" data-action="change-subscription-plan" style="${actionButtonStyle}">구독플랜변경</button>`,
                );
            }

            if (hasActiveSubscription) {
                actions.push(
                    `<button type="button" class="btn" data-action="cancel-subscription" style="${actionButtonStyle}background: var(--danger-color, #e53e3e); color:#fff;">구독취소</button>`,
                );
            }

            if (actions.length === 0) {
                return '';
            }

            return `<div style="display:flex; flex-wrap:wrap; gap:0.5rem; justify-content:${align}; margin-top:${compact ? '0.7rem' : '0.8rem'};">${actions.join('')}</div>`;
        };

        const subscriptionCard = subscription
            ? `
                <div style="background: var(--bg-muted); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
                    <h4 style="margin-bottom: 0.8rem;">구독 정보</h4>
                    <p style="margin: 0.2rem 0;"><strong>플랜:</strong> ${subscription.plan?.name || '-'} (${subscription.plan?.code || '-'})</p>
                    <p style="margin: 0.2rem 0;"><strong>상태:</strong> ${subscription.status || '-'}</p>
                    <p style="margin: 0.2rem 0;"><strong>구독 시작일:</strong> ${formatDateTime(subscription.startAt)}</p>
                    <p style="margin: 0.2rem 0;"><strong>현재 구독 종료일:</strong> ${formatDateTime(subscription.currentPeriodEnd)}</p>
                    ${createSubscriptionActions({ align: 'flex-end' })}
                </div>
            `
            : `
                <div style="background: var(--bg-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; color: var(--text-muted);">
                    활성 구독 정보가 없습니다.
                    ${createSubscriptionActions({ compact: true, align: 'center' })}
                </div>
            `;

        const hasDailyLimit = Number(credit?.totalCredits || 0) >= 200;
        const dailyLimitRow = hasDailyLimit
            ? `<p style="margin: 0.2rem 0;"><strong>일일 제한:</strong> 일일 최대 50회 제한</p>`
            : '';

        const creditCard = credit
            ? `
                <div style="background: var(--bg-muted); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem;">
                    <h4 style="margin-bottom: 0.8rem;">분석 요청 크레딧</h4>
                    <p style="margin: 0.2rem 0;"><strong>총 크레딧:</strong> ${Number(credit.totalCredits || 0).toLocaleString('ko-KR')}</p>
                    <p style="margin: 0.2rem 0;"><strong>사용 크레딧:</strong> ${Number(credit.usedCredits || 0).toLocaleString('ko-KR')}</p>
                    <p style="margin: 0.2rem 0;"><strong>잔여 크레딧:</strong> ${Number(credit.availableCredits || 0).toLocaleString('ko-KR')}</p>
                    ${dailyLimitRow}
                    <p style="margin: 0.2rem 0; color: var(--text-muted); font-size: 0.85rem;">최종 반영: ${formatDateTime(credit.updatedAt)}</p>
                </div>
            `
            : `
                <div style="background: var(--bg-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; color: var(--text-muted);">
                    크레딧 정보가 없습니다. (아래 SQL 적용 후 표시됩니다)
                </div>
            `;

        let invoiceHtml = '';
        if (invoices.length === 0) {
            invoiceHtml = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
                    결제 내역이 없습니다.
                </div>
            `;
        } else {
            const rows = invoices.map((invoice) => `
                <tr>
                    <td style="padding: 0.65rem; border-bottom: 1px solid var(--border-color);">${formatDateTime(invoice.paidAt || invoice.requestedAt)}</td>
                    <td style="padding: 0.65rem; border-bottom: 1px solid var(--border-color);">${invoice.planName || '-'}</td>
                    <td style="padding: 0.65rem; border-bottom: 1px solid var(--border-color); text-align:right;">${formatKrw(invoice.amount)}</td>
                    <td style="padding: 0.65rem; border-bottom: 1px solid var(--border-color);">${invoice.status || '-'}</td>
                </tr>
            `).join('');

            invoiceHtml = `
                <div style="overflow-x:auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                    <table style="width:100%; border-collapse: collapse; min-width: 540px;">
                        <thead>
                            <tr style="background: var(--bg-muted); text-align:left;">
                                <th style="padding: 0.75rem;">결제일</th>
                                <th style="padding: 0.75rem;">플랜</th>
                                <th style="padding: 0.75rem; text-align:right;">금액</th>
                                <th style="padding: 0.75rem;">상태</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        tabPaid.innerHTML = `
            <h3 style="margin-bottom: 1.5rem;">유료회원 정보</h3>
            ${subscriptionCard}
            ${creditCard}
            <h4 style="margin-bottom: 0.8rem;">결제 내역</h4>
            ${invoiceHtml}
        `;

        const changeSubscriptionPlanButtons = tabPaid.querySelectorAll('[data-action="change-subscription-plan"]');
        changeSubscriptionPlanButtons.forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = '/paid-service.html';
            });
        });

        const cancelSubscriptionBtn = tabPaid.querySelector('[data-action="cancel-subscription"]');
        if (cancelSubscriptionBtn) {
            cancelSubscriptionBtn.addEventListener('click', async () => {
                const usedCredits = Number(credit?.usedCredits || 0);
                const isUnusedCredit = usedCredits === 0;
                const cancelGuideMessage = isUnusedCredit
                    ? '⚠️ 주의\n구독 취소는 향후 자동 결제되는 결제예약이 취소됩니다.\n현재 구독의 크레딧이 미사용 상태여서 현재 구독의 결제는 환불되고, 모든 크레딧은 소멸됩니다.'
                    : '⚠️ 주의\n구독 취소는 향후 자동 결제되는 결제예약이 취소됩니다.\n현재 구독의 크레딧이 사용중입니다. 현재 구독의 크레딧은 현재 구독 종료일까지 유지되며, 중도 환불은 되지 않습니다.';
                const shouldCancel = await openCenteredConfirmPopup({
                    title: '구독을 취소하시겠습니까?',
                    message: cancelGuideMessage,
                    confirmText: '구독 취소',
                    cancelText: '닫기',
                });
                if (!shouldCancel) return;

                const originalText = cancelSubscriptionBtn.textContent;
                cancelSubscriptionBtn.disabled = true;
                cancelSubscriptionBtn.textContent = '처리중...';

                try {
                    const res = await fetch(`${CONFIG.API_BASE_URL}/api/v1/subscriptions/cancel`, {
                        method: 'POST',
                        credentials: 'include',
                    });
                    const result = await res.json();
                    if (!res.ok) {
                        throw new Error(result?.message || '구독 취소 처리에 실패했습니다.');
                    }

                    window.alert(result?.message || '구독 취소가 완료되었습니다.');
                    await fetchMyPaidMembership();
                } catch (error) {
                    console.error('cancel subscription error:', error);
                    window.alert(error?.message || '구독 취소 처리에 실패했습니다.');
                    cancelSubscriptionBtn.disabled = false;
                    cancelSubscriptionBtn.textContent = originalText;
                }
            });
        }
    } catch (err) {
        console.error('fetchMyPaidMembership error:', err);
        tabPaid.innerHTML = `
            <h3 style="margin-bottom: 1.5rem;">유료회원 정보</h3>
            <p style="color:var(--danger-color); text-align:center;">유료회원 정보를 불러오는데 실패했습니다.</p>
        `;
    }
}
