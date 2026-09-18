import { apiFetch } from './api-client.mjs';
import { member } from './member.mjs';
import { DISTRICTS } from './policy.mjs';
import { formatArea, getAreaDisplayUnit } from './area-display.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = won => won > 0 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억` : '가격 미기재';
const area = value => value > 0 ? formatArea(value, getAreaDisplayUnit()) : '면적 미기재';
const originLabel = origin => ({ premium: '★ 터잡이 추천', registered: '터잡이 등록', naver: '네이버 매물' }[origin] || '네이버 매물');
const ROBOT = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="16" width="24" height="20" rx="7" fill="#bfe3ff" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="9" r="2.6" fill="currentColor"/><path d="M24 12v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="19" cy="25" r="2.4" fill="currentColor"/><circle cx="29" cy="25" r="2.4" fill="currentColor"/><path d="M19 31c2.4 2 7.6 2 10 0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M9 24v6M39 24v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const SCAN_MS = 8000;
const STEPS = [
  '터잡이 등록·추천 매물을 찾는 중이에요…',
  '네이버 매물을 찾는 중이에요…',
  '대지위치를 검색하고 있어요…',
  '면적과 용도지역을 맞춰보는 중이에요…',
  '가까운 지하철역까지 거리를 계산하는 중이에요…',
  '도로폭 등 주변 조건을 확인하는 중이에요…',
  '조건에 맞는 매물을 정리하고 있어요…',
];
const BUDGET_PRESETS = [10, 20, 30, 50, 100, 200];
const AREA_PRESETS = [50, 100, 200, 300, 500];
const ROAD_PRESETS = [4, 6, 8, 12];
const DISTANCE_PRESETS = [100, 200, 300, 500, 1000];

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
  return `<article class="assistant-card" data-open="${esc(listing.id)}" data-origin="${esc(listing.origin)}">
    <div class="assistant-card-top"><span class="assistant-origin origin-${esc(listing.origin)}">${esc(originLabel(listing.origin))}</span><b>${money(listing.priceWon)}</b></div>
    <p class="assistant-card-address">${esc(listing.district)} ${esc(listing.neighborhood || '')} · ${esc(listing.address)}</p>
    <div class="assistant-card-meta"><span>대지 ${area(listing.areaM2)}</span><span>${esc(listing.kind === 'land' ? '토지' : listing.mainUse || '건물')}</span></div>${station}
    <button type="button" class="assistant-card-ask" data-ask="${esc(listing.id)}">이 매물 물어보기</button>
  </article>`;
}

// 선택한 매물에 대해 확인할 수 있는 고정 메뉴. 데이터가 없는 항목은 비활성으로 표시한다.
function askMenuMarkup(listing) {
  const hasPnu = /^\d{19}$/.test(String(listing.pnu || ''));
  const item = (key, label, enabled, note) => `<button type="button" class="assistant-chip" data-ask-menu="${key}" ${enabled ? '' : 'disabled title="' + esc(note) + '"'}>${label}</button>`;
  return `<div class="assistant-askmenu">
    <div class="assistant-askmenu-head"><span class="assistant-origin origin-${esc(listing.origin)}">${esc(originLabel(listing.origin))}</span><b>${money(listing.priceWon)}</b><span>${esc(listing.district)} ${esc(listing.neighborhood || '')}</span></div>
    <p class="assistant-card-address">${esc(listing.address)}</p>
    <div class="assistant-chiprow">
      ${item('station', '📍 역까지 거리', Boolean(listing.station), '역 거리를 확인할 수 없어요')}
      ${item('nearby', '📊 주변 실거래', true, '')}
      ${item('zoning', '🗺️ 용도지역·규제', hasPnu, '필지 정보가 없어 확인할 수 없어요')}
      ${item('documents', '📄 건축물대장·토지대장', hasPnu, '필지 정보가 없어 확인할 수 없어요')}
      ${item('similar', '🔎 비슷한 매물 찾기', true, '')}
      ${item('analyze', '🏗️ 신축 검토하기', true, '')}
    </div>
    ${hasPnu ? '' : '<p class="assistant-note">이 매물은 필지 고유번호가 없어 용도지역·규제와 대장 자료를 확인할 수 없어요. 신축 검토에서 필지를 직접 선택할 수 있어요.</p>'}
  </div>`;
}

