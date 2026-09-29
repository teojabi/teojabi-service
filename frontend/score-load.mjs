// 저장한 찜 매물의 터잡이 점수를 불러온다. (상세와 같은 산식 score-policy 사용)
import { apiFetch } from './api-client.mjs';
import { computeTeojabiScore } from './score-policy.mjs';

const cache = new Map();

async function getJson(url, signal) {
  try { const r = await apiFetch(url, { signal }); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}

function pos(item) {
  const lat = Number(item?.lat), lng = Number(item?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// 경매 물건(auction_item) → 점수 산식이 쓰는 매물 모양
function fromAuction(item) {
  const usage = String(item.usage_name || '');
  const isLand = item.obj_kind === 'land' || /토지|대지|임야|전답|잡종지|과수원|답|전/.test(usage);
  const price = Number(item.noti_min_price ?? item.min_price);
  const area = Number(item.obj_area_m2 ?? item.area_max ?? item.land_area_m2);
  return {
    id: `auction:${item.docid}`, kind: isLand ? 'land' : 'building',
    priceWon: Number.isFinite(price) ? price : null, areaM2: Number.isFinite(area) ? area : null, floorAreaM2: null,
    zoning: item.use_zone ? { status: 'matched', groups: [], entries: [{ name: item.use_zone }] } : { status: 'missing', groups: [], entries: [] },
    farLimit: item.far_limit == null ? null : Number(item.far_limit), bcrLimit: item.bcr_limit == null ? null : Number(item.bcr_limit),
    heightLimit: item.height_limit == null ? null : Number(item.height_limit), currentFar: Number(item.reg_far) > 0 ? Number(item.reg_far) : null,
    landAreaM2: item.land_area_m2 == null ? null : Number(item.land_area_m2), buildingAreaM2: item.building_area_m2 == null ? null : Number(item.building_area_m2),
    roadWidthM: item.road_width_m == null ? null : Number(item.road_width_m),
    position: pos(item), pnu: /^\d{19}$/.test(String(item.pnu || '')) ? item.pnu : null,
  };
}

// 공매 물건(onbid_item) → 점수 산식이 쓰는 매물 모양
function fromOnbid(item) {
  const usage = String(item.usg_mcls_nm || item.usg_lcls_nm || '');
  const isLand = /토지|대지|임야|전답|잡종지|과수원|답/.test(usage);
  const price = Number(item.lowst_bid_prc);
  const area = Number(item.land_area_m2 ?? item.building_area_m2);
  return {
    id: `onbid:${item.cltr_mng_no}::${item.pbct_cdtn_no}`, kind: isLand ? 'land' : 'building',
    priceWon: Number.isFinite(price) ? price : null, areaM2: Number.isFinite(area) ? area : null, floorAreaM2: null,
    zoning: item.use_zone ? { status: 'matched', groups: [], entries: [{ name: item.use_zone }] } : { status: 'missing', groups: [], entries: [] },
    farLimit: item.far_limit == null ? null : Number(item.far_limit), bcrLimit: item.bcr_limit == null ? null : Number(item.bcr_limit),
    heightLimit: item.height_limit == null ? null : Number(item.height_limit), currentFar: Number(item.reg_far) > 0 ? Number(item.reg_far) : null,
    landAreaM2: item.land_area_m2 == null ? null : Number(item.land_area_m2), buildingAreaM2: item.building_area_m2 == null ? null : Number(item.building_area_m2),
    roadWidthM: item.road_width_m == null ? null : Number(item.road_width_m),
    position: pos(item), pnu: /^\d{19}$/.test(String(item.pnu || '')) ? item.pnu : null,
  };
}

async function fetchListing(key, signal) {
  if (key.startsWith('auction:')) {
    const d = await getJson(`/api/auctions/${encodeURIComponent(key.slice('auction:'.length))}`, signal);
    return d && d.status === 'ready' ? fromAuction(d.item) : null;
  }
  if (key.startsWith('onbid:')) {
    const rest = key.slice('onbid:'.length).split('::').map(encodeURIComponent).join('::');
    const d = await getJson(`/api/onbid/${rest}`, signal);
    return d && d.status === 'ready' ? fromOnbid(d.item) : null;
  }
  const d = await getJson(`/api/listings/${encodeURIComponent(key)}`, signal);
  return d && d.status === 'ready' ? d.listing : null;
}

async function compute(key, signal) {
  const listing = await fetchListing(key, signal);
  if (!listing) return { status: 'unavailable', score: null, grade: '' };
  const p = listing.position;
  const [nearby, context, commercial, surrounding] = await Promise.all([
    getJson(`/api/nearby-transactions/${encodeURIComponent(key)}`, signal),
    getJson(`/api/site-context/${encodeURIComponent(key)}`, signal),
    p ? getJson(`/api/commercial?lat=${p.lat}&lng=${p.lng}&radius=500`, signal) : Promise.resolve(null),
    p ? getJson(`/api/surrounding?lat=${p.lat}&lng=${p.lng}&radius=1000`, signal) : Promise.resolve(null),
  ]);
  return computeTeojabiScore({ listing, context, nearby, commercial, surrounding });
}

export function loadSavedScore(key, options = {}) {
  if (!cache.has(key)) cache.set(key, compute(key, options.signal));
  return cache.get(key);
}
