import { DISTRICTS } from './policy.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const AUCTION_USAGE_OPTIONS = Object.freeze([
  ['', '용도 전체'],
  ['상가', '상가'],
  ['근린시설', '근린시설'],
  ['오피스텔', '오피스텔'],
  ['업무', '업무시설'],
  ['단독주택', '단독주택'],
  ['다가구', '다가구주택'],
  ['다세대', '다세대'],
  ['연립주택', '연립주택'],
  ['빌라', '빌라'],
  ['대지', '대지'],
  ['임야', '임야'],
]);

export const AUCTION_SORT_OPTIONS = Object.freeze([
  ['sale', '기일 임박순'],
  ['price', '최저가 낮은순'],
  ['price_desc', '최저가 높은순'],
  ['fail', '유찰 많은순'],
  ['area', '면적 큰순'],
]);

// 경매 전용 조건바. 건물찾기의 퀵필터와 같은 자리에 들어가 같은 조작감을 준다.
// 지역은 매물과 동일하게 여러 구를 함께 선택할 수 있다.
export function mountAuctionFilters(root, { getValue, onChange } = {}) {
  const abort = new AbortController();
  root.innerHTML = `<div class="auction-filter-row">
    <div class="auction-gu-field"><span class="auction-filter-label">지역 <small>여러 개 선택</small></span><div class="zone-choices auction-gu-choices">${DISTRICTS.map(d => `<label><input type="checkbox" name="gu" value="${esc(d)}"><span>${esc(d)}</span></label>`).join('')}</div></div>
    <label><span>용도</span><select name="usage">${AUCTION_USAGE_OPTIONS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select></label>
    <label><span>정렬</span><select name="sort">${AUCTION_SORT_OPTIONS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select></label>
    <label><span>최저가 이하</span><input name="maxPrice" type="number" inputmode="numeric" step="0.1" min="0" placeholder="예: 10 (억)"></label>
    <label><span>유찰 이하</span><input name="failMax" type="number" inputmode="numeric" step="1" min="0" placeholder="예: 2 (회)"></label>
    <button type="button" class="outline auction-filter-reset" data-auction-reset>조건 초기화</button>
  </div>
  <p class="auction-filter-note">법원경매정보 공시 물건 · 아파트 제외 · 권리분석·입찰가 판단은 제공하지 않아요.</p>`;
  const form = root.querySelector('.auction-filter-row');
  function read() {
    const value = getValue() || {};
    const gus = Array.isArray(value.gu) ? value.gu : [];
    form.querySelectorAll('[name=gu]').forEach(input => { input.checked = gus.includes(input.value); });
    form.querySelector('[name=usage]').value = value.usage || '';
    form.querySelector('[name=sort]').value = value.sort || 'sale';
    form.querySelector('[name=maxPrice]').value = value.maxPrice || '';
    form.querySelector('[name=failMax]').value = value.failMax || '';
  }
  function emit() {
    const data = new FormData(form);
    onChange({
      gu: data.getAll('gu').map(String).filter(Boolean),
      usage: String(data.get('usage') || ''),
      sort: String(data.get('sort') || 'sale'),
      maxPrice: String(data.get('maxPrice') || '').trim(),
      failMax: String(data.get('failMax') || '').trim(),
    });
  }
  form.addEventListener('change', emit, { signal: abort.signal });
  form.addEventListener('input', event => { if (event.target.matches('input[type=number]')) { clearTimeout(root._t); root._t = setTimeout(emit, 400); } }, { signal: abort.signal });
  root.addEventListener('click', event => { if (event.target.closest('[data-auction-reset]')) { form.querySelectorAll('[name=gu]').forEach(input => { input.checked = false; }); form.querySelector('[name=usage]').value = ''; form.querySelector('[name=sort]').value = 'sale'; form.querySelector('[name=maxPrice]').value = ''; form.querySelector('[name=failMax]').value = ''; read(); emit(); } }, { signal: abort.signal });
  read();
  return { update: read, destroy() { clearTimeout(root._t); abort.abort(); } };
}
