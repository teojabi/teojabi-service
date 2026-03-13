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
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        const profileAvatar = document.getElementById('profile-avatar');

        if (authState.user.name) profileName.textContent = authState.user.name;
        if (authState.user.email) profileEmail.textContent = authState.user.email;
        if (authState.user.image) {
            profileAvatar.innerHTML = `<img src="${authState.user.image}" alt="Profile">`;
        } else {
            profileAvatar.innerHTML = `<i class="ri-user-fill"></i>`;
        }

        // TODO: 내 상담 예약 및 관심 매물 데이터 FETCH
        // fetchMyReservations();
        // fetchMyLikes();

    }, 500); // app.js의 글로벌 auth 로드 대기
});
