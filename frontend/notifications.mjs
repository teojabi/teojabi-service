// 개인 알림함. 로그인 회원의 찜·저장 조건 기준 임박 알림을 보여준다.
import { member, openLogin } from './member.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let dialog = null;
let badgeTimer = null;

export async function refreshNotificationBadge() {
  const badge = document.querySelector('#notif-badge');
  if (!badge) return;
  if (member.status !== 'ready') { badge.hidden = true; badge.textContent = ''; return; }
  try {
    const data = await member.request('/notifications');
    const count = Number.isFinite(data?.unreadCount) ? Number(data.unreadCount) : (Array.isArray(data?.items) ? data.items.length : 0);
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  } catch {
    badge.hidden = true; badge.textContent = '';
  }
}

// 로그인/보관함 변경 등 직후 잠깐 뒤 배지를 갱신한다.
export function scheduleNotificationBadge() {
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(refreshNotificationBadge, 400);
}

// 개발여력(신축 검토) 한 줄: 용도지역 · 허용/현재/여유 용적률 · 여유 연면적
function devLine(d) {
  if (!d || typeof d !== 'object') return '';
  const parts = [];
  if (d.zone) parts.push(d.zone);
  if (d.districtPlan) parts.push(`지구단위계획 ${d.districtPlan}`);
  if (d.allowedFar != null) parts.push(`허용 ${d.allowedFar}%`);
  if (d.currentFar != null) parts.push(`현재 ${d.currentFar}%`);
  if (d.remainingFar != null) parts.push(`여유 ${d.remainingFar}%`);
  if (d.buildableFloorAreaM2) parts.push(`여유 연면적 ${Number(d.buildableFloorAreaM2).toLocaleString('ko-KR')}㎡`);
  return parts.join(' · ');
}

async function renderInbox() {
  if (!dialog || !dialog.open) return;
  const body = dialog.querySelector('.notif-body');
  try {
    const data = await member.request('/notifications');
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      body.innerHTML = '<div class="empty"><h3>새 알림이 없어요.</h3><p>찜한 물건이나 저장 조건에 맞는 경매·공매가 임박하면 여기에서 알려드려요.</p></div>';
    } else {
      body.innerHTML = items.map(a => `<article class="member-alert"><div><p class="member-alert-kind">${esc(a.kindLabel || '')}${a.conditionName ? ` · ${esc(a.conditionName)}` : ''}</p><h4>${esc(a.title || '')}</h4><p>${esc(a.detail || '')}</p>${a.meta?.development ? `<p class="case-note">${esc(devLine(a.meta.development))}</p>` : ''}</div><div>${a.key ? `<button class="outline" data-notif="open" data-key="${esc(a.key)}">다시 보기</button>` : ''}</div></article>`).join('');
    }
  } catch (error) {
    body.innerHTML = `<p class="case-note">${error?.status === 401 ? '로그인 후 알림을 볼 수 있어요.' : '알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}</p>`;
  }
  refreshNotificationBadge();
}

export function openNotifications() {
  if (member.status !== 'ready') { openLogin(); return; }
  if (dialog && dialog.open) { dialog.close(); return; }
  const before = document.activeElement;
  dialog = document.createElement('dialog');
  dialog.className = 'notif-dialog';
  dialog.setAttribute('aria-labelledby', 'notif-title');
  dialog.innerHTML = `<div class="notif-head"><div><span class="eyebrow">MY TEOJABI</span><h2 id="notif-title">알림</h2></div><button class="outline" data-notif="close" aria-label="알림 닫기">×</button></div><p class="case-note">찜·저장 조건을 기준으로 매각기일·입찰마감이 임박한 경매·공매를 알려드려요. 사실 안내이며, 입찰 전 원문을 확인하세요.</p><div class="notif-body" aria-live="polite"><p class="case-note">알림을 불러오고 있어요.</p></div>`;
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-notif]');
    if (!button || button.disabled) return;
    if (button.dataset.notif === 'close') { dialog.close(); return; }
    if (button.dataset.notif === 'open') {
      const key = button.dataset.key;
      dialog.close();
      window.dispatchEvent(new CustomEvent('teojabi-open-saved', { detail: { kind: 'favorite', key, payload: { id: key } } }));
    }
  });
  dialog.addEventListener('close', () => { dialog.remove(); dialog = null; before?.focus(); });
  document.body.append(dialog);
  dialog.showModal();
  renderInbox();
  // 알림함을 열면 새 알림을 읽음 처리하고 배지를 지운다.
  member.request('/notifications/read', { method: 'POST' }).then(() => refreshNotificationBadge()).catch(() => {});
}
