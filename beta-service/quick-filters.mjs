import {DISTRICTS,toWon} from './policy.mjs';
import {PURPOSES,ZONING_OPTIONS,AUCTION_USAGES,AUCTION_SOURCES,AUCTION_DEAL_TYPES,purposeLabel,parseAreaRange,areaRangeLabel} from './search-options.mjs';
import {areaInput} from './recent-search.mjs';
import {BUILD_DEFAULTS,buildCriteriaFields,buildConditionLabels,buildUseLabel} from './build-criteria.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={budget:'매입 예산',districts:'지역',purpose:'찾는 목적',area:'대지면적',zones:'용도지역',auction:'경매 물건',build:'신축 용도·부지'};
export function mountQuickFilters(root,{getValue,onChange}){
  const abort=new AbortController();let active=null,timer=null,dirty=false,openingArea=null;
  root.innerHTML=`<div class="quick-chip-row" role="group" aria-label="현재 검색 조건 바로 수정">${Object.entries(labels).map(([key,label])=>`<button type="button" class="pill quick-chip" data-filter="${key}" aria-expanded="false" aria-controls="quick-filter-editor"><span class="quick-chip-label">${label}</span><span data-filter-value></span><span class="quick-chevron" aria-hidden="true">⌄</span></button>`).join('')}</div><section class="quick-filter-editor" id="quick-filter-editor" hidden aria-labelledby="quick-filter-title"><div class="quick-filter-head"><div><h2 id="quick-filter-title"></h2><p>바꾸면 자동으로 반영돼요.</p></div><button type="button" class="quick-close" data-close aria-label="조건 편집 닫기">×</button></div><div class="quick-filter-content"></div><p class="validation quick-filter-error" role="alert"></p></section><p class="quick-remember" role="status">최근 검색 조건을 자동으로 기억해요.</p>`;
  const $=s=>root.querySelector(s),panel=$('.quick-filter-editor');
  root.insertAdjacentHTML('beforeend','<p class="build-applied-summary" data-build-summary hidden></p>');
  function update(){
    const v=getValue(),auction=v.auction||{},texts={budget:v.budgetWon?`${(v.budgetWon/1e8).toLocaleString('ko-KR',{maximumFractionDigits:8})}억원 이하`:'예산 제한 없음',districts:v.districts?.join(' · ')||'서울 전체',purpose:purposeLabel(v.purpose),area:areaRangeLabel(v.minAreaM2,v.maxAreaM2,v.areaUnit),zones:v.zones?.join(' · ')||'용도지역 전체',auction:auction.enabled?`포함${auction.source==='onbid'?' · 공매':auction.source==='both'?' · 경매+공매':''}${auction.dealType?` · ${({whole:'건물 통',floor:'층',unit:'호실',land:'토지'}[auction.dealType]||auction.dealType)}`:''}${auction.saleKind==='share'?' · 지분':auction.saleKind==='bundle'?' · 일괄':''}${auction.usages?.length?' · '+auction.usages.join('·'):''}${auction.maxPriceWon?` · 최저 ${(auction.maxPriceWon/1e8).toLocaleString('ko-KR')}억 이하`:''}${auction.maxBidRate?` · 최저가율 ${auction.maxBidRate}% 이하`:''}${auction.failMax?` · 유찰 ${auction.failMax}회 이하`:''}`:'미포함'};
    const buildLabels=buildConditionLabels(v);texts.build=buildUseLabel(v.buildUse)+(buildLabels.length>(v.buildUse?1:0)?` · 조건 ${buildLabels.length-(v.buildUse?1:0)}개`:'');
    $('[data-build-summary]').hidden=v.purpose!=='new-build'||!buildLabels.length;$('[data-build-summary]').textContent=buildLabels.join(' · ');
    for(const b of root.querySelectorAll('[data-filter]')){b.hidden=b.dataset.filter==='build'&&v.purpose!=='new-build';b.querySelector('[data-filter-value]').textContent=texts[b.dataset.filter];b.setAttribute('aria-label',`${labels[b.dataset.filter]} 변경: ${texts[b.dataset.filter]}`);b.setAttribute('aria-expanded',String(active===b.dataset.filter));}
    for(const b of root.querySelectorAll('[data-choice]')){
      const {choice,value}=b.dataset;
      const chosen=choice==='budget'?(value===''?!v.budgetWon:v.budgetWon===Number(value)*1e8):choice==='purpose'?(v.purpose||'')===value:choice==='districts'?(value===''?!v.districts?.length:v.districts?.includes(value)):choice==='auction'?(value==='on'?Boolean(v.auction?.enabled):!v.auction?.enabled):choice==='auctionSource'?((v.auction?.source||'court')===value):choice==='auctionDealType'?((v.auction?.dealType||'')===value):choice==='auctionSaleKind'?((v.auction?.saleKind||'')===value):value===''?!v.zones?.length:v.zones?.includes(value);
      b.setAttribute('aria-pressed',String(Boolean(chosen)));
    }
  }
  function commit(patch){$('.quick-filter-error').textContent='';onChange(patch);update();}
  function flush(){
    clearTimeout(timer);timer=null;if(!dirty)return true;
    if(active==='budget'){
      const raw=$('#quick-budget').value.trim(),n=toWon(raw,'EOK');
      if(!raw||n===null||n<=0){$('.quick-filter-error').textContent='0보다 큰 예산을 입력하거나 ‘예산 제한 없음’을 선택해 주세요.';return false;}
      dirty=false;commit({budgetWon:n});
    }
    if(active==='area'){
      const unit=$('#quick-unit').value,min=$('#quick-min-area').value.trim(),max=$('#quick-max-area').value.trim(),parsed=parseAreaRange(min,max,unit);
      if(!parsed.ok){$('.quick-filter-error').textContent=parsed.message;return false;}
      // Changing units alone must never alter the actual search boundaries.
      const minAreaM2=min===openingArea?.min?openingArea.minM2:parsed.minAreaM2,maxAreaM2=max===openingArea?.max?openingArea.maxM2:parsed.maxAreaM2;
      if(minAreaM2!==null&&maxAreaM2!==null&&minAreaM2>maxAreaM2){$('.quick-filter-error').textContent='최대 대지면적은 최소 대지면적 이상이어야 합니다.';return false;}
      dirty=false;commit({areaUnit:unit,minArea:min,maxArea:max,minAreaM2,maxAreaM2});
      openingArea={min,max,minM2:minAreaM2,maxM2:maxAreaM2};
      $('[data-quick-area-help]').textContent=`${areaRangeLabel(minAreaM2,maxAreaM2,unit==='pyeong'?'m2':'pyeong')} · 매물 기재 면적 기준`;
    }
    if(active==='auction'){
      const cur=getValue().auction||{};
      dirty=false;
      commit({auction:{...cur,enabled:true,maxPriceWon:$('#quick-auction-price').value.trim()?Number($('#quick-auction-price').value)*1e8:null,maxBidRate:$('#quick-auction-rate').value.trim()?Number($('#quick-auction-rate').value):null,failMax:$('#quick-auction-fail').value.trim()?Number($('#quick-auction-fail').value):null}});
    }
    return true;
  }
  function close({discard=false}={}){
    if(!discard)flush();
    const old=active;clearTimeout(timer);dirty=false;active=null;panel.hidden=true;update();root.querySelector(`[data-filter="${old}"]`)?.focus({preventScroll:true});
  }
  const choice=(group,value,label)=>`<button type="button" class="quick-choice" data-choice="${group}" data-value="${esc(value)}" aria-pressed="false">${esc(label)}</button>`;
  function open(key){
    if(active===key){close();return;}if(!flush())return;
    active=key;const v=getValue();$('#quick-filter-title').textContent=labels[key];panel.hidden=false;$('.quick-filter-error').textContent='';
    let html='';
    if(key==='budget')html=`<div class="quick-choice-grid">${[20,30,50,100,200].map(n=>choice('budget',n,`${n}억 이하`)).join('')}${choice('budget','','예산 제한 없음')}</div><label class="quick-number-label" for="quick-budget">예산 직접 입력 <span>억원 이하</span></label><input id="quick-budget" class="quick-number" inputmode="decimal" autocomplete="off" value="${v.budgetWon?v.budgetWon/1e8:''}" placeholder="예: 80">`;
    if(key==='districts')html=`<p class="quick-help">여러 지역을 함께 선택할 수 있어요.</p><div class="quick-choice-grid quick-districts">${choice('districts','','서울 전체')}${DISTRICTS.map(d=>choice('districts',d,d)).join('')}</div>`;
    if(key==='purpose')html=`<div class="quick-choice-grid quick-purposes">${PURPOSES.map(p=>choice('purpose',p.id,p.label)).join('')}${choice('purpose','','목적 미정')}</div>`;
    if(key==='build')html=buildCriteriaFields(v);
    if(key==='auction'){const a=v.auction||{};html=`<p class="quick-help">경매·공매 물건도 함께 추천받아요. 아파트·자동차는 제외됩니다.</p><div class="quick-choice-grid"><button type="button" class="quick-choice" data-choice="auction" data-value="on" aria-pressed="${a.enabled?'true':'false'}">경매·공매 포함</button><button type="button" class="quick-choice" data-choice="auction" data-value="off" aria-pressed="${a.enabled?'false':'true'}">미포함</button></div><p class="quick-help">구분</p><div class="quick-choice-grid">${AUCTION_SOURCES.map(([value,label])=>`<button type="button" class="quick-choice" data-choice="auctionSource" data-value="${value}" aria-pressed="${(a.source||'court')===value}">${esc(label)}</button>`).join('')}</div><p class="quick-help">거래 단위 · 선택하지 않으면 전체</p><div class="quick-choice-grid">${[['','전체'],...AUCTION_DEAL_TYPES].map(([value,label])=>`<button type="button" class="quick-choice" data-choice="auctionDealType" data-value="${value}" aria-pressed="${(a.dealType||'')===value}">${esc(label)}</button>`).join('')}</div><div class="quick-area-row"><label for="quick-auction-price">최저가 이하<input class="quick-number" id="quick-auction-price" inputmode="decimal" placeholder="제한 없음" value="${a.maxPriceWon?a.maxPriceWon/1e8:''}"><span>억</span></label><label for="quick-auction-rate">최저가율 이하<input class="quick-number" id="quick-auction-rate" inputmode="decimal" placeholder="제한 없음" value="${a.maxBidRate??''}"><span>%</span></label><label for="quick-auction-fail">유찰 횟수 이하<input class="quick-number" id="quick-auction-fail" inputmode="numeric" placeholder="제한 없음" value="${a.failMax??''}"><span>회</span></label></div><p class="quick-help">매각 구분</p><div class="quick-choice-grid">${[['','전체'],['whole','전체 소유'],['share','지분'],['bundle','일괄']].map(([value,label])=>choice('auctionSaleKind',value,label)).join('')}</div><p class="quick-help">경매 용도 · 선택하지 않으면 전체</p><div class="quick-choice-grid">${AUCTION_USAGES.map(u=>`<button type="button" class="quick-choice" data-auction-usage="${esc(u)}" aria-pressed="${(a.usages||[]).includes(u)}">${esc(u)}</button>`).join('')}</div>`;}
    if(key==='zones')html=`<p class="quick-help">여러 용도지역을 선택할 수 있어요. 준주거는 주거지역, 준공업은 공업지역에 포함돼요.</p><div class="quick-choice-grid">${choice('zones','','용도지역 전체')}${ZONING_OPTIONS.map(z=>choice('zones',z,z)).join('')}</div>`;
    if(key==='area'){
      const unit=v.areaUnit||'pyeong',min=areaInput(v.minAreaM2,unit),max=areaInput(v.maxAreaM2,unit);openingArea={min,max,minM2:v.minAreaM2,maxM2:v.maxAreaM2};
      html=`<div class="quick-area-row"><label for="quick-min-area">최소 대지면적<input class="quick-number" id="quick-min-area" inputmode="decimal" autocomplete="off" placeholder="제한 없음" value="${esc(min)}"></label><span aria-hidden="true">~</span><label for="quick-max-area">최대 대지면적<input class="quick-number" id="quick-max-area" inputmode="decimal" autocomplete="off" placeholder="제한 없음" value="${esc(max)}"></label><label for="quick-unit">단위<select id="quick-unit"><option value="pyeong" ${unit==='pyeong'?'selected':''}>평</option><option value="m2" ${unit==='m2'?'selected':''}>㎡</option></select></label></div><p class="quick-help" data-quick-area-help>${areaRangeLabel(v.minAreaM2,v.maxAreaM2,unit==='pyeong'?'m2':'pyeong')} · 매물 기재 면적 기준</p><button class="quick-reset" type="button" data-clear-area>면적 제한 없애기</button>`;
    }
    $('.quick-filter-content').innerHTML=html;update();
    const first=panel.querySelector('input,select,[data-build-use],[data-choice][aria-pressed=true],[data-choice]');first?.focus({preventScroll:true});
  }
  root.addEventListener('click',e=>{
    const chip=e.target.closest('[data-filter]');if(chip){open(chip.dataset.filter);return;}
    if(e.target.closest('[data-close]')){close();return;}
    const use=e.target.closest('[data-build-use]');
    if(use&&active==='build'){
      const value=use.dataset.buildUse||null;commit({buildUse:value,...(value!=='hotel'?{preferTourism:false}:{})});
      $('.quick-filter-content').innerHTML=buildCriteriaFields(getValue());panel.querySelector(`[data-build-use="${use.dataset.buildUse}"]`).focus({preventScroll:true});return;
    }
    if(e.target.closest('[data-clear-area]')){dirty=false;clearTimeout(timer);$('#quick-min-area').value='';$('#quick-max-area').value='';openingArea={min:'',max:'',minM2:null,maxM2:null};commit({minArea:'',maxArea:'',minAreaM2:null,maxAreaM2:null});$('[data-quick-area-help]').textContent='대지면적 전체 · 매물 기재 면적 기준';return;}
    const usage=e.target.closest('[data-auction-usage]');
    if(usage){const cur=getValue().auction||{},list=cur.usages||[],u=usage.dataset.auctionUsage;dirty=false;clearTimeout(timer);commit({auction:{...cur,enabled:true,usages:list.includes(u)?list.filter(x=>x!==u):[...list,u]}});return;}
    const b=e.target.closest('[data-choice]');if(!b)return;
    const {choice:key,value}=b.dataset,v=getValue();dirty=false;clearTimeout(timer);
    if(key==='budget'){commit({budgetWon:value===''?null:toWon(value,'EOK')});$('#quick-budget').value=value;}
    else if(key==='purpose')commit({purpose:value||null,...(value!=='new-build'?BUILD_DEFAULTS:{})});
    else if(key==='auction')commit({auction:{...(v.auction||{}),enabled:value==='on'}});
    else if(key==='auctionSource')commit({auction:{...(v.auction||{}),source:value||'court'}});
    else if(key==='auctionDealType')commit({auction:{...(v.auction||{}),dealType:value||null}});
    else if(key==='auctionSaleKind')commit({auction:{...(v.auction||{}),saleKind:value||null}});
    else {const values=v[key]||[];commit({[key]:value===''?[]:values.includes(value)?values.filter(x=>x!==value):[...values,value]});}
  },{signal:abort.signal});
  root.addEventListener('input',e=>{if(!e.target.matches('.quick-number'))return;dirty=true;clearTimeout(timer);timer=setTimeout(flush,650);},{signal:abort.signal});
  root.addEventListener('change',e=>{
    if(active==='build'&&e.target.matches('[data-build-control]')){const input=e.target;commit({[input.dataset.buildControl]:input.type==='checkbox'?input.checked:input.value?Number(input.value):null});return;}
    if(e.target.id!=='quick-unit')return;
    const unit=e.target.value,previous=getValue().areaUnit;
    e.target.value=previous;if(!flush())return;e.target.value=unit;
    const v=getValue(),min=areaInput(v.minAreaM2,unit),max=areaInput(v.maxAreaM2,unit);
    $('#quick-min-area').value=min;$('#quick-max-area').value=max;openingArea={min,max,minM2:v.minAreaM2,maxM2:v.maxAreaM2};
    commit({areaUnit:unit,minArea:min,maxArea:max});$('[data-quick-area-help]').textContent=`${areaRangeLabel(v.minAreaM2,v.maxAreaM2,unit==='pyeong'?'m2':'pyeong')} · 매물 기재 면적 기준`;
  },{signal:abort.signal});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();close({discard:true});}if(e.key==='Enter'&&e.target.matches('.quick-number')){e.preventDefault();flush();}},{signal:abort.signal});
  root.addEventListener('focusout',e=>{if(e.target.matches('.quick-number'))flush();},{signal:abort.signal});
  update();return {update,setRemembered(ok){$('.quick-remember').textContent=ok?'최근 검색 조건을 자동으로 기억해요.':'현재 화면에 반영했어요. 브라우저 설정으로 조건을 기억할 수 없어요.';},destroy(){clearTimeout(timer);abort.abort();}};
}