// Editable condition chips let the user fix the search without leaving the chat.
function chipMarkup(chips) {
  if (!chips.length) return '';
  return `<div class="assistant-chiprow assistant-filterrow">${chips.map(chip =>
    `<button type="button" class="assistant-filter" data-filter-key="${esc(chip.key)}" data-filter-value="${esc(chip.value)}">${esc(chip.label)}<span aria-hidden="true">×</span></button>`).join('')}<button type="button" class="assistant-filter assistant-filter-add" data-filter-add="1">＋ 조건</button></div>`;
}

function editorMarkup(filters) {
  const value = filters || {};
  const budget = value.budgetWon ? Math.round(value.budgetWon / 1e8) : '';
  const minArea = value.minAreaM2 ? Math.round(value.minAreaM2 / 3.305785) : '';
  const distance = value.maxDistanceM || '';
  const road = value.minRoadWidthM || '';
  const kindLabel = { land: '토지', building: '건물' };
  return `<form class="assistant-editor">
    <div class="assistant-editor-row"><span>지역</span><div class="assistant-opts" data-group="districts">${DISTRICTS.map(d => `<button type="button" data-pick="districts" data-value="${esc(d)}" aria-pressed="${(value.districts || []).includes(d)}">${esc(d)}</button>`).join('')}</div></div>
    <div class="assistant-editor-row"><span>유형</span><div class="assistant-opts" data-group="kind">${Object.entries(kindLabel).map(([k, l]) => `<button type="button" data-pick="kind" data-value="${k}" aria-pressed="${value.kind === k}">${l}</button>`).join('')}</div></div>
    <div class="assistant-editor-row"><span>용도지역</span><div class="assistant-opts" data-group="zones">${['주거지역', '상업지역', '공업지역', '녹지지역'].map(z => `<button type="button" data-pick="zones" data-value="${z}" aria-pressed="${(value.zones || []).includes(z)}">${z}</button>`).join('')}</div></div>
    <div class="assistant-editor-row"><span>예산</span><div class="assistant-opts">${BUDGET_PRESETS.map(v => `<button type="button" data-num="budgetWon" data-value="${v}" aria-pressed="${budget === v}">${v}억 이하</button>`).join('')}<input type="number" data-num-input="budgetWon" min="1" placeholder="직접(억)" value="${esc(budget)}"></div></div>
    <div class="assistant-editor-row"><span>대지</span><div class="assistant-opts">${AREA_PRESETS.map(v => `<button type="button" data-num="minAreaM2" data-value="${v}" aria-pressed="${minArea === v}">${v}평 이상</button>`).join('')}<input type="number" data-num-input="minAreaM2" min="1" placeholder="직접(평)" value="${esc(minArea)}"></div></div>
    <div class="assistant-editor-row"><span>역 거리</span><div class="assistant-opts">${DISTANCE_PRESETS.map(v => `<button type="button" data-num="maxDistanceM" data-value="${v}" aria-pressed="${distance === v}">${v}m</button>`).join('')}</div></div>
    <div class="assistant-editor-row"><span>도로폭</span><div class="assistant-opts">${ROAD_PRESETS.map(v => `<button type="button" data-num="minRoadWidthM" data-value="${v}" aria-pressed="${road === v}">${v}m 이상</button>`).join('')}</div></div>
    <div class="assistant-editor-actions"><button type="button" class="outline" data-editor-cancel>닫기</button><button type="submit" class="primary">이 조건으로 다시 찾기</button></div>
  </form>`;
}

