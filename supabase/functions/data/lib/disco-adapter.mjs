import { toWon } from './policy.mjs';

const number = value => { const n=typeof value==='number' ? value : typeof value==='string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN; return Number.isFinite(n)?n:null; };
const positive = value => { const n=number(value); return n!==null && n>0 ? n : null; };
function position(value) {
  const lat=number(value?.lat), lng=number(value?.lng);
  return lat!==null && lng!==null && Math.abs(lat)<=90 && Math.abs(lng)<=180 ? {lat,lng} : null;
}

// Approximate straight-line metres from confirmed WGS84 coordinates.
export function distanceMeters(from,to) {
  const a=position(from), b=position(to);
  if (!a || !b) return null;
  const radians=degrees=>degrees*Math.PI/180;
  const hav=Math.sin(radians(b.lat-a.lat)/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(radians(b.lng-a.lng)/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,hav))));
}

/** Column mapping verified against public.disco_raw on 2026-09-14.
 * Units, code meanings and cancellation semantics require a source contract.
 * `y` is YYYYMM; `d` and `m` are empty in the inspected dataset.
 * No crawled_at value is treated as a transaction date or an update event.
 */
export function adaptDiscoRows(rows,subject,subjectPosition,contract) {
  const confirmed=contract?.confirmed===true && contract.coordinates==='EPSG:4326' && toWon('1',contract.priceUnit)!==null && Array.isArray(contract.salePtValues) && contract.salePtValues.length>0 && contract.kindByT && typeof contract.kindByT==='object';
  const context={source:'disco_raw',schemaConfirmed:Boolean(confirmed),priceUnit:contract?.priceUnit || null};
  if (!confirmed) return {context,records:null};
  if (!Array.isArray(rows) || !position(subjectPosition)) return {context,records:null};
  const records=[];
  for (const row of rows) {
    if (!row || typeof row.y!=='string' || !/^[0-9]{4}(0[1-9]|1[0-2])$/.test(row.y)) continue;
    if (!contract.salePtValues.map(String).includes(String(row.pt))) continue;
    const kind=contract.kindByT[String(row.t)];
    if (!['building','land'].includes(kind) || typeof row.pnu!=='string' || !/^\d{19}$/.test(row.pnu)) continue;
    const id=typeof row.id==='string' && /^\d+$/.test(row.id) ? row.id : Number.isSafeInteger(row.id) && row.id>=0 ? String(row.id) : null;
    const priceWon=toWon(row.p,contract.priceUnit), distance=distanceMeters(subjectPosition,row);
    if (!id || priceWon===null || priceWon<=0 || distance===null || distance>1000) continue;
    // The source only gives a sequence id. Collapse indistinguishable monthly
    // records for display; this is not proof of a unique legal transaction.
    const transactionKey=JSON.stringify([row.pnu,row.y,String(row.t),String(row.pt),priceWon,positive(row.ea),positive(row.la)]);
    records.push({id:`disco_raw:${id}`,transactionKey,source:'disco_raw',pnu:row.pnu,kind,dealType:'sale',dealDate:`${row.y.slice(0,4)}-${row.y.slice(4)}`,price:row.p,cancelled:null,distanceFor:subject.id,distanceMeters:distance,areaM2:positive(row.la),areaLabel:'대지면적',floorAreaM2:positive(row.ea),position:position(row),address:typeof row.address==='string'?row.address.slice(0,200):null,ownershipTransferConfirmed:String(row.dt)==='6',sourceReliabilityHigh:String(row.drt)==='5'});
  }
  return {context,records};
}
