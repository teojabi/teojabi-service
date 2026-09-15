import { apiFetch } from './api-client.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const GUEST_FAVORITES_KEY='teojabi.guest-favorites.v1';
const validGuestFavorite=item=>item&&item.kind==='favorite'&&typeof item.key==='string'&&item.key.length<=80&&item.payload?.id===item.key;
export class MemberStore extends EventTarget {
  constructor(storage=globalThis.localStorage){super();this.items=[];this.user=null;this.status='idle';this.base='';this.storage=storage;}
  guestItems(){try{const rows=JSON.parse(this.storage?.getItem(GUEST_FAVORITES_KEY)||'[]');return Array.isArray(rows)?rows.filter(validGuestFavorite).slice(0,100):[];}catch{return [];}}
  writeGuestItems(items){try{this.storage?.setItem(GUEST_FAVORITES_KEY,JSON.stringify(items.filter(validGuestFavorite).slice(0,100)));return true;}catch{return false;}}
  emit(){this.dispatchEvent(new Event('change'));}
  async refresh(){
    this.status='loading';this.items=[];this.user=null;this.emit();
    try {
      const runtime=await apiFetch('/api/runtime').then(r=>r.json());this.base=runtime.accountApiBase||'';
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
  member.base='preview';member.status='ready';member.user={id:'preview',name:'미리보기 회원'};member.items=previewItems.map(item=>({...item,payload:{...item.payload}}));member.emit();openMember();
}
let closeCurrent;
const labels={favorite:'찜한 매물',condition:'관심 조건',analysis:'내 땅 검토',feedback:'매물 의견'};
export function openMember(mode='member'){
  closeCurrent?.();const before=document.activeElement,dialog=document.createElement('dialog');dialog.className='member-dialog';dialog.setAttribute('aria-labelledby','member-title');
  let filter='favorite';
  const render=()=>{
    const available=status==='ready'||status==='guest';
    dialog.innerHTML=`<div class="modal-heading"><div><span class="eyebrow">MY TEOJABI</span><h2 id="member-title">${available?'내 보관함':'로그인·회원가입'}</h2></div><button class="outline" data-member="close" aria-label="창 닫기">×</button></div>${available?`<p class="case-note">${status==='ready'?`${esc(member.user.name||'회원')}님의 계정에 저장한 내용이에요.`:'이 브라우저에 임시 저장한 찜 목록이에요. 로그인하면 계정으로 옮겨집니다.'}</p><div class="member-tabs">${Object.entries(labels).filter(([k])=>status==='ready'||k==='favorite').map(([k,v])=>`<button class="outline" data-member="tab" data-kind="${k}" aria-pressed="${filter===k}">${v} ${member.items.filter(i=>i.kind===k).length}</button>`).join('')}</div><div class="member-items">${member.items.filter(i=>i.kind===filter).map(i=>{
      const p=i.payload,title=p.name||p.address||i.key;
      const description=i.kind==='favorite'?`${p.priceWon?Number(p.priceWon/1e8).toLocaleString('ko-KR')+'억원':'가격 미기재'} · 저장 시점 정보`:i.kind==='condition'?`${p.budgetWon?Number(p.budgetWon/1e8).toLocaleString('ko-KR')+'억원 이하':'예산 제한 없음'} · ${p.districts?.join(' · ')||'서울 전체'}`:i.kind==='analysis'?`선택 ${p.pnus?.length||0}개 필지 · 대지 ${p.fields?.landArea||'미입력'}㎡`:({like:'좋아요',dislike:'아쉬워요',hide:'숨김'}[p.choice]||'')+' · '+(p.reasons?.join(', ')||'이유 미선택');
      return `<article><div><h3>${esc(title)}</h3><p>${esc(description)}</p><small>${new Date(i.updatedAt).toLocaleDateString('ko-KR')} 저장</small></div><div>${i.kind!=='feedback'?`<button class="outline" data-member="open" data-key="${esc(i.key)}">다시 보기</button>`:''}<button class="outline" data-member="remove" data-key="${esc(i.key)}">${i.kind==='feedback'?'의견 되돌리기':'저장 해제'}</button></div></article>`;
    }).join('')||'<div class="empty"><p>아직 저장한 내용이 없어요.</p><small>매물이나 검토 화면에서 저장해 보세요.</small></div>'}</div>${status==='guest'?`<div class="member-guest-login"><p>로그인하면 찜 목록을 계정에 저장하고 다른 기기에서도 볼 수 있어요.</p>${loginChoices()}</div>`:''}`:`<div class="member-empty"><h3>${status==='loading'?'회원 연결을 확인하고 있어요.':status==='signed-out'?'로그인하거나 간편가입해 주세요.':'로그인·회원가입이 필요해요.'}</h3><p>${status==='pending'?'현재 미리보기에서는 회원 API 주소가 아직 연결되지 않았어요. 운영 사이트 로그인 페이지로 이동할 수 있어요.':status==='error'?'회원 서버에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.':'가입된 계정이면 바로 로그인되고, 처음이라면 필수 약관 동의 후 간편가입으로 이어져요.'}</p>${status==='pending'?`<div class="login-provider-grid"><button class="primary" data-member="preview" type="button">보관함 미리보기</button><a class="outline login-provider" href="https://teojabi.com/" target="_blank" rel="noopener noreferrer">운영 사이트에서 계속하기 ↗</a></div>`:loginChoices()}<p class="login-note">완료 후 돌아오면 내 보관함이 자동으로 연결돼요.</p></div>`}<div class="member-bottom"><span role="status" class="member-message"></span><div>${status==='ready'?'<button class="outline" data-member="logout">로그아웃</button>':''}<button class="outline" data-member="refresh" ${status==='loading'?'disabled':''}>연결 다시 확인</button></div></div>`;
  };
  const close=()=>{member.removeEventListener('change',render);dialog.remove();before?.focus();};closeCurrent=close;
  member.addEventListener('change',render);dialog.addEventListener('close',close);
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('[data-member]');if(!b||b.disabled)return;
    if(b.dataset.member==='close'){dialog.close();return;}
    if(b.dataset.member==='refresh'){member.refresh();return;}
    if(b.dataset.member==='preview'){previewMember();return;}
    if(b.dataset.member==='logout'){b.disabled=true;try{if(await member.logout())dialog.close();}catch(error){dialog.querySelector('.member-message').textContent=error.message;b.disabled=false;}return;}
    if(b.dataset.member==='tab'){filter=b.dataset.kind;render();return;}
    const item=member.get(filter,b.dataset.key);if(!item)return;
    if(b.dataset.member==='open'){dialog.close();window.dispatchEvent(new CustomEvent('teojabi-open-saved',{detail:item}));}
    if(b.dataset.member==='remove'){b.disabled=true;try{await member.remove(filter,item.key);}catch(error){dialog.querySelector('.member-message').textContent=error.message;b.disabled=false;}}
  });render();document.body.append(dialog);dialog.showModal();if(member.status==='idle')member.refresh();return close;
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
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),b=d.querySelector('[type=submit]');b.disabled=true;try{if(await member.save('feedback',listing.id,{id:listing.id,choice:f.get('choice'),reasons:f.getAll('reason')}))d.close();}catch(error){d.querySelector('.validation').textContent=error.message;}b.disabled=false;};document.body.append(d);d.showModal();
}
