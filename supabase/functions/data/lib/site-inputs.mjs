export function createSiteDraft(listing) {
  return {listingId:listing?.id||null,address:listing?.address||'',initialPnu:listing?.pnu||null,selected:[],
    fields:{landArea:listing?.areaM2>0?String(listing.areaM2):'',far:'',bcr:'',height:''},areaSource:listing?.areaM2>0?'매물 기재 면적':'직접 입력'};
}
export function validateSiteInputs(fields,selectedCount) {
  if(!selectedCount)return {ok:false,message:'검토할 필지를 하나 이상 선택해 주세요.'};
  const values={};
  for(const [name,label,max] of [['landArea','대지면적',null],['far','용적률',null],['bcr','건폐율',100],['height','높이',null]]) {
    const raw=String(fields[name]??'').trim();
    if(!raw){if(name==='landArea')return {ok:false,message:'대지면적을 입력해 주세요.'};values[name]=null;continue;}
    const n=Number(raw);
    if(!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(n)||n<=0||(max!==null&&n>max))return {ok:false,message:`${label}은 ${max?'100 이하의 ':''}0보다 큰 숫자로 입력해 주세요.`};
    values[name]=n;
  }
  return {ok:true,values};
}

export function constructionEstimate(fields,unitCost=1000,floorArea=null){
 const area=floorArea??(Number(fields.landArea)*Number(fields.far)/100);
 const cost=Number(unitCost);
 if(!Number.isFinite(area)||area<=0||!Number.isFinite(cost)||cost<=0)return null;
 const pyeong=area*121/400,constructionWon=Math.round(pyeong*cost*10000);
 return {floorAreaM2:area,floorAreaPyeong:pyeong,unitCostManwon:cost,constructionWon,designWon:Math.round(constructionWon*.05)};
}
