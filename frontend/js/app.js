// js/app.js
import { renderHeader } from './components/header.js';
import { renderFooter } from './components/footer.js';
import { renderLoginModal } from './components/login-modal.js';
import { checkAuthStatus, authState } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 공통 UI 컴포넌트 렌더링
    renderHeader('header-container');
    renderFooter('footer-container');
    renderLoginModal('login-modal-container');

    // 2. 초기화 (푸터 위치 보정을 위한 스타일 등은 CSS에서 처리)

    // 2. 초기 렌더링 애니메이션 (선택)
    document.body.style.opacity = '1';

    // 3. 글로벌 인증 상태 체크 
    // HttpOnly 쿠키 기반이므로 auth.js 내부에서 API를 찔러보고 UI 상태(로그인/로그아웃 버튼 등) 갱신
    await checkAuthStatus();

    // non-module 스크립트에서도 권한 정보를 참조할 수 있도록 노출
    window.currentUserRole = authState.user?.role || null;
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

const reservationModalTemplates = {
    GENERAL: {
        title: '프리미엄 상담 신청',
        submitLabel: '상담 신청하기',
        guideHtml: `
            <div class="reservation-guide-block">
                <h3 class="reservation-guide-title">프리미엄 상담 신청 안내</h3>
                <ul class="reservation-guide-list">
                    <li>신청 즉시 담당 컨설턴트가 확인 후 연락드립니다.</li>
                    <li>문의 메시지에는 검토가 필요한 핵심 내용을 간단히 작성해주세요.</li>
                    <li>신청 일시는 접수 시점으로 자동 저장됩니다.</li>
                </ul>
            </div>
        `
    },
    REPORT: {
        title: '전문가 리포트 요청',
        submitLabel: '리포트 요청하기',
        guideHtml: `
            <div class="reservation-report-guide">
                <header class="hero">
                    <p class="subtitle">터잡이 전문가 서비스</p>
                    <h1>내 땅의 가치를 극대화하는<br>가장 확실한 방법</h1>
                    <p>건축사, 자산관리 전문가, 그리고 AI 데이터가 결합하여 오직 대표님 부지만을 위한 최적의 개발 시뮬레이션을 제공합니다.</p>
                </header>

                <section style="padding-bottom: 15px;">
                    <div class="alert-banner">
                        <div class="alert-banner-title">
                            <span>⚠️</span> <h4>서비스 지역 제한 안내</h4>
                        </div>
                        <p>현재 '터잡이 전문가 리포트'는 서비스 품질 유지를 위해 <strong>[서울 전 지역]</strong>을 대상으로만 우선 제공되고 있습니다. (서울 외 지역은 추후 확대 예정)</p>
                    </div>
                </section>

                <section>
                    <div class="sample-box">
                        <p>"어떤 내용이 담기는지 미리 확인해 보세요"</p>
                        <a href="https://incredible-snake-jew8qnq.gamma.site" target="_blank" class="btn-outline" rel="noopener noreferrer">
                            터잡이 전문가 리포트 샘플 보러가기 ↗
                        </a>
                    </div>
                </section>

                <section>
                    <h3 class="section-title">⭐ 이런 분들께 추천합니다</h3>
                    <ul class="recommend-list">
                        <li>노후화된 건물을 허물고 신축했을 때의 정확한 사업성이 궁금하신 분</li>
                        <li>용적률을 최대한 찾아내어 건물 가치를 극대화하고 싶으신 분</li>
                        <li>복잡한 법적 규제와 건축 허가 가능 여부를 전문가 시선에서 검토받고 싶으신 분</li>
                    </ul>
                </section>

                <section>
                    <h3 class="section-title">📄 리포트 핵심 내용</h3>

                    <div class="content-card">
                        <h4>1. 부지 분석 및 가설계 시뮬레이션</h4>
                        <p>지구단위계획 및 서울시 최신 정책을 반영하여 용적률, 건폐율을 고려한 최적의 층수 및 면적 도출</p>
                    </div>

                    <div class="content-card">
                        <h4>2. 매각 시 ROI 및 투자 기간 설정</h4>
                        <p>향후 자산 매각 시의 예상 투자 수익률(ROI)을 정밀 계산하고, 최적의 엑시트(Exit) 및 투자 기간 수립</p>
                    </div>

                    <div class="content-card">
                        <h4>3. MD 구성 및 수익성 분석</h4>
                        <p>주변 상권 및 트렌드 데이터를 기반으로 공실을 최소화하는 최적의 임대 구성안 및 예상 수익률 제시</p>
                    </div>
                </section>

                <section style="background-color: #f8fafc;">
                    <h3 class="section-title">💰 서비스 요금 안내</h3>

                    <div style="background: #ffffff; border: 2px solid #2563eb; border-radius: 12px; padding: 32px 24px; box-shadow: 0 4px 15px rgba(37,99,235,0.08); position: relative; overflow: hidden;">
                        <div style="position: absolute; top: 0; right: 0; background: #2563eb; color: #ffffff; padding: 6px 20px; font-size: 13px; font-weight: 700; border-radius: 0 0 0 12px; letter-spacing: 0.5px;">
                            PREMIUM REPORT
                        </div>

                        <h4 style="font-size: 22px; color: #0f172a; font-weight: 800; margin-bottom: 8px;">터잡이 전문가 리포트</h4>
                        <p style="font-size: 15px; color: #64748b; margin-bottom: 24px; line-height: 1.5;">건축사 가설계 · 서울시 정책 분석 · MD 및 ROI 시뮬레이션 통합 패키지</p>

                        <div style="border-top: 1px dashed #e2e8f0; border-bottom: 1px dashed #e2e8f0; padding: 20px 0; margin-bottom: 24px; display: flex; align-items: baseline; gap: 4px;">
                            <span style="font-size: 34px; font-weight: 800; color: #2563eb;">400,000원</span>
                            <span style="font-size: 15px; color: #475569; font-weight: 600; margin-left: 2px;">/ 건당 (VAT 포함)</span>
                        </div>

                        <ul style="list-style: none; padding: 0;">
                            <li style="font-size: 15px; color: #475569; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start;">
                                <span style="color: #2563eb; font-weight: bold; margin-top: -1px;">✔</span>
                                <span>지구단위계획 및 서울시 최신 정책 보정 <strong>맞춤형 부지 분석</strong></span>
                            </li>
                            <li style="font-size: 15px; color: #475569; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start;">
                                <span style="color: #2563eb; font-weight: bold; margin-top: -1px;">✔</span>
                                <span>전문 건축사의 시선이 담긴 <strong>가설계 시뮬레이션 및 MD 제안</strong></span>
                            </li>
                            <li style="font-size: 15px; color: #475569; display: flex; gap: 10px; align-items: flex-start;">
                                <span style="color: #2563eb; font-weight: bold; margin-top: -1px;">✔</span>
                                <span>매각 시 예상 ROI 계산 및 투자 기간 설정을 포함한 <strong>고해상도 PDF 리포트 발송</strong></span>
                            </li>
                        </ul>
                    </div>
                </section>

                <section>
                    <h3 class="section-title">🚚 진행 프로세스 및 배송 안내</h3>
                    <p style="font-size:16px; color:#475569; margin-bottom:24px; font-weight:500;">신청부터 수령까지 단 5일! 터잡이는 대표님의 시간을 아끼기 위해 신속하고 정확하게 움직입니다.</p>

                    <div class="process-container">
                        <div class="process-step">
                            <div class="step-number">Step 1</div>
                            <div class="step-text">
                                <h4>정보 입력 및 인증</h4>
                                <p>부지 주소와 간단한 검토 요청 사항을 입력합니다.</p>
                            </div>
                        </div>

                        <div class="process-step">
                            <div class="step-number">Step 2</div>
                            <div class="step-text">
                                <h4>결제 완료</h4>
                                <p>결제가 확인되면 터잡이 전담 팀이 즉시 분석에 착수합니다.</p>
                            </div>
                        </div>

                        <div class="process-step active">
                            <div class="step-number">Step 3</div>
                            <div class="step-text">
                                <h4>전문가 분석 (영업일 기준 5일)</h4>
                                <p>담당 전문가가 배정되어 데이터 분석 및 가설계 검토를 진행합니다.</p>
                            </div>
                        </div>

                        <div class="process-step">
                            <div class="step-number">Step 4</div>
                            <div class="step-text">
                                <h4>PDF 리포트 발송</h4>
                                <p>입력하신 이메일로 완성된 고해상도 전문가 리포트(PDF)를 발송해 드립니다.</p>
                            </div>
                        </div>
                    </div>

                    <div class="process-notice">
                        ℹ️ 리포트 접수 및 발송 상황은 <strong>마이 페이지</strong>에서 확인하세요.
                    </div>
                </section>

                <section>
                    <h3 class="section-title">🛡️ 결제 및 환불 정책</h3>
                    <div class="policy-box">
                        <div class="policy-item">
                            <h5>• 100% 전액 환불</h5>
                            <p>결제 후 전문가가 분석에 착수하기 전(신청 당일 이내 취소 시)에는 어떠한 조건 없이 100% 환불해 드립니다.</p>
                        </div>
                        <div class="policy-item">
                            <h5>• 환불 불가 안내</h5>
                            <p>본 리포트는 고객님의 부지 맞춤형으로 개별 제작되는 컨설팅 상품 특성상, 전문가 배정 및 리포트 작성 작업이 시작된 이후에는 환불이 불가능합니다.</p>
                        </div>
                        <div class="policy-item">
                            <h5>• 문의 및 접수</h5>
                            <p>리포트 내용에 대한 추가 문의나 수정 요청은 리포트 내 기재된 전담 담당자 직통 연락처를 통해 신속하게 지원받으실 수 있습니다.</p>
                        </div>
                    </div>
                </section>
            </div>
        `
    }
};

