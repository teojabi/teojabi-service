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
                            <p><strong>통신판매업 신고번호:</strong> 제 2026-경기광주-1091호</p>
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
                    <div class="footer-meta">
                        <p class="copyright">&copy; 2026 Teojabi. All rights reserved.</p>
                        <div class="footer-social-links" aria-label="터잡이 소셜 링크">
                            <a href="https://www.instagram.com/teojabi?igsh=M2x3Zmx5aXRjN2M4" target="_blank" rel="noopener noreferrer" class="social-link instagram" aria-label="터잡이 인스타그램" title="터잡이 인스타그램">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <defs>
                                        <linearGradient id="footer-instagram-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
                                            <stop offset="0%" stop-color="#f9ce34"></stop>
                                            <stop offset="45%" stop-color="#ee2a7b"></stop>
                                            <stop offset="100%" stop-color="#6228d7"></stop>
                                        </linearGradient>
                                    </defs>
                                    <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="url(#footer-instagram-gradient)"></rect>
                                    <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" stroke-width="2"></circle>
                                    <circle cx="17.5" cy="6.5" r="1.2" fill="#fff"></circle>
                                </svg>
                            </a>
                            <a href="https://www.youtube.com/@teojabi" target="_blank" rel="noopener noreferrer" class="social-link youtube" aria-label="터잡이 유튜브" title="터잡이 유튜브">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M22 12c0 2.4-.3 4-.6 5-.3 1-1 1.7-2 2-1 .3-4 .6-7.4.6S5.6 19.3 4.6 19c-1-.3-1.7-1-2-2-.3-1-.6-2.6-.6-5s.3-4 .6-5c.3-1 1-1.7 2-2 1-.3 4-.6 7.4-.6s6.4.3 7.4.6c1 .3 1.7 1 2 2 .3 1 .6 2.6.6 5Z" fill="currentColor"></path>
                                    <path d="M10 8.8v6.4L15.8 12 10 8.8Z" fill="#fff"></path>
                                </svg>
                            </a>
                        </div>
                    </div>
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
                        <p><strong>통신판매업 신고번호:</strong> 제 2026-경기광주-1091호</p>
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
