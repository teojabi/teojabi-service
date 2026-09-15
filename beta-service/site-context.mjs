import { renderInlineContext } from './inline-context.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    ${renderInlineContext(data)}${data.status==='partial'?'<button class="outline" data-site="retry-context">누락 자료 다시 불러오기</button>':''}</article>`;
}
