// Public deployment configuration contains origins only, never keys or passwords.
import { DATA_API_BASE, AUCTION_API_BASE, ONBID_API_BASE, CORE_API_BASE } from './runtime-config.mjs';
// 서버리스로 이전한 공개 엔드포인트. (미설정 시 기존 데이터 API로 폴백)
// 회원 전용 데이터는 인증 쿠키가 전달되는 beta-service(api.teojabi.com/beta)로 보낸다.
const CORE_PATHS = ['/api/runtime','/api/health','/api/neighborhoods','/api/activity'];
function edgeBase(path) {
  const clean = path.split('?')[0];
  if (clean.startsWith('/api/auctions')) return AUCTION_API_BASE;
  if (clean.startsWith('/api/onbid')) return ONBID_API_BASE;
  if (clean.startsWith('/api/parcels/') || CORE_PATHS.includes(clean)) return CORE_API_BASE;
  return '';
}
const PREMIUM_PATHS = ['/api/catalog','/api/recommendations','/api/listings/','/api/site-parcels','/api/parcel-context/','/api/parcel-documents/','/api/commercial','/api/surrounding','/api/redevelop-','/api/land-use/','/api/risk/','/api/site-context/','/api/building-records/','/api/land-record/','/api/nearby-transactions/','/api/assistant'];
export function apiPathRequiresAuth(path) {
  let clean=String(path||'').split('?')[0];
  try { if(/^https?:/i.test(clean)) clean=new URL(clean).pathname; } catch { return false; }
  return PREMIUM_PATHS.some(prefix=>clean===prefix||clean.startsWith(prefix));
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
export async function apiFetch(path,options={}) {
  const response=await fetch(apiUrl(path),{...options,credentials:'include',signal:options.signal||AbortSignal.timeout(options.method==='POST'?180000:30000)});
  if(response.status===401&&apiPathRequiresAuth(path)&&typeof window!=='undefined'){
    window.dispatchEvent(new CustomEvent('teojabi-auth-required'));
  }
  return response;
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
