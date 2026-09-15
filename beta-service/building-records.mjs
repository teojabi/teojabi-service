import { apiFetch } from './api-client.mjs';
import { renderRecordFields } from './record-fields.mjs';
import { areaMarkup } from './area-display.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=(value,unit)=>typeof value==='number'&&Number.isFinite(value)?`${value.toLocaleString('ko-KR')} ${unit}`:'미기재';
const field=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value||'미기재')}</dd></div>`;
function record(item,recap,index,single) {
  const title=recap?`총괄표제부 ${index+1}`:item.name||`표제부 ${index+1}`;
  return `<details class="register-record" ${single?'open':''}><summary><span><b>${esc(title)}</b><small>${esc([item.role,item.use].filter(Boolean).join(' · ')||'건물 현황')}</small></span><span class="register-chevron" aria-hidden="true">⌄</span></summary><div class="register-body">${renderRecordFields(item.fields)}<p class="case-note">값이 있는 대장 항목을 표시합니다. 0은 원자료의 기록값입니다.</p></div></details>`;
}
function group(source,recap) {
  const title=recap?'총괄표제부':'표제부',items=source?.items||[];
  if(source?.status!=='ready')return `<div class="register-empty"><b>${title}</b><p>${source?.status==='missing-address'?'매물 주소가 없어 대장을 연결하지 못했어요.':'자료를 불러오지 못했어요.'}</p></div>`;
  if(!items.length)return `<div class="register-empty"><b>${title}</b><p>같은 주소로 연결된 보유 기록이 없어요.</p>${source.excluded?'<small>주소·식별자가 맞지 않는 기록은 제외했어요.</small>':''}</div>`;
  return `<details class="register-group"><summary><span><b>${title} <em>${items.length}${source.truncated?'+':''}</em></b><small>${recap?'대지 전체에 함께 기록된 건물 현황':'건물별 구조·면적·층수'}</small></span><span class="register-chevron" aria-hidden="true">⌄</span></summary><div class="register-group-body">${items.map((item,index)=>record(item,recap,index,items.length===1)).join('')}${source.truncated?'<p class="case-note">기록이 많아 최대 30건까지 표시합니다.</p>':''}${source.excluded?'<p class="case-note">주소·식별자가 맞지 않는 기록은 제외했어요.</p>':''}</div></details>`;
}
export function renderBuildingRecords(data) {
  if(!data||!['ready','partial'].includes(data.status))return '<p>건축물대장 자료를 불러오지 못했어요.</p><button class="outline" data-register-retry>다시 불러오기</button>';
  return `<div class="register-heading"><span class="eyebrow">BUILDING RECORDS</span><h4>건축물대장 보기</h4><p>궁금한 대장을 눌러 건물 현황을 살펴보세요.</p></div>${group(data.recap,true)}${group(data.buildings,false)}${data.status==='partial'?'<button class="outline" data-register-retry>불러오지 못한 자료 다시 확인</button>':''}<p class="register-source">같은 주소로 찾은 보유 기록입니다. 총괄표제부와 개별 건물의 연결 관계·최신 변경 여부는 확인이 필요해요. 원본 발급 서류는 아닙니다.</p>`;
}
// No request until the viewer is opened. Retain records and expanded rows while folded.
export function mountBuildingRecords(host,button,listing) {
  const abort=new AbortController();let disposed=false,loaded=false,loading=false;
  async function load() {
    if(loaded||loading||disposed)return;
    loading=true;host.setAttribute('aria-busy','true');host.innerHTML='<p role="status">보유한 건축물대장을 불러오고 있어요.</p>';
    try {
      const response=await apiFetch(`/api/building-records/${encodeURIComponent(listing.id)}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok||!['ready','partial'].includes(data.status))throw new Error('unavailable');
      if(disposed)return;host.innerHTML=renderBuildingRecords(data);loaded=data.status==='ready';
    } catch {if(!disposed)host.innerHTML=renderBuildingRecords(null);}
    finally {loading=false;if(!disposed)host.removeAttribute('aria-busy');}
  }
  button.addEventListener('click',()=>{host.hidden=!host.hidden;button.setAttribute('aria-expanded',String(!host.hidden));button.textContent=host.hidden?'건축물대장 보기':'대장 접기';if(!host.hidden)load();},{signal:abort.signal});
  host.addEventListener('click',event=>{if(event.target.closest('[data-register-retry]'))load();},{signal:abort.signal});
  return ()=>{disposed=true;abort.abort();};
}
