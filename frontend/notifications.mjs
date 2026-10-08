// 개인 알림함(알림 종). 로그인 회원의 알림을 보여준다. 목록은 하루 한 번(11:00) 이메일과 같은 내용으로 채워진다.
import { member, openLogin } from './member.mjs';
import { esc, listHtml, notifyNotificationsChanged } from './inbox-view.mjs';

let dialog = null;
let badgeTimer = null;
let externalListener = null;

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

async function renderInbox() {
  if (!dialog || !dialog.open) return;
  const body = dialog.querySelector('.notif-body');
  try {
    const data = await member.request('/notifications');
    const items = Array.isArray(data?.items) ? data.items : [];
    body.innerHTML = items.length
      ? listHtml(items)
      : '<div class="empty"><h3>새 알림이 없어요.</h3><p>저장 조건에 맞는 새 매물과 임박한 경매·공매를 하루 한 번(오전 11시) 알려드려요.</p></div>';
  } catch (error) {
    body.innerHTML = `<p class="case-note">${error?.status === 401 ? '로그인 후 알림을 볼 수 있어요.' : '알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}</p>`;
  }
  refreshNotificationBadge();
}

// 종 알림함과 내 보관함이 같은 목록을 즉시 반영하도록 항목 동작을 공유한다.
export async function handleInboxAction(el) {
  const action = el.dataset.inbox;
  if (action === 'open') {
    const key = el.dataset.key;
    if (dialog?.open) dialog.close();
    window.dispatchEvent(new CustomEvent('teojabi-open-saved', { detail: { kind: 'favorite', key, payload: { id: key } } }));
    return true;
  }
  if (action === 'delete') {
    const key = el.dataset.key;
    if (!key) return false;
    el.disabled = true;
    try { await member.request(`/notifications/${encodeURIComponent(key)}`, { method: 'DELETE' }); } catch { el.disabled = false; return false; }
    notifyNotificationsChanged();
    return true;
  }
  if (action === 'delete-group') {
    const keys = String(el.dataset.keys || '').split(',').filter(Boolean);
    if (!keys.length) return false;
    el.disabled = true;
    await Promise.all(keys.map(key => member.request(`/notifications/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => null)));
    notifyNotificationsChanged();
    return true;
  }
  return false;
}

async function onExternalChange() {
  await refreshNotificationBadge();
  if (dialog && dialog.open) await renderInbox();
}

export function openNotifications() {
  if (member.status !== 'ready') { openLogin(); return; }
  if (dialog && dialog.open) { dialog.close(); return; }
  const before = document.activeElement;
  dialog = document.createElement('dialog');
  dialog.className = 'notif-dialog';
  dialog.setAttribute('aria-labelledby', 'notif-title');
  dialog.innerHTML = `<div class="notif-head"><div><span class="eyebrow">MY TEOJABI</span><h2 id="notif-title">알림</h2></div><div class="notif-head-actions"><button class="outline" data-notif="read-all">모두 읽음</button><button class="outline" data-notif="delete-all">모두 삭제</button><button class="outline" data-notif="close" aria-label="알림 닫기">×</button></div></div><p class="case-note">저장한 조건에 맞는 새 매물과 임박한 경매·공매를 <b>하루 한 번(오전 11시)</b> 알려드려요. 사실 안내이며, 입찰 전 원문을 확인하세요.</p><div class="notif-body" aria-live="polite"><p class="case-note">알림을 불러오고 있어요.</p></div>`;
  dialog.addEventListener('click', async event => {
    const head = event.target.closest('[data-notif]');
    if (head && !head.disabled) {
      if (head.dataset.notif === 'close') { dialog.close(); return; }
      if (head.dataset.notif === 'read-all') {
        head.disabled = true;
        member.request('/notifications/read', { method: 'POST' }).then(() => notifyNotificationsChanged()).catch(() => { head.disabled = false; });
        return;
      }
      if (head.dataset.notif === 'delete-all') {
        if (!window.confirm('알림을 모두 삭제할까요? 되돌릴 수 없어요.')) return;
        head.disabled = true;
        member.request('/notifications', { method: 'DELETE' }).then(() => notifyNotificationsChanged()).catch(() => { head.disabled = false; });
        return;
      }
    }
    const item = event.target.closest('[data-inbox]');
    if (item && !item.disabled) await handleInboxAction(item);
  });
  dialog.addEventListener('close', () => { dialog.remove(); dialog = null; before?.focus(); });
  externalListener = () => { onExternalChange(); };
  window.addEventListener('teojabi-notifications-changed', externalListener);
  dialog.addEventListener('close', () => { if (externalListener) { window.removeEventListener('teojabi-notifications-changed', externalListener); externalListener = null; } });
  document.body.append(dialog);
  dialog.showModal();
  renderInbox();
}
