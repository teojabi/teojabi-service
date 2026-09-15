import { apiFetch } from './api-client.mjs';
import { safePublicDocumentUrl, TOURISM_NOTICE } from './risk-policy.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>safePublicDocumentUrl(url)?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
function heightLines(zone) {
  if(zone.id!=='heritage')return '';
  const seen=new Set();
  return (zone.items||[]).filter(i=>['geometry-contained','geometry-overlap'].includes(i.relation)).map(i=>{
    const limits=[i.flatHeightM>0?`평지붕 ${i.flatHeightM}m`:null,i.slopeHeightM>0?`경사지붕 ${i.slopeHeightM}m`:null].filter(Boolean);
    const note=i.heightNote||'',key=[i.name,...limits,note].join('|');
    if(seen.has(key)||(!limits.length&&!note))return '';seen.add(key);
    return `<div class="context-height"><b>${esc(i.name)}${i.relation==='geometry-overlap'?' · 일부 걸침':''}</b>${limits.length?`<p>높이제한: ${esc(limits.join(' · '))}</p>`:''}${note?`<small>${esc(note)}</small>`:''}<small>저장된 문화재 구역 기준 · 원문 적용 조건 확인</small></div>`;
  }).join('');
}
function zoneLine(zone) {
  if(!zone)return '';
  const items=zone.items||[],names=[...new Set(items.map(i=>i.name))];
  const included=items.some(i=>i.relation==='geometry-contained'),overlap=items.some(i=>i.relation==='geometry-overlap'),touch=items.some(i=>i.relation==='boundary-touch');
  if(included||overlap) {
    const title=zone.id==='education'?'교육보호구역':zone.id==='heritage'?'문화재보존구역':zone.id==='tourism'?'관광숙박특화구역':'지구단위계획구역';
    const text=zone.id==='district-plan'?`이 필지${included?'는':' 일부는'} ${names.join(' · ')}에 속해 있어요.`:
      `${included?'':'필지 일부가 '}${title}이에요.${['education','heritage'].includes(zone.id)&&names.length?' ('+names.join(' · ')+')':''}`;
    return `<li><span class="context-dot"></span><div><p>${esc(text)}</p>${heightLines(zone)}${zone.id==='tourism'?link(TOURISM_NOTICE.url,'관광숙박 고시 보기'):''}</div></li>`;
  }
  if(touch)return `<li><span class="context-dot"></span><p>${esc(zone.title)} 경계에 닿아 있어요.</p></li>`;
  if(zone.status!=='ready'||items.length||zone.excluded)return `<li class="context-pending"><span class="context-dot"></span><p>${esc(zone.title)} 여부를 확인하지 못했어요.</p></li>`;
  return '';
}
export function renderInlineContext(data) {
  const zones=data.zones||[],road=data.road;
  const zoneRows=zones.map(zoneLine).join('');
  const plans=zones.find(z=>z.id==='district-plan')?.items||[];
  return `<ul class="context-facts">${zoneRows}<li><span class="context-dot"></span><div><p>${road?.widthM>0?`인접 도로폭은 약 <b>${esc(road.widthM)}m</b>로 기록되어 있어요.`:'인접 도로폭은 확인이 필요해요.'}</p>${road?.widthM>0?'<small title="주변 10m 이내 도로 중 최소 폭으로 적재된 참고값입니다.">주변 도로 자료 기준 · 실제 접도 확인 필요</small>':''}</div></li></ul>${plans.length?`<details class="context-plans"><summary>지구단위계획을 확인해볼까요?</summary><div>${plans.map(p=>`<article><b>${esc(p.name)}</b><p>${esc(p.noticeDate||'고시일 미기재')}${p.noticeNumber?' · '+esc(p.noticeNumber):''}</p>${p.documentWarning?`<p>${esc(p.documentWarning)}</p>`:''}${link(p.pdfUrl,'고시 원문 보기')||'<p>연결된 고시 원문이 없어요.</p>'}${p.drawings?.length?`<details><summary>도면 ${p.drawings.length}개 보기</summary>${p.drawings.map(d=>link(d.url,d.name)).join('')}</details>`:''}</article>`).join('')}</div></details>`:''}<p class="context-source">연결된 필지의 저장 자료 기준이에요.</p>`;
}
export function mountInlineContext(host,listing) {
  const abort=new AbortController();let disposed=false,busy=false;
  async function load() {
    if(busy)return;busy=true;host.setAttribute('aria-busy','true');host.innerHTML='<p class="case-note">이 필지의 구역과 도로를 확인하고 있어요.</p>';
    try {
      const response=await apiFetch(`/api/site-context/${encodeURIComponent(listing.id)}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok||!['ready','partial'].includes(data.status))throw new Error();
      if(disposed)return;
      host.innerHTML=renderInlineContext(data)+(data.status==='partial'?'<button class="context-retry">자료 다시 확인</button>':'');
    } catch {if(!disposed)host.innerHTML='<p class="case-note">구역과 도로 자료를 불러오지 못했어요.</p><button class="context-retry">다시 확인하기</button>';}
    finally {busy=false;if(!disposed)host.removeAttribute('aria-busy');}
  }
  host.addEventListener('click',e=>{if(e.target.closest('.context-retry'))load();},{signal:abort.signal});load();
  return ()=>{disposed=true;abort.abort();};
}
