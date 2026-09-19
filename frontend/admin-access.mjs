import { apiFetch } from './api-client.mjs';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const architectStatusLabel={PENDING:'검토 대기',APPROVED:'공개 중',HIDDEN:'비공개'};
const businessLabel=item=>item.businessVerified?'사업자 인증':item.businessNumber?`사업자 확인 필요${item.businessStatusText?` (${escapeHtml(item.businessStatusText)})`:''}`:'사업자 미입력';

function architectCard(item){
  const logo=item.logoUrl?`<img src="${escapeHtml(item.logoUrl)}" alt="">`:`<span class="architect-review-logo" aria-hidden="true">${escapeHtml((item.officeName||'건').slice(0,1))}</span>`;
  const links=[
    item.websiteUrl?`<a href="${escapeHtml(item.websiteUrl)}" target="_blank" rel="noopener noreferrer">사이트 ↗</a>`:'',
    item.kakaoUrl?`<a href="${escapeHtml(item.kakaoUrl)}" target="_blank" rel="noopener noreferrer">카카오톡 ↗</a>`:'',
    item.phone?`<a href="tel:${escapeHtml(String(item.phone).replace(/[^0-9+]/g,''))}">${escapeHtml(item.phone)}</a>`:'',
    item.email?`<a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a>`:'',
  ].filter(Boolean).join('');
  const facts=[
    ['상태',architectStatusLabel[item.status]||item.status],
    ['사업자',businessLabel(item)],
    ['사업자번호',item.businessNumber||'미입력'],
    ['개업일',item.businessStartDate||'미입력'],
    ['상호',item.businessName||'미입력'],
    ['주소',item.address||'미입력'],
    ['활동 지역',item.regions||'미입력'],
    ['전문 분야',item.specialties||'미입력'],
  ].map(([label,value])=>`<div><dt>${escapeHtml(label)}</dt><dd>${value.startsWith('사업자')&&item.businessVerified?'<b>'+value+'</b>':escapeHtml(value)}</dd></div>`).join('');
  return `<article class="architect-review-card" data-architect="${escapeHtml(item.id)}"><div class="architect-review-card-top">${logo}<div><b>${escapeHtml(item.officeName)}</b><small>${escapeHtml(item.representativeName||'대표자 미입력')} · ${escapeHtml(architectStatusLabel[item.status]||item.status)}${item.featured?' · 추천':''}</small></div></div>${item.bio?`<p class="architect-review-bio">${escapeHtml(item.bio)}</p>`:''}<dl class="architect-review-facts">${facts}</dl>${links?`<div class="architect-review-links">${links}</div>`:''}<div class="architect-review-actions"><button type="button" class="primary" data-architect-status="APPROVED">승인·공개</button><button type="button" data-architect-status="HIDDEN">비공개</button><button type="button" data-architect-status="PENDING">검토 대기</button><button type="button" data-architect-featured="${item.featured?'0':'1'}">${item.featured?'추천 해제':'추천'}</button></div></article>`;
}

async function initArchitectReview(request,canManage){
  const panel=document.querySelector('#architect-review');
  if(!panel)return;
  const status=panel.querySelector('#architect-review-status'),list=panel.querySelector('#architect-review-list');
  if(!canManage){panel.hidden=true;return;}
  panel.hidden=false;
  const load=async()=>{
    try{
      const items=await request('/architects/admin/list');
      const pending=items.filter(item=>item.status==='PENDING').length;
      status.textContent=`신청 ${items.length}건 · 검토 대기 ${pending}건. 승인하면 신축 검토 화면에 공개돼요.`;
      list.innerHTML=items.length?items.map(architectCard).join(''):'<p class="case-note">아직 입점 신청이 없어요.</p>';
    }catch(error){status.textContent=error.message;list.innerHTML='';}
  };
  list.addEventListener('click',async event=>{
    const button=event.target.closest('[data-architect-status],[data-architect-featured]');
    if(!button)return;
    const card=button.closest('[data-architect]'),id=card?.dataset.architect;
    if(!id)return;
    const body=button.dataset.architectStatus?{status:button.dataset.architectStatus}:{featured:button.dataset.architectFeatured==='1'};
    button.disabled=true;
    try{await request(`/architects/admin/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)});await load();}
    catch(error){status.textContent=error.message;button.disabled=false;}
  });
  await load();
}

export async function initAdminAccess(){
  const panel=document.querySelector('#admin-access-panel');
  if(!panel)return;
  const status=panel.querySelector('#admin-access-status'),list=panel.querySelector('#admin-member-list'),form=panel.querySelector('#admin-add-form');
  panel.hidden=false;
  form.hidden=true;
  try{
    const runtime=await apiFetch('/api/runtime').then(response=>response.json()),base=runtime.accountApiBase||'';
    if(!base){
      status.textContent='관리자 서비스 연결을 확인해 주세요.';
      form.hidden=true;
      list.innerHTML='<li><div><strong>teojabi@gmail.com</strong><span>기존 ADMIN 계정</span></div><div><b>마스터</b></div></li>';
      return;
    }
    const request=async(path,options={})=>{
      const response=await apiFetch(`${base}/api/v1/admin-access${path}`,{...options,credentials:'include',headers:options.body?{'Content-Type':'application/json'}:undefined,signal:AbortSignal.timeout(12000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'관리자 권한 정보를 불러오지 못했습니다.');
      return data;
    };
    const me=await request('/me');
    panel.hidden=false;
    if(!me.canManageAdmins){status.textContent='관리자 계정으로 연결되었습니다.';form.hidden=true;list.innerHTML='';await initArchitectReview(request,true);return;}
    const load=async()=>{
      const members=await request('/members');
      status.textContent='마스터 계정 · 관리자를 추가하거나 권한을 해제할 수 있어요.';
      list.innerHTML=members.map(member=>`<li><div><strong>${escapeHtml(member.name||'이름 미등록')}</strong><span>${escapeHtml(member.email||'이메일 미등록')}</span></div><div><b>${escapeHtml(member.accessLevel==='MASTER'?'마스터':'관리자')}</b>${member.accessLevel==='ADMIN'?`<button type="button" data-remove-admin="${escapeHtml(member.userId)}">권한 해제</button>`:''}</div></li>`).join('');
    };
    list.addEventListener('click',async event=>{const button=event.target.closest('[data-remove-admin]');if(!button)return;button.disabled=true;try{await request(`/members/${encodeURIComponent(button.dataset.removeAdmin)}`,{method:'DELETE'});await load();}catch(error){status.textContent=error.message;button.disabled=false;}});
    form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button'),email=form.email.value.trim();if(!email)return;button.disabled=true;status.textContent='관리자 권한을 추가하고 있어요.';try{await request('/members',{method:'POST',body:JSON.stringify({email})});form.reset();await load();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    await load();
    form.hidden=false;
    await initArchitectReview(request,true);
  }catch(error){status.textContent=error.message;}
}
