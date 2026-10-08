// 알림함(알림 종)과 내 보관함의 알림 목록이 같은 데이터·같은 모양으로 보이도록 공용으로 쓴다.
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 이메일과 같은 출처 표기(네이버/디스코/경매/공매).
export function sourceLabel(a) {
  if (a.type === 'auction') return '경매';
  if (a.type === 'onbid') return '공매';
  if (a.type === 'notice') return '공지';
  const key = String(a.key || '');
  if (key.startsWith('naver:')) return '네이버';
  if (key.startsWith('disco:')) return '디스코';
  return '매물';
}
export function specialLabel(a) {
  const flag = a.meta?.special;
  if (flag === 'discovery') return '아직 안 보신 매물';
  if (flag === 'exception') return '예외 추천';
  const d = String(a.detail || '');
  if (d.includes('조건 지역은 아니지만') || d.includes('조건 예산') || d.includes('조건 면적')) return '예외 추천';
  return null;
}
export const labelOf = a => specialLabel(a) || (a.origin === 'condition' ? sourceLabel(a) : (a.kindLabel || ''));

// 개발여력(신축 검토) 한 줄: 용도지역 · 허용/현재/여유 용적률 · 여유 연면적
export function devLine(d) {
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

function fmtDay(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : '';
}

// 알림을 날짜별로 묶어 하루 한 개의 알림으로 보여준다(이메일과 같은 하루 단위).
export function groupLabel(group) {
  const hasListing = group.items.some(i => i.type === 'listing');
  const hasAuction = group.items.some(i => i.type === 'auction' || i.type === 'onbid');
  const kind = hasListing && hasAuction ? '새로운 매물·경매 임박 알림' : hasAuction ? '경매 임박 알림' : '새로운 매물 알림';
  const day = fmtDay(group.date);
  return day ? `${day} · ${kind}` : kind;
}

export function groupItems(items) {
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

// 항목/묶음 공통 동작은 data-inbox 로 위임한다: open, delete, delete-group.
export function groupHtml(group) {
  if (group.items.length === 1) {
    const a = group.items[0];
    return `<article class="member-alert"><div><p class="member-alert-kind">${esc(labelOf(a))}${a.conditionName ? ` · ${esc(a.conditionName)}` : ''}</p><h4>${esc(a.title || '')}</h4><p>${esc(a.detail || '')}</p>${a.meta?.development ? `<p class="case-note">${esc(devLine(a.meta.development))}</p>` : ''}</div><div class="member-alert-actions">${a.key ? `<button class="outline" data-inbox="open" data-key="${esc(a.key)}">다시 보기</button><button class="outline" data-inbox="delete" data-key="${esc(a.key)}">삭제</button>` : ''}</div></article>`;
  }
  const keys = group.items.map(i => i.key).filter(Boolean);
  const keysAttr = esc(keys.join(','));
  const rows = group.items.map(a => `<li class="notif-group-row"><span class="notif-src">${esc(labelOf(a))}</span>${a.key ? `<button type="button" class="notif-item-link" data-inbox="open" data-key="${esc(a.key)}">${esc(a.title || '')}</button>` : `<b>${esc(a.title || '')}</b>`}<span class="notif-item-detail">${esc(a.detail || '')}</span>${a.key ? `<button type="button" class="outline notif-item-del" data-inbox="delete" data-key="${esc(a.key)}" aria-label="삭제">×</button>` : ''}</li>`).join('');
  return `<article class="member-alert notif-group"><div><p class="member-alert-kind">${esc(groupLabel(group))} <small>${group.items.length}건</small></p><ul class="notif-group-list">${rows}</ul></div><div class="member-alert-actions">${keys.length ? `<button class="outline" data-inbox="map" data-keys="${keysAttr}">지도에서 보기</button><button class="outline" data-inbox="delete-group" data-keys="${keysAttr}">삭제</button>` : ''}</div></article>`;
}

export function listHtml(items) {
  return groupItems(items).map(groupHtml).join('');
}

// 한 쪽에서 읽음/삭제하면 다른 쪽도 즉시 갱신하도록 알린다.
export function notifyNotificationsChanged() {
  window.dispatchEvent(new CustomEvent('teojabi-notifications-changed'));
}
