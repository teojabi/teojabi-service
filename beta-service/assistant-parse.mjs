import { DISTRICTS } from './policy.mjs';

const WALK_METERS_PER_MIN = 80;
const BROAD_ZONE = [['주거지역', '주거'], ['상업지역', '상업'], ['공업지역', '공업'], ['녹지지역', '녹지']];
const won = value => Math.round(Number(value) * 100000000);
const m2 = (value, unit) => Math.round((unit === '평' ? Number(value) * 3.305785 : Number(value)) * 100) / 100;

// Deterministic Korean condition extraction. This runs first and wins on conflicts.
export function ruleFilters(text) {
  const t = String(text || '').slice(0, 500);
  const filters = {};
  const districts = DISTRICTS.filter(name => t.includes(name));
  if (districts.length) filters.districts = districts;
  const station = t.match(/([가-힣A-Za-z0-9]{2,12})\s*역/);
  if (station) filters.stationName = station[1];
  const walk = t.match(/도보\s*(\d+)\s*분/);
  if (walk) filters.maxDistanceM = Number(walk[1]) * WALK_METERS_PER_MIN;
  const budget = t.match(/(\d+(?:\.\d+)?)\s*억/);
  if (budget && !/이상|넘|초과|부터/.test(t)) filters.budgetWon = won(budget[1]);
  const area = t.match(/(\d+(?:\.\d+)?)\s*(평|㎡|m2|제곱미터)/);
  if (area) {
    const value = m2(area[1], area[2].includes('평') ? '평' : 'm2');
    if (/이상|넘|초과|부터/.test(t)) filters.minAreaM2 = value;
    else if (/이하|이내|미만|안/.test(t)) filters.maxAreaM2 = value;
    else filters.minAreaM2 = value;
  }
  if (/토지|땅|필지/.test(t)) filters.kind = 'land';
  else if (/건물|빌딩|상가|주택|근린/.test(t)) filters.kind = 'building';
  const zones = ['주거지역', '상업지역', '공업지역', '녹지지역'].filter(z => t.includes(z));
  if (zones.length) filters.zones = zones;
  const dong = t.match(/([가-힣]{1,4}동)(?=[\s,.]|이|에|은|는|쪽|근처|$)/);
  if (dong) filters.q = dong[1];
  return filters;
}

export function mergeFilters(base, extra) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(extra || {})) {
    if (Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== '') out[key] = value;
  }
  out.limit = 60;
  return out;
}

// Free-form text goes to Gemini only when the rule parser found nothing.
export async function geminiFilters(message, key, condition) {
  if (!key) return null;
  const schema = `{"districts":["자치구"],"q":"동/키워드","budgetWon":숫자(원),"minAreaM2":숫자,"maxAreaM2":숫자,"kind":"land|building","zones":["주거지역|상업지역|공업지역|녹지지역"],"stationName":"역이름","maxDistanceM":숫자}`;
  const prompt = [
    '너는 터잡이 부동산 매물 검색 도우미다.',
    '사용자 문장에서 매물 검색 조건만 추출해 아래 JSON 스키마로만 답한다. 설명·인사말·코드블록 없이 JSON 객체 하나만 출력한다.',
    '값이 없는 항목은 넣지 않는다. 도보 N분은 maxDistanceM = N*80(미터)로 변환한다. 가격은 "N억"을 원 단위로 바꾼다(예: 30억 → 3000000000).',
    '매물 검색으로 표현할 수 없는 요청(상권, 임대료, 건물 상태 등)은 filters를 비우고 "unsupported"에 이유를 적는다.',
    `스키마: ${schema}`,
    condition ? `회원 저장 조건(참고, 없으면 무시): ${JSON.stringify(condition)}` : '',
    `사용자 문장: ${String(message).slice(0, 400)}`,
  ].filter(Boolean).join('\n');
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, topP: 0.9, maxOutputTokens: 1024, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text).filter(Boolean).join('\n').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const filter = sanitize(parsed.filters || parsed);
    return { filters: filter, unsupported: typeof parsed.unsupported === 'string' ? parsed.unsupported.slice(0, 120) : null };
  } catch { return null; }
}

// Strict whitelist so a model can never inject unknown filters.
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  if (Array.isArray(raw.districts)) {
    const list = raw.districts.filter(d => DISTRICTS.includes(d));
    if (list.length) out.districts = [...new Set(list)];
  }
  if (typeof raw.q === 'string' && raw.q.trim()) out.q = raw.q.trim().slice(0, 40);
  const budget = Number(raw.budgetWon);
  if (Number.isFinite(budget) && budget > 0) out.budgetWon = Math.round(budget);
  const min = Number(raw.minAreaM2), max = Number(raw.maxAreaM2);
  if (Number.isFinite(min) && min > 0) out.minAreaM2 = min;
  if (Number.isFinite(max) && max > 0) out.maxAreaM2 = max;
  if (raw.kind === 'land' || raw.kind === 'building') out.kind = raw.kind;
  if (Array.isArray(raw.zones)) {
    const list = BROAD_ZONE.map(z => z[0]).filter(z => raw.zones.includes(z));
    if (list.length) out.zones = list;
  }
  if (typeof raw.stationName === 'string' && raw.stationName.trim()) out.stationName = raw.stationName.trim().slice(0, 12);
  const distance = Number(raw.maxDistanceM);
  if (Number.isFinite(distance) && distance > 0 && distance <= 3000) out.maxDistanceM = Math.round(distance);
  return out;
}

