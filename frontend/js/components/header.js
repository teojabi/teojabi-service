// js/components/header.js
export function renderHeader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <header class="app-header">
            <div class="header-inner">
                <a href="/" class="header-logo">
                    <img src="/img/logo.png" alt="터잡이 로고" class="header-logo-img">
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
                        <!-- 모바일 드롭다운 -->
                        <div id="mobile-user-dropdown" class="mobile-user-dropdown">
                            <a href="/mypage.html" id="dropdown-mypage">마이페이지</a>
                            <a href="/admin.html" id="dropdown-admin" class="hidden">관리자</a>
                            <button onclick="window.logout()">로그아웃</button>
                        </div>
                    </div>
                </nav>
            </div>
        </header>
    `;

    // 모바일 사용자 이름 클릭 시 드롭다운 토글
    const userNameEl = document.getElementById('header-user-name');
    const dropdown = document.getElementById('mobile-user-dropdown');

    if (userNameEl && dropdown) {
        userNameEl.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        // 외부 클릭 시 드롭다운 닫기
        document.addEventListener('click', () => {
            dropdown.classList.remove('open');
        });
    }
}
