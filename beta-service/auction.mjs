import { apiFetch } from './api-client.mjs';
import { loadNaverMaps } from './map-controller.mjs';

const SEOUL_GU = ['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'];

const won = v => v == null ? '—' : `${(Number(v)/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2})}억`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dday = d => { if(!d) return ''; const t=new Date(d+'T00:00:00'); const n=Math.ceil((t-Date.now())/86400000); return n>=0?`D-${n}`:`종료`; };

const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const detailEl = document.getElementById('detail');
const mapStatus = document.getElementById('map-status');
const filters = document.getElementById('filters');

let map, n, markers = [], rows = [], selected = null, authFailed = false;

for (const gu of SEOUL_GU) {
  const o = document.createElement('option'); o.value = gu; o.textContent = gu; filters.gu.append(o);
}

function params() {
  const f = new FormData(filters);
  const p = new URLSearchParams();
  for (const [k, v] of f.entries()) if (v !== '') p.set(k, v);
  if (p.get('maxPrice')) p.set('maxPrice', String(Number(p.get('maxPrice')) * 1e8));
  p.set('size', '100');
  return p;
}

async function loadList() {
  countEl.textContent = '불러오는 중…';
  try {
    const res = await apiFetch(`/api/auctions?${params()}`);
    const data = await res.json();
    if (data.status !== 'ready') throw new Error();
    rows = data.rows || [];
    countEl.textContent = `${data.total.toLocaleString('ko-KR')}건 중 ${rows.length}건 표시`;
    renderList();
    plotMarkers();
  } catch {
    countEl.textContent = '자료를 불러오지 못했어요.';
    listEl.innerHTML = '';
  }
}

function renderList() {
  listEl.innerHTML = rows.map(r => `
    <article class="auction-card${selected===r.docid?' active':''}" data-docid="${esc(r.docid)}" tabindex="0">
      <h3>${esc(r.usage_name || '용도 미기재')} <span class="auction-badge">${esc(r.sigu||'')} ${esc(r.dong||'')}</span></h3>
      <div class="price">최저 ${won(r.min_price)} <small style="opacity:.6;font-weight:400">/ 감정 ${won(r.appraised_amt)}</small></div>
      <div class="meta">${esc(r.building_list||r.lot_no||'')} · ${esc(r.case_no||'')} · ${esc(r.sale_date||'')} ${dday(r.sale_date)} · 유찰 ${r.fail_count ?? 0}회</div>
    </article>`).join('') || '<p style="opacity:.7">조건에 맞는 물건이 없어요.</p>';
}

function pin(r) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `auction-pin${selected===r.docid?' active':''}`;
  el.textContent = won(r.min_price);
  el.title = `${r.usage_name||''} ${r.sigu||''} ${r.dong||''}`;
  return el;
}

function plotMarkers() {
  if (!map || !n) return;
  for (const m of markers) m.setMap(null);
  markers = [];
  const bounds = new n.LatLngBounds();
  let plotted = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    const point = new n.LatLng(r.lat, r.lng);
    bounds.extend(point);
    const marker = new n.Marker({ map, position: point, zIndex: selected===r.docid?100:1,
      icon: { content: pin(r), anchor: new n.Point(0, 12) } });
    n.Event.addListener(marker, 'click', () => openDetail(r.docid));
    markers.push(marker); plotted++;
  }
  if (plotted) map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
  mapStatus.textContent = `${plotted}건 표시 · 출처: 법원경매정보`;
}

async function openDetail(docid) {
  selected = docid;
  renderList();
  plotMarkers();
  const r = rows.find(x => x.docid === docid);
  if (r && map && Number.isFinite(r.lat)) map.setCenter(new n.LatLng(r.lat, r.lng));
  detailEl.hidden = false;
  detailEl.innerHTML = '<p style="opacity:.7">상세 불러오는 중…</p>';
  try {
    const res = await apiFetch(`/api/auctions/${encodeURIComponent(docid)}`);
    const data = await res.json();
    if (data.status !== 'ready') throw new Error();
    const it = data.item, d = data.detail || {};
    const stats = Array.isArray(d.around_stats) ? d.around_stats[0] : null;
    detailEl.innerHTML = `
      <h2 style="font-size:16px;margin:0 0 4px">${esc(it.usage_name||'')} · ${esc(it.sigu||'')} ${esc(it.dong||'')}</h2>
      <p style="font-size:12px;opacity:.7;margin:0">${esc(it.full_address||'')}</p>
      <dl>
        <dt>감정가</dt><dd>${won(it.appraised_amt)}</dd>
        <dt>최저매각가</dt><dd>${won(it.min_price)} <small style="opacity:.6">(감정가의 ${it.noti_min_rate?esc(it.noti_min_rate)+'%':'—'})</small></dd>
        <dt>매각기일</dt><dd>${esc(it.sale_date||'')} ${esc(it.sale_hour||'')} ${dday(it.sale_date)}</dd>
        <dt>유찰횟수</dt><dd>${it.fail_count ?? 0}회</dd>
        <dt>법원·계</dt><dd>${esc(it.court_name||'')} ${esc(it.dept_name||'')}</dd>
        <dt>사건번호</dt><dd>${esc(it.case_no||'')}</dd>
        <dt>용도지역</dt><dd>${esc(it.use_zone||'확인 필요')}</dd>
        <dt>도로폭</dt><dd>${it.road_width_m!=null?esc(it.road_width_m)+'m':'확인 필요'}</dd>
        ${d.claim_amt!=null?`<dt>청구금액</dt><dd>${won(d.claim_amt)}</dd>`:''}
        ${d.dividend_deadline?`<dt>배당요구종기</dt><dd>${esc(d.dividend_deadline)}</dd>`:''}
        ${d.acquired_rights?`<dt>인수되는 권리</dt><dd>${esc(d.acquired_rights)} <span style="opacity:.6">(법원 공시)</span></dd>`:''}
        ${d.legal_superficies?`<dt>법정지상권</dt><dd>${esc(d.legal_superficies)}</dd>`:''}
        ${stats?`<dt>주변 12개월</dt><dd>낙찰가율 ${esc(stats.term12MgakPrcRate ?? '—')}% · 평균유찰 ${esc(stats.term12AvgFlbdNcnt ?? '—')}회</dd>`:''}
      </dl>
      <p class="chk">※ 권리분석·적정 입찰가는 제공하지 않아요. 인수권리·점유 등은 법원 원문(매각물건명세서·현황조사서)을 확인하세요.</p>
      <p><a href="https://www.courtauction.go.kr/" target="_blank" rel="noopener">법원경매정보에서 원문 확인 ↗</a></p>`;
  } catch {
    detailEl.innerHTML = '<p style="opacity:.7">상세를 불러오지 못했어요.</p>';
  }
}

filters.addEventListener('change', loadList);
let debounce;
filters.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(loadList, 350); });
listEl.addEventListener('click', e => { const c = e.target.closest('.auction-card'); if (c) openDetail(c.dataset.docid); });
listEl.addEventListener('keydown', e => { if (e.key === 'Enter') { const c = e.target.closest('.auction-card'); if (c) openDetail(c.dataset.docid); } });

loadNaverMaps().then(maps => {
  n = maps;
  map = new n.Map(document.getElementById('map'), { center: new n.LatLng(37.5665, 126.978), zoom: 11, zoomControl: true, scaleControl: true });
  mapStatus.textContent = '지도 준비 완료';
  plotMarkers();
}).catch(err => { authFailed = true; mapStatus.textContent = '지도 키 연결 후 지도를 볼 수 있어요.'; });

loadList();
