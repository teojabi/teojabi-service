import { computeTeojabiScore } from './score-policy.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stars = score => `<span class="score-stars" style="--score:${score}" role="img" aria-label="5점 만점에 ${score}점"><span class="score-stars-base" aria-hidden="true">★★★★★</span><span class="score-stars-fill" aria-hidden="true">★★★★★</span></span>`;

function metricRow(m) {
  return `<li class="score-metric${m.available ? '' : ' is-missing'}"><div class="score-metric-head"><span>${esc(m.label)}</span><b>${m.score != null ? m.score : '자료 없음'}</b></div><small>${esc(m.evidence || '')}</small></li>`;
}
function categoryBlock(c) {
  const head = c.score != null ? `${stars(c.score)}<span class="score-cat-value">${c.score}</span>` : '<span class="score-cat-none">자료 없음</span>';
  return `<div class="score-cat"><div class="score-cat-head"><b>${esc(c.label)}</b><span class="score-cat-right">${head}</span></div><ul class="score-metrics">${c.metrics.map(metricRow).join('')}</ul></div>`;
}
function bodyMarkup(result, authed) {
  const cats = result.categories.map(categoryBlock).join('');
  const note = `<p class="score-note">${esc(result.note)}</p>`;
  if (authed) return `<div class="score-body">${cats}${note}</div>`;
  return `<div class="score-body score-body-locked"><div class="score-blur" aria-hidden="true">${cats}</div><div class="score-lock"><p>로그인하면 <b>점수 근거</b>를 자세히 볼 수 있어요.</p><button type="button" class="primary" data-score-login>로그인·회원가입</button></div></div>`;
}
function cardMarkup(result, authed) {
  if (result.status === 'pending') return '<div class="teojabi-score is-pending"><span class="score-pending">터잡이 점수를 계산하고 있어요…</span></div>';
  if (result.status !== 'ready') return '<div class="teojabi-score is-pending"><span class="score-pending">평가 자료가 부족해 점수를 산정하지 못했어요.</span></div>';
  return `<div class="teojabi-score"><button type="button" class="score-toggle" data-score-toggle aria-expanded="false">${stars(result.score)}<b class="score-value">${result.score}</b><span class="score-grade">${esc(result.grade)}</span><span class="score-title">터잡이 점수</span><span class="score-more">근거 보기</span></button>${bodyMarkup(result, authed)}</div>`;
}

// 상세 화면의 점수 카드. 데이터가 도착할 때마다 다시 계산해 그린다.
export function createScoreCard({ host, listing, authed, onLogin } = {}) {
  if (!host) return { setContext() {}, setCommercial() {}, setSurrounding() {}, setNearby() {}, dispose() {} };
  let context = null, commercial = null, surrounding = null, nearby = null, closed = false, timer = null, expanded = false;
  const render = () => {
    if (closed || !host || !host.isConnected) return;
    const result = computeTeojabiScore({ listing, context, nearby, commercial, surrounding });
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
    dispose: () => { closed = true; if (timer) clearTimeout(timer); host.removeEventListener('click', onClick); },
  };
}
