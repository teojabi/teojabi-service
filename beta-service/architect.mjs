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
    ? `<img src="${esc(a.logoUrl)}" alt="${esc(a.officeName)} 로고" loading="lazy">`
    : `<span class="site-architect-logo" aria-hidden="true">${esc((a.officeName || '건').slice(0, 1))}</span>`;
  const meta = [a.representativeName, a.address].filter(Boolean).map(esc).join(' · ') || '건축사';
  const tags = [a.regions, a.specialties].filter(Boolean);
  return `<article class="site-architect-item">${logo}<div class="site-architect-body"><b>${esc(a.officeName)}${a.businessVerified ? ' <span class="site-architect-verified">사업자 인증</span>' : ''}</b><small>${meta}</small>${a.bio ? `<p>${esc(a.bio)}</p>` : ''}${tags.length ? `<div class="site-architect-tags">${tags.map((t) => esc(t)).join(' · ')}</div>` : ''}<div class="site-architect-links">${architectLinks(a)}</div></div></article>`;
}
