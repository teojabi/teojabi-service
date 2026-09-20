import { DISTRICTS } from './policy.mjs';

export const WALK_METERS_PER_MIN = 80;
const BROAD_ZONE = [['주거지역', '주거'], ['상업지역', '상업'], ['공업지역', '공업'], ['녹지지역', '녹지']];
const ORIGIN_LABEL = { premium: '터잡이 추천 매물', registered: '터잡이 등록 매물', disco: '디스코 매물', naver: '네이버 매물' };
const won = value => Math.round(Number(value) * 100000000);
const m2 = (value, unit) => Math.round((unit === '평' ? Number(value) * 3.305785 : Number(value)) * 100) / 100;

// Deterministic Korean condition extraction. This runs first and always wins over saved conditions.
export function ruleFilters(text) {
  const t = String(text || '').slice(0, 500);
  const filters = {};
  const districts = DISTRICTS.filter(name => t.includes(name));
  if (districts.length) filters.districts = districts;
  const station = t.match(/([가-힣A-Za-z0-9]{2,12})\s*역/);
  if (station) filters.stationName = station[1];
  const walk = t.match(/도보\s*(\d+)\s*분/);
  if (walk) filters.maxDistanceM = Number(walk[1]) * WALK_METERS_PER_MIN;
  else {
    const meters = t.match(/(\d+)\s*(?:m|미터)\s*(?:안|이내|이하)?/);
    if (meters && filters.stationName) filters.maxDistanceM = Number(meters[1]);
  }
  const budget = t.match(/(\d+(?:\.\d+)?)\s*억/);
  if (budget) filters.budgetWon = won(budget[1]);
  const area = t.match(/(\d+(?:\.\d+)?)\s*(평|㎡|m2|제곱미터)/);
  if (area) {
    const value = m2(area[1], area[2].includes('평') ? '평' : 'm2');
    if (/이상|넘|초과|부터/.test(t)) filters.minAreaM2 = value;
    else if (/이하|이내|미만|안/.test(t)) filters.maxAreaM2 = value;
    else filters.minAreaM2 = value;
  }
  const road = t.match(/도로\s*(?:폭)?\s*(\d+(?:\.\d+)?)\s*(?:m|미터)/);
  if (road) filters.minRoadWidthM = Number(road[1]);
  if (/토지|땅|필지/.test(t)) filters.kind = 'land';
  else if (/건물|빌딩|상가|주택|근린/.test(t)) filters.kind = 'building';
  const zones = BROAD_ZONE.map(z => z[0]).filter(z => t.includes(z));
  if (zones.length) filters.zones = zones;
  if (/신축|새로\s*짓|헐고/.test(t)) filters.purpose = 'new-build';
  if (/교육보호구역|교육환경보호구역|학교\s*보호/.test(t) && /제외|빼|피해/.test(t)) filters.excludeEducation = true;
  if (/문화재|보존구역/.test(t) && /제외|빼|피해/.test(t)) filters.excludeHeritage = true;
  if (/특화구역|관광숙박/.test(t) && /우선|먼저/.test(t)) filters.preferTourism = true;
  const dong = t.match(/([가-힣]{1,4}동)(?=[\s,.]|이|에|은|는|쪽|근처|$)/);
  if (dong && !filters.districts?.length) filters.q = dong[1];
  return filters;
}

export function hasMeaningfulFilters(filters) {
  return Object.keys(filters || {}).some(key => !['limit', 'fromCondition'].includes(key) &&
    (Array.isArray(filters[key]) ? filters[key].length : filters[key] !== null && filters[key] !== undefined && filters[key] !== ''));
}

// Spoken filters override saved ones. Saved values only fill gaps the user did not mention.
export function mergeFilters(spoken, saved) {
  const out = { ...(saved || {}) };
  for (const [key, value] of Object.entries(spoken || {})) {
    if (Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== '') out[key] = value;
  }
  out.limit = 60;
  return out;
}

export function conflicts(spoken, saved) {
  const out = [];
  if (!spoken || !saved) return out;
  for (const key of ['budgetWon', 'zones', 'districts', 'kind']) {
    const a = spoken[key], b = saved[key];
    if (a === undefined || b === undefined) continue;
    const same = Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
    if (!same) out.push(key);
  }
  return out;
}

