import { toWon } from './policy.mjs';

const kstDate = timestamp => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
};
const knownCount = value => Number.isSafeInteger(value) && value >= 0;
const sameId = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// Event history must be declared complete by the source adapter. A current-state
// "new" flag cannot prove when a listing was first discovered.
export function buildActivity(snapshot, now = Date.now(), ingestion = null) {
  const today = kstDate(now);
  const items = [];
  const daily = (type, source) => {
    if (snapshot?.eventCoverage?.[type] !== today || !Array.isArray(snapshot.events)) return null;
    const ids = new Set(snapshot.events.filter(event =>
      event.type === type && event.source === source && typeof event.entityId === 'string' && event.entityId &&
      event.confirmed === true && event.cancelled !== true &&
      /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.at || '') && Date.parse(event.at) <= now && kstDate(event.at) === today
    ).map(event => event.entityId));
    return ids.size;
  };
  const discovered = daily('listing_discovered','naver');
  if (discovered !== null) {
    items.push({ id:'new-listings', label:'오늘 새로 발견한 매물', value:discovered, unit:'건', note:'한국시간 오늘 · 매물번호 중복 제외', state:'current' });
  } else if (knownCount(snapshot?.listings?.newFlagCount)) {
    items.push({ id:'new-listings', label:'신규로 표시된 수집 매물', value:snapshot.listings.newFlagCount, unit:'건', note:`${snapshot.observedDate || '마지막'} 조회 자료 · 발견일 집계 전`, state:'snapshot' });
  } else {
    items.push({ id:'new-listings', label:'오늘 새로 발견한 매물', value:null, note:'수집 시점 확인 후 표시해요', state:'pending' });
  }
  const trades = daily('transaction_ingested','disco_raw');
  items.push(trades===null && knownCount(snapshot?.transactions?.total)
    ? { id:'new-transactions',label:'모아 둔 실거래 기록',value:snapshot.transactions.total,unit:'건',note:'원천 기록 수 · 중복 포함 · 오늘 거래 건수 아님',state:'snapshot' }
    : { id:'new-transactions', label:'오늘 새로 반영한 실거래', value:trades, unit:'건', note:trades === null ? '갱신 내역 연결 후 표시해요' : '오늘 계약된 수가 아닌, 새로 반영한 기록이에요', state:trades === null ? 'pending' : 'current' });
  const update = snapshot?.transactionsUpdate;
  const updateTime = Date.parse(update?.completedAt);
  const updateValid = update?.source === 'disco_raw' && update?.status === 'completed' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(update?.completedAt || '') && Number.isFinite(updateTime) && updateTime <= now;
  items.push({ id:'transactions-update', label:'실거래 데이터 업데이트', value:updateValid ? kstDate(updateTime) : null, pendingText:'연결 예정', note:updateValid ? '마지막 정상 반영일 · 거래일과 달라요' : '공공데이터 갱신 내역 연결 후 알려드려요', state:updateValid ? 'updated' : 'pending' });
  const updatesEnabled=ingestion?.source==='disco_raw' && ingestion.enabled===true;
  if(updatesEnabled){
    const seen=new Set();
    const runs=(Array.isArray(ingestion.runs)?ingestion.runs:[]).filter(run=>{
      const at=Date.parse(run?.completedAt);
      if(typeof run?.runId!=='string'||!run.runId||seen.has(run.runId)||!knownCount(run.homeNewCount)||!knownCount(run.total)||
        !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(run.completedAt||'')||!Number.isFinite(at)||at>now)return false;
      seen.add(run.runId);return true;
    }).sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
    const dailyRuns=runs.filter(run=>kstDate(run.completedAt)===today);
    const latest=runs[0];
    items[1]={id:'new-transactions',label:'오늘 새로 반영한 실거래',value:dailyRuns.length?dailyRuns.reduce((n,run)=>n+run.homeNewCount,0):null,unit:'건',pendingText:'집계 예정',
      note:dailyRuns.length?`${today} · 새로 반영된 토지·건물 거래 기록`:`${today} · 매일 오후 7시 수집 시작`,state:dailyRuns.length?'current':'pending'};
    items[2]={id:'transactions-update',label:'실거래 데이터 업데이트',value:latest?kstDate(latest.completedAt):null,pendingText:'첫 집계 대기',
      note:latest?'마지막 정상 반영일 · 오늘 계약된 건수와는 달라요':'수집과 반영이 완료되면 날짜를 알려드려요',state:latest?'updated':'pending'};
  }
  return { items, today, updatesEnabled, listingTotal:knownCount(snapshot?.listings?.total) ? snapshot.listings.total : null, observedDate:snapshot?.observedDate || null, mode:snapshot?.mode === 'live' ? 'live' : 'snapshot' };
}

function dealPeriod(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const year=Number(match[1]), month=Number(match[2]), day=match[3] ? Number(match[3]) : null;
  if (year<1900 || month<1 || month>12) return null;
  const days = new Date(Date.UTC(year,month,0)).getUTCDate();
  if (day !== null && (day<1 || day>days)) return null;
  return { label:value, monthIndex:year*12+month-1, sortKey:`${match[1]}-${match[2]}-${match[3] || '00'}`, precision:day===null ? 'month' : 'day' };
}

/** Receives normalized disco_raw records, with distances calculated server-side
 * for this particular listing. Never infer coordinates, currency, or sale type. */
