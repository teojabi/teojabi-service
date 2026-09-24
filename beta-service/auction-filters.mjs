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

// 경매 전용 조건바. 지역은 버튼으로 열고 닫으며 여러 구를 함께 선택할 수 있다.
// 조건을 고른 뒤 '이 조건으로 검색하기'를 눌러 조회한다.
export function mountAuctionFilters(root, { getValue, onChange } = {}) {
  const abort = new AbortController();
  root.innerHTML = `<div class="auction-filter-row">
    <div class="auction-gu-field">
      <button type="button" class="outline auction-gu-toggle" data-auction-gu-toggle aria-expanded="false">지역 선택 <span data-auction-gu-count></span></button>
      <div class="zone-choices auction-gu-choices" hidden>${DISTRICTS.map(d => `<label><input type="checkbox" name="gu" value="${esc(d)}"><span>${esc(d)}</span></label>`).join('')}</div>
    </div>
    <label><span>용도</span><select name="usage">${AUCTION_USAGE_OPTIONS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select></label>
    <label><span>정렬</span><select name="sort">${AUCTION_SORT_OPTIONS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select></label>
    <label><span>최저가 이하</span><input name="maxPrice" type="number" inputmode="numeric" step="0.1" min="0" placeholder="예: 10 (억)"></label>
    <label><span>유찰 이하</span><input name="failMax" type="number" inputmode="numeric" step="1" min="0" placeholder="예: 2 (회)"></label>
    <button type="button" class="primary auction-filter-apply" data-auction-apply>이 조건으로 검색하기</button>
    <button type="button" class="outline auction-filter-reset" data-auction-reset>조건 초기화</button>
  </div>
  <p class="auction-filter-note">법원경매정보 공시 물건 · 아파트 제외 · 권리분석·입찰가 판단은 제공하지 않아요.</p>`;
  const form = root.querySelector('.auction-filter-row');
  const guBox = root.querySelector('.auction-gu-choices');
  const guToggle = root.querySelector('[data-auction-gu-toggle]');
  const guCount = root.querySelector('[data-auction-gu-count]');
  function selectedGus() { return [...form.querySelectorAll('[name=gu]:checked')].map(input => input.value); }
  function updateGuCount() { const n = selectedGus().length; guCount.textContent = n ? `(${n})` : ''; }
  function read() {
    const value = getValue() || {};
    const gus = Array.isArray(value.gu) ? value.gu : [];
    form.querySelectorAll('[name=gu]').forEach(input => { input.checked = gus.includes(input.value); });
    form.querySelector('[name=usage]').value = value.usage || '';
    form.querySelector('[name=sort]').value = value.sort || 'sale';
    form.querySelector('[name=maxPrice]').value = value.maxPrice || '';
    form.querySelector('[name=failMax]').value = value.failMax || '';
    updateGuCount();
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
  root.addEventListener('click', event => {
    if (event.target.closest('[data-auction-gu-toggle]')) {
      const open = guBox.hidden; guBox.hidden = !open; guToggle.setAttribute('aria-expanded', String(open));
      return;
    }
    if (event.target.closest('[data-auction-apply]')) { emit(); return; }
    if (event.target.closest('[data-auction-reset]')) {
      form.querySelectorAll('[name=gu]').forEach(input => { input.checked = false; });
      form.querySelector('[name=usage]').value = ''; form.querySelector('[name=sort]').value = 'sale';
      form.querySelector('[name=maxPrice]').value = ''; form.querySelector('[name=failMax]').value = '';
      read(); emit(); return;
    }
  }, { signal: abort.signal });
  form.addEventListener('change', event => { if (event.target.matches('[name=gu]')) updateGuCount(); }, { signal: abort.signal });
  read();
  return { update: read, destroy() { abort.abort(); } };
}
