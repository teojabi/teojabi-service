// js/components/footer.js
export function renderFooter(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 메인 페이지 전용 스타일 클래스 추가
    if (document.body.classList.contains('home-page')) {
        container.classList.add('home-page-footer');
    }

    container.innerHTML = `
        <footer class="app-footer">
            <div class="footer-inner">
                <div class="footer-content">
                    <div class="footer-info">
                        <div class="footer-logo">
                            <img src="/img/logo.png" alt="터잡이 로고" class="footer-logo-img">
                        </div>
                        <div class="business-info">
                            <p><strong>상호명:</strong> 터잡이</p>
                            <p><strong>대표자:</strong> 방양임 | <strong>사업자등록번호:</strong> 846-13-02909</p>
                            <p><strong>주소:</strong> 경기도 광주시 머루숯길 22, C-101</p>
                            <p><strong>통신판매업 신고번호:</strong> 제 2026-서울강동-0000호</p>
                            <p><strong>고객센터:</strong> 070-8919-4609 | <strong>이메일:</strong> support@teojabi.com</p>
                        </div>
                    </div>
                    <div class="footer-links">
                        <div class="link-group">
                            <h4 class="link-title">고객지원</h4>
                            <ul>
                                <li><a href="/terms.html">이용약관</a></li>
                                <li><a href="/privacy.html" class="bold" style="font-weight: 800; color: #1e40af;">개인정보처리방침</a></li>
                                <li><a href="/refund.html">환불 정책</a></li>
                                <li><a href="/paid-service.html">유료서비스</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="footer-bottom">
                    <div class="business-info-summary">
                        ⓒ 2026 | 터잡이 | 방양임 | 846-13-02909 | 경기 광주 머루숯길 22, C-101 | 070-8919-4609
                    </div>
                    <div class="footer-legal-links">
                        <a href="/terms.html">이용약관</a>
                        <span class="divider">|</span>
                        <a href="/privacy.html" class="bold" style="font-weight: 800; color: #1e40af;">개인정보처리방침</a>
                        <span class="divider">|</span>
                        <a href="/paid-service.html">유료서비스</a>
                        <span class="divider">|</span>
                        <a href="/refund.html">환불 정책</a>
                    </div>
                    <p class="copyright">&copy; 2026 Teojabi. All rights reserved.</p>
                </div>
            </div>
        </footer>
    `;
}
