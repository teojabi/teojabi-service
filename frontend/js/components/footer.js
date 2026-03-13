// js/components/footer.js
export function renderFooter(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <footer class="app-footer">
            <div class="container">
                <p>&copy; ${new Date().getFullYear()} 터잡이 (Teojabi). All rights reserved.</p>
                <p style="margin-top: 0.5rem; color: #94a3b8;">
                    본 서비스의 부동산 공공데이터 정보는 국토교통부 표준 API를 활용합니다.
                </p>
            </div>
        </footer>
    `;
}
