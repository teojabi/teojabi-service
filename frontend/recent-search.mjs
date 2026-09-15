import { DISTRICTS } from './policy.mjs';
import { validateExtraCriteria } from './search-options.mjs';
export const RECENT_SEARCH_KEY='teojabi.recent-search.v1';
export function areaInput(value,unit='pyeong'){
  return value==null?'':String(Number((value*(unit==='pyeong'?121/400:1)).toFixed(8)));
}
export function normalizeRecentSearch(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const {budgetWon=null,districts=[],bounds=null,query='',sort='price'}=input;
  if(budgetWon!==null&&(!Number.isSafeInteger(budgetWon)||budgetWon<=0))return null;
  if(!Array.isArray(districts)||districts.some(d=>!DISTRICTS.includes(d)))return null;
  if(typeof query!=='string'||query.length>100||!['price','price-desc','area'].includes(sort))return null;
  if(bounds!==null&&(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]||bounds[0]<124||bounds[2]>132||bounds[1]<33||bounds[3]>40))return null;
  const extra=validateExtraCriteria(input);if(!extra.ok)return null;
  const areaUnit=input.areaUnit==='m2'?'m2':'pyeong';
  const result={budgetWon,districts:[...new Set(districts)],...extra.value,areaUnit,query,sort,bounds:bounds?[...bounds]:null};
  result.minArea=areaInput(result.minAreaM2,areaUnit);result.maxArea=areaInput(result.maxAreaM2,areaUnit);
  return result;
}
export function readRecentSearch(storage){
  try{return normalizeRecentSearch(JSON.parse((storage??globalThis.localStorage).getItem(RECENT_SEARCH_KEY)));}catch{return null;}
}
export function writeRecentSearch(input,storage){
  const clean=normalizeRecentSearch(input);if(!clean)return false;
  try{const target=storage??globalThis.localStorage,value=JSON.stringify(clean);if(target.getItem(RECENT_SEARCH_KEY)!==value)target.setItem(RECENT_SEARCH_KEY,value);return true;}catch{return false;}
}

export function memberSearchKey(user){return user?.id?`${RECENT_SEARCH_KEY}.member.${user.id}`:null;}
export function writeMemberSearch(user,input,storage=globalThis.localStorage){
  const key=memberSearchKey(user),clean=normalizeRecentSearch(input);
  if(!key||!clean)return false;
  try{storage.setItem(key,JSON.stringify(clean));return true;}catch{return false;}
}
export function readMemberSearch(user,items=[],storage=globalThis.localStorage){
  const key=memberSearchKey(user);if(!key)return null;
  try{const local=normalizeRecentSearch(JSON.parse(storage.getItem(key)));if(local)return local;}catch{}
  for(const item of [...items].filter(i=>i.kind==='condition').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))){
    const clean=normalizeRecentSearch(item.payload);if(clean)return clean;
  }
  return null;
}
