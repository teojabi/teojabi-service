// Per-user premium API quota and PNU/listing enumeration detection.
// State is per beta-service process (PM2 single instance); restart clears it.

const positiveInt=(name,fallback)=>{const value=Number.parseInt(process.env[name]??'',10);return Number.isFinite(value)&&value>0?value:fallback;};

const HOUR_MS=60*60*1000;
const MINUTE_MS=60*1000;
const HOURLY_QUOTA=positiveInt('TEOJABI_PREMIUM_HOURLY_QUOTA',900);
const ENUM_WINDOW_MS=positiveInt('TEOJABI_PNU_ENUM_WINDOW_MS',10*60*1000);
const ENUM_MAX=positiveInt('TEOJABI_PNU_ENUM_MAX',200);
const ENUM_PER_MINUTE=positiveInt('TEOJABI_PNU_ENUM_PER_MINUTE',90);
const ENUM_BLOCK_MS=positiveInt('TEOJABI_PNU_ENUM_BLOCK_MS',30*60*1000);
const MAX_TRACKED_USERS=positiveInt('TEOJABI_PREMIUM_MAX_USERS',5000);

const quotaState=new Map();
const enumState=new Map();

function pruneOldest(map){
  if(map.size<MAX_TRACKED_USERS)return;
  const oldest=map.keys().next().value;
  if(oldest)map.delete(oldest);
}

function checkHourlyQuota(userId,now){
  let state=quotaState.get(userId);
  if(!state||now-state.hourStart>=HOUR_MS){
    pruneOldest(quotaState);
    state={hourStart:now,count:0};
    quotaState.set(userId,state);
  }
  if(state.count>=HOURLY_QUOTA){
    return {retryAfter:Math.max(1,Math.ceil((state.hourStart+HOUR_MS-now)/1000))};
  }
  state.count+=1;
  return null;
}

// Only identifiers that can be enumerated are tracked. Repeated calls for the
// same listing/parcel (risk + site-context + building-records...) count once.
function enumerationKey(path,url){
  const pnu=path.match(/^\/api\/(?:parcel-context|parcel-documents|land-use|redevelop-included)\/(\d{19})$/);
  if(pnu)return `pnu:${pnu[1]}`;
  const id=path.match(/^\/api\/(?:risk|site-context|building-records|land-record|nearby-transactions|listings)\/(.+)$/);
  if(id){
    const value=id[1];
    if(/^\d{19}$/.test(value))return `pnu:${value}`;
    return `id:${value.slice(0,160)}`;
  }
  if(path==='/api/site-parcels'){
    const pnuValue=url.searchParams.get('pnu');
    if(pnuValue&&/^\d{19}$/.test(pnuValue))return `pnu:${pnuValue}`;
    const address=url.searchParams.get('address');
    if(address)return `addr:${address.trim().toLowerCase().slice(0,100)}`;
  }
  return null;
}

function checkEnumeration(userId,key,now){
  if(!key)return null;
  let state=enumState.get(userId);
  if(!state){
    pruneOldest(enumState);
    state={keys:new Map(),blockedUntil:0};
    enumState.set(userId,state);
  }
  if(state.blockedUntil>now){
    return {retryAfter:Math.max(1,Math.ceil((state.blockedUntil-now)/1000))};
  }
  for(const [storedKey,at] of state.keys){
    if(now-at>ENUM_WINDOW_MS)state.keys.delete(storedKey);
  }
  state.keys.set(key,now);
  let lastMinute=0;
  for(const at of state.keys.values())if(now-at<=MINUTE_MS)lastMinute+=1;
  if(state.keys.size>=ENUM_MAX||lastMinute>=ENUM_PER_MINUTE){
    state.blockedUntil=now+ENUM_BLOCK_MS;
    const retryAfter=Math.ceil(ENUM_BLOCK_MS/1000);
    console.warn(`[premium-guard] enumeration blocked userId=${userId} distinct=${state.keys.size} lastMinute=${lastMinute} key=${key}`);
    state.keys.clear();
    return {retryAfter};
  }
  return null;
}

export function checkPremiumAccess({userId,path,url,now=Date.now()}){
  if(!userId)return {ok:false,status:401,code:'auth-required',message:'로그인이 필요합니다.',retryAfter:1};
  const quota=checkHourlyQuota(userId,now);
  if(quota){
    return {ok:false,status:429,code:'premium-quota-exceeded',message:'시간당 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',retryAfter:quota.retryAfter};
  }
  let parsed;
  try{parsed=new URL(String(url||'/'),'http://localhost');}catch{parsed=new URL('http://localhost/');}
  const enumeration=checkEnumeration(userId,enumerationKey(path,parsed),now);
  if(enumeration){
    return {ok:false,status:429,code:'enumeration-blocked',message:'비정상적으로 많은 필지를 조회했습니다. 잠시 후 다시 시도해 주세요.',retryAfter:enumeration.retryAfter};
  }
  return {ok:true};
}

export function resetPremiumGuards(){
  quotaState.clear();
  enumState.clear();
}
