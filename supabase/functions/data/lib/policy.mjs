import { validateExtraCriteria } from './search-options.mjs';
export const POLICY = Object.freeze({ version: '1.1', freshHours: 24, maxAgeHours: 72, firstParcels: 5, maxParcels: 20 });
export const DISTRICTS = Object.freeze(['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구']);
const multipliers = Object.freeze({ KRW: 1n, MANWON: 10000n, EOK: 100000000n });

// Units must come from a confirmed source contract; never infer them from magnitude.
export function toWon(value, unit) {
  if (!Object.hasOwn(multipliers, unit) || !['number', 'string'].includes(typeof value)) return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || text.length > 40) return null;
  const [whole, fraction = ''] = text.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * multipliers[unit];
  if (numerator % denominator !== 0n) return null;
  const amount = numerator / denominator;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(amount);
}

export function validateConditions(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: '검색조건이 필요합니다.' };
  const budget = input.budgetWon;
  if (!Number.isSafeInteger(budget) || budget <= 0) return { ok: false, reason: '매입 예산을 올바르게 입력해 주세요.' };
  if (!Array.isArray(input.districts) || input.districts.some(d => !DISTRICTS.includes(d))) return { ok: false, reason: '서울 자치구를 확인해 주세요.' };
  if (input.minAreaM2 != null && (!Number.isFinite(input.minAreaM2) || input.minAreaM2 <= 0)) return { ok: false, reason: '최소면적은 0보다 큰 ㎡ 값이어야 합니다.' };
  const extra=validateExtraCriteria(input);
  if(!extra.ok)return {ok:false,reason:extra.message};
  if (!['price', 'area'].includes(input.sort)) return { ok: false, reason: '지원하지 않는 정렬입니다.' };
  return { ok: true, value: { ...input, ...extra.value, districts: [...new Set(input.districts)] } };
}

function instant(value) {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return Date.parse(value);
}

export function datasetState(context, now = Date.now()) {
  const issues = [];
  if (!context || !Object.hasOwn(multipliers, context.priceUnit)) issues.push('PRICE_UNIT_UNCONFIRMED');
  if (context?.scopeConfirmed !== true) issues.push('SALE_SCOPE_UNCONFIRMED');
  if (context?.snapshot?.completed !== true || context?.snapshot?.removedReconciled !== true) issues.push('SNAPSHOT_INCOMPLETE');
  const completed = instant(context?.snapshot?.completedAt);
  const age = (now - completed) / 3600000;
  if (!Number.isFinite(now) || !Number.isFinite(completed) || age < 0) issues.push('SNAPSHOT_TIME_UNCONFIRMED');
  if (issues.length) return { status: 'unavailable', issues };
  if (age > POLICY.maxAgeHours) return { status: 'stale', issues: ['SNAPSHOT_EXPIRED'] };
  return { status: 'ready', issues: [], showAgeNotice: age > POLICY.freshHours, completedAt: context.snapshot.completedAt };
}

function usableArea(landArea) {
  // Recommendation areas come from the Naver listing itself. Register totals
  // belong to new-build risk review and must not fill or replace listing areas.
  if (!landArea || landArea.unit !== 'm2' || landArea.source !== 'listing') return null;
  const value = typeof landArea.value === 'string' && /^\d+(?:\.\d+)?$/.test(landArea.value) ? Number(landArea.value) : landArea.value;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// Pure application policy. No SQL, persistence, network, or inferred source values.
export function recommend(rows, input, context, { now = Date.now(), limit = POLICY.firstParcels } = {}) {
  const checked = validateConditions(input);
  if (!checked.ok) return { status: 'invalid', message: checked.reason };
  const health = datasetState(context, now);
  if (health.status !== 'ready') return health;
  if (!Array.isArray(rows)) return { status: 'error', issues: ['SOURCE_RESPONSE_INVALID'] };
  const conditions = checked.value;
  // The production adapter has no zoning contract yet; never silently ignore this filter.
  if(conditions.zones.length)return {status:'unavailable',issues:['ZONING_SOURCE_UNCONNECTED']};
  const unique = new Map();
  const conflicts = new Set();
  for (const row of rows) {
    if (!row || row.source !== 'naver' || typeof row.sourceId !== 'string' || !/^\d+$/.test(row.sourceId)) continue;
    const id = `naver:${row.sourceId}`;
    if (unique.has(id) && JSON.stringify(canonical(unique.get(id))) !== JSON.stringify(canonical(row))) conflicts.add(id);
    else unique.set(id, row);
  }
  const eligible = [];
  for (const [id, row] of unique) {
    if (conflicts.has(id)) continue;
    if (!['신규', '유지'].includes(row.status) || row.dealType !== 'sale' || !['building', 'land'].includes(row.kind)) continue;
    if (row.city !== '서울특별시' || !DISTRICTS.includes(row.district)) continue;
    if (typeof row.pnu !== 'string' || !/^\d{19}$/.test(row.pnu) || row.hasGeometry !== true || row.parcelLinked !== true) continue;
    const priceWon = toWon(row.askingPrice, context.priceUnit);
    if (priceWon === null || priceWon <= 0 || priceWon > conditions.budgetWon) continue;
    if (conditions.districts.length && !conditions.districts.includes(row.district)) continue;
    const areaM2 = usableArea(row.landArea);
    const floorAreaM2 = usableArea(row.floorArea);
    if (conditions.minAreaM2 != null && (areaM2 === null || areaM2 < conditions.minAreaM2)) continue;
    if (conditions.maxAreaM2 != null && (areaM2 === null || areaM2 > conditions.maxAreaM2)) continue;
    if (conditions.sort === 'area' && areaM2 === null) continue;
    const reasons = ['예산 이내'];
    if (conditions.districts.length) reasons.push('선택한 자치구');
    if (conditions.minAreaM2 != null) reasons.push('기재 면적 조건 충족');
    eligible.push({
      id, source: row.source, sourceId: row.sourceId, kind: row.kind,
      district: row.district, pnu: row.pnu, priceWon, areaM2,
      areaSource: areaM2 === null ? null : row.landArea.source,
      floorAreaM2, floorAreaSource: floorAreaM2 === null ? null : 'listing',
      reasons, locationStatus: 'pin-estimated',
    });
  }
  eligible.sort((a,b)=>a.priceWon-b.priceWon||compareId(a,b));
  const groups = new Map();
  for (const row of eligible) {
    if (!groups.has(row.pnu)) groups.set(row.pnu, { pnu: row.pnu, representative: row, listings: [] });
    groups.get(row.pnu).listings.push(row);
  }
  const orderedGroups=[...groups.values()].sort((a,b)=>(conditions.sort==='area'?b.representative.areaM2-a.representative.areaM2:
    a.representative.priceWon-b.representative.priceWon)||compareId(a.representative,b.representative));
  const pageLimit = [5, 15, 20].includes(limit) ? limit : POLICY.firstParcels;
  return {
    status: 'ready',
    ...health,
    groups: orderedGroups.slice(0, pageLimit),
    totalParcels: groups.size,
    totalListings: eligible.length,
    conflictingIdsExcluded: conflicts.size,
    hasMore: pageLimit < POLICY.maxParcels && groups.size > pageLimit,
  };
}
