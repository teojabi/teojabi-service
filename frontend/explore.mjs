import { apiFetch } from './api-client.mjs';
import { ListingMap, openStreetView, mountStreetPreview } from './map-controller.mjs';
import { mountInlineContext } from './inline-context.mjs';
import { mountBuildingRecords } from './building-records.mjs';
import { mountLandRecords } from './land-records.mjs';
import { mountCommercial, renderCommercial, commercialAsk } from './commercial-context.mjs';
import { mountSurrounding } from './surrounding-context.mjs';
import { PURPOSES } from './search-options.mjs';
import { openComparison } from './compare.mjs';
import { member,openFeedback } from './member.mjs';
import { mountQuickFilters } from './quick-filters.mjs';
import { areaInput } from './recent-search.mjs';
import { BUILD_DEFAULTS,validateBuildCriteria,appendBuildQuery } from './build-criteria.mjs';
import { areaMarkup,areaUnitControls,getAreaDisplayUnit,setAreaDisplayUnit,areaDisplayEvents,refreshAreaDisplay,formatArea } from './area-display.mjs';
import { mountAuctionFilters } from './auction-filters.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dday=value=>{if(!value)return '';const t=new Date(String(value)+'T00:00:00');if(!Number.isFinite(t.getTime()))return '';const n=Math.ceil((t-Date.now())/86400000);return n>=0?`D-${n}`:'기일 지남';};
const money=value=>value>0?`${(value/1e8).toLocaleString('ko-KR',{maximumFractionDigits:3})}억원`:'가격 확인 중';
const area=areaMarkup;
const areaText=value=>formatArea(value,getAreaDisplayUnit());
const rowTitle=row=>`${row.district} ${row.neighborhood||''}`.trim();
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
const compactSuggestionLabel=label=>String(label).replace(/볼까요\??/g,'').replace(/으로 넓혀/g,'').replace(/까지 높여/g,'까지').replace(/이하로 줄여/g,'이하').replace(/만 /g,'').replace(/부터 살펴/g,'부터').replace(/조건을 /g,'').replace(/제한 /g,'').replace(/을 풀어/g,' 해제').trim();
const percent=value=>Number.isFinite(Number(value))&&Number(value)>0?`${Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2})}%`:'';
const DOCUMENT_LINKS=Object.freeze({registry:'https://www.iros.go.kr/'});
const normalizeFloorScale=value=>{
  const text=String(value||'').trim();
  const m=text.match(/^-?(\d+)\s*\/\s*(\d+)$/);
  if(!m)return text;
  const below=text.startsWith('-')?Number(m[1]):0,above=Number(m[2]),parts=[];
  if(below)parts.push(`지하 ${below}층`);
  if(above)parts.push(`지상 ${above}층`);
  return parts.join(' / ')||text;
};
const detailFactItems=row=>{
  const facts=row.buildingFacts||{},items=[];
  const landArea=row.areaM2||facts.landAreaM2||null;
  const floorArea=row.floorAreaM2||facts.floorAreaM2||null;
  items.push(['대지면적',area(landArea)]);
  items.push(['연면적',area(floorArea)]);
  if(facts.floorAreaM2&&(!floorArea||Number(facts.floorAreaM2)!==Number(floorArea)))items.push(['기존 연면적',area(facts.floorAreaM2)]);
  const floorScale=facts.floorScale||normalizeFloorScale(row.floorInfo);
  if(floorScale)items.push(['기존 규모',esc(floorScale)]);
  const farPercent=facts.farPercent||row.farPercent;
  if(farPercent)items.push(['기존 용적률',esc(percent(farPercent))]);
  const mainUse=facts.mainUse||(row.kind==='land'?'':row.mainUse);
  if(mainUse)items.push(['용도',esc(mainUse)]);
  const approvalDate=facts.approvalDate||row.approvalDate;
  if(approvalDate)items.push(['사용승인',esc(approvalDate)]);
  return items;
};
// 경매 물건(auction_item)을 건물찾기 카드·지도·상세가 쓰는 매물 모양으로 맞춘다.
const AUCTION_LAND_RE=/토지|대지|임야|전답|잡종지|과수원|답|전/;
const AUCTION_DEAL_LABEL={whole:'건물 통',floor:'층',unit:'호실',land:'토지',vehicle:'차량'};
// 법원 소재지를 대지위치(지번)와 상세주소(건물·호)로 나눈다.
const splitAuctionAddress=row=>{
  const full=String(row.full_address||'').trim(),lot=String(row.lot_no||'').trim();
  let land=full,detail=String(row.building_list||'').trim();
  if(lot){const idx=full.indexOf(lot);if(idx>=0){land=full.slice(0,idx+lot.length).trim();const rest=full.slice(idx+lot.length).trim();if(rest)detail=rest;}}
  if(!land)land=[row.sido,row.sigu,row.dong,lot].map(v=>String(v||'').trim()).filter(Boolean).join(' ');
  return {land,detail};
};
const auctionToListing=row=>{
  const usage=String(row.usage_name||''),zone=String(row.use_zone||'');
  const position=Number.isFinite(row.lat)&&Number.isFinite(row.lng)?{lat:Number(row.lat),lng:Number(row.lng)}:null;
  const broad=/주거/.test(zone)?'주거지역':/상업/.test(zone)?'상업지역':/공업/.test(zone)?'공업지역':/녹지/.test(zone)?'녹지지역':null;
  const id=`auction:${row.docid}`,addr=splitAuctionAddress(row);
  const dealType=row.deal_type||(AUCTION_LAND_RE.test(usage)?'land':(/\d+\s*호/.test(String(row.full_address||'')+String(row.building_list||''))?'unit':'whole'));
  return {id,source:'auction',sourceId:String(row.docid),cohort:'auction',dealType,verifyStatus:row.verify_status||null,verify:row.verify_data||null,
    district:row.sigu||'',neighborhood:row.dong||'',address:addr.land,detailAddress:addr.detail,
    pnu:/^\d{19}$/.test(String(row.pnu||''))?row.pnu:null,position,
    priceWon:row.min_price==null?null:Number(row.min_price),areaM2:row.area_max==null?null:Number(row.area_max),
    floorAreaM2:null,kind:AUCTION_LAND_RE.test(usage)?'land':'building',kindConfirmed:true,
    description:'',floorInfo:'',areaSource:'listing',floorAreaSource:'listing',locationStatus:'pin-estimated',
    zoning:zone?{status:'matched',groups:broad?[broad]:[],entries:[{name:zone}]}:{status:'missing',groups:[],entries:[]},
    development:null,nearbyTransactions:{status:'unavailable',cases:[]},groupKey:id,
    auction:{docid:String(row.docid),usageName:usage,minPrice:row.min_price==null?null:Number(row.min_price),
      appraisedWon:row.appraised_amt==null?null:Number(row.appraised_amt),failCount:row.fail_count==null?null:Number(row.fail_count),
      saleDate:row.sale_date||'',saleHour:row.sale_hour||'',courtName:row.court_name||'',deptName:row.dept_name||'',
      caseNo:row.case_no||'',notiMinRate:row.noti_min_rate==null?null:Number(row.noti_min_rate),roadWidthM:row.road_width_m==null?null:Number(row.road_width_m),
      jimok:row.jimok||'',lotNo:row.lot_no||'',sourceUrl:row.source_url||'https://www.courtauction.go.kr/'}};
};

// 공매(온비드) 물건을 건물찾기 카드·지도·상세가 쓰는 매물 모양으로 맞춘다.
const onbidToListing=row=>{
  const usage=String(row.usg_mcls_nm||row.usg_lcls_nm||'');
  const land=/토지|대지|임야|전답|잡종지|과수원|답/.test(usage);
  const id=`onbid:${row.cltr_mng_no}::${row.pbct_cdtn_no}`;
  return {id,source:'onbid',sourceId:String(row.cltr_mng_no),cohort:'onbid',dealType:row.deal_type||(land?'land':null),
    district:row.sigu||'',neighborhood:row.dong||'',address:row.full_address||'',detailAddress:'',
    pnu:/^11\d{17}$/.test(String(row.pnu||''))?row.pnu:null,
    position:Number.isFinite(row.lat)&&Number.isFinite(row.lng)?{lat:Number(row.lat),lng:Number(row.lng)}:null,
    priceWon:row.lowst_bid_prc==null?null:Number(row.lowst_bid_prc),areaM2:null,floorAreaM2:null,
    kind:land?'land':'building',kindConfirmed:true,description:'',floorInfo:'',areaSource:'listing',floorAreaSource:'listing',
    locationStatus:'pin-estimated',zoning:{status:'missing',groups:[],entries:[]},development:null,
    nearbyTransactions:{status:'unavailable',cases:[]},groupKey:id,
    auction:{docid:id,usageName:usage,minPrice:row.lowst_bid_prc==null?null:Number(row.lowst_bid_prc),
      appraisedWon:row.appraised_amt==null?null:Number(row.appraised_amt),failCount:null,saleDate:row.bid_end_dt||'',saleHour:'',
      courtName:'한국자산관리공사',deptName:row.prpt_div_nm||'',caseNo:row.cltr_mng_no||'',
      notiMinRate:row.apsl_ctrs_lowst_ratio==null?null:Number(row.apsl_ctrs_lowst_ratio),roadWidthM:null,jimok:'',
      lotNo:row.lot_no||'',sourceUrl:'https://www.onbid.co.kr/'}};
};

