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

export function selectedCatalog(snapshot,zoningSnapshot,developmentSnapshot) {
  if(snapshot?.source!=='selected-preview-v1'||!Array.isArray(snapshot.rows)||!snapshot.rows.length)throw new Error('Selected inventory unavailable');
  const zoning=buildZoningIndex(zoningSnapshot),development=buildDevelopmentIndex(developmentSnapshot);
  const rows=[],seen=new Set();
  for(const item of snapshot.rows) {
    if(!validListingId(item.id)||seen.has(item.id)||!validPosition(item.position)||!DISTRICTS.includes(item.district)||!positive(item.priceWon))throw new Error('Invalid selected inventory');
    seen.add(item.id);
    // Explicit public DTO: no broker contacts, review notes, alternatives, images or consent history.
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
