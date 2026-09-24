// Exact source code/name pairs. Other districts, adjacency and proposed plans are not zoning matches.
const classes=Object.freeze({
  UQA100:['주거지역','주거지역'],UQA110:['전용주거지역','주거지역'],
  UQA111:['제1종전용주거지역','주거지역'],UQA112:['제2종전용주거지역','주거지역'],
  UQA120:['일반주거지역','주거지역'],UQA121:['제1종일반주거지역','주거지역'],
  UQA122:['제2종일반주거지역','주거지역'],UQA123:['제3종일반주거지역','주거지역'],
  UQA124:['제2종일반주거지역','주거지역'],UQA130:['준주거지역','주거지역'],
  UQA200:['상업지역','상업지역'],UQA210:['중심상업지역','상업지역'],
  UQA220:['일반상업지역','상업지역'],UQA230:['근린상업지역','상업지역'],UQA240:['유통상업지역','상업지역'],
  UQA300:['공업지역','공업지역'],UQA310:['전용공업지역','공업지역'],
  UQA320:['일반공업지역','공업지역'],UQA330:['준공업지역','공업지역'],
  UQA400:['녹지지역','녹지지역'],UQA410:['보전녹지지역','녹지지역'],
  UQA420:['생산녹지지역','녹지지역'],UQA430:['자연녹지지역','녹지지역'],
});
export function buildZoningIndex(snapshot) {
  const index=new Map();
  if(snapshot?.source==='master_land'&&Array.isArray(snapshot.rows)) {
    for(const row of snapshot.rows) {
      if(!/^11\d{17}$/.test(row.pnu||''))continue;
      const name=String(row.name||'').replace(/\s+/g,'').replace(/\((?:7|12)층(?:이하)?\)$/,'');
      const match=Object.values(classes).find(item=>item[0]===name);
      if(!match)continue;
      index.set(row.pnu,{status:'matched',source:'master_land',sourceDate:null,groups:[match[1]],entries:[{name:row.name,group:match[1],relation:'마스터 기록'}]});
    }
    return {available:true,index,observedAt:snapshot.observedAt};
  }
  if(snapshot?.source!=='staging_land_use_plan'||!Array.isArray(snapshot.rows))return {available:false,index};
  const byPnu=new Map();
  for(const row of snapshot.rows) {
    if(!/^11\d{17}$/.test(row.pnu||'')||!/^\d{4}-\d{2}-\d{2}$/.test(row.sourceDate||''))continue;
    const previous=byPnu.get(row.pnu);
    if(!previous||row.sourceDate>previous.date)byPnu.set(row.pnu,{date:row.sourceDate,rows:[row]});
    else if(row.sourceDate===previous.date)previous.rows.push(row);
  }
  for(const [pnu,{date,rows}] of byPnu) {
    const matched=new Map();let conflict=false;
    for(const row of rows) {
      const definition=classes[row.code];
      if(!definition)continue;
      if(row.relationCode==='3'&&row.relation==='접함')continue;
      const relation={'1':'포함','2':'저촉'}[row.relationCode];
      if(!relation||relation!==row.relation){conflict=true;continue;}
      const clean=String(row.name||'').replace(/\s+/g,'').replace(/\((?:7|12)층(?:이하)?\)$/,'');
      if(clean!==definition[0]){conflict=true;continue;}
      matched.set(`${row.code}:${relation}`,{name:row.name,group:definition[1],relation});
    }
    const entries=conflict?[]:[...matched.values()];
    index.set(pnu,{status:conflict?'conflict':entries.length?'matched':'missing',
      source:snapshot.source,sourceDate:date,groups:[...new Set(entries.map(e=>e.group))],entries});
  }
  return {available:true,index,observedAt:snapshot.observedAt};
}