export function mountAssistant({ onResults, onAnalyze } = {}) {
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
    <form class="assistant-form"><input name="message" type="text" autocomplete="off" maxlength="200" placeholder="예: 종로구 상업지역 100억 이하 도로 6m" aria-label="조건 입력"><button type="submit">전송</button></form>`;
  document.body.append(fab, panel);

  const log = panel.querySelector('.assistant-log');
  const input = panel.querySelector('input');
  let busy = false;
  let lastFilters = null;
  let selectedListing = null;
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const add = (html, cls = 'bot') => { const div = document.createElement('div'); div.className = `assistant-msg ${cls}`; div.innerHTML = html; log.append(div); scroll(); return div; };
  const addBot = html => add(html, 'bot');
  const addUser = text => add(esc(text), 'user');

  // 조회 실패를 0건처럼 보여주지 않는다.
  async function readJson(path) {
    try {
      const response = await apiFetch(path);
      const data = await response.json();
      return response.ok && data?.status === 'ready' ? data : null;
    } catch { return null; }
  }

  // 선택한 매물의 고정 메뉴 답변. 검증된 기존 조회 API만 사용한다.
  async function askAbout(key, listing) {
    if (busy) return;
    busy = true;
    const scan = addBot(`<div class="assistant-scan"><span class="assistant-spinner"></span><b>확인하고 있어요…</b></div>`);
    const started = Date.now();
    const settle = async () => { const wait = Math.max(0, 500 - (Date.now() - started)); if (wait) await new Promise(r => setTimeout(r, wait)); };
    try {
      if (key === 'analyze') {
        scan.remove(); busy = false;
        onAnalyze?.(listing);
        addBot(`🏗️ <b>${esc(listing.address)}</b> 기준으로 신축 검토를 열었어요. 주소와 대지면적이 자동으로 입력돼요.`);
        return;
      }
      if (key === 'similar') {
        scan.remove(); busy = false;
        const filters = { districts: listing.district ? [listing.district] : undefined, kind: listing.kind, limit: 60 };
        if (listing.areaM2 > 0) { filters.minAreaM2 = Math.round(listing.areaM2 * 0.8); filters.maxAreaM2 = Math.round(listing.areaM2 * 1.2); }
        await runSearch(null, filters);
        return;
      }
      let html;
      if (key === 'station') {
        const s = listing.station;
        html = s ? `📍 <b>${esc(s.name)}역</b>까지 직선거리 <b>${s.distM}m</b>, 도보 약 <b>${s.walkMin}분</b>이에요.<br><small>실제 보행 경로와 다를 수 있어요.</small>` : '역 거리 자료를 확인할 수 없어요.';
      } else if (key === 'nearby') {
        const data = await readJson(`/api/nearby-transactions/${encodeURIComponent(listing.id)}`);
        if (!data) html = '주변 실거래를 확인할 수 없어요.';
        else if (!data.cases?.length) html = '반경 1km 안에서 최근 36개월 토지·건물 거래를 찾지 못했어요.';
        else html = `📊 <b>주변 실거래 ${data.cases.length}곳</b><div class="assistant-facts">${data.cases.map(c => `<div class="assistant-fact"><span>${Math.round(c.distanceMeters)}m · ${esc(c.dealDate)}</span><b>${money(c.priceWon)}</b><span>대지 ${area(c.areaM2)}</span></div>`).join('')}</div><small>매물 핀 기준 직선거리이며 현재 시세를 보증하지 않아요.</small>`;
      } else if (key === 'zoning') {
        const data = await readJson(`/api/site-context/${encodeURIComponent(listing.id)}`);
        if (!data) html = '용도지역·규제 자료를 확인할 수 없어요.';
        else {
          const zones = (data.zones || []).map(z => `<li>${esc(z.name || z.code || '구역')}${z.relation ? ` · ${esc(z.relation)}` : ''}</li>`).join('');
          const road = data.road?.status === 'ready' && data.road.widthM ? `<li>도로폭 ${data.road.widthM}m</li>` : '';
          html = `🗺️ <b>용도지역·규제</b><ul class="assistant-list">${zones || '<li>확인된 용도지역 자료가 없어요.</li>'}${road}</ul><small>보유 공공데이터 기준이에요.</small>`;
        }
      } else if (key === 'documents') {
        const [building, land] = await Promise.all([
          readJson(`/api/building-records/${encodeURIComponent(listing.id)}`),
          readJson(`/api/land-record/${encodeURIComponent(listing.id)}`),
        ]);
        const parts = [];
        if (building) {
          const names = (building.items || building.records || []).slice(0, 4).map(r => `<li>${esc(r.kind || r.name || '건축물대장')} · 연면적 ${area(r.floorAreaM2)}</li>`).join('');
          parts.push(`📄 <b>건축물대장</b><ul class="assistant-list">${names || '<li>보유한 건축물대장 자료가 없어요.</li>'}</ul>`);
        } else parts.push('📄 건축물대장 자료를 확인할 수 없어요.');
        if (land) parts.push(`🗂️ <b>토지대장</b><ul class="assistant-list"><li>공부상 면적 ${area(land.areaM2)}</li><li>지목 ${esc(land.jimok || '미기재')}</li></ul>`);
        else parts.push('🗂️ 토지대장 자료를 확인할 수 없어요.');
        html = parts.join('');
      } else html = '알 수 없는 요청이에요.';
      await settle();
      scan.remove();
      const bubble = addBot(html + `<div class="assistant-chiprow"><button type="button" class="assistant-chip" data-ask-back="1">↩ 다른 항목 물어보기</button></div>`);
      bubble.querySelector('[data-ask-back]')?.addEventListener('click', () => openAskMenu(listing));
    } catch {
      scan.remove();
      addBot('자료를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { busy = false; }
  }

  function openAskMenu(listing) {
    selectedListing = listing;
    const bubble = addBot(askMenuMarkup(listing));
    bubble.querySelectorAll('[data-ask-menu]').forEach(button => button.addEventListener('click', () => askAbout(button.dataset.askMenu, listing)));
  }

  const welcome = () => {
    const condition = savedCondition();
    addBot(`안녕하세요, AI 부동산 비서예요. 원하는 조건을 편하게 말해주세요.<br><small>예: "종로구 상업지역 100억 이하 50평 이상 도로 6m", "홍대입구역 도보 3분"</small>`);
    if (condition) addBot(`저장하신 조건이 있어요: <b>${esc(conditionLabel(condition))}</b><br><small>말씀하신 조건이 있으면 그 조건으로 먼저 찾아드려요.</small><button type="button" class="assistant-chip" data-send="저장한 조건으로 찾아줘">이 조건으로 찾기</button>`);
  };

  function renderResult(body, data, openEditor) {
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const cards = groups.map(group => cardMarkup(group.representative)).join('');
    let reply = `<p>${esc(data.reply || '결과를 가져왔어요.').replace(/\n/g, '<br>')}</p>`;
    if (data.conditionNote) reply += `<p class="assistant-note">${esc(data.conditionNote)}</p>`;
    if (cards) reply += `<div class="assistant-cards">${cards}</div>`;
    reply += chipMarkup(data.chips || []);
    if (data.unsupported) reply += `<p class="assistant-note">${esc(data.unsupported)}</p>`;
    const chips = [];
    if (groups.length) chips.push(`<button type="button" class="assistant-chip" data-map="1">지도에서 보기</button>`);
    chips.push(`<button type="button" class="assistant-chip" data-editor="1">조건 바꾸기</button>`);
    if (data.conditionNote) chips.push(`<button type="button" class="assistant-chip" data-send="저장한 조건으로 찾아줘">저장 조건으로 찾기</button>`);
    (data.suggestions || []).forEach(s => chips.push(`<button type="button" class="assistant-chip" data-send="${esc(s.message)}">${esc(s.label)}</button>`));
    if (chips.length) reply += `<div class="assistant-chiprow">${chips.join('')}</div>`;
    reply += `<div class="assistant-editor-slot" hidden></div>`;
    const bubble = addBot(reply);

    const relax = Array.isArray(data.relaxations) ? data.relaxations : [];
    if (!groups.length && relax.length) {
      const row = document.createElement('div');
      row.className = 'assistant-chiprow assistant-relax';
      row.innerHTML = relax.slice(0, 4).map(r => `<button type="button" class="assistant-chip" data-relax="${esc(JSON.stringify(r.patch))}">${esc(r.label)} (${r.count}건)</button>`).join('');
      bubble.append(row);
    }
    if (groups.length) {
      bubble.querySelector('[data-map]')?.addEventListener('click', () => onResults?.(data));
      const byId = new Map(groups.map(g => [g.representative.id, g.representative]));
      bubble.querySelectorAll('[data-ask]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const listing = byId.get(button.dataset.ask);
        if (listing) openAskMenu(listing);
      }));
      bubble.querySelectorAll('.assistant-card').forEach(card => card.addEventListener('click', event => {
        if (event.target.closest('[data-ask]')) return;
        onResults?.(data, card.dataset.open);
      }));
    }
    const slot = bubble.querySelector('.assistant-editor-slot');
    const openEditorUi = () => {
      slot.hidden = false;
      slot.innerHTML = editorMarkup(lastFilters || {});
    };
    bubble.querySelector('[data-editor]')?.addEventListener('click', () => { slot.hidden ? openEditorUi() : (slot.hidden = true); slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    if (openEditor) openEditorUi();
    slot.addEventListener('click', event => {
      if (event.target.closest('[data-editor-cancel]')) { slot.hidden = true; slot.innerHTML = ''; return; }
      const pick = event.target.closest('[data-pick]');
      if (pick) {
        const list = lastFilters[pick.dataset.pick];
        const value = pick.dataset.value;
        const next = Array.isArray(list) ? (list.includes(value) ? list.filter(v => v !== value) : [...list, value]) : value;
        lastFilters[pick.dataset.pick] = Array.isArray(next) && next.length ? next : undefined;
        openEditorUi();
      }
      const num = event.target.closest('[data-num]');
      if (num) {
        const key = num.dataset.num, value = Number(num.dataset.value);
        if (key === 'budgetWon') lastFilters.budgetWon = value * 1e8;
        else if (key === 'minAreaM2') lastFilters.minAreaM2 = Math.round(value * 3.305785);
        else lastFilters[key] = value;
        openEditorUi();
      }
      const relaxChip = event.target.closest('[data-relax]');
      if (relaxChip) {
        const patch = JSON.parse(relaxChip.dataset.relax);
        lastFilters = { ...(lastFilters || {}), ...patch };
        for (const key of Object.keys(patch)) if (patch[key] === null) delete lastFilters[key];
        runSearch(null, lastFilters);
      }
    });
    slot.addEventListener('input', event => {
      const field = event.target.closest('[data-num-input]');
      if (!field) return;
      const key = field.dataset.numInput, value = Number(field.value);
      if (!Number.isFinite(value) || value <= 0) { delete lastFilters[key]; return; }
      if (key === 'budgetWon') lastFilters.budgetWon = Math.round(value) * 1e8;
      else if (key === 'minAreaM2') lastFilters.minAreaM2 = Math.round(value * 3.305785);
      else lastFilters[key] = value;
    });
    slot.addEventListener('submit', event => {
      event.preventDefault();
      runSearch(null, lastFilters || {});
    });
    slot.addEventListener('click', event => {
      const remove = event.target.closest('[data-filter-key]');
      if (!remove) return;
      const key = remove.dataset.filterKey, value = remove.dataset.filterValue;
      const list = lastFilters?.[key];
      if (Array.isArray(list)) {
        lastFilters[key] = list.filter(v => String(v) !== value);
        if (!lastFilters[key].length) delete lastFilters[key];
      } else delete lastFilters[key];
      runSearch(null, lastFilters || {});
    });
  }

  async function runSearch(message, editedFilters) {
    if (busy) return;
    busy = true;
    if (message) addUser(message);
    const scan = addBot(`<div class="assistant-scan"><span class="assistant-spinner"></span><b>AI 공간 분석 중…</b><ul class="assistant-steps"></ul><div class="assistant-bar"><i></i></div></div>`);
    const stepsEl = scan.querySelector('.assistant-steps');
    const bar = scan.querySelector('.assistant-bar i');
    const started = Date.now();
    const interval = Math.floor(SCAN_MS * 0.9 / STEPS.length);
    const timers = STEPS.map((text, i) => setTimeout(() => {
      stepsEl.insertAdjacentHTML('beforeend', `<li>${esc(text)}</li>`); scroll();
      if (bar) bar.style.width = `${Math.round(((i + 1) / STEPS.length) * 92)}%`;
    }, 250 + i * interval));
    const condition = savedCondition();
    const payload = { message: message || '', condition, filters: editedFilters || undefined };
    try {
      const response = await apiFetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      const wait = Math.max(0, SCAN_MS - (Date.now() - started));
      await new Promise(resolve => setTimeout(resolve, wait));
      if (bar) bar.style.width = '100%';
      timers.forEach(clearTimeout);
      scan.remove();
      lastFilters = { ...(data.filters || {}) };
      renderResult(null, data, !message && Boolean(editedFilters));
    } catch {
      timers.forEach(clearTimeout); scan.remove();
      addBot('매물 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { busy = false; }
  }

  panel.addEventListener('click', event => {
    const chip = event.target.closest('[data-send]');
    if (chip) { runSearch(chip.dataset.send); return; }
    if (event.target.closest('.assistant-close')) { panel.hidden = true; fab.classList.add('active'); return; }
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
    runSearch(value);
  });
  return () => { fab.remove(); panel.remove(); };
}
