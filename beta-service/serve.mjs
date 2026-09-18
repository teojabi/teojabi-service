import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nearbyTransactions } from './market.mjs';
import { adaptDiscoRows } from './disco-adapter.mjs';
import { DISCO_CONTRACT } from './disco-contract.mjs';
import { browseCatalog, suggestCatalogChanges, validParcelGeometry, DOCUMENT_LINKS } from './catalog.mjs';
import { buildRiskReview, buildBuildingRecords, buildParcelContext } from './risk-policy.mjs';
import { normalizeSiteParcels } from './site-policy.mjs';
import { normalizeLandRecord } from './land-policy.mjs';
import { allowedReviewWrite, runCuration, readReviewBody } from './curation-api.mjs';
import { parseAssistant, buildResult, hasMeaningfulFilters } from './assistant-parse.mjs';
import { runAssistant } from './assistant-api.mjs';
import { selectedCatalog, validListingId } from './selected-catalog.mjs';
import { serviceConfig, allowedOrigin, authorizeCuration } from './server-access.mjs';
const service=serviceConfig();

const root = fileURLToPath(new URL('.', import.meta.url));
const cachePath=name=>process.env.TEOJABI_DATA_SOURCE==='supabase'&&/^\.local\/(selected-|curation-)/.test(name)?name.replace('.local/','.local/supabase/'):name;
const files = new Map([
  ['/api-client.mjs',['api-client.mjs','text/javascript']],
  ['/signup.mjs',['signup.mjs','text/javascript']],
  ['/runtime-config.mjs',['runtime-config.mjs','text/javascript']],
  ['/record-fields.mjs',['record-fields.mjs','text/javascript']],
  ['/mobile-preview.html',['mobile-preview.html','text/html']],
  ['/curation.html',['curation.html','text/html']],
  ['/curation.mjs',['curation.mjs','text/javascript']],
  ['/curation.css',['curation.css','text/css']],
  ['/admin-access.mjs',['admin-access.mjs','text/javascript']],
  ['/', ['index.html','text/html']], ['/index.html',['index.html','text/html']],
  ...['terms','privacy','paid-service','refund','business-info'].map(name=>[`/${name}.html`,[`${name}.html`,'text/html']]),
  ['/policy-pages.css',['policy-pages.css','text/css']],
  ['/styles.css',['styles.css','text/css']], ['/app.mjs',['app.mjs','text/javascript']],
  ['/theme.css',['theme.css','text/css']],['/theme.js',['theme.js','text/javascript']],
  ['/assets/logo.png',['assets/logo.png','image/png']],['/assets/favicon.ico',['assets/favicon.ico','image/x-icon']],
  ['/assets/symbol.webp',['assets/symbol.webp','image/webp']],
  ['/compare.mjs',['compare.mjs','text/javascript']], ['/member.mjs',['member.mjs','text/javascript']],
  ['/assistant.mjs',['assistant.mjs','text/javascript']],
  ['/policy.mjs',['policy.mjs','text/javascript']], ['/설계기준_v1.md',['설계기준_v1.md','text/plain']],
  ['/map-controller.mjs',['map-controller.mjs','text/javascript']],
  ['/explore.mjs',['explore.mjs','text/javascript']],
  ['/area-display.mjs',['area-display.mjs','text/javascript']],
  ['/search-options.mjs',['search-options.mjs','text/javascript']],
  ['/build-criteria.mjs',['build-criteria.mjs','text/javascript']],
  ['/criteria-ui.mjs',['criteria-ui.mjs','text/javascript']],
  ['/quick-filters.mjs',['quick-filters.mjs','text/javascript']],
  ['/recent-search.mjs',['recent-search.mjs','text/javascript']],
  ['/inline-context.mjs',['inline-context.mjs','text/javascript']],
  ['/building-records.mjs',['building-records.mjs','text/javascript']],
  ['/land-records.mjs',['land-records.mjs','text/javascript']],
  ['/land-policy.mjs',['land-policy.mjs','text/javascript']],
  ['/site-view.mjs',['site-view.mjs','text/javascript']],
  ['/site-export.mjs',['site-export.mjs','text/javascript']],
  ['/site-inputs.mjs',['site-inputs.mjs','text/javascript']],
  ['/site-context.mjs',['site-context.mjs','text/javascript']],
  ['/risk-policy.mjs',['risk-policy.mjs','text/javascript']],
]);
async function readOptionalJson(name) {
  try { return JSON.parse((await readFile(join(root, cachePath(name)), 'utf8')).replace(/^\uFEFF/,'')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const execute=promisify(execFile);
let catalogPromise, zoningPromise,developmentPromise,normalizedCatalogPromise;
let catalogVersion=0;
let registeredSnapshotCache=null;
let registeredSnapshotCachedAt=0;
let sourceSnapshotCache=null;
let sourceSnapshotCachedAt=0;
let curationRefreshQueue=Promise.resolve();
async function registeredSnapshot(){
  if(registeredSnapshotCache&&Date.now()-registeredSnapshotCachedAt<5000)return registeredSnapshotCache;
  registeredSnapshotCache=await readOptionalJson('.local/curation-registered.json');
  registeredSnapshotCachedAt=Date.now();
  return registeredSnapshotCache;
}
async function sourceSnapshot(){
  if(sourceSnapshotCache&&Date.now()-sourceSnapshotCachedAt<5000)return sourceSnapshotCache;
  sourceSnapshotCache=await readOptionalJson('.local/curation-sources.json');
  sourceSnapshotCachedAt=Date.now();
  return sourceSnapshotCache;
}
async function localRead(operation,value) {
  const {stdout}=await execute(process.env.TEOJABI_PYTHON || 'C:/Users/yoon/AppData/Local/Programs/Python/Python310/python.exe',
    [join(root,'local-reader.py'),operation,...(value?[value]:[])],{windowsHide:true,timeout:25000,maxBuffer:32*1024*1024,encoding:'utf8'});
  return JSON.parse(stdout);
}
// 비서가 찾은 일반 네이버 매물은 선별 카탈로그에 없다. DB에서 같은 id로 다시 구성해 상세·대장 조회에 쓴다.
async function naverListing(sourceId) {
  if(!/^\d{1,30}$/.test(String(sourceId||'')))return null;
  try {
    const raw=await localRead('naver-listing',String(sourceId));
    if(!raw||raw.status!=='ready')return null;
    return {id:`naver:${raw.sourceId}`,source:'naver',sourceId:raw.sourceId,district:raw.district||'',neighborhood:raw.neighborhood||'',
      address:raw.address||'',pnu:raw.pnu||null,position:raw.position||null,priceWon:raw.priceWon||null,
      areaM2:raw.areaM2||null,floorAreaM2:raw.floorAreaM2||null,description:raw.description||'',floorInfo:raw.floorInfo||'',
      zoning:{status:'missing',groups:[],entries:[]},development:null,kind:raw.kind||'building',kindConfirmed:true,
      areaSource:'listing',floorAreaSource:'listing',locationStatus:'pin-estimated',nearbyTransactions:{status:'unavailable',cases:[]}};
  } catch {return null;}
}
async function findListing(id) {
  const data=await catalog();
  return data.rows.find(row=>row.id===id)||await naverListing(String(id).split(':').slice(1).join(':'));
}
async function catalog() {
  const catalogFileVersion=await stat(join(root,cachePath('.local/selected-catalog.json'))).then(s=>s.mtimeMs).catch(error=>{if(error.code==='ENOENT')return 0;throw error;});
  const hiddenFileVersion=await stat(join(root,cachePath('.local/curation-hidden.json'))).then(s=>s.mtimeMs).catch(error=>{if(error.code==='ENOENT')return 0;throw error;});
  const version=catalogFileVersion+hiddenFileVersion;
  if(version!==catalogVersion){
    catalogVersion=version;
    catalogPromise=zoningPromise=developmentPromise=normalizedCatalogPromise=null;
    riskCache.clear();transactionCache.clear();
  }
  normalizedCatalogPromise??=loadCatalog().catch(error=>{normalizedCatalogPromise=null;throw error;});
  return normalizedCatalogPromise;
}
async function loadCatalog() {
  zoningPromise??=readOptionalJson('.local/selected-zoning.json').catch(error=>{zoningPromise=null;throw error;});
  developmentPromise??=readOptionalJson('.local/selected-development.json').catch(error=>{developmentPromise=null;throw error;});
  const [snapshot,zoning,development,hidden]=await Promise.all([readOptionalJson('.local/selected-catalog.json'),zoningPromise,developmentPromise,readOptionalJson('.local/curation-hidden.json')]);
  const hiddenIds=new Set(Array.isArray(hidden?.ids)?hidden.ids:[]);
  const filtered=snapshot&&Array.isArray(snapshot.rows)?{...snapshot,rows:snapshot.rows.filter(row=>!hiddenIds.has(row.id))}:snapshot;
  return selectedCatalog(filtered,zoning,development);
}
const parcelCache=new Map();
const riskCache=new Map();
const transactionCache=new Map();
let transactionVersion=0;
async function refreshTransactionVersion(){
  const version=await stat(join(root,'.local/disco-daily/data-version.json')).then(s=>s.mtimeMs).catch(error=>{if(error.code==='ENOENT')return 0;throw error;});
  if(version!==transactionVersion){transactionVersion=version;transactionCache.clear();}
}
function send(response,request,result,status=200) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(request.method==='HEAD'?undefined:JSON.stringify(result));
}
function staticHeaders(type,stats) {
  const etag=`W/"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
  return {
    etag,
    headers:{
      'Content-Type': `${type}; charset=utf-8`,
      'Content-Length': stats.size,
      'Cache-Control':'no-cache',
      'ETag':etag,
      'Last-Modified':stats.mtime.toUTCString(),
      'X-Content-Type-Options':'nosniff'
    }
  };
}
createServer(async (request, response) => {
  if (!service.hosts.includes(request.headers.host||'')) {response.writeHead(403).end();return;}
  if(service.production&&request.url?.startsWith('/api/')) {
    const origin=request.headers.origin;
    if(!allowedOrigin(origin,service)){response.writeHead(403).end();return;}
    if(origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Access-Control-Allow-Credentials','true');response.setHeader('Vary','Origin');}
    if(request.method==='OPTIONS'){response.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,OPTIONS');response.setHeader('Access-Control-Allow-Headers','Content-Type');response.writeHead(204).end();return;}
  }
  if (request.url?.split('?')[0]==='/api/curation') {
    const access=await authorizeCuration(request,service);
    if(access!==200){send(response,request,{status:'forbidden',message:access===401?'관리자로 로그인해 주세요.':'관리자 권한을 확인할 수 없습니다.'},access);return;}
    if (!['GET','HEAD','POST'].includes(request.method)) {send(response,request,{status:'invalid'},405);return;}
    if(request.method==='POST'&&!(service.production?/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']||''):allowedReviewWrite(request))){send(response,request,{status:'forbidden'},403);return;}
    let input;
    if(request.method==='POST') {
      try {input=await readReviewBody(request);} catch {send(response,request,{status:'invalid'},400);return;}
    }
    try {
      const params=new URL(request.url,'http://localhost').searchParams;
      if(request.method==='GET'&&params.get('mode')==='source-meta') {
        const snapshot=await sourceSnapshot();
        send(response,request,snapshot?.status==='ready'?{status:'ready',count:Array.isArray(snapshot.rows)?snapshot.rows.length:0,meta:snapshot.meta||{},cachedAt:snapshot.cachedAt}:{status:'missing',count:0});
        return;
      }
      const operation=request.method==='POST'?'update':params.get('mode')==='sources'?'sources':'list';
      if(request.method==='GET'&&operation==='list') {
        const snapshot=await registeredSnapshot();
        if(snapshot?.status==='ready') {send(response,request,{...snapshot,mode:'snapshot'});return;}
      }
      if(request.method==='GET'&&operation==='sources'&&params.get('refresh')!=='1') {
        const snapshot=await sourceSnapshot();
        if(snapshot?.status==='ready') {send(response,request,{...snapshot,mode:'snapshot'});return;}
      }
      const result=await runCuration(root,operation,input);
      if(request.method==='POST'&&result.status==='saved'&&(process.env.TEOJABI_DATA_SOURCE==='supabase')) {
        const python=process.env.TEOJABI_PYTHON;
        if(!python)throw new Error('Python not configured');
        curationRefreshQueue=curationRefreshQueue.catch(()=>{}).then(async()=>{
          for(const script of ['automation/assign_service_numbers.py','automation/prepare_selected_preview.py','refresh-zoning.py','refresh-development.py']) {
            await execute(python,['-X','utf8',join(root,script),...(script.startsWith('refresh-')?['--selected']:[])],{windowsHide:true,timeout:180000,maxBuffer:32*1024*1024,encoding:'utf8'});
          }
          catalogPromise=zoningPromise=developmentPromise=normalizedCatalogPromise=null;catalogVersion=0;
          registeredSnapshotCache=null;registeredSnapshotCachedAt=0;
        });
      }
      if(request.method==='POST'&&result.status==='refreshed'&&(process.env.TEOJABI_DATA_SOURCE==='supabase')) {
        const python=process.env.TEOJABI_PYTHON;if(!python)throw new Error('Python not configured');
        for(const script of ['automation/assign_service_numbers.py','automation/prepare_selected_preview.py','refresh-zoning.py','refresh-development.py'])await execute(python,['-X','utf8',join(root,script),...(script.startsWith('refresh-')?['--selected']:[])],{windowsHide:true,timeout:180000,maxBuffer:32*1024*1024,encoding:'utf8'});
        catalogPromise=zoningPromise=developmentPromise=normalizedCatalogPromise=null;catalogVersion=0;
      }
      if(request.method==='POST'&&result.status==='deleted') {
        catalogPromise=zoningPromise=developmentPromise=normalizedCatalogPromise=null;catalogVersion=0;
      }
      if(request.method==='POST'&&input?.action==='auto_select_200'&&result.status==='refreshed'&&process.env.TEOJABI_DATA_SOURCE!=='supabase') {
        await execute(process.env.TEOJABI_PYTHON || 'C:/Users/yoon/AppData/Local/Programs/Python/Python310/python.exe',
          ['-X','utf8',join(root,'automation/prepare_selected_preview.py')],{windowsHide:true,timeout:180000,maxBuffer:32*1024*1024,encoding:'utf8'});
        catalogPromise=zoningPromise=developmentPromise=normalizedCatalogPromise=null;catalogVersion=0;
      }
      if(request.method==='POST'){registeredSnapshotCache=null;registeredSnapshotCachedAt=0;sourceSnapshotCache=null;sourceSnapshotCachedAt=0;}
      if(operation==='sources'){sourceSnapshotCache=null;sourceSnapshotCachedAt=0;}
      send(response,request,result,result.status==='conflict'?409:result.status==='invalid'?400:200);
    } catch {send(response,request,{status:'error',message:'로컬 후보 테이블을 불러오지 못했습니다.'},503);}
    return;
  }
  if (request.url?.split('?')[0]==='/api/assistant') {
    if(request.method!=='POST'){send(response,request,{status:'invalid'},405);return;}
    let body;
    try{body=await readReviewBody(request);}catch{send(response,request,{status:'invalid'},400);return;}
    const message=String(body?.message||'').slice(0,500);
    const condition=body?.condition&&typeof body.condition==='object'?body.condition:null;
    const edited=body?.filters&&typeof body.filters==='object'?body.filters:null;
    try {
      const parsed=await parseAssistant(message,condition,process.env.GEMINI_API_KEY,edited);
      if(!hasMeaningfulFilters(parsed.filters)){
        send(response,request,{status:'ready',
          reply:parsed.unsupported?`죄송해요, ${parsed.unsupported} 정보는 아직 확인할 수 없어요. 예) "종로구 상업지역 100억 이하 도로 6m"처럼 알려주세요.`:'조건을 이해하지 못했어요. 예) "마포구 30억 이하 건물", "홍대입구역 도보 3분"처럼 알려주세요.',
          filters:parsed.filters,chips:[],total:0,groups:[],originTotals:{premium:0,registered:0,naver:0},station:null,districts:[],suggestions:[],relaxations:[],unsupported:parsed.unsupported||null,searchedAt:null});
        return;
      }
      const search=await runAssistant(root,parsed.filters);
      const result=buildResult(parsed.filters,search,parsed.unsupported);
      if(parsed.source==='spoken'&&parsed.conflicts?.length)result.conditionNote='저장하신 조건과 다른 부분이 있어 말씀하신 조건으로 찾았어요.';
      send(response,request,result);
    } catch {send(response,request,{status:'error'},503);}
    return;
  }
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (path==='/api/runtime') {
    try {
      const override=await readOptionalJson('.local/map-config.json');
      const oldConfig=service.production?'':await readFile(join(root,'../teojabi-service/frontend/js/config.js'),'utf8').catch(()=>'');
      const existing=oldConfig.match(/NAVER_MAP_CLIENT_ID\s*:\s*['"]([^'"]+)['"]/i)?.[1];
      const clientId=override?.clientId||process.env.NAVER_MAP_CLIENT_ID||existing||'';
      send(response,request,{clientId:/^[a-zA-Z0-9_-]{4,80}$/.test(clientId)&&!/YOUR|PLACEHOLDER/i.test(clientId)?clientId:'',authMode:override?.authMode==='legacy'?'legacy':'current',accountApiBase:process.env.DISCOVERY_API_BASE||''});
    } catch {send(response,request,{clientId:''});}
    return;
  }
  if (path==='/api/site-parcels') {
    const params=new URL(request.url,'http://localhost').searchParams;
    const query=params.has('pnu')?{pnu:params.get('pnu')}:params.has('address')?{address:params.get('address')}:
      params.has('lat')&&params.has('lng')?{lat:Number(params.get('lat')),lng:Number(params.get('lng'))}:null;
    if(!query){send(response,request,{status:'error'},400);return;}
    try {send(response,request,normalizeSiteParcels(await localRead('site-parcels',JSON.stringify(query))));}
    catch {send(response,request,{status:'error',features:[]},503);}
    return;
  }
  if(path.startsWith('/api/parcel-context/')) {
    const pnu=path.slice('/api/parcel-context/'.length),key=`parcel:${pnu}`;
    if(!/^11\d{17}$/.test(pnu)){send(response,request,{status:'error'},400);return;}
    try {
      if(!riskCache.has(key)) {
        const promise=localRead('parcel-context',pnu).then(raw=>buildParcelContext(pnu,raw));
        riskCache.set(key,promise);if(riskCache.size>100)riskCache.delete(riskCache.keys().next().value);
      }
      const result=await riskCache.get(key);
      if(result.status!=='ready')riskCache.delete(key);
      send(response,request,result,result.status==='error'?503:200);
    } catch {riskCache.delete(key);send(response,request,{status:'error'},503);}
    return;
  }
  if(path.startsWith('/api/parcel-documents/')) {
    const pnu=path.slice('/api/parcel-documents/'.length),key=`parcel-documents:${pnu}`;
    if(!/^11\d{17}$/.test(pnu)){send(response,request,{status:'error'},400);return;}
    try {
      if(!riskCache.has(key)) {
        if(riskCache.size>=100)riskCache.delete(riskCache.keys().next().value);
        riskCache.set(key,localRead('parcel-documents',pnu).catch(error=>{riskCache.delete(key);throw error;}));
      }
      const raw=await riskCache.get(key);
      const listing={id:pnu,sourceId:pnu,pnu,address:raw.address};
      const result={status:'ready',pnu,address:raw.address,
        building:buildBuildingRecords(listing,raw.registers),
        land:normalizeLandRecord({...listing,areaM2:null},raw.land),
        registry:{status:'external',url:DOCUMENT_LINKS.registry}};
      if(result.building.status==='error'||result.land.status==='error')riskCache.delete(key);
      send(response,request,result,result.building.status==='error'&&result.land.status==='error'?503:200);
    } catch {riskCache.delete(key);send(response,request,{status:'error'},503);}
    return;
  }
  if (path.startsWith('/api/risk/') || path.startsWith('/api/site-context/') || path.startsWith('/api/building-records/') || path.startsWith('/api/land-record/')) {
    const compact=path.startsWith('/api/site-context/');
    const registers=path.startsWith('/api/building-records/');
    const land=path.startsWith('/api/land-record/');
    const operation=land?'land-record':registers?'registers':compact?'context':'risk';
    const id=path.slice(land?'/api/land-record/'.length:registers?'/api/building-records/'.length:compact?'/api/site-context/'.length:'/api/risk/'.length),cacheKey=`${operation}:${id}`;
    if(!validListingId(id)){send(response,request,{status:'missing'},404);return;}
    try {
      const data=await catalog(),listing=await findListing(id);
      if(!listing){send(response,request,{status:'missing'},404);return;}
      if(!riskCache.has(cacheKey)) {
        if(riskCache.size>=100)riskCache.delete(riskCache.keys().next().value);
        riskCache.set(cacheKey,localRead('selected-'+operation,JSON.stringify({sourceId:listing.sourceId,pnu:listing.pnu,address:listing.address})).catch(error=>{riskCache.delete(cacheKey);throw error;}));
      }
      const result=(land?normalizeLandRecord:registers?buildBuildingRecords:buildRiskReview)(listing,await riskCache.get(cacheKey));
      if(!['ready','missing','invalid-area'].includes(result.status)||result.road?.status==='error')riskCache.delete(cacheKey);
      send(response,request,compact&&result.status!=='error'?{status:result.road.status==='error'?'partial':result.status,zones:result.zones,road:result.road}:result,result.status==='error'?503:200);
    } catch {send(response,request,{status:'error',message:'신축 검토 자료를 불러오지 못했습니다.'},503);}
    return;
  }
  if(path.startsWith('/api/nearby-transactions/')) {
    await refreshTransactionVersion().catch(()=>{});
    const id=path.slice('/api/nearby-transactions/'.length);
    if(!validListingId(id)){send(response,request,{status:'missing',cases:[]},404);return;}
    try {
      const data=await catalog(),listing=await findListing(id);
      if(!listing){send(response,request,{status:'missing',cases:[]},404);return;}
      if(!transactionCache.has(id)) {
        if(transactionCache.size>=100)transactionCache.delete(transactionCache.keys().next().value);
        transactionCache.set(id,localRead('nearby-transactions',JSON.stringify(listing.position)).then(raw=>{
          if(raw.status!=='ready')throw new Error('Nearby data unavailable');
          return raw.rows;
        }).catch(error=>{transactionCache.delete(id);throw error;}));
      }
      const adapted=adaptDiscoRows(await transactionCache.get(id),listing,listing.position,DISCO_CONTRACT);
      const result=nearbyTransactions(listing,adapted.records,adapted.context,{matchKind:false,onePerParcel:true});
      for(const item of result.cases)item.address=data.rows.find(row=>row.pnu===item.pnu&&row.address)?.address||null;
      send(response,request,{...result,listingId:id});
    } catch {send(response,request,{status:'error',cases:[]},503);}
    return;
  }
  if (path==='/api/catalog' || path.startsWith('/api/listings/') || path.startsWith('/api/parcels/')) {
    try {
      const data=await catalog();
      if (path==='/api/catalog') {
        const query=new URL(request.url,'http://localhost').searchParams,current=browseCatalog(data,query);
        send(response,request,{...current,suggestions:suggestCatalogChanges(data,query,current)});
      }
      else if (path.startsWith('/api/listings/')) {
        const id=path.slice('/api/listings/'.length);
        const listing=data.rows.find(row=>row.id===id)||await naverListing(String(id).split(':').slice(1).join(':'));
        send(response,request,listing?{status:'ready',mode:'local-snapshot',listing,observedAt:data.observedAt,
          documents:{building:{status:'stored-records',delivery:'in-site'},land:{status:'stored-records',delivery:'in-site'},registry:{status:'external',url:DOCUMENT_LINKS.registry}}}:{status:'missing'},listing?200:404);
      } else {
        const pnu=path.slice('/api/parcels/'.length);
        if (!/^\d{19}$/.test(pnu) || !data.rows.some(row=>row.pnu===pnu)) {send(response,request,{status:'missing'},404);return;}
        if (!parcelCache.has(pnu)) {
          const result=await localRead('parcel',pnu);
          if (result.status==='ready' && !validParcelGeometry(result.geometry)) {send(response,request,{status:'invalid'});return;}
          if (parcelCache.size>=200) parcelCache.delete(parcelCache.keys().next().value);
          parcelCache.set(pnu,result);
        }
        send(response,request,parcelCache.get(pnu));
      }
    } catch {send(response,request,{status:'error',message:'로컬 매물 자료를 불러오지 못했습니다.'},503);}
    return;
  }
  if (path === '/api/activity' || path === '/api/recommendations') {
    try {
      let result;
      if (path === '/api/activity') {
        const data=await catalog();
        const total=browseCatalog(data,new URLSearchParams()).totalParcels;
        const inventory=await readOptionalJson('.local/inventory-summary.json');
        const discoActivity=await readOptionalJson('.local/disco-daily/activity.json');
        const tradeUpdatedAt=discoActivity?.runs?.[0]?.completedAt||inventory?.transactionsUpdatedAt||null;
        result={mode:'inventory',listingTotal:total,observedAt:inventory?.observedAt,items:[
          {label:'매물',value:total,unit:'개',updatedAt:data.observedAt||null,note:'현재 검색 가능한 매물 · 선별 구성 갱신일'},
          {label:'실거래',value:inventory?.transactions??null,unit:'건',updatedAt:tradeUpdatedAt,note:'보유한 실거래 자료'},
          {label:'건축물대장',value:inventory?.buildings??null,unit:'건',updatedAt:inventory?.buildingsUpdatedAt||null,note:'표제부·총괄표제부 보유 기록 합계'}
        ]};
      } else {
        const query = new URL(request.url, 'http://localhost').searchParams;
        const data=await catalog(),current=browseCatalog(data,query);
        result={...current,suggestions:suggestCatalogChanges(data,query,current)};
      }
      response.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(result));
    } catch {
      response.writeHead(503, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status:'error', message:'데이터를 불러오지 못했습니다.' }));
    }
    return;
  }
  const file = files.get(path);
  if (!file) { response.writeHead(404).end('Not found'); return; }
  try {
    const fullPath=join(root,file[0]);
    const stats=await stat(fullPath);
    const {etag,headers}=staticHeaders(file[1],stats);
    if(request.headers['if-none-match']===etag){
      response.writeHead(304,headers);
      response.end();
      return;
    }
    const body = await readFile(fullPath);
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500).end('Preview unavailable'); }
}).listen(Number(process.env.TEOJABI_PORT||4173), '127.0.0.1', () => process.stdout.write('Teojabi data service ready\n'));
