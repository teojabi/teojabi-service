const planButtons = Array.from(document.querySelectorAll('.plan-action'));
const PLAN_LABELS = {
  BASIC_MONTHLY: 'Light',
  PLUS_MONTHLY: 'Pro',
  MASTER_YEARLY: 'Master 연결제',
};

const logPayment = (message, isError = false) => {
  const logPrefix = '[paid-service][subscription]';
  if (isError) {
    console.error(`${logPrefix} ${message}`);
    return;
  }

  console.info(`${logPrefix} ${message}`);
};

const setButtonsDisabled = (disabled) => {
  planButtons.forEach((button) => {
    button.disabled = disabled;
  });
};

const shouldHideSubscriptionButtons = () => {
  const role = window.currentUserRole;
  return !role || role === 'ADMIN';
};

const applySubscriptionButtonVisibility = () => {
  if (!shouldHideSubscriptionButtons()) {
    return;
  }

  planButtons.forEach((button) => {
    button.style.display = 'none';
  });
};

const requestJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '요청 처리에 실패했습니다.');
  }
  return data;
};

const issueBillingKey = async (planCode) => {
  if (!window.PortOne) {
    throw new Error('포트원 SDK가 로드되지 않았습니다.');
  }

  const prepareData = await requestJson(`${CONFIG.API_BASE_URL}/api/v1/subscriptions/prepare-billing`, {
    planCode,
  });

  const issueResult = await window.PortOne.requestIssueBillingKey({
    storeId: prepareData.storeId,
    channelKey: prepareData.channelKey,
    billingKeyMethod: 'CARD',
    issueId: `issue_${planCode}_${Date.now()}`,
    issueName: `${prepareData.plan?.name || planCode} 빌링키 발급`,
    customer: {
      id: prepareData.customerId,
      customerId: prepareData.customerId,
      name: prepareData.customerName,
      fullName: prepareData.customerName,
      email: prepareData.customerEmail || undefined,
      phoneNumber: prepareData.customerPhone || undefined,
    },
  });

  if (issueResult.code !== undefined) {
    throw new Error(issueResult.message || '빌링키 발급에 실패했습니다.');
  }

  return requestJson(`${CONFIG.API_BASE_URL}/api/v1/subscriptions/confirm-billing`, {
    planCode,
    billingKey: issueResult.billingKey,
    customerId: prepareData.customerId,
  });
};

applySubscriptionButtonVisibility();

planButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const planCode = button.dataset.planCode;
    if (!planCode) {
      return;
    }

    const planLabel = PLAN_LABELS[planCode] || '선택한 요금제';

    try {
      setButtonsDisabled(true);
      logPayment(`${planLabel} 결제를 진행 중입니다. 잠시만 기다려주세요.`);

      const result = await issueBillingKey(planCode);
      if (result.success) {
        logPayment('구독이 정상적으로 시작되었습니다.');
        return;
      }

      logPayment(result.message || '결제에 실패했습니다.', true);
    } catch (error) {
      logPayment(error.message || '구독 처리 중 오류가 발생했습니다.', true);
    } finally {
      setButtonsDisabled(false);
    }
  });
});