function ensureReservationModal() {
    let overlay = document.getElementById('reservation-modal-overlay');
    if (overlay) return overlay;

    const style = document.createElement('style');
    style.id = 'reservation-modal-style';
    style.textContent = `
        .reservation-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            padding: 16px;
        }
        .reservation-modal-overlay.active { display: flex; }
        .reservation-modal {
            width: 100%;
            max-width: 560px;
            max-height: 90vh;
            overflow: auto;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .reservation-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 20px;
            border-bottom: 1px solid #e5e7eb;
        }
        .reservation-modal-title {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
        }
        .reservation-modal-close {
            border: 0;
            background: transparent;
            font-size: 24px;
            color: #64748b;
            cursor: pointer;
            line-height: 1;
        }
        .reservation-modal-body {
            padding: 20px;
        }
        .reservation-guide-block {
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            border-radius: 10px;
            padding: 14px 16px;
            margin-bottom: 16px;
        }
        .reservation-guide-title {
            margin: 0 0 8px;
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
        }
        .reservation-guide-desc {
            margin: 0 0 8px;
            color: #334155;
            font-size: 14px;
            line-height: 1.5;
        }
        .reservation-guide-list {
            margin: 0;
            padding-left: 18px;
            color: #334155;
            font-size: 14px;
            line-height: 1.5;
        }
        .report-guide-tone {
            border-color: #bfdbfe;
            background: #eff6ff;
        }
        .reservation-report-guide {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            margin-bottom: 16px;
            overflow: hidden;
            background: #ffffff;
            color: #334155;
            line-height: 1.7;
        }
        .reservation-report-guide section {
            padding: 32px 20px;
            border-bottom: 1px solid #f1f5f9;
        }
        .reservation-report-guide .hero {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #ffffff;
            padding: 40px 20px;
            text-align: center;
        }
        .reservation-report-guide .hero .subtitle {
            font-size: 16px;
            color: #38bdf8;
            font-weight: 700;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .reservation-report-guide .hero h1 {
            font-size: 24px;
            font-weight: 800;
            line-height: 1.4;
            margin-bottom: 16px;
            word-break: keep-all;
        }
        .reservation-report-guide .hero p {
            font-size: 14px;
            color: #94a3b8;
            word-break: keep-all;
        }
        .reservation-report-guide .section-title {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .reservation-report-guide .alert-banner {
            background-color: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .reservation-report-guide .alert-banner-title {
            color: #1e40af;
            font-size: 17px;
            font-weight: 700;
            margin-bottom: 6px;
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .reservation-report-guide .alert-banner p { color: #1e3a8a; font-size: 15px; }
        .reservation-report-guide .sample-box {
            background: #f1f5f9;
            border-radius: 8px;
            padding: 24px;
            text-align: center;
        }
        .reservation-report-guide .sample-box p { font-size: 16px; color: #64748b; margin-bottom: 16px; font-weight: 500; }
        .reservation-report-guide .btn-outline {
            display: inline-block;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #0f172a;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 15px;
            font-weight: 700;
            text-decoration: none;
            transition: background 0.2s;
        }
        .reservation-report-guide .btn-outline:hover { background: #f8fafc; border-color: #94a3b8; }
        .reservation-report-guide .recommend-list { list-style: none; }
        .reservation-report-guide .recommend-list li {
            position: relative;
            padding-left: 32px;
            margin-bottom: 16px;
            font-size: 16px;
            color: #475569;
            word-break: keep-all;
        }
        .reservation-report-guide .recommend-list li::before {
            content: "✓";
            position: absolute;
            left: 0;
            top: 0;
            color: #2563eb;
            font-size: 20px;
            font-weight: 900;
        }
        .reservation-report-guide .content-card {
            background: #f8fafc;
            border-left: 5px solid #0f172a;
            padding: 20px;
            margin-bottom: 16px;
            border-radius: 0 8px 8px 0;
        }
        .reservation-report-guide .content-card h4 { font-size: 18px; color: #0f172a; margin-bottom: 8px; font-weight: 700; }
        .reservation-report-guide .content-card p { font-size: 15px; color: #475569; word-break: keep-all; }
        .reservation-report-guide .process-container { position: relative; margin-top: 15px; }
        .reservation-report-guide .process-step {
            display: flex;
            gap: 20px;
            margin-bottom: 24px;
            position: relative;
        }
        .reservation-report-guide .step-number {
            width: 60px;
            height: 28px;
            background: #e2e8f0;
            color: #475569;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .reservation-report-guide .process-step.active .step-number {
            background: #0f172a;
            color: #ffffff;
        }
        .reservation-report-guide .step-text h4 { font-size: 18px; color: #0f172a; margin-bottom: 6px; font-weight: 700; }
        .reservation-report-guide .step-text p { font-size: 15px; color: #64748b; word-break: keep-all; }
        .reservation-report-guide .process-notice {
            font-size: 14px;
            color: #64748b;
            background: #f1f5f9;
            padding: 14px;
            border-radius: 6px;
            text-align: center;
            margin-top: 15px;
        }
        .reservation-report-guide .policy-box {
            background: #fafafa;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
        }
        .reservation-report-guide .policy-item { margin-bottom: 16px; }
        .reservation-report-guide .policy-item:last-child { margin-bottom: 0; }
        .reservation-report-guide .policy-item h5 { font-size: 15px; color: #334155; margin-bottom: 6px; font-weight: 700; }
        .reservation-report-guide .policy-item p { font-size: 14px; color: #64748b; word-break: keep-all; }
        .reservation-input-label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 700;
            color: #1e293b;
        }
        .reservation-input-textarea {
            width: 100%;
            min-height: 120px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px;
            font-size: 14px;
            resize: vertical;
            outline: none;
        }
        .reservation-input-textarea:focus {
            border-color: #3b82f6;
        }
        .reservation-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 16px;
        }
        .reservation-btn {
            border: 1px solid #cbd5e1;
            background: #fff;
            color: #334155;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            padding: 10px 14px;
            cursor: pointer;
        }
        .reservation-btn-primary {
            border-color: #2563eb;
            background: #2563eb;
            color: #fff;
        }
    `;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'reservation-modal-overlay';
    overlay.className = 'reservation-modal-overlay';
    overlay.innerHTML = `
        <div class="reservation-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-modal-title">
            <div class="reservation-modal-header">
                <h2 class="reservation-modal-title" id="reservation-modal-title"></h2>
                <button type="button" class="reservation-modal-close" data-reservation-close aria-label="닫기">×</button>
            </div>
            <form class="reservation-modal-body" id="reservation-modal-form">
                <div id="reservation-guide-slot"></div>
                <label class="reservation-input-label" for="reservation-message">문의 메시지</label>
                <textarea id="reservation-message" class="reservation-input-textarea" maxlength="1000" placeholder="요청하실 내용을 입력해주세요." required></textarea>
                <div class="reservation-modal-footer">
                    <button type="button" class="reservation-btn" data-reservation-close>취소</button>
                    <button type="submit" class="reservation-btn reservation-btn-primary" id="reservation-submit-btn">신청</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
}

function closeReservationModal() {
    const overlay = document.getElementById('reservation-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

function openReservationModal(type = 'GENERAL') {
    const overlay = ensureReservationModal();
    const template = reservationModalTemplates[type] || reservationModalTemplates.GENERAL;

    const titleEl = overlay.querySelector('#reservation-modal-title');
    const guideSlotEl = overlay.querySelector('#reservation-guide-slot');
    const submitBtnEl = overlay.querySelector('#reservation-submit-btn');
    const messageEl = overlay.querySelector('#reservation-message');

    titleEl.textContent = template.title;
    guideSlotEl.innerHTML = template.guideHtml;
    submitBtnEl.textContent = template.submitLabel;
    messageEl.value = '';

    overlay.classList.add('active');
    setTimeout(() => messageEl.focus(), 0);

    return new Promise((resolve) => {
        const form = overlay.querySelector('#reservation-modal-form');

        const onSubmit = (event) => {
            event.preventDefault();
            const value = (messageEl.value || '').trim();
            if (!value) {
                alert('문의 메시지를 입력해주세요.');
                messageEl.focus();
                return;
            }
            cleanup();
            closeReservationModal();
            resolve(value);
        };

        const onCancel = () => {
            cleanup();
            closeReservationModal();
            resolve(null);
        };

        const onOverlayClick = (event) => {
            if (event.target === overlay || event.target.closest('[data-reservation-close]')) {
                onCancel();
            }
        };

        function onEsc(event) {
            if (event.key === 'Escape') {
                onCancel();
            }
        }

        function cleanup() {
            form.removeEventListener('submit', onSubmit);
            overlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onEsc);
        }

        form.addEventListener('submit', onSubmit);
        overlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onEsc);
    });
}

/**
 * 프리미엄 상담 신청 공통 로직
 * @param {Object} params - { propertyId, pnu, address, type }
 */
window.requestPremiumConsultation = async (params) => {
    const { authState } = await import('./auth.js');
    if (!authState.isAuthenticated) {
        alert("로그인 후 이용 가능합니다.");
        window.openLoginModal();
        return;
    }

    const type = params.type || 'GENERAL';
    const typeLabel = type === 'REPORT' ? '전문가 리포트' : '프리미엄 상담';
    const reqMsg = await openReservationModal(type);
    if (reqMsg === null) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/reservations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                type: type,
                propertyId: params.propertyId || null,
                pnu: params.pnu || null,
                address: params.address || null,
                date: new Date().toISOString(),
                message: reqMsg
            })
        });

        if (response.ok) {
            alert(`${typeLabel} 신청이 성공적으로 완료되었습니다.\n담당 컨설턴트가 곧 연락드리겠습니다.`);
        } else {
            const errData = await response.json();
            alert(`신청에 실패했습니다: ${errData.message || '알 수 없는 오류'}`);
        }
    } catch (err) {
        console.error("Consultation Request Error:", err);
        alert("서버 오류로 인해 신청할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }
};

window.formatPriceToKorean = (price) => {
    if (!price) return '가격 정보 없음';
    const num = Number(price);
    if (isNaN(num)) return price;
    if (num === 0) return '0원';
    
    if (num >= 100000000) { // 1억 이상
        const uk = Math.floor(num / 100000000);
        const man = Math.floor((num % 100000000) / 10000);
        return `${uk.toLocaleString()}억${man > 0 ? ' ' + man.toLocaleString() + '만' : ''}원`;
    } else if (num >= 10000) { // 1만 이상 1억 미만
        const man = Math.floor(num / 10000);
        const won = num % 10000;
        return `${man.toLocaleString()}만${won > 0 ? ' ' + won.toLocaleString() : ''}원`;
    } else { // 1만 미만
        return `${num.toLocaleString()}원`;
    }
};

