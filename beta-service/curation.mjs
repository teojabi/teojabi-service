import { apiFetch } from './api-client.mjs';

import { ListingMap, openStreetView } from './map-controller.mjs';
import { formatArea, getAreaDisplayUnit, setAreaDisplayUnit } from './area-display.mjs';
import { initAdminAccess } from './admin-access.mjs';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={commercial:'상업·근생·숙박',residential:'단독·다가구',office:'업무용 건물',land:'토지'};
const prices=['10~20억 미만','20~40억 미만','40~70억 미만','70~100억 이상','100억 이상'];
let mode='registered',sources=[],registered=[],sourceTotal=0,current=null,map=null,loading=false,pickOnly=false,sourcesLoaded=false,showAllRegistered=true,showRegisteredSources=true,autoSelectionIds=null;
const selectedIds=new Set();
const money=n=>`${Number(n||0).toLocaleString('ko-KR',{maximumFractionDigits:2})}억`;
const area=n=>formatArea(n,getAreaDisplayUnit(),'미기재');
const date=v=>v?new Date(v).toLocaleDateString('ko-KR'):'미확인';
const toNumber=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const rangeOf=(id,multiplier=1)=>{const value=$(`#${id}`).value;if(!value)return [null,null];const [min,max]=value.split(':');return [min===''?null:Number(min)*multiplier,max===''?null:Number(max)*multiplier];};
const selectedDistricts=()=>[...document.querySelectorAll('#review-district-options input:checked')].map(input=>input.value);
const textIncludes=(value,words)=>words.some(word=>String(value||'').includes(word));
function broadZone(zoning){const z=String(zoning||'');if(z.includes('상업'))return '상업지역';if(z.includes('주거'))return '주거지역';if(z.includes('공업'))return '공업지역';if(z.includes('녹지'))return '녹지지역';return z;}
function aboveFloor(row){const s=row.snapshot||{};let n=toNumber(s.aboveFloors);if(n!==null)return n;const m=String(s.floorInfo||'').match(/(?:지상\s*)?(\d+)\s*층$|\/(\d+)\s*$/);return m?Number(m[1]||m[2]):null;}
function hasZoneState(row,key){const s=row.snapshot||{},values=[s[key],s[`${key}Status`],s[`${key}Relation`],s[`${key}Zone`],s[key]?.status,s[key]?.relation].filter(Boolean).join(' ');return /(overlap|contained|touch|해당|포함|저촉|접함|구역)/i.test(values);}
function matchesBuildUse(row,use){const s=row.snapshot||{},text=[s.mainUse,s.description,s.zoning].join(' ');if(!use)return true;if(use==='hotel')return textIncludes(text,['숙박','호텔','관광']);if(use==='office')return textIncludes(text,['업무','사무','오피스']);if(use==='retail')return textIncludes(text,['근린생활','상가','판매','근생']);if(use==='residential')return textIncludes(text,['주택','다가구','단독','공동주택']);if(use==='mixed')return textIncludes(text,['상가주택','복합','근린생활','주택']);return true;}
const rowId=r=>r.id||`${r.source_table}:${r.source_id}`;
const pickOf=r=>r.snapshot?.teojabiPick||{};
const isTeojabiPick=r=>r.snapshot?.pickType==='premium'||r.source_table==='premium'||r.snapshot?.sourceStatus==='터잡이픽'||pickOf(r).status==='published';
function naverArticleUrl(row){
  const sourceTable=row.source_table||row.snapshot?.source_table,articleNo=String(row.source_id||row.snapshot?.source_id||'').trim();
  return (sourceTable==='naver'||sourceTable==='naver_land')&&/^\d+$/.test(articleNo)?`https://fin.land.naver.com/articles/${articleNo}`:'';
}
function message(text,error=false){$('#review-message').textContent=text;$('#review-message').classList.toggle('error',error);}
function budgetOfWon(priceWon){
  const eok=Number(priceWon||0)/1e8;
  if(eok<20)return 0;if(eok<40)return 1;if(eok<70)return 2;if(eok<100)return 3;return 4;
}
function categoryOfCatalog(item){
  const text=[item.kind,item.source,item.description,item.buildingFacts?.mainUse].join(' ');
  if(/토지|land/i.test(text))return 'land';
  if(/주택|다가구|단독|다세대|빌라/i.test(text))return 'residential';
  if(/업무|오피스|office/i.test(text))return 'office';
  return 'commercial';
}
function sourceTableOfCatalog(item){
  if(item.id?.startsWith('naver-land:'))return 'naver_land';
  if(item.id?.startsWith('premium:'))return 'premium';
  return 'naver';
}
function normalizeRegistered(rows){return rows.filter(r=>r.snapshot?.teojabiPick).map(r=>({id:`${r.source_table}:${r.source_id}`,registered_id:r.id,source_table:r.source_table,source_id:r.source_id,category:r.category,budget:r.budget,snapshot:r.snapshot,registered:true,version:r.version,updated_at:r.updated_at,rank:r.rank,origin:'admin'}));}
function normalizeCatalogRows(rows){return (rows||[]).map(item=>{
  const source_table=sourceTableOfCatalog(item),source_id=String(item.sourceId||item.id?.split(':').slice(1).join(':')||item.id||'');
  const headline=String(item.description||item.title||'').split('\\n')[0].trim();
  const floorInfo=item.floorInfo||item.buildingFacts?.floorScale||[item.buildingFacts?.basementFloors&&`지하 ${item.buildingFacts.basementFloors}층`,item.buildingFacts?.aboveFloors&&`지상 ${item.buildingFacts.aboveFloors}층`].filter(Boolean).join(' / ');
  return {id:`${source_table}:${source_id}`,source_table,source_id,category:categoryOfCatalog(item),budget:budgetOfWon(item.priceWon),registered:true,origin:'catalog',snapshot:{source_table,source_id,address:item.address,district:item.district,neighborhood:item.neighborhood,pnu:item.pnu,position:item.position,price:Number(item.priceWon||0)/1e8,areaM2:item.areaM2,floorAreaM2:item.floorAreaM2,zoning:item.zoning,mainUse:item.buildingFacts?.mainUse||item.kind,floorInfo,approvalDate:item.buildingFacts?.approvalDate,description:item.description||'',sourceStatus:item.cohort==='existing'?'터잡이픽':item.source||item.cohort,pickType:item.cohort==='existing'?'premium':'curated',teojabiPick:{status:item.cohort==='existing'?'published':'curated',pickNo:item.teojabiNo||'',headline}}};
}).filter(r=>r.source_id&&r.snapshot.address);}
function mergeRegistered(adminRows,catalogRows){
  const merged=new Map();
  for(const row of catalogRows)merged.set(`${row.source_table}:${row.source_id}`,row);
  for(const row of adminRows)merged.set(`${row.source_table}:${row.source_id}`,row);
  return [...merged.values()].sort((a,b)=>String(pickOf(a).pickNo||'9999').localeCompare(String(pickOf(b).pickNo||'9999'))||(a.snapshot.price||0)-(b.snapshot.price||0));
}
function activeRows(){return mode==='registered'?registered:sources;}
function visible(){
  const q=$('#review-query').value.trim().toLowerCase(),cat=$('#review-category').value,districts=selectedDistricts(),sort=$('#review-sort').value,
    [minPrice,maxPrice]=rangeOf('review-price-range'),[minArea,maxArea]=rangeOf('review-area-range',3.305785),[minFloor,maxFloor]=rangeOf('review-floor-range'),zone=$('#review-zone').value,buildUse=$('#review-build-use').value,roadMin=toNumber($('#review-road-min').value),
    preferTourism=$('#review-tourism').checked,excludeEducation=$('#review-exclude-education').checked,excludeHeritage=$('#review-exclude-heritage').checked;
  if(mode==='registered'){
    return registered.filter(r=>{
      const s=r.snapshot||{},p=pickOf(r),searchText=[p.pickNo,s.address,s.neighborhood,s.district,s.source_id,r.source_id].join(' ').toLowerCase();
      return (!pickOnly||isTeojabiPick(r))&&(!districts.length||districts.includes(s.district))&&(!q||searchText.includes(q));
    });
  }
  return activeRows().filter(r=>{
    const s=r.snapshot||{},floor=aboveFloor(r),zoneText=String(s.zoning||''),searchText=[s.address,s.neighborhood,s.district,s.source_id,r.source_id,pickOf(r).pickNo,s.mainUse,s.description,s.zoning].join(' ').toLowerCase();
    return (!autoSelectionIds||autoSelectionIds.has(rowId(r)))&&(showRegisteredSources||!r.registered)&&(!cat||r.category===cat)&&(!districts.length||districts.includes(s.district))&&(!q||searchText.includes(q))&&
      (minPrice===null||Number(s.price||0)>=minPrice)&&(maxPrice===null||Number(s.price||0)<=maxPrice)&&
      (minArea===null||Number(s.areaM2||0)>=minArea)&&(maxArea===null||Number(s.areaM2||0)<=maxArea)&&
      (minFloor===null||floor!==null&&floor>=minFloor)&&(maxFloor===null||floor!==null&&floor<=maxFloor)&&
      (!zone||zoneText.includes(zone)||broadZone(zoneText)===zone)&&matchesBuildUse(r,buildUse)&&
      (roadMin===null||Number(s.road||0)>=roadMin)&&(!preferTourism||textIncludes([s.description,s.mainUse,s.zoning,s.tourism,s.tourismZone].join(' '),['관광숙박','숙박','호텔']))&&
      (!excludeEducation||!hasZoneState(r,'education'))&&(!excludeHeritage||!hasZoneState(r,'heritage'));
  }).sort((a,b)=>sort==='area'?(b.snapshot.areaM2||0)-(a.snapshot.areaM2||0):sort==='price-desc'?(b.snapshot.price||0)-(a.snapshot.price||0):sort==='floor-low'?(aboveFloor(a)??999)-(aboveFloor(b)??999):sort==='recent'?String(b.snapshot.snapshotAt||b.updated_at||'').localeCompare(String(a.snapshot.snapshotAt||a.updated_at||'')):(a.snapshot.price||0)-(b.snapshot.price||0));
}
function redrawStats(){
  $('#review-stats').innerHTML=[['원자료 후보',sourcesLoaded?sources.length:sourceTotal],['등록한 매물',registered.length],['터잡이픽',registered.filter(isTeojabiPick).length],['자동번호 필요',registered.filter(r=>!pickOf(r).pickNo).length]]
    .map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('');
}
function draw(){
  document.querySelector('.review-filters')?.classList.toggle('registered-simple',mode==='registered');
  redrawStats();
  const list=visible();
  updateBulkTools(list);
  const renderLimit=mode==='source'?120:showAllRegistered?list.length:180,renderRows=list.slice(0,renderLimit);
  $('#review-count').textContent=`${mode==='registered'?'등록한 매물':autoSelectionIds?'자동선별 결과':'네이버 원자료 후보'} ${list.length}개${list.length>renderRows.length?' · 먼저 '+renderRows.length+'개 표시':''}`;
  $('#review-list').innerHTML=renderRows.map(r=>{
    const id=rowId(r),s=r.snapshot||{},p=pickOf(r),registeredText=isTeojabiPick(r)?'터잡이픽':r.registered?'등록됨':'미등록',selectable=mode==='source'&&!r.registered;
    return `<article class="review-card${id===current?' active':''}${selectedIds.has(id)?' bulk-selected':''}"><button class="review-open" data-open="${esc(id)}" aria-pressed="${id===current}">
      <div class="review-card-top"><span>${p.pickNo?`매물번호 ${esc(p.pickNo)}`:`${esc(r.source_table)} ${esc(r.source_id)}`}</span><span class="review-tag">${registeredText}</span></div>${selectable?`<label class="bulk-check-wrap"><input class="bulk-check" type="checkbox" data-select="${esc(id)}" ${selectedIds.has(id)?'checked':''}> 일괄 등록 선택</label>`:''}
      <h3>${esc(s.address)}</h3><div class="review-price">${money(s.price)}</div><p>${esc(types[r.category]||'기타')} · ${esc(s.mainUse||'용도 미확인')}</p>
      <div class="review-card-areas"><span>대지 <b>${area(s.areaM2)}</b></span><span>연면적 <b>${area(s.floorAreaM2)}</b></span></div>
      <p>${esc(p.headline||s.description?.split('\n')[0]||'매물 설명을 입력해 주세요.')}</p></button></article>`;
  }).join('')||(mode==='source'&&!sourcesLoaded?'<div class="review-empty"><h3>원자료를 불러오고 있어요.</h3><p>등록 목록을 먼저 볼 수 있어요.</p></div>':'<div class="review-empty"><h3>조건에 맞는 매물이 없습니다.</h3><p>검색 조건을 바꿔보세요.</p></div>');
  const unit=getAreaDisplayUnit()==='pyeong'?'평':'㎡';
  $('#review-unit').textContent=`면적: ${unit}`;
  $('#review-unit').setAttribute('aria-pressed',String(getAreaDisplayUnit()==='pyeong')); 
}

