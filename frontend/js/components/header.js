// js/components/header.js
export function renderHeader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <header class="app-header">
            <div class="header-inner">
                <a href="/" class="header-logo">
                    <i class="ri-home-office-fill"></i> 터잡이
                </a>
                <nav class="header-nav">
                    <a href="/search.html" class="nav-link">지도 검색</a>
                    <a href="/gallery.html" class="nav-link">컨설팅 갤러리</a>
                    
                    <!-- 비로그인 시 노출 -->
                    <button id="btn-header-login" class="btn btn-outline" onclick="window.openLoginModal()">로그인</button>
                    
                    <!-- 로그인 시 노출 -->
                    <div id="header-user-profile" class="header-user-profile hidden">
                        <span id="header-user-name" class="user-name"></span><span class="user-greeting">님 환영합니다</span>
                        <a href="/mypage.html" id="btn-header-mypage" class="btn btn-outline btn-sm">마이페이지</a>
                        <a href="/admin.html" id="btn-header-admin" class="btn btn-primary btn-sm hidden">관리자</a>
                        <button id="btn-header-logout" class="btn btn-outline btn-sm" onclick="window.logout()">로그아웃</button>
                    </div>
                </nav>
            </div>
        </header>
    `;
}
