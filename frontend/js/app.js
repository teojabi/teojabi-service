// js/app.js
import { renderHeader } from './components/header.js';
import { renderLoginModal } from './components/login-modal.js';
import { checkAuthStatus } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 공통 UI 컴포넌트 렌더링
    renderHeader('header-container');
    renderLoginModal('login-modal-container');

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
