import { apiFetch } from './api-client.mjs';
import { renderRecordFields } from './record-fields.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderLandArea(){return '';}
export function renderLandRecord(data) {
  if(data?.status!=='ready')return `<p>${data?.status==='missing'?'해당 필지의 토지대장 기록이 아직 없어요.':'토지대장 자료를 확인하지 못했어요.'}</p>${data?.status==='error'?'<button class="outline" data-land-retry>다시 불러오기</button>':''}`;
  return `<div class="register-heading"><span class="eyebrow">LAND RECORDS</span><h4>${esc(data.registerType||'토지대장')} 보기</h4><p>${esc(data.address)}</p></div>${renderRecordFields(data.fields)}<p class="register-source">브이월드 토지임야정보 · 보유한 대장 자료이며 발급 원본 서류는 아닙니다.</p>`;
}
export function mountLandRecords(compactHost,host,button,listing) {
  const abort=new AbortController();let disposed=false,loading=false;
  const open=()=>{host.hidden=false;button.setAttribute('aria-expanded','true');button.textContent='토지대장 접기';host.scrollIntoView({behavior:'smooth',block:'start'});};
  async function load() {
    if(loading||disposed)return;loading=true;
    compactHost.hidden=true;compactHost.replaceChildren();
    host.innerHTML='<p role="status">보유한 토지대장을 불러오고 있어요.</p>';
    try {
      const response=await apiFetch(`/api/land-record/${encodeURIComponent(listing.id)}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok)throw new Error('unavailable');
      if(disposed)return;host.innerHTML=renderLandRecord(data,listing);
    } catch {if(!disposed){host.innerHTML=renderLandRecord({status:'error'},listing);}}
    finally {loading=false;}
  }
  const action=event=>{if(event.target.closest('[data-land-retry]'))load();if(event.target.closest('[data-land-open]'))open();};
  compactHost.addEventListener('click',action,{signal:abort.signal});host.addEventListener('click',action,{signal:abort.signal});
  button.addEventListener('click',()=>{if(host.hidden)open();else{host.hidden=true;button.setAttribute('aria-expanded','false');button.textContent='토지대장 보기';}},{signal:abort.signal});
  load();return ()=>{disposed=true;abort.abort();};
}
