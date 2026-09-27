import { validPosition } from './catalog.mjs';
import { DISTRICTS } from './policy.mjs';
import { buildZoningIndex } from './zoning.mjs';
import { buildDevelopmentIndex } from './development-policy.mjs';

export const validListingId=id=>typeof id==='string'&&/^(?:(?:naver|naver-land):\d{1,30}|premium:[a-f0-9-]{36})$/.test(id);
const positive=value=>value!==null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
const addressKey=value=>String(value||'').replace(/^서울(?:특별)?시?\s*/,'').replace(/번지$/,'').replace(/\s+/g,'');
const optionalText=value=>String(value||'').trim().slice(0,100);
const buildingFacts=value=>value&&typeof value==='object'?{
  landAreaM2:positive(value.landAreaM2),
  floorAreaM2:positive(value.floorAreaM2),
  floorScale:optionalText(value.floorScale),
  farPercent:positive(value.farPercent),
  mainUse:optionalText(value.mainUse),
  approvalDate:optionalText(value.approvalDate)
}:null;
// 관리자가 터잡이픽에 붙인 '신축분석'. 본문은 수익성 문구를 걸러내고, 공개 이미지 URL(https)만 노출한다.
const ANALYSIS_DROP=/(수익|ROIC|ROE|GDV|개발\s*이익|자기자본|매각가|가동률|분양가|투자|매입가|취득세|중개보수|철거|감리|예비비|금융비용|공사비|사업비)/i;
const ANALYSIS_HEADER=/^\s*(?:[\[【]|[▣◆■●□▪▶▷])/;
const sanitizeAnalysis=text=>{
  const lines=String(text||'').split(/\r?\n/),out=[];let skipping=false;
  for(const line of lines){
    if(ANALYSIS_HEADER.test(line)){if(ANALYSIS_DROP.test(line)){skipping=true;continue;}skipping=false;out.push(line);continue;}
    if(skipping)continue;
    if(ANALYSIS_DROP.test(line)){
      const kept=line.split(/(?<=[.!?])\s+/).filter(sentence=>!ANALYSIS_DROP.test(sentence));
      const joined=kept.join(' ').trim();if(joined)out.push(joined);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
};
const pickAnalysis=value=>{if(!value||typeof value!=='object')return null;
  const analysis=sanitizeAnalysis(value.analysis).slice(0,4000);
  const images=Array.isArray(value.images)
    ?value.images.filter(u=>typeof u==='string'&&/^https:\/\/[^\s"'<>]{1,480}$/.test(u)).slice(0,12)
    :[];
  return analysis||images.length?{analysis,images}:null;};

export function selectedCatalog(snapshot,zoningSnapshot,developmentSnapshot) {
  if(snapshot?.source!=='selected-preview-v1'||!Array.isArray(snapshot.rows)||!snapshot.rows.length)throw new Error('Selected inventory unavailable');
  const zoning=buildZoningIndex(zoningSnapshot),development=buildDevelopmentIndex(developmentSnapshot);
  const rows=[],seen=new Set();
  for(const item of snapshot.rows) {
    if(!validListingId(item.id)||seen.has(item.id)||!validPosition(item.position)||!DISTRICTS.includes(item.district)||!positive(item.priceWon))throw new Error('Invalid selected inventory');
    seen.add(item.id);
    // Explicit public DTO: no broker contacts, review notes, alternatives or consent history.
    // 예외적으로 관리자가 작성한 '신축분석'(pickAnalysis)만 공개한다.
    rows.push({id:item.id,source:item.source,sourceId:item.sourceId,cohort:item.cohort,
      teojabiNo:/^\d{4}$/.test(String(item.teojabiNo||''))?String(item.teojabiNo):null,
      district:item.district,neighborhood:item.neighborhood,address:item.address,
      pnu:/^11\d{17}$/.test(item.pnu||'')?item.pnu:null,position:item.position,
      priceWon:Number(item.priceWon),areaM2:positive(item.areaM2),floorAreaM2:positive(item.floorAreaM2),
      description:String(item.description||'').slice(0,2000),floorInfo:item.floorInfo||'',
      buildingFacts:buildingFacts(item.buildingFacts),
      kind:item.kind,kindConfirmed:true,areaSource:'listing',floorAreaSource:'listing',locationStatus:'pin-estimated',
      zoning:zoning.index.get(item.pnu)||{status:'missing',groups:[],entries:[]},
      development:development.index.get(item.pnu)||null,nearbyTransactions:{status:'unavailable',cases:[]},
      pickAnalysis:pickAnalysis(item.pickAnalysis),
      groupKey:addressKey(item.address)||item.id});
  }
  // Existing manually registered inventory takes precedence over a candidate at the same address.
  const existingAddresses=new Set(rows.filter(r=>r.cohort==='existing').map(r=>r.groupKey));
  const visible=rows.filter(r=>r.cohort==='existing'||!existingAddresses.has(r.groupKey));
  return {rows:visible,rawCount:visible.length,observedAt:snapshot.observedAt,mode:'selected-preview',
    curatedCount:visible.filter(r=>r.cohort==='curated').length,existingCount:visible.filter(r=>r.cohort==='existing').length,
    duplicateCount:rows.length-visible.length,priceUnitConfirmed:true,zoningAvailable:zoning.available,
    developmentAvailable:development.available,developmentObservedAt:development.observedAt};
}
