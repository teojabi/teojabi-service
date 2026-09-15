export const BUILD_DEFAULTS=Object.freeze({buildUse:null,preferTourism:false,minRoadWidthM:null,excludeEducation:false,excludeHeritage:false});
export const BUILD_USES=Object.freeze([
  {id:'hotel',label:'호텔·숙박시설'}, {id:'office',label:'사무실·업무시설'},
  {id:'retail',label:'상가·근린생활시설'}, {id:'residential',label:'주거용 건물'},
  {id:'mixed',label:'상가와 주거 등 복합용도'}, {id:'other',label:'그 밖의 용도'},
]);
export const ROAD_WIDTHS=Object.freeze([4,6,8,12,20]);
export const buildUseLabel=value=>BUILD_USES.find(use=>use.id===value)?.label||'신축 용도 미정';
export function validateBuildCriteria(input={}) {
  const value=Object.fromEntries(Object.keys(BUILD_DEFAULTS).map(key=>[key,input[key]??BUILD_DEFAULTS[key]]));
  if(value.buildUse!==null&&!BUILD_USES.some(use=>use.id===value.buildUse))return {ok:false,message:'신축 용도를 확인해 주세요.'};
  if(value.minRoadWidthM!==null&&!ROAD_WIDTHS.includes(value.minRoadWidthM))return {ok:false,message:'도로폭 조건을 확인해 주세요.'};
  if(['preferTourism','excludeEducation','excludeHeritage'].some(key=>typeof value[key]!=='boolean'))return {ok:false,message:'구역 선택을 확인해 주세요.'};
  if(input.purpose!=='new-build'&&Object.keys(BUILD_DEFAULTS).some(key=>value[key]!==BUILD_DEFAULTS[key]))return {ok:false,message:'신축 조건은 신축 목적에서 선택해 주세요.'};
  if(value.preferTourism&&value.buildUse!=='hotel')return {ok:false,message:'관광숙박 우선 보기는 호텔·숙박시설 용도에서 선택해 주세요.'};
  return {ok:true,value};
}
export function buildCriteriaFromQuery(query) {
  const flag=key=>!query.has(key)||query.get(key)==='0'?false:query.get(key)==='1'?true:query.get(key);
  return {buildUse:query.get('buildUse')||null,minRoadWidthM:query.has('minRoadWidthM')?Number(query.get('minRoadWidthM')):null,
    preferTourism:flag('preferTourism'),excludeEducation:flag('excludeEducation'),excludeHeritage:flag('excludeHeritage')};
}
export function appendBuildQuery(query,value) {
  if(value.purpose!=='new-build')return;
  if(value.buildUse)query.set('buildUse',value.buildUse);
  if(value.minRoadWidthM!==null&&value.minRoadWidthM!==undefined)query.set('minRoadWidthM',value.minRoadWidthM);
  for(const key of ['preferTourism','excludeEducation','excludeHeritage'])if(value[key])query.set(key,'1');
}
export function buildConditionLabels(value) {
  if(value.purpose!=='new-build')return [];
  return [value.buildUse?buildUseLabel(value.buildUse):null,value.preferTourism?'관광숙박특화구역 먼저':null,
    value.minRoadWidthM?`도로 ${value.minRoadWidthM}m 이상`:null,value.excludeEducation?'교육보호구역 제외':null,value.excludeHeritage?'문화재보존구역 제외':null].filter(Boolean);
}
export function buildCriteriaFields(value) {
  return `<div class="build-questions"><h2>어떤 용도로 신축할까요?</h2><p>계획 중인 용도와 원하는 부지 조건을 선택해 주세요.</p><div class="build-use-grid" role="group" aria-label="신축할 건물의 용도">${[...BUILD_USES,{id:'',label:'아직 정하지 않았어요'}].map(use=>`<button type="button" data-build-use="${use.id}" aria-pressed="${(value.buildUse||'')===use.id}">${use.label}</button>`).join('')}</div><fieldset class="build-site-options"><legend>${value.buildUse==='hotel'?'호텔 부지에서 확인할 조건':'함께 살펴볼 부지 조건'}</legend><p>원하는 항목만 선택해 주세요.</p>${value.buildUse==='hotel'?`<label class="build-check"><input type="checkbox" data-build-control="preferTourism" ${value.preferTourism?'checked':''}><span><b>관광숙박특화구역 먼저 보기</b><small>구역에 포함되거나 일부 걸친 필지를 먼저 보여드려요. 다른 매물도 함께 나와요.</small></span></label>`:''}<label class="build-road">인접도로는 얼마나 넓으면 좋을까요?<select data-build-control="minRoadWidthM" aria-label="최소 인접도로폭"><option value="">도로폭 제한 없음</option>${ROAD_WIDTHS.map(width=>`<option value="${width}" ${value.minRoadWidthM===width?'selected':''}>${width}m 이상</option>`).join('')}</select></label><label class="build-check"><input type="checkbox" data-build-control="excludeEducation" ${value.excludeEducation?'checked':''}><span><b>교육보호구역 제외</b><small>절대·상대 보호구역에 걸치거나 경계가 접한 필지를 제외해요.</small></span></label><label class="build-check"><input type="checkbox" data-build-control="excludeHeritage" ${value.excludeHeritage?'checked':''}><span><b>문화재보존구역 제외</b><small>보유한 문화재보존·관련 규제 구역에 걸치거나 경계가 접한 필지를 제외해요.</small></span></label></fieldset><p class="build-source-note">도로폭·구역 필터는 핀으로 연결한 필지의 저장 자료 기준이에요. 도로폭·보호구역 제외 조건의 자료가 미확인인 매물은 검색에서 빠져요. 건축 가능 여부는 별도 확인이 필요해요.</p></div>`;
}
