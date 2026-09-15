import { apiFetch } from './api-client.mjs';
import { saveNamed } from './member.mjs';
import { openReviewExport } from './site-export.mjs';
import { loadNaverMaps } from './map-controller.mjs';
import { validateSiteInputs,constructionEstimate } from './site-inputs.mjs';
import { selectedLedgerArea } from './land-policy.mjs';
import { selectionKey, syncSiteRatios, renderSiteContext } from './site-context.mjs';
import { renderBuildingRecords } from './building-records.mjs';
import { renderLandRecord } from './land-records.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountSiteReview(root,{draft,onBack}) {
  const abort=new AbortController(),selected=new Map(draft.selected.map(f=>[f.id,f])),cache=new Map();
  let disposed=false,restoring=false,version=0,n,map,observer,features=[...selected.values()];const listeners=[];
  const $=s=>root.querySelector(s);
  draft.areaUnit??='m2';draft.unitCost??='1000';
  root.innerHTML=`<section class="site-review"><button class="back" data-site="back">← ${draft.listingId?'매물 상세로 돌아가기':'처음으로'}</button><header class="site-heading"><span class="eyebrow">MY BUILDING & LAND</span><h1>내 건물·토지</h1><p>지도에서 내 땅을 눌러 선택하고, 검토 조건을 입력해 보세요.</p></header><div class="site-layout"><section class="site-picker"><h2><span>01</span> 검토할 필지 선택</h2><form id="site-search"><label for="site-address">선택한 주소 · 직접 검색도 가능해요</label><div><input id="site-address" value="${esc(draft.address)}" placeholder="예: 서울특별시 금천구 시흥동 999-45" maxlength="150" autocomplete="off"><button class="outline" type="submit">필지 찾기</button></div></form><div class="site-map-wrap"><div class="site-map" role="region" aria-label="검토 필지 선택 지도"></div><button class="outline" data-site="nearby" disabled>필지 선택</button></div><p class="site-map-status" role="status">지도를 불러오고 있어요.</p><p class="site-search-status" role="status"></p><div class="site-parcel-list" aria-label="검색한 필지"></div><p class="site-selection-count" aria-live="polite"></p><p class="case-note">지도 경계나 목록에서 필지를 선택·해제하세요. 여러 필지를 함께 선택할 수 있어요.</p></section><section class="site-input-card"><h2><span>02</span> 검토 조건 입력</h2><div class="site-ledger-summary" aria-live="polite"></div><form id="site-inputs" novalidate><div class="site-input-grid">${[['landArea','대지면적','㎡',draft.fields.landArea],['far','용적률','%',draft.fields.far],['bcr','건폐율','%',draft.fields.bcr],['height','높이','m',draft.fields.height],['unitCost','평당 공사비','만원',draft.unitCost]].map(([key,label,unit,value])=>`<label for="site-${key}">${label}${['landArea','unitCost'].includes(key)?'':' <small>선택</small>'}<div><input id="site-${key}" name="${key}" value="${esc(value)}" type="text" inputmode="decimal" autocomplete="off" placeholder="직접 입력"><span>${unit}</span></div></label>`).join('')}</div><p class="site-area-source">${esc(draft.areaSource)} · 선택한 전체 대지의 면적인지 확인해 주세요.</p><label class="site-memo-label" for="site-memo">계획하는 용도·메모 <small>선택</small></label><textarea id="site-memo" rows="3" maxlength="1000" placeholder="예: 1층 카페, 상층부 사무실">${esc(draft.memo||'')}</textarea><p class="case-note">확인한 기준이나 검토할 가정값을 입력해 주세요. 입력값은 공식 허용치로 확정되지 않아요.</p><p class="site-input-error" role="alert"></p><button class="primary" type="submit">입력한 조건 확인</button><p class="case-note">입력한 검토는 계정에 저장하거나 파일로 내려받을 수 있어요.</p></form><div class="site-input-summary" hidden aria-live="polite"></div></section></div></section>`;
  const clearSummary=()=>{$('.site-input-summary').hidden=true;$('.site-input-error').textContent='';};
  $('#site-search').before($('.site-map-wrap'));
  const areaText=m2=>`${(Number(m2)*(draft.areaUnit==='pyeong'?121/400:1)).toLocaleString('ko-KR',{maximumFractionDigits:2})}${draft.areaUnit==='pyeong'?'평':'㎡'}`;
  const estimate=()=>constructionEstimate(draft.fields,draft.unitCost);
  function showCosts(){}
  function syncAreaInput(){
    $('#site-landArea').value=draft.fields.landArea?String(Number((Number(draft.fields.landArea)*(draft.areaUnit==='pyeong'?121/400:1)).toFixed(8))):'';
    $('#site-landArea').nextElementSibling.textContent=draft.areaUnit==='pyeong'?'평':'㎡';
    showCosts();
  }
  $('.site-input-grid').insertAdjacentHTML('beforebegin',`<div class="site-unit-controls" role="group" aria-label="면적 단위"><button type="button" class="outline" data-site="unit" data-unit="m2" aria-pressed="${draft.areaUnit==='m2'}">㎡</button><button type="button" class="outline" data-site="unit" data-unit="pyeong" aria-pressed="${draft.areaUnit==='pyeong'}">평</button></div>`);
  syncAreaInput();
  const contexts=new Map(),pending=new Map(),documentCache=new Map();let contextVersion=0,lastSelection=null;
  $('.site-input-grid').insertAdjacentHTML('afterend','<div class="site-ratio-source" aria-live="polite"></div><button class="site-ratio-reset" type="button" data-site="reset-ratios">저장된 기준 다시 적용</button>');
  $('.site-layout').insertAdjacentHTML('afterend','<section class="site-context-card"><h2><span>03</span> 이 땅에서 확인할 사항</h2><p class="case-note">대장과 등기부터 확인하고, 그 아래에서 구역·도로·지구단위계획을 함께 살펴보세요.</p><div class="document-list site-document-actions"><div><span class="document-symbol">01</span><div><b>건축물대장</b><p>주소가 같은 표제부·총괄표제부 후보</p></div><button class="outline" data-site="documents" data-document="building" type="button" aria-expanded="false">건축물대장 보기</button></div><div><span class="document-symbol">02</span><div><b>토지(임야)대장</b><p>선택 필지의 공부상 토지 기록</p></div><button class="outline" data-site="documents" data-document="land" type="button" aria-expanded="false">토지대장 보기</button></div><div><span class="document-symbol">03</span><div><b>등기사항증명서</b><p>인터넷등기소에서 직접 열람</p></div><div class="document-actions"><button class="outline" data-site="copy-registry-address" type="button" disabled>필지 주소 복사</button><a class="outline" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">열람·발급 ↗</a></div></div></div><div class="site-document-status" role="status"></div><div class="site-document-result building-records" hidden></div><div class="site-context-divider"><span>필지별 확인사항</span></div><div class="site-context-list" aria-live="polite"></div></section>');
  $('#site-inputs').insertAdjacentHTML('beforeend','<div class="site-save-actions"><button class="outline" data-site="save" type="button">검토 저장</button><button class="outline" data-site="export" type="button">검토 내보내기</button></div>');
  function renderContext() {
    const list=[...selected.values()],common=syncSiteRatios(draft,list,contexts);
    for(const field of ['far','bcr'])$('#site-'+field).value=draft.fields[field];
    showCosts();
    const manual=['far','bcr'].some(f=>draft.ratioManual?.[f]);
    $('.site-ratio-source').textContent=!list.length?'필지를 선택하면 용적률·건폐율이 자동으로 채워져요.':manual?'직접 수정한 검토값을 사용하고 있어요.':
      list.some(f=>!contexts.has(f.id))?'선택한 필지의 기준을 불러오고 있어요.':
      common.far!==null&&common.bcr!==null?`저장된 용도지역 일반기준${list.length>1?' · 선택 필지 공통값':''}을 적용했어요.`:
      '값이 다르거나 미확정인 항목은 자동 입력하지 않아요. 아래 필지별 기준을 확인해 주세요.';
    $('.site-context-list').innerHTML=list.length?list.map(f=>renderSiteContext(f,contexts.get(f.id))).join(''):'<p class="site-context-empty">필지를 선택하면 해당 정보를 보여드려요.</p>';
    $('[data-site=reset-ratios]').disabled=!list.length;
    for(const control of root.querySelectorAll('.site-document-actions button'))control.disabled=!list.length;
  }
  async function copyText(text,statusTarget) {
    try {await navigator.clipboard.writeText(text);statusTarget.textContent='필지 주소를 복사했어요.';}
    catch {statusTarget.textContent='주소를 선택해 복사해 주세요.';}
  }
  function chooseRegistryAddress() {
    const list=[...selected.values()],status=$('.site-document-status');
    if(!list.length){status.textContent='먼저 필지를 선택해 주세요.';return;}
    if(list.length===1){copyText(list[0].properties.address||list[0].id,status);return;}
    const before=document.activeElement,d=document.createElement('dialog');d.className='save-dialog address-choice-dialog';d.setAttribute('aria-labelledby','address-choice-title');
    d.innerHTML=`<h2 id="address-choice-title">복사할 필지를 선택하세요</h2><div class="address-choice-list">${list.map(f=>`<button class="outline" type="button" data-address="${esc(f.properties.address||f.id)}">${esc(f.properties.address||f.id)}</button>`).join('')}</div><div class="export-actions"><button class="outline" data-close type="button">닫기</button></div><p class="case-note" role="status"></p>`;
    d.addEventListener('click',event=>{const item=event.target.closest('[data-address]');if(item)copyText(item.dataset.address,d.querySelector('[role=status]')).then(()=>setTimeout(()=>d.close(),350));if(event.target.closest('[data-close]'))d.close();});
    d.addEventListener('close',()=>{d.remove();before?.focus();});document.body.append(d);d.showModal();
  }
  async function loadDocuments(kind) {
    const list=[...selected.values()],host=$('.site-document-result'),status=$('.site-document-status');
    const active=root.querySelector(`[data-site=documents][data-document="${kind}"]`);
    if(!list.length){status.textContent='먼저 필지를 선택해 주세요.';host.hidden=true;return;}
    if(!host.hidden&&host.dataset.kind===kind){host.hidden=true;active?.setAttribute('aria-expanded','false');if(active)active.textContent=kind==='building'?'건축물대장 보기':'토지대장 보기';return;}
    for(const button of root.querySelectorAll('[data-site=documents]')){button.setAttribute('aria-expanded',String(button===active));button.textContent=button.dataset.document==='building'?(button===active?'대장 접기':'건축물대장 보기'):(button===active?'대장 접기':'토지대장 보기');}
    host.hidden=false;host.dataset.kind=kind;host.innerHTML='<p role="status">선택 필지의 자료를 불러오고 있어요.</p>';status.textContent='';
    const rows=[];
    for(const feature of list) {
      try {
        if(!documentCache.has(feature.id))documentCache.set(feature.id,apiFetch(`/api/parcel-documents/${encodeURIComponent(feature.id)}`,{signal:abort.signal}).then(async response=>{
          const data=await response.json();if(!response.ok||data.status!=='ready')throw new Error();return data;
        }).catch(error=>{documentCache.delete(feature.id);throw error;}));
        const data=await documentCache.get(feature.id);
        rows.push(`<article class="site-document-parcel"><h4>${esc(feature.properties.address||feature.id)}</h4>${kind==='building'?renderBuildingRecords(data.building):renderLandRecord(data.land)}</article>`);
      } catch {rows.push(`<article class="site-document-parcel"><h4>${esc(feature.properties.address||feature.id)}</h4><p>${kind==='building'?'건축물대장':'토지대장'} 자료를 불러오지 못했어요.</p></article>`);}
      if(disposed)return;
    }
    host.innerHTML=rows.join('')+'<p class="register-source">선택 필지 기준의 보유 자료 조회입니다. 발급 원본 서류나 권리관계 확정 자료는 아니에요.</p>';
  }
  async function loadContext() {
    const current=++contextVersion,list=[...selected.values()];renderContext();
    const queue=list.filter(f=>!contexts.has(f.id));
    async function worker() {
      while(queue.length&&!disposed&&current===contextVersion) {
        const f=queue.shift();
        try {
          if(!pending.has(f.id))pending.set(f.id,apiFetch(`/api/parcel-context/${encodeURIComponent(f.id)}`,{signal:abort.signal}).then(async response=>{
            const data=await response.json();if(!response.ok||!['ready','partial'].includes(data.status)||data.pnu!==f.id)throw new Error();return data;
          }).finally(()=>pending.delete(f.id)));
          contexts.set(f.id,await pending.get(f.id));
        } catch {if(!disposed)contexts.set(f.id,{status:'error'});}
        if(!disposed&&current===contextVersion){clearSummary();renderContext();}
      }
    }
    await Promise.all([worker(),worker()]);
  }
  function renderParcels(fit=false) {
    draft.selected=[...selected.values()];
    const key=selectionKey(draft.selected);
    if(lastSelection!==key){lastSelection=key;clearSummary();loadContext();}
    const ledger=selectedLedgerArea(draft.selected);
    $('.site-ledger-summary').innerHTML=ledger.status==='ready'?`<span>선택 필지 공부상 면적 합계</span><strong>${ledger.areaM2.toLocaleString('ko-KR',{maximumFractionDigits:5})}㎡</strong><small>${ledger.count}개 필지 · 토지대장 파일 ${esc(ledger.date)} 기준</small><button class="outline" type="button" data-site="apply-ledger">이 면적으로 검토하기</button>`:
      `<span>선택 필지 공부상 면적</span><p>${ledger.status==='empty'?'필지를 선택하면 공부상 면적을 확인할 수 있어요.':ledger.status==='mixed-dates'?'서로 다른 기준일의 자료여서 합계를 적용하지 않았어요.':`${ledger.count}개 중 ${ledger.covered}개 필지의 면적을 확인했어요. 전체 면적을 확인한 뒤 합계를 사용할 수 있어요.`}</p>`;
    $('.site-parcel-list').innerHTML=features.map(f=>`<button type="button" data-site="toggle" data-pnu="${esc(f.id)}" aria-pressed="${selected.has(f.id)}"><span aria-hidden="true">${selected.has(f.id)?'✓':'＋'}</span><span>${esc(f.properties.address||`필지 ${f.id}`)}</span></button>`).join('');
    $('.site-selection-count').textContent=`선택한 필지 ${selected.size}개`;
    if(!map||!n)return;
    map.data.forEach(f=>map.data.removeFeature(f));
    map.data.addGeoJson({type:'FeatureCollection',features});
    map.data.setStyle(feature=>({fillColor:selected.has(feature.getProperty('pnu'))?'#3b82f6':'#ffffff',fillOpacity:selected.has(feature.getProperty('pnu'))?.55:.15,strokeColor:selected.has(feature.getProperty('pnu'))?'#2563eb':'#94a3b8',strokeWeight:selected.has(feature.getProperty('pnu'))?3:1,clickable:true}));
    if(fit&&features.length) {
      const bounds=new n.LatLngBounds();
      for(const f of features)for(const ring of (f.geometry.type==='MultiPolygon'?f.geometry.coordinates.flat():f.geometry.coordinates))for(const [lng,lat] of ring)bounds.extend(new n.LatLng(lat,lng));
      map.fitBounds(bounds,{top:50,right:50,bottom:50,left:50});
    }
  }
  function toggle(pnu) {
    if(restoring)return;
    const feature=features.find(f=>f.id===pnu);if(!feature)return;
    if(selected.has(pnu))selected.delete(pnu);
    else if(selected.size<20)selected.set(pnu,feature);
    else {$('.site-search-status').textContent='한 번에 최대 20개 필지를 선택할 수 있어요.';return;}
    if(draft.areaSelectionKey&&draft.areaSelectionKey!==[...selected.keys()].sort().join(',')) {
      draft.fields.landArea='';draft.areaSelectionKey=null;draft.areaSource='선택 변경 · 공부상 면적 다시 적용';
      $('#site-landArea').value='';$('.site-area-source').textContent=draft.areaSource;
    }
    const address=selected.has(pnu)?feature.properties.address:[...selected.values()].at(-1)?.properties.address;
    draft.address=address||'';$('#site-address').value=draft.address;
    clearSummary();renderParcels();
  }
  async function search(query,{seed=false,fit=true,clickPoint=null}={}) {
    const current=++version,key=new URLSearchParams(query).toString();
    $('.site-search-status').textContent='필지를 찾고 있어요.';
    try {
      let data=cache.get(key);
      if(!data){const response=await apiFetch(`/api/site-parcels?${key}`,{signal:abort.signal});data=await response.json();if(!response.ok||data.status!=='ready')throw new Error();cache.set(key,data);}
      if(disposed||current!==version)return;
      const incoming=data.features;
      if(seed&&incoming.length===1){selected.set(incoming[0].id,incoming[0]);draft.initialPnu=null;}
      features=[...new Map([...selected.values(),...incoming].map(f=>[f.id,f])).values()];
      $('.site-search-status').textContent=incoming.length?`${incoming.length}개 필지를 찾았어요.${data.truncated?' 가까운 40개까지 표시해요.':''}${data.excluded?' 경계를 확인할 수 없는 자료는 제외했어요.':''}`:'일치하는 필지를 찾지 못했어요. 전체 지번 주소나 필지번호를 확인해 주세요.';
      renderParcels(fit);
      if(clickPoint){
        const ringContains=ring=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [x,y]=ring[i],[a,b]=ring[j];if((y>clickPoint.lat)!==(b>clickPoint.lat)&&clickPoint.lng<(a-x)*(clickPoint.lat-y)/(b-y)+x)inside=!inside;}return inside;};
        const hit=incoming.find(f=>(f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates]).some(poly=>ringContains(poly[0])&&!poly.slice(1).some(ringContains)));
        if(hit)toggle(hit.id);
        else $('.site-search-status').textContent='이 위치의 필지를 확인하지 못했어요. 표시된 필지 경계를 눌러 주세요.';
      }
    } catch {if(!disposed&&current===version)$('.site-search-status').textContent='필지를 불러오지 못했어요. 다시 시도해 주세요.';}
  }
  const mapError=message=>{if(disposed)return;$('.site-map-status').textContent=message;$('[data-site=nearby]').disabled=true;};
  window.addEventListener('teojabi-map-auth-error',e=>mapError(e.detail),{signal:abort.signal});
  const refreshMapSize=()=>{if(!disposed&&map&&n)n.Event.trigger(map,'resize');};
  async function startMap() {
    try {
      n=await loadNaverMaps();if(disposed)return;
      map=new n.Map($('.site-map'),{center:new n.LatLng(37.5665,126.978),zoom:17,minZoom:12,maxZoom:21,zoomControl:true,zoomControlOptions:{position:n.Position.TOP_RIGHT},scaleControl:true,mapDataControl:true});
      let parcelClickedAt=0;
      listeners.push(n.Event.addListener(map.data,'click',e=>{parcelClickedAt=Date.now();++version;toggle(String(e.feature.getProperty('pnu')));}));
      listeners.push(n.Event.addListener(map,'click',e=>{if(restoring||Date.now()-parcelClickedAt<200)return;const point={lat:e.coord.lat(),lng:e.coord.lng()};search(point,{fit:false,clickPoint:point});}));
      observer=new ResizeObserver(refreshMapSize);observer.observe($('.site-map'));
      requestAnimationFrame(refreshMapSize);
      setTimeout(refreshMapSize,240);
      setTimeout(refreshMapSize,900);
      window.addEventListener('resize',refreshMapSize,{signal:abort.signal});
      window.addEventListener('orientationchange',refreshMapSize,{signal:abort.signal});
      $('[data-site=nearby]').disabled=restoring;$('.site-map-status').textContent='지도를 누르면 주소가 자동으로 입력돼요. 파란색이 선택한 필지예요.';renderParcels(true);
    } catch(error){mapError(error.message||'지도를 불러오지 못했어요. 주소 검색과 목록으로 필지를 선택할 수 있어요.');}
  }
  root.addEventListener('click',async e=>{
    const button=e.target.closest('[data-site]');if(!button||button.disabled)return;
    if(button.dataset.site==='back')onBack();
    if(button.dataset.site==='unit'){draft.areaUnit=button.dataset.unit;syncAreaInput();for(const b of root.querySelectorAll('[data-site=unit]'))b.setAttribute('aria-pressed',String(b.dataset.unit===draft.areaUnit));clearSummary();}
    if(['save','export'].includes(button.dataset.site)){
      const checked=validateSiteInputs(draft.fields,selected.size);if(!checked.ok){$('.site-input-error').textContent=checked.message;return;}
      if(restoring){$('.site-input-error').textContent='저장한 필지를 불러오는 중이에요.';return;}
      const payload={name:draft.name||draft.address||'내 땅 검토',pnus:[...selected.keys()],fields:checked.values,memo:draft.memo||''};
      if(button.dataset.site==='save'){await saveNamed('analysis',payload);return;}
      if(!estimate()){$('.site-input-error').textContent='공사비 계산을 위해 용적률과 0보다 큰 평당 공사비를 입력해 주세요.';return;}
      openReviewExport({...payload,estimate:estimate()});
    }
    if(button.dataset.site==='reset-ratios'){draft.ratioManual={};clearSummary();renderContext();}
    if(button.dataset.site==='retry-context'){
      for(const [id,data] of contexts)if(data.status!=='ready')contexts.delete(id);
      loadContext();
    }
    if(button.dataset.site==='documents')loadDocuments(button.dataset.document);
    if(button.dataset.site==='copy-registry-address')chooseRegistryAddress();
    if(button.dataset.site==='toggle')toggle(button.dataset.pnu);
    if(button.dataset.site==='apply-ledger') {
      const ledger=selectedLedgerArea([...selected.values()]);
      if(ledger.status==='ready') {
        draft.fields.landArea=String(ledger.areaM2);draft.areaSource=`토지대장 합계 · 선택 ${ledger.count}개 필지`;
        draft.areaSelectionKey=[...selected.keys()].sort().join(',');
        syncAreaInput();$('.site-area-source').textContent=draft.areaSource;
        clearSummary();$('#site-landArea').focus({preventScroll:true});
      }
    }
    if(button.dataset.site==='nearby'&&map){
      button.disabled=true;button.textContent='필지 불러오는 중…';
      const center=map.getCenter();
      try{await search({lat:center.lat(),lng:center.lng()},{fit:false});}
      finally{if(!disposed){button.disabled=false;button.textContent='필지 선택';button.setAttribute('aria-pressed',String(features.length>0));$('.site-map-status').textContent=features.length?'필지 경계를 표시했어요. 원하는 필지를 눌러 선택하세요.':'이 위치의 필지를 찾지 못했어요. 지도를 이동해 다시 눌러 주세요.';}}
    }
  },{signal:abort.signal});
  root.addEventListener('submit',e=>{
    if(e.target.id==='site-search') {
      e.preventDefault();if(restoring)return;const address=$('#site-address').value.trim();draft.address=address;
      if(address.length<6){$('.site-search-status').textContent='전체 지번 주소 또는 19자리 필지번호를 입력해 주세요.';return;}
      search(/^\d{19}$/.test(address)?{pnu:address}:{address});
    }
    if(e.target.id==='site-inputs') {
      e.preventDefault();const result=validateSiteInputs(draft.fields,selected.size);
      $('.site-input-error').textContent=result.ok?'':result.message;
      if(!result.ok){$('.site-input-summary').hidden=true;return;}
      const summary=$('.site-input-summary');summary.hidden=false;
      summary.innerHTML=`<h3>검토 조건을 정리했어요.</h3><p>선택 필지 ${selected.size}개 · 대지면적 ${areaText(result.values.landArea)}</p><p>${[['far','용적률','%'],['bcr','건폐율','%'],['height','높이','m']].filter(([k])=>result.values[k]!=null).map(([k,label,unit])=>`${label} ${result.values[k]}${unit}`).join(' · ')||'용적률·건폐율·높이는 아직 입력하지 않았어요.'}</p>${draft.memo?`<p>${esc(draft.memo)}</p>`:''}<small>입력한 검토 조건이며, 신축 가능 여부나 허가 규모를 판정한 결과는 아니에요.</small>`;
      const v=result.values,fmt=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
      summary.insertAdjacentHTML('beforeend',`<div class="site-scale-results">${v.bcr?`<div><span>건폐율로 계산한 건축면적</span><strong>${areaText(v.landArea*v.bcr/100)}</strong></div>`:''}${v.far?`<div><span>용적률 산정 연면적</span><strong>${areaText(v.landArea*v.far/100)}</strong></div>`:''}</div><small>입력한 면적 × 비율로 계산한 참고 규모예요. 지구단위계획·도로·주차·높이 등 개별 조건은 별도로 검토해 주세요.</small>`);
      const cost=constructionEstimate(v,draft.unitCost,v.far?v.landArea*v.far/100:null);
      if(cost)summary.insertAdjacentHTML('beforeend',`<div class="site-cost-summary"><h4>예상 공사비</h4><div><span>평당 공사비</span><strong>${cost.unitCostManwon.toLocaleString('ko-KR',{maximumFractionDigits:1})}만원</strong></div><div><span>검토 연면적</span><strong>${areaText(cost.floorAreaM2)}</strong></div><div><span>예상 공사비</span><strong>${(cost.constructionWon/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2})}억원</strong></div><div><span>설계비 5%</span><strong>${(cost.designWon/10000).toLocaleString('ko-KR',{maximumFractionDigits:0})}만원</strong></div><small>평당 공사비는 입력값 기준이며, 지하층·철거비·세금·금융비용 등은 포함하지 않은 개략 계산이에요.</small></div>`);
    }
  },{signal:abort.signal});
  root.addEventListener('input',e=>{
    if(e.target.closest('#site-inputs')) {
      if(['far','bcr'].includes(e.target.name)){
        draft.ratioManual??={};draft.ratioManual[e.target.name]=true;
        $('.site-ratio-source').textContent='직접 수정한 검토값을 사용하고 있어요.';
      }
      if(e.target.name==='unitCost')draft.unitCost=e.target.value;
      if(e.target.name in draft.fields){draft.fields[e.target.name]=e.target.name==='landArea'&&draft.areaUnit==='pyeong'?(e.target.value?String(Number(e.target.value)*400/121):''):e.target.value;if(e.target.name==='landArea'){draft.areaSelectionKey=null;draft.areaSource='직접 입력';$('.site-area-source').textContent='직접 입력 · 선택한 전체 대지의 면적인지 확인해 주세요.';}}
      if(e.target.id==='site-memo')draft.memo=e.target.value;clearSummary();showCosts();
    }
  },{signal:abort.signal});
  async function restoreSaved(){
    const saved=draft.restore;if(!saved)return;restoring=true;
    for(const control of root.querySelectorAll('#site-inputs input,#site-inputs textarea,#site-inputs button'))control.disabled=true;
    $('#site-search button').disabled=true;$('[data-site=nearby]').disabled=true;
    for(const pnu of saved.pnus){if(disposed)return;await search({pnu},{seed:true,fit:false});}
    if(disposed)return;
    if(saved.pnus.every(pnu=>selected.has(pnu))){
      draft.fields=Object.fromEntries(Object.entries(saved.fields).map(([k,v])=>[k,v==null?'':String(v)]));
      draft.ratioSelectionKey=selectionKey([...selected.values()]);draft.ratioManual={far:true,bcr:true};draft.areaSelectionKey=draft.ratioSelectionKey;draft.areaSource='저장 당시 검토값';
      for(const [k,v] of Object.entries(draft.fields))$('#site-'+k).value=v;
      $('.site-area-source').textContent='저장 당시 검토값 · 아래 현재 기준과 함께 확인해 주세요.';renderContext();
    }else{$('.site-search-status').textContent='일부 필지를 다시 찾지 못했어요. 전체 면적과 검토값을 확인해 주세요.';draft.fields.landArea='';$('#site-landArea').value='';}
    draft.restore=null;restoring=false;$('#site-search button').disabled=false;$('[data-site=nearby]').disabled=!map;
    for(const control of root.querySelectorAll('#site-inputs input,#site-inputs textarea,#site-inputs button'))control.disabled=false;
    syncAreaInput();renderParcels(true);
  }
  renderParcels();startMap();if(draft.restore)restoreSaved();else if(draft.initialPnu)search({pnu:draft.initialPnu},{seed:true});
  return ()=>{disposed=true;abort.abort();observer?.disconnect();for(const l of listeners){try{n.Event.removeListener(l);}catch{}}try{map?.destroy();}catch{}};
}
