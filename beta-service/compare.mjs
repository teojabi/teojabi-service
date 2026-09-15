import { formatArea,getAreaDisplayUnit,setAreaDisplayUnit,areaUnitControls,areaDisplayEvents,refreshAreaDisplay } from './area-display.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function comparisonRows(listings,unit='m2') {
 const fmt=(n,suffix)=>typeof n==='number'&&Number.isFinite(n)&&n>0?n.toLocaleString('ko-KR',{maximumFractionDigits:2})+suffix:'미기재';
 return [
  ['매매가격',r=>fmt(r.priceWon/1e8,'억원')],['주소',r=>r.address||'주소 미확인'],
  ['대지면적',r=>formatArea(r.areaM2,unit)],['연면적',r=>formatArea(r.floorAreaM2,unit)],
  ['대지 1㎡당 호가',r=>r.priceWon>0&&r.areaM2>0?fmt(r.priceWon/r.areaM2/10000,'만원'):'계산 불가'],
  ['층 정보',r=>r.floorInfo||'미기재'],['용도지역',r=>r.zoning?.entries?.map(e=>e.name).join(' · ')||'미확인'],
 ].map(([label,get])=>({label,values:listings.map(get)}));
}
export function openComparison(listings,onOpen) {
 const rows=[...new Map(listings.map(r=>[r.id,r])).values()].slice(0,3);
 if(rows.length<2)return ()=>{};
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='compare-dialog';dialog.setAttribute('aria-label','매물 나란히 비교');
 dialog.innerHTML=`<div class="compare-head"><div><span class="eyebrow">COMPARE</span><h2>나란히 살펴보기</h2></div><button data-compare-close aria-label="비교 닫기">×</button></div><p class="case-note">호가와 매물 기재 면적을 비교해요. 대지 1㎡당 호가는 건물 가치를 분리한 토지가격이 아니에요.</p><div class="compare-scroll"><table><thead><tr><th scope="col">비교 항목</th>${rows.map(r=>`<th scope="col"><span>${esc(r.district)} ${esc(r.neighborhood)}</span><button class="outline" data-open="${esc(r.id)}">상세 보기</button></th>`).join('')}</tr></thead><tbody>${comparisonRows(rows).map(r=>`<tr><th scope="row">${r.label}</th>${r.values.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 dialog.querySelector('.compare-scroll').insertAdjacentHTML('beforebegin',areaUnitControls());
 const drawAreas=()=>{dialog.querySelector('tbody').innerHTML=comparisonRows(rows,getAreaDisplayUnit()).map(r=>`<tr><th scope="row">${r.label}</th>${r.values.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('');refreshAreaDisplay(dialog);};
 drawAreas();areaDisplayEvents.addEventListener('change',drawAreas);
 dialog.addEventListener('click',event=>{const button=event.target.closest('[data-area-unit]');if(button)setAreaDisplayUnit(button.dataset.areaUnit);});
 let closed=false;
 function close(){if(closed)return;closed=true;areaDisplayEvents.removeEventListener('change',drawAreas);dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});}
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-compare-close]'))close();const b=e.target.closest('[data-open]');if(b){close();onOpen(b.dataset.open);}});
 document.body.append(dialog);dialog.showModal();return close;
}