const FAQ_CONTEXT = [
  'Q. 어떤 매물을 찾을 수 있나요? → 터잡이가 선별한 매물과 기존 등록 매물을 함께 볼 수 있어요. 목적·예산·지역·대지면적·용도지역으로 찾고, 가격과 판매 여부는 상담 때 확인해요.',
  'Q. 검색 조건을 바꾸려면? → 목록 위 예산·지역·목적 조건을 누르면 바로 바뀌고, 가격순 정렬·목록 접기로 지도를 넓게 볼 수 있어요. 같은 브라우저는 마지막 조건을 기억해요.',
  'Q. 가격 비교는? → 매물 상세에서 가까운 필지 실거래를 최대 5곳 확인해요. 최근 36개월, 반경 500m에서 부족하면 1km까지. 거리순 참고자료이며 시세를 보증하지 않아요.',
  'Q. 방문 전 확인? → 지도·네이버 거리뷰로 주변을 보고, 보유 토지대장·건축물대장을 펼쳐볼 수 있어요. 원본 발급 서류는 아니에요.',
  'Q. 신축 조건? → 신축 목적 선택 시 용도·도로폭·교육보호구역/문화재보존구역 제외, 호텔은 관광숙박특화구역 우선 조건을 고를 수 있어요. 실제 건축 가능 여부는 별도 검토가 필요해요.',
  'Q. 기존 건물·여러 필지 검토? → 건물·토지에서 지도로 필지를 선택하면 주소가 자동 입력되고, 여러 필지 선택과 공부상 면적 합계 적용이 가능해요.',
  'Q. 공사비 계산? → 대지면적×용적률 검토 연면적 기준, 평당 공사비 기본 1,000만원(변경 가능), 설계비는 공사비의 5%로 표시해요. 토지비·철거비·세금을 포함한 총사업비는 아니에요.',
].join('\n');

// Free-form text goes to Gemini only when the rule parser found nothing.
export async function geminiFilters(message, key, condition) {
  if (!key) return null;
  const schema = `{"districts":["자치구"],"q":"동/키워드","budgetWon":숫자(원),"minAreaM2":숫자,"maxAreaM2":숫자,"kind":"land|building","zones":["주거지역|상업지역|공업지역|녹지지역"],"stationName":"역이름","maxDistanceM":숫자,"minRoadWidthM":숫자,"purpose":"new-build"}`;
  const prompt = [
    '너는 터잡이(teojabi.com) 부동산 서비스의 안내 도우미다. 반드시 JSON 객체 하나만 출력한다(설명·인사말·코드블록 금지).',
    '하는 일은 두 가지뿐이다: (1) 매물 검색 조건 추출, (2) 터잡이 서비스 사용법·기능 안내.',
    '매물 검색이면 filters에 조건만 넣는다. 값이 없는 항목은 넣지 않는다. 도보 N분은 maxDistanceM = N*80(미터), N미터는 그대로. 가격 "N억"은 원 단위로 바꾼다(예: 30억 → 3000000000). 평은 그대로 넣지 말고 ㎡로 환산한다(1평=3.305785㎡).',
    '터잡이 서비스 사용법·기능 질문이면 filters를 비우고 reply에 아래 [서비스 안내] 내용만 근거로 2~3문장으로 친절히 답한다. 안내에 없는 내용은 지어내지 말고 "정확한 내용은 터잡이 상담으로 확인해 주세요"라고 답한다.',
    '간단한 인사·감사·안부는 reply로 한두 문장 친근하게 답하고, 이어서 원하는 매물 조건이나 궁금한 점을 물어보게 안내한다.',
    '그 외 요청(외부 정보·인터넷 검색, 일반 상식·잡담, 시세 전망, 투자·법률·세무 조언, 다른 서비스)은 filters를 비우고 reply에 "터잡이 매물 찾기와 서비스 안내만 도와드릴 수 있어요. 원하는 조건을 알려주시면 매물을 찾아드릴게요."라고 답한다.',
    'reply는 한국어 300자 이내, 확정적 투자·법률 조언 금지. 매물 검색으로 표현할 수 없는 요청은 filters를 비우고 "unsupported"에 이유를 적는다.',
    `스키마: {"filters":{...},"unsupported":"이유","reply":"답변"}  (filters 스키마: ${schema})`,
    '[서비스 안내]',
    FAQ_CONTEXT,
    condition ? `회원 저장 조건(참고용, 사용자가 말한 조건과 충돌하면 무시): ${JSON.stringify(condition)}` : '',
    `사용자 문장: ${String(message).slice(0, 400)}`,
  ].filter(Boolean).join('\n');
  try {
    const models = [...new Set([process.env.GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter(Boolean))];
    let response = null;
    for (const model of models) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, topP: 0.9, maxOutputTokens: 1024, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) break;
      if (![404, 429, 500, 503].includes(response.status)) break;
    }
    if (!response || !response.ok) return null;
    const data = await response.json();
    const text = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text).filter(Boolean).join('\n').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      filters: sanitize(parsed.filters || parsed),
      unsupported: typeof parsed.unsupported === 'string' ? parsed.unsupported.slice(0, 120) : null,
      reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 500) : null,
    };
  } catch { return null; }
}

