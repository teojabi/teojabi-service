import {apiFetch} from './api-client.mjs';
export async function resumeSignup(member) {
  if(new URLSearchParams(location.search).get('signup')!=='1')return;
  const dialog=document.createElement('dialog');dialog.className='save-dialog';
  dialog.innerHTML='<form><h2>터잡이 회원가입</h2><p role="status">가입 정보를 확인하고 있어요.</p><fieldset disabled><label><input type="checkbox" name="terms" required> 이용약관 동의 (필수)</label><a href="./terms.html" target="_blank" rel="noopener">이용약관 보기</a><label><input type="checkbox" name="privacy" required> 개인정보 수집·이용 동의 (필수)</label><a href="./privacy.html" target="_blank" rel="noopener">개인정보처리방침 보기</a><button class="primary" type="submit">동의하고 가입하기</button></fieldset><button type="button" data-close>닫기</button></form>';
  document.body.append(dialog);dialog.showModal();
  const status=dialog.querySelector('[role=status]'),fields=dialog.querySelector('fieldset');
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
  try {
    const runtime=await apiFetch('/api/runtime').then(r=>r.json());
    if(!runtime.accountApiBase)throw new Error('회원 서비스 연결을 확인해 주세요.');
    const base=runtime.accountApiBase+'/api/v1/auth/social';
    const response=await apiFetch(base+'/pending-signup-status');
    if(!response.ok)throw new Error('가입 정보를 확인하지 못했습니다.');
    const pending=await response.json();
    if(!pending.requiresConsent)throw new Error('가입 인증이 만료되었습니다. 다시 로그인해 주세요.');
    status.textContent='필수 약관을 확인하고 가입을 완료해 주세요.';fields.disabled=false;
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();
      const form=event.target,agreeTerms=form.elements.terms.checked,agreeCollect=form.elements.privacy.checked;
      if(!agreeTerms||!agreeCollect)return;
      fields.disabled=true;
      try {
        const result=await apiFetch(base+'/complete-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:pending.provider,agreeTerms,agreeCollect})});
        if(!result.ok)throw new Error('가입을 완료하지 못했습니다. 다시 시도해 주세요.');
        history.replaceState(null,'',location.pathname+location.hash);dialog.close();await member.refresh();
      }catch(error){status.textContent=error.message;fields.disabled=false;}
    };
  }catch(error){status.textContent=error.message;}
}
