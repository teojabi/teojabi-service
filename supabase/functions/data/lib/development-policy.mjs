const relations=['contained','overlap','touch','clear','unknown'];
export function buildDevelopmentIndex(snapshot) {
  const index=new Map(),conflicts=new Set();
  if(snapshot?.source!=='local-development-criteria-v1'||!Array.isArray(snapshot.rows))return {available:false,index};
  for(const row of snapshot.rows) {
    if(typeof row.pnu!=='string'||!/^11\d{17}$/.test(row.pnu))continue;
    const item={roadWidthM:Number.isFinite(row.roadWidthM)&&row.roadWidthM>0?row.roadWidthM:null,
      ...Object.fromEntries(['education','heritage','tourism'].map(key=>[key,row.parcelValid===true&&relations.includes(row[key])?row[key]:'unknown']))};
    if(index.has(row.pnu)&&JSON.stringify(index.get(row.pnu))!==JSON.stringify(item))conflicts.add(row.pnu);
    else index.set(row.pnu,item);
  }
  for(const pnu of conflicts)index.delete(pnu);
  return {available:true,index,observedAt:snapshot.observedAt};
}
export function matchesDevelopment(row,criteria) {
  const facts=row.development;
  if(criteria.minRoadWidthM&&(facts?.roadWidthM==null||facts.roadWidthM<criteria.minRoadWidthM))return false;
  if(criteria.excludeEducation&&facts?.education!=='clear')return false;
  if(criteria.excludeHeritage&&facts?.heritage!=='clear')return false;
  return true;
}
export const tourismRank=row=>['contained','overlap'].includes(row.development?.tourism)?0:1;
