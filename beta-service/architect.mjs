import { apiFetch, getRuntime } from './api-client.mjs';
import { member } from './member.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ARCHITECT_STATUS_LABEL = { PENDING: '검토 대기', APPROVED: '공개 중', HIDDEN: '비공개' };

let basePromise;
export function accountBase() {
  if (member.base) return Promise.resolve(member.base);
  basePromise ??= getRuntime()
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
    ? `<div class="site-architect-gallery" data-gallery><button type="button" class="site-architect-expand" aria-label="이미지 크게 보기" title="이미지 크게 보기">⤢</button><div class="site-architect-slides">${images.map((url, i) => `<img class="site-architect-slide${i === 0 ? ' is-active' : ''}" src="${esc(url)}" alt="${esc(a.officeName)} 대표 이미지 ${i + 1}" loading="lazy">`).join('')}</div>${images.length > 1 ? `<div class="site-architect-dots">${images.map((_, i) => `<button type="button" class="site-architect-dot${i === 0 ? ' is-active' : ''}" data-slide="${i}" aria-label="대표 이미지 ${i + 1}"></button>`).join('')}</div>` : ''}</div>`
    : `<div class="site-architect-gallery site-architect-gallery-empty" aria-hidden="true">${logo}</div>`;
  return `<article class="site-architect-item"><div class="site-architect-head"><span class="site-architect-logo-badge">${logo}</span><b class="site-architect-name">${esc(a.officeName)}</b>${a.businessVerified ? '<span class="site-architect-verified">사업자 인증</span>' : ''}</div><div class="site-architect-media">${gallery}</div><div class="site-architect-footline">${tags.length ? `<span class="site-architect-tags">${tags.map((t) => esc(t)).join(' · ')}</span>` : ''}<span class="site-architect-links">${architectLinks(a)}</span></div><div class="site-architect-rows">${rows}</div></article>`;
}

let architectLightboxReady = false;

function ensureArchitectLightbox() {
  if (architectLightboxReady || typeof document === 'undefined') return;
  architectLightboxReady = true;
  const overlay = document.createElement('div');
  overlay.className = 'architect-lightbox';
  overlay.hidden = true;
  overlay.innerHTML = `<button type="button" class="architect-lightbox-close" aria-label="닫기">×</button><button type="button" class="architect-lightbox-nav prev" aria-label="이전 이미지">‹</button><button type="button" class="architect-lightbox-nav next" aria-label="다음 이미지">›</button><img class="architect-lightbox-img" alt="">`;
  document.body.appendChild(overlay);

  const img = overlay.querySelector('.architect-lightbox-img');
  const prevBtn = overlay.querySelector('.architect-lightbox-nav.prev');
  const nextBtn = overlay.querySelector('.architect-lightbox-nav.next');
  let urls = [];
  let index = 0;

  const render = () => {
    img.src = urls[index] || '';
    const multiple = urls.length > 1;
    prevBtn.hidden = !multiple;
    nextBtn.hidden = !multiple;
  };
  const show = (next) => { if (!urls.length) return; index = (next + urls.length) % urls.length; render(); };
  const open = (list, start) => { urls = list; index = Math.max(0, Math.min(start, list.length - 1)); render(); overlay.hidden = false; document.body.classList.add('architect-lightbox-open'); };
  const close = () => { overlay.hidden = true; img.removeAttribute('src'); document.body.classList.remove('architect-lightbox-open'); };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.architect-lightbox-close')) { close(); return; }
    if (event.target.closest('.architect-lightbox-nav.prev')) show(index - 1);
    if (event.target.closest('.architect-lightbox-nav.next')) show(index + 1);
  });
  document.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') show(index - 1);
    else if (event.key === 'ArrowRight') show(index + 1);
  });
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.site-architect-expand');
    if (!trigger) return;
    event.preventDefault();
    const card = trigger.closest('.site-architect-item');
    if (!card) return;
    const slides = [...card.querySelectorAll('.site-architect-slide')];
    const list = slides.map((slide) => slide.getAttribute('src')).filter(Boolean);
    if (!list.length) return;
    open(list, Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active'))));
  });
}

// 대표 이미지를 3초 간격으로 자동 전환한다. 수동 점 클릭과 크게 보기(라이트박스)를 지원한다.
export function initArchitectGalleries(root = document) {
  ensureArchitectLightbox();
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