// Strict whitelist so a model or a client can never inject unknown filters.
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  if (Array.isArray(raw.districts)) {
    const list = raw.districts.filter(d => DISTRICTS.includes(d));
    if (list.length) out.districts = [...new Set(list)];
  }
  if (typeof raw.q === 'string' && raw.q.trim()) out.q = raw.q.trim().slice(0, 40);
  for (const [key, max] of [['budgetWon', 1e15], ['minAreaM2', 1e7], ['maxAreaM2', 1e7], ['maxDistanceM', 3000], ['minRoadWidthM', 100]]) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0 && value <= max) out[key] = Math.round(value * 100) / 100;
  }
  if (raw.kind === 'land' || raw.kind === 'building') out.kind = raw.kind;
  // 편집기가 유형을 배열로 보내더라도 하나로 받아준다.
  else if (Array.isArray(raw.kind)) {
    if (raw.kind.includes('land')) out.kind = 'land';
    else if (raw.kind.includes('building')) out.kind = 'building';
  }
  if (raw.purpose === 'new-build') out.purpose = 'new-build';
  // 신축 구역 조건은 기존 검색기와 같은 플래그 이름을 쓴다.
  for (const key of ['preferTourism', 'excludeEducation', 'excludeHeritage']) {
    if (raw[key] === true) out[key] = true;
  }
  if (Array.isArray(raw.zones)) {
    const list = BROAD_ZONE.map(z => z[0]).filter(z => raw.zones.includes(z));
    if (list.length) out.zones = list;
  }
  if (typeof raw.stationName === 'string' && raw.stationName.trim()) out.stationName = raw.stationName.trim().slice(0, 12);
  return out;
}

const originOf = row => ['premium', 'registered', 'disco', 'naver'].includes(row.origin) ? row.origin : 'naver';

export function viewRow(row) {
  const broad = BROAD_ZONE.find(z => String(row.zoning || '').includes(z[1]));
  const zoning = row.zoning ? { status: 'matched', groups: broad ? [broad[0]] : [], entries: [{ name: row.zoning }] } : { status: 'missing', groups: [], entries: [] };
  const origin = originOf(row);
  return {
    id: row.id, source: row.source || 'naver', sourceId: row.sourceId, sourceUrl: row.sourceUrl || '', cohort: origin === 'naver' ? 'curated' : origin === 'disco' ? 'disco' : 'existing',
    district: row.district, neighborhood: row.neighborhood, address: row.address,
    pnu: row.pnu || null, position: row.position, priceWon: row.priceWon, teojabiNo: row.teojabiNo || null,
    areaM2: row.areaM2, floorAreaM2: row.floorAreaM2, description: row.description || '', floorInfo: row.floorInfo || '',
    kind: row.kind, kindConfirmed: true, areaSource: 'listing', floorAreaSource: 'listing', locationStatus: 'pin-estimated',
    zoning, development: null, nearbyTransactions: { status: 'unavailable', cases: [] },
    station: row.station || null, origin, groupKey: row.id,
  };
}

