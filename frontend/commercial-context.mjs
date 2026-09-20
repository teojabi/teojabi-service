import { apiFetch } from './api-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eok = won => Number(won) > 0 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : null;
const man = n => Number(n) > 0 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : null;
const pct = v => Math.abs(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const arrow = v => v > 0 ? '▲' : v < 0 ? '▼' : '–';

// 상권 검색은 AI 비서에서만 제공한다. 카드 버튼은 비서에게 메시지를 보내는 이벤트를 띄운다.
export function commercialAsk(message) {
  window.dispatchEvent(new CustomEvent('teojabi-ask', { detail: String(message || '') }));
}

// 의존성 없는 가로 막대. value 는 최대값 대비 길이, display 는 오른쪽 라벨.
function bars(items) {
  const max = Math.max(...items.map(i => Number(i.value) || 0), 1);
  return `<div class="commercial-bars">${items.map(i => {
    const width = Math.max(2, Math.round((Number(i.value) || 0) / max * 100));
    return `<div class="commercial-bar${i.current ? ' is-current' : ''}"><span class="commercial-bar-label" title="${esc(i.label)}">${esc(i.label)}</span><span class="commercial-bar-track"><i style="width:${width}%"></i></span><b>${esc(i.display)}</b></div>`;
  }).join('')}</div>`;
}

// 분기별 세로 막대. 값은 억 단위 정수, 라벨은 24Q3 형식.
function columns(items) {
  const max = Math.max(...items.map(i => Number(i.value) || 0), 1);
  const last = items.length - 1;
  return `<div class="commercial-columns">${items.map((i, idx) => {
    const height = Math.max(3, Math.round((Number(i.value) || 0) / max * 100));
    const value = Number(i.value) > 0 ? Math.round(Number(i.value) / 1e8) : '';
    return `<div class="commercial-col${idx === last ? ' is-current' : ''}" title="${esc(i.label)} ${eok(i.value) || '자료 없음'}"><b>${value}</b><span class="commercial-col-track"><i class="commercial-col-bar" style="height:${height}%"></i></span><small>${esc(i.label)}</small></div>`;
  }).join('')}</div>`;
}

function halfYearTrend(trend) {
  const groups = new Map();
  for (const item of trend || []) {
    const q = String(item.quarter || '');
    const year = q.slice(0, 4), qn = Number(q.slice(4)) || 0;
    if (!year || !qn) continue;
    const key = `${year}-${qn <= 2 ? 1 : 2}`;
    groups.set(key, (groups.get(key) || 0) + (Number(item.salesWon) || 0));
  }
  return [...groups.entries()].map(([key, value]) => {
    const [year, half] = key.split('-');
    return { label: `${year} ${half === '1' ? '상반기' : '하반기'}`, value };
  }).slice(-4);
}

function quarterTrend(trend) {
  return (trend || []).map(item => {
    const q = String(item.quarter || '');
    return { quarter: q, label: q.length === 5 ? `${q.slice(2, 4)}Q${q.slice(4)}` : q, value: Number(item.salesWon) || 0 };
  }).slice(-9);
}

function halfTrendMarkup(trend) {
  const groups = halfYearTrend(trend);
  if (groups.length < 2) return '';
  const items = groups.map((g, i) => ({ label: g.label, value: g.value, display: eok(g.value) || '자료 없음', current: i === groups.length - 1 }));
  let change = '';
  if (groups.length >= 3) {
    const last = groups[groups.length - 1], prev = groups[groups.length - 3];
    if (prev.value > 0) change = `<p class="commercial-change">${esc(last.label)} · 전년동기 대비 ${arrow(last.value - prev.value)} ${pct((last.value - prev.value) / prev.value * 100)}%</p>`;
  }
  return `<p class="commercial-block-title">매출 추이 · 반기별 (상권 합계)</p>${bars(items)}${change}`;
}

function quarterTrendMarkup(trend) {
  const items = quarterTrend(trend);
  if (items.length < 2) return '';
  let change = '';
  if (items.length >= 5) {
    const last = items[items.length - 1], prev = items[items.length - 5];
    if (prev.value > 0) change = `<p class="commercial-change">${esc(last.label)} · 전년동기 대비 ${arrow(last.value - prev.value)} ${pct((last.value - prev.value) / prev.value * 100)}%</p>`;
  }
  return `<p class="commercial-block-title">분기별 월 추정매출 (상권 합계, 억원)</p>${columns(items)}${change}`;
}

function metrics(area, { sales = true } = {}) {
  const items = [];
  if (sales) { const s = eok(area.monthlySalesWon); if (s) items.push(`<span>월 추정매출 <b>${s}</b></span>`); }
  const population = man(area.population);
  if (population) items.push(`<span>유동인구 <b>${population}</b></span>`);
  if (area.changeIndex) items.push(`<span>변화지표 <b>${esc(area.changeIndex)}</b></span>`);
  return items.length ? `<div class="commercial-metrics">${items.join('')}</div>` : '';
}

export function renderCommercial(data, { trend = 'half', nearby = true } = {}) {
  if (!data || data.status !== 'ready' || !data.nearest) {
    return '<p class="case-note">반경 안에서 연결되는 상권 자료를 찾지 못했어요.</p>';
  }
  const n = data.nearest;
  const total = Number(n.monthlySalesWon) || 0;
  const catBars = (n.topCategories || []).map(c => ({
    label: c.name,
    value: Number(c.salesWon) || 0,
    display: `${eok(c.salesWon) || '-'}${total ? ` · ${Math.round((Number(c.salesWon) || 0) / total * 100)}%` : ''}`,
  }));
  const cmpBars = (data.districts || []).map(d => ({
    label: d.name,
    value: Number(d.monthlySalesWon) || 0,
    display: eok(d.monthlySalesWon) || '자료 없음',
    current: d.code === n.code,
  }));
  const near = n.distanceM != null ? `<span class="commercial-distance">${n.distanceM}m</span>` : '';
  const trendBlock = trend === 'quarter' ? quarterTrendMarkup(n.trend) : halfTrendMarkup(n.trend);
  return `<div class="commercial-card">
    <div class="commercial-head"><span class="commercial-icon" aria-hidden="true">🏪</span><div><b>${esc(n.name)}</b><small>${esc(n.type || '')}${n.gu ? ` · ${esc(n.gu)}` : ''}</small></div>${near}</div>
    ${metrics(n, { sales: trend !== 'quarter' })}
    ${catBars.length ? `<p class="commercial-block-title">주요 업종 · 이 상권 매출 비중</p>${bars(catBars)}` : ''}
    ${trendBlock}
    ${nearby && cmpBars.length ? `<p class="commercial-block-title">반경 안 상권 월 추정매출 · 상권별 합계</p>${bars(cmpBars)}` : ''}
    <button type="button" class="outline commercial-ask" data-commercial-ask="${esc(n.name)} 상권">이 상권에서 매물 찾기</button>
  </div>
  <p class="commercial-source">월 추정매출은 상권 하나의 합계(모든 업종)예요 · 서울시 상권분석서비스 · 기준 ${esc(data.basis?.quarter || '')} · 대표점 기준</p>`;
}

export function mountCommercial(host, listing) {
  const position = listing?.position;
  if (!position || position.lat == null || position.lng == null) {
    host.innerHTML = '<p class="case-note">매물 위치를 확인할 수 없어 상권을 조회하지 못했어요.</p>';
    return () => {};
  }
  let cancelled = false;
  host.innerHTML = '<p class="case-note">반경 500m 상권을 확인하고 있어요.</p>';
  apiFetch(`/api/commercial?lat=${position.lat}&lng=${position.lng}&radius=500`)
    .then(response => response.json())
    .then(data => { if (!cancelled) host.innerHTML = renderCommercial(data); })
    .catch(() => { if (!cancelled) host.innerHTML = '<p class="case-note">상권 자료를 불러오지 못했어요.</p>'; });
  return () => { cancelled = true; };
}
