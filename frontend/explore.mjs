import { apiFetch } from './api-client.mjs';
import { ListingMap, openStreetView } from './map-controller.mjs';
import { mountInlineContext } from './inline-context.mjs';
import { mountBuildingRecords } from './building-records.mjs';
import { mountLandRecords } from './land-records.mjs';
import { PURPOSES } from './search-options.mjs';
import { openComparison } from './compare.mjs';
import { member,openFeedback } from './member.mjs';
import { mountQuickFilters } from './quick-filters.mjs';
import { areaInput } from './recent-search.mjs';
import { BUILD_DEFAULTS,validateBuildCriteria,appendBuildQuery } from './build-criteria.mjs';
import { areaMarkup,areaUnitControls,getAreaDisplayUnit,setAreaDisplayUnit,areaDisplayEvents,refreshAreaDisplay,formatArea } from './area-display.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>value>0?`${(value/1e8).toLocaleString('ko-KR',{maximumFractionDigits:3})}억원`:'가격 확인 중';
const area=areaMarkup;
const areaText=value=>formatArea(value,getAreaDisplayUnit());
const rowTitle=row=>`${row.district} ${row.neighborhood||''}`.trim();
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
const compactSuggestionLabel=label=>String(label).replace(/볼까요\??/g,'').replace(/으로 넓혀/g,'').replace(/까지 높여/g,'까지').replace(/이하로 줄여/g,'이하').replace(/만 /g,'').replace(/부터 살펴/g,'부터').replace(/조건을 /g,'').replace(/제한 /g,'').replace(/을 풀어/g,' 해제').trim();
const percent=value=>Number.isFinite(Number(value))&&Number(value)>0?`${Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2})}%`:'';
const detailFacts=row=>{
  const facts=row.buildingFacts||{},items=[];
  if(facts.landAreaM2)items.push(['대지면적',area(facts.landAreaM2)]);
  if(facts.floorAreaM2)items.push(['기존 연면적',area(facts.floorAreaM2)]);
  if(facts.floorScale)items.push(['기존 규모',esc(facts.floorScale)]);
  if(facts.farPercent)items.push(['기존 용적률',esc(percent(facts.farPercent))]);
  if(facts.mainUse)items.push(['용도',esc(facts.mainUse)]);
  if(facts.approvalDate)items.push(['사용승인',esc(facts.approvalDate)]);
  return items.length?`<ul class="listing-facts">${items.map(([label,value])=>`<li><b>${label}:</b> ${value}</li>`).join('')}</ul>`:'';
};
export function mountExplorer(root,{conditions,onEdit,onConditionsChange,onAnalyze,initialId}={}) {
  document.body.classList.add('map-results-open');
  const abort=new AbortController();let disposed=false,version=0,detailVersion=0,closeStreet,closeContext,closeRecords,closeLand;
  let result=null,selected=null,detail=null,parcel=null,limit=5,bounds=conditions?.bounds||null,query='',sort=conditions?.sort==='price-desc'?'price-desc':'price',mapView=null;
  let criteria={purpose:conditions?.purpose||null,minArea:conditions?.minArea||'',maxArea:conditions?.maxArea||'',areaUnit:conditions?.areaUnit||'pyeong',zones:conditions?.zones||[],minAreaM2:conditions?.minAreaM2??null,maxAreaM2:conditions?.maxAreaM2??null,...BUILD_DEFAULTS,...(validateBuildCriteria(conditions||{}).value||{})};
  const title=conditions?'내 조건으로 살펴보기':'지도에서 매물 살펴보기';
  root.innerHTML=`<section class="explore-page"><div class="result-head"><div><span class="eyebrow">EXPLORE TEOJABI</span><h1>${title}</h1></div><button class="outline" data-explore="edit">검색 조건 바꾸기</button></div>
    <form class="explore-search" id="explore-filters"><div class="explore-filters"><label><span>정렬</span><select name="sort"><option value="price" ${sort==='price'?'selected':''}>가격 낮은 순</option><option value="price-desc" ${sort==='price-desc'?'selected':''}>가격 높은 순</option></select></label></div></form>
    <p class="purpose-guide" id="purpose-guide" hidden></p>
    <div class="explore-toolbar"><div class="quick-filters"></div><span id="bounds-chip"></span><div class="explore-toggle" role="group" aria-label="결과 보기 방식"><button data-explore="pane" data-value="list" aria-pressed="true">리스트</button><button data-explore="pane" data-value="map" aria-pressed="false">지도</button></div></div>
    <div class="explore-board" data-pane="list"><div class="explore-list"><p id="result-count" aria-live="polite">저장된 매물을 불러오고 있어요.</p><div id="listing-list"></div><button class="outline more-listings" data-explore="more" hidden>매물 더 보기</button></div>
      <div class="map-frame"><div id="map-host" role="region" aria-label="매물 위치 지도"></div><div class="map-controls"><button class="outline" data-explore="search-map" disabled>이 영역에서 검색</button><button class="outline" data-explore="reset-map" aria-label="현재 매물 전체 위치 보기">전체 위치</button></div><div id="map-status" class="map-status" role="status">네이버 지도를 불러오고 있어요.</div><div class="map-caption">★ 현재 정렬 상위 5개 · 핀 기반 추정 위치</div></div>
      <aside id="listing-detail" class="detail-panel" aria-label="매물 상세" hidden></aside></div><p class="explore-foot" id="explore-foot"></p></section>`;
  const $=selector=>root.querySelector(selector);
  $('#listing-list').before($('#explore-filters'));
  let listScrollTop=0;
  const compared=new Map();let closeComparison,showPins=true,showTransactions=true,nearby=null,loadTimer=null,quickFilters;
  $('.map-controls').insertAdjacentHTML('beforeend','<button class="outline" data-explore="transactions" aria-pressed="true" hidden>주변 실거래 표시</button><button class="outline return-detail" data-explore="return-detail">매물 상세로 돌아가기</button>');
  $('.explore-toolbar').insertAdjacentHTML('afterend','<div class="discovery-actions"><button class="outline" data-explore="compare-open" disabled>비교할 매물을 골라주세요 (최대 3개)</button><button class="outline" data-explore="compare-clear" hidden>비교 선택 지우기</button><button class="outline" data-explore="pins" aria-pressed="true">지도 매물 표시</button><span class="discovery-notice" role="status"></span></div><div class="search-suggestions" aria-live="polite"></div>');
  function drawCompare(){const n=compared.size,b=$('[data-explore=compare-open]');b.disabled=n<2;b.textContent=n?`선택 ${n}개 비교하기`:'비교할 매물을 골라주세요 (최대 3개)';$('[data-explore=compare-clear]').hidden=!n;}
  $('.discovery-actions').insertAdjacentHTML('beforeend',areaUnitControls());
  const toolsFold=document.createElement('details');toolsFold.className='sheet-tools';toolsFold.innerHTML='<summary>비교·면적 단위</summary>';
  $('.discovery-actions').before(toolsFold);toolsFold.append($('.discovery-actions'));
  const page=$('.explore-page'),sheet=document.createElement('section');sheet.className='results-sheet';
  sheet.setAttribute('aria-label','검색 조건과 매물 목록');
  sheet.innerHTML='<button class="sheet-handle" data-explore="sheet-toggle" aria-expanded="true" aria-controls="results-sheet-body"><span class="sheet-grip"></span><span class="sheet-label">조건·매물 접기</span><span class="sheet-arrow">⌄</span></button><div class="sheet-body" id="results-sheet-body"></div>';
  const mapFrame=$('.map-frame');page.prepend(mapFrame);
  const body=sheet.querySelector('.sheet-body');
  for(const child of [...page.children])if(child!==mapFrame)body.append(child);
  page.append(sheet);page.classList.add('map-first');
  function setSheet(open){sheet.classList.toggle('collapsed',!open);body.hidden=!open;sheet.querySelector('.sheet-handle').setAttribute('aria-expanded',String(open));sheet.querySelector('.sheet-label').textContent=open?'조건·매물 접기':`조건·매물 보기${result?' · '+result.totalParcels+'개':''}`;sheet.querySelector('.sheet-arrow').textContent=open?'⌄':'⌃';}
  root.addEventListener('change',event=>{if(event.target.matches('[name=sort]')){sort=event.target.value;limit=5;closeDetail();load();}},{signal:abort.signal});
  const updateCriteria=()=>{
    quickFilters?.update();
    const purpose=PURPOSES.find(p=>p.id===criteria.purpose);$('#purpose-guide').hidden=!purpose;$('#purpose-guide').textContent=purpose?`${purpose.label} · ${purpose.guide}`:'';
    $('[name=sort]').closest('label').querySelector('span').textContent=criteria.preferTourism?'특화구역 우선 후 정렬':'정렬';
  };
  const currentConditions=()=>({...conditions,...criteria,budgetWon:conditions?.budgetWon??null,districts:conditions?.districts||[],bounds,query,sort});
  quickFilters=mountQuickFilters($('.quick-filters'),{getValue:currentConditions,onChange:patch=>{
    conditions={...conditions,...patch};criteria={...criteria,...patch};updateCriteria();
    ++version;limit=5;closeDetail(true,false);clearTimeout(loadTimer);
    $('.search-suggestions').replaceChildren();
    quickFilters.setRemembered(onConditionsChange?.(currentConditions())!==false);
    $('#result-count').textContent='변경한 조건으로 찾고 있어요.';
    loadTimer=setTimeout(()=>load(),300);
  }});updateCriteria();
  const map=new ListingMap($('#map-host'),{areaUnit:getAreaDisplayUnit(),onSelect:id=>openDetail(id),onTransaction:id=>{
    setSheet(true);
    $('.explore-board').classList.remove('transaction-map-open');
    const card=root.querySelector(`[data-transaction-id="${CSS.escape(id)}"]`);
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.focus({preventScroll:true});}
  },onMove:view=>{
    mapView=view;const button=$('[data-explore="search-map"]');if(button)button.disabled=false;
  },onStatus:(status,message)=>{
    if(disposed)return;
    $('#map-status').hidden=status==='ready';
    if(status==='error')$('#map-status').innerHTML=`<p>${esc(message)}</p><button class="outline" data-explore="retry-map">지도 다시 연결</button>`;
    if(status==='ready' && result)map.setGroups(result.groups,selected,true);
    if(status==='ready' && detail)map.select(detail.listing);
    if(status==='ready' && parcel?.status==='ready')map.parcel(parcel.geometry);
    if(status==='ready' && nearby?.status==='ready'){map.setTransactions(nearby.cases);map.setTransactionsVisible(showTransactions);}
    if($('#parcel-status') && parcel?.status==='ready')$('#parcel-status').textContent=parcelMessage();
    if(status==='error')$('[data-explore="search-map"]').disabled=true;
  }});
  areaDisplayEvents.addEventListener('change',()=>{refreshAreaDisplay(root);map.setAreaUnit(getAreaDisplayUnit());},{signal:abort.signal});
  map.mount([],null,false);
  const parcelMessage=()=>map.ready?'연결된 필지 경계를 지도에 표시했습니다.':'필지 경계를 불러왔습니다. 지도 연결 후 표시됩니다.';
  function card(group) {
    const row=group.representative;
    return `<article class="property-card${group.listings.some(r=>r.id===selected)?' selected':''}" data-card-id="${esc(row.id)}"><button class="property-select" data-explore="detail" data-id="${esc(row.id)}" aria-label="${esc(rowTitle(row))} ${money(row.priceWon)} 상세 보기"><div class="property-location"><span>${esc(rowTitle(row))}</span>${row.cohort==='existing'?'<em class="pick-badge">★ 터잡이픽</em>':''}</div><h2>${money(row.priceWon)}</h2><div class="area-pair"><span>대지 <b>${area(row.areaM2)}</b></span><span>연면적 <b>${area(row.floorAreaM2)}</b></span></div><p class="property-zoning">${esc(row.zoning?.groups?.length?row.zoning.groups.join(' · '):'용도지역 미확인')}</p><p class="property-description">${esc(row.description||'매물 설명이 기재되지 않았어요.')}</p><span class="property-link">상세 보기 <span aria-hidden="true">↗</span></span></button></article>`;
  }
  function drawCards() {
    $('#listing-list').innerHTML=result.groups.map(card).join('')||'<div class="empty"><h2>조건에 맞는 매물이 없어요.</h2><p>주소·면적·지도 범위를 바꾸거나 예산과 지역을 다시 선택해 주세요.</p></div>';
    $('#result-count').textContent=`${result.totalParcels.toLocaleString('ko-KR')}개 매물 · ${result.groups.length}개 표시`;
    if(criteria.preferTourism)$('#result-count').textContent+=result.tourismPreferredCount?` · 특화구역 ${result.tourismPreferredCount}개 우선`:' · 특화구역 우선대상 없음';
    $('[data-explore="more"]').hidden=!result.hasMore;
    $('.map-caption').textContent=`현재 표시 ${result.groups.length}개 · 핀 기반 추정 위치`;
    $('#explore-foot').textContent=`선별 매물 미리보기 · ${date(result.observedAt)} 구성 · 면적은 매물 기재 기준 · 용도지역은 연결 필지의 보유 토지자료 기준입니다.`;
    if(criteria.purpose==='new-build')$('#explore-foot').textContent+=' 신축 용도는 계획한 용도이며 건축 가능 판정이 아닙니다. 도로폭·보호구역 제외 조건은 연결 필지의 저장 자료 기준으로, 해당 항목 미확인 매물은 제외됩니다.';
    $('#bounds-chip').innerHTML=bounds?'<button class="pill clear-bounds" data-explore="clear-bounds">지도 범위 해제 ×</button>':'';
    for(const card of root.querySelectorAll('[data-card-id]')){
      const id=card.dataset.cardId;card.insertAdjacentHTML('beforeend',`<div class="property-actions"><button class="outline" data-explore="compare-toggle" data-id="${esc(id)}" aria-pressed="${compared.has(id)}">${compared.has(id)?'✓ 비교 선택됨':'＋ 비교'}</button><button class="outline" data-explore="favorite" data-id="${esc(id)}" aria-pressed="${Boolean(member.get('favorite',id))}">${member.get('favorite',id)?'♥ 찜함':'♡ 찜'}</button><button class="outline" data-explore="feedback" data-id="${esc(id)}">내 의견</button></div>`);
      if(criteria.purpose==='new-build'){
        const facts=result.groups.find(group=>group.representative.id===id)?.representative.development,labels=[];
        if(criteria.preferTourism&&['contained','overlap'].includes(facts?.tourism))labels.push(facts.tourism==='contained'?'관광숙박특화구역 포함':'관광숙박특화구역 일부 걸침');
        if(criteria.minRoadWidthM&&facts?.roadWidthM)labels.push(`도로 ${facts.roadWidthM}m`);
        if(criteria.excludeEducation)labels.push('교육구역 겹침 없음');if(criteria.excludeHeritage)labels.push('문화재구역 겹침 없음');
        if(labels.length)card.querySelector('.property-zoning').insertAdjacentHTML('afterend',`<p class="property-build-facts">${labels.map(esc).join(' · ')}</p>`);
      }
    }
    $('.search-suggestions').innerHTML=result.suggestions?.length?`<b>${result.totalParcels>20?`${result.totalParcels.toLocaleString('ko-KR')}개 · 좁혀보기`:result.totalParcels===0?'0개 · 넓혀보기':`${result.totalParcels}개 · 넓혀보기`}</b><div class="suggestion-chip-row">${result.suggestions.map((s,i)=>`<button class="outline suggestion-chip" data-explore="suggestion" data-index="${i}" title="${esc(s.label)}" ${$('.explore-list').getAttribute('aria-busy')==='true'?'disabled':''}><span>${esc(compactSuggestionLabel(s.label))}</span><strong>${s.count.toLocaleString('ko-KR')}개</strong></button>`).join('')}</div>`:'';
    drawCompare();
    if(!result.suggestions?.length&&(result.totalParcels>20||result.totalParcels<5))$('.search-suggestions').innerHTML=`<b>${result.totalParcels>20?'매물이 많아요':'조건이 좁아요'}</b><div class="suggestion-chip-row"><button class="outline suggestion-chip" data-explore="edit"><span>조건 직접 조정</span></button></div>`;
    const suggestions=$('.search-suggestions');
    if(suggestions.innerHTML)suggestions.innerHTML=`<div class="compact-suggestions" role="group" aria-label="조건 조정 제안"><span>조건 제안</span>${suggestions.innerHTML}</div>`;
  }
  async function load({fit=true}={}) {
    clearTimeout(loadTimer);quickFilters.setRemembered(onConditionsChange?.(currentConditions())!==false);
    const current=++version;const params=new URLSearchParams({limit,sort});
    if(conditions?.budgetWon)params.set('budgetWon',conditions.budgetWon);conditions?.districts?.forEach(d=>params.append('district',d));
    if(criteria.purpose)params.set('purpose',criteria.purpose);
    appendBuildQuery(params,criteria);
    if(criteria.minAreaM2!=null)params.set('minAreaM2',criteria.minAreaM2);if(criteria.maxAreaM2!=null)params.set('maxAreaM2',criteria.maxAreaM2);criteria.zones.forEach(z=>params.append('zone',z));
    member.hiddenIds().forEach(id=>params.append('exclude',id));
    if(query)params.set('q',query);if(bounds)params.set('bounds',bounds.join(','));
    $('#result-count').textContent='조건에 맞는 매물을 불러오고 있어요.';$('.explore-list').setAttribute('aria-busy','true');
    $('.search-suggestions').replaceChildren();
    try {
      const response=await apiFetch(`/api/catalog?${params}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok || data.status!=='ready')throw new Error(data.reason||'unavailable');
      if(disposed||current!==version)return;
      result=data;$('.explore-list').removeAttribute('aria-busy');drawCards();map.setGroups(result.groups,selected,fit);
      if(initialId){const id=initialId;initialId=null;openDetail(id);}
    } catch(error) {
      if(disposed||current!==version)return;
      result=null;map.setGroups([],null,false);closeDetail(false);
      $('#result-count').textContent='매물 자료를 확인하지 못했어요.';
      $('#listing-list').innerHTML=`<div class="empty"><h2>${error.message==='PRICE_UNIT_UNCONFIRMED'?'가격 단위를 확인하고 있어요.':error.message==='ZONING_UNAVAILABLE'?'용도지역 자료 연결을 확인해 주세요.':error.message==='DEVELOPMENT_UNAVAILABLE'?'신축 조건에 사용할 도로·구역 자료를 확인해 주세요.':'로컬 매물 연결을 확인해 주세요.'}</h2><p>연결 실패를 검색 결과 0건으로 표시하지 않습니다.</p><button class="outline" data-explore="retry">다시 불러오기</button></div>`;
      $('[data-explore="more"]').hidden=true;
    } finally {if(!disposed&&current===version)$('.explore-list').removeAttribute('aria-busy');}
  }
  function closeDetail(updateUrl=true,restoreFocus=true) {
    closeContext?.();closeContext=null;closeRecords?.();closeRecords=null;closeLand?.();closeLand=null;
    const previousId=selected;
    ++detailVersion;selected=null;detail=null;parcel=null;nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('.explore-board').classList.remove('transaction-map-open');
    $('#listing-detail').hidden=true;$('.explore-board').classList.remove('has-detail');map.select(null,{pan:false});map.parcel(null);
    if(result)drawCards();body.scrollTop=listScrollTop;if(updateUrl)history.replaceState(null,'',location.pathname+location.search);
    if(previousId&&restoreFocus)root.querySelector(`[data-card-id="${CSS.escape(previousId)}"] .property-select`)?.focus({preventScroll:true});
  }
  function renderDetail() {
    if(!detail)return;
    const row=detail.listing;
    $('#listing-detail').innerHTML=`<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><button class="detail-close" data-explore="close" aria-label="매물 상세 닫기">×</button></div>
      <div class="detail-content"><p class="detail-location">${esc(rowTitle(row))}${row.cohort==='existing'?'<em class="pick-badge detail-pick-badge">★ 터잡이픽</em>':''}</p><h2 tabindex="-1" id="detail-title">${money(row.priceWon)}</h2>
      ${row.teojabiNo?`<p class="detail-listing-number">매물번호 ${esc(row.teojabiNo)}</p>`:''}
      ${areaUnitControls()}<div class="detail-areas"><div><span>대지면적</span><strong>${area(row.areaM2)}</strong></div><div><span>연면적</span><strong>${area(row.floorAreaM2)}</strong></div></div>
      <div id="land-area-comparison" aria-live="polite"></div><button class="street-open" data-explore="street">네이버 거리뷰 보기 <span aria-hidden="true">↗</span></button><nav class="detail-shortcuts" aria-label="상세 내용 이동"><button data-explore="section" data-section="property-description">매물 설명</button><button data-explore="section" data-section="property-parcel">필지 위치</button><button data-explore="section" data-section="property-documents">서류 확인</button><button data-explore="section" data-section="property-context">주변 조건</button></nav>
      <section class="detail-section" id="property-description"><h3>매물 설명</h3>${row.description?`<p class="listing-description">${esc(row.description)}</p>`:''}${detailFacts(row)||(!row.description?'<p class="listing-description">등록된 설명이 없습니다.</p>':'')}<p class="case-note">네이버 매물에 기재된 현황입니다. 현재 가격과 판매 여부는 상담 시 확인해 주세요.</p></section>
      <section class="detail-section" id="property-parcel"><h3>필지 위치</h3><p>${esc(row.address||`${rowTitle(row)} · 상세 주소 미확인`)}</p></section>
      <section class="detail-section"><h3>용도지역</h3>${row.zoning?.status==='matched'?`<p>${row.zoning.entries.map(e=>`${esc(e.name)} <small>(${e.relation==='마스터 기록'?'마스터 기록':e.relation==='저촉'?'일부 걸침':'포함'})</small>`).join('<br>')}</p><p class="case-note">${row.zoning.source==='master_land'?'마스터 토지 용도지역 기록':`토지이용계획 자료 · ${esc(row.zoning.sourceDate)} 기준`}<br>핀으로 연결한 필지 기준이며, 여러 필지로 된 매물 전체를 판정한 정보는 아닙니다.</p>`:'<p class="case-note">용도지역을 확인하지 못했습니다.</p>'}</section>
      <section class="detail-section nearby-section" id="property-transactions"><div class="nearby-heading"><h3>주변 실거래</h3><button class="outline" data-explore="transactions" aria-pressed="true" disabled>지도 표시</button></div>${areaUnitControls()}<div id="nearby-cases" aria-live="polite"><p class="case-note">가까운 토지·건물 거래를 찾고 있어요.</p></div></section>
      <section class="detail-section" id="property-documents"><h3>서류 확인</h3><p class="case-note">보유한 건축물·토지대장을 살펴보고, 등기는 인터넷등기소에서 확인하세요.</p><div class="document-list"><div><span class="document-symbol">01</span><div><b>건축물대장</b><p>표제부·총괄표제부의 건물 현황</p></div><button class="outline" id="building-records-toggle" aria-expanded="false" aria-controls="building-records">건축물대장 보기</button></div><div><span class="document-symbol">02</span><div><b>토지(임야)대장</b><p>필지별 토지 기록</p></div><button class="outline" id="land-records-toggle" aria-expanded="false" aria-controls="land-records">토지대장 보기</button></div><div><span class="document-symbol">03</span><div><b>등기사항증명서</b><p>인터넷등기소에서 직접 열람</p></div><div class="document-actions"><button class="outline" data-explore="copy-address">필지 주소 복사</button><a class="outline" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">열람·발급 ↗</a></div></div></div><div id="building-records" class="building-records" hidden></div><div id="land-records" class="building-records" hidden></div></section>
      <section class="detail-section inline-context" id="property-context"><h3>이 땅, 이런 점을 살펴보세요.</h3><div id="context-facts" aria-live="polite"></div><div class="context-more"><p>더 구체적으로 개발을 검토하고 싶으세요?</p><button class="primary" data-explore="analyze-site">건물·토지에서 검토하기 <span aria-hidden="true">↗</span></button></div></section><p class="detail-bottom-note">사진과 발급 원본 PDF는 현재 보유 자료에 포함되어 있지 않습니다.</p>
      <section class="brokerage-info" aria-label="중개사무소 정보"><h3>터잡이 공인중개사사무소</h3><dl><div><dt>대표</dt><dd>윤진경</dd></div><div><dt>등록번호</dt><dd>제 11650-2026-00102 호</dd></div><div><dt>주소</dt><dd>서울특별시 서초구 언남5길 1, 2층 (양재동)</dd></div><div><dt>연락처</dt><dd>010-8258-4959</dd></div><div><dt>중개보수</dt><dd>상업용 빌딩 기준<br><span>(법정 상한 요율 0.9% 내 협의)</span></dd></div></dl></section></div>`;
  }
  async function openDetail(id,updateUrl=true) {
    if(!selected)listScrollTop=body.scrollTop;
    setSheet(true);
    closeContext?.();closeContext=null;closeRecords?.();closeRecords=null;closeLand?.();closeLand=null;
    const current=++detailVersion;selected=id;detail=null;parcel=null;nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('.explore-board').classList.remove('transaction-map-open');
    $('#listing-detail').hidden=false;$('.explore-board').classList.add('has-detail');
    $('#listing-detail').innerHTML='<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><span>불러오는 중</span><button class="detail-close" data-explore="close" aria-label="매물 상세 닫기">×</button></div>';
    map.parcel(null);if(result)drawCards();
    try {
      const response=await apiFetch(`/api/listings/${encodeURIComponent(id)}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok||data.status!=='ready')throw new Error('Missing listing');
      if(disposed||current!==detailVersion)return;
      detail=data;renderDetail();
      $('.detail-content').insertAdjacentHTML('afterbegin','<div class="detail-conversion"><a class="primary" href="https://pf.kakao.com/_qSQxhX/chat" target="_blank" rel="noopener noreferrer">터잡이와 상담하기 ↗</a><button class="outline" data-explore="copy-consult">상담할 매물 정보 복사</button><small>주소와 가격을 복사해서 상담 채널에 보내주세요.</small></div>');
      closeContext=mountInlineContext($('#context-facts'),data.listing);closeRecords=mountBuildingRecords($('#building-records'),$('#building-records-toggle'),data.listing);closeLand=mountLandRecords($('#land-area-comparison'),$('#land-records'),$('#land-records-toggle'),data.listing);map.select(data.listing);$('#detail-title').focus({preventScroll:true});
      $('.detail-shortcuts').insertAdjacentHTML('beforeend','<button data-explore="section" data-section="property-transactions">주변 실거래</button>');
      loadNearby(id,current);
      if(updateUrl)history.pushState(null,'',`#listing=${encodeURIComponent(id)}`);
      if(data.listing.pnu) {
        let receivedParcel;
        try {const response=await apiFetch(`/api/parcels/${data.listing.pnu}`,{signal:abort.signal});receivedParcel=await response.json();}
        catch {receivedParcel={status:'error'};}
        if(disposed||current!==detailVersion)return;
        parcel=receivedParcel;
        if(parcel.status==='ready')map.parcel(parcel.geometry);
        if($('#parcel-status'))$('#parcel-status').textContent=parcel.status==='ready'?parcelMessage():'필지 경계를 확인하지 못했습니다. 핀 위치만 표시합니다.';
      }
    } catch {
      if(disposed||current!==detailVersion)return;
      $('#listing-detail').innerHTML='<div class="detail-top"><span>매물을 불러오지 못했어요.</span><button class="detail-close" data-explore="close" aria-label="매물 상세 닫기">×</button></div><button class="outline" data-explore="retry-detail">다시 시도</button>';
    }
  }
  function syncTransactionToggle() {
    for(const button of root.querySelectorAll('[data-explore="transactions"]')) {
      button.hidden=!selected;button.disabled=!nearby?.cases?.length;
      button.setAttribute('aria-pressed',String(showTransactions));
      button.textContent=`실거래 ${showTransactions?'표시 켜짐':'표시 꺼짐'}${nearby?.cases?.length?` (${nearby.cases.length})`:''}`;
    }
  }
  function renderNearby() {
    const container=$('#nearby-cases');if(!container)return;
    if(nearby?.status==='error'){container.innerHTML='<p class="case-note">주변 실거래를 불러오지 못했어요.</p><button class="outline" data-explore="retry-transactions">다시 불러오기</button>';return;}
    if(nearby?.status!=='ready'){container.innerHTML='<p class="case-note">이 매물의 주변 거래 자료를 확인하지 못했어요.</p>';return;}
    if(!nearby.cases.length){container.innerHTML='<p class="case-note">반경 1km 안에서 최근 36개월의 토지·건물 거래를 찾지 못했어요.</p>';return;}
    container.innerHTML=`<p class="case-note">최근 36개월 · 반경 ${nearby.radiusMeters===1000?'1km':'500m'} · 가까운 필지 ${nearby.cases.length}곳 · 최대 5곳${nearby.expanded?' (500m 안에서 5곳 미만이라 범위를 넓혔어요)':''}</p>${nearby.insufficient?`<p class="case-note">반경 1km 안에서 확인된 거래는 ${nearby.cases.length}곳이에요.</p>`:''}<div class="nearby-case-list">${nearby.cases.map((item,index)=>`<article class="nearby-case" data-transaction-id="${esc(item.id)}" tabindex="-1"><div class="nearby-card-top"><div class="nearby-case-meta"><span class="transaction-number">${index+1}</span><b>${item.kind==='land'?'토지':'건물'} 거래</b><span>${Math.round(item.distanceMeters)}m</span></div><button class="outline nearby-map-button" data-explore="transaction" data-id="${esc(item.id)}">지도 보기</button></div><strong class="nearby-price">${money(item.priceWon)}</strong><div class="nearby-facts"><span title="${esc(item.address||'')}">지번 ${Number(item.pnu.slice(11,15))}${Number(item.pnu.slice(15))?'-'+Number(item.pnu.slice(15)):''}</span><span>대지 ${area(item.areaM2)}</span><span>연면적 ${item.kind==='building'?area(item.floorAreaM2):'—'}</span><span>${esc(item.dealDate)}</span></div>${item.ownershipTransferConfirmed?'<small class="transaction-evidence">수집자료상 소유권이전 확인</small>':''}</article>`).join('')}</div><p class="case-note">매물 핀 기준 직선거리입니다. 서로 다른 필지의 거래 참고자료이며, 거래 취소 여부와 현재 시세를 보증하지 않습니다.</p>`;
  }
  async function loadNearby(id,current) {
    nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('#nearby-cases').innerHTML='<p class="case-note">가까운 토지·건물 거래를 찾고 있어요.</p>';
    try {
      const response=await apiFetch(`/api/nearby-transactions/${encodeURIComponent(id)}`,{signal:abort.signal}),data=await response.json();
      if(disposed||current!==detailVersion)return;
      if(!response.ok||data.status!=='ready'||data.listingId!==id)throw new Error('Nearby unavailable');
      nearby=data;map.setTransactions(data.cases);map.setTransactionsVisible(showTransactions);
    } catch {if(disposed||current!==detailVersion)return;nearby={status:'error',cases:[]};}
    renderNearby();syncTransactionToggle();
  }
  root.addEventListener('submit',event=>{
    if(event.target.id!=='explore-filters')return;event.preventDefault();
    const values=new FormData(event.target);query='';sort=values.get('sort');
    limit=5;closeDetail();load();
  },{signal:abort.signal});
  root.addEventListener('click',async event=>{
    const unitButton=event.target.closest('[data-area-unit]');
    if(unitButton){setAreaDisplayUnit(unitButton.dataset.areaUnit);return;}
    const button=event.target.closest('[data-explore]');if(!button||button.disabled)return;
    switch(button.dataset.explore) {
      case 'favorite':{
        const row=result?.groups.find(g=>g.representative.id===button.dataset.id)?.representative;if(!row)break;
        button.disabled=true;try{if(member.get('favorite',row.id))await member.remove('favorite',row.id);else await member.save('favorite',row.id,row);}catch(error){$('.discovery-notice').textContent=error.message;}button.disabled=false;break;
      }
      case 'feedback':{const row=result?.groups.find(g=>g.representative.id===button.dataset.id)?.representative;if(row)openFeedback(row);break;}
      case 'compare-toggle':{
        const id=button.dataset.id,row=result?.groups.find(g=>g.representative.id===id)?.representative;
        if(compared.has(id))compared.delete(id);else if(row&&compared.size<3)compared.set(id,row);else $('.discovery-notice').textContent='최대 3개까지 비교할 수 있어요.';
        if(result)drawCards();break;
      }
      case 'compare-open':closeComparison?.();closeComparison=openComparison([...compared.values()],id=>openDetail(id));break;
      case 'compare-clear':compared.clear();if(result)drawCards();break;
      case 'pins':showPins=!showPins;button.setAttribute('aria-pressed',String(showPins));map.setVisible(showPins);break;
      case 'transactions':showTransactions=!showTransactions;map.setTransactionsVisible(showTransactions);syncTransactionToggle();break;
      case 'retry-transactions':if(selected)loadNearby(selected,detailVersion);break;
      case 'sheet-toggle':setSheet(sheet.classList.contains('collapsed'));break;
      case 'return-detail':setSheet(true);$('.explore-board').classList.remove('transaction-map-open');break;
      case 'transaction':
        setSheet(false);
        showTransactions=true;map.setTransactionsVisible(true);syncTransactionToggle();map.focusTransaction(button.dataset.id);
        $('.explore-board').dataset.pane='map';$('.explore-board').classList.add('transaction-map-open');
        root.querySelectorAll('[data-explore="pane"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value==='map')));break;
      case 'suggestion':{
        const s=result?.suggestions?.[Number(button.dataset.index)];if(!s)break;
        if(s.key==='budgetWon')conditions={...conditions,budgetWon:s.value};
        if(s.key==='district')conditions={...conditions,districts:[s.value]};
        if(s.key==='minAreaM2'){criteria.minAreaM2=s.value;criteria.minArea=areaInput(s.value,criteria.areaUnit);}
        if(s.key==='maxAreaM2'){criteria.maxAreaM2=s.value;criteria.maxArea=areaInput(s.value,criteria.areaUnit);}
        if(s.key==='q')query='';
        if(s.key==='bounds')bounds=null;if(s.key==='zone')criteria.zones=s.value?[s.value]:[];
        if(s.key==='excludeEducation')criteria.excludeEducation=false;
        if(s.key==='excludeHeritage')criteria.excludeHeritage=false;
        if(s.key==='minRoadWidthM')criteria.minRoadWidthM=s.value??null;
        applySuggestion();break;
      }
      case 'copy-consult':
        try{await navigator.clipboard.writeText(`터잡이 매물 상담 요청\n${detail.listing.address}\n매매가격 ${money(detail.listing.priceWon)}\n대지 ${areaText(detail.listing.areaM2)} · 연면적 ${areaText(detail.listing.floorAreaM2)}`);button.textContent='상담 정보 복사됨';}catch{button.textContent='주소와 가격을 선택해 복사해 주세요.';}break;
      case 'edit':onEdit?.();break;
      case 'detail':openDetail(button.dataset.id);break;
      case 'retry-detail':openDetail(selected);break;
      case 'back-list':setSheet(true);closeDetail();break;
      case 'close':closeDetail();break;
      case 'more':limit=Math.min(500,limit+20);load({fit:false});break;
      case 'retry':load();break;
      case 'pane':$('.explore-board').dataset.pane=button.dataset.value;root.querySelectorAll('[data-explore="pane"]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));break;
      case 'search-map':if(mapView){bounds=mapView.bounds;limit=5;closeDetail();load({fit:false});}break;
      case 'clear-bounds':bounds=null;limit=5;load();break;
      case 'reset-map':map.resetView();break;
      case 'retry-map':map.mount(result?.groups||[],selected,true);break;
      case 'analyze-site':if(detail)onAnalyze?.(detail.listing);break;
      case 'street':if(detail){closeStreet?.();closeStreet=await openStreetView(detail.listing.position,detail.listing.address||rowTitle(detail.listing));if(disposed)closeStreet?.();}break;
      case 'section':$(`#${button.dataset.section}`).scrollIntoView({behavior:'smooth',block:'start'});break;
      case 'copy-address':
        try {await navigator.clipboard.writeText(detail.listing.address||rowTitle(detail.listing));button.textContent='주소 복사됨';}
        catch {button.textContent='주소를 선택해 복사해 주세요.';}break;

    }
  },{signal:abort.signal});
  window.addEventListener('keydown',event=>{if(!event.defaultPrevented&&event.key==='Escape'&&selected&&!document.querySelector('dialog[open]'))closeDetail();},{signal:abort.signal});
  window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.hash.slice(1)).get('listing');if(id)openDetail(id,false);else closeDetail(false);},{signal:abort.signal});
  let hiddenKey=member.hiddenIds().sort().join(',');
  member.addEventListener('change',()=>{if(disposed)return;const next=member.hiddenIds().sort().join(',');if(next!==hiddenKey){hiddenKey=next;load({fit:false});}else if(result)drawCards();},{signal:abort.signal});
  load();
  function applySuggestion(){
    updateCriteria();quickFilters?.update();
    quickFilters?.setRemembered(onConditionsChange?.(currentConditions())!==false);
    limit=5;closeDetail();load();
  }
  return ()=>{document.body.classList.remove('map-results-open');disposed=true;clearTimeout(loadTimer);quickFilters.destroy();abort.abort();closeComparison?.();closeContext?.();closeRecords?.();closeLand?.();closeStreet?.();map.destroy();};
}

