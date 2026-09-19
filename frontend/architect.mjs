import { apiFetch } from './api-client.mjs';
import { member } from './member.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ARCHITECT_STATUS_LABEL = { PENDING: '검토 대기', APPROVED: '공개 중', HIDDEN: '비공개' };

let basePromise;
export function accountBase() {
  if (member.base) return Promise.resolve(member.base);
  basePromise ??= apiFetch('/api/runtime')
    .then((response) => response.json())
    .then((data) => data.accountApiBase || '')
    .catch(() => '');
  return basePromise;
}

export async function architectRequest(path, options = {}) {
  const base = await accountBase();
  if (!base) throw new Error('회원 서버가 연결되지 않았어요.');
  const response = await apiFetch(base + '/api/v1' + path, {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : options.headers,
    signal: options.signal || AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    let message = '건축사 정보를 처리하지 못했어요.';
    try {
      const data = await response.json();
      if (data?.message) message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch { /* 응답 본문이 없으면 기본 문구를 쓴다. */ }
    const error = new Error(message); error.status = response.status; throw error;
  }
  return response.status === 204 ? null : response.json();
}

export const fetchArchitects = () => architectRequest('/architects').catch(() => []);
export const fetchMyArchitect = () => architectRequest('/architects/me');
export const saveMyArchitect = (payload) => architectRequest('/architects/me', { method: 'PUT', body: JSON.stringify(payload) });
export const verifyArchitectBusiness = (payload) => architectRequest('/architects/verify-business', { method: 'POST', body: JSON.stringify(payload) });
export const fetchArchitectApplications = () => architectRequest('/architects/admin/list');
export const updateArchitectStatus = (id, patch) => architectRequest(`/architects/admin/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });

export async function uploadArchitectLogo(file) {
  const base = await accountBase();
  if (!base) throw new Error('회원 서버가 연결되지 않았어요.');
  const body = new FormData();
  body.append('logo', file);
  const response = await apiFetch(base + '/api/v1/architects/me/logo', { method: 'POST', credentials: 'include', body, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    let message = '로고 업로드에 실패했어요.';
    try {
      const data = await response.json();
      if (data?.message) message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return response.json();
}

export async function uploadArchitectGallery(files) {
  const base = await accountBase();
  if (!base) throw new Error('회원 서버가 연결되지 않았어요.');
  const body = new FormData();
  for (const file of files) body.append('images', file);
  const response = await apiFetch(base + '/api/v1/architects/me/gallery', { method: 'POST', credentials: 'include', body, signal: AbortSignal.timeout(60000) });
  if (!response.ok) {
    let message = '대표 이미지 업로드에 실패했어요.';
    try {
      const data = await response.json();
      if (data?.message) message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return response.json();
}

export function removeArchitectGalleryImage(url) {
  return architectRequest('/architects/me/gallery?url=' + encodeURIComponent(url), { method: 'DELETE' });
}

const telHref = (phone) => `tel:${String(phone || '').replace(/[^0-9+]/g, '')}`;

export function architectLinks(a) {
  const links = [];
  if (a.websiteUrl) links.push(`<a href="${esc(a.websiteUrl)}" target="_blank" rel="noopener noreferrer">회사 사이트 ↗</a>`);
  if (a.kakaoUrl) links.push(`<a href="${esc(a.kakaoUrl)}" target="_blank" rel="noopener noreferrer">카카오톡 상담</a>`);
  if (a.phone) links.push(`<a href="${esc(telHref(a.phone))}">전화 ${esc(a.phone)}</a>`);
  return links.join('');
}

export function architectCardMarkup(a) {
  const logo = a.logoUrl
    ? `<img class="site-architect-logo-img" src="${esc(a.logoUrl)}" alt="${esc(a.officeName)} 로고" loading="lazy">`
    : `<span class="site-architect-logo" aria-hidden="true">${esc((a.officeName || '건').slice(0, 1))}</span>`;
  const rows = [
    a.representativeName ? `<div class="site-architect-row"><span>대표 :</span><b>${esc(a.representativeName)}</b></div>` : '',
    a.address ? `<div class="site-architect-row"><span>주소 :</span><b>${esc(a.address)}</b></div>` : '',
    a.bio ? `<div class="site-architect-row"><span>소개 :</span><b>${esc(a.bio)}</b></div>` : '',
  ].join('');
  const tags = [a.regions, a.specialties].filter(Boolean);
  const images = Array.isArray(a.galleryUrls) ? a.galleryUrls.filter(Boolean).slice(0, 8) : [];
  const gallery = images.length
    ? `<div class="site-architect-gallery" data-gallery><div class="site-architect-slides">${images.map((url, i) => `<img class="site-architect-slide${i === 0 ? ' is-active' : ''}" src="${esc(url)}" alt="${esc(a.officeName)} 대표 이미지 ${i + 1}" loading="lazy">`).join('')}</div>${images.length > 1 ? `<div class="site-architect-dots">${images.map((_, i) => `<button type="button" class="site-architect-dot${i === 0 ? ' is-active' : ''}" data-slide="${i}" aria-label="대표 이미지 ${i + 1}"></button>`).join('')}</div>` : ''}</div>`
    : `<div class="site-architect-gallery site-architect-gallery-empty" aria-hidden="true">${logo}</div>`;
  return `<article class="site-architect-item"><div class="site-architect-head"><span class="site-architect-logo-badge">${logo}</span><b class="site-architect-name">${esc(a.officeName)}</b>${a.businessVerified ? '<span class="site-architect-verified">사업자 인증</span>' : ''}</div><div class="site-architect-media">${gallery}</div><div class="site-architect-footline">${tags.length ? `<span class="site-architect-tags">${tags.map((t) => esc(t)).join(' · ')}</span>` : ''}<span class="site-architect-links">${architectLinks(a)}</span></div><div class="site-architect-rows">${rows}</div></article>`;
}

// 대표 이미지를 3초 간격으로 자동 전환한다. 수동 점 클릭도 지원한다.
export function initArchitectGalleries(root = document) {
  const timers = [];
  root.querySelectorAll('[data-gallery]').forEach((gallery) => {
    const slides = [...gallery.querySelectorAll('.site-architect-slide')];
    const dots = [...gallery.querySelectorAll('.site-architect-dot')];
    if (slides.length < 2) return;
    let index = 0;
    const show = (next) => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    };
    dots.forEach((dot) => dot.addEventListener('click', () => show(Number(dot.dataset.slide))));
    const timer = setInterval(() => show(index + 1), 3000);
    timers.push(timer);
  });
  return () => timers.forEach(clearInterval);
}
