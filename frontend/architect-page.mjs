import { member, openLogin, openMember } from './member.mjs';
import {
  ARCHITECT_STATUS_LABEL,
  fetchArchitectApplications,
  fetchMyArchitect,
  saveMyArchitect,
  updateArchitectStatus,
  uploadArchitectLogo,
  uploadArchitectGallery,
  removeArchitectGalleryImage,
  verifyArchitectBusiness,
} from './architect.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const panel = document.getElementById('architect-panel');
const adminHost = document.getElementById('architect-admin');
const fieldValue = (form, name) => String(new FormData(form).get(name) ?? '').trim();
const fmtDate = (value) => (/^\d{8}$/.test(String(value || '')) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value || '');

const state = { mine: null, loaded: false, logoUrl: '', galleryUrls: [], message: '', error: false, saving: false, applications: null, appsLoading: false, businessCheck: '', businessError: false };

function setMessage(text, error = false) {
  state.message = text;
  state.error = error;
  const el = document.querySelector('.architect-message');
  if (el) { el.textContent = text; el.classList.toggle('error', error); }
}

function setVerifyResult(text, error = false) {
  state.businessCheck = text;
  state.businessError = error;
  const el = document.querySelector('.architect-verify-result');
  if (el) { el.textContent = text; el.classList.toggle('error', error); }
}

