import { apiFetch } from './api-client.mjs';
import { safePublicDocumentUrl, zoneRelationLabel, TOURISM_NOTICE } from './risk-policy.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const area=v=>v>0?`${v.toLocaleString('ko-KR',{maximumFractionDigits:2})}㎡`:'미기재';
const amount=v=>v!=null?`${v.toLocaleString('ko-KR')}개`:'미기재';
const value=v=>v==null||v===''?'미기재':esc(v);
const tabNames={summary:'검토 요약',registers:'대장·면적',plans:'구역·계획'};
const badge={evidence:'자료 있음',review:'확인 필요',missing:'자료 필요'};
function statusText(source,label) {
  if(source.status==='error')return `${label}를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.`;
  if(source.status==='missing-address')return '대조할 주소가 없어 대장 후보를 찾지 못했습니다.';
  if(source.status==='missing-parcel')return '연결 필지의 경계를 확인할 수 없어 구역을 대조하지 못했습니다.';
  return `현재 자료에서 관련 ${label}를 찾지 못했습니다. 자료가 없다는 이유로 검토가 완료된 것은 아닙니다.`;
}
function tourismNoticeLink(zone) {
  return zone.id==='tourism'?`<a class="risk-zone-download" href="${esc(safePublicDocumentUrl(TOURISM_NOTICE.url))}" target="_blank" rel="noopener noreferrer">${esc(TOURISM_NOTICE.title)} 다운로드 ↗</a>`:'';
}
function zoneSummaryCards(zones) {
  return `<section class="risk-zones" aria-label="세 가지 구역 확인"><div class="risk-section-head"><div><span class="eyebrow">SITE ZONES</span><h2>이 필지의 구역부터 확인하세요.</h2></div></div><p class="risk-caption">핀에 연결된 필지와 보유 구역 경계를 대조했습니다. 현재 지정 여부와 매각 대상 전체 범위는 별도 확인이 필요합니다.</p><div class="risk-checks">${zones.map(z=>`<article class="risk-check risk-zone-check"><h3>${esc(z.title)}</h3><strong>${esc(z.value)}</strong>${z.items.length?`<p class="risk-zone-names">${esc([...new Set(z.items.map(i=>i.name))].slice(0,3).join(' · '))}${z.truncated?' · 일부 표시':''}</p>`:''}<p>${esc(z.detail)}</p>${tourismNoticeLink(z)}<button data-risk="tab" data-tab="plans" data-zone="${esc(z.id)}">구역 자료 살펴보기 <span aria-hidden="true">↗</span></button></article>`).join('')}</div></section>`;
}
function zoneDetails(zone) {
  return `<section class="risk-zone-detail" id="risk-zone-${esc(zone.id)}" tabindex="-1"><div class="risk-section-head"><h3>${esc(zone.title)}</h3><span class="risk-badge ${zone.state}">${esc(zone.value)}</span></div>${tourismNoticeLink(zone)}${zone.items.length?`<div class="risk-zone-records">${zone.items.map(item=>`<article class="risk-zone-record"><div><h4>${esc(item.name)}</h4><span class="risk-badge review">${zoneRelationLabel(item.relation)}</span></div><p class="risk-caption">${item.noticeDate?`고시일 ${esc(item.noticeDate)}`:item.noticeYear?`고시연도 ${esc(item.noticeYear)}`:'고시일 미기재'}${item.noticeNumber?` · 고시번호 ${esc(item.noticeNumber)}`:''}</p>${item.documentWarning?`<p class="risk-intro-note">${esc(item.documentWarning)}</p>`:''}${safePublicDocumentUrl(item.pdfUrl)?`<a class="outline" href="${esc(item.pdfUrl)}" target="_blank" rel="noopener noreferrer">관련 지구단위계획 고시 열기 ↗</a>`:''}</article>`).join('')}</div>`:`<p class="risk-empty">${zone.status==='ready'?'현재 보유한 구역 경계와 겹치는 자료를 찾지 못했습니다. 구역 지정이 없다는 확정 판정은 아닙니다.':statusText(zone,zone.title)}</p>`}<p class="risk-caption">${esc(zone.detail)}${zone.truncated?' 최대 30건을 표시했습니다.':''}</p></section>`;
}
function sourceRecords(source,recap=false) {
  if(!source.items.length)return `<div class="risk-empty">${statusText(source,recap?'총괄표제부':'건물대장')}</div>`;
  return `<div class="risk-records">${source.items.map((r,i)=>`<details class="risk-record" ${i===0?'open':''}><summary><span><b>${esc(r.name||`${recap?'총괄표제부':'건물대장'} ${i+1}`)}</b><small>${esc(r.use||'용도 미기재')} · ${esc(r.category||'구분 미기재')}</small></span><span class="risk-candidate">주소 일치 후보</span></summary><div class="risk-record-body"><p class="risk-record-address">${esc(r.address)}</p><dl class="risk-facts">${(recap?[
    ['대장상 대지면적',area(r.landAreaM2)],['대장상 전체 연면적',area(r.floorAreaM2)],['주건축물 수',amount(r.mainCount)],['부속건축물 수',amount(r.accessoryCount)],['대장상 총 주차',r.parking!=null?`${r.parking}대`:'미기재'],['주용도',value(r.use)],
  ]:[['대장상 대지면적',area(r.landAreaM2)],['대장상 연면적',area(r.floorAreaM2)],['구조',value(r.structure)],['주용도',value(r.use)],['지상 / 지하',`${r.aboveFloors??'?'}층 / ${r.belowFloors??'?'}층`],['사용승인일',value(r.approvalDate)]]).map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><p class="risk-source-line">대장 관리번호 <span>${esc(r.serial)}</span> · 자료 기준일 미확인</p></div></details>`).join('')}</div>${source.truncated?'<p class="risk-caption">주소에 해당하는 대장 중 최대 30건을 표시했습니다. 전체 구성 목록으로 확정한 자료가 아닙니다.</p>':''}`;
}
export function renderRiskPanels(report) {
  const {listing,recap,buildings,parcel,plans}=report;
  const zones=listing.zoning?.status==='matched'?listing.zoning.entries.map(e=>esc(e.name)).join(' · '):'확인 필요';
  return `<section id="risk-panel-summary" role="tabpanel" aria-labelledby="risk-tab-summary">${zoneSummaryCards(report.zones)}<div class="risk-section-head"><div><span class="eyebrow">CHECK BEFORE YOU BUILD</span><h2>신축 전 함께 확인할 항목</h2></div><span class="risk-caption">자료 검토 단계</span></div><div class="risk-checks">${report.checks.map((c,i)=>`<article class="risk-check"><div class="risk-check-top"><span class="risk-index">0${i+1}</span><span class="risk-badge ${c.state}">${badge[c.state]}</span></div><h3>${esc(c.title)}</h3><strong>${esc(c.value)}</strong><p>${esc(c.detail)}</p>${c.tab?`<button data-risk="tab" data-tab="${c.tab}">${tabNames[c.tab]} 살펴보기 <span aria-hidden="true">↗</span></button>`:'<span class="risk-manual">현장·공적 자료로 확인</span>'}</article>`).join('')}</div><section class="risk-next"><div><span class="eyebrow">NEXT STEPS</span><h2>담당자와 함께 확인해 보세요.</h2><p>신축 가능 여부는 아래 내용과 해당 필지의 적용 기준을 확인한 뒤 판단합니다.</p></div><ol>${report.nextSteps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><a class="outline" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">등기 열람으로 권리 확인 ↗</a></section></section>
  <section id="risk-panel-registers" role="tabpanel" aria-labelledby="risk-tab-registers" hidden><div class="risk-section-head"><div><span class="eyebrow">SITE & BUILDINGS</span><h2>같은 주소의 자료, 범위부터 대조해요.</h2></div></div><p class="risk-intro-note">주소로 찾은 대장 후보입니다. 총괄표제부와 개별 동의 상하위 관계, 구성 필지, 실제 매각 범위는 아직 확정되지 않았습니다.</p><div class="risk-area-table"><table><caption>출처별 면적 참고 비교</caption><thead><tr><th scope="col">자료와 대상</th><th scope="col">대지면적</th><th scope="col">연면적</th></tr></thead><tbody><tr><th scope="row">매물 기재</th><td>${area(listing.areaM2)}</td><td>${area(listing.floorAreaM2)}</td></tr><tr><th scope="row">연결 필지 지도 계산<small>핀에 연결된 필지 1개 · 추정</small></th><td>${parcel.mapAreaM2!=null?area(parcel.mapAreaM2):'확인 필요'}</td><td>—</td></tr>${recap.items.map((r,i)=>`<tr><th scope="row">총괄표제부 후보 ${i+1}<small>대장 전체 범위</small></th><td>${area(r.landAreaM2)}</td><td>${area(r.floorAreaM2)}</td></tr>`).join('')}</tbody></table></div><p class="risk-caption">대장 면적을 합산하거나 매물 면적으로 바꾸지 않습니다. 대상 범위가 확인되기 전에는 면적 차이를 오류로 판정하지 않습니다.</p><div class="risk-source-block"><h3>총괄표제부 후보 <span>${recap.items.length||''}</span></h3><p class="risk-caption">여러 동의 전체 현황을 살펴보는 자료입니다. 소유·지분이나 합필 완료를 뜻하지 않습니다.</p>${sourceRecords(recap,true)}</div><div class="risk-source-block"><h3>개별 건물대장 후보 <span>${buildings.items.length||''}</span></h3><p class="risk-caption">같은 주소의 원천 대장을 나열했습니다. 현존 건물 수와 철거 대상을 확정한 목록은 아닙니다.</p>${sourceRecords(buildings)}</div><p class="risk-source-line">${esc(parcel.pnu||'필지 번호 미확인')} · 연결 필지 경계는 매물 상세 지도에서 볼 수 있습니다.</p></section>
  <section id="risk-panel-plans" role="tabpanel" aria-labelledby="risk-tab-plans" hidden><div class="risk-section-head"><div><span class="eyebrow">PLANNING DOCUMENTS</span><h2>구역과 계획의 적용 조건을 확인해요.</h2></div></div><div class="risk-zoning"><span>연결 필지 용도지역</span><b>${zones}</b>${listing.zoning?.sourceDate?`<small>자료 기준 ${esc(listing.zoning.sourceDate)}</small>`:''}</div>${report.zones.filter(z=>z.id!=='district-plan').map(zoneDetails).join('')}<section class="risk-zone-detail" id="risk-zone-district-plan" tabindex="-1"><div class="risk-section-head"><h3>지구단위계획구역</h3><span class="risk-badge">${esc(report.zones.find(z=>z.id==='district-plan').value)}</span></div><p class="risk-intro-note">계획 도형과 연결 필지를 대조해 찾은 자료입니다. 고시·도면에서 해당 획지와 변경 이력을 확인해야 하며, 과거 자료일 수 있습니다.</p>${plans.items.length?plans.items.map(p=>`<article class="risk-plan"><div class="risk-plan-top"><span class="risk-badge review">${zoneRelationLabel(p.relation)}</span><span>${esc(p.noticeDate||'고시일 미기재')}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.title||'고시 제목 미기재')}</p><p class="risk-caption">고시번호 ${esc(p.noticeNumber||'미기재')} · 규제 적용 확정 전</p>${p.documentWarning?`<p class="risk-intro-note">${esc(p.documentWarning)}</p>`:''}${safePublicDocumentUrl(p.pdfUrl)?`<a class="risk-pdf" href="${esc(p.pdfUrl)}" target="_blank" rel="noopener noreferrer"><span class="risk-file-icon">PDF</span><span><b>고시 원문 열기</b><small>${esc(p.pdfName||'고시 PDF')}</small></span><span aria-hidden="true">↗</span></a>`:'<div class="risk-empty">연결된 고시 PDF가 없습니다. 원문 확인이 필요합니다.</div>'}${p.drawings.length?`<details class="risk-drawings"><summary>계획 도면 ${p.drawings.length}개 살펴보기</summary><ul>${p.drawings.filter(d=>safePublicDocumentUrl(d.url)).map(d=>`<li><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul></details>`:'<p class="risk-caption">연결된 계획 도면이 없습니다.</p>'}</article>`).join(''):`<div class="risk-empty">${statusText(plans,'계획 자료')}</div>`}${plans.truncated?'<p class="risk-caption">관련 계획은 최대 20건을 표시합니다.</p>':''}</section><div class="risk-scale-note"><h3>건축 규모는 다음 단계에서 검토해요.</h3><p>높이·건폐율·용적률의 적용 기준, 도로와 주차 조건이 확인되면 계획 규모를 검토할 수 있습니다. 현재 추출된 미확인 규제값으로 최대 층수나 수익률을 계산하지 않습니다.</p></div></section>`;
}
export function mountRiskReview(host,{listing,onClose}) {
  const abort=new AbortController();let disposed=false,version=0,report=null,activeTab='summary';
  const previousTitle=document.title;document.title='신축 리스크 검토 — 터잡이';
  host.innerHTML=`<div class="risk-review"><button class="back" data-risk="back">← 매물 상세로 돌아가기</button><header class="risk-heading"><div><span class="eyebrow">NEW BUILD REVIEW</span><h1 tabindex="-1">신축 리스크 검토</h1><p>${esc(listing.address||'매물 주소 확인 필요')}</p></div><span class="risk-stage">신축 가능 여부 검토 전</span></header><div class="risk-review-toolbar"><div role="tablist" aria-label="신축 검토 자료">${Object.entries(tabNames).map(([id,label])=>`<button id="risk-tab-${id}" role="tab" aria-controls="risk-panel-${id}" aria-selected="${id==='summary'}" tabindex="${id==='summary'?0:-1}" data-risk="tab" data-tab="${id}" disabled>${label}</button>`).join('')}</div><button class="outline" data-risk="copy" disabled>검토 내용 복사</button></div><p class="risk-copy-status" role="status"></p><div class="risk-notes"></div><div class="risk-panels" aria-busy="true"></div><p class="risk-observed"></p></div>`;
  const $=s=>host.querySelector(s);
  $('h1').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  function activate(id,focus=false) {
    if(!report||!tabNames[id])return;activeTab=id;
    host.querySelectorAll('[role=tab]').forEach(t=>{const selected=t.dataset.tab===id;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});
    host.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!==`risk-panel-${id}`);
    if(focus){$(`#risk-tab-${id}`).focus({preventScroll:true});$('.risk-review-toolbar').scrollIntoView({block:'start',behavior:'smooth'});}
  }
  async function load() {
    const current=++version;
    $('.risk-panels').innerHTML='<div class="risk-loading" role="status"><span></span><h2>이 매물의 검토 자료를 모으고 있어요.</h2><p>대장 현황과 연결 필지의 계획 자료를 확인합니다.</p></div>';
    $('.risk-panels').setAttribute('aria-busy','true');
    try {
      const response=await apiFetch(`/api/risk/${encodeURIComponent(listing.id)}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok||!['ready','partial'].includes(data.status))throw new Error('Unavailable');
      if(disposed||current!==version)return;report=data;
      $('.risk-panels').innerHTML=renderRiskPanels(data);
      $('.risk-notes').innerHTML=data.notes.length?`<div class="risk-partial">${data.notes.map(n=>`<p>${esc(n)}</p>`).join('')}<button class="outline" data-risk="retry">자료 다시 불러오기</button></div>`:'';
      host.querySelectorAll('[role=tab],[data-risk=copy]').forEach(b=>b.disabled=false);activate(activeTab);
      const observed=new Date(data.observedAt);
      $('.risk-observed').textContent=`자료 조회 ${Number.isFinite(observed.getTime())?observed.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'시각 미확인'} · 대장 현행 여부와 매각 범위 확인 전 · 조회 시각은 원천 갱신일이 아닙니다.`;
    } catch {
      if(disposed||current!==version)return;
      $('.risk-panels').innerHTML='<div class="risk-empty"><h2>검토 자료를 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요. 연결 실패를 위험 없음으로 표시하지 않습니다.</p><button class="outline" data-risk="retry">다시 불러오기</button></div>';
    } finally {if(!disposed&&current===version)$('.risk-panels').removeAttribute('aria-busy');}
  }
  host.addEventListener('click',async event=>{
    const button=event.target.closest('[data-risk]');if(!button||button.disabled)return;
    if(button.dataset.risk==='back')onClose();
    if(button.dataset.risk==='tab'){activate(button.dataset.tab,button.getAttribute('role')!=='tab');if(button.dataset.zone){const section=$(`#risk-zone-${button.dataset.zone}`);section?.focus({preventScroll:true});section?.scrollIntoView({block:'start',behavior:'smooth'});}}
    if(button.dataset.risk==='retry')load();
    if(button.dataset.risk==='copy'&&report) {
      const lines=['터잡이 신축 검토 메모',report.listing.address,'신축 가능 여부: 미판정',
        `${TOURISM_NOTICE.title}\n${TOURISM_NOTICE.url}`,
        ...report.zones.map(z=>`${z.title}: ${z.value}\n${z.items.map(i=>`${i.name} (${zoneRelationLabel(i.relation)})`).join(' · ')}\n${z.detail}`),
        ...report.checks.map(c=>`${c.title}: ${c.value}\n${c.detail}`),
        ...report.plans.items.map(p=>`${p.name} / 고시일 ${p.noticeDate||'미확인'}${p.pdfUrl?'\n'+p.pdfUrl:''}`),
        '대장은 주소 일치 후보이며 구성 필지·동·매각 범위 미확정. 원천의 현재 유효 여부 확인 필요.',
        `자료 조회 시각: ${report.observedAt}`];
      try {await navigator.clipboard.writeText(lines.join('\n\n'));if(!disposed)$('.risk-copy-status').textContent='검토 내용을 복사했습니다.';}
      catch {if(!disposed)$('.risk-copy-status').textContent='클립보드에 접근하지 못했습니다. 화면의 내용을 선택해 복사해 주세요.';}
    }
  },{signal:abort.signal});
  host.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();onClose();return;}
    const tab=event.target.closest('[role=tab]');if(!tab)return;
    const keys=Object.keys(tabNames),i=keys.indexOf(activeTab);
    const next={ArrowRight:keys[(i+1)%3],ArrowLeft:keys[(i+2)%3],Home:keys[0],End:keys[2]}[event.key];
    if(next){event.preventDefault();activate(next);$(`#risk-tab-${next}`).focus();}
  },{signal:abort.signal});
  load();
  return ()=>{disposed=true;abort.abort();host.innerHTML='';document.title=previousTitle;};
}
