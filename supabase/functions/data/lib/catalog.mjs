import { DISTRICTS, toWon } from './policy.mjs';
import { validateExtraCriteria } from './search-options.mjs';
import { buildZoningIndex } from './zoning.mjs';
import { buildCriteriaFromQuery } from './build-criteria.mjs';
import { buildDevelopmentIndex, matchesDevelopment, tourismRank } from './development-policy.mjs';

const text = (value, max=600) => typeof value==='string' ? value.trim().slice(0,max) : '';
const positive = value => {
  if (!['string','number'].includes(typeof value) || !/^\d+(?:\.\d+)?$/.test(String(value))) return null;
  const n=Number(value); return Number.isFinite(n) && n>0 ? n : null;
};
// 사용자의 관심 프로필(목적·지역·용도지역·용도·예산)을 압축해 받아 매물 점수를 낸다.
export function parsePref(value) {
  if (!value) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const list = (v, n) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, n) : [];
    return { d: list(p.d, 6), z: list(p.z, 4), u: list(p.u, 4),
      b: Number.isFinite(Number(p.b)) && Number(p.b) > 0 ? Number(p.b) : null,
      p: typeof p.p === 'string' ? p.p : null, bu: typeof p.bu === 'string' ? p.bu : null };
  } catch { return null; }
}
export function prefScore(row, pref) {
  if (!pref) return 0;
  const has = (list, key) => list.some(k => key.includes(k) || k.includes(key));
  let score = 0;
  if (pref.d.length && has(pref.d, String(row.district || ''))) score += 3;
  const zoneNames = (row.zoning?.entries || []).map(e => String(e.name || '')).join(' ');
  if (pref.z.length && pref.z.some(z => zoneNames.includes(z))) score += 2;
  const usage = String(row.buildingFacts?.mainUse || (row.kind === 'land' ? '토지' : ''));
  if (pref.u.length && pref.u.some(u => usage.includes(u))) score += 2;
  const price = Number(row.priceWon);
  if (pref.b && price > 0) score += 2 * Math.max(0, 1 - Math.abs(price - pref.b) / pref.b);
  // 목적별 가중: 신축은 개발여력이 좋은 용도지역·토지, 투자는 가격, 자기소유는 용도 일치.
  if (pref.p === 'new-build') { if (/상업|준주거|준공업/.test(zoneNames)) score += 1.5; if (row.kind === 'land') score += 1; }
  else if (pref.p === 'invest') { if (price > 0) score += 1; }
  else if (pref.p === 'own-use') { if (pref.u.length && pref.u.some(u => usage.includes(u))) score += 1; }
  if (pref.bu === 'hotel' && /상업|관광/.test(zoneNames)) score += 1.5;
  return score;
}
export function validPosition(position) {
  return Number.isFinite(position?.lat) && Number.isFinite(position?.lng) && position.lat>=37.3 && position.lat<=37.8 && position.lng>=126.7 && position.lng<=127.3;
}
export function normalizeCatalog(raw, contract={}, zoningSnapshot=null, developmentSnapshot=null) {
  if (!Array.isArray(raw?.rows)) throw new Error('Missing local records');
  const rows=[], ids=new Set(), conflicts=new Set(), zoning=buildZoningIndex(zoningSnapshot),development=buildDevelopmentIndex(developmentSnapshot);
  for (const source of raw.rows) {
    if (typeof source.sourceId!=='string' || !/^\d+$/.test(source.sourceId)) continue;
    const id=`naver:${source.sourceId}`;
    if (ids.has(id)) { conflicts.add(id); continue; }
    ids.add(id);
    if (!['신규','유지'].includes(source.status) || !DISTRICTS.includes(source.district)) continue;
    const position={lat:Number(source.latitude),lng:Number(source.longitude)};
    const origin={lat:Number(source.sourceLat),lng:Number(source.sourceLng)};
    // Only accept transformed points close to the separately stored source pin.
    if (!validPosition(position) || !validPosition(origin) || Math.abs(position.lat-origin.lat)>.001 || Math.abs(position.lng-origin.lng)>.001) continue;
    const pnu=typeof source.pnu==='string' && /^\d{19}$/.test(source.pnu) ? source.pnu : null;
    rows.push({id,source:'naver',sourceId:source.sourceId,district:source.district,
      neighborhood:text(source.neighborhood,50),address:text(source.address,200),
      description:text(source.description,2000),floorInfo:text(source.floorInfo,60),pnu,
      position,priceWon:contract.priceUnitConfirmed===true?toWon(source.askingPrice,contract.priceUnit):null,
      areaM2:positive(source.landArea),floorAreaM2:positive(source.floorArea),
      areaSource:'listing',floorAreaSource:'listing',locationStatus:'pin-estimated',
      zoning:zoning.index.get(pnu)||{status:'missing',groups:[],entries:[]},
      development:development.index.get(pnu)||null,
      sourceStatus:source.status,kind:source.mainUse==='토지'?'land':'building',kindConfirmed:source.mainUse==='토지',
      nearbyTransactions:{status:'unavailable',cases:[]}});
  }
  return {rows:rows.filter(r=>!conflicts.has(r.id)),observedAt:raw.observedAt,rawCount:raw.rows.length,
    mode:'local-snapshot',priceUnitConfirmed:contract.priceUnitConfirmed===true,zoningAvailable:zoning.available,
    developmentAvailable:development.available,developmentObservedAt:development.observedAt};
}
export function parseBounds(value) {
  if (!value) return null;
  const values=value.split(',').map(Number);
  if (values.length!==4 || values.some(v=>!Number.isFinite(v))) throw new Error('Invalid bounds');
  const [west,south,east,north]=values;
  if (west>=east || south>=north || west<124 || east>132 || south<33 || north>40) throw new Error('Invalid bounds');
  return {west,south,east,north};
}
export function browseCatalog(catalog, query) {
  const excluded=query.getAll('exclude');
  if(excluded.length>500||excluded.some(id=>!/^(?:(?:naver|naver-land):\d{1,30}|premium:[a-f0-9-]{36})$/.test(id)))return {status:'invalid'};
  const excludedIds=new Set(excluded);
  // A favorites request asks for exact saved listing ids; other filters are ignored for it.
  const idsParam=query.get('ids');
  let requestedIds=null;
  if(idsParam!==null){
    requestedIds=idsParam.split(',').filter(Boolean);
    if(!requestedIds.length||requestedIds.length>100||requestedIds.some(id=>!/^(?:(?:naver|naver-land):\d{1,30}|premium:[a-f0-9-]{36})$/.test(id)))return {status:'invalid'};
  }
  const districts=query.getAll('district');
  if (districts.some(d=>!DISTRICTS.includes(d))) return {status:'invalid'};
  const neighborhoods=query.getAll('neighborhood');
  if (neighborhoods.some(n=>!n.trim()||n.length>20)) return {status:'invalid'};
  const budget=query.has('budgetWon')?Number(query.get('budgetWon')):null;
  const minArea=query.has('minAreaM2')?Number(query.get('minAreaM2')):null;
  const maxArea=query.has('maxAreaM2')?Number(query.get('maxAreaM2')):null;
  const extra=validateExtraCriteria({minAreaM2:minArea,maxAreaM2:maxArea,purpose:query.get('purpose'),zones:query.getAll('zone'),...buildCriteriaFromQuery(query)});
  if(!extra.ok)return {status:'invalid'};
  const {zones,purpose}=extra.value;
  const build=extra.value;
  if((build.preferTourism||build.minRoadWidthM||build.excludeEducation||build.excludeHeritage)&&!catalog.developmentAvailable)return {status:'unavailable',reason:'DEVELOPMENT_UNAVAILABLE'};
  if(zones.length&&!catalog.zoningAvailable)return {status:'unavailable',reason:'ZONING_UNAVAILABLE'};
  if (budget!==null && (!Number.isSafeInteger(budget)||budget<=0) || minArea!==null && (!Number.isFinite(minArea)||minArea<=0)) return {status:'invalid'};
  if (budget!==null && !catalog.priceUnitConfirmed) return {status:'unavailable',reason:'PRICE_UNIT_UNCONFIRMED'};
  let bounds;
  try {bounds=parseBounds(query.get('bounds'));} catch {return {status:'invalid'};}
  const sort=query.get('sort')||'price';
  if (!['price','price-desc','area'].includes(sort)) return {status:'invalid'};
  const pref=parsePref(query.get('pref'));
  const maxLimit=requestedIds?100:catalog.mode==='selected-preview'?500:20;
  const limit=requestedIds?maxLimit:Math.min(maxLimit,Math.max(5,Math.floor(Number(query.get('limit')))||5));
  const keyword=text(query.get('q'),100).toLocaleLowerCase('ko-KR');
  const cohort=query.get('cohort');
  if(cohort&&!['existing','curated'].includes(cohort))return {status:'invalid'};
  const wanted=requestedIds?new Set(requestedIds):null;
  let rows=(wanted?catalog.rows.filter(row=>wanted.has(row.id)):catalog.rows.filter(row=>!excludedIds.has(row.id)&&(!districts.length||districts.includes(row.district)) &&
    (!neighborhoods.length||neighborhoods.includes(row.neighborhood)) &&
    (!cohort||row.cohort===cohort) &&
    (budget===null || row.priceWon>0 && row.priceWon<=budget) &&
    (minArea===null || row.areaM2!==null&&row.areaM2>=minArea) &&
    (maxArea===null || row.areaM2!==null&&row.areaM2<=maxArea) &&
    (!zones.length || row.zoning?.status==='matched'&&row.zoning.groups.some(z=>zones.includes(z))) &&
    (sort!=='area'||row.areaM2!==null) &&
    (!bounds || row.position.lng>=bounds.west && row.position.lng<=bounds.east && row.position.lat>=bounds.south && row.position.lat<=bounds.north) &&
    (!keyword || `${row.address} ${row.neighborhood} ${row.sourceId}`.toLocaleLowerCase('ko-KR').includes(keyword)) && matchesDevelopment(row,build)));
  // Choose the cheapest matching listing per parcel before sorting the visible representatives.
  rows.sort((a,b)=>(a.priceWon??Infinity)-(b.priceWon??Infinity) || a.id.localeCompare(b.id));
  const groups=new Map();
  for (const row of rows) {
    // A favorites request keeps one card per saved listing instead of merging a parcel.
    const key=wanted?row.id:(row.groupKey||row.pnu||row.id);
    if (!groups.has(key)) groups.set(key,{key,pnu:row.pnu,representative:row,listings:[]});
    groups.get(key).listings.push(row);
  }
  // 목적·프로필 가중은 기본 정렬(가격순)에서 대표 매물 점수로 먼저 정렬한다.
  const prefRank=new Map();
  if(pref&&sort==='price')for(const g of groups.values())prefRank.set(g,prefScore(g.representative,pref));
  const orderedGroups=[...groups.values()].sort((a,b)=>(build.preferTourism?tourismRank(a.representative)-tourismRank(b.representative):0)||((prefRank.get(b)||0)-(prefRank.get(a)||0))||(sort==='area'?b.representative.areaM2-a.representative.areaM2:
    sort==='price-desc'?(b.representative.priceWon??-Infinity)-(a.representative.priceWon??-Infinity):(a.representative.priceWon??Infinity)-(b.representative.priceWon??Infinity))||a.representative.id.localeCompare(b.representative.id));
  return {status:'ready',mode:catalog.mode||'local-snapshot',observedAt:catalog.observedAt,
    criteria:extra.value,zoningAvailable:catalog.zoningAvailable,
    developmentObservedAt:catalog.developmentObservedAt,tourismPreferredCount:build.preferTourism?orderedGroups.filter(group=>tourismRank(group.representative)===0).length:null,
    sourceUpdatedAt:null,priceUnitConfirmed:catalog.priceUnitConfirmed,
    totalListings:rows.length,totalParcels:groups.size,groups:orderedGroups.slice(0,limit),
    hasMore:groups.size>limit && limit<maxLimit,limit,rawCount:catalog.rawCount};
}
export function suggestCatalogChanges(catalog,query,current) {
  if(current?.status!=='ready'||current.totalParcels>=5&&current.totalParcels<=20)return [];
  const narrow=current.totalParcels>20;
  const candidates=[],budget=Number(query.get('budgetWon')),minimum=Number(query.get('minAreaM2'));
  if(narrow) {
    const nextBudget=budget>0?Math.floor(budget*.8/1e7)*1e7:100e8;
    if(nextBudget>0)candidates.push({key:'budgetWon',value:nextBudget,label:`예산을 ${(nextBudget/1e8).toLocaleString('ko-KR')}억 이하로 줄여볼까요?`});
    const nextArea=minimum>0?Number((minimum*1.25).toFixed(5)):70*400/121;
    candidates.push({key:'minAreaM2',value:nextArea,label:`대지 ${(nextArea*121/400).toLocaleString('ko-KR',{maximumFractionDigits:1})}평 이상만 볼까요?`});
    const districts=query.getAll('district');
    if(districts.length!==1)for(const district of districts.length?districts:DISTRICTS)candidates.push({key:'district',value:district,label:`${district}부터 살펴볼까요?`});
    const zones=query.getAll('zone');
    if(catalog.zoningAvailable&&zones.length!==1)for(const zone of zones.length?zones:['상업지역','주거지역','공업지역','녹지지역'])candidates.push({key:'zone',value:zone,label:`${zone}만 볼까요?`});
  } else {
  if(budget>0&&Number.isSafeInteger(budget))candidates.push({key:'budgetWon',value:Math.ceil(budget*1.2/1e7)*1e7,label:`예산을 ${(Math.ceil(budget*1.2/1e7)/10).toLocaleString('ko-KR')}억까지 높여볼까요?`});
  if(minimum>0)candidates.push({key:'minAreaM2',value:Number((minimum*.8).toFixed(5)),label:`대지 ${(minimum*.8*121/400).toLocaleString('ko-KR',{maximumFractionDigits:1})}평 이상으로 넓혀볼까요?`});
  if(query.get('q'))candidates.push({key:'q',value:null,label:'검색어 제한 해제'});
  if(query.get('bounds'))candidates.push({key:'bounds',value:null,label:'지도 영역 제한 해제'});
  if(query.getAll('zone').length)candidates.push({key:'zone',value:null,label:'용도지역 제한 해제'});
  if(query.get('excludeEducation')==='1')candidates.push({key:'excludeEducation',value:null,label:'교육보호구역 제외 조건을 풀어볼까요?'});
  if(query.get('excludeHeritage')==='1')candidates.push({key:'excludeHeritage',value:null,label:'문화재보존구역 제외 조건을 풀어볼까요?'});
  const roadWidth=Number(query.get('minRoadWidthM'));
  if(roadWidth>4)candidates.push({key:'minRoadWidthM',value:roadWidth>=8?6:4,label:`도로폭 조건을 ${roadWidth>=8?'6':'4'}m 이상으로 넓혀볼까요?`});
  else if(roadWidth>0)candidates.push({key:'minRoadWidthM',value:null,label:'도로폭 제한을 풀어볼까요?'});
  const maximum=Number(query.get('maxAreaM2'));
  if(maximum>0)candidates.push({key:'maxAreaM2',value:Number((maximum*1.2).toFixed(5)),label:`최대 대지면적을 ${(maximum*1.2*121/400).toLocaleString('ko-KR',{maximumFractionDigits:1})}평까지 넓혀볼까요?`});
  }
  const suggestions=candidates.flatMap(change=>{
    const next=new URLSearchParams(query);change.value===null?next.delete(change.key):next.set(change.key,change.value);
    const result=browseCatalog(catalog,next);
      const useful=narrow?result.totalParcels>0&&result.totalParcels<current.totalParcels:result.totalParcels>current.totalParcels;
    return result.status==='ready'&&useful?[{...change,count:result.totalParcels,direction:narrow?'narrow':'broaden'}]:[];
  });
  // Offer different controls, choosing a manageable district/zone subset first.
  if(narrow){
    const picked=[];
    for(const key of ['budgetWon','minAreaM2','district','zone']) {
      const options=suggestions.filter(s=>s.key===key).sort((a,b)=>Math.abs(a.count-10)-Math.abs(b.count-10)||a.label.localeCompare(b.label));
      if(options.length)picked.push(options[0]);
    }
    return picked.slice(0,3);
  }
  return suggestions.slice(0,3);
}
export function validParcelGeometry(geometry) {
  if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) return false;
  const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let count=0;
  return Array.isArray(polys) && polys.length>0 && polys.every(poly=>Array.isArray(poly) && poly.length>0 && poly.every(ring=>
    Array.isArray(ring) && ring.length>=4 && ring.every(p=>Array.isArray(p) && p.length>=2 && validPosition({lat:p[1],lng:p[0]}) && ++count<=50000) &&
    ring[0][0]===ring.at(-1)[0] && ring[0][1]===ring.at(-1)[1]));
}
export const DOCUMENT_LINKS=Object.freeze({
  registry:'https://www.iros.go.kr/',
});
