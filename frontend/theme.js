(()=>{
  const key='teojabi.theme.v1';
  let mode='light';try{if(localStorage.getItem(key)==='dark')mode='dark';}catch{}
  const apply=()=>{
    document.documentElement.dataset.theme=mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='dark'?'#080F21':'#F7F8FA');
    const button=document.querySelector('#theme-toggle');
    if(button){button.textContent=mode==='dark'?'☀ 라이트':'☾ 다크';button.setAttribute('aria-pressed',String(mode==='dark'));button.setAttribute('aria-label',mode==='dark'?'라이트 모드로 전환':'다크 모드로 전환');}
    window.dispatchEvent(new CustomEvent('teojabi-theme',{detail:mode}));
  };
  apply();
  document.addEventListener('DOMContentLoaded',()=>{apply();document.querySelector('#theme-toggle')?.addEventListener('click',()=>{mode=mode==='dark'?'light':'dark';try{localStorage.setItem(key,mode);}catch{}apply();});});
  window.addEventListener('storage',event=>{if(event.key===key){mode=event.newValue==='dark'?'dark':'light';apply();}});
})();
