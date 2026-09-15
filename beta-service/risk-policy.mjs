import { sanitizeRecordFields } from './record-fields.mjs';
const text=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
// User-supplied official notice. Keep the original filename encoding, omit session identifiers.
export const TOURISM_NOTICE=Object.freeze({
  title:'서울특별시 제2026-87호 고시',
  url:'https://www.eum.go.kr/web/ac/DownloadBig.jsp?isGosi=Y&filename=%BC%AD%BF%EF%C6%AF%BA%B0%BD%C3_%C1%A62026-87%C8%A3_%B0%ED%BD%C3.pdf&filepath=%2F20260526%2Fwebcommon%2Fmapboard%2FWcBdMapForm.jsp',
});
const number=(v,zero=false)=>{
  if(!['string','number'].includes(typeof v)||!/^\d+(?:\.\d+)?$/.test(String(v)))return null;
  const n=Number(v);return Number.isFinite(n)&&(zero?n>=0:n>0)?n:null;
};
const count=v=>{const n=number(v,true);return Number.isSafeInteger(n)?n:null;};
export const normalizeRiskAddress=v=>text(v,300).replace(/^서울시 /,'서울특별시 ').replace(/번지$/,'').replace(/\s+/g,' ').trim();
function date(v) {
  const raw=text(v,10).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  const ms=Date.parse(raw+'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===raw?raw:null;
}
export function safePublicDocumentUrl(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&
      /^(?:[a-z0-9-]+\.)+go\.kr$/.test(url.hostname)?url.href:null;
  } catch {return null;}
}
function candidates(source,address) {
  if(source?.status!=='ready'||!Array.isArray(source.rows))return {status:source?.status||'error',items:[],truncated:false};
  const unique=new Map(),conflicts=new Set();let excluded=0;
  for(const raw of source.rows) {
    if(typeof raw.serial!=='string'||!/^\d{1,50}$/.test(raw.serial)||!address||normalizeRiskAddress(raw.address)!==address){excluded++;continue;}
    const item={serial:raw.serial,address:text(raw.address),category:text(raw.category),type:text(raw.type),
      name:text(raw.name,80),role:text(raw.role,80),use:text(raw.use),structure:text(raw.structure),
      landAreaM2:number(raw.landArea),floorAreaM2:number(raw.floorArea),
      mainCount:count(raw.mainCount),accessoryCount:count(raw.accessoryCount),parking:count(raw.parking),
      aboveFloors:count(raw.aboveFloors),belowFloors:count(raw.belowFloors),approvalDate:date(raw.approvalDate),
      match:'address-candidate',sourceDate:null,fields:sanitizeRecordFields(raw.recordFields)};
    if(unique.has(item.serial)&&JSON.stringify(unique.get(item.serial))!==JSON.stringify(item))conflicts.add(item.serial);
    else unique.set(item.serial,item);
  }
  const items=[...unique.values()].filter(item=>!conflicts.has(item.serial));
  return {status:'ready',items:items.slice(0,30),truncated:source.rows.length>30||source.rows.some(r=>count(r.total)>30),
    excluded:excluded+conflicts.size,scopeConfirmed:false};
}
const zoneRelation=row=>row.covers===true?'geometry-contained':row.overlaps===true?'geometry-overlap':row.touches===true?'boundary-touch':row.overlaps===false?null:'geometry-unconfirmed';
export const zoneRelationLabel=relation=>({'geometry-contained':'필지 포함','geometry-overlap':'일부 걸침','boundary-touch':'경계 접함','geometry-unconfirmed':'경계 확인 필요'}[relation]||'경계 확인 필요');
function documentWarning(row) {
  const record=text(row.noticeNumber).match(/(\d{4})\s*-\s*(\d+)/);
  const file=text(row.pdfName).match(/(\d{4})\s*-\s*(\d+)/);
  return record&&file&&(record[1]!==file[1]||Number(record[2])!==Number(file[2]))?'고시번호와 첨부 파일명이 달라 원문 대조가 필요합니다.':null;
}
function spatialZones(source,parcel) {
  const result={status:parcel.status==='ready'?(source?.status||'error'):'missing-parcel',items:[],truncated:false,excluded:0};
  if(result.status!=='ready')return result;
  if(!Array.isArray(source.rows)){result.status='error';return result;}
  const ids=new Set();
  for(const row of source.rows) {
    const id=String(row.id??''),relation=zoneRelation(row);
    if(!/^(?:\d{1,50}|[a-f0-9]{32})$/.test(id)){result.excluded++;continue;}
    if(!relation||ids.has(id))continue;ids.add(id);
    result.items.push({id,name:text(row.name)||'구역명 미기재',code:text(row.code,30),relation,
      flatHeightM:number(row.flatHeightM),slopeHeightM:number(row.slopeHeightM),heightNote:text(row.heightNote,500),
      noticeYear:/^\d{4}$/.test(String(row.noticeYear))?String(row.noticeYear):null,
      noticeDate:date(row.noticeDate),noticeNumber:text(row.noticeNumber,80),
      pdfUrl:safePublicDocumentUrl(row.pdfUrl),pdfName:text(row.pdfName),documentWarning:documentWarning(row),applicabilityConfirmed:false});
  }
  result.truncated=result.items.length>30||source.rows.some(r=>count(r.total)>30);
  result.items=result.items.slice(0,30);return result;
}
function zoneSummary(id,title,source,detail) {
  const relations=[...new Set(source.items.map(i=>i.relation))];
  const unconfirmed=relations.includes('geometry-unconfirmed')||source.excluded>0;
  const labels=relations.filter(r=>r!=='geometry-unconfirmed').map(zoneRelationLabel);
  const value=source.status==='error'?'조회 실패':source.status!=='ready'?'필지 경계 확인 필요':
    labels.length?labels.join(' · '):unconfirmed?'경계 확인 필요':'보유 자료상 겹침 없음';
  return {id,title,...source,state:source.status!=='ready'?'missing':source.items.length||unconfirmed?'review':'evidence',value,detail,
    applicabilityConfirmed:false,scope:'linked-parcel-only'};
}
export function normalizeRoad(source,pnu) {
  const rows=source?.rows;
  if(source?.status==='error')return {status:'error',widthM:null};
  const widthM=source?.status==='ready'&&rows?.length===1&&rows[0].pnu===pnu?number(rows[0].widthM):null;
  return {status:widthM!==null?'ready':'missing',widthM,source:'master_land.도로폭_m',adjacencyConfirmed:false};
}
export function buildBuildingRecords(listing,raw) {
  if(!listing||raw?.sourceId!==listing.sourceId||raw.pnu!==listing.pnu||normalizeRiskAddress(raw.address)!==normalizeRiskAddress(listing.address))return {status:'error',reason:'SOURCE_MISMATCH'};
  const address=normalizeRiskAddress(listing.address),recap=candidates(raw.recap,address),buildings=candidates(raw.buildings,address);
  return {status:[recap,buildings].some(s=>s.status==='error')?'partial':'ready',address,recap,buildings};
}
export function buildRiskReview(listing,raw) {
  if(!listing||raw?.sourceId!==listing.sourceId||raw.pnu!==listing.pnu||normalizeRiskAddress(raw.address)!==normalizeRiskAddress(listing.address))return {status:'error',reason:'SOURCE_MISMATCH'};
  const address=normalizeRiskAddress(listing.address),recap=candidates(raw.recap,address),buildings=candidates(raw.buildings,address);
  const p=raw.parcel?.rows;
  const mapAreaM2=raw.parcel?.status==='ready'&&p?.length===1&&p[0].valid===true&&p[0].srid===5174?number(p[0].mapArea):null;
  const parcel={status:mapAreaM2!==null?'ready':raw.parcel?.status==='error'?'error':'unconfirmed',pnu:listing.pnu,mapAreaM2,scope:'linked-parcel-only'};
  const plans={status:parcel.status==='ready'?(raw.plans?.status||'error'):'missing-parcel',items:[],truncated:false};
  if(plans.status==='ready'&&Array.isArray(raw.plans.rows)) {
    const ids=new Set();
    for(const row of raw.plans.rows) {
      const relation=zoneRelation(row);
      if(!relation||ids.has(String(row.id)))continue;
      ids.add(String(row.id));
      plans.items.push({id:String(row.id),name:text(row.name)||'계획명 미기재',title:text(row.title,800),
        noticeDate:date(row.noticeDate),noticeNumber:text(row.noticeNumber,80),
        relation,
        pdfUrl:safePublicDocumentUrl(row.pdfUrl),pdfName:text(row.pdfName),documentWarning:documentWarning(row),
        drawings:(Array.isArray(row.drawings)?row.drawings:[]).map(d=>({name:text(d.name)||'계획 도면',url:safePublicDocumentUrl(d.url)})).filter(d=>d.url).slice(0,30),
        applicabilityConfirmed:false});
    }
    plans.truncated=plans.items.length>20||raw.plans.rows.some(r=>count(r.total)>20);
    plans.items=plans.items.slice(0,20);
  }
  const education=spatialZones(raw.education,parcel),tourism=spatialZones(raw.tourism,parcel),heritage=spatialZones(raw.heritage||{status:'ready',rows:[]},parcel);
  const zones=[
    zoneSummary('education','교육보호구역',education,'절대·상대 등 보호구역 구분을 살펴보고 계획한 용도의 적용 조건을 확인하세요.'),
    zoneSummary('heritage','문화재보존구역',heritage,'보존구역의 구분과 관련 조건을 확인하세요.'),
    zoneSummary('tourism','관광숙박특화구역',tourism,'숙박시설을 검토한다면 관련 고시의 대상 범위와 적용 조건을 확인하세요.'),
    zoneSummary('district-plan','지구단위계획구역',plans,'고시·도면에서 해당 획지의 건축 조건과 변경 이력을 확인하세요.'),
  ];
  const available=source=>source.status==='ready'&&source.items.length>0;
  const notes=[];
  if([recap,buildings,parcel,plans,education,tourism,heritage].some(s=>s.status==='error'))notes.push('일부 자료를 불러오지 못했습니다. 다시 불러오거나 확인 가능한 자료부터 살펴보세요.');
  if(recap.excluded||buildings.excluded)notes.push('식별자나 주소가 맞지 않는 대장 후보는 제외했습니다.');
  if(education.excluded||tourism.excluded)notes.push('식별자를 확인할 수 없는 구역 자료는 제외했습니다.');
  const checks=[
    {id:'scope',title:'매각 범위·권리',state:'review',value:'전체 부지인지 확인',detail:available(recap)?`주소가 같은 총괄표제부 후보 ${recap.items.length}건이 있습니다. 실제 매각 대상 필지·동·지분을 확인해 주세요.`:'매물에 포함된 필지·건물·지분과 소유·임대 현황을 확인해 주세요.',tab:'registers'},
    {id:'buildings',title:'기존 건물·철거 대상',state:available(buildings)?'evidence':'missing',value:available(buildings)?`건물대장 후보 ${buildings.items.length}${buildings.truncated?'+':''}건`:'대장 확인 필요',detail:'대장별 구조·층수·사용승인일을 살펴보고, 현재 남아 있는 건물과 철거 대상을 대조해 주세요.',tab:'registers'},
    {id:'area',title:'대지·면적 대조',state:'review',value:mapAreaM2!==null?'매물·필지·대장 함께 보기':'필지 범위 확인 필요',detail:'매물 면적, 연결 필지의 지도 계산면적, 대장 후보의 면적은 대상 범위가 다를 수 있습니다.',tab:'registers'},
    {id:'road',title:'도로·진출입·주차',state:'missing',value:'현장·공적 자료 확인',detail:'도로의 법적 지위·폭·접도 길이, 진출입 조건과 계획 용도에 필요한 주차를 확인해 주세요.',tab:null},
    {id:'scale',title:'높이·건폐율·용적률',state:'missing',value:'적용 기준 검토 전',detail:'계획 원문과 해당 필지에 적용되는 기준이 확인되면 건축 규모를 검토합니다. 현재 최대치나 가능 층수를 계산하지 않습니다.',tab:'plans'},
  ];
  return {status:notes.length?'partial':'ready',listing:{id:listing.id,address:listing.address,priceWon:listing.priceWon,areaM2:listing.areaM2,floorAreaM2:listing.floorAreaM2,zoning:listing.zoning},
    observedAt:raw.observedAt,feasibility:'not-determined',recap,buildings,parcel,plans,zones,road:normalizeRoad(raw.road,listing.pnu),checks,notes,
    nextSteps:['매각 대상의 전체 필지·건물·지분과 임대 현황 확인','최신 대장·부속지번으로 대지와 건물 관계 대조','고시·도면에서 해당 획지의 건축 조건 확인','도로·주차·철거 조건을 건축사와 검토']};
}

export function buildParcelContext(pnu,raw) {
  if(!/^11\d{17}$/.test(pnu)||raw?.pnu!==pnu||raw?.sourceId!==pnu)return {status:'error'};
  const result=buildRiskReview({id:pnu,sourceId:pnu,pnu,address:raw.address},raw);
  if(result.status==='error')return result;
  const rows=raw.road?.rows,master=raw.road?.status==='ready'&&rows?.length===1&&rows[0].pnu===pnu?rows[0]:null;
  const state=text(master?.baselineStatus),zone=text(master?.zone),recognized=state.split(';').every(s=>['일반기준','원천용도지역적용','도심경계확인'].includes(s));
  const far=recognized&&zone?number(master?.far):null,bcr=recognized&&zone?number(master?.bcr):null;
  return {status:result.status,pnu,address:raw.address,zones:result.zones,road:result.road,
    baseline:{far,bcr:bcr<=100?bcr:null,zone,originalZone:text(master?.originalZone),state:state||'자료미확인',downtown:master?.downtown==='서울도심',source:'master_land'}};
}
