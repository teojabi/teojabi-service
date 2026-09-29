import { computeTeojabiScore } from './score-policy.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stars = score => `<span class="score-stars" style="--score:${score}" role="img" aria-label="5점 만점에 ${score}점"><span class="score-stars-base" aria-hidden="true">★★★★★</span><span class="score-stars-fill" aria-hidden="true">★★★★★</span></span>`;

function metricRow(m) {
  return `<li class="score-metric${m.available ? '' : ' is-missing'}"><div class="score-metric-head"><span>${esc(m.label)}</span><b>${m.score != null ? m.score : '자료 없음'}</b></div><small>${esc(m.evidence || '')}</small></li>`;
}
function categoryBlock(c) {
  const head = c.score != null ? `${stars(c.score)}<span class="score-cat-value">${c.score}</span>` : '<span class="score-cat-none">자료 없음</span>';
  const weight = c.effectiveWeight ? `<span class="score-cat-weight">${c.effectiveWeight}%</span>` : '';
  return `<div class="score-cat${c.included ? '' : ' is-missing'}"><div class="score-cat-head"><b>${esc(c.label)}</b>${weight}<span class="score-cat-right">${head}</span></div><ul class="score-metrics">${c.metrics.map(metricRow).join('')}</ul></div>`;
}
const LEGEND = `<div class="score-legend"><p class="score-legend-title">계산 기준</p><ul><li>가격 35% · 개발 여력 40% · 입지·상권 25% (자료 없는 항목은 제외하고 재계산)</li><li>가격: 5층 이상 건물은 연면적, 그 외(토지·저층 건물)는 대지면적 기준 평당가를 주변 실거래 중위값과 비교. 과거 거래는 공시지가 변동폭으로 현재 시점으로 환산하고, 공시지가 배수는 참고 표시(점수 미반영)</li><li>개발 여력: 여유 용적률 · 도로폭 · 건폐율(지구단위계획·용도지역 법정) · 구역·특구·재개발</li><li>입지·상권: 최근접 지하철역 · 상권 · 주변 개발</li></ul></div>`;
function bodyMarkup(result, authed) {
  const cats = result.categories.map(categoryBlock).join('');
  const note = `<p class="score-note">${esc(result.note)}</p>`;
  if (authed) return `<div class="score-body">${LEGEND}${cats}${note}</div>`;
  return `<div class="score-body score-body-locked"><div class="score-blur" aria-hidden="true">${LEGEND}${cats}</div><div class="score-lock"><p>로그인하면 <b>점수 근거</b>를 자세히 볼 수 있어요.</p><button type="button" class="primary" data-score-login>로그인·회원가입</button></div></div>`;
}
function cardMarkup(result, authed) {
  if (result.status === 'pending') return '<div class="teojabi-score is-pending"><span class="score-pending">터잡이 점수를 계산하고 있어요…</span></div>';
  if (result.status !== 'ready') return '<div class="teojabi-score is-pending"><span class="score-pending">평가 자료가 부족해 점수를 산정하지 못했어요.</span></div>';
  return `<div class="teojabi-score"><button type="button" class="score-toggle" data-score-toggle aria-expanded="false">${stars(result.score)}<b class="score-value">${result.score}</b><span class="score-grade">${esc(result.grade)}</span><span class="score-title">터잡이 점수</span><span class="score-more">근거 보기</span></button>${bodyMarkup(result, authed)}</div>`;
}

// 상세 화면의 점수 카드. 데이터가 도착할 때마다 다시 계산해 그린다.
export function createScoreCard({ host, listing, authed, onLogin } = {}) {
  if (!host) return { setContext() {}, setCommercial() {}, setSurrounding() {}, setNearby() {}, setOfficial() {}, dispose() {} };
  let context = null, commercial = null, surrounding = null, nearby = null, official = null, closed = false, timer = null, expanded = false;
  const render = () => {
    if (closed || !host || !host.isConnected) return;
    const result = computeTeojabiScore({ listing, context, nearby, commercial, surrounding, official });
    host.innerHTML = cardMarkup(result, authed);
    const body = host.querySelector('.score-body');
    if (body) body.hidden = !expanded;
    const toggle = host.querySelector('[data-score-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
  };
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(render, 120); };
  const onClick = e => {
    if (e.target.closest('[data-score-login]')) { e.preventDefault(); onLogin?.(); return; }
    if (e.target.closest('[data-score-toggle]')) { expanded = !expanded; render(); }
  };
  render();
  host.addEventListener('click', onClick);
  return {
    setContext: v => { context = v; schedule(); },
    setCommercial: v => { commercial = v; schedule(); },
    setSurrounding: v => { surrounding = v; schedule(); },
    setNearby: v => { nearby = v; schedule(); },
    setOfficial: v => { official = v; schedule(); },
    dispose: () => { closed = true; if (timer) clearTimeout(timer); host.removeEventListener('click', onClick); },
  };
}