export function describe(filters) {
  const parts = [];
  if (filters.districts?.length) parts.push(filters.districts.join('·'));
  else if (filters.q) parts.push(filters.q);
  if (filters.stationName) parts.push(`${filters.stationName}역${filters.maxDistanceM ? ` ${filters.maxDistanceM}m 이내` : ''}`);
  if (filters.budgetWon) parts.push(`${(filters.budgetWon / 1e8).toLocaleString('ko-KR')}억 이하`);
  if (filters.kind === 'land') parts.push('토지'); else if (filters.kind === 'building') parts.push('건물');
  if (filters.zones?.length) parts.push(filters.zones.join('·'));
  if (filters.minRoadWidthM) parts.push(`도로 ${filters.minRoadWidthM}m 이상`);
  if (filters.minAreaM2) parts.push(`대지 ${Math.round(filters.minAreaM2)}㎡ 이상`);
  if (filters.maxAreaM2) parts.push(`대지 ${Math.round(filters.maxAreaM2)}㎡ 이하`);
  if (filters.purpose === 'new-build') parts.push('신축 검토');
  if (filters.preferTourism) parts.push('관광숙박특화구역 먼저');
  if (filters.excludeEducation) parts.push('교육보호구역 제외');
  if (filters.excludeHeritage) parts.push('문화재보존구역 제외');
  return parts;
}

export function chipList(filters) {
  const chips = [];
  (filters.districts || []).forEach(d => chips.push({ key: 'districts', value: d, label: d, kind: 'list' }));
  (filters.zones || []).forEach(z => chips.push({ key: 'zones', value: z, label: z, kind: 'list' }));
  if (filters.stationName) chips.push({ key: 'stationName', value: filters.stationName, label: `${filters.stationName}역`, kind: 'value' });
  if (filters.maxDistanceM) chips.push({ key: 'maxDistanceM', value: filters.maxDistanceM, label: `${filters.maxDistanceM}m 이내`, kind: 'value' });
  if (filters.budgetWon) chips.push({ key: 'budgetWon', value: filters.budgetWon, label: `${(filters.budgetWon / 1e8).toLocaleString('ko-KR')}억 이하`, kind: 'value' });
  if (filters.minAreaM2) chips.push({ key: 'minAreaM2', value: filters.minAreaM2, label: `대지 ${Math.round(filters.minAreaM2)}㎡ 이상`, kind: 'value' });
  if (filters.maxAreaM2) chips.push({ key: 'maxAreaM2', value: filters.maxAreaM2, label: `대지 ${Math.round(filters.maxAreaM2)}㎡ 이하`, kind: 'value' });
  if (filters.minRoadWidthM) chips.push({ key: 'minRoadWidthM', value: filters.minRoadWidthM, label: `도로 ${filters.minRoadWidthM}m 이상`, kind: 'value' });
  if (filters.kind) chips.push({ key: 'kind', value: filters.kind, label: filters.kind === 'land' ? '토지' : '건물', kind: 'value' });
  if (filters.q) chips.push({ key: 'q', value: filters.q, label: filters.q, kind: 'value' });
  if (filters.purpose) chips.push({ key: 'purpose', value: filters.purpose, label: '신축 검토', kind: 'value' });
  if (filters.preferTourism) chips.push({ key: 'preferTourism', value: true, label: '관광숙박특화구역 먼저', kind: 'value' });
  if (filters.excludeEducation) chips.push({ key: 'excludeEducation', value: true, label: '교육보호구역 제외', kind: 'value' });
  if (filters.excludeHeritage) chips.push({ key: 'excludeHeritage', value: true, label: '문화재보존구역 제외', kind: 'value' });
  return chips;
}

export function suggestions(filters, search) {
  const out = [];
  if (Array.isArray(search?.districts)) {
    for (const d of search.districts.slice(0, 3)) if (!(filters.districts || []).includes(d.name)) out.push({ label: `${d.name}만 보기`, message: `${d.name}만` });
  }
  if (!filters.budgetWon) out.push({ label: '30억 이하', message: '30억 이하' });
  if (!filters.minAreaM2 && !filters.maxAreaM2) out.push({ label: '대지 100평 이상', message: '대지 100평 이상' });
  if (filters.kind !== 'land') out.push({ label: '토지만', message: '토지만' });
  return out.slice(0, 4);
}

function groupByOrigin(rows) {
  const buckets = { premium: [], registered: [], disco: [], naver: [] };
  for (const row of rows) buckets[originOf(row)].push(row);
  return buckets;
}

