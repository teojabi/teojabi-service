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

// 이메일과 같은 출처 표기(네이버/디스코/경매/공매).
function sourceLabel(a) {
  if (a.type === 'auction') return '경매';
  if (a.type === 'onbid') return '공매';
  if (a.type === 'notice') return '공지';
  const key = String(a.key || '');
  if (key.startsWith('naver:')) return '네이버';
  if (key.startsWith('disco:')) return '디스코';
  return '매물';
}
function specialLabel(a) {
  const flag = a.meta?.special;
  if (flag === 'discovery') return '아직 안 보신 매물';
  if (flag === 'exception') return '예외 추천';
  const d = String(a.detail || '');
  if (d.includes('조건 지역은 아니지만') || d.includes('조건 예산') || d.includes('조건 면적')) return '예외 추천';
  return null;
}
const labelOf = a => specialLabel(a) || (a.origin === 'condition' ? sourceLabel(a) : (a.kindLabel || ''));

function fmtDay(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : '';
}

// 알림을 날짜별로 묶어 하루 한 개의 알림으로 보여준다(이메일과 같은 하루 단위).
function groupLabel(group) {
  const hasListing = group.items.some(i => i.type === 'listing');
  const hasAuction = group.items.some(i => i.type === 'auction' || i.type === 'onbid');
  const kind = hasListing && hasAuction ? '새로운 매물·경매 임박 알림' : hasAuction ? '경매 임박 알림' : '새로운 매물 알림';
  const day = fmtDay(group.date);
  return day ? `${day} · ${kind}` : kind;
}

function groupItems(items) {
  const groups = [];
  const byKey = new Map();
  for (const a of items) {
    const key = String(a.date || '');
    let group = byKey.get(key);
    if (!group) { group = { key, date: a.date, items: [] }; byKey.set(key, group); groups.push(group); }
    group.items.push(a);
  }
  for (const group of groups) {
    group.items.sort((a, b) => Number(Boolean(specialLabel(b))) - Number(Boolean(specialLabel(a))));
    if (group.items.length > 8) group.items = group.items.slice(0, 8);
  }
  return groups;
}

function groupHtml(group) {
  if (group.items.length === 1) {
    const a = group.items[0];
    return `<article class="member-alert"><div><p class="member-alert-kind">${esc(labelOf(a))}${a.conditionName ? ` · ${esc(a.conditionName)}` : ''}</p><h4>${esc(a.title || '')}</h4><p>${esc(a.detail || '')}</p>${a.meta?.development ? `<p class="case-note">${esc(devLine(a.meta.development))}</p>` : ''}</div><div class="member-alert-actions">${a.key ? `<button class="outline" data-notif="open" data-key="${esc(a.key)}">다시 보기</button><button class="outline" data-notif="delete" data-key="${esc(a.key)}">삭제</button>` : ''}</div></article>`;
  }
  const keys = group.items.map(i => i.key).filter(Boolean);
  const rows = group.items.map(a => `<li class="notif-group-row"><span class="notif-src">${esc(labelOf(a))}</span><button type="button" class="notif-item-link" data-notif="open" data-key="${esc(a.key)}">${esc(a.title || '')}</button><span class="notif-item-detail">${esc(a.detail || '')}</span>${a.key ? `<button type="button" class="outline notif-item-del" data-notif="delete" data-key="${esc(a.key)}" aria-label="삭제">×</button>` : ''}</li>`).join('');
  return `<article class="member-alert notif-group"><div><p class="member-alert-kind">${esc(groupLabel(group))} <small>${group.items.length}건</small></p><ul class="notif-group-list">${rows}</ul></div><div class="member-alert-actions"><button class="outline" data-notif="delete-group" data-keys="${esc(keys.join(','))}">묶음 삭제</button></div></article>`;
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
      body.innerHTML = groupItems(items).map(groupHtml).join('');
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
  dialog.innerHTML = `<div class="notif-head"><div><span class="eyebrow">MY TEOJABI</span><h2 id="notif-title">알림</h2></div><div class="notif-head-actions"><button class="outline" data-notif="read-all">모두 읽음</button><button class="outline" data-notif="delete-all">모두 삭제</button><button class="outline" data-notif="close" aria-label="알림 닫기">×</button></div></div><p class="case-note">찜·저장 조건을 기준으로 새로 올라온 맞춤 매물과 매각기일·입찰마감이 임박한 경매·공매를 알려드려요. 사실 안내이며, 입찰 전 원문을 확인하세요.</p><div class="notif-body" aria-live="polite"><p class="case-note">알림을 불러오고 있어요.</p></div>`;
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-notif]');
    if (!button || button.disabled) return;
    if (button.dataset.notif === 'close') { dialog.close(); return; }
    if (button.dataset.notif === 'read-all') {
      button.disabled = true;
      member.request('/notifications/read', { method: 'POST' }).then(() => { renderInbox(); }).catch(() => { button.disabled = false; });
      return;
    }
    if (button.dataset.notif === 'delete-all') {
      if (!window.confirm('알림을 모두 삭제할까요? 되돌릴 수 없어요.')) return;
      button.disabled = true;
      member.request('/notifications', { method: 'DELETE' }).then(() => { renderInbox(); }).catch(() => { button.disabled = false; });
      return;
    }
    if (button.dataset.notif === 'delete') {
      const key = button.dataset.key;
      if (!key) return;
      button.disabled = true;
      member.request(`/notifications/${encodeURIComponent(key)}`, { method: 'DELETE' }).then(() => { renderInbox(); }).catch(() => { button.disabled = false; });
      return;
    }
    if (button.dataset.notif === 'delete-group') {
      const keys = String(button.dataset.keys || '').split(',').filter(Boolean);
      if (!keys.length) return;
      button.disabled = true;
      Promise.all(keys.map(key => member.request(`/notifications/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => null))).then(() => { renderInbox(); }).catch(() => { button.disabled = false; });
      return;
    }
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
}
