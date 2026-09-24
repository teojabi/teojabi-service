import { ZONING_OPTIONS, AUCTION_USAGES, parseAreaRange, areaRangeLabel } from './search-options.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function criteriaFields(values={}) {
  const unit=values.areaUnit||'pyeong',zones=values.zones||[],auction=values.auction||{};
  const usages=auction.usages||[];
  return `<fieldset class="criteria-area"><legend>대지면적 <small>선택</small></legend><div class="area-range-inputs"><label><span>최소 대지면적</span><input name="minArea" inputmode="decimal" placeholder="제한 없음" value="${esc(values.minArea||'')}" autocomplete="off"></label><span class="range-separator" aria-hidden="true">~</span><label><span>최대 대지면적</span><input name="maxArea" inputmode="decimal" placeholder="제한 없음" value="${esc(values.maxArea||'')}" autocomplete="off"></label><label class="area-unit"><span>면적 단위</span><select name="areaUnit"><option value="pyeong" ${unit==='pyeong'?'selected':''}>평</option><option value="m2" ${unit==='m2'?'selected':''}>㎡</option></select></label></div><p class="criteria-help" data-area-help>${areaHelp(values)}</p></fieldset>
  <fieldset class="criteria-zones"><legend>용도지역 <small>선택 · 여러 개 선택 가능</small></legend><p class="criteria-help">선택하지 않으면 전체로 찾아요. 준주거는 주거, 준공업은 공업에 포함돼요.</p><div class="zone-choices">${ZONING_OPTIONS.map(zone=>`<label><input name="zone" type="checkbox" aria-label="${zone}" value="${zone}" ${zones.includes(zone)?'checked':''}><span>${zone}</span></label>`).join('')}</div><p class="criteria-help">선택한 지역 중 하나에 해당하면 표시해요. 필지 일부에 걸친 경우도 포함하며, 접하기만 하는 지역은 제외해요.</p></fieldset>
  <fieldset class="criteria-auction"><legend>경매 물건 <small>선택</small></legend><p class="criteria-help">법원경매·공매 물건도 함께 추천받아요. 아파트는 제외됩니다.</p><label class="auction-toggle"><input name="auction" type="checkbox" ${auction.enabled?'checked':''}><span>경매 물건도 함께 보기</span></label><div class="auction-condition-body" ${auction.enabled?'':'hidden'}><div class="auction-usage"><p class="criteria-help">경매 용도 · 선택하지 않으면 전체</p><div class="zone-choices auction-usage-choices">${AUCTION_USAGES.map(u=>`<label><input name="auctionUsage" type="checkbox" value="${esc(u)}" ${usages.includes(u)?'checked':''}><span>${esc(u)}</span></label>`).join('')}</div></div><div class="auction-price-row"><label><span>최저매각가 이하</span><input name="auctionMaxPrice" type="number" inputmode="decimal" min="0" step="0.1" placeholder="예: 10 (억)" value="${esc(auction.maxPriceEok||'')}" autocomplete="off"></label><label><span>감정가 대비 최저가율 이하</span><input name="auctionMaxBidRate" type="number" inputmode="decimal" min="0" max="100" step="1" placeholder="예: 70 (%)" value="${esc(auction.maxBidRate??'')}" autocomplete="off"></label></div></div></fieldset>`;
}
export function readCriteriaFields(root) {
  return {minArea:root.querySelector('[name="minArea"]').value.trim(),maxArea:root.querySelector('[name="maxArea"]').value.trim(),
    areaUnit:root.querySelector('[name="areaUnit"]').value,zones:[...root.querySelectorAll('[name="zone"]:checked')].map(e=>e.value),
    auction:{enabled:Boolean(root.querySelector('[name="auction"]')?.checked),
      usages:[...root.querySelectorAll('[name="auctionUsage"]:checked')].map(e=>e.value),
      maxPriceEok:root.querySelector('[name="auctionMaxPrice"]')?.value.trim()||'',
      maxBidRate:root.querySelector('[name="auctionMaxBidRate"]')?.value.trim()||''}};
}
export function areaHelp(values) {
  const range=parseAreaRange(values.minArea,values.maxArea,values.areaUnit||'pyeong');
  if(!range.ok)return range.message;
  const converted=values.areaUnit==='pyeong'&&(range.minAreaM2!=null||range.maxAreaM2!=null)?`약 ${areaRangeLabel(range.minAreaM2,range.maxAreaM2)} · `:'';
  return `${converted}매물 기재 대지면적 기준 · 1평 ≈ 3.3058㎡`;
}
