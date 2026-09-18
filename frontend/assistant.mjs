import { apiFetch } from './api-client.mjs';
import { member } from './member.mjs';
import { formatArea, getAreaDisplayUnit } from './area-display.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = won => won > 0 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억` : '가격 미기재';
const area = value => value > 0 ? formatArea(value, getAreaDisplayUnit()) : '면적 미기재';
const ROBOT = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="16" width="24" height="20" rx="7" fill="#bfe3ff" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="9" r="2.6" fill="currentColor"/><path d="M24 12v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="19" cy="25" r="2.4" fill="currentColor"/><circle cx="29" cy="25" r="2.4" fill="currentColor"/><path d="M19 31c2.4 2 7.6 2 10 0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M9 24v6M39 24v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

const STEPS = [
  '요청을 이해하고 있어요…',
  '서울 매물 2만여 건을 살펴보는 중…',
  '가까운 지하철역까지 거리를 계산하는 중…',
  '조건에 맞는 매물을 정리하는 중…',
];

function savedCondition() {
  if (member.status !== 'ready') return null;
  const item = member.items.find(i => i.kind === 'condition' && i.key === 'primary') || member.items.find(i => i.kind === 'condition');
  return item?.payload || null;
}

function conditionLabel(payload) {
  const parts = [];
  if (payload.districts?.length) parts.push(payload.districts.join('·'));
  if (payload.budgetWon) parts.push(`${(payload.budgetWon / 1e8).toLocaleString('ko-KR')}억 이하`);
  if (payload.minAreaM2) parts.push(`대지 ${Math.round(payload.minAreaM2)}㎡ 이상`);
  if (payload.zones?.length) parts.push(payload.zones.join('·'));
  return parts.join(' · ') || '저장된 조건';
}

function cardMarkup(listing) {
  const station = listing.station ? `<span class="assistant-station">📍 ${esc(listing.station.name)}역 · 도보 약 ${listing.station.walkMin}분 · ${listing.station.distM}m</span>` : '';
  return `<article class="assistant-card" data-open="${esc(listing.id)}">
    <div class="assistant-card-top"><b>${money(listing.priceWon)}</b><span>${esc(listing.district)} ${esc(listing.neighborhood || '')}</span></div>
    <p class="assistant-card-address">${esc(listing.address)}</p>
    <div class="assistant-card-meta"><span>대지 ${area(listing.areaM2)}</span><span>${esc(listing.kind === 'land' ? '토지' : listing.mainUse || '건물')}</span></div>${station}
  </article>`;
}

export function mountAssistant({ onResults } = {}) {
  if (document.querySelector('#assistant-fab')) return () => {};
  const fab = document.createElement('button');
  fab.id = 'assistant-fab'; fab.className = 'assistant-fab'; fab.type = 'button';
  fab.setAttribute('aria-label', 'AI 부동산 비서 열기');
  fab.innerHTML = `<span class="assistant-fab-icon">${ROBOT}</span><span class="assistant-fab-label">AI 부동산 비서</span>`;
  const panel = document.createElement('section');
  panel.id = 'assistant-panel'; panel.className = 'assistant-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'AI 부동산 비서');
  panel.innerHTML = `<header class="assistant-head"><span class="assistant-avatar">${ROBOT}</span><div><b>AI 부동산 비서</b><small>조건을 말하면 매물을 찾아드려요</small></div><button type="button" class="assistant-close" aria-label="비서 닫기">×</button></header>
    <div class="assistant-log" aria-live="polite"></div>
    <form class="assistant-form"><input name="message" type="text" autocomplete="off" maxlength="200" placeholder="예: 마포구 30억 이하 건물" aria-label="조건 입력"><button type="submit">전송</button></form>`;
  document.body.append(fab, panel);

  const log = panel.querySelector('.assistant-log');
  const input = panel.querySelector('input');
  let busy = false;
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const add = (html, cls = 'bot') => { const div = document.createElement('div'); div.className = `assistant-msg ${cls}`; div.innerHTML = html; log.append(div); scroll(); return div; };
  const addBot = html => add(html, 'bot');
  const addUser = text => add(esc(text), 'user');

  const welcome = () => {
    const condition = savedCondition();
    addBot(`안녕하세요, AI 부동산 비서예요. 원하는 조건을 편하게 말해주세요.<br><small>예: "홍대입구역 도보 3분 30억 이하", "강남구 상업지역 토지"</small>`);
    if (condition) {
      addBot(`저장하신 조건이 있어요: <b>${esc(conditionLabel(condition))}</b><br><button type="button" class="assistant-chip" data-send="저장한 조건으로 찾아줘">이 조건으로 찾기</button>`);
    }
  };

  async function search(message) {
    if (busy) return;
    busy = true;
    addUser(message);
    const scan = addBot(`<div class="assistant-scan"><span class="assistant-spinner"></span><b>AI 공간 분석 중…</b><ul class="assistant-steps"></ul><div class="assistant-bar"><i></i></div></div>`);
    const stepsEl = scan.querySelector('.assistant-steps');
    const bar = scan.querySelector('.assistant-bar i');
    const started = Date.now();
    const timers = STEPS.map((text, i) => setTimeout(() => {
      stepsEl.insertAdjacentHTML('beforeend', `<li>${esc(text)}</li>`); scroll();
      if (bar) bar.style.width = `${Math.round(((i + 1) / STEPS.length) * 80)}%`;
    }, 350 + i * 420));
    const condition = savedCondition();
    try {
      const response = await apiFetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, condition }) });
      const data = await response.json();
      const wait = Math.max(0, 2200 - (Date.now() - started));
      await new Promise(resolve => setTimeout(resolve, wait));
      if (bar) bar.style.width = '100%';
      timers.forEach(clearTimeout);
      scan.remove();
      const groups = Array.isArray(data.groups) ? data.groups : [];
      const cards = groups.map(group => cardMarkup(group.representative)).join('');
      let reply = `<p>${esc(data.reply || '결과를 가져왔어요.')}</p>`;
      if (cards) reply += `<div class="assistant-cards">${cards}</div>`;
      if (data.unsupported) reply += `<p class="assistant-note">${esc(data.unsupported)}</p>`;
      const chips = [];
      if (groups.length) chips.push(`<button type="button" class="assistant-chip" data-map="1">지도에서 보기</button>`);
      (data.suggestions || []).forEach(s => chips.push(`<button type="button" class="assistant-chip" data-send="${esc(s.message)}">${esc(s.label)}</button>`));
      if (!groups.length) chips.push(`<button type="button" class="assistant-chip" data-send="서울 전체">서울 전체 보기</button>`);
      if (chips.length) reply += `<div class="assistant-chiprow">${chips.join('')}</div>`;
      const bubble = addBot(reply);
      if (groups.length) {
        bubble.querySelector('[data-map]')?.addEventListener('click', () => onResults?.(data));
        bubble.querySelectorAll('.assistant-card').forEach(card => card.addEventListener('click', () => onResults?.(data, card.dataset.open)));
      }
    } catch {
      timers.forEach(clearTimeout); scan.remove();
      addBot('매물 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { busy = false; }
  }

  panel.addEventListener('click', event => {
    const chip = event.target.closest('[data-send]');
    if (chip) { search(chip.dataset.send); return; }
    if (event.target.closest('.assistant-close')) { panel.hidden = true; fab.classList.add('active'); return; }
    if (event.target === fab || event.target.closest('#assistant-fab')) return;
  });
  fab.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { if (!log.childElementCount) welcome(); input.focus(); }
  });
  panel.querySelector('.assistant-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    search(value);
  });
  return () => { fab.remove(); panel.remove(); };
}