export function nearbyTransactions(subject, transactions, context, { now=Date.now(), matchKind=true, onePerParcel=false }={}) {
  if (context?.schemaConfirmed !== true || context?.source !== 'disco_raw' || toWon('1',context.priceUnit) === null) return { status:'unavailable', cases:[], reason:'TRANSACTION_SOURCE_UNCONFIRMED' };
  if (!subject || !['building','land'].includes(subject.kind) || typeof subject.pnu !== 'string' || !/^\d{19}$/.test(subject.pnu) || typeof subject.id !== 'string' || !subject.id) return { status:'unavailable', cases:[], reason:'SUBJECT_UNCONFIRMED' };
  if (!Array.isArray(transactions)) return { status:'error', cases:[], reason:'TRANSACTION_RESPONSE_INVALID' };
  const maxCases=5;
  const today=kstDate(now);
  if (!today) return { status:'error', cases:[], reason:'CLOCK_INVALID' };
  const current=dealPeriod(today), unique=new Map(), conflicts=new Set();
  // A cancellation supersedes an earlier active copy, even when the cancellation
  // record has no price/date. Adapters must supply the same stable transaction key.
  const cancelledKeys=new Set(transactions.filter(t=>t?.source==='disco_raw' && t.cancelled===true).map(t=>t.transactionKey || t.id));
  for (const transaction of transactions) {
    if (!transaction || typeof transaction.id !== 'string' || !transaction.id) continue;
    const period=dealPeriod(transaction.dealDate), priceWon=toWon(transaction.price,context.priceUnit);
    if (!period || period.monthIndex<current.monthIndex-35 || period.monthIndex>current.monthIndex || (period.precision==='day' && transaction.dealDate>today)) continue;
    if (transaction.source !== 'disco_raw' || transaction.dealType !== 'sale' || !['building','land'].includes(transaction.kind) || matchKind&&transaction.kind !== subject.kind || transaction.cancelled === true) continue;
    if (typeof transaction.pnu !== 'string' || !/^\d{19}$/.test(transaction.pnu) || transaction.pnu === subject.pnu) continue;
    if (transaction.distanceFor !== subject.id || !Number.isFinite(transaction.distanceMeters) || transaction.distanceMeters<0 || transaction.distanceMeters>1000) continue;
    if (priceWon===null || priceWon<=0) continue;
    const key=transaction.transactionKey || transaction.id;
    if (typeof key !== 'string' || !key || cancelledKeys.has(key)) continue;
    const item={ id:transaction.id, source:'disco_raw', pnu:transaction.pnu, dealDate:period.label, datePrecision:period.precision, kind:transaction.kind, priceWon, distanceMeters:transaction.distanceMeters, areaM2:Number.isFinite(transaction.areaM2) && transaction.areaM2>0 ? transaction.areaM2 : null, areaLabel:typeof transaction.areaLabel==='string' ? transaction.areaLabel : null, cancellationStatus:transaction.cancelled===false ? 'not-cancelled' : 'unconfirmed' };
    item.floorAreaM2=Number.isFinite(transaction.floorAreaM2)&&transaction.floorAreaM2>0?transaction.floorAreaM2:null;
    item.position=Number.isFinite(transaction.position?.lat)&&Number.isFinite(transaction.position?.lng)&&Math.abs(transaction.position.lat)<=90&&Math.abs(transaction.position.lng)<=180?transaction.position:null;
    item.address=typeof transaction.address==='string'?transaction.address:null;
    item.ownershipTransferConfirmed=transaction.ownershipTransferConfirmed===true;
    item.sourceReliabilityHigh=transaction.sourceReliabilityHigh===true;
    const signature=JSON.stringify({ ...item, id:undefined, ownershipTransferConfirmed:undefined, sourceReliabilityHigh:undefined });
    if (unique.has(key) && unique.get(key).signature !== signature) conflicts.add(key);
    else {
      const previous=unique.get(key)?.item;
      if(previous){item.ownershipTransferConfirmed||=previous.ownershipTransferConfirmed;item.sourceReliabilityHigh||=previous.sourceReliabilityHigh;}
      unique.set(key,{ item, signature });
    }
  }
  const candidates=[...unique.entries()].filter(([key])=>!conflicts.has(key)).map(([,entry])=>entry.item);
  candidates.sort((a,b)=>a.distanceMeters-b.distanceMeters || b.dealDate.localeCompare(a.dealDate) || sameId(a,b));
  const parcels=new Set();
  const distinct=onePerParcel?candidates.filter(row=>{if(parcels.has(row.pnu))return false;parcels.add(row.pnu);return true;}):candidates;
  const near=distinct.filter(row=>row.distanceMeters<=500);
  const expanded=near.length<maxCases;
  const cases=(expanded ? distinct : near).slice(0,maxCases);
  return { status:'ready', cases, radiusMeters:expanded ? 1000 : 500, expanded, windowMonths:36,
    maxCases, insufficient:cases.length<maxCases,
    distanceLabel:'매물 위치 기준 직선거리', relationship:'nearby-parcel', comparableValuation:false };
}

export function attachNearbyTransactions(recommendation, recordsByListingId, context, options) {
  if (recommendation.status !== 'ready') return recommendation;
  return { ...recommendation, groups:recommendation.groups.map(group=>({
    ...group,
    listings:group.listings.map(listing=>({ ...listing, nearbyTransactions:nearbyTransactions(listing,recordsByListingId?.[listing.id],context,options) })),
    nearbyTransactions:nearbyTransactions(group.representative,recordsByListingId?.[group.representative.id],context,options),
  })) };
}