export function mountExplorer(root,{conditions,onEdit,onConditionsChange,onAnalyze,initialId,initialSource,assistant,picksOnly}={}) {
  document.body.classList.add('map-results-open');
  const picksOnlyMode=Boolean(picksOnly);
  const abort=new AbortController();let disposed=false,version=0,detailVersion=0,closeStreet,closeStreetPreview,closeContext,closeRecords,closeLand,closeCommercial,closeSurrounding;
  let result=null,selected=null,detail=null,parcel=null,limit=5,bounds=conditions?.bounds||null,query='',sort=conditions?.sort==='price-desc'?'price-desc':'price',mapView=null;
  let assistantResult=assistant&&Array.isArray(assistant.groups)?assistant:null;
  let source=assistantResult?'assistant':initialSource==='favorites'?'favorites':initialSource==='auction'?'auction':'conditions';
  const conditionAuction=conditions?.auction||null;
  let auctionFilters={listingSource:'court',gu:[...(conditions?.districts||[])],usage:(conditionAuction?.usages||[])[0]||'',dealType:'',kind:'',sort:'sale',maxPrice:conditionAuction?.maxPriceWon?String(conditionAuction.maxPriceWon/1e8):'',maxBidRate:conditionAuction?.maxBidRate!=null?String(conditionAuction.maxBidRate):'',failMax:''};
  if(source==='auction')limit=100;
  let criteria={purpose:conditions?.purpose||null,minArea:conditions?.minArea||'',maxArea:conditions?.maxArea||'',areaUnit:conditions?.areaUnit||'pyeong',zones:conditions?.zones||[],minAreaM2:conditions?.minAreaM2??null,maxAreaM2:conditions?.maxAreaM2??null,auction:conditions?.auction||null,...BUILD_DEFAULTS,...(validateBuildCriteria(conditions||{}).value||{})};
  const defaultTitle=()=>source==='assistant'?'AI 비서 결과':source==='favorites'?'찜한 매물':source==='auction'?'경매 물건':picksOnlyMode?'터잡이 선별 매물':conditions?'내 조건으로 살펴보기':'지도에서 매물 살펴보기';
  const title=defaultTitle();
  root.innerHTML=`<section class="explore-page"><div class="result-head"><div><span class="eyebrow">EXPLORE TEOJABI</span><h1>${title}</h1></div><button class="outline" data-explore="back-conditions" hidden>내 조건으로 보기</button><button class="outline" data-explore="edit">검색 조건 바꾸기</button></div>
    <form class="explore-search" id="explore-filters"><div class="explore-filters"><label><span>정렬</span><select name="sort"><option value="price" ${sort==='price'?'selected':''}>가격 낮은 순</option><option value="price-desc" ${sort==='price-desc'?'selected':''}>가격 높은 순</option></select></label><button class="primary" type="submit">이 조건 검색</button></div></form>
    <p class="purpose-guide" id="purpose-guide" hidden></p>
    <div class="auction-filters" id="auction-filters" hidden></div>
    <div class="explore-toolbar"><div class="quick-filters"></div><span id="bounds-chip"></span><div class="explore-toggle" role="group" aria-label="결과 보기 방식"><button data-explore="pane" data-value="list" aria-pressed="true">리스트</button><button data-explore="pane" data-value="map" aria-pressed="false">지도</button></div></div>
    <div class="explore-board" data-pane="list"><div class="explore-list"><p id="result-count" aria-live="polite">저장된 매물을 불러오고 있어요.</p><div id="listing-list"></div><button class="outline more-listings" data-explore="more" hidden>매물 더 보기</button></div>
      <div class="map-frame"><div id="map-host" role="region" aria-label="매물 위치 지도"></div><div class="map-controls"><button class="outline" data-explore="favorites" aria-pressed="false">♥ 찜한 매물</button><button class="outline" data-explore="auction" aria-pressed="false">경매 물건</button><button class="outline" data-explore="all-picks" aria-pressed="false">★ 터잡이 추천</button><button class="outline" data-explore="cadastral" aria-pressed="false">지적도</button><button class="outline" data-explore="reset-map" aria-label="현재 매물 전체 위치 보기">전체 위치</button></div><div id="map-status" class="map-status" role="status">네이버 지도를 불러오고 있어요.</div><div id="commercial-popup" class="commercial-popup" hidden></div><p class="map-disclaimer">*지도서비스에 정보는 법적 효력이 없으며 참고 자료로만 활용이 가능합니다.</p></div>
      <aside id="listing-detail" class="detail-panel" aria-label="매물 상세" hidden></aside></div><p class="explore-foot" id="explore-foot"></p></section>`;
  const $=selector=>root.querySelector(selector);
  const favoriteItems=()=>member.items.filter(item=>item.kind==='favorite');
  $('#listing-list').before($('#explore-filters'));
  let listScrollTop=0;
  const compared=new Map();let closeComparison,showPins=true,showTransactions=true,showAllPicks=false,pickGroups=null,nearby=null,loadTimer=null,quickFilters,assistantShown=5,commercialPopupVersion=0;
  $('.map-controls').insertAdjacentHTML('beforeend','<button class="outline" data-explore="transactions" aria-pressed="true" hidden>실거래</button><button class="outline" data-explore="commercial" aria-pressed="false">상권</button><button class="outline return-detail" data-explore="return-detail">매물 상세로 돌아가기</button>');
  $('.explore-toolbar').insertAdjacentHTML('afterend','<div class="discovery-actions"><button class="outline" data-explore="compare-open" disabled>비교할 매물을 골라주세요 (최대 3개)</button><button class="outline" data-explore="compare-clear" hidden>비교 선택 지우기</button><button class="outline" data-explore="pins" aria-pressed="true">지도 매물 표시</button><span class="discovery-notice" role="status"></span></div><div class="search-suggestions" aria-live="polite"></div>');
  if(picksOnlyMode)$('[data-explore="all-picks"]').setAttribute('aria-pressed','true');
  function drawCompare(){const n=compared.size,b=$('[data-explore=compare-open]');b.disabled=n<2;b.textContent=n?`선택 ${n}개 비교하기`:'비교할 매물을 골라주세요 (최대 3개)';$('[data-explore=compare-clear]').hidden=!n;}
  function applySourceUi(){
    const simpleMode=source==='favorites'||source==='assistant';
    const auctionMode=source==='auction';
    page.classList.toggle('favorites-mode',simpleMode);
    page.classList.toggle('assistant-mode',source==='assistant');
    page.classList.toggle('auction-mode',auctionMode);
    const back=$('[data-explore="back-conditions"]'),edit=$('[data-explore="edit"]'),fav=$('[data-explore="favorites"]'),auc=$('[data-explore="auction"]');
    if(back)back.hidden=!simpleMode;
    if(edit){edit.hidden=simpleMode;edit.textContent=auctionMode?'조건 바꾸기':'검색 조건 바꾸기';}
    if(fav)fav.setAttribute('aria-pressed',String(source==='favorites'));if(auc)auc.setAttribute('aria-pressed',String(auctionMode));
    const heading=$('.result-head h1');if(heading)heading.textContent=defaultTitle();
    const auctionHost=$('#auction-filters');if(auctionHost)auctionHost.hidden=!auctionMode;
    const quick=$('.quick-filters');if(quick)quick.hidden=auctionMode;
    const searchForm=$('#explore-filters');if(searchForm)searchForm.hidden=auctionMode;
  }
  function setSource(next){
    if(next===source)return;
    source=next;showAllPicks=false;selected=null;compared.clear();assistantShown=5;
    if(next==='auction')limit=100;else if(next==='conditions')limit=5;
    closeDetail();applySourceUi();
    history.replaceState(null,'',source==='favorites'?location.pathname+'#favorites':source==='auction'?location.pathname+'#auction':location.pathname+(conditions?'#search':''));
    load();
  }
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
  function setSheet(open){const mobile=matchMedia('(max-width:700px)').matches;sheet.classList.toggle('collapsed',!open);body.hidden=false;sheet.querySelector('.sheet-handle').setAttribute('aria-expanded',String(open));sheet.querySelector('.sheet-label').textContent=open?'조건·매물 접기':`조건·매물 보기${result?' · '+result.totalParcels+'개':''}`;sheet.querySelector('.sheet-arrow').textContent=mobile?(open?'◁':'▷'):(open?'⌄':'⌃');}
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
  const auctionFiltersUi=mountAuctionFilters($('#auction-filters'),{getValue:()=>auctionFilters,onChange:next=>{
    auctionFilters={...auctionFilters,...next};
    ++version;limit=100;closeDetail(true,false);clearTimeout(loadTimer);
    body.scrollTop=0;
    $('#result-count').textContent='변경한 조건으로 경매 물건을 찾고 있어요.';
    load();
  }});
  const map=new ListingMap($('#map-host'),{areaUnit:getAreaDisplayUnit(),onSelect:id=>openDetail(id),onMapClick:()=>{if(matchMedia('(max-width:700px)').matches)setSheet(false);window.dispatchEvent(new CustomEvent('teojabi-map-click'));},onTransaction:id=>{
    setSheet(true);
    $('.explore-board').classList.remove('transaction-map-open');
    const card=root.querySelector(`[data-transaction-id="${CSS.escape(id)}"]`);
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.focus({preventScroll:true});}
  },onCommercial:area=>{
    const popup=$('#commercial-popup');
    const version=++commercialPopupVersion;
    popup.hidden=false;
    popup.innerHTML='<div class="commercial-popup-inner"><button type="button" class="commercial-popup-close" data-commercial-close aria-label="닫기">×</button><p class="case-note">상권 정보를 불러오고 있어요.</p></div>';
    apiFetch(`/api/commercial?lat=${area.lat}&lng=${area.lng}&radius=100`,{signal:abort.signal}).then(response=>response.json()).then(data=>{
      if(disposed||version!==commercialPopupVersion)return;
      popup.innerHTML=`<div class="commercial-popup-inner"><button type="button" class="commercial-popup-close" data-commercial-close aria-label="닫기">×</button>${renderCommercial(data,{trend:'quarter'})}</div>`;
    }).catch(()=>{if(!disposed&&version===commercialPopupVersion)popup.innerHTML='<div class="commercial-popup-inner"><button type="button" class="commercial-popup-close" data-commercial-close aria-label="닫기">×</button><p class="case-note">상권 정보를 불러오지 못했어요.</p></div>';});
  },onMove:view=>{
    mapView=view;const button=$('[data-explore="search-map"]');if(button)button.disabled=false;
  },onStatus:(status,message)=>{
    if(disposed)return;
    $('#map-status').hidden=status==='ready';
    if(status==='error')$('#map-status').innerHTML=`<p>${esc(message)}</p><button class="outline" data-explore="retry-map">지도 다시 연결</button>`;
    if(status==='ready' && result)map.setGroups(showAllPicks?(pickGroups||[]):mapGroups(),selected,true);
    if(status==='ready' && detail)map.select(detail.listing);
    if(status==='ready' && parcel?.status==='ready')map.parcel(parcel.geometry);
    if(status==='ready' && nearby?.status==='ready'){map.setTransactions(nearby.cases);map.setTransactionsVisible(showTransactions);}
    if($('#parcel-status') && parcel?.status==='ready')$('#parcel-status').textContent=parcelMessage();
    if(status==='error'){const searchMap=$('[data-explore="search-map"]');if(searchMap)searchMap.disabled=true;}
  }});
  areaDisplayEvents.addEventListener('change',()=>{refreshAreaDisplay(root);map.setAreaUnit(getAreaDisplayUnit());},{signal:abort.signal});
  map.mount([],null,false);
  const parcelMessage=()=>map.ready?'연결된 필지 경계를 지도에 표시했습니다.':'필지 경계를 불러왔습니다. 지도 연결 후 표시됩니다.';
  function card(group) {
    const row=group.representative;
    return `<article class="property-card${group.listings.some(r=>r.id===selected)?' selected':''}" data-card-id="${esc(row.id)}"><button class="property-select" data-explore="detail" data-id="${esc(row.id)}" aria-label="${esc(rowTitle(row))} ${money(row.priceWon)} 상세 보기"><div class="property-location"><span>${esc(rowTitle(row))}</span>${row.cohort==='auction'?'<em class="pick-badge auction-badge">경매</em>':row.cohort==='disco'?'<em class="pick-badge disco-badge">디스코 매물</em>':row.cohort==='existing'?'<em class="pick-badge">★ 터잡이 추천</em>':'<em class="pick-badge origin-naver">네이버 매물</em>'}${member.get('favorite',row.id)?'<em class="pick-badge favorite-badge">♥ 찜한 물건</em>':''}</div><h2>${money(row.priceWon)}</h2><div class="area-pair"><span>대지 <b>${area(row.areaM2)}</b></span><span>연면적 <b>${area(row.floorAreaM2)}</b></span></div><p class="property-zoning">${esc(row.zoning?.groups?.length?row.zoning.groups.join(' · '):'용도지역 미확인')}</p><p class="property-description">${esc(row.description||'매물 설명이 기재되지 않았어요.')}</p><span class="property-link">상세 보기 <span aria-hidden="true">↗</span></span></button></article>`;
  }
  // 경매 물건 카드: 건물찾기 카드와 같은 골격에 경매 사실정보(감정가·최저가·기일·유찰)를 담는다.
  function auctionCard(group) {
    const row=group.representative,a=row.auction||{},isOnbid=row.cohort==='onbid';
    const badge=`${isOnbid?'공매':'경매'}${AUCTION_DEAL_LABEL[row.dealType]?` · ${AUCTION_DEAL_LABEL[row.dealType]}`:''}`;
    const priceLabel=isOnbid?'최저입찰가':'최저매각가';
    const dateNote=isOnbid?`입찰마감 ${esc(a.saleDate||'')} ${dday(a.saleDate)}`:`매각기일 ${esc(a.saleDate||'')} ${dday(a.saleDate)} · 유찰 ${a.failCount??0}회`;
    return `<article class="property-card${selected===row.id?' selected':''}" data-card-id="${esc(row.id)}"><button class="property-select" data-explore="detail" data-id="${esc(row.id)}" aria-label="${esc(rowTitle(row))} ${money(row.priceWon)} 상세 보기"><div class="property-location"><span>${esc(rowTitle(row))}</span><em class="pick-badge auction-badge">${badge}</em>${member.get('favorite',row.id)?'<em class="pick-badge favorite-badge">♥ 찜한 물건</em>':''}</div><h2>${money(row.priceWon)}</h2><div class="area-pair"><span>감정가 <b>${money(a.appraisedWon)}</b></span><span>${priceLabel} <b>${money(a.minPrice)}</b></span></div><p class="property-zoning">${esc(a.usageName||'용도 미기재')} · ${esc(row.district||'')} ${esc(row.neighborhood||'')}</p><p class="property-description">${esc(a.caseNo||'')} · ${dateNote}</p><span class="property-link">상세 보기 <span aria-hidden="true">↗</span></span></button></article>`;
  }
  // AI 결과는 화면에 보이는 만큼(5개 → 더보기)만 지도에도 표시한다.
  const mapGroups=()=>source==='assistant'&&result?result.groups.slice(0,assistantShown):(result?.groups||[]);
  function drawCards() {
    const favoritesMode=source==='favorites',assistantMode=source==='assistant',auctionMode=source==='auction';
    const renderGroups=mapGroups();
    const renderCard=group=>['auction','onbid'].includes(group.representative.cohort)?auctionCard(group):card(group);
    $('#listing-list').innerHTML=renderGroups.map(renderCard).join('')||(favoritesMode?'<div class="empty"><h2>찜한 매물이 없어요.</h2><p>마음에 드는 매물을 ♡ 찜하면 여기에서 한 번에 볼 수 있어요.</p></div>':auctionMode?'<div class="empty"><h2>조건에 맞는 경매 물건이 없어요.</h2><p>지역·용도·최저가·유찰 조건을 바꿔 다시 찾아보세요.</p></div>':'<div class="empty"><h2>조건에 맞는 매물이 없어요.</h2><p>주소·면적·지도 범위를 바꾸거나 예산과 지역을 다시 선택해 주세요.</p></div>');
    if(auctionMode){
      const onbidMode=auctionFilters.listingSource==='onbid',label=onbidMode?'공매':'경매';
      $('#result-count').textContent=`${label} 물건 ${result.totalParcels.toLocaleString('ko-KR')}건 중 ${result.groups.length}건 표시`;
      $('[data-explore="more"]').hidden=!result.hasMore;
      $('[data-explore="more"]').textContent=`${label} 물건 더 보기`;
      $('#explore-foot').textContent=onbidMode?'한국자산관리공사 온비드 공매 물건 · 권리분석·적정 입찰가는 제공하지 않아요. 입찰 전 온비드 원문을 확인하세요.':'대법원 법원경매정보 공시 물건 · 아파트 제외 · 권리분석·적정 입찰가는 제공하지 않아요. 입찰 전 법원 원문을 확인하세요.';
      $('#bounds-chip').innerHTML='';
      $('.search-suggestions').replaceChildren();
      return;
    }
    if(favoritesMode){
      const missing=result.missingFavorites?.length||0;
      $('#result-count').textContent=`찜한 매물 ${result.totalParcels.toLocaleString('ko-KR')}개${missing?` · 제공 종료 ${missing}개`:''}`;
      $('[data-explore="more"]').hidden=true;
      $('#explore-foot').textContent='내 보관함에 저장한 찜 매물입니다. 면적은 매물 기재 기준 · 용도지역은 연결 필지의 보유 토지자료 기준입니다.';
      $('#bounds-chip').innerHTML='';
    } else if(assistantMode){
      const shown=Math.min(assistantShown,result.groups.length),remaining=Math.max(0,result.groups.length-shown);
      $('#result-count').textContent=`AI 비서 결과 · 조건 매칭 ${result.totalParcels.toLocaleString('ko-KR')}건 중 ${shown}건 표시`;
      const moreButton=$('[data-explore="more"]');
      moreButton.hidden=remaining<=0;
      moreButton.textContent=remaining>0?`더보기 (남은 ${remaining}건)`:'';
      $('#explore-foot').textContent=result.station?`${result.station.name}역 직선거리 기준입니다. 실제 보행 경로·시간과 다를 수 있어요.`:'AI 비서가 조건을 해석해 찾은 결과입니다. 실제와 다를 수 있어요.';
      $('#bounds-chip').innerHTML='';
    } else {
      let countText=`${result.totalParcels.toLocaleString('ko-KR')}개 매물`;
      if(result.auctionTotal)countText+=` · 경매 ${result.auctionTotal.toLocaleString('ko-KR')}건 포함`;
      $('#result-count').textContent=`${countText} · ${result.groups.length}개 표시`;
      if(criteria.preferTourism)$('#result-count').textContent+=result.tourismPreferredCount?` · 특화구역 ${result.tourismPreferredCount}개 우선`:' · 특화구역 우선대상 없음';
      $('[data-explore="more"]').hidden=!result.hasMore;
      $('#explore-foot').textContent=`선별 매물 미리보기 · ${date(result.observedAt)} 구성 · 면적은 매물 기재 기준 · 용도지역은 연결 필지의 보유 토지자료 기준입니다.`;
      if(criteria.purpose==='new-build')$('#explore-foot').textContent+=' 신축 용도는 계획한 용도이며 건축 가능 판정이 아닙니다. 도로폭·보호구역 제외 조건은 연결 필지의 저장 자료 기준으로, 해당 항목 미확인 매물은 제외됩니다.';
      $('#bounds-chip').innerHTML=bounds?'<button class="pill clear-bounds" data-explore="clear-bounds">지도 범위 해제 ×</button>':'';
    }
    for(const cardEl of root.querySelectorAll('[data-card-id]')){
      const id=cardEl.dataset.cardId;
      const rep=result?.groups.find(group=>group.representative.id===id)?.representative;
      if(rep?.cohort==='auction'||rep?.cohort==='onbid'){
        const saved=Boolean(member.get('favorite',id));
        cardEl.insertAdjacentHTML('beforeend',`<div class="property-actions"><button class="outline" data-explore="favorite" data-id="${esc(id)}" aria-pressed="${saved}">${saved?'♥ 찜함':'♡ 찜'}</button></div>`);
        continue;
      }
      cardEl.insertAdjacentHTML('beforeend',`<div class="property-actions"><button class="outline" data-explore="compare-toggle" data-id="${esc(id)}" aria-pressed="${compared.has(id)}">${compared.has(id)?'✓ 비교 선택됨':'＋ 비교'}</button><button class="outline" data-explore="favorite" data-id="${esc(id)}" aria-pressed="${Boolean(member.get('favorite',id))}">${member.get('favorite',id)?'♥ 찜함':'♡ 찜'}</button><button class="outline" data-explore="feedback" data-id="${esc(id)}">내 의견</button></div>`);
      if(!favoritesMode&&!assistantMode&&criteria.purpose==='new-build'){
        const facts=rep?.development,labels=[];
        if(criteria.preferTourism&&['contained','overlap'].includes(facts?.tourism))labels.push(facts.tourism==='contained'?'관광숙박특화구역 포함':'관광숙박특화구역 일부 걸침');
        if(criteria.minRoadWidthM&&facts?.roadWidthM)labels.push(`도로 ${facts.roadWidthM}m`);
        if(criteria.excludeEducation)labels.push('교육구역 겹침 없음');if(criteria.excludeHeritage)labels.push('문화재구역 겹침 없음');
        if(labels.length)cardEl.querySelector('.property-zoning').insertAdjacentHTML('afterend',`<p class="property-build-facts">${labels.map(esc).join(' · ')}</p>`);
      }
    }
    drawCompare();
    if(favoritesMode||assistantMode){$('.search-suggestions').replaceChildren();return;}
    $('.search-suggestions').innerHTML=result.suggestions?.length?`<b>${result.totalParcels>20?`${result.totalParcels.toLocaleString('ko-KR')}개 · 좁혀보기`:result.totalParcels===0?'0개 · 넓혀보기':`${result.totalParcels}개 · 넓혀보기`}</b><div class="suggestion-chip-row">${result.suggestions.map((s,i)=>`<button class="outline suggestion-chip" data-explore="suggestion" data-index="${i}" title="${esc(s.label)}" ${$('.explore-list').getAttribute('aria-busy')==='true'?'disabled':''}><span>${esc(compactSuggestionLabel(s.label))}</span><strong>${s.count.toLocaleString('ko-KR')}개</strong></button>`).join('')}</div>`:'';
    if(!result.suggestions?.length&&(result.totalParcels>20||result.totalParcels<5))$('.search-suggestions').innerHTML=`<b>${result.totalParcels>20?'매물이 많아요':'조건이 좁아요'}</b><div class="suggestion-chip-row"><button class="outline suggestion-chip" data-explore="edit"><span>조건 직접 조정</span></button></div>`;
    const suggestions=$('.search-suggestions');
    if(suggestions.innerHTML)suggestions.innerHTML=`<div class="compact-suggestions" role="group" aria-label="조건 조정 제안"><span>조건 제안</span>${suggestions.innerHTML}</div>`;
  }
  async function load({fit=true}={}) {
    clearTimeout(loadTimer);
    if(source==='assistant')return loadAssistant();
    if(source==='favorites')return loadFavorites({fit});
    if(source==='auction')return loadAuctions({fit});
    quickFilters.setRemembered(onConditionsChange?.(currentConditions())!==false);
    const current=++version;const params=new URLSearchParams({limit,sort});if(picksOnlyMode)params.set('cohort','existing');
    if(conditions?.budgetWon)params.set('budgetWon',conditions.budgetWon);conditions?.districts?.forEach(d=>params.append('district',d));conditions?.neighborhoods?.forEach(n=>params.append('neighborhood',n));
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
      result=data;
      $('.explore-list').removeAttribute('aria-busy');drawCards();map.setGroups(showAllPicks?(pickGroups||[]):mapGroups(),selected,fit);
      if(initialId){const id=initialId;initialId=null;openDetail(id);}
    } catch(error) {
      if(disposed||current!==version)return;
      result=null;map.setGroups([],null,false);closeDetail(false);
      $('#result-count').textContent='매물 자료를 확인하지 못했어요.';
      $('#listing-list').innerHTML=`<div class="empty"><h2>${error.message==='PRICE_UNIT_UNCONFIRMED'?'가격 단위를 확인하고 있어요.':error.message==='ZONING_UNAVAILABLE'?'용도지역 자료 연결을 확인해 주세요.':error.message==='DEVELOPMENT_UNAVAILABLE'?'신축 조건에 사용할 도로·구역 자료를 확인해 주세요.':'로컬 매물 연결을 확인해 주세요.'}</h2><p>연결 실패를 검색 결과 0건으로 표시하지 않습니다.</p><button class="outline" data-explore="retry">다시 불러오기</button></div>`;
      $('[data-explore="more"]').hidden=true;
    } finally {if(!disposed&&current===version)$('.explore-list').removeAttribute('aria-busy');}
  }
  function loadAssistant() {
    if(!assistantResult){source='conditions';return load();}
    const data=assistantResult;assistantShown=5;
    result={status:'ready',groups:data.groups||[],totalParcels:Number(data.total||0),totalListings:Number(data.total||0),hasMore:false,observedAt:data.searchedAt||null,station:data.station||null,reply:data.reply||''};
    $('.explore-list').removeAttribute('aria-busy');drawCards();map.setGroups(mapGroups(),selected,true);
    if(initialId){const id=initialId;initialId=null;openDetail(id);}
  }
  async function loadFavorites({fit=true}={}) {
    const current=++version;
    const ids=favoriteItems().map(item=>item.key);
    $('.explore-list').setAttribute('aria-busy','true');
    $('.search-suggestions').replaceChildren();
    if(!ids.length){
      result={status:'ready',groups:[],totalParcels:0,totalListings:0,hasMore:false,observedAt:null,missingFavorites:[]};
      $('.explore-list').removeAttribute('aria-busy');drawCards();map.setGroups([],null,false);return;
    }
    $('#result-count').textContent='찜한 매물을 불러오고 있어요.';
    try {
      const specialIds=ids.filter(id=>id.startsWith('auction:')||id.startsWith('onbid:'));
      const catalogIds=ids.filter(id=>!(id.startsWith('auction:')||id.startsWith('onbid:')));
      const params=new URLSearchParams({ids:catalogIds.join(','),sort,limit:100});
      const catalogPromise=catalogIds.length
        ? apiFetch(`/api/catalog?${params}`,{signal:abort.signal}).then(async response=>{const data=await response.json();if(!response.ok||data.status!=='ready')throw new Error(data.reason||'unavailable');return data;})
        : Promise.resolve({groups:[]});
      const specialPromise=Promise.all(specialIds.map(async id=>{
        try {
          if(id.startsWith('auction:')){
            const response=await apiFetch(`/api/auctions/${encodeURIComponent(id.slice('auction:'.length))}`,{signal:abort.signal});
            const data=await response.json();if(data?.status!=='ready')return null;
            const row=auctionToListing(data.item);return {key:row.id,pnu:row.pnu,representative:row,listings:[row]};
          }
          const response=await apiFetch(`/api/onbid/${encodeURIComponent(id.slice('onbid:'.length))}`,{signal:abort.signal});
          const data=await response.json();if(data?.status!=='ready')return null;
          const row=onbidToListing(data.item);return {key:row.id,pnu:row.pnu,representative:row,listings:[row]};
        } catch {return null;}
      }));
      const [data,specialGroups]=await Promise.all([catalogPromise,specialPromise]);
      if(disposed||current!==version)return;
      const groups=[...(data.groups||[]),...specialGroups.filter(Boolean)];
      const found=new Set(groups.map(group=>group.representative.id));
      result={status:'ready',groups,totalParcels:groups.length,totalListings:groups.length,hasMore:false,observedAt:data.observedAt||null,missingFavorites:ids.filter(id=>!found.has(id))};
      $('.explore-list').removeAttribute('aria-busy');drawCards();map.setGroups(result.groups,selected,fit);
      if(initialId){const id=initialId;initialId=null;openDetail(id);}
    } catch {
      if(disposed||current!==version)return;
      result=null;map.setGroups([],null,false);
      $('#result-count').textContent='찜한 매물을 확인하지 못했어요.';
      $('#listing-list').innerHTML='<div class="empty"><h2>찜한 매물을 불러오지 못했어요.</h2><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button class="outline" data-explore="retry">다시 불러오기</button></div>';
    }
  }
  // 조건에 포함된 경매를 건물찾기 목록·지도에 넣기 위해 같은 모양의 그룹으로 만든다.
  async function fetchAuctionGroups({districts=[],usages=[],maxPriceWon=null,maxBidRate=null,dealType='',limit=100}={}){
    const params=new URLSearchParams({size:String(limit),page:'1',sort:'sale'});
    (districts||[]).forEach(d=>params.append('gu',d));
    (usages||[]).forEach(u=>params.append('usage',u));
    if(dealType)params.set('dealType',dealType);
    if(maxPriceWon)params.set('maxPrice',String(maxPriceWon));
    if(maxBidRate)params.set('maxBidRate',String(maxBidRate));
    const response=await apiFetch(`/api/auctions?${params}`,{signal:abort.signal});
    const data=await response.json();
    if(!response.ok||data.status!=='ready')return null;
    const groups=(data.rows||[]).map(auctionToListing).map(row=>({key:row.id,pnu:row.pnu,representative:row,listings:[row]}));
    return {groups,total:Number(data.total||groups.length)};
  }
  async function loadAuctions({fit=true}={}) {
    const current=++version;
    const isOnbid=auctionFilters.listingSource==='onbid';
    const label=isOnbid?'공매':'경매';
    $('.explore-list').setAttribute('aria-busy','true');
    $('.search-suggestions').replaceChildren();
    $('#result-count').textContent=`${label} 물건을 불러오고 있어요.`;
    try {
      const params=new URLSearchParams({size:String(Math.min(200,Math.max(limit,20))),page:'1'});
      (auctionFilters.gu||[]).forEach(g=>params.append('gu',g));
      if(auctionFilters.usage)params.set('usage',auctionFilters.usage);
      if(auctionFilters.sort)params.set('sort',auctionFilters.sort);
      else params.set('sort',isOnbid?'bid':'sale');
      if(auctionFilters.maxPrice)params.set('maxPrice',String(Number(auctionFilters.maxPrice)*1e8));
      if(auctionFilters.dealType)params.set('dealType',auctionFilters.dealType);
      if(!isOnbid){
        if(auctionFilters.kind)params.set('kind',auctionFilters.kind);
        if(auctionFilters.maxBidRate)params.set('maxBidRate',String(Number(auctionFilters.maxBidRate)));
        if(auctionFilters.failMax)params.set('maxFail',auctionFilters.failMax);
      }
      const mapper=isOnbid?onbidToListing:auctionToListing;
      const endpoint=isOnbid?'/api/onbid':'/api/auctions';
      const response=await apiFetch(`${endpoint}?${params}`,{signal:abort.signal});
      const data=await response.json();if(!response.ok||data.status!=='ready')throw new Error(data.reason||'unavailable');
      if(disposed||current!==version)return;
      const groups=(data.rows||[]).map(mapper).map(row=>({key:row.id,pnu:row.pnu,representative:row,listings:[row]}));
      result={status:'ready',mode:isOnbid?'onbid':'auction',groups,totalParcels:Number(data.total||groups.length),totalListings:Number(data.total||groups.length),hasMore:Number(data.total||0)>groups.length,observedAt:null,suggestions:[]};
      $('.explore-list').removeAttribute('aria-busy');drawCards();map.setGroups(mapGroups(),selected,fit);
      if(initialId){const id=initialId;initialId=null;openDetail(id);}
    } catch(error) {
      if(disposed||current!==version)return;
      result=null;map.setGroups([],null,false);
      $('#result-count').textContent=`${label} 자료를 확인하지 못했어요.`;
      $('#listing-list').innerHTML=`<div class="empty"><h2>${label} 자료를 불러오지 못했어요.</h2><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button class="outline" data-explore="retry">다시 불러오기</button></div>`;
    } finally {if(!disposed&&current===version)$('.explore-list').removeAttribute('aria-busy');}
  }
  function closeDetail(updateUrl=true,restoreFocus=true) {
    closeContext?.();closeContext=null;closeRecords?.();closeRecords=null;closeLand?.();closeLand=null;closeCommercial?.();closeCommercial=null;closeSurrounding?.();closeSurrounding=null;closeStreetPreview?.();closeStreetPreview=null;
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
    // 비서 결과는 origin을 직접 갖고, 선별 카탈로그는 매물번호(teojabiNo)로 터잡이 매물을 구분한다.
    const origin=row.origin||(row.cohort==='disco'?'disco':row.teojabiNo||row.cohort==='existing'?(row.cohort==='existing'?'premium':'registered'):'naver');
    const originBadge=origin==='premium'?'<em class="pick-badge detail-pick-badge">★ 터잡이 추천</em>':origin==='registered'?'<em class="pick-badge detail-pick-badge">터잡이 등록</em>':origin==='disco'?'<em class="pick-badge detail-pick-badge disco-badge">디스코 매물</em>':'<em class="pick-badge detail-pick-badge origin-naver">네이버 매물</em>';
    // 공동중개로 등록·추천된 터잡이 매물은 네이버 원문 링크를 노출하지 않는다.
    const discoUrl=origin==='disco'&&row.sourceUrl?String(row.sourceUrl):'';
    const naverUrl=origin==='naver'&&/^\d+$/.test(String(row.sourceId||''))?`https://fin.land.naver.com/articles/${row.sourceId}`:'';
    $('#listing-detail').innerHTML=`<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><button class="detail-close" data-explore="close" aria-label="매물 상세 닫기">×</button></div>
      <div class="detail-content"><p class="detail-location">${esc(rowTitle(row))}${originBadge}</p><h2 tabindex="-1" id="detail-title">${money(row.priceWon)}</h2>
      ${row.teojabiNo?`<p class="detail-listing-number">매물번호 ${esc(row.teojabiNo)}</p>`:''}
      ${areaUnitControls()}<div class="detail-areas">${detailFactItems(row).map(([label,value])=>`<div><span>${label}</span><strong${String(value).includes('data-display-area-m2')?'':' class="detail-text"'}>${value}</strong></div>`).join('')}</div>
      <div id="land-area-comparison" aria-live="polite"></div><div class="detail-street"><div class="street-inline" id="street-inline" aria-label="네이버 거리뷰"><span class="street-inline-state">거리뷰를 불러오고 있어요.</span></div><button type="button" class="street-expand" data-explore="street" aria-label="거리뷰 크게 보기" title="거리뷰 크게 보기">⛶</button></div><nav class="detail-shortcuts" aria-label="상세 내용 이동"><button data-explore="section" data-section="property-description">매물 설명</button><button data-explore="section" data-section="property-parcel">필지 위치</button><button data-explore="section" data-section="property-commercial">상권</button><button data-explore="section" data-section="property-surrounding">주변 사업</button><button data-explore="section" data-section="property-documents">서류 확인</button><button data-explore="section" data-section="property-context">주변 조건</button></nav>
      <section class="detail-section" id="property-description"><h3>매물 설명</h3>${origin==='naver'?`<p class="case-note">네이버에서 찾은 매물이에요. 찜하기를 눌러 저장하세요.</p>${naverUrl?`<div class="detail-links"><a class="outline" href="${naverUrl}" target="_blank" rel="noopener noreferrer">네이버에서 보기 ↗</a></div>`:''}`:origin==='disco'?`<p class="case-note">디스코에서 찾은 매물이에요. 자세한 조건은 원문에서 확인해 주세요.</p>${discoUrl?`<div class="detail-links"><a class="outline" href="${discoUrl}" target="_blank" rel="noopener noreferrer">디스코에서 보기 ↗</a></div>`:''}`:(row.description?`<p class="listing-description">${esc(row.description)}</p>`:'<p class="listing-description">등록된 설명이 없습니다.</p>')}</section>
      <section class="detail-section" id="property-parcel"><h3>필지 위치</h3><p>${esc(row.address||`${rowTitle(row)} · 상세 주소 미확인`)}</p></section>
      <section class="detail-section"><h3>용도지역</h3>${row.zoning?.status==='matched'&&Array.isArray(row.zoning.entries)?`<p>${row.zoning.entries.map(e=>esc(e.name)).join('<br>')}</p><p class="case-note">공공데이터 기준</p>`:'<p class="case-note">용도지역을 확인하지 못했습니다.</p>'}</section>
      <section class="detail-section nearby-section" id="property-transactions"><details id="nearby-details" class="nearby-details"><summary class="nearby-summary"><span class="nearby-summary-title">주변 실거래</span><span class="nearby-summary-count" id="nearby-count"></span></summary><div class="nearby-body"><div class="nearby-heading"><button class="outline" data-explore="transactions" aria-pressed="true" disabled>지도 표시</button></div>${areaUnitControls()}<div id="nearby-cases" aria-live="polite"><p class="case-note">가까운 토지·건물 거래를 찾고 있어요.</p></div></div></details></section>
      <section class="detail-section commercial-section" id="property-commercial"><h3>상권</h3><div id="commercial-facts" aria-live="polite"></div></section>
      <section class="detail-section" id="property-surrounding"><h3>주변 사업</h3><div id="surrounding-facts" aria-live="polite"></div></section>
      <section class="detail-section" id="property-documents"><h3>건축물대장·토지대장 <small>보유 공공자료</small></h3><p class="case-note">보유한 건축물·토지대장을 살펴보고, 등기는 인터넷등기소에서 확인하세요.</p><div class="document-list"><div><span class="document-symbol">01</span><div><b>건축물대장</b><p>표제부·총괄표제부의 건물 현황</p></div><button class="outline" id="building-records-toggle" aria-expanded="false" aria-controls="building-records">건축물대장 보기</button></div><div><span class="document-symbol">02</span><div><b>토지(임야)대장</b><p>필지별 토지 기록</p></div><button class="outline" id="land-records-toggle" aria-expanded="false" aria-controls="land-records">토지대장 보기</button></div><div><span class="document-symbol">03</span><div><b>등기사항증명서</b><p>인터넷등기소에서 직접 열람</p></div><div class="document-actions"><button class="outline" data-explore="copy-address">필지 주소 복사</button><a class="outline" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">열람·발급 ↗</a></div></div></div><div id="building-records" class="building-records" hidden></div><div id="land-records" class="building-records" hidden></div></section>
      <section class="detail-section inline-context" id="property-context"><h3>이 땅, 이런 점을 살펴보세요.</h3><div id="context-facts" aria-live="polite"></div><div class="context-more"><p>더 구체적으로 개발을 검토하고 싶으세요?</p><button class="primary" data-explore="analyze-site">건물·토지에서 검토하기 <span aria-hidden="true">↗</span></button></div></section><p class="detail-bottom-note">사진과 발급 원본 PDF는 현재 보유 자료에 포함되어 있지 않습니다.</p>
      <section class="brokerage-info" aria-label="중개사무소 정보"><h3>터잡이 공인중개사사무소</h3><dl><div><dt>대표</dt><dd>윤진경</dd></div><div><dt>등록번호</dt><dd>제 11650-2026-00102 호</dd></div><div><dt>주소</dt><dd>서울특별시 서초구 언남5길 1, 2층 (양재동)</dd></div><div><dt>연락처</dt><dd>010-8258-4959</dd></div><div><dt>중개보수</dt><dd>상업용 빌딩 기준<br><span>(법정 상한 요율 0.9% 내 협의)</span></dd></div></dl></section></div>`;
  }
  function renderAuctionDetail() {
    if(!detail)return;
    const row=detail.listing,a=row.auction||{},d=detail.auctionDetail||{};
    const stats=Array.isArray(d.around_stats)?d.around_stats[0]:null;
    const sourceUrl=esc(a.sourceUrl||'https://www.courtauction.go.kr/');
    const onbidMode=row.cohort==='onbid',od=detail.onbidDetail||null;
    const v=row.verify||null,wb=(row.dealType==='whole'&&v)?v.building:null,wl=v&&v.land||null;
    const fa=n=>n==null?'—':`${Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2})}㎡`;
    let verifySection='';
    if(row.dealType==='whole'&&row.verifyStatus){
      const judge=row.verifyStatus==='matched'?'<b style="color:var(--green)">건축물대장 연면적과 일치</b>':row.verifyStatus==='mismatch'?`<b style="color:#b45309">건축물대장과 차이 ${fa(v&&v.floorAreaDiff)}</b>`:row.verifyStatus==='reference'?'<b>대장은 확인되나 경매 연면적을 계산하지 못했어요</b>':'<b>대장을 찾지 못했어요</b>';
      verifySection=`<section class="detail-section" id="property-verify"><h3>검증 <small>통 건물 · 보유 공공자료 대조</small></h3><p class="case-note">법원 공시가 아니라 터잡이 보유 공공자료와 대조한 결과예요. 기준일이 달라 다를 수 있어요.</p><dl class="auction-facts">${v&&v.auctionFloorArea!=null?`<dt>경매 연면적(층별 합)</dt><dd>${fa(v.auctionFloorArea)}</dd>`:''}${wb?`<dt>건축물대장 연면적</dt><dd>${fa(wb.floorArea)}</dd><dt>건축물대장 주용도</dt><dd>${esc(wb.mainUse||'—')}</dd><dt>지상·지하 층수</dt><dd>${wb.aboveFloors!=null?esc(wb.aboveFloors)+'층':'-'}${wb.belowFloors?` / 지하 ${esc(wb.belowFloors)}층`:''}</dd>${wb.approvalDate?`<dt>사용승인일</dt><dd>${esc(wb.approvalDate)}</dd>`:''}${wb.structure?`<dt>구조</dt><dd>${esc(wb.structure)}</dd>`:''}`:''}${wl?`<dt>대지면적(토지대장)</dt><dd>${fa(wl.area)}</dd>${wl.category?`<dt>지목</dt><dd>${esc(wl.category)}</dd>`:''}`:''}</dl><p class="case-note">검증 결과: ${judge}</p></section>`;
    }
    $('#listing-detail').innerHTML=`<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><button class="detail-close" data-explore="close" aria-label="${onbidMode?'공매':'경매'} 상세 닫기">×</button></div>
      <div class="detail-content"><p class="detail-location">${esc(rowTitle(row))}<em class="pick-badge detail-pick-badge auction-badge">${onbidMode?'공매':'경매'}</em></p><h2 tabindex="-1" id="detail-title">${money(a.minPrice)}</h2>
      <p class="detail-listing-number">${onbidMode?'물건관리번호':'사건번호'} ${esc(a.caseNo||'')} · ${esc(a.courtName||'')} ${esc(a.deptName||'')}</p>
      <div class="detail-conversion"><a class="primary" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${onbidMode?'온비드 공매 원문 ↗':'법원경매정보 원문 ↗'}</a><button class="outline" data-explore="copy-auction">물건 정보 복사</button><small>${onbidMode?'입찰 전 온비드 공고 원문을 확인하세요.':'입찰 전 법원 원문(매각물건명세서·현황조사서)을 확인하세요.'}</small></div>
      ${areaUnitControls()}<div class="detail-areas"><div><span>감정가</span><strong>${money(a.appraisedWon)}</strong></div><div><span>최저매각가</span><strong>${money(a.minPrice)}</strong></div><div><span>면적</span><strong>${area(row.areaM2)}</strong></div><div><span>유찰횟수</span><strong>${a.failCount??0}회</strong></div></div>
      <div id="land-area-comparison" aria-live="polite"></div>
      <div class="detail-street"><div class="street-inline" id="street-inline" aria-label="네이버 거리뷰"><span class="street-inline-state">거리뷰를 불러오고 있어요.</span></div><button type="button" class="street-expand" data-explore="street" aria-label="거리뷰 크게 보기" title="거리뷰 크게 보기">⛶</button></div>
      <nav class="detail-shortcuts" aria-label="상세 내용 이동"><button data-explore="section" data-section="property-auction">${onbidMode?'공매':'경매'} 공시</button><button data-explore="section" data-section="property-parcel">필지 위치</button><button data-explore="section" data-section="property-commercial">상권</button><button data-explore="section" data-section="property-surrounding">주변 사업</button><button data-explore="section" data-section="property-documents">보유자료</button><button data-explore="section" data-section="property-context">주변 조건</button><button data-explore="section" data-section="property-transactions">주변 실거래</button></nav>
      <section class="detail-section" id="property-auction"><h3>${row.cohort==='onbid'?'공매':'경매'} 공시 정보 <small>${row.cohort==='onbid'?'온비드(캠코)':'법원경매정보'} · 사실정보</small></h3><p class="case-note">아래는 ${row.cohort==='onbid'?'한국자산관리공사 온비드':'법원경매정보'} 공시 기준이에요. 터잡이 <b>보유 공공자료</b>와 출처·기준일이 달라 다를 수 있어요.</p><dl class="auction-facts">
        <dt>용도</dt><dd>${esc(a.usageName||'미기재')}</dd>
        <dt>거래 구분</dt><dd>${AUCTION_DEAL_LABEL[row.dealType]||'확인 필요'}</dd>
        <dt>감정가</dt><dd>${money(a.appraisedWon)}</dd>
        <dt>최저매각가</dt><dd>${money(a.minPrice)} <small style="opacity:.6">(감정가의 ${a.notiMinRate!=null?esc(a.notiMinRate)+'%':'—'})</small></dd>
        <dt>${onbidMode?'입찰마감':'매각기일'}</dt><dd>${esc(a.saleDate||'')} ${esc(a.saleHour||'')} ${dday(a.saleDate)}</dd>
        ${onbidMode?(od&&od.failed_bid!=null?`<dt>유찰횟수</dt><dd>${esc(od.failed_bid)}회</dd>`:''):`<dt>유찰횟수</dt><dd>${a.failCount??0}회</dd>`}
        <dt>법원·계</dt><dd>${esc(a.courtName||'')} ${esc(a.deptName||'')}</dd>
        <dt>사건번호</dt><dd>${esc(a.caseNo||'')}</dd>
        ${d.area_m2!=null?`<dt>목적물 면적</dt><dd>${area(d.area_m2)}</dd>`:''}
        ${onbidMode&&od&&od.land_area_m2!=null?`<dt>토지면적</dt><dd>${area(od.land_area_m2)}</dd>`:''}
        ${onbidMode&&od&&od.building_area_m2!=null?`<dt>건물면적</dt><dd>${area(od.building_area_m2)}</dd>`:''}
        ${d.claim_amt!=null?`<dt>청구금액</dt><dd>${money(d.claim_amt)}</dd>`:''}
        ${d.dividend_deadline?`<dt>배당요구종기</dt><dd>${esc(d.dividend_deadline)}</dd>`:''}
        ${d.acquired_rights?`<dt>인수되는 권리</dt><dd>${esc(d.acquired_rights)} <span style="opacity:.6">(법원 공시)</span></dd>`:''}
        ${d.legal_superficies?`<dt>법정지상권</dt><dd>${esc(d.legal_superficies)}</dd>`:''}
        ${stats?`<dt>주변 12개월</dt><dd>낙찰가율 ${esc(stats.term12MgakPrcRate ?? '—')}% · 평균유찰 ${esc(stats.term12AvgFlbdNcnt ?? '—')}회</dd>`:''}
      </dl>${(()=>{let extra='';if(!onbidMode&&Array.isArray(d.round_history)&&d.round_history.length)extra+=`<details class="auction-rounds"><summary>회차 이력 ${d.round_history.length}회</summary><ul>${d.round_history.map(r=>`<li>${esc(String(r.dxdyYmd||'').replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'))} · 최저 ${money(r.tsLwsDspslPrc)} · ${esc(r.dxdyPlcNm||'')}</li>`).join('')}</ul><small>법원경매정보 공시 기준이에요. 결과·상태는 원문에서 확인하세요.</small></details>`;if(onbidMode&&od){const photos=Array.isArray(od.photos)?od.photos:[],leases=Array.isArray(od.leases)?od.leases:[],registry=Array.isArray(od.registry)?od.registry:[],occupancy=Array.isArray(od.occupancy)?od.occupancy:[];if(photos.length)extra+=`<div class="onbid-photos"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0">${photos.slice(0,6).map(p=>p&&p.urlAdr?`<a href="${esc(p.urlAdr)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(p.urlAdr)}" alt="공매 물건 사진" style="width:100%;height:90px;object-fit:cover;border-radius:6px"></a>`:'').join('')}</div><small>온비드 공고 사진(썸네일)이에요. 원문에서 확인하세요.</small></div>`;extra+=leases.length||registry.length||occupancy.length?`<p class="case-note">임대차 ${leases.length}건 · 등기 ${registry.length}건 · 점유 ${occupancy.length}건 — 요약은 온비드 공고 원문에서 확인하세요.</p>`:`<p class="case-note">임대차·등기·점유 상세는 수집된 자료가 없어 온비드 공고 원문에서 확인하세요.</p>`;}return extra;})()}<p class="case-note chk">※ 권리분석·적정 입찰가는 제공하지 않아요. ${onbidMode?'임대차·등기·점유 등은 온비드 공고 원문을 확인하세요.':'인수권리·점유 등은 법원 원문을 확인하세요.'}</p><p class="case-note">${onbidMode?'공매 공시 사실정보예요. 자세한 조건은 온비드 공고 원문에서 확인해 주세요.':'경매 공시 사실정보예요. 자세한 조건은 법원경매정보 원문에서 확인해 주세요.'}</p><div class="detail-links"><a class="outline" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${onbidMode?'온비드에서 보기 ↗':'법원경매정보에서 보기 ↗'}</a></div></section>
      ${verifySection}
      <section class="detail-section" id="property-parcel"><h3>필지 위치</h3><p><span class="parcel-label">대지위치</span> ${esc(row.address||rowTitle(row))}</p>${row.detailAddress?`<p><span class="parcel-label">상세주소</span> ${esc(row.detailAddress)}</p>`:''}</section>
      <section class="detail-section" id="property-holdings"><h3>보유 공공자료 <small>터잡이 DB · 법원 공시와 다름</small></h3><p class="case-note">법원 공시가 아니라 터잡이가 보유한 공공데이터예요. 기준일이 달라 경매 공시와 다를 수 있어요.</p><dl class="auction-facts"><dt>용도지역</dt><dd>${row.zoning?.status==='matched'&&Array.isArray(row.zoning.entries)&&row.zoning.entries.length?row.zoning.entries.map(e=>esc(e.name)).join('<br>'):'확인 필요'}</dd><dt>도로폭</dt><dd>${a.roadWidthM!=null?esc(a.roadWidthM)+'m':'확인 필요'}</dd></dl></section>
      <section class="detail-section nearby-section" id="property-transactions"><details id="nearby-details" class="nearby-details"><summary class="nearby-summary"><span class="nearby-summary-title">주변 실거래</span><span class="nearby-summary-count" id="nearby-count"></span></summary><div class="nearby-body"><div class="nearby-heading"><button class="outline" data-explore="transactions" aria-pressed="true" disabled>지도 표시</button></div>${areaUnitControls()}<div id="nearby-cases" aria-live="polite"><p class="case-note">가까운 토지·건물 거래를 찾고 있어요.</p></div></div></details></section>
      <section class="detail-section commercial-section" id="property-commercial"><h3>상권</h3><div id="commercial-facts" aria-live="polite"></div></section>
      <section class="detail-section" id="property-surrounding"><h3>주변 사업</h3><div id="surrounding-facts" aria-live="polite"></div></section>
      <section class="detail-section" id="property-documents"><h3>건축물대장·토지대장 <small>보유 공공자료</small></h3><p class="case-note">보유한 건축물·토지대장을 살펴보고, 등기는 인터넷등기소에서 확인하세요.</p><div class="document-list"><div><span class="document-symbol">01</span><div><b>건축물대장</b><p>표제부·총괄표제부의 건물 현황</p></div><button class="outline" id="building-records-toggle" aria-expanded="false" aria-controls="building-records">건축물대장 보기</button></div><div><span class="document-symbol">02</span><div><b>토지(임야)대장</b><p>필지별 토지 기록</p></div><button class="outline" id="land-records-toggle" aria-expanded="false" aria-controls="land-records">토지대장 보기</button></div><div><span class="document-symbol">03</span><div><b>등기사항증명서</b><p>인터넷등기소에서 직접 열람</p></div><div class="document-actions"><button class="outline" data-explore="copy-address">필지 주소 복사</button><a class="outline" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">열람·발급 ↗</a></div></div></div><div id="building-records" class="building-records" hidden></div><div id="land-records" class="building-records" hidden></div><p class="case-note">${onbidMode?'공매 물건의 대장·현황은 온비드 공고 원문과 다를 수 있어요.':'경매 물건의 대장·현황은 법원 원문(매각물건명세서·현황조사서)과 다를 수 있어요.'}</p></section>
      <section class="detail-section inline-context" id="property-context"><h3>이 땅, 이런 점을 살펴보세요.</h3><div id="context-facts" aria-live="polite"></div><div class="context-more"><p>더 구체적으로 개발을 검토하고 싶으세요?</p><button class="primary" data-explore="analyze-site">건물·토지에서 검토하기 <span aria-hidden="true">↗</span></button></div></section><p class="detail-bottom-note">사진과 발급 원본 PDF는 현재 보유 자료에 포함되어 있지 않습니다.</p>
      <section class="brokerage-info" aria-label="중개사무소 정보"><h3>터잡이 공인중개사사무소</h3><dl><div><dt>대표</dt><dd>윤진경</dd></div><div><dt>등록번호</dt><dd>제 11650-2026-00102 호</dd></div><div><dt>주소</dt><dd>서울특별시 서초구 언남5길 1, 2층 (양재동)</dd></div><div><dt>연락처</dt><dd>010-8258-4959</dd></div><div><dt>중개보수</dt><dd>상업용 빌딩 기준<br><span>(법정 상한 요율 0.9% 내 협의)</span></dd></div></dl></section></div>`;
  }
  async function openAuctionDetail(docid,updateUrl=true) {
    const id=`auction:${docid}`;
    if(!selected)listScrollTop=body.scrollTop;
    setSheet(true);
    closeContext?.();closeContext=null;closeRecords?.();closeRecords=null;closeLand?.();closeLand=null;closeCommercial?.();closeCommercial=null;closeSurrounding?.();closeSurrounding=null;closeStreetPreview?.();closeStreetPreview=null;
    const current=++detailVersion;selected=id;detail=null;parcel=null;nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('.explore-board').classList.remove('transaction-map-open');
    $('#listing-detail').hidden=false;$('.explore-board').classList.add('has-detail');
    $('#listing-detail').innerHTML='<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><span>불러오는 중</span><button class="detail-close" data-explore="close" aria-label="경매 상세 닫기">×</button></div>';
    map.parcel(null);if(result)drawCards();
    try {
      const response=await apiFetch(`/api/auctions/${encodeURIComponent(docid)}`,{signal:abort.signal});
      const data=await response.json();
      if(response.status===404||!data||data.status!=='ready')throw new Error('Missing auction');
      if(disposed||current!==detailVersion)return;
      detail={listing:auctionToListing(data.item),auctionDetail:data.detail||null};
      renderAuctionDetail();
      closeContext=mountInlineContext($('#context-facts'),detail.listing);
      closeRecords=mountBuildingRecords($('#building-records'),$('#building-records-toggle'),detail.listing);
      closeLand=mountLandRecords($('#land-area-comparison'),$('#land-records'),$('#land-records-toggle'),detail.listing);
      closeCommercial=mountCommercial($('#commercial-facts'),detail.listing);
      closeSurrounding=mountSurrounding($('#surrounding-facts'),detail.listing);
      closeStreetPreview=mountStreetPreview($('#street-inline'),detail.listing.position);
      map.select(detail.listing);
      $('#detail-title')?.focus({preventScroll:true});
      if(updateUrl)history.pushState(null,'',`#listing=${encodeURIComponent(id)}`);
      loadNearby(id,current);
      if(detail.listing.pnu){
        let receivedParcel;
        try {const response=await apiFetch(`/api/parcels/${detail.listing.pnu}`,{signal:abort.signal});receivedParcel=await response.json();}
        catch {receivedParcel={status:'error'};}
        if(disposed||current!==detailVersion)return;
        parcel=receivedParcel;
        if(parcel.status==='ready')map.parcel(parcel.geometry);
      }
    } catch(error) {
      if(disposed||current!==detailVersion)return;
      console.warn('auction detail failed', error);
      $('#listing-detail').innerHTML='<div class="detail-top"><span>경매 물건을 불러오지 못했어요.</span><button class="detail-close" data-explore="close" aria-label="경매 상세 닫기">×</button></div><button class="outline" data-explore="retry-detail">다시 시도</button>';
    }
  }
  async function openOnbidDetail(key,updateUrl=true) {
    const id=`onbid:${key}`;
    if(!selected)listScrollTop=body.scrollTop;
    setSheet(true);
    closeContext?.();closeContext=null;closeRecords?.();closeRecords=null;closeLand?.();closeLand=null;closeCommercial?.();closeCommercial=null;closeSurrounding?.();closeSurrounding=null;closeStreetPreview?.();closeStreetPreview=null;
    const current=++detailVersion;selected=id;detail=null;parcel=null;nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('.explore-board').classList.remove('transaction-map-open');
    $('#listing-detail').hidden=false;$('.explore-board').classList.add('has-detail');
    $('#listing-detail').innerHTML='<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><span>불러오는 중</span><button class="detail-close" data-explore="close" aria-label="공매 상세 닫기">×</button></div>';
    map.parcel(null);if(result)drawCards();
    try {
      const response=await apiFetch(`/api/onbid/${encodeURIComponent(key)}`,{signal:abort.signal});
      const data=await response.json();
      if(response.status===404||!data||data.status!=='ready')throw new Error('Missing onbid');
      if(disposed||current!==detailVersion)return;
      detail={listing:onbidToListing(data.item),auctionDetail:data.detail||null,onbidDetail:data.detail||null};
      renderAuctionDetail();
      closeCommercial=mountCommercial($('#commercial-facts'),detail.listing);
      closeSurrounding=mountSurrounding($('#surrounding-facts'),detail.listing);
      closeStreetPreview=mountStreetPreview($('#street-inline'),detail.listing.position);
      map.select(detail.listing);
      $('#detail-title')?.focus({preventScroll:true});
      if(updateUrl)history.pushState(null,'',`#listing=${encodeURIComponent(id)}`);
      if(detail.listing.pnu){
        let receivedParcel;
        try {const response=await apiFetch(`/api/parcels/${detail.listing.pnu}`,{signal:abort.signal});receivedParcel=await response.json();}
        catch {receivedParcel={status:'error'};}
        if(disposed||current!==detailVersion)return;
        parcel=receivedParcel;
        if(parcel.status==='ready')map.parcel(parcel.geometry);
      }
    } catch(error) {
      if(disposed||current!==detailVersion)return;
      console.warn('onbid detail failed', error);
      $('#listing-detail').innerHTML='<div class="detail-top"><span>공매 물건을 불러오지 못했어요.</span><button class="detail-close" data-explore="close" aria-label="공매 상세 닫기">×</button></div><button class="outline" data-explore="retry-detail">다시 시도</button>';
    }
  }
  async function openDetail(id,updateUrl=true) {
    if(String(id).startsWith('auction:'))return openAuctionDetail(String(id).slice('auction:'.length),updateUrl);
    if(String(id).startsWith('onbid:'))return openOnbidDetail(String(id).slice('onbid:'.length),updateUrl);
    if(!selected)listScrollTop=body.scrollTop;
    setSheet(true);
    closeContext?.();closeContext=null;closeRecords?.();closeRecords=null;closeLand?.();closeLand=null;closeCommercial?.();closeCommercial=null;closeSurrounding?.();closeSurrounding=null;closeStreetPreview?.();closeStreetPreview=null;
    const current=++detailVersion;selected=id;detail=null;parcel=null;nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('.explore-board').classList.remove('transaction-map-open');
    $('#listing-detail').hidden=false;$('.explore-board').classList.add('has-detail');
    $('#listing-detail').innerHTML='<div class="detail-top"><button type="button" class="detail-back" data-explore="back-list">← 매물 목록</button><span>불러오는 중</span><button class="detail-close" data-explore="close" aria-label="매물 상세 닫기">×</button></div>';
    map.parcel(null);if(result)drawCards();
    try {
      // 비서가 찾은 매물은 비서 결과의 정보(용도지역 포함)로 바로 상세를 구성한다.
      const fromAssistant=assistantResult?.groups?.find(group=>group.representative.id===id)?.representative;
      let data;
      if(fromAssistant){
        data={status:'ready',mode:'assistant-listing',observedAt:assistantResult.searchedAt||null,listing:fromAssistant,
          documents:{building:{status:'source-only',delivery:'in-site'},land:{status:'source-only',delivery:'in-site'},registry:{status:'external',url:DOCUMENT_LINKS.registry}}};
      } else {
        const response=await apiFetch(`/api/listings/${encodeURIComponent(id)}`,{signal:abort.signal});
        data=await response.json();
        if(response.status===404||!data||data.status!=='ready')throw new Error('Missing listing');
      }
      if(disposed||current!==detailVersion)return;
      detail=data;renderDetail();
      const favoriteActive=Boolean(member.get('favorite',data.listing.id));
      $('.detail-content').insertAdjacentHTML('afterbegin',`<div class="detail-conversion"><a class="primary" href="https://pf.kakao.com/_qSQxhX/chat" target="_blank" rel="noopener noreferrer">터잡이와 상담하기 ↗</a><button class="outline" data-explore="favorite" data-favorite-detail="true" data-id="${esc(data.listing.id)}" aria-pressed="${favoriteActive}">${favoriteActive?'♥ 찜함':'♡ 찜하기'}</button><button class="outline" data-explore="copy-consult">상담할 매물 정보 복사</button><small>주소와 가격을 복사해서 상담 채널에 보내주세요.</small></div>`);
      closeContext=mountInlineContext($('#context-facts'),data.listing);closeRecords=mountBuildingRecords($('#building-records'),$('#building-records-toggle'),data.listing);closeLand=mountLandRecords($('#land-area-comparison'),$('#land-records'),$('#land-records-toggle'),data.listing);closeCommercial=mountCommercial($('#commercial-facts'),data.listing);closeSurrounding=mountSurrounding($('#surrounding-facts'),data.listing);closeStreetPreview=mountStreetPreview($('#street-inline'),data.listing.position);map.select(data.listing);$('#detail-title').focus({preventScroll:true});
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
    } catch (error) {
      if(disposed||current!==detailVersion)return;
      console.warn('listing detail failed', error);
      $('#listing-detail').innerHTML='<div class="detail-top"><span>매물을 불러오지 못했어요.</span><button class="detail-close" data-explore="close" aria-label="매물 상세 닫기">×</button></div><button class="outline" data-explore="retry-detail">다시 시도</button>';
    }
  }
  function syncTransactionToggle() {
    for(const button of root.querySelectorAll('[data-explore="transactions"]')) {
      button.hidden=!selected;button.disabled=!nearby?.cases?.length;
      button.setAttribute('aria-pressed',String(showTransactions));
      button.textContent=`실거래${nearby?.cases?.length?` (${nearby.cases.length})`:''}`;
    }
  }
  function renderNearby() {
    const container=$('#nearby-cases');if(!container)return;
    const count=$('#nearby-count');if(count)count.textContent=nearby?.cases?.length?`${nearby.cases.length}건`:'';
    if(nearby?.status==='error'){container.innerHTML='<p class="case-note">주변 실거래를 불러오지 못했어요.</p><button class="outline" data-explore="retry-transactions">다시 불러오기</button>';return;}
    if(nearby?.status!=='ready'){container.innerHTML='<p class="case-note">이 매물의 주변 거래 자료를 확인하지 못했어요.</p>';return;}
    if(!nearby.cases.length){container.innerHTML='<p class="case-note">반경 1km 안에서 최근 36개월의 토지·건물 거래를 찾지 못했어요.</p>';return;}
    container.innerHTML=`<p class="case-note">최근 36개월 · 반경 ${nearby.radiusMeters===1000?'1km':'500m'} · 가까운 필지 ${nearby.cases.length}곳 · 최대 5곳${nearby.expanded?' (500m 안에서 5곳 미만이라 범위를 넓혔어요)':''}</p>${nearby.insufficient?`<p class="case-note">반경 1km 안에서 확인된 거래는 ${nearby.cases.length}곳이에요.</p>`:''}<div class="nearby-case-list">${nearby.cases.map((item,index)=>`<article class="nearby-case" data-transaction-id="${esc(item.id)}" tabindex="-1"><div class="nearby-card-top"><div class="nearby-case-meta"><span class="transaction-number">${index+1}</span><b>${item.kind==='land'?'토지':'건물'} 거래</b><span>${Math.round(item.distanceMeters)}m</span></div><button class="outline nearby-map-button" data-explore="transaction" data-id="${esc(item.id)}">지도 보기</button></div><strong class="nearby-price">${money(item.priceWon)}</strong><div class="nearby-facts"><span title="${esc(item.address||'')}">지번 ${Number(item.pnu.slice(11,15))}${Number(item.pnu.slice(15))?'-'+Number(item.pnu.slice(15)):''}</span><span>대지 ${area(item.areaM2)}</span><span>연면적 ${item.kind==='building'?area(item.floorAreaM2):'—'}</span><span>${esc(item.dealDate)}</span></div>${item.ownershipTransferConfirmed?'<small class="transaction-evidence">수집자료상 소유권이전 확인</small>':''}</article>`).join('')}</div><p class="case-note">매물 핀 기준 직선거리입니다. 서로 다른 필지의 거래 참고자료이며, 거래 취소 여부와 현재 시세를 보증하지 않습니다.</p>`;
  }
  async function loadNearby(id,current) {
    nearby=null;map.setTransactions([]);syncTransactionToggle();
    $('#nearby-cases').innerHTML='<p class="case-note">가까운 토지·건물 거래를 찾고 있어요.</p>';
    try {
      const listing=detail?.listing;
      const q=new URLSearchParams();
      if(listing?.position?.lat!=null&&listing?.position?.lng!=null){q.set('lat',String(listing.position.lat));q.set('lng',String(listing.position.lng));}
      if(listing?.pnu)q.set('pnu',String(listing.pnu));
      const suffix=q.toString()?`?${q}`:'';
      const response=await apiFetch(`/api/nearby-transactions/${encodeURIComponent(id)}${suffix}`,{signal:abort.signal}),data=await response.json();
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
    if(event.target.closest('[data-commercial-close]')){$('#commercial-popup').hidden=true;return;}
    const commercialAskButton=event.target.closest('[data-commercial-ask]');
    if(commercialAskButton){commercialAsk(commercialAskButton.dataset.commercialAsk);return;}
    const button=event.target.closest('[data-explore]');if(!button||button.disabled)return;
    switch(button.dataset.explore) {
      case 'favorite':{
        const row=result?.groups.find(g=>g.representative.id===button.dataset.id)?.representative||(detail?.listing?.id===button.dataset.id?detail.listing:null);if(!row)break;
        button.disabled=true;try{
          if(member.get('favorite',row.id))await member.remove('favorite',row.id);else await member.save('favorite',row.id,row);
          const active=Boolean(member.get('favorite',row.id));
          root.querySelectorAll('[data-explore="favorite"]').forEach(item=>{if(item.dataset.id!==row.id)return;item.setAttribute('aria-pressed',String(active));item.textContent=active?'♥ 찜함':(item.dataset.favoriteDetail==='true'?'♡ 찜하기':'♡ 찜');});
        }catch(error){$('.discovery-notice').textContent=error.message;}button.disabled=false;break;
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
      case 'cadastral':button.setAttribute('aria-pressed',String(map.toggleCadastral()));break;
      case 'all-picks':{
        showAllPicks=!showAllPicks;button.disabled=true;
        try{if(showAllPicks&&!pickGroups){const response=await apiFetch('/api/catalog?limit=500&cohort=existing',{signal:abort.signal}),data=await response.json();if(!response.ok||data.status!=='ready')throw new Error();pickGroups=data.groups;}
          button.setAttribute('aria-pressed',String(showAllPicks));button.textContent=showAllPicks?'★ 터잡이 추천':'★ 터잡이 추천';map.setGroups(showAllPicks?(pickGroups||[]):(result?.groups||[]),selected,true);
        }catch{showAllPicks=false;$('.discovery-notice').textContent='터잡이 추천을 불러오지 못했어요.';}button.disabled=false;break;
      }
      case 'transactions':showTransactions=!showTransactions;map.setTransactionsVisible(showTransactions);syncTransactionToggle();break;
      case 'commercial':{
        const on=button.getAttribute('aria-pressed')!=='true';
        if(on&&!map.commercialAreas.length){
          button.disabled=true;
          try{const response=await apiFetch('/api/commercial-areas',{signal:abort.signal}),data=await response.json();if(!response.ok||data.status!=='ready')throw new Error();map.setCommercialAreas(data.areas);}
          catch{$('.discovery-notice').textContent='상권 자료를 불러오지 못했어요.';button.disabled=false;break;}
          button.disabled=false;
        }
        button.setAttribute('aria-pressed',String(on));
        map.setCommercialVisible(on);
        if(!on)$('#commercial-popup').hidden=true;
        break;
      }
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
      case 'favorites':setSource(source==='favorites'?'conditions':'favorites');break;
      case 'auction':setSource(source==='auction'?'conditions':'auction');break;
      case 'copy-auction':
        try{await navigator.clipboard.writeText(`터잡이 경매 물건\n${detail.listing.address}\n사건번호 ${detail.listing.auction?.caseNo||''}\n감정가 ${money(detail.listing.auction?.appraisedWon)} · 최저매각가 ${money(detail.listing.auction?.minPrice)}\n매각기일 ${detail.listing.auction?.saleDate||''}`);button.textContent='물건 정보 복사됨';}catch{button.textContent='주소와 가격을 선택해 복사해 주세요.';}break;
      case 'back-conditions':setSource('conditions');break;
      case 'edit':onEdit?.();break;
      case 'detail':openDetail(button.dataset.id);break;
      case 'retry-detail':openDetail(selected);break;
      case 'back-list':setSheet(true);closeDetail();break;
      case 'close':closeDetail();break;
      case 'more':if(source==='assistant'){assistantShown+=5;drawCards();map.setGroups(showAllPicks?(pickGroups||[]):mapGroups(),selected,true);}else if(source==='auction'){limit=Math.min(200,limit+40);load({fit:false});}else{limit=Math.min(500,limit+20);load({fit:false});}break;
      case 'retry':load();break;
      case 'pane':$('.explore-board').dataset.pane=button.dataset.value;root.querySelectorAll('[data-explore="pane"]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));break;
      case 'search-map':if(mapView){bounds=mapView.bounds;limit=5;closeDetail();load({fit:false});}break;
      case 'clear-bounds':bounds=null;limit=5;load();break;
      case 'reset-map':map.resetView();break;
      case 'retry-map':map.mount(result?.groups||[],selected,true);break;
      case 'analyze-site':if(detail)onAnalyze?.(detail.listing);break;
      case 'street':if(detail){closeStreet?.();closeStreet=await openStreetView(detail.listing.position,detail.listing.address||rowTitle(detail.listing));if(disposed)closeStreet?.();}break;
      case 'section':{const target=$(`#${button.dataset.section}`);if(button.dataset.section==='property-transactions')$('#nearby-details')?.setAttribute('open','');target?.scrollIntoView({behavior:'smooth',block:'start'});break;}
      case 'copy-address':
        try {await navigator.clipboard.writeText(detail.listing.address||rowTitle(detail.listing));button.textContent='주소 복사됨';}
        catch {button.textContent='주소를 선택해 복사해 주세요.';}break;

    }
  },{signal:abort.signal});
  window.addEventListener('keydown',event=>{if(!event.defaultPrevented&&event.key==='Escape'&&selected&&!document.querySelector('dialog[open]'))closeDetail();},{signal:abort.signal});
  window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.hash.slice(1)).get('listing');if(id)openDetail(id,false);else closeDetail(false);},{signal:abort.signal});
  // 상단 '경매' 링크(해시 변경)로 들어오면 경매 소스로 전환한다.
  window.addEventListener('hashchange',()=>{if(!disposed&&location.hash==='#auction'&&source!=='auction')setSource('auction');},{signal:abort.signal});
  let hiddenKey=member.hiddenIds().sort().join(',');
  member.addEventListener('change',()=>{if(disposed)return;if(source==='favorites'){load({fit:false});return;}const next=member.hiddenIds().sort().join(',');if(next!==hiddenKey){hiddenKey=next;load({fit:false});}else if(result)drawCards();},{signal:abort.signal});
  applySourceUi();
  load();
  function applySuggestion(){
    updateCriteria();quickFilters?.update();
    quickFilters?.setRemembered(onConditionsChange?.(currentConditions())!==false);
    limit=5;closeDetail();load();
  }
  return ()=>{document.body.classList.remove('map-results-open');disposed=true;clearTimeout(loadTimer);quickFilters.destroy();abort.abort();closeComparison?.();closeContext?.();closeRecords?.();closeLand?.();closeCommercial?.();closeSurrounding?.();closeStreetPreview?.();closeStreet?.();map.destroy();};
}