function businessResultText(v) {
  if (v.status === 'verified') return `국세청 인증됨 · ${v.businessStatusText || '계속사업자'}${v.taxType ? ` (${v.taxType})` : ''}`;
  if (v.status === 'inactive') return `${v.businessStatusText || '휴업·폐업'} 상태로 확인돼요.`;
  if (v.status === 'not-found') return '국세청 정보와 일치하지 않아요. 번호·개업일·대표자명·상호를 확인해 주세요.';
  if (v.status === 'invalid-input') return v.businessStatusText || '입력 형식을 확인해 주세요.';
  return v.businessStatusText || '국세청에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

function loginPanel() {
  return `<h2>건축사 회원으로 시작하기</h2><p class="case-note">터잡이 회원으로 로그인하면 사무소 정보를 등록하고 입점을 신청할 수 있어요.</p><button class="primary" type="button" data-architect="login">로그인·회원가입</button>`;
}

function formMarkup() {
  const mine = state.mine || {};
  const logo = state.logoUrl || mine.logoUrl || './assets/symbol.webp';
  const gallery = Array.isArray(state.galleryUrls) && state.galleryUrls.length ? state.galleryUrls : (Array.isArray(mine.galleryUrls) ? mine.galleryUrls : []);
  const status = mine.status ? `<span class="architect-status-badge">${esc(ARCHITECT_STATUS_LABEL[mine.status] || mine.status)}</span>` : '';
  const businessNote = mine.businessNumber
    ? `<p class="case-note architect-business-note">저장된 사업자 확인: ${mine.businessVerified ? '<b>국세청 인증됨</b>' : esc(mine.businessStatusText || '확인 필요')}</p>`
    : '';
  return `<h2>건축사 사무소 정보</h2>
    <p class="case-note">${mine.status ? `현재 상태 ${status} · 수정한 뒤 다시 검토를 요청할 수 있어요.` : '등록하면 터잡이 관리자 검토 후 신축 검토 화면에 공개돼요.'}</p>${businessNote}
    <form class="architect-form" id="architect-form" novalidate>
      <div class="architect-logo-row">
        <img src="${esc(logo)}" alt="사무소 로고 미리보기" id="architect-logo-preview">
        <label>로고 이미지 <small>상단 오른쪽에 표시 · PNG·JPG·WEBP</small><input type="file" accept="image/png,image/jpeg,image/webp" id="architect-logo-input"></label>
      </div>
      <div class="architect-gallery-field architect-wide">
        <span class="architect-gallery-label">대표 이미지 <small>4:3 비율 · 최대 8장 · 3초마다 자동 전환</small></span>
        <div class="architect-gallery-grid" id="architect-gallery-grid">${gallery.map((url) => `<div class="architect-gallery-thumb"><img src="${esc(url)}" alt="대표 이미지 미리보기"><button type="button" class="architect-gallery-remove" data-gallery-remove="${esc(url)}" aria-label="이미지 삭제">×</button></div>`).join('')}<label class="architect-gallery-add">＋ 이미지 추가<input type="file" accept="image/png,image/jpeg,image/webp" id="architect-gallery-input" multiple></label></div>
      </div>
      <label>사무소명 <input name="officeName" maxlength="120" required value="${esc(mine.officeName || '')}" placeholder="예: 터잡이건축사사무소"></label>
      <label>대표 건축사명 <input name="representativeName" maxlength="80" required value="${esc(mine.representativeName || '')}" placeholder="예: 홍길동"></label>
      <label>사업자등록번호 <small>필수</small><input name="businessNumber" maxlength="12" inputmode="numeric" required value="${esc(mine.businessNumber || '')}" placeholder="예: 846-13-02909"></label>
      <label>개업연월일 <small>사업자등록증 기준</small><input name="businessStartDate" maxlength="10" inputmode="numeric" required value="${esc(fmtDate(mine.businessStartDate))}" placeholder="예: 2015-03-01"></label>
      <label class="architect-wide">사업자 상호 <small>국세청 등록 상호와 같아야 확인돼요</small><input name="businessName" maxlength="120" required value="${esc(mine.businessName || '')}" placeholder="예: 터잡이건축사사무소"></label>
      <div class="architect-wide architect-verify-row"><button class="outline" type="button" data-verify-business>국세청 확인</button><span class="architect-verify-result${state.businessError ? ' error' : ''}" role="status">${esc(state.businessCheck)}</span></div>
      <label>전화 <input name="phone" maxlength="40" inputmode="tel" value="${esc(mine.phone || '')}" placeholder="예: 02-1234-5678"></label>
      <label>이메일 <input name="email" maxlength="254" inputmode="email" value="${esc(mine.email || '')}" placeholder="예: help@example.com"></label>
      <label>회사 사이트 <input name="websiteUrl" maxlength="500" value="${esc(mine.websiteUrl || '')}" placeholder="예: https://office.example.com"></label>
      <label>카카오톡 채널 <input name="kakaoUrl" maxlength="500" value="${esc(mine.kakaoUrl || '')}" placeholder="예: https://pf.kakao.com/..."></label>
      <label class="architect-wide">사무소 주소 <input name="address" maxlength="300" value="${esc(mine.address || '')}" placeholder="예: 서울특별시 서초구 언남5길 1"></label>
      <label>활동 지역 <input name="regions" maxlength="300" value="${esc(mine.regions || '')}" placeholder="예: 서울 강남·서초"></label>
      <label>전문 분야 <input name="specialties" maxlength="300" value="${esc(mine.specialties || '')}" placeholder="예: 근린생활시설·다가구"></label>
      <label class="architect-wide">사무소 소개 <textarea name="bio" maxlength="2000" placeholder="어떤 건축 상담을 잘하는지 적어주세요.">${esc(mine.bio || '')}</textarea></label>
      <div class="architect-actions"><button class="primary" type="submit" ${state.saving ? 'disabled' : ''}>${state.saving ? '저장 중…' : mine.status ? '수정 저장' : '입점 신청'}</button></div>
      <p class="architect-message${state.error ? ' error' : ''}">${esc(state.message)}</p>
    </form>`;
}

function adminItem(a) {
  const logo = a.logoUrl ? `<img src="${esc(a.logoUrl)}" alt="">` : `<span class="site-architect-logo" aria-hidden="true">${esc((a.officeName || '건').slice(0, 1))}</span>`;
  const status = ARCHITECT_STATUS_LABEL[a.status] || a.status;
  const verified = a.businessVerified ? ' · 사업자 인증' : a.businessNumber ? ` · 사업자 확인 필요(${esc(a.businessStatusText || '')})` : ' · 사업자 미입력';
  return `<article class="architect-admin-item">${logo}<div><b>${esc(a.officeName)}</b><small>${esc(a.representativeName || '')} · ${esc(status)}${verified}${a.featured ? ' · 추천' : ''}</small></div><div class="architect-admin-actions"><button class="primary" type="button" data-app="${esc(a.id)}" data-status="APPROVED">승인</button><button class="outline" type="button" data-app="${esc(a.id)}" data-status="HIDDEN">비공개</button><button class="outline" type="button" data-app="${esc(a.id)}" data-featured="${a.featured ? '0' : '1'}">${a.featured ? '추천 해제' : '추천'}</button></div></article>`;
}

function adminMarkup() {
  if (member.user?.role !== 'ADMIN') return '';
  if (state.appsLoading) return '<section class="architect-panel"><h2>입점 신청 관리</h2><p class="case-note">신청 목록을 불러오고 있어요.</p></section>';
  const rows = state.applications || [];
  return `<section class="architect-panel"><h2>입점 신청 관리</h2><p class="case-note">승인하면 신축 검토 화면에 공개돼요. 총 ${rows.length}건.</p>${rows.length ? `<div class="architect-admin-list">${rows.map(adminItem).join('')}</div>` : '<p class="case-note">아직 신청이 없어요.</p>'}</section>`;
}

function render() {
  if (!state.loaded && member.status === 'loading') {
    panel.innerHTML = '<p class="case-note">회원 연결을 확인하고 있어요.</p>';
    adminHost.innerHTML = '';
    return;
  }
  if (member.status !== 'ready') {
    panel.innerHTML = loginPanel();
    adminHost.innerHTML = '';
    return;
  }
  panel.innerHTML = formMarkup();
  adminHost.innerHTML = adminMarkup();
  bind();
}

function bind() {
  document.getElementById('architect-form')?.addEventListener('submit', onSubmit);
  document.getElementById('architect-logo-input')?.addEventListener('change', onLogoChange);
  document.getElementById('architect-gallery-input')?.addEventListener('change', onGalleryChange);
}

function businessFields(form) {
  return {
    businessNumber: fieldValue(form, 'businessNumber'),
    businessStartDate: fieldValue(form, 'businessStartDate'),
    representativeName: fieldValue(form, 'representativeName'),
    businessName: fieldValue(form, 'businessName'),
  };
}

async function onVerifyBusiness(button) {
  const form = document.getElementById('architect-form');
  if (!form) return;
  const payload = businessFields(form);
  if (!payload.businessNumber || !payload.businessStartDate || !payload.representativeName || !payload.businessName) {
    setVerifyResult('사업자등록번호·개업연월일·대표 건축사명·사업자 상호를 먼저 입력해 주세요.', true);
    return;
  }
  button.disabled = true;
  setVerifyResult('국세청에 확인하고 있어요…');
  try {
    const v = await verifyArchitectBusiness(payload);
    setVerifyResult(businessResultText(v), v.status !== 'verified');
  } catch (error) {
    setVerifyResult(error.message, true);
  }
  button.disabled = false;
}

async function onGalleryChange(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  setMessage('대표 이미지를 올리는 중이에요…');
  try {
    const result = await uploadArchitectGallery(files);
    state.galleryUrls = result.galleryUrls || [];
    if (state.mine) state.mine.galleryUrls = state.galleryUrls;
    setMessage('대표 이미지를 저장했어요.');
  } catch (error) {
    setMessage(error.message, true);
  }
  render();
}

async function onGalleryRemove(url) {
  try {
    const result = await removeArchitectGalleryImage(url);
    state.galleryUrls = result.galleryUrls || [];
    if (state.mine) state.mine.galleryUrls = state.galleryUrls;
    setMessage('대표 이미지를 삭제했어요.');
  } catch (error) {
    setMessage(error.message, true);
  }
  render();
}

async function onLogoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setMessage('로고를 올리는 중이에요…');
  try {
    const result = await uploadArchitectLogo(file);
    state.logoUrl = result.logoUrl;
    const preview = document.getElementById('architect-logo-preview');
    if (preview) preview.src = result.logoUrl;
    setMessage('로고를 저장했어요. 아래 저장 버튼을 눌러 반영해 주세요.');
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    officeName: fieldValue(form, 'officeName'),
    representativeName: fieldValue(form, 'representativeName'),
    businessNumber: fieldValue(form, 'businessNumber'),
    businessStartDate: fieldValue(form, 'businessStartDate'),
    businessName: fieldValue(form, 'businessName'),
    phone: fieldValue(form, 'phone'),
    email: fieldValue(form, 'email'),
    websiteUrl: fieldValue(form, 'websiteUrl'),
    kakaoUrl: fieldValue(form, 'kakaoUrl'),
    address: fieldValue(form, 'address'),
    regions: fieldValue(form, 'regions'),
    specialties: fieldValue(form, 'specialties'),
    bio: fieldValue(form, 'bio'),
    logoUrl: state.logoUrl || state.mine?.logoUrl || '',
    galleryUrls: (Array.isArray(state.galleryUrls) && state.galleryUrls.length ? state.galleryUrls : (state.mine?.galleryUrls || [])),
  };
  if (!payload.officeName || !payload.representativeName) { setMessage('사무소명과 대표 건축사명을 입력해 주세요.', true); return; }
  if (!payload.businessNumber || !payload.businessStartDate || !payload.businessName) { setMessage('사업자등록번호·개업연월일·사업자 상호를 입력해 주세요.', true); return; }
  state.saving = true; state.message = '저장하고 있어요…'; state.error = false;
  render();
  try {
    state.mine = await saveMyArchitect(payload);
    state.logoUrl = state.mine.logoUrl || state.logoUrl;
    const v = state.mine.verification || {};
    state.businessCheck = businessResultText(v);
    state.businessError = v.status !== 'verified';
    if (v.status === 'verified') state.message = '저장했어요. 사업자등록이 국세청에서 확인됐어요. 관리자 검토 후 공개돼요.';
    else if (v.status === 'inactive') state.message = '저장했어요. 다만 휴업·폐업 사업자로 확인돼요. 사무소 정보를 확인해 주세요.';
    else if (v.status === 'not-found') state.message = '저장했어요. 사업자등록 정보가 국세청 조회와 일치하지 않아요. 번호·개업일·대표자명·상호를 확인해 주세요.';
    else state.message = '저장했어요. 사업자등록 자동 확인에 연결하지 못해 관리자가 직접 확인해요.';
  } catch (error) {
    state.message = error.message;
    state.error = true;
  }
  state.saving = false;
  render();
}

