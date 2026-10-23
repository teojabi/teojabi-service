// Per-user premium API quota and PNU/listing enumeration detection.
// State is per beta-service process (PM2 single instance); restart clears it.

const positiveInt=(name,fallback)=>{const value=Number.parseInt(process.env[name]??'',10);return Number.isFinite(value)&&value>0?value:fallback;};

const HOUR_MS=60*60*1000;
const MINUTE_MS=60*1000;
const DAY_MS=24*60*60*1000;
const HOURLY_QUOTA=positiveInt('TEOJABI_PREMIUM_HOURLY_QUOTA',600);
const DAILY_QUOTA=positiveInt('TEOJABI_PREMIUM_DAILY_QUOTA',3000);
const TWO_HOUR_SUM_THRESHOLD=positiveInt('TEOJABI_TWO_HOUR_SUM_THRESHOLD',1000);
const THREE_HOUR_SUM_THRESHOLD=positiveInt('TEOJABI_THREE_HOUR_SUM_THRESHOLD',1000);
const CONSECUTIVE_BLOCK_MS=positiveInt('TEOJABI_CONSECUTIVE_BLOCK_MS',5*60*60*1000);
const ASSISTANT_WEIGHT=positiveInt('TEOJABI_ASSISTANT_WEIGHT',20);
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

function requestWeight(path,url){
  if(path==='/api/assistant')return ASSISTANT_WEIGHT;
  if(path==='/api/catalog'||path==='/api/recommendations'){
    const requested=Number(url.searchParams.get('limit')||5);
    if(Number.isFinite(requested)&&requested>0)return Math.max(1,Math.min(100,Math.ceil(requested/5)));
  }
  return 1;
}

function consecutiveBlock(userId,state,now){
  const retryAfter=Math.ceil(CONSECUTIVE_BLOCK_MS/1000);
  state.blockedUntil=now+CONSECUTIVE_BLOCK_MS;
  state.count=0;
  state.history=[];
  state.hourStart=now;
  console.warn(`[premium-guard] cumulative quota abuse blocked userId=${userId} retryAfter=${retryAfter}`);
  return {code:'consecutive-quota-abuse',retryAfter};
}

function tailSum(history,count){
  let total=0;
  for(let i=Math.max(0,history.length-count);i<history.length;i++)total+=history[i];
  return total;
}

function checkDailyQuota(userId,state,now,weight){
  if(now-state.dayStart>=DAY_MS){
    state.dayStart=now;
    state.dayCount=0;
    state.dailyWarned=false;
  }
  if(state.dayCount+weight>DAILY_QUOTA){
    if(!state.dailyWarned){
      console.warn(`[premium-guard] daily quota blocked userId=${userId} used=${state.dayCount} limit=${DAILY_QUOTA}`);
      state.dailyWarned=true;
    }
    return {code:'daily-quota-exceeded',retryAfter:Math.max(1,Math.ceil((state.dayStart+DAY_MS-now)/1000))};
  }
  state.dayCount+=weight;
  return null;
}

function checkHourlyQuota(userId,now,weight){
  let state=quotaState.get(userId);
  if(!state){
    pruneOldest(quotaState);
    state={hourStart:now,count:0,history:[],blockedUntil:0,dayStart:now,dayCount:0,dailyWarned:false};
    quotaState.set(userId,state);
  }
  if(state.blockedUntil>now){
    return {code:'consecutive-quota-abuse',retryAfter:Math.max(1,Math.ceil((state.blockedUntil-now)/1000))};
  }
  if(now-state.hourStart>=HOUR_MS){
    // 한 시간 넘게 완전히 쉬었다면 연속 사용으로 보지 않는다.
    const idleFullWindow=now-state.hourStart>=2*HOUR_MS;
    if(idleFullWindow)state.history=[];
    else{
      state.history.push(state.count);
      if(state.history.length>3)state.history.shift();
    }
    state.hourStart=now;
    state.count=0;
    if(state.history.length>=2&&tailSum(state.history,2)>=TWO_HOUR_SUM_THRESHOLD)return consecutiveBlock(userId,state,now);
    if(state.history.length>=3&&tailSum(state.history,3)>=THREE_HOUR_SUM_THRESHOLD)return consecutiveBlock(userId,state,now);
  }
  if(state.count>=HOURLY_QUOTA){
    return {code:'premium-quota-exceeded',retryAfter:Math.max(1,Math.ceil((state.hourStart+HOUR_MS-now)/1000))};
  }
  const nextCount=state.count+weight;
  // 직전 완료 시간 + 현재 시간 합계가 1,000 이상이면 차단 (예: 500 + 500)
  if(state.history.length>=1&&state.history[state.history.length-1]+nextCount>=TWO_HOUR_SUM_THRESHOLD)return consecutiveBlock(userId,state,now);
  // 최근 2개 완료 시간 + 현재 시간 합계가 1,000 이상이면 차단 (예: 400 + 400 + 200)
  if(state.history.length>=2&&tailSum(state.history,2)+nextCount>=THREE_HOUR_SUM_THRESHOLD)return consecutiveBlock(userId,state,now);
  const daily=checkDailyQuota(userId,state,now,weight);
  if(daily)return daily;
  state.count=nextCount;
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
  let parsed;
  try{parsed=new URL(String(url||'/'),'http://localhost');}catch{parsed=new URL('http://localhost/');}
  const quota=checkHourlyQuota(userId,now,requestWeight(path,parsed));
  if(quota){
    if(quota.code==='consecutive-quota-abuse'){
      return {ok:false,status:429,code:quota.code,message:'2~3시간 연속 누적 한도를 초과해 일시 차단되었습니다.',retryAfter:quota.retryAfter};
    }
    if(quota.code==='daily-quota-exceeded'){
      return {ok:false,status:429,code:quota.code,message:'일일 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',retryAfter:quota.retryAfter};
    }
    return {ok:false,status:429,code:quota.code,message:'시간당 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',retryAfter:quota.retryAfter};
  }
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
