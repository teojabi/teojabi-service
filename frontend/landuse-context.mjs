import { apiFetch } from './api-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GROUPS = {
  landplan: '「국토의 계획 및 이용에 관한 법률」 지역지구등',
  other: '다른 법령 등에 따른 지역지구등',
  rule: '「토지이용규제기본법 시행령」 제9조 제4항 각 호',
};
function groupOf(code) {
  const p = String(code || '').slice(0, 3);
  if (p === 'UQA') return 'landplan';
  if (p === 'UQQ') return 'rule';
  return 'other';
}

export function renderLandUse(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  if (!items.length) return '<p class="case-note">보유한 토지이용계획 자료에서 이 필지의 규제 항목을 찾지 못했습니다.</p>';
  const order = ['landplan', 'other', 'rule'];
  const buckets = { landplan: [], other: [], rule: [] };
  const seen = new Set();
  for (const it of items) {
    const key = (it.name || '') + '|' + (it.note || '');
    if (seen.has(key)) continue;
    seen.add(key);
    buckets[groupOf(it.code)].push(it);
  }
  const sections = order.filter(g => buckets[g].length).map(g => {
    const rows = buckets[g].map(it => `<li class="landuse-item"><b>${esc(it.name)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}</li>`).join('');
    return `<div class="landuse-group"><h4>${esc(GROUPS[g])}</h4><ul class="landuse-list">${rows}</ul></div>`;
  }).join('');
  return `${sections}<p class="case-note">토지이용계획확인서 기준입니다. 실제 적용 조건은 원문에서 확인하세요.</p>`;
}

export function mountLandUse(host, pnu) {
  if (!host) return () => {};
  if (!pnu) {
    host.innerHTML = '<p class="case-note">필지 번호를 확인할 수 없어 토지이용계획을 조회하지 못했어요.</p>';
    return () => {};
  }
  let cancelled = false;
  host.innerHTML = '<p class="case-note">토지이용계획 규제사항을 확인하고 있어요.</p>';
  apiFetch(`/api/land-use/${encodeURIComponent(pnu)}`)
    .then(response => response.json())
    .then(data => { if (!cancelled) host.innerHTML = renderLandUse(data); })
    .catch(() => { if (!cancelled) host.innerHTML = '<p class="case-note">토지이용계획을 불러오지 못했어요.</p>'; });
  return () => { cancelled = true; };
}
