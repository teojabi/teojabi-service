import { apiFetch } from './api-client.mjs';
import { safePublicDocumentUrl, repKindLabel, TOURISM_NOTICE, statutoryZoneRatio } from './risk-policy.mjs';
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
// ---------- 필지별 지구단위계획 값 ----------
const METHOD_LABEL={zone_join:'용도지역 연결',map_area_mode:'도면 면적',multimodal_map:'결정도 판독',guideline_pdf_auto:'시행지침 표',guideline_pdf_auto2:'고시·지침 표',guideline_pdf_text:'시행지침 표',pdf_table:'고시 표',map_color:'도면 색상',map_height_legend:'도면 범례',map_url:'도면',manual:'수동 입력',decision_map_vision:'결정도 판독'};
const CONF_LABEL={high:'근거 높음',medium:'근거 보통',low:'근거 낮음'};
const regValues=r=>{
  const p=[];
  if(r.farStandard!=null)p.push(`기준 ${r.farStandard}%`);
  if(r.farBasic!=null)p.push(`기본 ${r.farBasic}%`);
  if(r.farAllowed!=null)p.push(`허용 ${r.farAllowed}%`);
  if(r.farUpper!=null)p.push(`상한 ${r.farUpper}%`);
  if(r.bcr!=null)p.push(`건폐율 ${r.bcr}%`);
  if(r.heightM!=null)p.push(`높이제한 ${r.heightM}m`);
  if(r.floors!=null)p.push(`${r.floors}층`);
  if(!p.length&&r.farText)p.push(`용적률 ${r.farText}`);
  if(!p.length&&r.heightText)p.push(`높이 ${r.heightText}`);
  return p.join(' · ');
};
const regMeta=r=>[r.method?METHOD_LABEL[r.method]||r.method:null,r.confidence?CONF_LABEL[r.confidence]:null].filter(Boolean).join(' · ');
function regRow(r,{showDgm=false}={}){
  const label=r.zoneName||r.zoneCode||'기준';
  const vals=regValues(r);
  const src=r.sourceFileUrl?` <a class="context-reg-src" href="${esc(r.sourceFileUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(r.sourceFileName||'근거 파일')}">근거 ↗</a>`:'';
  const meta=regMeta(r);
  return `<li>${showDgm&&r.dgmName?`<b class="context-reg-plan">${esc(r.dgmName)}</b> `:''}<b class="context-reg-zone">${esc(label)}</b> ${vals?`<span class="context-reg-values">${esc(vals)}</span>`:'<span class="context-value-none">표시할 값 없음</span>'}${src}${meta?` <small>${esc(meta)}</small>`:''}</li>`;
}
const useZoneName=name=>/지역\s*$/.test(String(name||'').replace(/\([^)]*\)/g,'').trim())||/지구|구역\s*$/.test(String(name||'').trim());
// 법정 용도지역 기준(가능하면 국토계획법 시행령 기준표, 없으면 보유 최대용적률/건폐율).
function legalLine(data){
  const dp=data?.districtParcel;
  const baseline=data?.baseline;
  const zone=dp?.legal?.zone||dp?.legal?.originalZone||baseline?.zone||baseline?.originalZone||null;
  const ratio=statutoryZoneRatio(zone);
  const far=ratio?ratio[0]:(dp?.legal?.far??baseline?.far??null);
  const bcr=ratio?ratio[1]:(dp?.legal?.bcr??(baseline?.bcr!=null&&baseline.bcr<=100?baseline.bcr:null));
  if(!zone||(far==null&&bcr==null))return '';
  const parts=[];
  if(far!=null)parts.push(`용적률 ${far}%`);
  if(bcr!=null)parts.push(`건폐율 ${bcr}%`);
  return `<p class="context-legal"><span class="context-legal-badge">용도지역 법정 기준</span> <b>${esc(zone)}</b> — ${esc(parts.join(' · '))} <small>국토계획법 시행령 기준 참고값이에요.</small></p>`;
}
function missingReason(dp){
  if(!dp)return '';
  if(dp.status==='ready'&&(dp.parcels||[]).length)return '';
  const plans=dp.plans||[];
  if(!plans.length)return '이 필지는 지구단위계획구역 경계에 포함되지 않아 구역 기준값이 없어요.';
  if((dp.zones||[]).length)return '이 필지에 적용되는 획지·필지별 값을 찾지 못해, 구역 내 용도지역별 기준을 대신 표시해요. 실제 적용 획지는 고시·도면 확인이 필요해요.';
  if(dp.hasDistrictValue)return '이 지구단위계획에 값은 있으나 이 필지·획지에 매칭된 값이 없어요. 원문 도면에서 해당 획지를 확인해 주세요.';
  return '이 지구단위계획은 값이 적힌 결정도·조서를 확보하지 못해 구역 기준값이 없어요.';
}
function renderDistrictParcel(data,plans){
  const dp=data?.districtParcel;
  const farFallback=renderFarSummary(plans);
  if(!dp){
    return farFallback?`${farFallback}${legalLine(data)}`:'';
  }
  const parcels=(dp.parcels||[]).filter(r=>regValues(r));
  const zoneRows=(dp.zones||[]).filter(r=>regValues(r));
  const inPlan=dp.status!=='not-in-plan'||(dp.plans||[]).length||parcels.length||zoneRows.length;
  if(!inPlan&&!farFallback)return '';
  const rows=zoneRows.map(r=>regRow(r,{showDgm:(dp.plans||[]).length>1}));
  const useRows=zoneRows.filter(r=>useZoneName(r.zoneName||r.zoneCode));
  const otherRows=zoneRows.filter(r=>!useZoneName(r.zoneName||r.zoneCode));
  const zoneList=useRows.length?useRows:zoneRows;
  let html=`<div class="context-district"><p class="context-far-title">지구단위계획 건축 기준 <small>필지 적용값 · 용도지역별 기준</small></p>`;
  if(parcels.length){
    html+=`<div class="context-parcel"><p class="context-parcel-title">이 필지에 매칭된 값</p><ul class="context-reg-list">${parcels.map(r=>regRow(r,{showDgm:true})).join('')}</ul></div>`;
  } else {
    const reason=missingReason(dp);
    if(reason)html+=`<p class="context-missing">${esc(reason)}</p>`;
    if(farFallback)html+=farFallback;
  }
  if(zoneList.length){
    const shown=zoneList.slice(0,16);
    html+=`<details class="context-far-detail" open><summary>용도지역별 기준 ${zoneList.length}건</summary><ul class="context-reg-list">${shown.map(r=>regRow(r)).join('')}</ul>${zoneList.length>shown.length?`<p class="context-far-more">그 밖에 ${zoneList.length-shown.length}건</p>`:''}</details>`;
    const extra=otherRows.length&&useRows.length?otherRows:[];
    if(extra.length){
      const ex=extra.slice(0,20);
      html+=`<details class="context-far-detail"><summary>그 밖의 획지·입지 기준 ${extra.length}건</summary><ul class="context-reg-list">${ex.map(r=>regRow(r)).join('')}</ul>${extra.length>ex.length?`<p class="context-far-more">그 밖에 ${extra.length-ex.length}건</p>`:''}</details>`;
    }
  }
  html+=legalLine(data);
  const srcUrls=[...new Set([...parcels,...zoneRows].map(r=>r.sourceFileUrl).filter(Boolean))];
  html+=`<small class="context-far-note">용적률·건폐율·높이는 고시·도면 기준이며 실제 허가 규모와 다를 수 있어요.${srcUrls.length?' 근거 파일은 각 항목의 링크에서 확인할 수 있어요.':''}</small></div>`;
  return html;
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
  const districtSection=renderDistrictParcel(data,plans);
  return `<ul class="context-facts">${zoneRows}<li><span class="context-dot"></span><div><p>${road?.widthM>0?`인접 도로폭은 약 <b>${esc(road.widthM)}m</b>로 기록되어 있어요.`:'인접 도로폭은 확인이 필요해요.'}</p>${road?.widthM>0?'<small title="주변 10m 이내 도로 중 최소 폭으로 적재된 참고값입니다.">주변 도로 자료 기준 · 실제 접도 확인 필요</small>':''}</div></li></ul>${districtSection}${plans.length?`<details class="context-plans"><summary>지구단위계획 고시·도면 보기</summary><div>${plans.map(p=>`<article><b>${esc(p.name)}</b><p>${esc(p.noticeDate||'고시일 미기재')}${p.noticeNumber?' · '+esc(p.noticeNumber):''}</p>${planSources(p)}${p.documentWarning?`<p>${esc(p.documentWarning)}</p>`:''}${link(p.pdfUrl,'고시 원문 보기')||'<p>연결된 고시 원문이 없어요.</p>'}${p.drawings?.length?`<details><summary>도면 ${p.drawings.length}개 보기</summary>${p.drawings.map(d=>link(d.url,d.name)).join('')}</details>`:''}</article>`).join('')}</div></details>`:''}<p class="context-source">연결된 필지의 저장 자료 기준이에요.</p>`;
}
export function mountInlineContext(host,listing,onData) {
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
      onData?.(data);
      host.innerHTML=renderInlineContext(data)+(data.status==='partial'?'<button class="context-retry">자료 다시 확인</button>':'');
    } catch {if(!disposed)host.innerHTML='<p class="case-note">구역과 도로 자료를 불러오지 못했어요.</p><button class="context-retry">다시 확인하기</button>';}
    finally {busy=false;if(!disposed)host.removeAttribute('aria-busy');}
  }
  host.addEventListener('click',e=>{if(e.target.closest('.context-retry'))load();},{signal:abort.signal});load();
  return ()=>{disposed=true;abort.abort();};
}
