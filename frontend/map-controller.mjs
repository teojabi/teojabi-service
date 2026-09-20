import { apiFetch } from './api-client.mjs';
import { formatArea } from './area-display.mjs';
let sdkPromise,authError;
export function loadNaverMaps() {
  if(authError)return Promise.reject(new Error(authError));
  if (window.naver?.maps?.Map) return Promise.resolve(window.naver.maps);
  if (sdkPromise) return sdkPromise;
  sdkPromise=new Promise(async(resolve,reject)=>{
    let timer, script;
    const fail=message=>{clearTimeout(timer);script?.remove();sdkPromise=null;reject(new Error(message));};
    try {
      const response=await apiFetch('/api/runtime');
      const config=await response.json();
      if (!config.clientId) {fail('네이버 지도 키를 연결하면 지도를 볼 수 있어요.');return;}
      window.navermap_authFailure=()=>{
        authError='네이버 지도 인증을 확인해야 해요. 지도 키와 허용 주소 설정 후 새로고침해 주세요.';
        window.dispatchEvent(new CustomEvent('teojabi-map-auth-error',{detail:authError}));
        fail(authError);
      };
      window.teojabiMapReady=()=>{
        if(!window.naver?.maps?.Map){fail('네이버 지도 키의 사용 권한과 허용 주소를 확인해야 합니다.');return;}
        clearTimeout(timer);resolve(window.naver.maps);
      };
      script=document.createElement('script');
      const parameter=config.authMode==='legacy'?'ncpClientId':'ncpKeyId';
      const host=config.authMode==='legacy'?'openapi.map.naver.com':'oapi.map.naver.com';
      script.src=`https://${host}/openapi/v3/maps.js?${parameter}=${encodeURIComponent(config.clientId)}&submodules=panorama&callback=teojabiMapReady`;
      script.onerror=()=>fail('지도를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
      timer=setTimeout(()=>fail('지도 응답이 늦어지고 있어요. 다시 시도해 주세요.'),12000);
      document.head.append(script);
    } catch {fail('지도 설정을 불러오지 못했어요.');}
  });
  return sdkPromise;
}
export async function openStreetView(position,label) {
  const previousFocus=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className='street-dialog';
  dialog.setAttribute('aria-label','네이버 거리뷰');
  dialog.innerHTML='<div class="street-head"><div><span class="eyebrow">NAVER STREET VIEW</span><h2>네이버 거리뷰</h2></div><button class="detail-close" aria-label="거리뷰 닫기">×</button></div><p class="street-location"></p><div class="street-stage"><div class="street-canvas"></div><div class="street-map-panel"><div class="street-map" role="region" aria-label="거리뷰 촬영 위치와 보는 방향 지도"></div><div class="street-map-legend"><span>● 현재 촬영 위치 · 부채꼴은 보는 방향</span><span>◆ 매물 위치</span><button type="button" class="street-recenter">현재 위치로</button></div></div></div><p class="street-state" role="status">가까운 거리뷰를 찾고 있어요.</p><p class="street-note">매물 핀 주변의 촬영 지점입니다. 해당 건물의 정면이나 현재 모습과 다를 수 있어요.</p>';
  dialog.querySelector('.street-location').textContent=label;
  document.body.append(dialog);dialog.showModal();
  let n,pano,miniMap,cameraMarker,propertyMarker,timer,observer,closed=false;const listeners=[];
  const showError=message=>{if(closed)return;dialog.classList.add('unavailable');dialog.querySelector('.street-state').textContent=message;};
  const onAuthFailure=event=>showError(event.detail);
  window.addEventListener('teojabi-map-auth-error',onAuthFailure);
  const cleanup=()=>{
    if(closed)return;closed=true;clearTimeout(timer);observer?.disconnect();
    window.removeEventListener('teojabi-map-auth-error',onAuthFailure);
    for(const listener of listeners){try {n?.Event.removeListener(listener);} catch { /* Failed SDK authentication. */ }}
    cameraMarker?.setMap(null);propertyMarker?.setMap(null);
    try {pano?.destroy?.();miniMap?.destroy();} catch { /* Partial SDK initialization. */ }
    dialog.remove();if(previousFocus?.isConnected)previousFocus.focus();
  };
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',cleanup,{once:true});
  try {
    n=await loadNaverMaps();if(closed)return cleanup;
    if(!n.Panorama)throw new Error('거리뷰 모듈을 불러오지 못했어요. 페이지를 새로고침해 주세요.');
    pano=new n.Panorama(dialog.querySelector('.street-canvas'),{position:new n.LatLng(position.lat,position.lng),pov:{pan:0,tilt:0,fov:100}});
    const point=new n.LatLng(position.lat,position.lng);
    const mapHost=dialog.querySelector('.street-map');
    miniMap=new n.Map(mapHost,{center:point,zoom:18,zoomControl:true,scrollWheel:false});
    propertyMarker=new n.Marker({map:miniMap,position:point,zIndex:1,icon:{content:'<span class="street-property-pin" title="매물 위치">◆</span>',anchor:new n.Point(12,12)}});
    const camera=document.createElement('div');camera.className='street-camera-pin';camera.setAttribute('role','img');
    camera.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true"><path class="street-camera-cone" d="M50 50 L18 12 A50 50 0 0 1 82 12 Z"/><path class="street-camera-arrow" d="M50 32 L43 46 L57 46 Z"/><circle cx="50" cy="50" r="7"/></svg>';
    cameraMarker=new n.Marker({position:point,zIndex:10,icon:{content:camera,anchor:new n.Point(50,50)}});
    let cameraPosition=null,initialDirectionSet=false;
    const facePropertyInitially=()=>{
      if(closed||initialDirectionSet||!pano.getPanoId())return;
      const look=pano.getProjection()?.fromCoordToPov(point);
      if(!Number.isFinite(look?.pan))return;
      initialDirectionSet=true;
      pano.setPov({...pano.getPov(),pan:look.pan,tilt:0});
    };
    const syncCamera=(follow=false)=>{
      if(closed||!pano.getPanoId())return;
      const actual=pano.getLocation()?.coord||pano.getPosition(),pov=pano.getPov();
      if(!actual||!Number.isFinite(actual.lat())||!Number.isFinite(actual.lng()))return;
      cameraPosition=actual;cameraMarker.setPosition(actual);cameraMarker.setMap(miniMap);
      const heading=((Number(pov?.pan)||0)%360+360)%360;
      camera.querySelector('svg').style.transform=`rotate(${heading}deg)`;
      camera.setAttribute('aria-label',`현재 촬영 위치 · 북쪽 기준 ${Math.round(heading)}도 방향`);
      camera.dataset.heading=String(heading);camera.dataset.lat=String(actual.lat());camera.dataset.lng=String(actual.lng());
      if(follow)miniMap.setCenter(actual);
    };
    dialog.querySelector('.street-recenter').addEventListener('click',()=>{if(cameraPosition)miniMap.setCenter(cameraPosition);});
    for(const event of ['init','pano_changed'])listeners.push(n.Event.addListener(pano,event,()=>{facePropertyInitially();syncCamera(true);}));
    listeners.push(n.Event.addListener(pano,'pov_changed',()=>syncCamera(false)));
    const stage=dialog.querySelector('.street-canvas');
    let lastWidth=0,lastHeight=0;
    observer=new ResizeObserver(()=>{
      const width=stage.clientWidth,height=stage.clientHeight;
      if(!closed&&width&&(width!==lastWidth||height!==lastHeight)){
        lastWidth=width;lastHeight=height;pano.setSize(new n.Size(width,height));
        miniMap.setSize(new n.Size(mapHost.clientWidth,mapHost.clientHeight));
        if(cameraPosition)miniMap.setCenter(cameraPosition);
      }
    });
    observer.observe(stage);
    const status=dialog.querySelector('.street-state');
    listeners.push(n.Event.addListener(pano,'pano_status',value=>{
      clearTimeout(timer);
      if(value==='OK'){dialog.classList.remove('unavailable');status.textContent='거리뷰를 이동하거나 돌리면 지도 위치와 보는 방향도 함께 바뀌어요.';syncCamera(true);}
      else showError('이 위치에서 제공되는 거리뷰를 찾지 못했어요.');
    }));
    timer=setTimeout(()=>{if(!closed)status.textContent='거리뷰 응답이 늦거나 제공 지점이 없습니다. 닫은 뒤 다시 시도해 주세요.';},12000);
  } catch(error) {showError(error.message);}
  return cleanup;
}
const formatPrice=won=>won>0?`${(won/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2})}억`:'가격 확인 중';
export const markerArea=(m2,unit='m2')=>Number.isFinite(m2)&&m2>0?formatArea(m2,unit):'면적 미기재';
export function transactionLabelOffsets(points,occupied,width,height) {
  const boxes=[...occupied],overlap=(a,b)=>Math.max(0,Math.min(a.x+72,b.x+72)-Math.max(a.x,b.x)+8)*Math.max(0,Math.min(a.y+72,b.y+72)-Math.max(a.y,b.y)+8);
  return points.map(point=>{
    if(point.x<0||point.x>width||point.y<0||point.y>height)return {x:0,y:-32};
    let best;
    for(const dy of [-40,-110,45,115,-180,185])for(const dx of [0,-85,85,-165,165]) {
      const cx=Math.max(80,Math.min(width-80,point.x+dx)),cy=Math.max(112,Math.min(height-70,point.y+dy));
      const box={x:cx-36,y:cy-36},score=boxes.reduce((sum,b)=>sum+overlap(box,b)*10000,0)+Math.hypot(cx-point.x,cy-point.y);
      if(!best||score<best.score)best={box,score,offset:{x:cx-point.x,y:cy-point.y}};
    }
    boxes.push(best.box);return best.offset;
  });
}
export class ListingMap {
  constructor(container,{onSelect,onTransaction,onCommercial,onMapClick,onMove,onStatus,center,zoom,areaUnit='m2'}={}) {
    this.areaUnit=areaUnit==='pyeong'?'pyeong':'m2';
    this.container=container;this.onSelect=onSelect;this.onMove=onMove;this.onStatus=onStatus;this.onMapClick=onMapClick;
    this.onTransaction=onTransaction;this.onCommercial=onCommercial;this.transactionMarkers=[];this.transactions=[];this.transactionsVisible=true;
    this.commercialMarkers=[];this.commercialAreas=[];this.commercialVisible=false;
    this.center=center;this.zoom=zoom;this.markers=[];this.listeners=[];this.dead=false;this.selected=null;
    this.onAuthFailure=event=>{this.ready=false;this.onStatus?.('error',event.detail);};
    window.addEventListener('teojabi-map-auth-error',this.onAuthFailure);
  }
  async mount(groups,selected,fit=true) {
    try {
      const n=await loadNaverMaps();
      if (this.dead || !this.container.isConnected) return;
      this.n=n;
      this.map=new n.Map(this.container,{center:new n.LatLng(this.center?.lat||37.5665,this.center?.lng||126.978),zoom:this.zoom||12,
        minZoom:9,maxZoom:20,zoomControl:false,mapDataControl:false,scaleControl:true});
      if(authError)throw new Error(authError);
      this.ready=true;
      this.listeners.push(n.Event.addListener(this.map,'idle',()=>{this.layoutTransactions();this.onMove?.(this.view());}));
      this.listeners.push(n.Event.addListener(this.map,'click',()=>this.onMapClick?.()));
      this.map.data.setStyle({fillColor:'#93c5fd',fillOpacity:.35,strokeColor:'#2563eb',strokeWeight:3});
      this.resizeObserver=new ResizeObserver(()=>{if(this.ready && !this.dead && this.container.clientWidth)n.Event.trigger(this.map,'resize');});
      this.resizeObserver.observe(this.container);
      this.setGroups(groups,selected,fit);
      if(authError)throw new Error(authError);
      this.ready=true;this.onStatus?.('ready');
    } catch(error) {if(!this.dead){this.ready=false;this.onStatus?.('error',error.message);}}
  }
  icon(item,active,count,top=false) {
    const element=document.createElement('button');
    element.type='button';element.className=`map-price${active?' active':''}`;
    const price=document.createElement('strong'),area=document.createElement('span'),badge=document.createElement('span');
    price.className='map-pin-price';area.className='map-pin-area';
    badge.className='map-pin-badge';badge.textContent='⭐';badge.setAttribute('aria-hidden','true');
    element.title=item.cohort==='existing'?'터잡이 추천':item.cohort==='disco'?'디스코 매물':'선별매물';
    price.textContent=formatPrice(item.priceWon);area.textContent=markerArea(item.areaM2,this.areaUnit);
    if(item.cohort==='existing')element.append(badge);
    element.append(price,area);
    element.setAttribute('aria-label',`${item.cohort==='existing'?'터잡이 추천':item.cohort==='disco'?'디스코 매물':'선별매물'} ${item.district} ${item.neighborhood||''} 매물 ${formatPrice(item.priceWon)}, ${area.textContent}, 상세 보기`);
    return {content:element,anchor:new this.n.Point(0,5)};
  }
  transactionIcon(item,index,offset={x:0,y:-40}) {
    const element=document.createElement('button'),price=document.createElement('strong'),area=document.createElement('span');
    element.type='button';element.className='map-price transaction-pin';
    price.className='map-pin-price';area.className='map-pin-area';
    element.title=`실거래가 ${index+1}`;
    price.textContent=formatPrice(item.priceWon);area.textContent=markerArea(item.areaM2,this.areaUnit);
    element.append(price,area);element.setAttribute('aria-label',`실거래 ${index+1} · ${price.textContent}, ${area.textContent}, ${item.dealDate}, 거래 내용 보기`);
    const wrapper=document.createElement('div'),line=document.createElement('span'),dot=document.createElement('span');
    wrapper.className='transaction-marker';line.className='transaction-connector';dot.className='transaction-dot';
    element.style.left=`${offset.x}px`;element.style.top=`${offset.y}px`;
    line.style.width=`${Math.hypot(offset.x,offset.y)}px`;line.style.transform=`rotate(${Math.atan2(offset.y,offset.x)}rad)`;
    line.setAttribute('aria-hidden','true');dot.setAttribute('aria-hidden','true');wrapper.append(line,dot,element);
    return {content:wrapper,anchor:new this.n.Point(0,0)};
  }
  setAreaUnit(unit) {
    this.areaUnit=unit==='pyeong'?'pyeong':'m2';
    if(!this.ready)return;
    this.markers.forEach(({marker,group,top})=>{
      const active=group.listings.some(row=>row.id===this.selected);
      marker.setIcon(this.icon(active&&this.selectedItem?this.selectedItem:group.representative,active,group.listings.length,top));
    });
    if(this.extraMarker&&this.selectedItem)this.extraMarker.setIcon(this.icon(this.selectedItem,true,1));
    this.layoutTransactions();
  }
  setTransactions(cases) {
    this.transactions=cases||[];
    for(const {marker} of this.transactionMarkers){this.n.Event.clearInstanceListeners(marker);marker.setMap(null);}
    this.transactionMarkers=[];
    if(!this.map||!this.ready)return;
    for(const [index,item] of this.transactions.entries()) {
      if(!Number.isFinite(item.position?.lat)||!Number.isFinite(item.position?.lng))continue;
      const marker=new this.n.Marker({map:this.transactionsVisible?this.map:null,position:new this.n.LatLng(item.position.lat,item.position.lng),icon:this.transactionIcon(item,index),zIndex:30});
      this.n.Event.addListener(marker,'click',()=>this.onTransaction?.(item.id));
      this.transactionMarkers.push({marker,item});
    }
    this.layoutTransactions();
  }
  layoutTransactions() {
    if(!this.ready||!this.transactionMarkers.length||!this.map.getProjection)return;
    const projection=this.map.getProjection(),point=item=>projection.fromCoordToOffset(new this.n.LatLng(item.position.lat,item.position.lng));
    const width=this.container.clientWidth,height=this.container.clientHeight;
    if(width<160||height<240)return;
    const obstacles=this.visible===false?[]:this.markers.map(({group})=>group.representative);
    if(this.visible!==false&&this.selectedItem)obstacles.push(this.selectedItem);
    const occupied=obstacles.filter(item=>item.position).map(item=>{const p=point(item);return {x:p.x-36,y:p.y-77};});
    const offsets=transactionLabelOffsets(this.transactionMarkers.map(({item})=>point(item)),occupied,width,height);
    this.transactionMarkers.forEach(({marker,item},index)=>marker.setIcon(this.transactionIcon(item,index,offsets[index])));
  }
  setTransactionsVisible(value) {
    this.transactionsVisible=Boolean(value);
    for(const {marker} of this.transactionMarkers)marker.setMap(this.transactionsVisible?this.map:null);
    if(this.transactionsVisible)this.fitTransactions();
  }
  commercialIcon(area) {
    const element=document.createElement('button');
    element.type='button';element.className='map-radar';
    const sales=Number(area.monthlySalesWon)||0;
    const size=Math.round(Math.max(24,Math.min(48,24+Math.log10(sales+1)*3)));
    element.style.width=`${size}px`;element.style.height=`${size}px`;
    element.innerHTML='<i class="map-radar-ring r1"></i><i class="map-radar-ring r2"></i><i class="map-radar-ring r3"></i><i class="map-radar-core"></i>';
    element.title=`${area.name}${area.type?` (${area.type})`:''}`;
    element.setAttribute('aria-label',`상권 ${area.name} ${area.type||''}, 정보 보기`);
    return {content:element,anchor:new this.n.Point(size/2,size/2)};
  }
  setCommercialAreas(areas) {
    this.commercialAreas=areas||[];
    for(const {marker} of this.commercialMarkers){this.n.Event.clearInstanceListeners(marker);marker.setMap(null);}
    this.commercialMarkers=[];
    if(!this.map||!this.ready)return;
    for(const area of this.commercialAreas) {
      if(!Number.isFinite(area.lat)||!Number.isFinite(area.lng))continue;
      const marker=new this.n.Marker({map:this.commercialVisible?this.map:null,position:new this.n.LatLng(area.lat,area.lng),icon:this.commercialIcon(area),zIndex:0});
      this.n.Event.addListener(marker,'click',()=>this.onCommercial?.(area));
      this.commercialMarkers.push({marker,area});
    }
  }
  setCommercialVisible(value) {
    this.commercialVisible=Boolean(value);
    for(const {marker} of this.commercialMarkers)marker.setMap(this.commercialVisible?this.map:null);
  }
  fitTransactions() {
    if(!this.ready||!this.transactionsVisible||!this.transactionMarkers.length||!this.selectedItem?.position)return false;
    const bounds=new this.n.LatLngBounds(),position=this.selectedItem.position;
    bounds.extend(new this.n.LatLng(position.lat,position.lng));
    for(const {item} of this.transactionMarkers)bounds.extend(new this.n.LatLng(item.position.lat,item.position.lng));
    this.map.fitBounds(bounds,{top:140,right:100,bottom:100,left:100});return true;
  }
  focusTransaction(id) {
    const found=this.transactionMarkers.find(entry=>entry.item.id===id);
    if(!this.ready||!found)return;
    this.map.setCenter(new this.n.LatLng(found.item.position.lat,found.item.position.lng));
    for(const entry of this.transactionMarkers)entry.marker.setZIndex(entry===found?110:30);
  }
  setGroups(groups,selected,fit=true) {
    if(!this.map||!this.ready)return;
    this.markers.forEach(entry=>{this.n.Event.clearInstanceListeners(entry.marker);entry.marker.setMap(null);});
    this.markers=[];this.groups=groups;this.selected=selected;
    const bounds=new this.n.LatLngBounds();
    for(const [index,group] of groups.entries()) {
      const item=group.representative;
      if(!item.position)continue;
      const point=new this.n.LatLng(item.position.lat,item.position.lng);
      bounds.extend(point);
      const active=group.listings.some(row=>row.id===selected);
      const marker=new this.n.Marker({map:this.visible===false?null:this.map,position:point,icon:this.icon(item,active,group.listings.length,index<5),zIndex:active?100:1});
      this.n.Event.addListener(marker,'click',()=>this.onSelect?.(item.id));
      this.markers.push({marker,group,top:index<5});
    }
    if(this.selectedItem?.id===selected)this.select(this.selectedItem,{pan:false});
    if(fit && this.markers.length) {
      if(this.markers.length===1) {this.map.setCenter(bounds.getCenter());this.map.setZoom(16);}
      else this.map.fitBounds(bounds,{top:65,right:70,bottom:70,left:70});
    }
  }
  select(item,{pan=true}={}) {
    if(item?.id!==this.selectedItem?.id)this.setTransactions([]);
    this.selectedItem=item;
    if(!this.map||!this.ready)return;
    if(this.extraMarker){this.n.Event.clearInstanceListeners(this.extraMarker);this.extraMarker.setMap(null);this.extraMarker=null;}
    this.selected=item?.id;
    let found=false;
    for(const {marker,group,top} of this.markers) {
      const active=group.listings.some(row=>row.id===item?.id);
      found ||= active;
      marker.setIcon(this.icon(active?item:group.representative,active,group.listings.length,top));marker.setZIndex(active?100:1);
    }
    if(item?.position) {
      const point=new this.n.LatLng(item.position.lat,item.position.lng);
      if(!found)this.extraMarker=new this.n.Marker({map:this.visible===false?null:this.map,position:point,icon:this.icon(item,true,1),zIndex:100});
      if(pan){this.map.setCenter(point);if(this.map.getZoom()<17)this.map.setZoom(17);}
    }
  }
  parcel(geometry) {
    if(!this.map||!this.ready)return;
    this.map.data.forEach(feature=>this.map.data.removeFeature(feature));
    if(geometry) {
      this.map.data.addGeoJson({type:'Feature',properties:{},geometry});
      const bounds=new this.n.LatLngBounds();
      const rings=geometry.type==='MultiPolygon'?geometry.coordinates.flat():geometry.coordinates;
      for(const ring of rings)for(const point of ring)bounds.extend(new this.n.LatLng(point[1],point[0]));
      if(!this.fitTransactions())this.map.fitBounds(bounds,{top:110,right:90,bottom:90,left:90});
    }
  }
  resetView() {if(!this.fitTransactions())this.setGroups(this.groups||[],this.selected,true);}
  toggleCadastral(){if(!this.ready)return false;this.cadastralLayer??=new this.n.CadastralLayer();this.cadastralVisible=!this.cadastralVisible;this.cadastralLayer.setMap(this.cadastralVisible?this.map:null);return this.cadastralVisible;}
  setVisible(value){this.visible=Boolean(value);if(!this.ready)return;for(const {marker} of this.markers)marker.setMap(this.visible?this.map:null);this.extraMarker?.setMap(this.visible?this.map:null);this.layoutTransactions();}
  view() {
    if(!this.map||!this.ready)return null;
    const center=this.map.getCenter(),bounds=this.map.getBounds(),sw=bounds.getSW(),ne=bounds.getNE();
    return {center:{lat:center.lat(),lng:center.lng()},zoom:this.map.getZoom(),bounds:[sw.lng(),sw.lat(),ne.lng(),ne.lat()]};
  }
  destroy() {
    this.dead=true;this.resizeObserver?.disconnect();
    window.removeEventListener('teojabi-map-auth-error',this.onAuthFailure);
    for(const {marker} of [...this.markers,...this.transactionMarkers,...this.commercialMarkers]) {
      try {this.n.Event.clearInstanceListeners(marker);marker.setMap(null);} catch { /* Failed SDK authentication. */ }
    }
    for(const listener of this.listeners) {
      try {this.n?.Event.removeListener(listener);} catch { /* Failed SDK authentication. */ }
    }
    try {this.extraMarker?.setMap(null);} catch { /* Failed SDK authentication. */ }
    try {this.map?.destroy();} catch { /* An SDK authentication failure may leave a partial instance. */ }
  }
}
