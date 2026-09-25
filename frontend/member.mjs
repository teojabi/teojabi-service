import { apiFetch, getRuntime } from './api-client.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const GUEST_FAVORITES_KEY='teojabi.guest-favorites.v1';
const favoriteKey=/^(?:naver:\d{1,30}|naver-land:\d{1,30}|premium:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|disco:[A-Za-z0-9]{4,24}|auction:[A-Za-z0-9]{4,40}|onbid:[A-Za-z0-9-]{4,30}(?:::[A-Za-z0-9-]{1,30})?)$/;
const validGuestFavorite=item=>item&&item.kind==='favorite'&&typeof item.key==='string'&&favoriteKey.test(item.key)&&item.payload?.id===item.key;
export class MemberStore extends EventTarget {
  constructor(storage=globalThis.localStorage){super();this.items=[];this.user=null;this.status='idle';this.base='';this.storage=storage;}
  guestItems(){try{const rows=JSON.parse(this.storage?.getItem(GUEST_FAVORITES_KEY)||'[]');return Array.isArray(rows)?rows.filter(validGuestFavorite).slice(0,100):[];}catch{return [];}}
  writeGuestItems(items){try{this.storage?.setItem(GUEST_FAVORITES_KEY,JSON.stringify(items.filter(validGuestFavorite).slice(0,100)));return true;}catch{return false;}}
  emit(){this.dispatchEvent(new Event('change'));}
  async refresh(){
    this.status='loading';this.items=[];this.user=null;this.emit();
    try {
      const runtime=await getRuntime();this.base=runtime.accountApiBase||'';
      if(!this.base){this.items=this.guestItems();this.status=this.items.length?'guest':'pending';this.user=null;this.emit();return;}
      const me=await this.request('/users/me');this.user=me;
      const result=await this.request('/discovery/me');
      if(!Array.isArray(result.items))throw new Error('invalid-response');
      this.items=result.items;this.status='ready';
      const guests=this.guestItems().filter(item=>!this.get('favorite',item.key));let migrated=true;
      for(const item of guests){try{await this.request(`/discovery/favorite/${encodeURIComponent(item.key)}`,{method:'PUT',body:JSON.stringify(item.payload)});this.items.unshift(item);}catch{migrated=false;}}
      if(guests.length&&migrated)this.writeGuestItems([]);
    }catch(error){this.items=this.guestItems();this.user=null;this.status=this.items.length?'guest':error.status===401?'signed-out':'error';}
    this.emit();
  }
  async request(path,options={}){
    const response=await apiFetch(this.base+'/api/v1'+path,{...options,credentials:'include',headers:options.body?{'Content-Type':'application/json'}:undefined,signal:AbortSignal.timeout(12000)});
    if(!response.ok){const error=new Error(response.status===401?'로그인 후 저장할 수 있어요.':response.status===400?'저장 한도 또는 입력 내용을 확인해 주세요.':'회원 저장 연결을 확인해 주세요.');error.status=response.status;throw error;}
    return response.json();
  }
  get(kind,key){return this.items.find(i=>i.kind===kind&&i.key===key);}
  hiddenIds(){return this.items.filter(i=>i.kind==='feedback'&&i.payload.choice==='hide').map(i=>i.key);}
  async save(kind,key,payload){
    if(this.status!=='ready'){
      if(kind!=='favorite')return false;
      this.items=this.guestItems().filter(i=>i.key!==key);this.items.unshift({kind,key,payload,updatedAt:new Date().toISOString()});
      if(!this.writeGuestItems(this.items))return false;this.status='guest';this.emit();return true;
    }
    try{await this.request(`/discovery/${kind}/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify(payload)});}
    catch(error){if(error.status===401){this.items=[];this.user=null;this.status='signed-out';this.emit();}throw error;}
    this.items=this.items.filter(i=>!(i.kind===kind&&i.key===key));this.items.unshift({kind,key,payload,updatedAt:new Date().toISOString()});this.emit();return true;
  }
  async remove(kind,key){
    if(this.status!=='ready'){
      if(kind!=='favorite')return false;
      this.items=this.guestItems().filter(i=>i.key!==key);if(!this.writeGuestItems(this.items))return false;
      this.status=this.items.length?'guest':'signed-out';this.emit();return true;
    }
    try{await this.request(`/discovery/${kind}/${encodeURIComponent(key)}`,{method:'DELETE'});}
    catch(error){if(error.status===401){this.items=[];this.user=null;this.status='signed-out';this.emit();}throw error;}
    this.items=this.items.filter(i=>!(i.kind===kind&&i.key===key));this.emit();return true;
  }
  async logout(){
    if(this.base==='preview'){
      this.items=[];this.user=null;this.base='';this.status='signed-out';this.emit();return true;
    }
    if(!this.base)return false;
    const response=await apiFetch(this.base+'/api/v1/auth/logout',{method:'POST',credentials:'include',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
    this.items=this.guestItems();this.user=null;this.status=this.items.length?'guest':'signed-out';this.emit();return true;
  }
}
export const member=new MemberStore();

function authBase(){return member.base||'https://api.teojabi.com';}
function providerLoginUrl(provider){return `${authBase()}/api/v1/auth/${provider}`;}
function loginChoices(){return `<div class="login-provider-grid" aria-label="간편 로그인 및 회원가입 선택">${[['naver','네이버로 계속하기'],['kakao','카카오로 계속하기'],['google','구글로 계속하기']].map(([provider,label])=>`<a class="outline login-provider" href="${esc(providerLoginUrl(provider))}">${label}</a>`).join('')}</div>`;}
export function openLogin(){openMember('login');}

const previewItems=[
  {kind:'favorite',key:'premium:eb3a7fa1-4e4f-4c75-bc0f-c6dad1326e67',payload:{id:'premium:eb3a7fa1-4e4f-4c75-bc0f-c6dad1326e67',address:'서울특별시 중구 을지로 상권 후보',priceWon:4200000000,areaM2:187,floorAreaM2:612},updatedAt:new Date().toISOString()},
  {kind:'favorite',key:'naver:2647532280',payload:{id:'naver:2647532280',address:'서울특별시 중랑구 면목동 634-21',priceWon:10000000000,areaM2:248.5,floorAreaM2:1342.2},updatedAt:new Date(Date.now()-86400000).toISOString()},
  {kind:'condition',key:'preview-condition',payload:{name:'상업지역 신축 검토',budgetWon:10000000000,districts:['중구','종로구'],purpose:'new-build',minAreaM2:231,maxAreaM2:496,zones:['상업지역'],sort:'price'},updatedAt:new Date(Date.now()-172800000).toISOString()},
  {kind:'analysis',key:'preview-analysis',payload:{name:'내 땅 검토 예시',pnus:['1114016200100010000','1114016200100020000'],fields:{landArea:328.1,far:800,bcr:60,height:60},memo:'지도에서 선택한 필지 기준으로 공사비와 확인사항을 검토한 예시입니다.'},updatedAt:new Date(Date.now()-259200000).toISOString()},
  {kind:'feedback',key:'naver:2646055258',payload:{id:'naver:2646055258',choice:'hide',reasons:['가격','개발가능성']},updatedAt:new Date(Date.now()-3600000).toISOString()}
];
export function previewMember(){
  member.base='preview';member.status='ready';member.user={id:'preview',name:'미리보기 회원'};member.items=previewItems.map(item=>({...item,payload:{...item.payload}}));
  memberAlerts=[{kindLabel:'경매 D-3',title:'서울 마포구 성산동 상가',detail:'근린생활시설 · 최저 3억원 · 매각기일 (예시)',key:''},{kindLabel:'공매 D-5',title:'서울 강서구 화곡동 근린시설',detail:'상가용및업무용건물 · 최저입찰 2.1억원 · 입찰마감 (예시)',key:''}];
  memberPrefs={email:false,webPush:false,kakao:false,favorites:true,conditions:true,leadDays:7};
  member.emit();openMember();
}
let closeCurrent;
const labels={favorite:'찜한 매물',condition:'관심 조건',analysis:'내 땅 검토',feedback:'매물 의견'};
const SOURCE_LABEL={premium:'터잡이 추천',registered:'터잡이 등록',disco:'디스코 매물',naver:'네이버 매물','naver-land':'네이버 매물',auction:'경매 물건',onbid:'공매 물건'};
const DEAL_LABEL={whole:'건물 통',floor:'층',unit:'호실',land:'토지',vehicle:'차량'};
const feedbackLabel={like:'좋아요',dislike:'아쉬워요',hide:'목록에서 숨김'};
const moneyText=v=>Number(v)>0?`${(Number(v)/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2})}억원`:'가격 미기재';
const m2Text=v=>Number(v)>0?`${Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})}㎡`:'—';
const sourceOf=key=>String(key||'').split(':')[0];
// 알림함/설정 데이터. 백엔드에서 채워지면 보관함 상단에 임박 알림·설정으로 표시된다.
let memberAlerts=[];
let memberPrefs=null;
const buildAlerts=()=>memberAlerts;
const conditionRows=p=>{
  const rows=[];
  if(p.districts?.length)rows.push(['지역',p.districts.join(' · ')]);
  if(p.neighborhoods?.length)rows.push(['동',p.neighborhoods.join(' · ')]);
  rows.push(['예산',p.budgetWon?`${(p.budgetWon/1e8).toLocaleString('ko-KR')}억원 이하`:'제한 없음']);
  if(p.kind)rows.push(['유형',p.kind==='land'?'토지':'건물']);
  if(p.zones?.length)rows.push(['용도지역',p.zones.join(' · ')]);
  const minA=p.minAreaM2!=null?`${Math.round(p.minAreaM2)}㎡ 이상`:'',maxA=p.maxAreaM2!=null?`${Math.round(p.maxAreaM2)}㎡ 이하`:'';
  if(minA||maxA)rows.push(['대지면적',[minA,maxA].filter(Boolean).join(' · ')]);
  if(p.minRoadWidthM)rows.push(['도로폭',`${p.minRoadWidthM}m 이상`]);
  if(p.stationName)rows.push(['역',`${p.stationName}역${p.maxDistanceM?` ${p.maxDistanceM}m 이내`:''}`]);
  if(p.purpose==='new-build')rows.push(['목적','신축 검토']);
  if(p.commercialName)rows.push(['상권',`${p.commercialName} 인근`]);
  if(p.auction?.enabled){
    const a=p.auction;
    rows.push(['경매·공매',`${a.source==='onbid'?'공매(온비드)':a.source==='both'?'경매+공매':'경매(법원)'}${a.dealType?` · ${DEAL_LABEL[a.dealType]||a.dealType}`:''}`]);
    if(a.usages?.length)rows.push(['용도',a.usages.join(' · ')]);
    if(a.maxPriceWon)rows.push(['최저가',`${(a.maxPriceWon/1e8).toLocaleString('ko-KR')}억원 이하`]);
    if(a.maxBidRate)rows.push(['최저가율',`${a.maxBidRate}% 이하`]);
  }
  if(p.query)rows.push(['검색어',p.query]);
  if(p.sort)rows.push(['정렬',p.sort==='area'?'면적순':'가격순']);
  return rows;
};
const memberDetail=item=>{
  const p=item.payload||{};
  let rows=[];
  if(item.kind==='favorite'){
    rows=[['구분',SOURCE_LABEL[sourceOf(item.key)]||'매물']];
    if(p.address)rows.push(['주소',p.address]);
    rows.push(['가격',moneyText(p.priceWon)]);
    if(p.areaM2)rows.push(['대지',m2Text(p.areaM2)]);
    if(p.floorAreaM2)rows.push(['연면적',m2Text(p.floorAreaM2)]);
    if(p.teojabiNo)rows.push(['매물번호',String(p.teojabiNo)]);
  } else if(item.kind==='condition'){
    rows=conditionRows(p);
  } else if(item.kind==='analysis'){
    rows=[['필지',`${p.pnus?.length||0}개`],['대지면적',p.fields?.landArea?`${p.fields.landArea}㎡`:'미입력']];
    if(p.fields?.far)rows.push(['용적률',`${p.fields.far}%`]);
    if(p.fields?.bcr)rows.push(['건폐율',`${p.fields.bcr}%`]);
    if(p.fields?.height)rows.push(['높이',`${p.fields.height}m`]);
    rows.push(['메모',p.memo||'—']);
  } else {
    rows=[['주소',p.address||'—'],['의견',feedbackLabel[p.choice]||'—'],['이유',p.reasons?.join(' · ')||'—']];
  }
  return rows.length?`<dl class="member-item-facts">${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:'';
};
export function openMember(mode='member'){
  closeCurrent?.();const before=document.activeElement,dialog=document.createElement('dialog');dialog.className='member-dialog';dialog.setAttribute('aria-labelledby','member-title');
  let filter='favorite';
  const render=()=>{
    const status=member.status;
    const architectLink=/architect\.html$/.test(location.pathname)?'':'<p class="member-architect-link">건축사이신가요? <a href="./architect.html">건축사 입점 신청 ↗</a></p>';
    const available=status==='ready'||status==='guest';
    const alerts=buildAlerts();
    const prefsSection=status==='ready'?`<section class="member-prefs"><h3 class="member-section-title">알림 설정 <small>이메일 · 사실 안내</small></h3><div class="member-pref-row"><span>이메일 알림</span><div class="member-pref-opts"><button type="button" class="outline" data-member="pref" data-field="email" data-value="true" aria-pressed="${memberPrefs?.email===true}">받기</button><button type="button" class="outline" data-member="pref" data-field="email" data-value="false" aria-pressed="${memberPrefs?.email!==true}">끄기</button></div></div><div class="member-pref-row"><span>알림 기준</span><div class="member-pref-opts">${[1,3,7].map(d=>`<button type="button" class="outline" data-member="pref" data-field="leadDays" data-value="${d}" aria-pressed="${(memberPrefs?.leadDays??7)===d}">D-${d}</button>`).join('')}</div></div><p class="case-note">찜·저장 조건을 기준으로 매각기일·입찰마감이 임박한 경매·공매를 이메일로 보내드려요. 권리분석·적정 입찰가는 제공하지 않아요.</p></section>`:'';
    dialog.innerHTML=`<div class="modal-heading"><div><span class="eyebrow">MY TEOJABI</span><h2 id="member-title">${available?'내 보관함':'로그인·회원가입'}</h2></div><button class="outline" data-member="close" aria-label="창 닫기">×</button></div>${architectLink}${available?`<p class="case-note">${status==='ready'?`${esc(member.user.name||'회원')}님의 계정에 저장한 내용이에요.`:'이 브라우저에 임시 저장한 찜 목록이에요. 로그인하면 계정으로 옮겨집니다.'}</p><div class="member-tabs">${Object.entries(labels).filter(([k])=>status==='ready'||k==='favorite').map(([k,v])=>`<button class="outline" data-member="tab" data-kind="${k}" aria-pressed="${filter===k}">${v} ${member.items.filter(i=>i.kind===k).length}</button>`).join('')}</div>${filter==='favorite'&&member.items.some(i=>i.kind==='favorite')?`<div class="member-favorites-actions"><button class="primary" data-member="open-favorites">찜한 매물 전체 보기 ${member.items.filter(i=>i.kind==='favorite').length}</button></div>`:''}${filter==='condition'&&member.items.some(i=>i.kind==='condition')?`<div class="member-favorites-actions"><button class="primary" data-member="edit-condition">관심조건 바꾸기</button></div>`:''}${alerts.length?`<section class="member-alerts" aria-label="임박 알림"><h3 class="member-section-title">임박 알림 <small>찜·조건 기준 · 사실 안내</small></h3>${alerts.map(a=>`<article class="member-alert"><div><p class="member-alert-kind">${esc(a.kindLabel)}</p><h4>${esc(a.title)}</h4><p>${esc(a.detail)}</p></div><div>${a.key?`<button class="outline" data-member="open" data-key="${esc(a.key)}">다시 보기</button>`:''}</div></article>`).join('')}</section>`:''}${prefsSection}<div class="member-items">${member.items.filter(i=>i.kind===filter).map(i=>{
      const p=i.payload,title=p.name||p.address||(p.teojabiNo?`매물번호 ${p.teojabiNo}`:i.kind==='feedback'?'저장한 매물 의견':i.key);
      const detail=memberDetail(i);
      return `<article class="member-item"><div class="member-item-head"><h3>${esc(title)}</h3><small>${new Date(i.updatedAt).toLocaleDateString('ko-KR')} 저장</small></div>${detail}${i.kind!=='feedback'?`<div class="member-item-actions"><button class="outline" data-member="open" data-key="${esc(i.key)}">다시 보기</button><button class="outline" data-member="remove" data-key="${esc(i.key)}">저장 해제</button></div>`:`<div class="member-item-actions"><button class="outline" data-member="remove" data-key="${esc(i.key)}">의견 되돌리기</button></div>`}</article>`;
    }).join('')||'<div class="empty"><p>아직 저장한 내용이 없어요.</p><small>매물이나 검토 화면에서 저장해 보세요.</small></div>'}</div>${status==='guest'?`<div class="member-guest-login"><p>로그인하면 찜 목록을 계정에 저장하고 다른 기기에서도 볼 수 있어요.</p>${loginChoices()}</div>`:''}`:`<div class="member-empty"><h3>${status==='loading'?'회원 연결을 확인하고 있어요.':status==='signed-out'?'로그인하거나 간편가입해 주세요.':'로그인·회원가입이 필요해요.'}</h3><p>${status==='pending'?'현재 미리보기에서는 회원 API 주소가 아직 연결되지 않았어요. 운영 사이트 로그인 페이지로 이동할 수 있어요.':status==='error'?'회원 서버에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.':'가입된 계정이면 바로 로그인되고, 처음이라면 필수 약관 동의 후 간편가입으로 이어져요.'}</p>${status==='pending'?`<div class="login-provider-grid"><button class="primary" data-member="preview" type="button">보관함 미리보기</button><a class="outline login-provider" href="https://teojabi.com/" target="_blank" rel="noopener noreferrer">운영 사이트에서 계속하기 ↗</a></div>`:loginChoices()}<p class="login-note">완료 후 돌아오면 내 보관함이 자동으로 연결돼요.</p></div>`}<div class="member-bottom"><span role="status" class="member-message"></span><div>${status==='ready'?'<button class="outline" data-member="logout">로그아웃</button>':''}<button class="outline" data-member="refresh" ${status==='loading'?'disabled':''}>연결 다시 확인</button></div></div>`;
  };
  const close=()=>{member.removeEventListener('change',render);dialog.remove();before?.focus();};closeCurrent=close;
  member.addEventListener('change',render);dialog.addEventListener('close',close);
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('[data-member]');if(!b||b.disabled)return;
    if(b.dataset.member==='close'){dialog.close();return;}
    if(b.dataset.member==='refresh'){member.refresh();return;}
    if(b.dataset.member==='preview'){previewMember();return;}
    if(b.dataset.member==='open-favorites'){dialog.close();window.dispatchEvent(new CustomEvent('teojabi-open-favorites'));return;}
    if(b.dataset.member==='logout'){b.disabled=true;try{if(await member.logout())dialog.close();}catch(error){dialog.querySelector('.member-message').textContent=error.message;b.disabled=false;}return;}
    if(b.dataset.member==='tab'){filter=b.dataset.kind;render();return;}
    if(b.dataset.member==='edit-condition'){const condition=member.items.find(i=>i.kind==='condition'&&i.key==='primary')||member.items.find(i=>i.kind==='condition');if(!condition)return;dialog.close();window.dispatchEvent(new CustomEvent('teojabi-edit-condition',{detail:condition}));return;}
    if(b.dataset.member==='pref'){
      const field=b.dataset.field,value=b.dataset.value,next={...(memberPrefs||{})};
      if(field==='leadDays')next.leadDays=Number(value);else next[field]=value==='true';
      memberPrefs=next;render();
      member.request('/notifications/preferences',{method:'PUT',body:JSON.stringify(next)}).then(saved=>{if(dialog.open&&saved&&typeof saved==='object'){memberPrefs=saved;render();}}).catch(()=>{});
      return;
    }
    const item=member.items.find(i=>i.key===b.dataset.key)||member.get(filter,b.dataset.key);if(!item)return;
    if(b.dataset.member==='open'){dialog.close();window.dispatchEvent(new CustomEvent('teojabi-open-saved',{detail:item}));}
    if(b.dataset.member==='remove'){b.disabled=true;try{await member.remove(item.kind,item.key);}catch(error){dialog.querySelector('.member-message').textContent=error.message;b.disabled=false;}}
  });render();document.body.append(dialog);dialog.showModal();
  if(member.status==='ready'){Promise.all([member.request('/notifications').catch(()=>null),member.request('/notifications/preferences').catch(()=>null)]).then(([inbox,prefs])=>{if(!dialog.open)return;if(Array.isArray(inbox?.items))memberAlerts=inbox.items;if(prefs&&typeof prefs==='object')memberPrefs=prefs;render();});}
  if(member.status==='idle')member.refresh();return close;
}
export async function saveNamed(kind,payload){
  if(member.status!=='ready'){openMember();return false;}
  return new Promise(resolve=>{
    const before=document.activeElement,d=document.createElement('dialog');d.className='save-dialog';d.setAttribute('aria-labelledby','save-title');
    d.innerHTML=`<form><h2 id="save-title">${kind==='condition'?'관심 조건':'내 땅 검토'} 저장</h2><label for="save-name">다시 찾기 쉬운 이름</label><input id="save-name" name="name" maxlength="80" required value="${esc(payload.name||'')}"><p class="validation" role="alert"></p><div><button class="outline" type="button" data-cancel>취소</button><button class="primary" type="submit">내 계정에 저장</button></div></form>`;
    let saved=false;d.addEventListener('close',()=>{d.remove();before?.focus();resolve(saved);});d.querySelector('[data-cancel]').onclick=()=>d.close();
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const name=d.querySelector('input').value.trim();if(!name)return;const button=d.querySelector('[type=submit]');button.disabled=true;try{saved=await member.save(kind,crypto.randomUUID(),{...payload,name});if(saved)d.close();}catch(error){d.querySelector('.validation').textContent=error.message;}button.disabled=false;};
    document.body.append(d);d.showModal();
  });
}
export function openFeedback(listing){
  if(member.status!=='ready'){openMember();return;}
  const d=document.createElement('dialog');d.className='save-dialog';d.setAttribute('aria-labelledby','feedback-title');const before=document.activeElement,old=member.get('feedback',listing.id)?.payload||{};
  d.innerHTML=`<form><h2 id="feedback-title">이 매물은 어떠세요?</h2><p>${esc(listing.address)}</p><fieldset><legend>내 의견</legend>${[['like','좋아요'],['dislike','아쉬워요'],['hide','목록에서 숨기기']].map(([v,t])=>`<label><input type="radio" name="choice" value="${v}" ${old.choice===v?'checked':''} required>${t}</label>`).join('')}</fieldset><fieldset><legend>이유 <small>선택</small></legend>${['가격','위치','대지면적','건물상태','개발가능성','주변환경','기타'].map(r=>`<label><input type="checkbox" name="reason" value="${r}" ${old.reasons?.includes(r)?'checked':''}>${r}</label>`).join('')}</fieldset><p class="case-note">선택한 의견만 저장해요. 숨긴 매물은 보관함에서 다시 표시할 수 있어요.</p><p class="validation" role="alert"></p><div><button class="outline" type="button" data-cancel>취소</button><button class="primary" type="submit">의견 저장</button></div></form>`;
  d.addEventListener('close',()=>{d.remove();before?.focus();});d.querySelector('[data-cancel]').onclick=()=>d.close();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),b=d.querySelector('[type=submit]');b.disabled=true;try{if(await member.save('feedback',listing.id,{id:listing.id,address:listing.address||'',teojabiNo:listing.teojabiNo||'',choice:f.get('choice'),reasons:f.getAll('reason')}))d.close();}catch(error){d.querySelector('.validation').textContent=error.message;}b.disabled=false;};document.body.append(d);d.showModal();
}
