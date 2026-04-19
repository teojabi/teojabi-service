// js/app.js
import { renderHeader } from './components/header.js';
import { renderFooter } from './components/footer.js';
import { renderLoginModal } from './components/login-modal.js';
import { checkAuthStatus } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 공통 UI 컴포넌트 렌더링
    renderHeader('header-container');
    renderFooter('footer-container');
    renderLoginModal('login-modal-container');

    // 2. 초기화 (푸터 위치 보정을 위한 스타일 등은 CSS에서 처리)

    // 2. 초기 렌더링 애니메이션 (선택)
    document.body.style.opacity = '1';

    // 3. 글로벌 인증 상태 체크 
    // HttpOnly 쿠키 기반이므로 auth.js 내부에서 API를 찔러보고 UI 상태(로그인/로그아웃 버튼 등) 갱신
    await checkAuthStatus();
});

// 전역 유틸 함수 노출
window.openLoginModal = () => {
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.classList.add('active');
};

window.closeLoginModal = () => {
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.classList.remove('active');
};

/**
 * 프리미엄 상담 신청 공통 로직
 * @param {Object} params - { propertyId, pnu, address, type }
 */
window.requestPremiumConsultation = async (params) => {
    const { authState } = await import('./auth.js');
    if (!authState.isAuthenticated) {
        alert("로그인 후 이용 가능합니다.");
        window.openLoginModal();
        return;
    }

    const type = params.type || 'GENERAL';
    const typeLabel = type === 'REPORT' ? '전문가 리포트' : '프리미엄 상담';

    // 날짜 및 메시지 입력
    let reqDate;
    try { 
        reqDate = prompt(`${typeLabel} 희망 날짜를 입력하세요 (YYYY-MM-DD):`, new Date().toISOString().split('T')[0]); 
    } catch (e) { }
    if (!reqDate) return; 

    let reqMsg;
    try { 
        reqMsg = prompt("남기실 문의 메시지를 입력하세요 (필요 시):"); 
    } catch (e) { }
    if (reqMsg === null) return; 
    if (!reqMsg) reqMsg = `${typeLabel}을 신청합니다.`;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/reservations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                type: type,
                propertyId: params.propertyId || null,
                pnu: params.pnu || null,
                address: params.address || null,
                date: new Date(`${reqDate}T12:00:00Z`).toISOString(),
                message: reqMsg
            })
        });

        if (response.ok) {
            alert(`${typeLabel} 신청이 성공적으로 완료되었습니다.\n담당 컨설턴트가 곧 연락드리겠습니다.`);
        } else {
            const errData = await response.json();
            alert(`신청에 실패했습니다: ${errData.message || '알 수 없는 오류'}`);
        }
    } catch (err) {
        console.error("Consultation Request Error:", err);
        alert("서버 오류로 인해 신청할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }
};

window.formatPriceToKorean = (price) => {
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
};

