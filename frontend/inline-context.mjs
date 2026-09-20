import { apiFetch } from './api-client.mjs';
import { safePublicDocumentUrl, repKindLabel, TOURISM_NOTICE } from './risk-policy.mjs';
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
// 지구단위계획 용적률·건폐율·높이 기준 한 줄 표기.
function farRowLine(item) {
  const parts=[];
  if(item.standard!=null)parts.push(`기준용적률 ${item.standard}%`);
  if(item.allowed!=null)parts.push(`허용용적률 ${item.allowed}%`);
  if(item.upper!=null)parts.push(`상한용적률 ${item.upper}%`);
  if(item.bcr!=null)parts.push(`건폐율 ${item.bcr}%`);
  if(item.heightM!=null)parts.push(`높이제한 ${item.heightM}m`);
  if(item.floors!=null)parts.push(`${item.floors}층`);
  // 숫자로 추출되지 않았지만 원문에 기준이 있는 경우(예: "용적률 미규제", "519% 이하")는 문구를 그대로 보여준다.
  const farTexts=[];
  if(item.standard==null&&item.standardText)farTexts.push(item.standardText);
  if(item.allowed==null&&item.allowedText)farTexts.push(item.allowedText);
  if(item.upper==null&&item.upperText)farTexts.push(item.upperText);
  if(![item.standard,item.allowed,item.upper].some(v=>v!=null)&&farTexts.length) {
    const value=farTexts.join(' · ');
    parts.push(/미규제/.test(value)?'용적률 미규제(용도지역 기준 적용)':`용적률 ${value}`);
  }
  if(item.bcr==null&&item.bcrText)parts.push(`건폐율 ${item.bcrText}`);
  if(!parts.length)return '';
  const cleanZoneRaw=String(item.zoneRaw||'').replace(/^\[[^\]]*\]\s*/,'').trim();
  const label=item.zoneDetail||item.roadSide||cleanZoneRaw||item.zoneClass||'기준';
  const meta=[item.zoneDetail&&item.roadSide?item.roadSide:null,item.changeType].filter(Boolean).join(' · ');
  const labelHtml=item.sourceFileUrl?`<a href="${esc(item.sourceFileUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(item.sourceFileName||'근거 파일')}">${esc(label)} ↗</a>`:esc(label);
  return `<li><b>${labelHtml}</b> ${esc(parts.join(' · '))}${meta?` <small>${esc(meta)}</small>`:''}</li>`;
}
// 값 범위 요약 (예: 50~70%). 값이 하나면 그대로.
const numRange=(values,suffix)=>{
  const nums=(values||[]).filter(v=>typeof v==='number'&&Number.isFinite(v));
  if(!nums.length)return null;
  const min=Math.min(...nums),max=Math.max(...nums),fmt=v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2});
  return `${min===max?fmt(min):`${fmt(min)}~${fmt(max)}`}${suffix}`;
};
// 필지별 나열 대신 기준·허용·상한 용적률, 건폐율, 높이제한을 범위로 요약한다.
const parsePercents=value=>{const out=[];const re=/(\d[\d,]*(?:\.\d+)?)\s*%/g;const s=String(value||'');let m;while((m=re.exec(s)))out.push(Number(m[1].replace(/,/g,'')));return out;};
function farSummaryParts(rows) {
  const parts=[];
  const collect=(numeric,text)=>[...rows.map(r=>r[numeric]),...rows.flatMap(r=>parsePercents(r[text]))];
  const std=numRange(collect('standard','standardText'),'%');
  const alw=numRange(collect('allowed','allowedText'),'%');
  const upr=numRange(collect('upper','upperText'),'%');
  const bcr=numRange(rows.map(r=>r.bcr),'%');
  const hgt=numRange(rows.map(r=>r.heightM),'m');
  const flr=numRange(rows.map(r=>r.floors),'층');
  if(std&&!alw&&!upr)parts.push(`용적률 ${std}`);
  else {
    if(std)parts.push(`기준용적률 ${std}`);
    if(alw)parts.push(`허용용적률 ${alw}`);
    if(upr)parts.push(`상한용적률 ${upr}`);
  }
  if(bcr)parts.push(`건폐율 ${bcr}`);
  if(hgt)parts.push(`높이제한 ${hgt}`);
  if(flr)parts.push(flr);
  if(!parts.length) {
    const t=rows.map(r=>r.standardText||r.allowedText||r.upperText).filter(Boolean)[0];
    if(t)parts.push(/미규제/.test(t)?'용적률 미규제(용도지역 기준 적용)':`용적률 ${t}`);
    const bt=rows.map(r=>r.bcrText).filter(Boolean)[0];
    if(bt)parts.push(`건폐율 ${bt}`);
  }
  return parts;
}
export function renderFarBlock(plan) {
  const rows=(plan?.far||[]).filter(i=>farRowLine(i));
  if(!rows.length)return '';
  const parts=farSummaryParts(rows);
  const summary=parts.length?`<div class="context-far-summary">${parts.map(p=>`<span>${esc(p)}</span>`).join('')}</div>`:'';
  const shown=rows.slice(0,12);
  return `<div class="context-far"><p class="context-far-title">지구단위계획 건축 기준 <small>구역 단위 기준 · 해당 획지 적용은 도면 확인</small></p>${summary}<details class="context-far-detail"><summary>획지·용도지역별 기준 ${rows.length}건 보기</summary><ul class="context-far-list">${shown.map(farRowLine).join('')}</ul>${rows.length>shown.length?`<p class="context-far-more">그 밖에 ${rows.length-shown.length}건</p>`:''}</details><small class="context-far-note">용적률·건폐율·높이는 고시·도면에서 정한 기준이며 실제 허가 규모와 다를 수 있어요.</small></div>`;
}
export function renderFarSummary(plans) {
  const withFar=(plans||[]).filter(p=>renderFarBlock(p));
  if(!withFar.length)return '';
  return withFar.map(p=>`<div class="context-far-group"><b>${esc(p.name)}</b>${renderFarBlock(p)}</div>`).join('');
}
// 기준(최초) 고시 + 대표 값 파일 + 시행지침 링크.
function planSources(p) {
  const parts=[];
  if(p.baseNotice?.url)parts.push(`<a href="${esc(p.baseNotice.url)}" target="_blank" rel="noopener noreferrer">기준 고시 ${esc(p.baseNotice.no||'')}${p.baseNotice.date?` (${esc(p.baseNotice.date)})`:''} ↗</a>`);
  else if(p.baseNotice?.no)parts.push(`<span>기준 고시 ${esc(p.baseNotice.no)}</span>`);
  if(p.representative?.url)parts.push(`<span class="context-plan-rep"><span class="context-plan-badge">${esc(repKindLabel(p.representative.kind))}</span><a href="${esc(p.representative.url)}" target="_blank" rel="noopener noreferrer">${esc(p.representative.name||'대표 자료')}${p.representative.used?' · 값 근거':''} ↗</a></span>`);
  const gl=(p.guidelines||[]).filter(g=>g.url);
  const glHtml=gl.length?`<details class="context-plan-guide"><summary>시행지침 ${gl.length}개</summary>${gl.map(g=>link(g.url,g.name||'시행지침')).join('')}</details>`:'';
  if(!parts.length&&!glHtml)return '';
  return `<div class="context-plan-sources">${parts.join('')}${glHtml}</div>`;
}
function zoneLine(zone) {
  if(!zone)return '';
  const items=zone.items||[],names=[...new Set(items.map(i=>i.name))];
  const farCount=items.reduce((sum,item)=>sum+(item.far?.length||0),0);
  const included=items.some(i=>i.relation==='geometry-contained'),overlap=items.some(i=>i.relation==='geometry-overlap'),touch=items.some(i=>i.relation==='boundary-touch');
  if(included||overlap) {
    const title=zone.id==='education'?'교육보호구역':zone.id==='heritage'?'문화재보존구역':zone.id==='tourism'?'관광숙박특화구역':'지구단위계획구역';
    const text=zone.id==='district-plan'?`이 필지${included?'는':' 일부는'} ${names.join(' · ')}에 속해 있어요.`:
      `${included?'':'필지 일부가 '}${title}이에요.${['education','heritage'].includes(zone.id)&&names.length?' ('+names.join(' · ')+')':''}`;
    const farHint=zone.id==='district-plan'&&farCount?`<p class="context-far-hint">지구단위계획상 용적률·건폐율·높이 기준 ${farCount}건이 있어요.</p>`:'';
    return `<li><span class="context-dot"></span><div><p>${esc(text)}</p>${farHint}${heightLines(zone)}${zone.id==='tourism'?link(TOURISM_NOTICE.url,'관광숙박 고시 보기'):''}</div></li>`;
  }
  if(touch)return `<li><span class="context-dot"></span><p>${esc(zone.title)} 경계에 닿아 있어요.</p></li>`;
  if(zone.status!=='ready'||items.length||zone.excluded)return `<li class="context-pending"><span class="context-dot"></span><p>${esc(zone.title)} 여부를 확인하지 못했어요.</p></li>`;
  return '';
}
export function renderInlineContext(data) {
  const zones=data.zones||[],road=data.road;
  const zoneRows=zones.map(zoneLine).join('');
  const plans=zones.find(z=>z.id==='district-plan')?.items||[];
  const farSection=renderFarSummary(plans);
  return `<ul class="context-facts">${zoneRows}<li><span class="context-dot"></span><div><p>${road?.widthM>0?`인접 도로폭은 약 <b>${esc(road.widthM)}m</b>로 기록되어 있어요.`:'인접 도로폭은 확인이 필요해요.'}</p>${road?.widthM>0?'<small title="주변 10m 이내 도로 중 최소 폭으로 적재된 참고값입니다.">주변 도로 자료 기준 · 실제 접도 확인 필요</small>':''}</div></li></ul>${farSection}${plans.length?`<details class="context-plans"><summary>지구단위계획 고시·도면 보기</summary><div>${plans.map(p=>`<article><b>${esc(p.name)}</b><p>${esc(p.noticeDate||'고시일 미기재')}${p.noticeNumber?' · '+esc(p.noticeNumber):''}</p>${planSources(p)}${p.documentWarning?`<p>${esc(p.documentWarning)}</p>`:''}${link(p.pdfUrl,'고시 원문 보기')||'<p>연결된 고시 원문이 없어요.</p>'}${p.drawings?.length?`<details><summary>도면 ${p.drawings.length}개 보기</summary>${p.drawings.map(d=>link(d.url,d.name)).join('')}</details>`:''}</article>`).join('')}</div></details>`:''}<p class="context-source">연결된 필지의 저장 자료 기준이에요.</p>`;
}
export function mountInlineContext(host,listing) {
  const abort=new AbortController();let disposed=false,busy=false;
  async function load() {
    if(busy)return;busy=true;host.setAttribute('aria-busy','true');host.innerHTML='<p class="case-note">이 필지의 구역과 도로를 확인하고 있어요.</p>';
    try {
      let data=null;
      const contextResponse=await apiFetch(`/api/site-context/${encodeURIComponent(listing.id)}`,{signal:abort.signal});
      if(contextResponse.ok){const parsed=await contextResponse.json();if(['ready','partial'].includes(parsed.status))data=parsed;}
      // 디스코 등 카탈로그에 없는 매물은 필지 컨텍스트로 폴백한다.
      if(!data && listing.pnu && /^11\d{17}$/.test(String(listing.pnu))){
        const parcelResponse=await apiFetch(`/api/parcel-context/${encodeURIComponent(listing.pnu)}`,{signal:abort.signal});
        if(parcelResponse.ok){const parsed=await parcelResponse.json();if(['ready','partial'].includes(parsed.status))data=parsed;}
      }
      if(!data)throw new Error();
      if(disposed)return;
      host.innerHTML=renderInlineContext(data)+(data.status==='partial'?'<button class="context-retry">자료 다시 확인</button>':'');
    } catch {if(!disposed)host.innerHTML='<p class="case-note">구역과 도로 자료를 불러오지 못했어요.</p><button class="context-retry">다시 확인하기</button>';}
    finally {busy=false;if(!disposed)host.removeAttribute('aria-busy');}
  }
  host.addEventListener('click',e=>{if(e.target.closest('.context-retry'))load();},{signal:abort.signal});load();
  return ()=>{disposed=true;abort.abort();};
}
