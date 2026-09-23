export function serviceConfig(env=process.env) {
  const production=env.TEOJABI_SERVICE_MODE==='production';
  const origins=(env.TEOJABI_WEB_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const accountBase=(env.DISCOVERY_API_BASE||'').replace(/\/$/,'');
  const hosts=(env.TEOJABI_ALLOWED_HOSTS||'127.0.0.1:4173,localhost:4173,127.0.0.1,localhost').split(',').map(s=>s.trim());
  if(production) {
    if(env.TEOJABI_DATA_SOURCE!=='supabase'||!env.TEOJABI_DATABASE_URL)throw new Error('Production requires an explicit Supabase database connection');
    if(!accountBase.startsWith('https://')||!origins.length||origins.some(s=>!s.startsWith('https://')))throw new Error('Production requires HTTPS account API and web origins');
    if(!env.TEOJABI_PYTHON||!env.NAVER_MAP_CLIENT_ID)throw new Error('Production requires Python path and public Maps client ID');
  }
  return {production,origins,accountBase,hosts};
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
    const response=await fetcher(config.accountBase+'/api/v1/users/me',{headers:{cookie:request.headers.cookie},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.status===401)return 401;
    if(!response.ok)return 503;
    const user=await response.json();
    return user.role==='ADMIN'?200:403;
  } catch {return 503;}
}
