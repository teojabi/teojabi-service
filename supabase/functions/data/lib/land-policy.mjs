import { sanitizeRecordFields } from './record-fields.mjs';
const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
export const positiveArea=value=>['string','number'].includes(typeof value)&&/^\d+(?:\.\d+)?$/.test(String(value))&&Number(value)>0&&Number.isFinite(Number(value))?Number(value):null;
const address=value=>text(value).replace(/^서울시 /,'서울특별시 ').replace(/번지$/,'').replace(/\s+/g,' ').trim();
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
export function compareLandArea(listingArea,officialArea) {
  const listing=positiveArea(listingArea),official=positiveArea(officialArea);
  if(listing===null||official===null)return {status:'unavailable',differenceM2:null,differencePct:null};
  const delta=Math.round((listing-official)*1e5)/1e5;
  return {status:delta===0?'equal':'different',differenceM2:delta,differencePct:delta/official*100,scopeConfirmed:false};
}
export function normalizeLandRecord(listing,raw) {
  if(raw?.status!=='ready'||!Array.isArray(raw.rows)||raw.rows.length!==1)return {status:'error'};
  const row=raw.rows[0];
  if(row.sourceId!==listing.sourceId||row.pnu!==listing.pnu||address(row.listingAddress)!==address(listing.address))return {status:'error'};
  if(!row.ledgerPnu)return {status:'missing',pnu:listing.pnu};
  if(row.ledgerPnu!==listing.pnu||!/^11\d{17}$/.test(row.ledgerPnu))return {status:'error'};
  const areaM2=positiveArea(row.officialArea);
  if(areaM2===null&&!sanitizeRecordFields(row.recordFields,'land').length)return {status:'invalid-area',pnu:listing.pnu};
  // PNU remains the join key. An address discrepancy is surfaced, never repaired by guessing.
  const ledgerAddress=[text(row.legalDong),text(row.jibun)].filter(Boolean).join(' ');
  const addressMatches=address(ledgerAddress)===address(listing.address);
  return {status:'ready',pnu:row.ledgerPnu,address:ledgerAddress,addressMatches,areaM2,
    registerType:text(row.registerType),landCategory:text(row.landCategory),ownershipType:text(row.ownershipType),scale:text(row.scale),
    dataDate:date(row.dataDate),snapshotDate:date(row.snapshotDate),source:'seoul_land_ledger',
    masterAreaM2:positiveArea(row.masterArea),mapAreaM2:positiveArea(row.mapArea),
    comparison:addressMatches?compareLandArea(listing.areaM2,areaM2):{status:'address-mismatch',differenceM2:null,differencePct:null},
    scope:'linked-parcel-only',fields:sanitizeRecordFields(row.recordFields,'land')};
}
export function selectedLedgerArea(features) {
  if(!Array.isArray(features)||!features.length)return {status:'empty',count:0,covered:0,areaM2:null};
  const seen=new Set(),dates=new Set();let covered=0,total=0;
  for(const f of features) {
    if(!/^11\d{17}$/.test(f?.id)||seen.has(f.id))return {status:'invalid',count:features.length,covered,areaM2:null};
    seen.add(f.id);const area=positiveArea(f.properties?.officialAreaM2),sourceDate=date(f.properties?.ledgerDate);
    if(area!==null&&sourceDate){covered++;total+=area;dates.add(sourceDate);}
  }
  const status=covered!==features.length?'incomplete':dates.size!==1?'mixed-dates':'ready';
  return {status,count:features.length,covered,areaM2:status==='ready'?Math.round(total*1e5)/1e5:null,date:dates.size===1?[...dates][0]:null};
}
