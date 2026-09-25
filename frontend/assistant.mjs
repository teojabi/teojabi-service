import { apiFetch } from './api-client.mjs';
import { member, openLogin } from './member.mjs';
import { DISTRICTS } from './policy.mjs';
import { formatArea, getAreaDisplayUnit } from './area-display.mjs';
import { renderInlineContext, renderFarSummary } from './inline-context.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = won => won > 0 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억` : '가격 미기재';
const area = value => value > 0 ? formatArea(value, getAreaDisplayUnit()) : '면적 미기재';
const originLabel = origin => ({ premium: '★ 터잡이 추천', registered: '터잡이 등록', disco: '디스코 매물', naver: '네이버 매물', auction: '경매 물건', onbid: '공매 물건' }[origin] || '네이버 매물');
const publicSale = origin => origin === 'auction' || origin === 'onbid';
import { ASSISTANT_ROBOT } from './assistant-icon.mjs';
export { ASSISTANT_ROBOT };
const ROBOT = ASSISTANT_ROBOT;
const SCAN_MS = 8000;
const STEPS = [
  '터잡이 등록·추천 매물을 찾는 중이에요…',
  '네이버 매물을 찾는 중이에요…',
  '디스코 매물을 찾는 중이에요…',
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
const SOURCE_ORDER = ['premium', 'registered', 'auction', 'onbid', 'naver', 'disco'];
// 출처별로 3개씩 번갈아 섞어, 한 소스(경매 등)만 뒤로 밀리지 않게 한다.
function mixGroups(groups) {
  const buckets = new Map(SOURCE_ORDER.map(origin => [origin, []]));
  for (const group of groups) {
    const origin = group?.representative?.origin;
    buckets.get(buckets.has(origin) ? origin : 'naver').push(group);
  }
  const out = [];
  let moved = true;
  while (moved) {
    moved = false;
    for (const origin of SOURCE_ORDER) {
      const bucket = buckets.get(origin);
      if (bucket.length) { out.push(...bucket.splice(0, 3)); moved = true; }
    }
  }
  return out;
}

function savedCondition() {
  if (member.status !== 'ready') return null;
  const item = member.items.find(i => i.kind === 'condition' && i.key === 'primary') || member.items.find(i => i.kind === 'condition');
  return item?.payload || null;
}

function conditionLabel(payload) {
  const parts = [];
  if (payload.districts?.length) parts.push(payload.districts.join('·'));
  if (payload.neighborhoods?.length) parts.push(payload.neighborhoods.join('·'));
  if (payload.budgetWon) parts.push(`${(payload.budgetWon / 1e8).toLocaleString('ko-KR')}억 이하`);
  if (payload.minAreaM2) parts.push(`대지 ${Math.round(payload.minAreaM2)}㎡ 이상`);
  if (payload.zones?.length) parts.push(payload.zones.join('·'));
  return parts.join(' · ') || '저장된 조건';
}

function hasUsableFilters(filters) {
  return Object.entries(filters || {}).some(([key, value]) => key !== 'limit' && (Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== ''));
}

// 저장 조건으로 찾을 때는 경매·공매 물건도 함께 포함한다.
function withAuction(condition) {
  const auction = condition?.auction && typeof condition.auction === 'object' ? condition.auction : {};
  return { ...(condition || {}), auction: { ...auction, enabled: true, source: auction.source || 'both' } };
}

// 매물을 고른 뒤 "이 주위 상권 알려줘" 같은 자유 질문을 매물 메뉴로 연결한다.
function listingQuestion(message) {
  const t = String(message || '');
  if (/상권|상가|번화가|동네|주변|주위|분위기|유동인구|매출/.test(t)) return 'commercialInfo';
  if (/실거래|거래|시세|시가/.test(t)) return 'nearby';
  if (/역|지하철|교통/.test(t)) return 'station';
  if (/용도지역|규제|구역|지구단위/.test(t)) return 'zoning';
  if (/용적률|건폐율|높이/.test(t)) return 'far';
  if (/신축|건축|공사/.test(t)) return 'analyze';
  return null;
}

// 지역·예산·역 같은 구체 조건이 있으면 새 검색으로 본다.
function hasStrongCondition(message) {
  const t = String(message || '');
  return DISTRICTS.some(d => t.includes(d) || (d.endsWith('구') && d.length >= 3 && t.includes(d.slice(0, -1)))) ||
    /[가-힣A-Za-z0-9]{2,12}\s*역/.test(t) ||
    /\d+(?:\.\d+)?\s*(?:억|만원|평|㎡|m2|m²|제곱미터)/.test(t) ||
    /(?:주거지역|상업지역|공업지역|녹지지역)/.test(t) ||
    /(?:골목상권|전통시장|발달상권|관광특구)/.test(t) ||
    /도로\s*(?:폭)?\s*\d+/.test(t);
}

// 대화창에서 보여줄 상권 요약. 상세페이지의 큰 카드 대신 짧고 편하게 정리한다.
function commercialChatMarkup(data) {
  if (!data || data.status !== 'ready' || !data.nearest) return '반경 500m 안에서 연결되는 상권 자료를 찾지 못했어요.';
  const n = data.nearest;
  const sales = n.monthlySalesWon > 0 ? `${(n.monthlySalesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : null;
  const pop = n.population > 0 ? `${Math.round(n.population / 10000).toLocaleString('ko-KR')}만` : null;
  const facts = [
    sales ? `<div class="assistant-fact"><span>월 추정매출</span><b>${sales}</b></div>` : '',
    pop ? `<div class="assistant-fact"><span>유동인구</span><b>${pop}</b></div>` : '',
    n.changeIndex ? `<div class="assistant-fact"><span>변화지표</span><b>${esc(n.changeIndex)}</b></div>` : '',
  ].filter(Boolean).join('');
  const cats = (n.topCategories || []).slice(0, 3).map(c => `${esc(c.name)} ${(c.salesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`).join(' · ');
  const dist = n.distanceM != null ? `약 ${n.distanceM}m` : '가까운 거리';
  return `🏪 여기서 가장 가까운 상권은 <b>${esc(n.name)}</b>${n.type ? ` (${esc(n.type)})` : ''}이고 ${dist} 거리예요.${facts ? `<div class="assistant-facts">${facts}</div>` : ''}${cats ? `<p class="assistant-conditions">주요 업종 · ${cats}</p>` : ''}<small>상권 대표점 기준 · 서울시 상권분석서비스(추정매출) 참고자료예요.</small><div class="assistant-chiprow"><button type="button" class="assistant-chip assistant-chip-primary" data-ask-commercial="${esc(n.name)} 상권">이 상권에서 매물 찾기</button></div>`;
}

// "<구> 상권 알려줘"처럼 지역 상권을 묻는지 판단한다. 구체 조건(유형·수치·매물 찾기)은 검색으로 본다.
function isCommercialQuestion(message) {
  const t = String(message || '');
  if (!/(?:상권|상가|번화가|유동인구)/.test(t)) return false;
  if (/(?:골목상권|전통시장|발달상권|관광특구)/.test(t)) return false;
  if (/\d/.test(t)) return false;
  if (/[가-힣A-Za-z0-9]{2,12}\s*역/.test(t)) return false;
  if (/(?:주거지역|상업지역|공업지역|녹지지역|도로|예산|평|㎡)/.test(t)) return false;
  if (/(?:토지|땅|필지|건물|빌딩|주택|근린)/.test(t)) return false;
  if (/찾아|검색|보여|추천|매물/.test(t)) return false;
  return true;
}

// 자치구의 주요 상권 목록을 요약한다.
function commercialDistrictMarkup(data, gu) {
  const list = (data.districts || []).slice(0, 5);
  if (!list.length) return `${esc(gu)}에서 상권 자료를 찾지 못했어요. 다른 지역으로 물어봐 주세요.`;
  const rank = list.map((d, i) => `<div class="assistant-fact"><span>${i + 1}위 · ${esc(d.type || '')}${d.dong ? ` · ${esc(d.dong)}` : ''}</span><b>${esc(d.name)}</b><span>${d.monthlySalesWon ? `월 ${(d.monthlySalesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : (d.population ? `유동 ${Math.round(d.population / 10000).toLocaleString('ko-KR')}만` : '')}</span></div>`).join('');
  const n = data.nearest;
  const cats = (n?.topCategories || []).slice(0, 3).map(c => `${esc(c.name)} ${(c.salesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`).join(' · ');
  return `🏪 <b>${esc(gu)}</b>에서 최근 매출이 큰 상권이에요.${n ? `<br><small>그중 1위는 <b>${esc(n.name)}</b>${n.type ? ` (${esc(n.type)})` : ''}이에요.</small>` : ''}<div class="assistant-facts">${rank}</div>${cats ? `<p class="assistant-conditions">${esc(n.name)} 주요 업종 · ${cats}</p>` : ''}<small>서울시 상권분석서비스(추정매출) · 상권 합계 기준이에요.</small><div class="assistant-chiprow">${list.slice(0, 3).map(d => `<button type="button" class="assistant-chip" data-commercial-district="${esc(d.name)} 상권">🏪 ${esc(d.name)} 매물</button>`).join('')}</div>`;
}

// 실제 매물 조건(지역·예산·면적·용도지역·역·도로 등)이 있을 때만 검색 로딩을 띄운다.
function needsSearch(message) {
  const t = String(message || '');
  return DISTRICTS.some(d => t.includes(d) || (d.endsWith('구') && d.length >= 3 && t.includes(d.slice(0, -1)))) ||
    /[가-힣A-Za-z0-9]{2,12}\s*역/.test(t) ||
    /\d+(?:\.\d+)?\s*(?:억|만원)/.test(t) ||
    /\d+(?:\.\d+)?\s*(?:평|㎡|m2|m²|제곱미터)/.test(t) ||
    /(?:주거지역|상업지역|공업지역|녹지지역)/.test(t) ||
    /도로\s*(?:폭)?\s*\d+/.test(t) ||
    /도보\s*\d+\s*분/.test(t) ||
    /(?:[가-힣]{1,5}[0-9]가|[가-힣]{1,6}동)(?=[\s,.]|이|에|은|는|쪽|근처|$)/.test(t) ||
    /(?:골목상권|전통시장|발달상권|관광특구)/.test(t) ||
    /(?:토지|땅|필지|건물|빌딩|상가|주택|근린|신축)/.test(t);
}

function cardMarkup(listing, hidden = false) {
  const station = listing.station ? `<span class="assistant-station">📍 ${esc(listing.station.name)}역 · 도보 약 ${listing.station.walkMin}분 · ${listing.station.distM}m</span>` : '';
  const commercial = listing.commercial ? `<span class="assistant-commercial">🏪 ${esc(listing.commercial.name)}${listing.commercial.type ? ` (${esc(listing.commercial.type)})` : ''}${listing.commercial.distM != null ? ` · ${listing.commercial.distM}m` : ''}</span>` : '';
  return `<article class="assistant-card${hidden ? ' is-hidden' : ''}" data-open="${esc(listing.id)}" data-origin="${esc(listing.origin)}">
    <div class="assistant-card-top"><span class="assistant-origin origin-${esc(listing.origin)}">${esc(originLabel(listing.origin))}</span><b>${money(listing.priceWon)}</b></div>
    <p class="assistant-card-address">${esc(listing.district)} ${esc(listing.neighborhood || '')} · ${esc(listing.address)}</p>
    <div class="assistant-card-meta"><span>대지 ${area(listing.areaM2)}</span><span>${esc(publicSale(listing.origin) ? (listing.auction?.usageName || originLabel(listing.origin)) : listing.kind === 'land' ? '토지' : listing.mainUse || '건물')}</span></div>${station}${commercial}
    ${publicSale(listing.origin) ? '' : `<button type="button" class="assistant-card-ask" data-ask="${esc(listing.id)}">이 매물 물어보기</button>`}
  </article>`;
}

// 선택한 매물에 대해 확인할 수 있는 고정 메뉴. 대장 자료는 상세페이지 안에서 연다.
function askMenuMarkup(listing) {
  const hasPnu = /^\d{19}$/.test(String(listing.pnu || ''));
  const item = (key, label, enabled, note) => `<button type="button" class="assistant-chip" data-ask-menu="${key}" ${enabled ? '' : 'disabled title="' + esc(note) + '"'}>${label}</button>`;
  return `<div class="assistant-askmenu">
    <div class="assistant-askmenu-head"><span class="assistant-origin origin-${esc(listing.origin)}">${esc(originLabel(listing.origin))}</span><b>${money(listing.priceWon)}</b><span>${esc(listing.district)} ${esc(listing.neighborhood || '')}</span></div>
    <p class="assistant-card-address">${esc(listing.address)}</p>
    <div class="assistant-chiprow">
      ${item('detail', '📋 상세페이지 보기', true, '')}
      ${item('station', '📍 역까지 거리', Boolean(listing.station), '역 거리를 확인할 수 없어요')}
      ${item('nearby', '📊 주변 실거래', true, '')}
      ${item('commercialInfo', '🏪 주변 상권 알려줘', true, '')}
      ${item('commercial', '🏪 이 상권에서 매물 찾기', Boolean(listing.commercial), '인근 상권 정보가 없어요')}
      ${item('zoning', '🗺️ 용도지역·규제', hasPnu, '필지 정보가 없어 확인할 수 없어요')}
      ${item('far', '📐 용적률·높이 기준', hasPnu, '필지 정보가 없어 확인할 수 없어요')}
      ${item('similar', '🔎 비슷한 매물 찾기', true, '')}
      ${item('analyze', '🏗️ 신축 검토하기', true, '')}
    </div>
    <p class="assistant-note">건축물대장·토지대장은 상세페이지에서 열 수 있어요.</p>
    ${hasPnu ? '' : '<p class="assistant-note">이 매물은 필지 고유번호가 없어 용도지역·규제를 확인할 수 없어요. 신축 검토에서 필지를 직접 선택할 수 있어요.</p>'}
  </div>`;
}

// 조건은 텍스트로만 보여주고, 수정은 '조건 바꾸기' 편집기에서 한 번에 한다.
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
  panel.id = 'assistant-panel'; panel.className = 'assistant-panel is-closed';
  panel.setAttribute('aria-label', 'AI 부동산 비서');
  panel.innerHTML = `<header class="assistant-head"><span class="assistant-avatar">${ROBOT}</span><div><b>AI 부동산 비서</b><small>매물 검색과 이용 안내를 도와드려요</small></div><button type="button" class="assistant-close" aria-label="비서 닫기">×</button></header>
    <div class="assistant-log" aria-live="polite"></div>
    <form class="assistant-form"><input name="message" type="text" autocomplete="off" maxlength="200" placeholder="예: 종로구 상업지역 100억 이하 도로 6m" aria-label="조건 입력"><button type="submit">전송</button></form>`;
  document.body.append(fab, panel);

  const log = panel.querySelector('.assistant-log');
  const input = panel.querySelector('input');
  const form = panel.querySelector('.assistant-form');
  let busy = false;
  let lastFilters = null;
  let selectedListing = null;
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  // 결과처럼 긴 메시지는 그 메시지의 맨 위부터 보이게 하고, 짧은 대화는 맨 아래로 내린다.
  const add = (html, cls = 'bot', anchorTop = false) => {
    const div = document.createElement('div');
    div.className = `assistant-msg ${cls}`;
    div.innerHTML = html;
    log.append(div);
    if (anchorTop) div.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else scroll();
    return div;
  };
  const addBot = html => add(html, 'bot');
  const addResultBot = html => add(html, 'bot', true);
  const addUser = text => add(esc(text), 'user');
  const signedIn = () => member.status === 'ready';

  // AI 비서는 회원(간편가입 포함) 전용이다. 비회원에게는 가입 안내만 보여준다.
  function lockedMarkup() {
    return `<div class="assistant-locked"><b>AI 부동산 비서는 회원 전용이에요</b>
      <p>로그인하거나 간편가입하면 자연어로 매물을 찾고, 찜한 매물과 저장 조건을 이어서 볼 수 있어요.</p>
      <button type="button" class="primary" data-assistant-login>3초 만에 시작하기</button></div>`;
  }
  function renderLocked() {
    log.replaceChildren();
    const bubble = addBot(lockedMarkup());
    bubble.querySelector('[data-assistant-login]')?.addEventListener('click', () => openLogin());
  }
  function refreshGate() {
    const locked = !signedIn();
    if (input) { input.disabled = locked; input.placeholder = locked ? '로그인 후 이용할 수 있어요' : '예: 종로구 상업지역 100억 이하 도로 6m'; }
    form?.querySelector('button')?.toggleAttribute('disabled', locked);
    if (locked) renderLocked();
  }

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
    if (!signedIn()) { renderLocked(); return; }
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
      if (key === 'detail') {
        scan.remove(); busy = false;
        openDetailFor(listing);
        return;
      }
      if (key === 'similar') {
        scan.remove(); busy = false;
        const filters = { districts: listing.district ? [listing.district] : undefined, kind: listing.kind, limit: 60 };
        if (listing.areaM2 > 0) { filters.minAreaM2 = Math.round(listing.areaM2 * 0.8); filters.maxAreaM2 = Math.round(listing.areaM2 * 1.2); }
        await runSearch(null, filters);
        return;
      }
      if (key === 'commercial') {
        // 상권 조건 검색은 AI 채팅에서만 제공한다. 상권 반경 안의 매물을 다시 찾는다.
        scan.remove(); busy = false;
        await runSearch(null, { commercialCode: listing.commercial.code, commercialRadiusM: 500, limit: 60 });
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
      } else if (key === 'commercialInfo') {
        const position = listing.position;
        const data = position && position.lat != null && position.lng != null
          ? await readJson(`/api/commercial?lat=${position.lat}&lng=${position.lng}&radius=500`) : null;
        html = data ? commercialChatMarkup(data) : '주변 상권 자료를 불러오지 못했어요.';
      } else if (key === 'zoning') {
        // 상세페이지와 같은 렌더러를 써서 구역·도로·지구단위계획 문장을 그대로 보여준다.
        const data = await readJson(`/api/site-context/${encodeURIComponent(listing.id)}`);
        if (!data) html = '구역과 도로 자료를 불러오지 못했어요.';
        else html = renderInlineContext(data) + `<div class="assistant-chiprow"><button type="button" class="assistant-chip assistant-chip-primary" data-ask-nav="detail">상세페이지에서 보기</button></div>`;
      } else if (key === 'far') {
        const data = await readJson(`/api/site-context/${encodeURIComponent(listing.id)}`);
        if (!data) html = '지구단위계획 용적률·높이 기준을 불러오지 못했어요.';
        else {
          const plans = (data.zones || []).find(z => z.id === 'district-plan')?.items || [];
          const summary = renderFarSummary(plans);
          html = summary
            ? `<p>이 필지가 속한 <b>지구단위계획 건축 기준</b>이에요.</p>${summary}<p class="assistant-note">구역 단위 기준이며, 해당 획지에 적용되는지는 고시·도면 확인이 필요해요.</p><div class="assistant-chiprow"><button type="button" class="assistant-chip assistant-chip-primary" data-ask-nav="detail">상세페이지에서 보기</button></div>`
            : '보유 자료에서 이 필지의 지구단위계획 용적률·높이 기준을 찾지 못했어요. 고시 원문과 도면 확인이 필요해요.';
        }
      } else html = '알 수 없는 요청이에요.';
      await settle();
      scan.remove();
      const bubble = addResultBot(html + `<div class="assistant-chiprow"><button type="button" class="assistant-chip" data-ask-back="1">↩ 다른 항목 물어보기</button></div>`);
      bubble.querySelector('[data-ask-back]')?.addEventListener('click', () => openAskMenu(listing));
      bubble.querySelector('[data-ask-nav="detail"]')?.addEventListener('click', () => openDetailFor(listing));
      const shopButton = bubble.querySelector('[data-ask-commercial]');
      shopButton?.addEventListener('click', () => runSearch(null, { commercialName: shopButton.dataset.askCommercial, commercialRadiusM: 500, limit: 60 }));
    } catch {
      scan.remove();
      addBot('자료를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { busy = false; }
  }

  // "마포구 상권 알려줘"처럼 지역 이름으로 상권을 묻는 질문에 답한다.
  async function answerCommercialDistrict(gu) {
    if (!signedIn()) { renderLocked(); return; }
    if (busy) return;
    busy = true;
    const scan = addBot(`<div class="assistant-scan"><span class="assistant-spinner"></span><b>${esc(gu)} 상권을 살펴보고 있어요…</b></div>`);
    try {
      const data = await readJson(`/api/commercial?gu=${encodeURIComponent(gu)}`);
      scan.remove();
      if (!data) { addBot(`${esc(gu)} 상권 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`); return; }
      const bubble = addResultBot(commercialDistrictMarkup(data, gu));
      bubble.querySelectorAll('[data-commercial-district]').forEach(button => button.addEventListener('click', () => runSearch(null, { commercialName: button.dataset.commercialDistrict, commercialRadiusM: 500, limit: 60 })));
    } catch {
      scan.remove();
      addBot('상권 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { busy = false; }
  }

  // 비서 결과를 그대로 상세 화면 소스로 넘겨 상세페이지를 연다.
  function openDetailFor(listing) {
    addBot(`📋 <b>${esc(listing.address)}</b> 상세페이지를 열었어요.`);
    onResults?.({ groups: [{ key: listing.id, pnu: listing.pnu, representative: listing, listings: [listing] }], total: 1, reply: `${listing.address} 상세페이지를 열었어요.` }, listing.id);
  }

  function openAskMenu(listing) {
    selectedListing = listing;
    const bubble = addBot(askMenuMarkup(listing));
    bubble.querySelectorAll('[data-ask-menu]').forEach(button => button.addEventListener('click', () => askAbout(button.dataset.askMenu, listing)));
  }

  const welcome = () => {
    if (!signedIn()) { renderLocked(); return; }
    const condition = savedCondition();
    addBot(`안녕하세요, AI 부동산 비서예요. 원하는 조건을 편하게 말해주세요. 터잡이 이용 방법도 물어볼 수 있어요.<br><small>예: "종로구 상업지역 100억 이하 50평 이상 도로 6m", "홍대입구역 도보 3분", "강남구 골목상권 월매출 5억 이상"</small>
      <div class="assistant-chiprow">
        <button type="button" class="assistant-chip" data-send="강남구 골목상권 월매출 5억 이상">🏪 골목상권 매출 5억 이상</button>
        <button type="button" class="assistant-chip" data-send="유동인구 30만 이상 발달상권">🏪 유동인구 많은 발달상권</button>
        <button type="button" class="assistant-chip" data-send="화랑대역 7번 상권">🏪 상권 이름으로 찾기</button>
      </div>
      <small>매물 카드에서 "이 매물 물어보기"를 누른 뒤 "이 주위 상권 알려줘"처럼 편하게 물어봐도 돼요.</small>`);
    if (condition && hasUsableFilters(condition)) addBot(`<p>저장하신 조건이 있어요.</p><p class="assistant-saved-condition">${esc(conditionLabel(condition))}</p><small>말씀하신 조건이 있으면 그 조건으로 먼저 찾아드려요.</small><div class="assistant-chiprow"><button type="button" class="assistant-chip" data-condition="1">이 조건으로 찾기</button></div>`);
  };

  function renderResult(body, data, openEditor) {
    const groups = mixGroups(Array.isArray(data.groups) ? data.groups : []);
    const cards = groups.map((group, index) => cardMarkup(group.representative, index >= 8)).join('');
    let reply = `<p>${esc(data.reply || '결과를 가져왔어요.').replace(/\n/g, '<br>')}</p>`;
    if (data.conditionNote) reply += `<p class="assistant-note">${esc(data.conditionNote)}</p>`;
    if (cards) reply += `<div class="assistant-cards">${cards}</div>`;
    if (groups.length > 8) reply += `<button type="button" class="assistant-chip assistant-more" data-more>더보기 (남은 ${groups.length - 8}건)</button>`;
    if (data.commercial) {
      const c = data.commercial;
      const sales = c.monthlySalesWon ? `${(c.monthlySalesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : '자료 없음';
      const pop = c.population ? `${Math.round(c.population / 10000).toLocaleString('ko-KR')}만` : '-';
      const cats = (c.topCategories || []).map(x => `${esc(x.name)} ${(x.salesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`).join(' · ');
      reply += `<div class="assistant-commercial-card"><div class="assistant-commercial-head"><b>🏪 ${esc(c.name)}</b><span>${esc(c.type || '')}${c.district ? ` · ${esc(c.district)}` : ''}</span></div><div class="assistant-facts"><div class="assistant-fact"><span>월 추정매출</span><b>${sales}</b></div><div class="assistant-fact"><span>유동인구</span><b>${pop}</b></div><div class="assistant-fact"><span>변화지표</span><b>${esc(c.changeIndex || '-')}</b></div></div>${cats ? `<p class="assistant-note">주요 업종 · ${cats}</p>` : ''}<p class="assistant-note">골목=생활권 · 발달=중심상권 · 전통시장 · 관광특구 · 서울시 상권분석서비스(추정매출)</p></div>`;
    }
    if (data.chips?.length) reply += `<p class="assistant-conditions">조건 · ${data.chips.map(c => esc(c.label)).join(' / ')}</p>`;
    if (data.unsupported) reply += `<p class="assistant-note">${esc(data.unsupported)}</p>`;
    const chips = [];
    if (groups.length) chips.push(`<button type="button" class="assistant-chip assistant-chip-primary" data-map="1">지도에서 보기</button>`);
    if (data.commercial) chips.push(`<button type="button" class="assistant-chip assistant-chip-primary" data-commercial="${esc(data.commercial.code)}">🏪 이 상권에서 매물 찾기</button>`);
    if (groups.length || data.chips?.length) chips.push(`<button type="button" class="assistant-chip" data-editor="1">조건 바꾸기</button>`);
    if (data.conditionNote) chips.push(`<button type="button" class="assistant-chip" data-condition="1">저장 조건으로 찾기</button>`);
    (data.suggestions || []).forEach(s => chips.push(`<button type="button" class="assistant-chip" data-send="${esc(s.message)}">${esc(s.label)}</button>`));
    if (chips.length) reply += `<div class="assistant-chiprow">${chips.join('')}</div>`;
    reply += `<div class="assistant-editor-slot" hidden></div>`;
    const bubble = addResultBot(reply);

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
    bubble.querySelector('[data-more]')?.addEventListener('click', event => {
      const hiddenCards = [...bubble.querySelectorAll('.assistant-card.is-hidden')];
      hiddenCards.slice(0, 5).forEach(card => card.classList.remove('is-hidden'));
      const remaining = bubble.querySelectorAll('.assistant-card.is-hidden').length;
      if (!remaining) event.currentTarget.remove();
      else event.currentTarget.textContent = `더보기 (남은 ${remaining}건)`;
    });
    const slot = bubble.querySelector('.assistant-editor-slot');
    bubble.querySelector('[data-commercial]')?.addEventListener('click', () => runSearch(null, { commercialCode: bubble.querySelector('[data-commercial]').dataset.commercial, commercialRadiusM: 500, limit: 60 }));
    const openEditorUi = () => {
      slot.hidden = false;
      slot.innerHTML = editorMarkup(lastFilters || {});
    };
    bubble.querySelector('[data-editor]')?.addEventListener('click', () => { slot.hidden ? openEditorUi() : (slot.hidden = true); slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    if (openEditor) openEditorUi();
    // 슬롯 내용이 매번 교체되므로 이벤트는 슬롯 한 곳에서 위임해 처리한다.
    slot.addEventListener('click', event => {
      if (event.target.closest('[data-editor-cancel]')) { slot.hidden = true; slot.innerHTML = ''; return; }
      const pick = event.target.closest('[data-pick]');
      if (pick) {
        const key = pick.dataset.pick, value = pick.dataset.value;
        // 유형(kind)은 값이 하나다. 배열로 넣으면 서버 sanitize에서 통째로 버려진다.
        if (key === 'kind') {
          if (lastFilters.kind === value) delete lastFilters.kind; else lastFilters.kind = value;
          openEditorUi();
          return;
        }
        const list = Array.isArray(lastFilters[key]) ? lastFilters[key] : (lastFilters[key] ? [lastFilters[key]] : []);
        const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
        if (next.length) lastFilters[key] = next; else delete lastFilters[key];
        openEditorUi();
        return;
      }
      const num = event.target.closest('[data-num]');
      if (num) {
        const key = num.dataset.num, value = Number(num.dataset.value);
        if (key === 'budgetWon') lastFilters.budgetWon = value * 1e8;
        else if (key === 'minAreaM2') lastFilters.minAreaM2 = Math.round(value * 3.305785);
        else lastFilters[key] = value;
        openEditorUi();
        return;
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
      if (!hasUsableFilters(lastFilters)) {
        addBot('조건을 하나 이상 선택해 주세요. 예) 지역·유형·예산 중 하나를 골라주세요.');
        return;
      }
      runSearch(null, lastFilters || {});
    });
  }

  async function runSearch(message, editedFilters) {
    if (!signedIn()) { renderLocked(); return; }
    if (busy) return;
    busy = true;
    if (message) addUser(message);
    // 새 검색을 시작하면 이전에 고른 매물 기준 질문 맥락은 끝난다.
    selectedListing = null;
    // 실제 매물 조건을 말했을 때만 검색 로딩을 보여준다. 인사·사이트 질문은 바로 답한다.
    const showScan = message ? needsSearch(message) : true;
    const started = Date.now();
    let scan = null;
    let bar = null;
    let timers = [];
    if (showScan) {
      scan = addBot(`<div class="assistant-scan"><span class="assistant-spinner"></span><b>AI 공간 분석 중…</b><ul class="assistant-steps"></ul><div class="assistant-bar"><i></i></div></div>`);
      const stepsEl = scan.querySelector('.assistant-steps');
      bar = scan.querySelector('.assistant-bar i');
      const interval = Math.floor(SCAN_MS * 0.9 / STEPS.length);
      timers = STEPS.map((text, i) => setTimeout(() => {
        stepsEl.insertAdjacentHTML('beforeend', `<li>${esc(text)}</li>`); scroll();
        if (bar) bar.style.width = `${Math.round(((i + 1) / STEPS.length) * 92)}%`;
      }, 250 + i * interval));
    }
    const condition = savedCondition();
    const payload = { message: message || '', condition, filters: editedFilters || undefined };
    try {
      const response = await apiFetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (showScan) {
        const wait = Math.max(0, SCAN_MS - (Date.now() - started));
        await new Promise(resolve => setTimeout(resolve, wait));
        if (bar) bar.style.width = '100%';
        timers.forEach(clearTimeout);
        scan.remove();
      }
      lastFilters = { ...(data.filters || {}) };
      renderResult(null, data, !message && Boolean(editedFilters));
    } catch {
      timers.forEach(clearTimeout); if (scan) scan.remove();
      addBot('매물 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { busy = false; }
  }

  panel.addEventListener('click', event => {
    if (event.target.closest('[data-condition]')) {
      const condition = savedCondition();
      if (condition && hasUsableFilters(condition)) runSearch(null, withAuction(condition));
      else addBot('저장된 조건이 없어요. 지역·예산 같은 조건을 말씀해 주세요.');
      return;
    }
    const chip = event.target.closest('[data-send]');
    if (chip) { runSearch(chip.dataset.send); return; }
    if (event.target.closest('.assistant-close')) { closePanel(); return; }
  });
  // 모바일에서 지도를 누르면 비서 창을 닫아 지도·목록을 온전히 본다.
  const onMapClick = () => { if (!isClosed() && matchMedia('(max-width:700px)').matches) closePanel(); };
  window.addEventListener('teojabi-map-click', onMapClick);
  function openPanel() {
    panel.classList.remove('is-closed');
    if (!signedIn()) renderLocked();
    else if (!log.childElementCount) welcome();
    // 자동으로 키보드를 띄우지 않는다. 입력창을 눌렀을 때만 키보드가 열린다.
  }
  const closePanel = () => { panel.classList.add('is-closed'); fab.classList.add('active'); };
  const isClosed = () => panel.classList.contains('is-closed');
  fab.addEventListener('click', () => {
    if (isClosed()) openPanel(); else closePanel();
  });
  // 로그인·가입을 마치면 잠금을 풀고 다시 시작한다.
  member.addEventListener('change', () => {
    refreshGate();
    if (signedIn() && log.querySelector('.assistant-locked')) { log.replaceChildren(); welcome(); }
  });
  refreshGate();
  panel.querySelector('.assistant-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    // 매물을 고른 상태의 상권·실거래·역 같은 질문은 그 매물 기준으로 바로 답한다.
    const question = selectedListing && !hasStrongCondition(value) ? listingQuestion(value) : null;
    if (question) { addUser(value); askAbout(question, selectedListing); return; }
    // 지역 상권을 묻는 질문이면 매물 검색 대신 상권을 요약해 답한다.
    if (isCommercialQuestion(value)) {
      addUser(value);
      const district = DISTRICTS.find(d => value.includes(d) || (d.endsWith('구') && d.length >= 3 && value.includes(d.slice(0, -1))));
      if (district) answerCommercialDistrict(district);
      else if (/뭐|무엇|뜻|의미|종류|차이|설명/.test(value)) addBot('상권은 사람들이 모여 장사하는 범위를 뜻해요. 터잡이는 서울시 상권분석서비스 자료로 골목상권·발달상권·전통시장·관광특구를 구분해, 그 안의 매물과 월 추정매출·유동인구를 보여드려요.<br><small>어느 지역이나 매물이 궁금하세요? "마포구 상권 알려줘"처럼 물어보세요.</small>');
      else addBot('어느 지역 상권이 궁금하세요? 예) "마포구 상권 알려줘", "강남구 상권 알려줘"처럼 지역을 말씀해 주세요.');
      return;
    }
    runSearch(value);
  });
  return { open: openPanel, close: closePanel, ask: message => { openPanel(); runSearch(message); }, destroy: () => { window.removeEventListener('teojabi-map-click', onMapClick); fab.remove(); panel.remove(); } };
}