async function loadProfile() {
  state.loaded = false;
  render();
  try { state.mine = await fetchMyArchitect(); } catch { state.mine = null; }
  state.loaded = true;
  render();
  if (member.user?.role === 'ADMIN') loadApplications();
}

async function loadApplications() {
  state.appsLoading = true;
  render();
  try { state.applications = await fetchArchitectApplications(); } catch { state.applications = []; }
  state.appsLoading = false;
  render();
}

document.addEventListener('click', async (event) => {
  const remove = event.target.closest('[data-gallery-remove]');
  if (remove) { await onGalleryRemove(remove.dataset.galleryRemove); return; }
  const verify = event.target.closest('[data-verify-business]');
  if (verify) { await onVerifyBusiness(verify); return; }
  const login = event.target.closest('[data-architect="login"]');
  if (login) { member.status === 'ready' ? openMember() : openLogin(); return; }
  const adminButton = event.target.closest('[data-app]');
  if (!adminButton) return;
  adminButton.disabled = true;
  const patch = adminButton.dataset.status ? { status: adminButton.dataset.status } : { featured: adminButton.dataset.featured === '1' };
  try {
    await updateArchitectStatus(adminButton.dataset.app, patch);
  } catch (error) {
    state.message = error.message;
    state.error = true;
    render();
  }
  await loadApplications();
});

member.addEventListener('change', () => {
  if (member.status === 'ready') { loadProfile(); return; }
  render();
});

render();
if (member.status === 'idle') member.refresh();
