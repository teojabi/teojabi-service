import { apiFetch } from './api-client.mjs';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function initAdminAccess(){
  const panel=document.querySelector('#admin-access-panel');
  if(!panel)return;
  const status=panel.querySelector('#admin-access-status'),list=panel.querySelector('#admin-member-list'),form=panel.querySelector('#admin-add-form');
  panel.hidden=false;
  form.hidden=true;
  try{
    const runtime=await apiFetch('/api/runtime').then(response=>response.json()),base=runtime.accountApiBase||'';
    if(!base){
      status.textContent='로컬 미리보기입니다. 배포된 회원 API에 연결하면 마스터 계정으로 관리자를 추가할 수 있어요.';
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
    if(!me.canManageAdmins){status.textContent='관리자 계정으로 연결되었습니다.';form.hidden=true;list.innerHTML='';return;}
    const load=async()=>{
      const members=await request('/members');
      status.textContent='마스터 계정 · 관리자를 추가하거나 권한을 해제할 수 있어요.';
      list.innerHTML=members.map(member=>`<li><div><strong>${escapeHtml(member.name||'이름 미등록')}</strong><span>${escapeHtml(member.email||'이메일 미등록')}</span></div><div><b>${escapeHtml(member.accessLevel==='MASTER'?'마스터':'관리자')}</b>${member.accessLevel==='ADMIN'?`<button type="button" data-remove-admin="${escapeHtml(member.userId)}">권한 해제</button>`:''}</div></li>`).join('');
    };
    list.addEventListener('click',async event=>{const button=event.target.closest('[data-remove-admin]');if(!button)return;button.disabled=true;try{await request(`/members/${encodeURIComponent(button.dataset.removeAdmin)}`,{method:'DELETE'});await load();}catch(error){status.textContent=error.message;button.disabled=false;}});
    form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button'),email=form.email.value.trim();if(!email)return;button.disabled=true;status.textContent='관리자 권한을 추가하고 있어요.';try{await request('/members',{method:'POST',body:JSON.stringify({email})});form.reset();await load();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    await load();
    form.hidden=false;
  }catch(error){status.textContent=error.message;}
}
