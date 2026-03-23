// js/auth.js

// 사용자 상태 심볼릭 객체
export const authState = {
    isAuthenticated: false,
    user: null
};

// 백엔드의 현재 로그인 상태 확인 API 호출
export async function checkAuthStatus() {
    try {
        // credentials: 'include' 를 통해 브라우저가 자동으로 HttpOnly 쿠키(JWT)를 포함하여 요청
        // TODO: NCP 서버 주소 나오면 환경변수나 상수 적용 (현재는 상대 경로 또는 localhost 포트로 대체)
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/users/me`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });

        if (response.ok) {
            const result = await response.json();
            authState.isAuthenticated = true;
            authState.user = result;
            updateAuthUI(true, result);
        } else {
            authState.isAuthenticated = false;
            authState.user = null;
            updateAuthUI(false);
        }
    } catch (error) {
        console.error("Auth check failed:", error);
        authState.isAuthenticated = false;
        updateAuthUI(false);
    }
}

// 로그인/비로그인 상태에 따라 Header UI 변경
function updateAuthUI(isLoggedIn, user) {
    const loginBtn = document.getElementById('btn-header-login');
    const userProfileDiv = document.getElementById('header-user-profile');
    const userNameSpan = document.getElementById('header-user-name');
    const adminBtn = document.getElementById('btn-header-admin');
    const mypageBtn = document.getElementById('btn-header-mypage');

    if (isLoggedIn && user) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userProfileDiv) userProfileDiv.classList.remove('hidden');
        if (userNameSpan) userNameSpan.textContent = user.name || '사용자';

        // ADMIN 권한이면 관리자 메뉴 노출, 일반 사용자는 마이페이지 노출
        if (user.role === 'ADMIN') {
            if (adminBtn) adminBtn.classList.remove('hidden');
            if (mypageBtn) mypageBtn.classList.add('hidden');
        } else {
            if (adminBtn) adminBtn.classList.add('hidden');
            if (mypageBtn) mypageBtn.classList.remove('hidden');
        }
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userProfileDiv) userProfileDiv.classList.add('hidden');
        if (userNameSpan) userNameSpan.textContent = '';
    }
}

// 소셜 로그인 리다이렉트 (a 태그 클릭을 js단에서 통제해도 되고 HTML 그대로 둬도 됨)
export function loginWithProvider(provider) {
    window.location.href = `${CONFIG.API_BASE_URL}/api/v1/auth/${provider}`;
}

export async function logout() {
    try {
        await fetch(`${CONFIG.API_BASE_URL}/api/v1/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = '/';
    } catch (err) {
        console.error("Logout failed", err);
    }
}

window.logout = logout;