function updateBulkTools(list=visible()){
  const bulk=$('#review-bulk'),sourceBox=bulk?.querySelector('.source-bulk'),registeredBox=bulk?.querySelector('.registered-bulk');
  if(!bulk)return;
  bulk.hidden=false;
  sourceBox.hidden=mode!=='source';registeredBox.hidden=mode!=='registered';
  selectedIds.forEach(id=>{const row=sources.find(r=>rowId(r)===id);if(!row||row.registered)selectedIds.delete(id);});
  $('#bulk-selected-count').textContent=`선택 ${selectedIds.size}개`;
  $('#bulk-register').disabled=!selectedIds.size||loading;
  $('#bulk-select-visible').disabled=mode!=='source'||!sourcesLoaded||!list.some(r=>!r.registered)||loading;
  $('#bulk-select-visible').textContent=sourcesLoaded?`현재 화면 ${Math.min(list.length,120)}개 전체 선택`:'원자료 불러오는 중';
  $('#source-registered-toggle').setAttribute('aria-pressed',String(showRegisteredSources));
  $('#source-registered-toggle').textContent=showRegisteredSources?'등록된 매물 숨기기':'등록된 매물 함께 보기';
  $('#auto-selection-clear').hidden=mode!=='source'||!autoSelectionIds;
  $('#pick-only-toggle').setAttribute('aria-pressed',String(pickOnly));
  $('#pick-only-toggle').textContent=pickOnly?'터잡이픽만 보는 중':'터잡이픽만 보기';
  $('#registered-show-all').setAttribute('aria-pressed',String(showAllRegistered));
  $('#registered-show-all').textContent=showAllRegistered?'처음 180개만 보기':'등록 매물 모두보기';
  $('#registered-show-all').disabled=mode!=='registered'||list.length<=180;
}
async function postCuration(payload){
  const response=await apiFetch('/api/curation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();
  if(!response.ok||!['saved','deleted','existing','seeded','refreshed'].includes(data.status))throw new Error(data.status==='invalid'?'요청값을 확인해 주세요.':'처리하지 못했습니다.');
  return data;
}
function registeredFromSaved(data){return {id:`${data.row.snapshot.source_table}:${data.row.snapshot.source_id}`,registered_id:data.row.id,source_table:data.row.snapshot.source_table,source_id:data.row.snapshot.source_id,category:data.row.category,budget:data.row.budget,snapshot:data.row.snapshot,registered:true,version:data.row.version,updated_at:data.row.updated_at,rank:data.row.rank,origin:'admin'};}
function applyRegistered(updated){
  registered=registered.filter(r=>!(r.source_table===updated.source_table&&r.source_id===updated.source_id));registered.unshift(updated);
  sources=sources.map(r=>r.source_table===updated.source_table&&r.source_id===updated.source_id?{...r,registered:true}:r);
  selectedIds.delete(rowId(updated));
}
async function registerRow(row,description=null,pickNo=null){
  const s=row.snapshot||{};
  const data=await postCuration({action:'register',source_table:row.source_table,source_id:row.source_id,pickNo:pickNo||randomNo(),description:description??(pickOf(row).headline||s.description?.split('\\n')[0]||''),publish:Boolean(row.registered)});
  const updated=registeredFromSaved(data);applyRegistered(updated);return updated;
}
async function deleteRow(row){
  const id=rowId(row);
  await postCuration({action:'delete',source_table:row.source_table,source_id:row.source_id});
  registered=registered.filter(r=>rowId(r)!==id);
  sources=sources.map(r=>rowId(r)===id?{...r,registered:false}:r);
  selectedIds.delete(id);
  if(current===id)current=null;
}
function fillDistricts(){
  const before=new Set(selectedDistricts());
  const rows=[...sources,...registered],districts=[...new Set(rows.map(r=>r.snapshot?.district).filter(Boolean))].sort();
  $('#review-district-options').innerHTML=districts.map(d=>`<label><input type="checkbox" value="${esc(d)}" ${before.has(d)?'checked':''}>${esc(d)}</label>`).join('');
  updateDistrictSummary();
}
function updateDistrictSummary(){const districts=selectedDistricts();$('#review-district-summary').textContent=!districts.length?'서울 전체':districts.length<=2?districts.join(' · '):`${districts.slice(0,2).join(' · ')} 외 ${districts.length-2}곳`;}
function randomNo(){
  const used=new Set(registered.map(r=>pickOf(r).pickNo).filter(Boolean));
  for(let i=0;i<5000;i++){const n=String(Math.floor(1000+Math.random()*9000));if(!used.has(n))return n;}
  for(let n=1000;n<10000;n++)if(!used.has(String(n)))return String(n);
  return '';
}
function model(row){const s=row.snapshot||{};return {id:rowId(row),district:s.district,neighborhood:s.neighborhood,position:s.position,priceWon:(s.price||0)*1e8,areaM2:s.areaM2,cohort:isTeojabiPick(row)?'existing':'curated'};}
function open(id){
  const row=activeRows().find(r=>rowId(r)===id)||sources.find(r=>rowId(r)===id)||registered.find(r=>rowId(r)===id);if(!row)return;
  const editable=row.source_table==='naver'||row.source_table==='naver_land';
  const rowIsPick=isTeojabiPick(row);
  const submitLabel=row.registered?(rowIsPick?'수정 저장':'터잡이픽 등록'):'등록';
  current=id;map?.destroy();map=null;draw();
  const s=row.snapshot||{},p=pickOf(row),initialNo=p.pickNo||randomNo(),initialDescription=p.headline||s.description?.split('\n')[0]||'',naverUrl=naverArticleUrl(row);
  const facts=[['가격',money(s.price)],['대지면적',area(s.areaM2)],['연면적',area(s.floorAreaM2)],['용도지역',s.zoning],['주용도',s.mainUse],['층 정보',s.floorInfo||s.aboveFloors&&`지상 ${s.aboveFloors}층`],['사용승인일',s.approvalDate],['수집 상태',s.sourceStatus]];
  $('#review-detail').innerHTML=`<div class="review-detail-head"><span class="eyebrow">${rowIsPick?'터잡이픽 수정':row.registered?'등록 매물 · 터잡이픽 전환':'원자료 매물 등록'}</span><h2>${esc(s.address)}</h2><div class="review-price">${money(s.price)}</div>
    <div class="review-detail-tools"><button id="candidate-street">네이버 거리뷰</button>${naverUrl?`<a href="${naverUrl}" target="_blank" rel="noopener noreferrer">네이버 매물 보기 ↗</a>`:''}<a href="/index.html#analyze" target="_blank" rel="noopener">내건물·토지로 검토 ↗</a>${s.source_table==='naver'||row.source_table==='naver'?`<a href="/index.html#listing=naver%3A${encodeURIComponent(row.source_id)}" target="_blank" rel="noopener">사용자 상세 보기 ↗</a>`:''}</div></div>
    <div id="candidate-map" class="review-map" role="region" aria-label="매물 위치 지도"></div><p id="candidate-map-status" class="review-map-status">지도를 불러오고 있어요.</p>
    <div class="review-detail-body"><dl class="review-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v||'미기재')}</dd></div>`).join('')}</dl>
    <form id="candidate-register" class="review-form review-section"><h3>${row.registered?(rowIsPick?'터잡이픽 수정':'터잡이픽 등록'):'터잡이 매물 등록'}</h3>
      <div class="pick-grid"><label>터잡이 번호<input name="pickNo" inputmode="numeric" pattern="\\d{4}" maxlength="4" value="${esc(initialNo)}" placeholder="자동 입력"></label><button type="button" class="review-save secondary" id="auto-pick-no">없는 번호 자동 입력</button></div>
      <label>매물 설명 한 줄<textarea name="description" maxlength="120" placeholder="예: 상업지역 코너 입지, 신축 검토하기 좋은 노후 건물">${esc(initialDescription)}</textarea></label>
      <button type="submit" class="review-save" ${editable?'':'disabled'}>${submitLabel}</button>${row.registered?'<button type="button" class="review-delete" id="candidate-delete">매물 삭제</button>':''}<p id="candidate-save-message" class="review-save-message" role="status">${editable?(row.registered?(rowIsPick?'터잡이픽으로 표시 중입니다.':'터잡이픽 등록을 누르면 홈페이지에서 터잡이픽으로 표시됩니다.'):'등록을 누르면 등록한 매물 목록에 추가됩니다.'):rowIsPick?'기존 사이트 프리미엄 매물입니다.':'기존 등록 자료입니다. 원자료 연결 후 수정할 수 있어요.'}</p>
    </form>
    <section class="review-section"><details><summary>원자료 설명 보기</summary><p class="raw-description">${esc(s.description||'설명 미기재')}</p><small>${esc(row.source_table)} / ${esc(row.source_id)}</small></details></section></div>`;
  $('#auto-pick-no').onclick=()=>{$('#candidate-register [name=pickNo]').value=randomNo();};
  $('#candidate-street').onclick=()=>openStreetView(s.position);
  const status=$('#candidate-map-status');
  try{
    const item=model(row);
    if(!Number.isFinite(Number(item.position?.lat))||!Number.isFinite(Number(item.position?.lng)))throw new Error('위치 좌표가 없어 지도를 표시할 수 없습니다.');
    map=new ListingMap($('#candidate-map'),{center:item.position,zoom:16,onStatus:(state,message)=>{status.textContent=state==='ready'?'지도에서 위치를 확인할 수 있어요.':message||'지도를 표시하지 못했습니다.';}});
    void map.mount([{representative:item,listings:[item]}],item.id,true).then(()=>{if(map?.ready)map.select(item,{pan:false});});
  }
  catch(error){status.textContent=error.message||'지도를 표시하지 못했습니다.';}
  const deleteButton=$('#candidate-delete');
  if(deleteButton)deleteButton.onclick=async()=>{deleteButton.disabled=true;try{await deleteRow(row);fillDistricts();draw();$('#review-detail').innerHTML='<div class="review-empty"><h2>매물을 삭제했습니다.</h2><p>홈페이지 노출 목록에서 제외했어요.</p></div>';message('매물을 삭제했습니다.');}catch(error){message(error.message,true);}finally{deleteButton.disabled=false;}};
  $('#candidate-register').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),payload={action:'register',source_table:row.source_table,source_id:row.source_id,pickNo:form.pickNo.value,description:form.description.value};
    button.disabled=true;$('#candidate-save-message').textContent='등록하고 있어요.';
    try{
      const updated=await registerRow(row,form.description.value,form.pickNo.value);
      mode='registered';current=rowId(updated);setModeButtons();fillDistricts();draw();open(rowId(updated));message(row.registered?'터잡이픽으로 등록했습니다.':'등록한 매물 목록에 저장했습니다.');
    }catch(error){$('#candidate-save-message').textContent=error.message;}
    finally{button.disabled=false;}
  });
}
function setModeButtons(){document.querySelectorAll('[data-pick-mode]').forEach(button=>{const active=button.dataset.pickMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
async function load(){
  if(loading)return;loading=true;$('#review-refresh').disabled=true;message('등록한 매물 목록을 불러오고 있어요.');
  try{
    const [regRes,catalogRes,sourceMetaRes]=await Promise.all([apiFetch('/api/curation'),apiFetch('/api/catalog?limit=500'),apiFetch('/api/curation?mode=source-meta')]);
    const [reg,catalog,sourceMeta]=await Promise.all([regRes.json(),catalogRes.json(),sourceMetaRes.json()]);
    if(reg.status!=='ready'||catalog.status!=='ready')throw new Error();
    if(sourceMeta.status==='ready')sourceTotal=Number(sourceMeta.count||0);
    const catalogItems=(catalog.rows&&catalog.rows.length?catalog.rows:(catalog.groups||[]).map(group=>group.representative).filter(Boolean));
    registered=mergeRegistered(normalizeRegistered(reg.rows||[]),normalizeCatalogRows(catalogItems));
    if(sourcesLoaded){const registeredKeys=new Set(registered.map(r=>`${r.source_table}:${r.source_id}`));sources=sources.map(r=>({...r,registered:registeredKeys.has(`${r.source_table}:${r.source_id}`)}));}
    fillDistricts();setModeButtons();draw();message('등록한 매물 목록을 표시했어요. 원자료는 원자료 탭을 누를 때 불러옵니다.');
  }catch{message('자료를 불러오지 못했습니다. 로컬 DB와 서버 상태를 확인해 주세요.',true);}
  finally{loading=false;$('#review-refresh').disabled=false;updateBulkTools();}
}
async function loadSources(force=false){
  if(sourcesLoaded||loading)return;loading=true;$('#review-refresh').disabled=true;message('네이버 원자료 후보를 불러오고 있어요.');draw();
  try{const srcRes=await apiFetch(`/api/curation?mode=sources${force?'&refresh=1':''}`),src=await srcRes.json();if(src.status!=='ready')throw new Error();sources=src.rows||[];sourceTotal=sources.length;sourcesLoaded=true;const registeredKeys=new Set(registered.map(r=>`${r.source_table}:${r.source_id}`));sources=sources.map(r=>({...r,registered:registeredKeys.has(`${r.source_table}:${r.source_id}`)}));fillDistricts();draw();message('원자료에서 체크박스로 여러 개를 선택한 뒤 선택 매물 등록을 누르세요.');}
  catch{message('원자료 후보를 불러오지 못했습니다.',true);}finally{loading=false;$('#review-refresh').disabled=false;updateBulkTools();}
}
$('#review-list').addEventListener('click',event=>{const checkbox=event.target.closest('[data-select]');if(checkbox){const id=checkbox.dataset.select;checkbox.checked?selectedIds.add(id):selectedIds.delete(id);draw();event.stopPropagation();return;}const button=event.target.closest('[data-open]');if(button)open(button.dataset.open);});
for(const id of ['category','price-range','area-range','floor-range','sort','zone','build-use','road-min'])$(`#review-${id}`).addEventListener('change',()=>{draw();});
$('#review-district-options').addEventListener('change',()=>{updateDistrictSummary();draw();});
$('#review-district-clear').onclick=()=>{document.querySelectorAll('#review-district-options input').forEach(input=>input.checked=false);updateDistrictSummary();draw();};
for(const id of ['tourism','exclude-education','exclude-heritage'])$(`#review-${id}`).addEventListener('change',()=>{draw();});
$('#review-query').addEventListener('input',()=>draw());
$('#review-reset').onclick=()=>{for(const id of ['query','category','price-range','area-range','floor-range','zone','build-use','road-min'])$(`#review-${id}`).value='';document.querySelectorAll('#review-district-options input').forEach(input=>input.checked=false);updateDistrictSummary();for(const id of ['tourism','exclude-education','exclude-heritage'])$(`#review-${id}`).checked=false;$('#review-sort').value='price';draw();};
$('#review-unit').onclick=()=>{setAreaDisplayUnit(getAreaDisplayUnit()==='pyeong'?'m2':'pyeong');draw();if(current)open(current);};
$('#review-refresh').onclick=()=>{if(mode==='source'){sourcesLoaded=false;sources=[];loadSources(true);}else load();};
$('#auto-select-200').onclick=async()=>{
  if(loading)return;loading=true;const button=$('#auto-select-200');button.disabled=true;message('가격·유형·지역 분산 기준으로 자동 선별 200개를 확인하고 있어요.');
  try{
    const data=await postCuration({action:'auto_select_200'});
    sourcesLoaded=false;sources=[];registered=[];selectedIds.clear();current=null;mode='source';autoSelectionIds=new Set(data.sourceIds||[]);loading=false;setModeButtons();await load();await loadSources();draw();
    message(`최신 원자료에서 자동 선별 ${Number(data.selected||200)}개를 새로 구성해 표시했습니다. 직접 등록한 ${Number(data.preserved||0)}개는 유지했습니다.`);
  }catch(error){message('자동 선별을 실행하지 못했습니다.',true);}finally{loading=false;button.disabled=false;updateBulkTools();}
};
document.querySelectorAll('[data-pick-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.pickMode;if(mode==='registered')showAllRegistered=true;current=null;selectedIds.clear();setModeButtons();draw();$('#review-detail').innerHTML='<div class="review-empty"><h2>매물을 눌러보세요.</h2><p>등록하거나 수정할 매물을 선택해 주세요.</p></div>';if(mode==='source'&&!sourcesLoaded){loadSources();}else if(mode==='source'){message('원자료에서 체크박스로 여러 개를 선택한 뒤 선택 매물 등록을 누르세요.');}else{message('등록한 매물은 지역만 골라 간단히 확인할 수 있어요.');}}));
$('#bulk-select-visible').onclick=()=>{for(const row of visible().slice(0,120))if(mode==='source'&&!row.registered)selectedIds.add(rowId(row));draw();};
$('#bulk-clear').onclick=()=>{selectedIds.clear();draw();};
$('#auto-selection-clear').onclick=()=>{autoSelectionIds=null;draw();message('전체 네이버 원자료를 표시합니다.');};
$('#source-registered-toggle').onclick=()=>{showRegisteredSources=!showRegisteredSources;current=null;draw();$('#review-detail').innerHTML='<div class="review-empty"><h2>매물을 눌러보세요.</h2><p>네이버 원자료에서 등록할 매물을 선택해 주세요.</p></div>';};
$('#pick-only-toggle').onclick=()=>{pickOnly=!pickOnly;draw();};
$('#registered-show-all').onclick=()=>{showAllRegistered=!showAllRegistered;draw();};
$('#bulk-register').onclick=async()=>{
  const rows=[...selectedIds].map(id=>sources.find(r=>rowId(r)===id)).filter(Boolean).filter(r=>!r.registered).slice(0,120);if(!rows.length)return;
  loading=true;updateBulkTools();message(`${rows.length}개 매물에 터잡이 번호를 자동 배정해 일괄 등록하고 있어요.`);
  try{
    const data=await postCuration({action:'bulk_register',items:rows.map(row=>({source_table:row.source_table,source_id:row.source_id,description:pickOf(row).headline||row.snapshot?.description?.split('\n')[0]||''}))});
    const saved=Number(data.saved||0);selectedIds.clear();current=null;mode='registered';sourcesLoaded=false;sources=[];registered=[];loading=false;setModeButtons();await load();message(`${saved}개 매물을 일괄 등록하고, 각 매물에 빈 터잡이 번호를 자동 배정했습니다.`);
  }catch(error){message(`일괄 등록하지 못했습니다. ${error.message}`,true);}finally{loading=false;updateBulkTools();}
};
setModeButtons();
load();
initAdminAccess();




