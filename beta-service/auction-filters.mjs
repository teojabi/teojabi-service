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

const CHIPS = [['listingSource', '구분'], ['districts', '지역'], ['usage', '용도'], ['dealType', '거래 단위'], ['maxPrice', '최저매각가'], ['maxBidRate', '최저가율'], ['failMax', '유찰'], ['sort', '정렬']];
const DEAL_LABEL = { whole: '건물 통', unit: '호실', land: '토지' };
const LISTING_LABEL = { court: '경매', onbid: '공매' };
const emptyDraft = () => ({ listingSource: 'court', gu: [], usage: '', dealType: '', sort: 'sale', maxPrice: '', maxBidRate: '', failMax: '' });

// 경매 조건 UI. 건물찾기(매물) 퀵필터와 같은 칩 + 편집 패널 구조.
// 칩에는 조건 이름이 함께 보이고, 아래 '이 조건으로 검색하기'로 조회한다.
export function mountAuctionFilters(root, { getValue, onChange } = {}) {
  const abort = new AbortController();
  const initial = getValue() || {};
  let active = null, draft = { ...emptyDraft(), ...initial, gu: [...(initial.gu || [])] };
  root.innerHTML = `<div class="quick-chip-row" role="group" aria-label="경매 조건 바로 설정">${CHIPS.map(([key, label]) => `<button type="button" class="pill quick-chip" data-auction-chip="${key}" aria-expanded="false" aria-controls="auction-filter-editor"><span class="quick-chip-label">${label}</span><span data-auction-value></span><span class="quick-chevron" aria-hidden="true">⌄</span></button>`).join('')}</div><div class="auction-filter-actions"><button type="button" class="primary" data-auction-apply>이 조건으로 검색하기</button><button type="button" class="outline" data-auction-reset>조건 초기화</button></div><section class="quick-filter-editor" id="auction-filter-editor" hidden aria-labelledby="auction-filter-title"><div class="quick-filter-head"><div><h2 id="auction-filter-title"></h2><p>조건을 고른 뒤 위 버튼을 눌러 찾아요.</p></div><button type="button" class="quick-close" data-auction-close aria-label="조건 편집 닫기">×</button></div><div class="quick-filter-content"></div></section><p class="auction-filter-note">법원경매정보 공시 물건 · 아파트 제외 · 권리분석·입찰가 판단은 제공하지 않아요.</p>`;
  const $ = selector => root.querySelector(selector), panel = $('.quick-filter-editor');
  function update() {
    const texts = {
      listingSource: LISTING_LABEL[draft.listingSource] || '경매',
      districts: draft.gu.length ? draft.gu.join(' · ') : '서울 전체',
      usage: draft.usage || '용도 전체',
      dealType: DEAL_LABEL[draft.dealType] || '전체',
      maxPrice: draft.maxPrice ? `${draft.maxPrice}억 이하` : '제한 없음',
      maxBidRate: draft.maxBidRate ? `${draft.maxBidRate}% 이하` : '제한 없음',
      failMax: (draft.failMax !== '' && draft.failMax != null) ? `${draft.failMax}회 이하` : '제한 없음',
      sort: (AUCTION_SORT_OPTIONS.find(s => s[0] === (draft.sort || 'sale')) || [])[1] || '기일 임박순',
    };
    for (const chip of root.querySelectorAll('[data-auction-chip]')) {
      const key = chip.dataset.auctionChip;
      chip.querySelector('[data-auction-value]').textContent = texts[key] || '';
      chip.setAttribute('aria-expanded', String(active === key));
    }
  }
  const choice = (group, value, label) => `<button type="button" class="quick-choice" data-auction-choice="${group}" data-value="${esc(value)}" aria-pressed="false">${esc(label)}</button>`;
  function syncChoices() {
    for (const button of root.querySelectorAll('[data-auction-choice]')) {
      const group = button.dataset.auctionChoice, value = button.dataset.value;
      const on = group === 'listingSource' ? String(draft.listingSource || 'court') === value
        : group === 'districts' ? (value === '' ? !draft.gu.length : draft.gu.includes(value))
        : group === 'usage' ? String(draft.usage || '') === value
        : group === 'dealType' ? String(draft.dealType || '') === value
        : group === 'sort' ? String(draft.sort || 'sale') === value
        : group === 'failMax' ? String(draft.failMax ?? '') === value : false;
      button.setAttribute('aria-pressed', String(Boolean(on)));
    }
  }
  function renderEditor() {
    const key = active; let html = '';
    if (key === 'listingSource') html = `<p class="quick-help">법원경매와 온비드 공매를 구분해 볼 수 있어요.</p><div class="quick-choice-grid">${choice('listingSource', 'court', '경매(법원)')}${choice('listingSource', 'onbid', '공매(온비드)')}</div>`;
    if (key === 'districts') html = `<p class="quick-help">여러 지역을 함께 선택할 수 있어요.</p><div class="quick-choice-grid quick-districts">${choice('districts', '', '서울 전체')}${DISTRICTS.map(d => choice('districts', d, d)).join('')}</div>`;
    if (key === 'usage') html = `<div class="quick-choice-grid quick-purposes">${AUCTION_USAGE_OPTIONS.map(([value, label]) => choice('usage', value, label)).join('')}</div>`;
    if (key === 'dealType') html = `<p class="quick-help">건물 전체가 나온 물건과 호실 단위 물건을 구분해 볼 수 있어요.</p><div class="quick-choice-grid">${choice('dealType', '', '전체')}${choice('dealType', 'whole', '건물 통')}${choice('dealType', 'unit', '호실')}${choice('dealType', 'land', '토지')}</div>`;
    if (key === 'maxPrice') html = `<p class="quick-help">최저매각가 기준이에요.</p><label class="quick-number-label" for="auction-max-price">최저매각가 직접 입력 <span>억원 이하</span></label><input id="auction-max-price" class="quick-number" inputmode="decimal" autocomplete="off" placeholder="예: 10" value="${esc(draft.maxPrice || '')}">`;
    if (key === 'maxBidRate') html = `<p class="quick-help">감정가 대비 최저매각가 비율이에요. 낮을수록 낮은 가격에 나온 물건이에요.</p><label class="quick-number-label" for="auction-max-rate">최저가율 직접 입력 <span>% 이하</span></label><input id="auction-max-rate" class="quick-number" inputmode="decimal" autocomplete="off" placeholder="예: 70" value="${esc(draft.maxBidRate || '')}">`;
    if (key === 'failMax') html = `<div class="quick-choice-grid">${[0, 1, 2, 3, 4, 5].map(n => choice('failMax', String(n), `${n}회 이하`)).join('')}${choice('failMax', '', '제한 없음')}</div>`;
    if (key === 'sort') html = `<div class="quick-choice-grid">${AUCTION_SORT_OPTIONS.map(([value, label]) => choice('sort', value, label)).join('')}</div>`;
    $('.quick-filter-content').innerHTML = html;
    $('#auction-filter-title').textContent = (CHIPS.find(c => c[0] === key) || [])[1] || '';
    syncChoices();
  }
  function open(key) { active = key; panel.hidden = false; renderEditor(); update(); }
  function close() { active = null; panel.hidden = true; update(); }
  function apply() {
    onChange({ listingSource: draft.listingSource || 'court', gu: [...draft.gu], usage: draft.usage || '', dealType: draft.dealType || '', sort: draft.sort || 'sale', maxPrice: draft.maxPrice || '', maxBidRate: draft.maxBidRate || '', failMax: draft.failMax ?? '' });
    close();
  }
  root.addEventListener('click', event => {
    const chip = event.target.closest('[data-auction-chip]');
    if (chip) { active === chip.dataset.auctionChip ? close() : open(chip.dataset.auctionChip); return; }
    if (event.target.closest('[data-auction-close]')) { close(); return; }
    if (event.target.closest('[data-auction-apply]')) { apply(); return; }
    if (event.target.closest('[data-auction-reset]')) { draft = emptyDraft(); renderEditor(); update(); return; }
    const button = event.target.closest('[data-auction-choice]'); if (!button) return;
    const group = button.dataset.auctionChoice, value = button.dataset.value;
    if (group === 'listingSource') draft.listingSource = value === 'onbid' ? 'onbid' : 'court';
    else if (group === 'districts') draft.gu = value === '' ? [] : draft.gu.includes(value) ? draft.gu.filter(x => x !== value) : [...draft.gu, value];
    else if (group === 'usage') draft.usage = value;
    else if (group === 'dealType') draft.dealType = value;
    else if (group === 'sort') draft.sort = value || 'sale';
    else if (group === 'failMax') draft.failMax = value;
    syncChoices(); update();
  }, { signal: abort.signal });
  root.addEventListener('input', event => {
    if (!event.target.matches('.quick-number')) return;
    if (event.target.id === 'auction-max-price') draft.maxPrice = event.target.value.trim();
    if (event.target.id === 'auction-max-rate') draft.maxBidRate = event.target.value.trim();
    update();
  }, { signal: abort.signal });
  update();
  return { update, open, destroy() { abort.abort(); } };
}
