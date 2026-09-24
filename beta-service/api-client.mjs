// Public deployment configuration contains origins only, never keys or passwords.
import { DATA_API_BASE, AUCTION_API_BASE, CORE_API_BASE } from './runtime-config.mjs';
// 서버리스로 이전한 엔드포인트. (미설정 시 기존 데이터 API로 폴백)
const CORE_PATHS = ['/api/runtime','/api/health','/api/catalog','/api/neighborhoods','/api/activity','/api/recommendations'];
function edgeBase(path) {
  const clean = path.split('?')[0];
  if (clean.startsWith('/api/auctions')) return AUCTION_API_BASE;
  if (clean.startsWith('/api/parcels/') || clean.startsWith('/api/parcel-context/') || CORE_PATHS.includes(clean)) return CORE_API_BASE;
  return '';
}
export function apiUrl(path, base) {
  if (!path.startsWith('/api/')) return path;
  const target = base ?? (edgeBase(path) || DATA_API_BASE);
  if (!target) return path;
  const url=new URL(target);
  if (url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:')) throw new Error('Invalid API origin');
  if(url.username||url.password||url.search||url.hash)throw new Error('Invalid API origin');
  return target.replace(/\/$/,'')+path;
}
export function apiFetch(path,options={}) {
  return fetch(apiUrl(path),{...options,credentials:'include',signal:options.signal||AbortSignal.timeout(options.method==='POST'?180000:30000)});
}
// 지도 키와 로그인 주소를 이 요청에서 받아온다. 배포(재시작) 중 몇 초 끊길 수 있어 몇 번 재시도한다.
let runtimePromise=null;
export function getRuntime(){
  runtimePromise??=(async()=>{
    let lastError;
    for(let attempt=0;attempt<4;attempt++){
      try{
        const response=await apiFetch('/api/runtime',{signal:AbortSignal.timeout(8000)});
        if(response.ok)return await response.json();
        lastError=new Error(`runtime ${response.status}`);
      }catch(error){lastError=error;}
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
    }
    runtimePromise=null;
    throw lastError||new Error('runtime unavailable');
  })();
  return runtimePromise;
}
