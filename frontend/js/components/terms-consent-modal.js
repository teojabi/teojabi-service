const TERMS_MODAL_ID = 'global-terms-consent-modal';

let pendingProvider = null;

function getModalElements() {
    return {
        modal: document.getElementById(TERMS_MODAL_ID),
        agreeAll: document.getElementById('termsConsentAgreeAll'),
        agreeCollect: document.getElementById('termsConsentAgreeCollect'),
        proceedBtn: document.getElementById('termsConsentProceedBtn'),
        errorMessage: document.getElementById('termsConsentError'),
    };
}

function isRequiredChecked(agreeAll, agreeCollect) {
    return Boolean(agreeAll?.checked) && Boolean(agreeCollect?.checked);
}

function syncButtonState() {
    const { agreeAll, agreeCollect, proceedBtn, errorMessage } = getModalElements();
    if (!proceedBtn || !errorMessage) {
        return;
    }

    const canProceed = isRequiredChecked(agreeAll, agreeCollect);
    proceedBtn.disabled = !canProceed;

    if (canProceed) {
        errorMessage.style.display = 'none';
    }
}

function setErrorMessage(message) {
    const { errorMessage } = getModalElements();
    if (!errorMessage) {
        return;
    }

    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function resetFormState() {
    const { agreeAll, agreeCollect, errorMessage, proceedBtn } = getModalElements();
    if (agreeAll) agreeAll.checked = false;
    if (agreeCollect) agreeCollect.checked = false;
    if (errorMessage) {
        errorMessage.textContent = '필수 약관에 모두 동의해 주세요.';
        errorMessage.style.display = 'none';
    }
    if (proceedBtn) {
        proceedBtn.disabled = true;
    }
}

function openTermsConsentModal() {
    const { modal } = getModalElements();
    if (modal) {
        modal.classList.add('active');
    }
}

function closeTermsConsentModal() {
    const { modal } = getModalElements();
    if (modal) {
        modal.classList.remove('active');
    }
}

async function completeSignup() {
    const { agreeAll, agreeCollect, proceedBtn } = getModalElements();

    if (!isRequiredChecked(agreeAll, agreeCollect)) {
        setErrorMessage('필수 약관에 모두 동의해 주세요.');
        return;
    }

    if (!proceedBtn) {
        return;
    }

    proceedBtn.disabled = true;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/auth/social/complete-signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                provider: pendingProvider,
                agreeTerms: Boolean(agreeAll?.checked),
                agreeCollect: Boolean(agreeCollect?.checked),
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || '회원가입 완료 처리에 실패했습니다.');
        }

        const result = await response.json();
        window.location.href = result.redirectUrl || '/mypage.html?is_new=true';
    } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '회원가입 처리 중 오류가 발생했습니다.');
        syncButtonState();
    }
}

async function fetchPendingSignupStatus() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/auth/social/pending-signup-status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });

        if (!response.ok) {
            return { requiresConsent: false };
        }

        return await response.json();
    } catch (error) {
        console.error('Pending signup status check failed:', error);
        return { requiresConsent: false };
    }
}

async function syncPendingSignupModalState() {
    const status = await fetchPendingSignupStatus();

    if (!status?.requiresConsent) {
        pendingProvider = null;
        closeTermsConsentModal();
        return;
    }

    pendingProvider = status.provider || null;
    resetFormState();
    openTermsConsentModal();
}

export function renderTermsConsentModal() {
    let container = document.getElementById('terms-consent-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'terms-consent-modal-container';
        document.body.appendChild(container);
    }

    container.innerHTML = `
        <div class="modal-overlay terms-consent-modal" id="${TERMS_MODAL_ID}">
            <div class="modal-content terms-consent-modal-content" role="dialog" aria-modal="true" aria-labelledby="terms-consent-title">
                <div class="modal-header">
                    <h3 class="modal-title" id="terms-consent-title">약관 동의 (필수)</h3>
                    <button class="btn-close" type="button" onclick="window.closeTermsConsentModal()">&times;</button>
                </div>

                <p class="terms-consent-desc">서비스 이용을 위해 아래 약관에 동의해 주세요.</p>

                <div class="terms-consent-option">
                    <label class="terms-consent-option-label" for="termsConsentAgreeAll">
                        <input type="checkbox" id="termsConsentAgreeAll">
                        <span>이용약관 및 개인정보처리방침에 모두 동의합니다. (필수)</span>
                    </label>
                    <div class="terms-consent-links">
                        <a href="/terms.html" target="_blank" rel="noopener noreferrer">이용약관 보기</a>
                        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">개인정보처리방침 보기</a>
                    </div>
                </div>

                <div class="terms-consent-option">
                    <label class="terms-consent-option-label" for="termsConsentAgreeCollect">
                        <input type="checkbox" id="termsConsentAgreeCollect">
                        <span>개인정보 수집 및 이용에 동의합니다. (필수)</span>
                    </label>
                    <div class="terms-consent-links">
                        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">상세 보기</a>
                    </div>
                </div>

                <button id="termsConsentProceedBtn" class="btn btn-primary terms-consent-action" disabled>
                    전체 동의하고 회원가입 진행하기
                </button>
                <p id="termsConsentError" class="terms-consent-error">필수 약관에 모두 동의해 주세요.</p>
            </div>
        </div>
    `;

    const { agreeAll, agreeCollect, proceedBtn } = getModalElements();
    agreeAll?.addEventListener('change', syncButtonState);
    agreeCollect?.addEventListener('change', syncButtonState);
    proceedBtn?.addEventListener('click', completeSignup);
    syncButtonState();
}

export async function initTermsConsentModal() {
    renderTermsConsentModal();
    await syncPendingSignupModalState();
}

window.closeTermsConsentModal = closeTermsConsentModal;
