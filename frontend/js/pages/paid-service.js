import { checkAuthStatus, authState } from '../auth.js';

const planButtons = Array.from(document.querySelectorAll('.plan-action'));
const planCards = Array.from(document.querySelectorAll('.plan-card'));
const PLAN_LABELS = {
  BASIC_MONTHLY: 'Light',
  PLUS_MONTHLY: 'Pro',
  MASTER_YEARLY: 'Master',
};
const PLAN_TIER_WEIGHT = {
  GENERAL: 1,
  LIGHT: 2,
  PRO: 3,
  MASTER: 4,
};
const BLOCKED_SUBSCRIPTION_MESSAGE = '현재 구독보다 상위 등급만 신청할 수 있습니다.';

let currentSubscriptionTier = 'GENERAL';

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
    button.disabled = disabled || button.dataset.upgradeAllowed === 'false';
  });
};

const shouldHideSubscriptionButtons = () => {
  const role = window.currentUserRole;
  return !role || role === 'ADMIN';
};

const applySubscriptionButtonVisibility = () => {
  const shouldHide = shouldHideSubscriptionButtons();

  planButtons.forEach((button) => {
    button.style.display = shouldHide ? 'none' : '';
  });
};

const syncRoleAndApplyVisibility = async () => {
  if (window.currentUserRole === undefined) {
    await checkAuthStatus();
    window.currentUserRole = authState.user?.role || null;
  }

  applySubscriptionButtonVisibility();
};

const resolvePlanTier = (code = '') => {
  const normalizedCode = String(code).toUpperCase();
  if (normalizedCode.includes('MASTER')) {
    return 'MASTER';
  }
  if (normalizedCode.includes('PRO') || normalizedCode.includes('PLUS')) {
    return 'PRO';
  }
  if (normalizedCode.includes('LIGHT') || normalizedCode.includes('BASIC')) {
    return 'LIGHT';
  }
  return 'GENERAL';
};

const isHigherTierPlan = (planCode) => {
  const planTier = resolvePlanTier(planCode);
  return PLAN_TIER_WEIGHT[planTier] > PLAN_TIER_WEIGHT[currentSubscriptionTier];
};

const applyCurrentPlanHighlight = () => {
  planCards.forEach((card) => {
    const tier = (card.dataset.planTier || 'GENERAL').toUpperCase();
    const tag = card.querySelector('.plan-tag.current');
    card.classList.toggle('current-subscription', tier === currentSubscriptionTier);

    if (tier === currentSubscriptionTier && !tag) {
      const currentTag = document.createElement('span');
      currentTag.className = 'plan-tag current';
      currentTag.textContent = '현재 구독';
      card.appendChild(currentTag);
      return;
    }

    if (tier !== currentSubscriptionTier && tag) {
      tag.remove();
    }
  });
};

const applyUpgradeButtonState = () => {
  planButtons.forEach((button) => {
    const allowed = isHigherTierPlan(button.dataset.planCode);
    button.dataset.upgradeAllowed = String(allowed);
    button.disabled = !allowed;
    button.title = allowed ? '' : BLOCKED_SUBSCRIPTION_MESSAGE;
  });
};

const fetchCurrentSubscriptionTier = async () => {
  const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/subscriptions/my-paid-summary`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('구독 상태를 불러오지 못했습니다.');
  }

  const data = await response.json();
  const currentPlanCode = data?.subscription?.plan?.code || 'GENERAL';
  currentSubscriptionTier = resolvePlanTier(currentPlanCode);
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

const initializeSubscriptionState = async () => {
  applyCurrentPlanHighlight();
  applyUpgradeButtonState();

  try {
    await syncRoleAndApplyVisibility();
  } catch (error) {
    logPayment(error.message || '인증 상태 확인 중 오류가 발생했습니다.', true);
    applySubscriptionButtonVisibility();
  }

  if (shouldHideSubscriptionButtons()) {
    return;
  }

  await fetchCurrentSubscriptionTier().catch(() => {
    currentSubscriptionTier = 'GENERAL';
  });

  applyCurrentPlanHighlight();
  applyUpgradeButtonState();
};

initializeSubscriptionState();

planButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const planCode = button.dataset.planCode;
    if (!planCode) {
      return;
    }

    const planLabel = PLAN_LABELS[planCode] || '선택한 요금제';

    if (!isHigherTierPlan(planCode)) {
      logPayment(BLOCKED_SUBSCRIPTION_MESSAGE, true);
      return;
    }

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
