export function serviceConfig(env=process.env) {
  const production=env.TEOJABI_SERVICE_MODE==='production';
  const origins=(env.TEOJABI_WEB_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const accountBase=(env.DISCOVERY_API_BASE||'').replace(/\/$/,'');
  // 서버 내부(관리자 검증) 호출은 Cloudflare 프록시를 우회해 루프백 백엔드로 직접 보낸다.
  const accountInternal=(env.ACCOUNT_API_INTERNAL_BASE||accountBase).replace(/\/$/,'');
  const hosts=(env.TEOJABI_ALLOWED_HOSTS||'127.0.0.1:4173,localhost:4173,127.0.0.1,localhost').split(',').map(s=>s.trim());
  if(production) {
    if(env.TEOJABI_DATA_SOURCE!=='supabase'||!env.TEOJABI_DATABASE_URL)throw new Error('Production requires an explicit Supabase database connection');
    if(!accountBase.startsWith('https://')||!origins.length||origins.some(s=>!s.startsWith('https://')))throw new Error('Production requires HTTPS account API and web origins');
    if(!env.TEOJABI_PYTHON||!env.NAVER_MAP_CLIENT_ID)throw new Error('Production requires Python path and public Maps client ID');
  }
  return {production,origins,accountBase,accountInternal,hosts};
}
export function allowedOrigin(origin,config) {return !origin||config.origins.includes(origin);}
// Origin 헤더가 없는 요청(같은 출처 GET 등)은 Referer로 같은 출처/허용 출처인지 확인한다.
export function allowedReferer(referer,config) {
  try {
    const host=new URL(String(referer||'')).host;
    if(!host)return false;
    if(config.hosts.includes(host))return true;
    return config.origins.some(origin=>{try{return new URL(origin).host===host;}catch{return false;}});
  } catch {return false;}
}
export async function authorizeCuration(request,config,fetcher=fetch) {
  if(!config.production)return 200;
  if(!allowedOrigin(request.headers.origin,config))return 403;
  if(request.method==='POST'&&!request.headers.origin)return 403;
  if(!request.headers.cookie)return 401;
  try {
    const response=await fetcher(config.accountInternal+'/api/v1/users/me',{headers:{cookie:request.headers.cookie},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.status===401)return 401;
    if(!response.ok)return 503;
    const user=await response.json();
    return user.role==='ADMIN'?200:403;
  } catch {return 503;}
}
// 로그인한 사용자만 프리미엄 데이터(매물·지구단위계획·건축분석)를 볼 수 있게 한다.
// 웹은 HttpOnly 쿠키, 앱은 Authorization 헤더를 백엔드 세션 검증으로 확인한다.
const userAuthCache=new Map();
const MAX_USER_AUTH_CACHE=5_000;
const USER_AUTH_TTL_MS=30_000;
export async function authorizeUser(request,config,fetcher=fetch) {
  if(!config.production)return {status:200,userId:'local-dev',role:null};
  if(request.headers.origin&&!allowedOrigin(request.headers.origin,config))return {status:403,userId:null,role:null};
  if(request.method==='POST'&&!request.headers.origin)return {status:403,userId:null,role:null};
  const cookie=String(request.headers.cookie||'');
  const authorization=String(request.headers.authorization||'');
  if(!cookie&&!authorization)return {status:401,userId:null,role:null};
  const key=(authorization?`a:${authorization}`:`c:${cookie}`).slice(0,4096);
  const now=Date.now();
  const cached=userAuthCache.get(key);
  if(cached&&cached.expiresAt>now)return {status:cached.status,userId:cached.userId,role:cached.role};
  let status=503,userId=null,role=null;
  try {
    const headers={};
    if(cookie)headers.cookie=cookie;
    if(authorization)headers.authorization=authorization;
    const response=await fetcher(config.accountInternal+'/api/v1/users/me',{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(response.ok){
      const user=await response.json().catch(()=>null);
      userId=user&&typeof user.id==='string'?user.id:null;
      role=user&&typeof user.role==='string'?user.role:null;
      status=userId?200:401;
    }else{
      status=response.status===401||response.status===403?401:503;
    }
  } catch {status=503;userId=null;role=null;}
  if(userAuthCache.size>=MAX_USER_AUTH_CACHE)userAuthCache.delete(userAuthCache.keys().next().value);
  userAuthCache.set(key,{status,userId,role,expiresAt:now+(status===200?USER_AUTH_TTL_MS:5_000)});
  return {status,userId,role};
}
