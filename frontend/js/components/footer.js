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
                            <p><strong>고객센터:</strong> 070-8919-4609 | <strong>이메일:</strong> teojabi@gmail.com</p>
                        </div>
                    </div>
                    <div class="footer-links">
                        <div class="link-group">
                            <h4 class="link-title">고객지원</h4>
                            <ul>
                                <li><a href="/terms.html">이용약관</a></li>
                                <li><a href="/privacy.html" class="bold" style="font-weight: 800; color: #1e40af;">개인정보처리방침</a></li>
                                <li><a href="/refund.html">환불 정책</a></li>
                                <li><a href="/paid-service.html">구독서비스</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="footer-bottom">
                    <div class="footer-legal-links">
                        <a href="/terms.html">이용약관</a>
                        <span class="divider">|</span>
                        <a href="/privacy.html" class="bold" style="font-weight: 800; color: #1e40af;">개인정보처리방침</a>
                        <span class="divider">|</span>
                        <a href="/paid-service.html">구독서비스</a>
                        <span class="divider">|</span>
                        <a href="/refund.html">환불정책</a>
                        <span class="divider">|</span>
                        <a href="#" data-popup-type="business">사업자정보</a>
                    </div>
                    <p class="copyright">&copy; 2026 Teojabi. All rights reserved.</p>
                </div>
            </div>
        </footer>
        <div class="footer-layer-popup" id="footer-layer-popup" aria-hidden="true">
            <div class="footer-layer-popup__overlay" data-popup-close="true"></div>
            <div class="footer-layer-popup__content" role="dialog" aria-modal="true" aria-label="약관 및 정책 안내">
                <button type="button" class="footer-layer-popup__close" data-popup-close="true" aria-label="팝업 닫기">×</button>
                <h3 class="footer-layer-popup__title" id="footer-layer-popup-title"></h3>
                <div class="footer-layer-popup__body" id="footer-layer-popup-body"></div>
            </div>
        </div>
    `;

    const popup = container.querySelector('#footer-layer-popup');
    const popupTitle = container.querySelector('#footer-layer-popup-title');
    const popupBody = container.querySelector('#footer-layer-popup-body');

    if (!popup || !popupTitle || !popupBody) return;

    const closePopup = () => {
        popup.classList.remove('is-open');
        popup.setAttribute('aria-hidden', 'true');
        popupBody.innerHTML = '';
    };

    const openPopup = (title, html) => {
        popupTitle.textContent = title;
        popupBody.innerHTML = html;
        popup.classList.add('is-open');
        popup.setAttribute('aria-hidden', 'false');
    };

    container.querySelectorAll('.footer-legal-links a[data-popup-type]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();

            const popupType = link.dataset.popupType;
            const title = link.textContent?.trim() || '';

            if (popupType === 'business') {
                openPopup('사업자정보', `
                    <div class="footer-business-popup">
                        <p><strong>상호명:</strong> 터잡이</p>
                        <p><strong>대표자:</strong> 방양임</p>
                        <p><strong>사업자등록번호:</strong> 846-13-02909</p>
                        <p><strong>주소:</strong> 경기도 광주시 머루숯길 22, C-101</p>
                        <p><strong>통신판매업 신고번호:</strong> 제 2026-서울강동-0000호</p>
                        <p><strong>고객센터:</strong> 070-8919-4609</p>
                        <p><strong>이메일:</strong> teojabi@gmail.com</p>
                    </div>
                `);
                return;
            }

            const popupSrc = link.dataset.popupSrc;
            if (!popupSrc) return;

            openPopup(title, `<iframe class="footer-layer-popup__iframe" src="${popupSrc}" title="${title}"></iframe>`);
        });
    });

    popup.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.dataset.popupClose === 'true') {
            closePopup();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && popup.classList.contains('is-open')) {
            closePopup();
        }
    });
}
