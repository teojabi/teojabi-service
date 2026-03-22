// js/components/login-modal.js
export function renderLoginModal(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // TODO: 백엔드 NCP 서버 주소 연동 시 HREF 수정 필요 (현재는 상대 경로 프록시 호환)
    container.innerHTML = `
        <div class="modal-overlay" id="global-login-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">간편 로그인</h3>
                    <button class="btn-close" onclick="window.closeLoginModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
                        소셜 계정으로 터잡이에 1초만에 가입 및 로그인하세요.
                    </p>
                    
                    <button class="auth-provider-btn btn-kakao" onclick="location.href='${CONFIG.API_BASE_URL}/api/v1/auth/kakao'">
                        <i class="ri-kakao-talk-fill"></i> 카카오 로그인
                    </button>
                    <button class="auth-provider-btn btn-naver" onclick="location.href='${CONFIG.API_BASE_URL}/api/v1/auth/naver'">
                        <i class="ri-search-line"></i> 네이버 로그인
                    </button>
                    <button class="auth-provider-btn btn-google" onclick="location.href='${CONFIG.API_BASE_URL}/api/v1/auth/google'">
                        <i class="ri-google-fill"></i> 구글 로그인
                    </button>
                </div>
            </div>
        </div>
    `;
}
