const agreeAll = document.getElementById('agreeAll');
const agreeCollect = document.getElementById('agreeCollect');
const proceedBtn = document.getElementById('consentProceedBtn');
const errorMessage = document.getElementById('consentError');

function isRequiredChecked() {
    return agreeAll.checked && agreeCollect.checked;
}

function syncButtonState() {
    const canProceed = isRequiredChecked();
    proceedBtn.disabled = !canProceed;
    if (canProceed) {
        errorMessage.style.display = 'none';
    }
}

agreeAll?.addEventListener('change', () => {
    if (!agreeAll.checked) {
        agreeCollect.checked = false;
    } else {
        agreeCollect.checked = true;
    }
    syncButtonState();
});

agreeCollect?.addEventListener('change', () => {
    agreeAll.checked = agreeCollect.checked;
    syncButtonState();
});

proceedBtn?.addEventListener('click', () => {
    if (!isRequiredChecked()) {
        errorMessage.style.display = 'block';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const provider = params.get('provider');

    if (provider && ['kakao', 'naver', 'google'].includes(provider)) {
        window.location.href = `/mypage.html?newUser=1`;
        return;
    }

    window.location.href = '/mypage.html';
});

syncButtonState();