import { BadRequestException } from '@nestjs/common';
export const KINDS=['favorite','feedback','condition','analysis'];
const clean=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const positive=(v:unknown,max=1e15)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max?v:null;
const optionalNumber=(v:unknown,max=1e15)=>{
  if(v===null||v===undefined||v==='')return null;
  const n=positive(v,max);if(n===null)throw new BadRequestException('Invalid number');return n;
};
const listingKey=/^(?:naver:\d{1,30}|naver-land:\d{1,30}|premium:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|disco:[A-Za-z0-9]{4,24}|auction:[A-Za-z0-9]{4,40}|onbid:[A-Za-z0-9-]{4,30}(?:::[A-Za-z0-9-]{1,30})?)$/;
export function validateItem(kind:string,key:string,input:any) {
  if(!KINDS.includes(kind)||!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>32768)throw new BadRequestException('Invalid saved item');
  if(['favorite','feedback'].includes(kind)&&!listingKey.test(key))throw new BadRequestException('Invalid listing');
  if(['condition','analysis'].includes(kind)&&!/^[-a-zA-Z0-9]{1,100}$/.test(key))throw new BadRequestException('Invalid key');
  if(kind==='favorite')return {id:key,address:clean(input.address,200),priceWon:positive(input.priceWon),areaM2:positive(input.areaM2),floorAreaM2:positive(input.floorAreaM2)};
  if(kind==='feedback') {
    if(!['like','dislike','hide'].includes(input.choice))throw new BadRequestException('Invalid choice');
    const reasons=['가격','위치','대지면적','건물상태','개발가능성','주변환경','기타'];
    return {id:key,choice:input.choice,reasons:Array.isArray(input.reasons)?[...new Set(input.reasons.filter((r:any)=>reasons.includes(r)))].slice(0,7):[]};
  }
  if(kind==='condition') {
    const districts=['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'];
    const zones=['주거지역','상업지역','공업지역','녹지지역'];
    const min=optionalNumber(input.minAreaM2),max=optionalNumber(input.maxAreaM2);
    const bounds=input.bounds??null;
    if(bounds!==null&&(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]<124||bounds[2]>132||bounds[1]<33||bounds[3]>40||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]))throw new BadRequestException('Invalid map bounds');
    if(min&&max&&min>max)throw new BadRequestException('Invalid area range');
    if(input.districts!==undefined&&(!Array.isArray(input.districts)||input.districts.some((d:any)=>!districts.includes(d))))throw new BadRequestException('Invalid districts');
    if(input.zones!==undefined&&(!Array.isArray(input.zones)||input.zones.some((z:any)=>!zones.includes(z))))throw new BadRequestException('Invalid zones');
    return {name:clean(input.name,80),budgetWon:optionalNumber(input.budgetWon),bounds,districts:Array.isArray(input.districts)?[...new Set(input.districts)]:[],
      purpose:['new-build','renovate','invest','own-use'].includes(input.purpose)?input.purpose:null,minAreaM2:min,maxAreaM2:max,
      zones:Array.isArray(input.zones)?[...new Set(input.zones.filter((z:any)=>zones.includes(z)))]:[],query:clean(input.query,100),sort:input.sort==='area'?'area':'price'};
  }
  if(!Array.isArray(input.pnus)||input.pnus.some((p:any)=>typeof p!=='string'||!/^11\d{17}$/.test(p)))throw new BadRequestException('Invalid parcels');
  const pnus=[...new Set(input.pnus)];
  if(!pnus.length||pnus.length>20)throw new BadRequestException('Select 1–20 parcels');
  const f=input.fields||{};
  const landArea=optionalNumber(f.landArea);if(!landArea)throw new BadRequestException('Enter land area');
  return {name:clean(input.name,80),pnus,fields:{landArea,far:optionalNumber(f.far),bcr:optionalNumber(f.bcr,100),height:optionalNumber(f.height)},memo:clean(input.memo,1000)};
}
