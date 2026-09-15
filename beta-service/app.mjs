import { apiFetch } from './api-client.mjs';
import {resumeSignup} from './signup.mjs';
import { member,openMember,openLogin,previewMember } from './member.mjs';
import { createSiteDraft } from './site-inputs.mjs';
import { DISTRICTS, toWon } from './policy.mjs';
import { PURPOSES, purposeLabel, parseAreaRange } from './search-options.mjs';
import { criteriaFields, readCriteriaFields, areaHelp } from './criteria-ui.mjs';

import {readRecentSearch,writeRecentSearch,readMemberSearch,writeMemberSearch} from './recent-search.mjs';
import {BUILD_DEFAULTS,buildCriteriaFields,buildConditionLabels,validateBuildCriteria} from './build-criteria.mjs';
const app = document.querySelector('#app');
const emptyDraft=()=>({budgetEok:'',districts:[],purpose:null,minArea:'',maxArea:'',areaUnit:'pyeong',zones:[],...BUILD_DEFAULTS});
const state = { screen: 'home', siteDraft:null, draft: emptyDraft(), applied: readRecentSearch(), editing: false, pane: 'list', activity:null, activityError:false, search:null };
const appliedDraft=()=>state.applied?{...emptyDraft(),...state.applied,budgetEok:state.applied.budgetWon?String(state.applied.budgetWon/1e8):'',districts:[...state.applied.districts],zones:[...state.applied.zones]}:emptyDraft();
let disposeExplorer;
let renderVersion=0;
let explorerModulePromise;
let siteModulePromise;
const loadExplorer=()=>explorerModulePromise??=import('./explore.mjs');
const loadSiteReview=()=>siteModulePromise??=import('./site-view.mjs');
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
const mapIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m5 12 12-5 14 5 12-5v29l-12 5-14-5-12 5V12Z"/><path d="M17 7v29M31 12v29"/><circle cx="24" cy="23" r="5"/></svg>';
const buildingArt = '<svg class="entry-art" viewBox="0 0 240 270" aria-hidden="true"><path d="m45 250 130-45 50 22M66 244V104l82-28v140M148 76l47 25v124M66 104l49 27 80-30M115 131v109M77 126l25 12v30l-25-12v-30Zm0 57 25 12v30l-25-12v-30ZM130 144l18-6v28l-18 6v-28Zm31-10 18-6v28l-18 6v-28Zm-31 60 18-6v28l-18 6v-28Zm31-10 18-6v28l-18 6v-28Z"/><path d="M45 182v64M32 174c0-24 30-24 30 0s-30 22-30 0Z"/></svg>';
const parcelArt = '<svg class="entry-art" viewBox="0 0 220 245" aria-hidden="true"><path d="m15 175 78-33 43 24-78 34-43-25Zm43 25 47 28 82-38-51-24M93 142l31-46 60 37-48 33M124 96l-50-30-34 41 53 35M40 107l-25 68M74 66l58-26 54 31-62 25M186 71l19 92-18 27M184 133l21 30M136 166v-31l24-12 20 13v33"/><circle cx="115" cy="111" r="20"/><path d="m107 111 6 6 11-13"/></svg>';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const budgetWon = () => toWon(state.draft.budgetEok, 'EOK');
const validBudget = () => { const value = budgetWon(); return value !== null && value > 0; };
const locationText = districts => districts.length ? districts.join(' · ') : '서울 전체';
const back = (action, label = '이전으로') => `<button class="back" data-action="${action}"><span aria-hidden="true">←</span> ${label}</button>`;
const progress = step => {const building=state.draft.purpose==='new-build',total=building?4:3,current=step==='build-use'?2:step+(building&&step>1?1:0);return `<div class="progress-row"><span>건물 찾기 <b>${current}</b> / ${total}</span><div class="progress" aria-label="${total}단계 중 ${current}단계">${Array.from({length:total},(_,i)=>`<span class="${current>=i+1?'on':''}"></span>`).join('')}</div></div>`;};
const mapPlaceholder = text => `<div class="map-placeholder"><div class="map-label"><i></i> MAP VIEW · 지도 연결 전</div><div class="map-message">${mapIcon}<h2>${text}</h2><p>실제 지도와 필지 데이터가 연결되면<br>이곳에서 위치를 살펴볼 수 있어요.</p></div></div>`;