export function viewRow(row) {
  const broad = BROAD_ZONE.find(z => String(row.zoning || '').includes(z[1]));
  const zoning = row.zoning ? { status: 'matched', groups: broad ? [broad[0]] : [], entries: [{ name: row.zoning }] } : { status: 'missing', groups: [], entries: [] };
  return {
    id: row.id, source: 'naver', sourceId: row.sourceId, cohort: 'curated',
    district: row.district, neighborhood: row.neighborhood, address: row.address,
    pnu: null, position: row.position, priceWon: row.priceWon,
    areaM2: row.areaM2, floorAreaM2: row.floorAreaM2, description: row.description || '', floorInfo: row.floorInfo || '',
    kind: row.kind, kindConfirmed: true, areaSource: 'listing', floorAreaSource: 'listing', locationStatus: 'pin-estimated',
    zoning, development: null, nearbyTransactions: { status: 'unavailable', cases: [] },
    station: row.station || null, groupKey: row.id,
  };
}

export function describe(filters) {
  const parts = [];
  if (filters.districts?.length) parts.push(filters.districts.join('·'));
  else if (filters.q) parts.push(filters.q);
  if (filters.stationName) parts.push(`${filters.stationName}역${filters.maxDistanceM ? ` 도보 ${Math.round(filters.maxDistanceM / WALK_METERS_PER_MIN)}분` : ''}`);
  if (filters.budgetWon) parts.push(`${(filters.budgetWon / 1e8).toLocaleString('ko-KR')}억 이하`);
  if (filters.kind === 'land') parts.push('토지'); else if (filters.kind === 'building') parts.push('건물');
  if (filters.zones?.length) parts.push(filters.zones.join('·'));
  if (filters.minAreaM2) parts.push(`대지 ${Math.round(filters.minAreaM2)}㎡ 이상`);
  if (filters.maxAreaM2) parts.push(`대지 ${Math.round(filters.maxAreaM2)}㎡ 이하`);
  return parts;
}

export function suggestions(filters, search) {
  const out = [];
  if (!filters.districts?.length && Array.isArray(search.districts)) {
    for (const d of search.districts.slice(0, 3)) out.push({ label: `${d.name}만 보기`, message: `${d.name}만` });
  }
  if (!filters.budgetWon) out.push({ label: '30억 이하', message: '30억 이하' });
  if (!filters.minAreaM2 && !filters.maxAreaM2) out.push({ label: '대지 100평 이상', message: '대지 100평 이상' });
  if (filters.kind !== 'land') out.push({ label: '토지만', message: '토지만' });
  return out.slice(0, 4);
}

export function buildResult(filters, search, unsupported) {
  const total = Number(search.total || 0);
  const groups = (search.rows || []).slice(0, 5).map(row => {
    const listing = viewRow(row);
    return { key: listing.id, pnu: null, representative: listing, listings: [listing] };
  });
  const described = describe(filters);
  let reply;
  if (total === 0) {
    reply = described.length ? `${described.join(' · ')} 조건에 맞는 매물을 찾지 못했어요. 조건을 넓혀볼까요?` : '조건을 이해하지 못했어요. 예) "마포구 30억 이하 건물"처럼 알려주세요.';
  } else if (total <= 5) {
    reply = `${described.join(' · ') || '요청하신'} 조건에 맞는 매물 ${total}건을 찾아 지도에 표시했어요.`;
  } else {
    reply = `${described.join(' · ') || '요청하신'} 조건에 맞는 매물이 너무 많아요(${total.toLocaleString('ko-KR')}건). 아래에서 지역이나 예산을 좁혀볼까요?`;
  }
  if (search.station) reply += ` (${search.station.name}역 직선거리 기준)`;
  return {
    status: 'ready', reply, filters, total, groups,
    station: search.station || null, districts: search.districts || [],
    suggestions: total > 5 ? suggestions(filters, search) : [], unsupported: unsupported || null,
    searchedAt: search.searchedAt || null,
  };
}

export async function parseAssistant(message, condition, geminiKey) {
  const fromCondition = sanitize(condition || {});
  const fromRule = ruleFilters(message);
  let merged = mergeFilters(fromCondition, fromRule);
  let unsupported = null;
  const hasFilter = Object.keys(fromRule).length > 0 || Object.keys(fromCondition).length > 0;
  if (!hasFilter) {
    const gem = await geminiFilters(message, geminiKey, condition);
    if (gem) { merged = mergeFilters(fromCondition, gem.filters); unsupported = gem.unsupported; }
  }
  const filters = sanitize(merged);
  filters.limit = 60;
  if (fromCondition && Object.keys(fromCondition).length && !Object.keys(fromRule).length) {
    filters.fromCondition = true;
  }
  return { filters, unsupported };
}
