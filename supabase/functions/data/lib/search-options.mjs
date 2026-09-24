import {validateBuildCriteria} from './build-criteria.mjs';
export const PURPOSES=Object.freeze([
  {id:'new-build',label:'신축할 건물',description:'기존 건물을 철거하고 새로 짓고 싶어요.',guide:'실제 부지 범위와 대장·계획 원문부터 확인해요. 신축 가능 여부는 별도 검토가 필요합니다.'},
  {id:'renovate',label:'고쳐서 사용할 건물',description:'리모델링해서 공간을 바꾸고 싶어요.',guide:'현재 건물 구조와 사용 현황, 고칠 범위를 확인해요. 리모델링 가능 여부는 현장·대장 검토가 필요합니다.'},
  {id:'invest',label:'투자 목적',description:'가격과 임대 현황을 함께 살펴보고 싶어요.',guide:'주변 거래와 임대 현황, 필요한 비용 자료를 함께 확인해요. 매물 호가만으로 수익률을 판단하지 않습니다.'},
  {id:'own-use',label:'직접 사용할 건물',description:'내 사업이나 생활에 맞는 공간을 찾고 있어요.',guide:'필요한 공간 크기와 현재 용도, 접근성을 확인해요. 원하는 용도로 사용할 수 있는지는 별도 확인이 필요합니다.'},
]);
export const ZONING_OPTIONS=Object.freeze(['주거지역','상업지역','공업지역','녹지지역']);
export const ZONING_DETAILS=Object.freeze([
  '제1종전용주거지역','제2종전용주거지역','제1종일반주거지역','제2종일반주거지역','제3종일반주거지역','준주거지역',
  '중심상업지역','일반상업지역','근린상업지역','유통상업지역','전용공업지역','일반공업지역','준공업지역','보전녹지지역','생산녹지지역','자연녹지지역',
]);
export const purposeLabel=id=>PURPOSES.find(p=>p.id===id)?.label||'목적 미정';
export function parseAreaRange(min,max,unit='m2') {
  if(!['m2','pyeong'].includes(unit))return {ok:false,message:'면적 단위를 확인해 주세요.'};
  const parse=value=>{
    if(value==null||String(value).trim()==='')return null;
    const text=String(value).trim();
    if(!/^\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text))||Number(text)<=0)return NaN;
    const converted=Number(text)*(unit==='pyeong'?400/121:1);
    return Number.isFinite(converted)?converted:NaN;
  };
  const minAreaM2=parse(min),maxAreaM2=parse(max);
  if([minAreaM2,maxAreaM2].some(Number.isNaN))return {ok:false,message:'대지면적은 0보다 큰 숫자로 입력해 주세요.'};
  if(minAreaM2!=null&&maxAreaM2!=null&&minAreaM2>maxAreaM2)return {ok:false,message:'최대 대지면적은 최소 대지면적 이상이어야 합니다.'};
  return {ok:true,minAreaM2,maxAreaM2};
}
export function validateExtraCriteria(input) {
  const purpose=input.purpose||null,zones=input.zones??[];
  if(purpose&&!PURPOSES.some(p=>p.id===purpose))return {ok:false,message:'검색 목적을 확인해 주세요.'};
  if(!Array.isArray(zones)||zones.some(z=>!ZONING_OPTIONS.includes(z)))return {ok:false,message:'용도지역을 확인해 주세요.'};
  const {minAreaM2:min,maxAreaM2:max}=input;
  if([min,max].some(v=>v!=null&&(!Number.isFinite(v)||v<=0)))return {ok:false,message:'대지면적은 0보다 큰 숫자로 입력해 주세요.'};
  if(min!=null&&max!=null&&min>max)return {ok:false,message:'최대 대지면적은 최소 대지면적 이상이어야 합니다.'};
  const build=validateBuildCriteria(input);if(!build.ok)return build;
  return {ok:true,value:{purpose,zones:[...new Set(zones)],minAreaM2:min??null,maxAreaM2:max??null,...build.value,auction:normalizeAuction(input.auction)}};
}
// 경매 용도(법원 공시 용도명). 건물·토지·개인주택 위주로 운영하며 아파트는 제외한다.
export const AUCTION_USAGES=Object.freeze(['상가','근린시설','오피스텔','업무','단독주택','다가구','다세대','연립주택','빌라','대지','임야']);
// 경매 조건은 매물과 의미가 달라 별도 하위 객체로 둔다. (용도·최저매각가·감정가 대비 최저가율)
export function normalizeAuction(raw) {
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:raw===true?{enabled:true}:null;
  const enabled=Boolean(source&&source.enabled===true);
  if(!enabled)return {enabled:false,usages:[],maxPriceWon:null,maxBidRate:null};
  const usages=Array.isArray(source.usages)?[...new Set(source.usages.filter(u=>AUCTION_USAGES.includes(u)))].slice(0,6):[];
  const priceRaw=Number(source.maxPriceWon);
  const maxPriceWon=Number.isSafeInteger(priceRaw)&&priceRaw>0?priceRaw:null;
  const rateRaw=Number(source.maxBidRate);
  const maxBidRate=Number.isFinite(rateRaw)&&rateRaw>0&&rateRaw<=100?Math.round(rateRaw*100)/100:null;
  return {enabled:true,usages,maxPriceWon,maxBidRate};
}
export function areaRangeLabel(min,max,unit='m2') {
  const scale=unit==='pyeong'?121/400:1,suffix=unit==='pyeong'?'평':'㎡';
  const n=value=>(value*scale).toLocaleString('ko-KR',{maximumFractionDigits:2});
  if(min!=null&&max!=null)return `대지 ${n(min)}~${n(max)}${suffix}`;
  if(min!=null)return `대지 ${n(min)}${suffix} 이상`;
  if(max!=null)return `대지 ${n(max)}${suffix} 이하`;
  return '대지면적 전체';
}