function activity() {
  const data=state.activity,items=data?.items||['매물','실거래','건축물대장'].map(label=>({label,value:null}));
  const compact=n=>n>=10000?`${(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})}만`:n.toLocaleString('ko-KR');
  const dateLabel=value=>{const d=new Date(value);return value&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d).replace(/\. /g,'.').replace(/\.$/,'')+' 업데이트':'업데이트일 미확인';};
  return `<div class="inventory-strip" aria-label="보유 자료 현황">${items.map(item=>`<span title="${escape(item.note||'')} · ${item.value==null?'미확인':Number(item.value).toLocaleString('ko-KR')+(item.unit||'건')}${data?.observedAt?' · '+new Date(data.observedAt).toLocaleDateString('ko-KR')+' 조회 기준':''}"><span>${escape(item.label)}</span><strong>${item.value==null?'확인 중':compact(item.value)+(item.unit||'건')}</strong><small class="inventory-date">${dateLabel(item.updatedAt)}</small></span>`).join('')}</div>`;
}

function faq() {
  const entries=[
    ['어떤 매물을 찾을 수 있나요?','터잡이가 선별한 매물과 기존 등록 매물을 함께 살펴볼 수 있어요. 찾는 목적과 예산, 지역, 대지면적, 용도지역을 선택해 내 조건에 맞는 매물을 찾아보세요. 가격과 현재 판매 여부는 상담할 때 다시 확인해 주세요.'],
    ['검색 조건을 바꾸려면 처음부터 다시 해야 하나요?','목록 위에 있는 예산·지역·목적 등의 조건을 누르면 바로 바꿀 수 있어요. 가격 낮은 순·높은 순으로 정렬하고, 목록을 접어 지도를 넓게 볼 수도 있어요. 같은 브라우저에서는 마지막 검색 조건을 기억해요.'],
    ['매물 가격이 적절한지 어떻게 비교하나요?','매물 상세에서 가까운 필지의 실거래를 최대 5곳까지 확인할 수 있어요. 최근 36개월 거래를 반경 500m부터 찾고, 부족하면 1km까지 넓혀요. 거리순으로 보여주므로 면적이나 건물 상태가 비슷한 사례만 모은 것은 아니에요. 거래일·대지면적·연면적을 함께 비교하고, 각 카드의 지도 보기로 위치를 확인해 보세요.'],
    ['직접 방문하기 전에 무엇을 확인할 수 있나요?','지도와 네이버 거리뷰로 주변 환경을 살펴보고, 보유한 토지대장·건축물대장 자료를 펼쳐볼 수 있어요. 매물에 표시된 면적과 대장에 기록된 면적은 각각의 자료 그대로 보여드려요. 대장 보기는 발급 원본 서류가 아니며, 거리뷰도 촬영 시점의 모습이에요.'],
    ['신축할 땅을 찾을 때 어떤 조건을 볼 수 있나요?','신축 목적을 선택하면 계획한 용도와 도로폭, 교육보호구역·문화재보존구역 제외 조건 등을 고를 수 있어요. 호텔·숙박시설은 관광숙박특화구역 우선 조건도 선택할 수 있어요. 상세에서는 해당 구역과 지구단위계획, 보유한 높이제한 자료 등을 확인할 수 있으며, 실제 건축 가능 여부는 별도 검토가 필요해요.'],
    ['이미 가진 건물이나 여러 필지도 검토할 수 있나요?','건물·토지에서 지도를 눌러 필지를 선택하면 주소가 자동으로 입력돼요. 여러 필지를 함께 선택하고, 공부상 면적 합계를 검토에 적용할 수 있어요. 확인되는 용적률·건폐율은 자동으로 채워지며, 필지별 값이 다르거나 자료가 없으면 직접 확인해 입력하도록 안내해요.'],
    ['예상 공사비는 어떻게 계산하나요?','대지면적에 용적률을 적용한 검토 연면적을 기준으로 계산해요. 평당 공사비는 기본 1,000만원이며 원하는 금액으로 바꿀 수 있고, 설계비는 공사비의 5%로 표시해요. 면적은 ㎡·평으로 전환할 수 있어요. 지하층 등 용적률 제외 면적과 토지비·철거비·세금 등을 포함한 총사업비는 아니며, 계산 결과는 검토 내보내기로 보관할 수 있어요.'],
  ];
  return `<section class="faq-section" id="service-faq" aria-labelledby="faq-title"><div class="faq-intro"><span class="eyebrow">WHY TEOJABI</span><h2 id="faq-title" tabindex="-1">찾기부터 검토까지,<br>궁금한 점을 모았어요.</h2><p>내 조건으로 찾고, 자료로 비교하고,<br>내 땅의 가능성을 살펴보세요.</p></div><div class="faq-list">${entries.map(([q,a],i)=>`<details><summary><span class="faq-q">Q.</span><span>${q}</span><span class="faq-plus" aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}<p class="faq-preview-note">자료별 기준일과 현황은 다를 수 있어요. 계약이나 설계 전에는 최신 서류와 현장을 함께 확인해 주세요.</p></div></section>`;
}

window.addEventListener('teojabi-open-saved',event=>{
  const {kind,key,payload:p}=event.detail;
  if(kind==='favorite'){state.screen='results';history.replaceState(null,'','#listing='+encodeURIComponent(key));}
  if(kind==='condition'){state.applied={...p,areaUnit:'m2',minArea:p.minAreaM2==null?'':String(p.minAreaM2),maxArea:p.maxAreaM2==null?'':String(p.maxAreaM2)};state.screen='results';history.replaceState(null,'',location.pathname);}
  if(kind==='analysis'){state.siteDraft={...createSiteDraft(),restore:{pnus:p.pnus,fields:p.fields},memo:p.memo,name:p.name};state.screen='analyze';history.replaceState(null,'',location.pathname);}
  render();
});
let enteredMember=null;
let completedThisVisit=false;
function rememberSearch(next){
  const stored=writeRecentSearch(next);
  if(member.status==='ready'){
    writeMemberSearch(member.user,next);
    member.save('condition','primary',next).catch(()=>{});
  }
  return stored;
}
function updateMemberButton(){
  const button=document.querySelector('#member-login');
  if(!button)return;
  const ready=member.status==='ready';
  button.textContent=ready?(member.user?.name||'내 계정'):'로그인';
  button.setAttribute('aria-label',ready?'내 계정과 보관함 보기':'로그인');
  let adminLink=document.querySelector('#member-admin-link');
  if(ready&&member.user?.role==='ADMIN') {
    if(!adminLink){adminLink=document.createElement('a');adminLink.id='member-admin-link';adminLink.href='./curation.html';adminLink.className='outline';adminLink.textContent='관리자';button.after(adminLink);}
  }else adminLink?.remove();
}
member.addEventListener('change',()=>{
  updateMemberButton();
  if(member.status!=='ready'||!member.user?.id||enteredMember===member.user.id)return;
  enteredMember=member.user.id;
  if(completedThisVisit&&state.applied){writeMemberSearch(member.user,state.applied);return;}
  const saved=readMemberSearch(member.user,member.items);
  if(!saved||state.screen!=='home'||location.hash)return;
  state.applied=saved;state.screen='results';
  history.replaceState(null,'',location.pathname+'#search');render(false);
});
updateMemberButton();
member.refresh();
resumeSignup(member);
function home() {
  return `<section class="home"><div class="intro"><div><span class="eyebrow">YOUR NEXT PLACE, TEOJABI</span><h1>미래의 건물,<br>찾는 기준부터.</h1></div><div class="intro-brand"><span class="home-symbol" role="img" aria-label="터잡이 로고마크"></span><p class="lead">원하는 공간을 찾는 일도,<br> 내 공간을 다시 바라보는 일도.<br> 터잡이에서 차근차근 시작하세요.</p></div></div>
    <section class="activity-section" id="market-activity" aria-label="보유 자료 현황" aria-live="polite">${activity()}</section>
    <div class="entry-grid"><button class="entry entry-primary" data-action="find"><span class="entry-tag">FIND YOUR BUILDING</span><h2>마음에 드는<br>건물을 찾고 싶어요.</h2><p>목적과 예산, 원하는 지역부터 알려주세요.</p><span class="entry-cta">건물 찾기 시작 <span class="circle">${arrow}</span></span>${buildingArt}</button>
    <button class="entry entry-secondary" data-action="analyze"><span class="entry-tag">UNDERSTAND YOUR PLACE</span><h2>건물과 토지를<br>살펴보고 싶어요.</h2><p>신축할 필지의 현황과 확인할 자료를 함께 봐요.</p><span class="entry-cta">신축 검토 시작 <span class="circle">${arrow}</span></span>${parcelArt}</button></div>
    <div class="home-browse"><p class="home-note"><span>i</span>확인된 정보로 살펴보고, 확인이 필요한 부분은 구분해 알려드려요.</p><button class="outline" data-action="browse">선별 매물 전체 둘러보기 ↗</button><button class="outline" data-action="preview-member">내 보관함 미리보기</button></div>
    ${faq()}</section>`;
}

function purpose() {
  return `<section class="wizard">${back(state.editing?'cancel-edit':'home',state.editing?'조건 변경 취소':'처음으로')}${progress(1)}<h1>어떤 건물을<br>찾으세요?</h1><p class="subline">건물을 찾는 목적을 알려주세요.<br>목적에 맞춰 확인할 내용을 함께 안내해 드려요.</p><div class="purpose-grid" role="group" aria-label="건물을 찾는 목적">${PURPOSES.map((p,i)=>`<button class="purpose-choice" data-action="choose-purpose" data-value="${p.id}" aria-pressed="${state.draft.purpose===p.id}"><span class="purpose-number">0${i+1}</span><b>${p.label}</b><span>${p.description}</span></button>`).join('')}</div><button class="purpose-undecided" data-action="choose-purpose" data-value="" aria-pressed="${!state.draft.purpose}">아직 정하지 않았어요 ${!state.draft.purpose?'✓':''}</button><button class="primary" data-action="to-budget">${state.draft.purpose==='new-build'?'신축 용도·부지 조건 선택':'예산 선택하기'} ${arrow}</button><p class="wizard-foot">목적은 언제든 바꿀 수 있어요.</p></section>`;
}

function buildUse() {
  return `<section class="wizard build-wizard">${back('back-purpose')}${progress('build-use')}<h1>신축 계획을<br>조금 더 알려주세요.</h1>${buildCriteriaFields(state.draft)}<p class="validation" id="build-error" role="alert"></p><button class="primary" data-action="build-to-budget">예산 선택하기 ${arrow}</button></section>`;
}

function budget() {
  return `<section class="wizard">${back(state.draft.purpose==='new-build'?'back-build-use':'back-purpose')}${progress(2)}<h1>매입 예산은<br>얼마로 생각하시나요?</h1><p class="subline">매매가격 기준으로 찾아드려요.<br>세금과 공사비 등 추가 비용은 포함하지 않은 금액이에요.</p>
  <div class="preset-grid" role="group" aria-label="매입 예산 선택">${[20,30,50,100].map(value => `<button class="choice" data-action="budget" data-value="${value}" aria-pressed="${String(state.draft.budgetEok) === String(value)}">${value}억<small>이하</small></button>`).join('')}</div>
  <label class="input-label" for="budget-input">다른 금액을 생각하고 있어요</label><div class="amount-wrap"><input id="budget-input" type="text" inputmode="decimal" autocomplete="off" placeholder="금액 직접 입력" value="${escape(state.draft.budgetEok)}" aria-describedby="budget-error"><span>억원 이하</span></div><p class="validation" id="budget-error" aria-live="polite"></p>
  <button class="primary" data-action="region" ${validBudget() ? '' : 'disabled'}>지역·추가 조건 선택 ${arrow}</button><p class="wizard-foot">선택한 조건은 결과 화면에서 다시 바꿀 수 있어요.</p></section>`;
}

function region() {
  return `<section class="wizard">${back('back-budget')}${progress(3)}<h1>어느 지역을<br>보고 싶으세요?</h1><p class="subline">원하는 자치구를 여러 곳 선택할 수 있어요.<br>아직 정하지 않았다면 서울 전체로 살펴보세요.</p>
  <button class="all-seoul" data-action="all-seoul" aria-pressed="${!state.draft.districts.length}">서울 전체 <span aria-hidden="true">${!state.draft.districts.length ? '✓' : '○'}</span></button>
  <div class="districts" role="group" aria-label="서울 자치구 선택">${DISTRICTS.map(d => `<button data-action="district" data-value="${d}" aria-pressed="${state.draft.districts.includes(d)}">${d}</button>`).join('')}</div>
  ${criteriaFields(state.draft)}<p class="validation" id="criteria-error" role="alert"></p><p class="selected-summary" aria-live="polite">${purposeLabel(state.draft.purpose)} · ${escape(state.draft.budgetEok)}억원 이하 · ${locationText(state.draft.districts)}</p><button class="primary" data-action="apply">조건에 맞는 매물 보기 ${arrow}</button><p class="wizard-foot">개발 가능성과 수익률을 추정해 순위를 매기지 않아요.</p></section>`;
}

function render(focus = true) {
  const version=++renderVersion;
  disposeExplorer?.();disposeExplorer=null;
  if(state.screen==='results') {
    app.innerHTML='<section class="screen-loading" aria-live="polite"><span></span><p>매물과 지도를 불러오고 있어요.</p></section>';
    loadExplorer().then(({mountExplorer})=>{
      if(version!==renderVersion||state.screen!=='results')return;
      disposeExplorer=mountExplorer(app,{conditions:state.applied,initialId:new URLSearchParams(location.hash.slice(1)).get('listing'),onAnalyze:listing=>{if(state.siteDraft?.listingId!==listing.id)state.siteDraft=createSiteDraft(listing);state.screen='analyze';history.replaceState(null,'',location.pathname);render();},onConditionsChange:next=>{state.applied=next;if(!new URLSearchParams(location.hash.slice(1)).has('listing'))history.replaceState(null,'',location.pathname+'#search');return rememberSearch(next);},onEdit:()=>{
        state.draft=appliedDraft();
        state.editing=Boolean(state.applied);state.screen='purpose';render();
      }});
    }).catch(()=>{if(version===renderVersion)app.innerHTML='<section class="screen-loading"><p>매물 자료를 불러오지 못했습니다.</p></section>';});
  } else if(state.screen==='analyze') {
    state.siteDraft??=createSiteDraft();
    app.innerHTML='<section class="screen-loading" aria-live="polite"><span></span><p>필지 검토 화면을 준비하고 있어요.</p></section>';
    loadSiteReview().then(({mountSiteReview})=>{
      if(version!==renderVersion||state.screen!=='analyze')return;
      disposeExplorer=mountSiteReview(app,{draft:state.siteDraft,onBack:()=>{const id=state.siteDraft.listingId;state.screen=id?'results':'home';history.replaceState(null,'',location.pathname+(id?'#listing='+encodeURIComponent(id):''));render();}});
    }).catch(()=>{if(version===renderVersion)app.innerHTML='<section class="screen-loading"><p>검토 화면을 불러오지 못했습니다.</p></section>';});
  } else {
  app.innerHTML = ({ home, purpose, 'build-use':buildUse, budget, region })[state.screen]();
  if(state.screen==='region'&&state.draft.purpose==='new-build')app.querySelector('.selected-summary').insertAdjacentHTML('afterend',`<p class="build-applied-summary">${escape(buildConditionLabels(state.draft).join(' · ')||'신축 추가 조건 없음')}</p>`);
  }
  document.title = `${{ home:'터잡이', purpose:'건물 찾는 목적', 'build-use':'신축 용도·부지 조건', budget:'매입 예산', region:'지역 선택', results:'내 조건으로 살펴보기', analyze:'신축 검토 시작' }[state.screen]} — 로컬 미리보기 v1.8`;
  if(state.screen==='home'&&!state.activity&&!state.activityError)loadActivity();
  if (focus) {
    const heading = app.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

document.addEventListener('click', event => {
  const useButton=event.target.closest('[data-build-use]');
  if(useButton&&state.screen==='build-use'){
    state.draft.buildUse=useButton.dataset.buildUse||null;
    if(state.draft.buildUse!=='hotel')state.draft.preferTourism=false;
    render(false);app.querySelector(`[data-build-use="${useButton.dataset.buildUse}"]`).focus({preventScroll:true});return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (['home','find','analyze','faq'].includes(action)) history.replaceState(null,'',location.pathname);
  if (action === 'faq') { state.screen='home'; render(false); app.querySelector('#faq-title').focus({preventScroll:true}); app.querySelector('#service-faq').scrollIntoView({behavior:'smooth'}); return; }
  if (action === 'login') {member.status==='ready'?openMember():openLogin();return;}
  if (action === 'preview-member') {previewMember();return;}
  if (action === 'saved') {openMember();return;}
  if (action === 'home') { state.screen = 'home'; state.editing = false; }
  if (action === 'browse') { state.screen='results';state.applied=null;state.editing=false;history.replaceState(null,'',location.pathname); }
  if (action === 'find') {
    state.draft=appliedDraft();state.editing=false;
    if(state.applied){state.screen='results';history.replaceState(null,'',location.pathname+'#search');}
    else state.screen='purpose';
  }
  if (action === 'analyze') { state.screen = 'analyze'; state.editing = false; }
  if (action === 'budget') {
    state.draft.budgetEok = button.dataset.value;
    render(false);
    app.querySelector(`[data-action="budget"][data-value="${state.draft.budgetEok}"]`).focus();
    return;
  }
  if (action === 'region' && validBudget()) state.screen = 'region';
  if (action === 'back-budget') state.screen = 'budget';
  if (action === 'back-purpose') state.screen = 'purpose';
  if (action === 'choose-purpose') { state.draft.purpose=button.dataset.value||null;if(state.draft.purpose!=='new-build')Object.assign(state.draft,BUILD_DEFAULTS);render(false);app.querySelector(`[data-action="choose-purpose"][data-value="${button.dataset.value}"]`).focus();return; }
  if (action === 'to-budget') state.screen = state.draft.purpose==='new-build'?'build-use':'budget';
  if (action === 'back-build-use') state.screen='build-use';
  if (action === 'build-to-budget') {const checked=validateBuildCriteria(state.draft);if(!checked.ok){app.querySelector('#build-error').textContent=checked.message;return;}state.screen='budget';}
  if (action === 'district') {
    const value = button.dataset.value;
    state.draft.districts = state.draft.districts.includes(value) ? state.draft.districts.filter(d => d !== value) : [...state.draft.districts, value];
    render(false);
    app.querySelector(`[data-action="district"][data-value="${value}"]`).focus();
    return;
  }
  if (action === 'all-seoul') { state.draft.districts = []; render(false); app.querySelector('.all-seoul').focus(); return; }
  if (action === 'apply') {
    if (!validBudget()) { state.screen = 'budget'; render(); return; }
    const range=parseAreaRange(state.draft.minArea,state.draft.maxArea,state.draft.areaUnit);
    if(!range.ok){app.querySelector('#criteria-error').textContent=range.message;app.querySelector('[name="maxArea"]').focus();return;}
    state.applied = { ...state.draft,budgetWon:budgetWon(),districts:[...state.draft.districts],zones:[...state.draft.zones],minAreaM2:range.minAreaM2,maxAreaM2:range.maxAreaM2,sort:'price' };
    completedThisVisit=true;rememberSearch(state.applied);
    state.screen = 'results'; state.editing = false;
    history.replaceState(null,'',location.pathname);
  }
  if (action === 'edit') {
    state.draft = appliedDraft();
    state.editing = true; state.screen = 'purpose';
  }
  if (action === 'cancel-edit') {
    state.draft = appliedDraft();
    state.editing = false; state.screen = 'results';
  }
  render();
});

app.addEventListener('input', event => {
  if(state.screen==='region'&&event.target.matches('[name=minArea],[name=maxArea],[name=areaUnit],[name=zone]')){
    Object.assign(state.draft,readCriteriaFields(app));app.querySelector('[data-area-help]').textContent=areaHelp(state.draft);app.querySelector('#criteria-error').textContent='';return;
  }
  if (event.target.id !== 'budget-input') return;
  state.draft.budgetEok = event.target.value;
  const valid = validBudget();
  app.querySelector('[data-action="region"]').disabled = !valid;
  document.querySelector('#budget-error').textContent = state.draft.budgetEok && !valid ? '0보다 큰 금액을 숫자로 입력해 주세요.' : '';
  app.querySelectorAll('[data-action="budget"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === state.draft.budgetEok)));
});
app.addEventListener('change',event=>{
  const input=event.target;
  if(state.screen!=='build-use'||!input.matches('[data-build-control]'))return;
  state.draft[input.dataset.buildControl]=input.type==='checkbox'?input.checked:input.value?Number(input.value):null;
});
render(false);
if(new URLSearchParams(location.hash.slice(1)).has('listing')||location.hash==='#search') {state.screen='results';render(false);}
else if(location.hash==='#analyze'){state.screen='analyze';render(false);}

async function loadActivity() {
  try {
    const response=await apiFetch('/api/activity');
    if (!response.ok) throw new Error('Data unavailable');
    const data=await response.json();
    if (!Array.isArray(data.items)) throw new Error('Invalid response');
    state.activity=data;
    state.activityError=false;
  } catch { state.activityError=true; }
  const section=app.querySelector('#market-activity');
  if (section) section.innerHTML=activity();
}
// Activity reads a local completed-run summary; it does not query Supabase on each visit.
setInterval(()=>{if(state.screen==='home'&&!document.hidden)loadActivity();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.screen==='home')loadActivity();});


