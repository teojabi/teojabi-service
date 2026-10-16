import { apiFetch } from './api-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { '지하철역': '🚇', '도시철도': '🚈', '도시개발': '🏗', '공공사업': '🚧', '신축허가': '🏢', '관광공연장': '🎭', '정비사업': '🏙️' };
const LABEL = { '지하철역': '지하철역', '도시철도': '신설 지하철', '도시개발': '도시개발', '공공사업': '공공사업', '신축허가': '신축허가', '관광공연장': '관광공연장', '정비사업': '정비사업' };

const distance = m => m == null ? '' : (m < 1000 ? `${m}m` : `${(m / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}km`);
const areaText = m2 => Number(m2) >= 10000 ? `${Math.round(m2 / 10000).toLocaleString('ko-KR')}만㎡` : (Number(m2) > 0 ? `${Math.round(m2).toLocaleString('ko-KR')}㎡` : '');

function row(item) {
  const meta = [];
  if (item.detail) meta.push(esc(item.detail));
  if (item.status) meta.push(esc(item.status));
  const area = areaText(item.areaM2);
  if (area) meta.push(area);
  meta.push(distance(item.distanceM));
  const badge = item.included ? '<em class="surrounding-badge">이 매물 포함</em>' : '';
  return `<li class="surrounding-item surrounding-${esc(item.type)}${item.included ? ' is-included' : ''}">
    <span class="surrounding-icon" aria-hidden="true">${ICON[item.type] || '📍'}</span>
    <div class="surrounding-body"><b>${esc(item.name)}</b>${badge}<small>${esc(LABEL[item.type] || item.type)}${meta.filter(Boolean).length ? ' · ' + meta.filter(Boolean).join(' · ') : ''}</small></div>
  </li>`;
}

export function renderSurrounding(data) {
  const projects = Array.isArray(data && data.projects) ? data.projects.slice() : [];
  const included = Array.isArray(data && data.included) ? data.included : [];
  projects.sort((a, b) => (a.distanceM == null ? 1e9 : a.distanceM) - (b.distanceM == null ? 1e9 : b.distanceM));
  if (!projects.length && !included.length) {
    return '<p class="case-note">수집한 공공자료에서 반경 내 표시할 주변 사업이 없습니다.</p>';
  }
  const includedNote = included.length
    ? `<div class="surrounding-included">이 매물은 ${included.map(z => `<b>${esc(z.name)}</b>${z.stage ? ` (${esc(z.stage)})` : ''}`).join(', ')}에 포함됩니다.</div>`
    : '';
  const byType = new Map();
  for (const p of projects) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }
  const items = [];
  let added = true;
  while (items.length < 8 && added) {
    added = false;
    for (const list of byType.values()) {
      if (!list.length) continue;
      items.push(list.shift());
      added = true;
      if (items.length >= 8) break;
    }
  }
  return `${includedNote}<ul class="surrounding-list">${items.map(row).join('')}</ul>
    <p class="surrounding-source">반경 ${Math.round((data && data.basis ? (data.basis.radiusM || 500) : 500) / 100) / 10}km · 서울시·국토교통부 공공데이터 · 대표 위치 기준</p>`;
}

export function mountSurrounding(host, listing, onData) {
  const position = listing && listing.position;
  if (!position || position.lat == null || position.lng == null) {
    host.innerHTML = '<p class="case-note">매물 위치를 확인할 수 없어 주변 사업을 조회하지 못했어요.</p>';
    return () => {};
  }
  let cancelled = false;
  const box = { status: 'ready', basis: { radiusM: 500 }, projects: [], included: [] };
  host.innerHTML = '<p class="case-note">반경 500m 주변 사업을 확인하고 있어요.</p>';
  const jobs = [
    apiFetch(`/api/surrounding?lat=${position.lat}&lng=${position.lng}&radius=500`).then(r => r.json()).then(d => {
      if (d && d.status === 'ready') {
        box.projects.push(...(Array.isArray(d.projects) ? d.projects : []));
        box.basis = d.basis || box.basis;
      }
    }).catch(() => {}),
    apiFetch(`/api/redevelop-nearby?lat=${position.lat}&lng=${position.lng}&radius=500`).then(r => r.json()).then(d => {
      if (d && d.status === 'ready' && Array.isArray(d.rows)) {
        for (const z of d.rows) {
          const item = { type: '정비사업', name: z.name, gu: '', dong: '', status: z.stage || '',
            detail: [z.categoryLabel, z.categoryGroup].filter(Boolean).join(' · '),
            areaM2: z.areaM2 == null ? null : Number(z.areaM2), date: '',
            distanceM: z.distanceM == null ? null : Math.round(z.distanceM),
            categoryGroup: z.categoryGroup || '', categoryLabel: z.categoryLabel || '',
            stage: z.stage || '', households: z.households == null ? null : Number(z.households),
            included: z.included === true };
          box.projects.push(item);
          if (item.included) box.included.push(item);
        }
      }
    }).catch(() => {}),
  ];
  Promise.all(jobs).then(() => { if (!cancelled) { if (onData) onData(box); host.innerHTML = renderSurrounding(box); } });
  return () => { cancelled = true; };
}
