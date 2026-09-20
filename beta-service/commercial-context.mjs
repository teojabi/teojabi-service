import { apiFetch } from './api-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eok = won => Number(won) > 0 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : null;
const man = n => Number(n) > 0 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : null;

// 상권 검색은 AI 비서에서만 제공한다. 카드 버튼은 비서에게 메시지를 보내는 이벤트를 띄운다.
export function commercialAsk(message) {
  window.dispatchEvent(new CustomEvent('teojabi-ask', { detail: String(message || '') }));
}

function metrics(area) {
  const items = [];
  const sales = eok(area.monthlySalesWon);
  if (sales) items.push(`<span>월 추정매출 <b>${sales}</b></span>`);
  const population = man(area.population);
  if (population) items.push(`<span>유동인구 <b>${population}</b></span>`);
  if (area.changeIndex) items.push(`<span>변화지표 <b>${esc(area.changeIndex)}</b></span>`);
  return items.length ? `<div class="commercial-metrics">${items.join('')}</div>` : '';
}

function categories(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const text = list.map(c => `${esc(c.name)} ${eok(c.salesWon) || ''}`.trim()).join(' · ');
  return `<p class="commercial-cats">주요 업종 · ${text}</p>`;
}

export function renderCommercial(data) {
  if (!data || data.status !== 'ready' || !data.nearest) {
    return '<p class="case-note">반경 안에서 연결되는 상권 자료를 찾지 못했어요.</p>';
  }
  const n = data.nearest;
  const others = (data.districts || []).filter(d => d.code !== n.code).slice(0, 4);
  const near = n.distanceM != null ? `<span class="commercial-distance">${n.distanceM}m</span>` : '';
  const otherRows = others.map(d => {
    const sales = eok(d.monthlySalesWon);
    return `<li><b>${esc(d.name)}</b><span>${esc(d.type || '')}${d.distanceM != null ? ` · ${d.distanceM}m` : ''}${sales ? ` · 월 ${sales}` : ''}</span></li>`;
  }).join('');
  return `<div class="commercial-card">
    <div class="commercial-head"><span class="commercial-icon" aria-hidden="true">🏪</span><div><b>${esc(n.name)}</b><small>${esc(n.type || '')}${n.gu ? ` · ${esc(n.gu)}` : ''}</small></div>${near}</div>
    ${metrics(n)}
    ${categories(n.topCategories)}
    <button type="button" class="outline commercial-ask" data-commercial-ask="${esc(n.name)} 상권">이 상권에서 매물 찾기</button>
  </div>
  ${otherRows ? `<div class="commercial-others"><p class="commercial-others-title">반경 안 다른 상권</p><ul>${otherRows}</ul></div>` : ''}
  <p class="commercial-source">서울시 상권분석서비스 · 기준 ${esc(data.basis?.quarter || '')} · 상권 대표점 기준</p>`;
}

export function commercialPopupMarkup(area) {
  return `<div class="commercial-popup-inner">
    <button type="button" class="commercial-popup-close" data-commercial-close aria-label="닫기">×</button>
    <b>${esc(area.name)}</b>
    <small>${esc(area.type || '')}${area.gu ? ` · ${esc(area.gu)}` : ''}</small>
    ${metrics(area)}
    <button type="button" class="outline commercial-ask" data-commercial-ask="${esc(area.name)} 상권">이 상권에서 매물 찾기</button>
  </div>`;
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
