import { validParcelGeometry } from './catalog.mjs';
import { positiveArea } from './land-policy.mjs';

export function normalizeSiteParcels(raw) {
  if(raw?.status!=='ready'||!Array.isArray(raw.rows))return {status:'error',features:[]};
  const unique=new Map(),duplicates=new Set();let invalid=0;
  for(const row of raw.rows) {
    if(typeof row.pnu!=='string'||!/^11\d{17}$/.test(row.pnu)||!validParcelGeometry(row.geometry)){invalid++;continue;}
    if(unique.has(row.pnu)){duplicates.add(row.pnu);continue;}
    unique.set(row.pnu,{type:'Feature',id:row.pnu,properties:{pnu:row.pnu,address:typeof row.address==='string'?row.address.slice(0,150):'',officialAreaM2:positiveArea(row.officialArea),ledgerDate:typeof row.ledgerDate==='string'?row.ledgerDate:null},geometry:row.geometry});
  }
  const features=[...unique.values()].filter(f=>!duplicates.has(f.id));
  return {status:'ready',features:features.slice(0,40),truncated:raw.rows.length>40,excluded:invalid+duplicates.size};
}
export { createSiteDraft, validateSiteInputs } from './site-inputs.mjs';
