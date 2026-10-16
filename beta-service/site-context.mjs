import { renderInlineContext } from './inline-context.mjs';
import { renderLandUse } from './landuse-context.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const areaText=m2=>Number(m2)>=10000?`${Math.round(m2/10000).toLocaleString('ko-KR')}만㎡`:(Number(m2)>0?`${Math.round(m2).toLocaleString('ko-KR')}㎡`:'');
// 포함된 도시계획사업의 사업 내용 한 줄 요약.
function projectMeta(z){
  const bits=[];
  if(z.stage)bits.push(`추진단계 ${z.stage}`);
  if(z.households)bits.push(`${Number(z.households).toLocaleString('ko-KR')}세대`);
  if(z.implementer)bits.push(`시행 ${z.implementer}`);
  const area=areaText(z.areaM2);if(area)bits.push(area);
  if(z.noticeDate)bits.push(`지정 ${z.noticeDate}`);
  return bits.length?`<small>${esc(bits.join(' · '))}</small>`:'';
}
// 이 필지가 포함(또는 일부 걸침)된 도시계획사업을 지구단위계획처럼 안내한다.
function renderIncludedProjects(data){
  const zones=(data&&data.redevelop&&Array.isArray(data.redevelop.zones))?data.redevelop.zones:[];
  if(!zones.length)return '';
  const items=[];
  for(const z of zones.filter(z=>z.contained).slice(0,3)){
    const kind=[z.categoryLabel,z.categoryGroup].filter(Boolean).join(' · ');
    items.push(`<li><span class="context-dot"></span><div><p>이 필지는 <b>${esc(z.name)}</b>${kind?` (${esc(kind)})`:''}에 포함되어 있어요.</p>${projectMeta(z)}</div></li>`);
  }
  for(const z of zones.filter(z=>!z.contained).slice(0,2)){
    items.push(`<li><span class="context-dot"></span><div><p>필지 일부가 <b>${esc(z.name)}</b> 사업 경계에 걸쳐 있어요.</p>${projectMeta(z)}</div></li>`);
  }
  return items.length?`<ul class="context-facts context-projects">${items.join('')}</ul>`:'';
}
// 토지이용계획확인서 항목을 버튼 카드로 열고 닫는다.
function renderLandUseCard(data){
  const items=(data&&data.landUse&&Array.isArray(data.landUse.items))?data.landUse.items:[];
  return `<div class="site-inline-toggle"><button class="outline" type="button" data-site="landuse-toggle" aria-expanded="false">토지이용계획 보기${items.length?` <small>${items.length}건</small>`:''}</button><div class="site-inline-panel" hidden>${renderLandUse(data?data.landUse:null)}</div></div>`;
}
export const selectionKey=features=>features.map(f=>f.id).sort().join(',');
export function commonSiteRatios(features,contexts) {
  const result={far:null,bcr:null};
  if(!features.length)return result;
  for(const field of ['far','bcr']) {
    const values=features.map(f=>{const c=contexts.get(f.id);return c?.pnu===f.id?c.baseline?.[field]:null;});
    if(values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v===values[0]))result[field]=values[0];
  }
  return result;
}
export function syncSiteRatios(draft,features,contexts) {
  const key=selectionKey(features);
  if(draft.ratioSelectionKey!==key){draft.ratioSelectionKey=key;draft.ratioManual={};draft.fields.far='';draft.fields.bcr='';}
  const common=commonSiteRatios(features,contexts);
  for(const field of ['far','bcr'])if(!draft.ratioManual?.[field])draft.fields[field]=common[field]===null?'':String(common[field]);
  return common;
}
export function renderSiteContext(feature,data) {
  if(!data)return `<article class="site-context-parcel"><h3>${esc(feature.properties.address)}</h3><p class="case-note">필지 정보를 불러오고 있어요.</p></article>`;
  if(!['ready','partial'].includes(data.status))return `<article class="site-context-parcel"><h3>${esc(feature.properties.address)}</h3><p class="case-note">필지 정보를 불러오지 못했어요.</p><button class="outline" data-site="retry-context">다시 불러오기</button></article>`;
  const b=data.baseline,reason=b?.state||'',name=b?.zone||b?.originalZone;
  return `<article class="site-context-parcel"><h3>${esc(feature.properties.address)}</h3>
    <div class="site-zone-label">${esc(name||'용도지역 확인 필요')}${b?.downtown?'<span>서울도심</span>':''}</div>
    <dl class="site-ratio-pair"><div><dt>용적률 일반기준</dt><dd>${b?.far>0?esc(b.far)+'%':'확인 필요'}</dd></div><div><dt>건폐율 일반기준</dt><dd>${b?.bcr>0?esc(b.bcr)+'%':'확인 필요'}</dd></div></dl>
    ${reason.includes('복수용도지역')?'<p class="case-note">여러 용도지역에 걸쳐 있어 비율을 확인해야 해요.</p>':reason.includes('도심경계')?'<p class="case-note">서울도심 경계에 걸친 필지예요.</p>':''}
    ${renderInlineContext(data)}${renderIncludedProjects(data)}${renderLandUseCard(data)}${data.status==='partial'?'<button class="outline" data-site="retry-context">누락 자료 다시 불러오기</button>':''}</article>`;
}
