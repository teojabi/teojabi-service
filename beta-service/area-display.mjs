export const AREA_DISPLAY_KEY='teojabi.area-display.v1';
export const areaDisplayEvents=new EventTarget();
const validUnit=unit=>unit==='m2'||unit==='pyeong';
export function readAreaDisplayUnit(storage) {
  try {const unit=(storage??globalThis.localStorage)?.getItem(AREA_DISPLAY_KEY);return validUnit(unit)?unit:'m2';}
  catch {return 'm2';}
}
let currentUnit=readAreaDisplayUnit();
export const getAreaDisplayUnit=()=>currentUnit;
export function setAreaDisplayUnit(unit,storage) {
  if(!validUnit(unit))return false;
  currentUnit=unit;
  try {(storage??globalThis.localStorage)?.setItem(AREA_DISPLAY_KEY,unit);} catch { /* Display still changes if storage is unavailable. */ }
  areaDisplayEvents.dispatchEvent(new Event('change'));
  return true;
}
export function formatArea(m2,unit=getAreaDisplayUnit(),missing='미기재') {
  if(!Number.isFinite(m2)||m2<=0)return missing;
  const pyeong=unit==='pyeong',value=m2*(pyeong?121/400:1),suffix=pyeong?'평':'㎡',digits=pyeong?1:2;
  const minimum=10**-digits;
  if(value<minimum)return `${minimum}${suffix} 미만`;
  return `${value.toLocaleString('ko-KR',{maximumFractionDigits:digits})}${suffix}`;
}
// Preserve the canonical square metres so repeated toggles never round the input.
export function areaMarkup(m2,unit=getAreaDisplayUnit()) {
  const value=Number.isFinite(m2)&&m2>0?m2:'';
  return `<span data-display-area-m2="${value}">${formatArea(m2,unit)}</span>`;
}
export function areaUnitControls(unit=getAreaDisplayUnit()) {
  return `<div class="area-display-control"><span>면적 단위</span><div role="group" aria-label="면적 표시 단위">${[['m2','㎡'],['pyeong','평']].map(([value,label])=>`<button type="button" data-area-unit="${value}" aria-label="면적을 ${label}${value==='pyeong'?'으로':'로'} 표시" aria-pressed="${unit===value}">${label}</button>`).join('')}</div></div>`;
}
export function refreshAreaDisplay(root,unit=getAreaDisplayUnit()) {
  for(const element of root.querySelectorAll('[data-display-area-m2]'))element.textContent=formatArea(Number(element.dataset.displayAreaM2),unit);
  for(const button of root.querySelectorAll('[data-area-unit]'))button.setAttribute('aria-pressed',String(button.dataset.areaUnit===unit));
}
