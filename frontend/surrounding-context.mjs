import { apiFetch } from './api-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { '지하철역': '🚇', '도시철도': '🚈', '도시개발': '🏗', '공공사업': '🚧', '신축허가': '🏢', '관광공연장': '🎭' };
const LABEL = { '지하철역': '지하철역', '도시철도': '신설 지하철', '도시개발': '도시개발', '공공사업': '공공사업', '신축허가': '신축허가', '관광공연장': '관광공연장' };

const distance = m => m == null ? '' : (m < 1000 ? `${m}m` : `${(m / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}km`);
const areaText = m2 => Number(m2) >= 10000 ? `${Math.round(m2 / 10000).toLocaleString('ko-KR')}만㎡` : (Number(m2) > 0 ? `${Math.round(m2).toLocaleString('ko-KR')}㎡` : '');

function row(item) {
  const meta = [];
  if (item.detail) meta.push(esc(item.detail));
  if (item.status) meta.push(esc(item.status));
  const area = areaText(item.areaM2);
  if (area) meta.push(area);
  meta.push(distance(item.distanceM));
  return `<li class="surrounding-item surrounding-${item.type}">
    <span class="surrounding-icon" aria-hidden="true">${ICON[item.type] || '📍'}</span>
    <div class="surrounding-body"><b>${esc(item.name)}</b><small>${esc(LABEL[item.type] || item.type)}${meta.filter(Boolean).length ? ' · ' + meta.filter(Boolean).join(' · ') : ''}</small></div>
  </li>`;
}

export function renderSurrounding(data) {
  if (!data || data.status !== 'ready' || !Array.isArray(data.projects) || !data.projects.length) {
    return '<p class="case-note">수집한 공공자료에서 반경 내 표시할 주변 사업이 없습니다.</p>';
  }
  // 유형이 골고루 보이도록 가까운 순으로 한 유형씩 번갈아 6건을 고른다.
  const byType = new Map();
  for (const p of data.projects) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }
  const items = [];
  let added = true;
  while (items.length < 6 && added) {
    added = false;
    for (const list of byType.values()) {
      if (!list.length) continue;
      items.push(list.shift());
      added = true;
      if (items.length >= 6) break;
    }
  }
  return `<ul class="surrounding-list">${items.map(row).join('')}</ul>
    <p class="surrounding-source">반경 ${Math.round((data.basis?.radiusM || 1000) / 1000 * 10) / 10}km · 서울시·국토교통부 공공데이터 · 대표 위치 기준</p>`;
}

export function mountSurrounding(host, listing) {
  const position = listing?.position;
  if (!position || position.lat == null || position.lng == null) {
    host.innerHTML = '<p class="case-note">매물 위치를 확인할 수 없어 주변 사업을 조회하지 못했어요.</p>';
    return () => {};
  }
  let cancelled = false;
  host.innerHTML = '<p class="case-note">반경 1km 주변 사업을 확인하고 있어요.</p>';
  apiFetch(`/api/surrounding?lat=${position.lat}&lng=${position.lng}&radius=1000`)
    .then(response => response.json())
    .then(data => { if (!cancelled) host.innerHTML = renderSurrounding(data); })
    .catch(() => { if (!cancelled) host.innerHTML = '<p class="case-note">주변 사업 자료를 불러오지 못했어요.</p>'; });
  return () => { cancelled = true; };
}

export function renderPlannedRail(data) {
  if (!data || data.status !== 'ready' || !Array.isArray(data.items) || !data.items.length) {
    return '<p class="case-note">신설 지하철 자료를 불러오지 못했어요.</p>';
  }
  const rows = data.items.map(item => `<li><b>${esc(item.name)}</b><small>${esc(item.line || '')}${item.opening ? ` · 개통예정 ${esc(item.opening)}` : ''}</small></li>`).join('');
  const url = /^https?:\/\//.test(String(data.sourceUrl || '')) ? data.sourceUrl : '';
  return `<ul class="planned-rail-list">${rows}</ul>
    <p class="surrounding-source">출처 · ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(data.source)} ↗</a>` : esc(data.source)} · ${esc(data.notice || '')}</p>`;
}

export function mountPlannedRail(host) {
  let cancelled = false;
  host.innerHTML = '<p class="case-note">신설 지하철 정보를 불러오고 있어요.</p>';
  apiFetch('/api/planned-rail')
    .then(response => response.json())
    .then(data => { if (!cancelled) host.innerHTML = renderPlannedRail(data); })
    .catch(() => { if (!cancelled) host.innerHTML = '<p class="case-note">신설 지하철 자료를 불러오지 못했어요.</p>'; });
  return () => { cancelled = true; };
}