export function buildResult(filters, search, unsupported) {
  const total = Number(search.total || 0);
  // assistant.py는 groups[].representative에 row DTO를 담아 돌려준다.
  const sourceRows = Array.isArray(search.rows) && search.rows.length
    ? search.rows
    : (search.groups || []).map(group => group.representative).filter(Boolean);
  const rows = sourceRows.map(viewRow);
  const buckets = groupByOrigin(rows);
  const ordered = [...buckets.premium, ...buckets.registered, ...buckets.disco, ...buckets.naver];
  const groups = ordered.map(listing => ({ key: listing.id, pnu: listing.pnu, representative: listing, listings: [listing] }));
  const described = describe(filters);
  const totals = search.originTotals || {};
  const premium = Number(totals.premium || 0), registered = Number(totals.registered || 0), disco = Number(totals.disco || 0), naver = Number(totals.naver || total - premium - registered - disco);
  const shownCount = Math.min(5, groups.length);
  let reply;
  if (total === 0) {
    reply = described.length
      ? `${described.join(' · ')} 조건에 맞는 매물을 찾지 못했어요. 아래에서 조건을 바꿔볼까요?`
      : '조건에 맞는 매물을 찾지 못했어요. 아래에서 조건을 바꿔보세요.';
  } else if (total <= shownCount) {
    reply = `조건에 맞는 매물 ${total}건을 찾았어요.`;
  } else if (total <= 10) {
    reply = `조건에 맞는 매물 ${total}건 중 ${shownCount}건을 보여드릴게요.`;
  } else {
    reply = `조건에 맞는 매물 ${total}건 중 ${shownCount}건을 보여드릴게요. 10건 이하로 조건 설정을 맞추는 것을 추천드려요.`;
  }
  if (total > 0 && (premium || registered || disco)) {
    const lines = [];
    if (premium) lines.push(`터잡이 추천 매물 ${premium}건`);
    if (registered) lines.push(`터잡이 등록 매물 ${registered}건`);
    if (disco) lines.push(`디스코 매물 ${disco.toLocaleString('ko-KR')}건`);
    lines.push(`네이버 매물 ${naver.toLocaleString('ko-KR')}건`);
    reply += `\n터잡이·디스코 매물을 먼저 확인해 보세요. ${lines.join(' · ')}이에요.`;
  } else if (total > 0 && naver > 0) {
    reply += `\n조건에 맞는 터잡이·디스코 매물은 아직 없어서, 네이버 매물 ${naver.toLocaleString('ko-KR')}건을 추천드려요.`;
  }
  return {
    status: 'ready', reply, filters, chips: chipList(filters), total, groups,
    originTotals: { premium, registered, disco, naver },
    station: search.station || null, districts: search.districts || [],
    suggestions: total > 30 ? suggestions(filters, search) : total > 5 ? suggestions(filters, search).slice(0, 3) : [],
    relaxations: Array.isArray(search.relaxations) ? search.relaxations : [],
    unsupported: unsupported || null, searchedAt: search.searchedAt || null,
  };
}

export async function parseAssistant(message, condition, geminiKey, editedFilters) {
  // Edited filters (from the in-window condition editor) skip parsing entirely.
  if (editedFilters && typeof editedFilters === 'object' && hasMeaningfulFilters(editedFilters)) {
    const filters = sanitize(editedFilters); filters.limit = 60;
    return { filters, unsupported: null, source: 'edited' };
  }
  const saved = sanitize(condition || {});
  const spoken = ruleFilters(message);
  let merged = mergeFilters(spoken, saved);
  let unsupported = null;
  let reply = null;
  let source = Object.keys(spoken).length ? 'spoken' : Object.keys(saved).length ? 'saved' : 'none';
  if (!hasMeaningfulFilters(spoken) && !hasMeaningfulFilters(saved)) {
    const gem = await geminiFilters(message, geminiKey, condition);
    if (gem) { merged = mergeFilters(gem.filters, saved); unsupported = gem.unsupported; reply = gem.reply; source = Object.keys(gem.filters || {}).length ? 'gemini' : 'none'; }
  }
  const filters = sanitize(merged); filters.limit = 60;
  return { filters, unsupported, source, conflicts: conflicts(spoken, saved), reply };
}

export { ORIGIN_LABEL };
