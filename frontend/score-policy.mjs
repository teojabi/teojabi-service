// 터잡이 점수(절대) 산식. 순수 함수 — 웹에서 사용(앱/서버는 동일 산식 이식).
// 입력: { listing, context, nearby, commercial, surrounding }
// context  = /api/site-context 또는 /api/parcel-context 응답 { status, zones:[{id,items:[{relation,name,far:[...]}]}], road:{widthM} }
// nearby   = /api/nearby-transactions 응답 { status, cases:[{kind,priceWon,areaM2,floorAreaM2,distanceMeters}] }
// commercial = /api/commercial 응답 { status, nearest:{distanceM,type,monthlySalesWon,population,changeIndex} }
// surrounding = /api/surrounding 응답 { status, projects:[{type,distanceM,...}] }

const ZONE_FAR_LIMITS = {
  '제1종전용주거지역': [100, 50], '제2종전용주거지역': [120, 40], '제1종일반주거지역': [150, 60],
  '제2종일반주거지역': [200, 60], '제3종일반주거지역': [250, 50], '준주거지역': [400, 60],
  '중심상업지역': [1000, 60], '일반상업지역': [800, 60], '근린상업지역': [600, 60], '유통상업지역': [600, 60],
  '전용공업지역': [200, 60], '일반공업지역': [200, 60], '준공업지역': [400, 60],
  '보전녹지지역': [50, 20], '생산녹지지역': [50, 20], '자연녹지지역': [50, 20],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const round1 = v => Math.round(v * 10) / 10;
const roundHalf = v => Math.round(v * 2) / 2;
const wonPerPyeong = perM2 => `${(perM2 * 3.3058 / 1e4).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원/평`;

// 테이블 조회: table = [[max, stars], ...] 오름차순 max, 마지막은 Infinity.
function tableScore(value, table) {
  if (value == null || !Number.isFinite(value)) return null;
  for (const [max, stars] of table) if (value <= max) return stars;
  return table[table.length - 1][1];
}

// "지하 1층 / 지상 7층", "7/", floorInfo 등에서 지상 층수 추출.
function aboveFloors(listing) {
  const verified = num(listing?.verify?.building?.aboveFloors);
  if (verified != null) return verified;
  const text = String(listing?.buildingFacts?.floorScale || listing?.floorInfo || listing?.building_list || '');
  const above = text.match(/지상\s*(\d+)\s*층/);
  if (above) return Number(above[1]);
  const all = [...text.matchAll(/(\d+)\s*층/g)].map(m => Number(m[1]));
  return all.length ? Math.max(...all) : null;
}

// 지구단위계획 far 행에서 값 추출.
function contextFacts(context) {
  const zones = Array.isArray(context?.zones) ? context.zones : [];
  const planZone = zones.find(z => z.id === 'district-plan');
  const plans = Array.isArray(planZone?.items) ? planZone.items : [];
  const farRows = plans.flatMap(p => (Array.isArray(p.far) ? p.far : []));
  const maxOf = keys => {
    const vals = [];
    for (const row of farRows) for (const key of keys) { const n = num(row[key]); if (n != null) vals.push(n); }
    return vals.length ? Math.max(...vals) : null;
  };
  const heights = [];
  for (const row of farRows) { const n = num(row.heightM); if (n != null) heights.push(n); }
  const inZone = id => zones.some(z => z.id === id && (z.items || []).some(i => ['geometry-contained', 'geometry-overlap'].includes(i.relation)));
  const planNames = plans.map(p => String(p.name || ''));
  return {
    allowedFar: maxOf(['allowed', 'upper', 'standard']),
    bcr: maxOf(['bcr']),
    heightLimit: heights.length ? Math.min(...heights) : null,
    inZone, planNames,
  };
}

function zoneFactsOf(listing) {
  for (const e of (listing?.zoning?.entries || [])) {
    const name = String(e.name || '').replace(/\s+/g, '').replace(/\((?:7|12)층(?:이하)?\)$/, '');
    if (ZONE_FAR_LIMITS[name]) return { zone: name, far: ZONE_FAR_LIMITS[name][0], bcr: ZONE_FAR_LIMITS[name][1] };
  }
  return null;
}

// ---------- A. 가격 경쟁력 ----------
function priceCategory(listing, nearby) {
  const base = { key: 'price', label: '가격 경쟁력', weight: 0.35 };
  const price = num(listing?.priceWon);
  const land = num(listing?.areaM2);
  const floor = num(listing?.floorAreaM2);
  if (!(price > 0)) return { ...base, available: false, score: null, metrics: [] };
  // 사이트 실거래 표기·비교(대지 1㎡당)와 같은 기준인 대지면적을 사용한다.
  const subjArea = land > 0 ? land : floor;
  if (!(subjArea > 0)) return { ...base, available: false, score: null, metrics: [] };
  const subjPerM2 = price / subjArea;

  const toPerM2 = c => {
    const a = num(c.areaM2), p = num(c.priceWon);
    return p > 0 && a > 0 ? p / a : null;
  };
  const all = (nearby?.cases || []).filter(c => toPerM2(c) != null);
  const sameKind = listing?.kind ? all.filter(c => !c.kind || c.kind === listing.kind) : all;
  const used = sameKind.length ? sameKind : all;
  const mixed = sameKind.length === 0 && all.length > 0;
  const casePerM2 = used.map(toPerM2).sort((a, b) => a - b);
  if (!casePerM2.length) {
    return { ...base, available: false, score: null, metrics: [{ key: 'ppp', label: '대지면적 평당가 비교', available: false, score: null, evidence: '주변 실거래가 없어 비교하지 못했어요.' }] };
  }
  const median = casePerM2.length % 2
    ? casePerM2[(casePerM2.length - 1) / 2]
    : (casePerM2[casePerM2.length / 2 - 1] + casePerM2[casePerM2.length / 2]) / 2;
  const ratio = subjPerM2 / median;
  // 비율 낮을수록(쌀수록) 높은 점수.
  const stars = tableScore(ratio, [[0.70, 5.0], [0.85, 4.5], [0.95, 4.0], [1.05, 3.0], [1.15, 2.5], [1.30, 2.0], [1.50, 1.5], [Infinity, 1.0]]);
  const diff = Math.round((ratio - 1) * 100);
  const cmp = diff <= 0 ? `약 ${Math.abs(diff)}% 낮음` : `약 ${diff}% 높음`;
  return {
    ...base, available: true, score: stars,
    metrics: [{ key: 'ppp', label: '대지면적 평당가 비교', score: stars, available: true,
      evidence: `주변 ${casePerM2.length}건 중위 ${wonPerPyeong(median)} · 이 매물 ${wonPerPyeong(subjPerM2)} (${cmp} · 대지면적 기준${casePerM2.length === 1 ? ' · 비교 1건' : ''}${mixed ? ' · 종류 다른 실거래 포함' : ''})` }],
  };
}

// ---------- B. 개발 여력 ----------
function buildCategory(listing, context) {
  const base = { key: 'build', label: '개발 여력', weight: 0.40 };
  const facts = contextFacts(context);
  const listingFar = num(listing?.farLimit);
  const zone = zoneFactsOf(listing);
  const allowedFar = facts.allowedFar ?? listingFar ?? (zone ? zone.far : null);
  const currentFar = num(listing?.currentFar) ?? num(listing?.buildingFacts?.farPercent)
    ?? (num(listing?.floorAreaM2) > 0 && num(listing?.areaM2) > 0 ? Math.round(num(listing.floorAreaM2) / num(listing.areaM2) * 100) : null);
  const roadWidth = num(context?.road?.widthM) ?? num(listing?.roadWidthM) ?? num(listing?.auction?.roadWidthM);
  const bcr = facts.bcr ?? num(listing?.bcrLimit);
  const heightLimit = facts.heightLimit ?? num(listing?.heightLimit);

  const metrics = [];

  // B1 여유 용적률
  let b1 = null;
  if (allowedFar != null) {
    if (currentFar != null) {
      const remaining = allowedFar - currentFar;
      b1 = tableScore(remaining, [[-0.001, 1.0], [25, 2.0], [50, 2.5], [100, 3.0], [150, 4.0], [200, 4.5], [Infinity, 5.0]]);
      metrics.push({ key: 'far', label: '여유 용적률', score: b1, available: true,
        evidence: `허용 ${allowedFar}% · 현재 ${currentFar}% → 여유 ${round1(remaining)}%` });
    } else {
      metrics.push({ key: 'far', label: '허용 용적률', score: null, available: false, evidence: `허용 ${allowedFar}% · 현재 용적률 미확인` });
    }
  } else {
    metrics.push({ key: 'far', label: '여유 용적률', score: null, available: false, evidence: '허용 용적률 자료 없음' });
  }

  // B2 도로폭
  let b2 = null;
  if (roadWidth != null) {
    b2 = roadWidth >= 12 ? 5.0 : roadWidth >= 8 ? 4.0 : roadWidth >= 6 ? 3.0 : roadWidth >= 4 ? 2.0 : 1.0;
    metrics.push({ key: 'road', label: '도로폭', score: b2, available: true, evidence: `인접 도로 약 ${roadWidth}m` });
  } else {
    metrics.push({ key: 'road', label: '도로폭', score: null, available: false, evidence: '도로폭 자료 없음' });
  }

  // B3 규제 완화(건폐율·높이)
  let b3 = null;
  if (bcr != null || heightLimit != null) {
    const bcrScore = bcr == null ? 3.0 : (bcr >= 60 ? 4.5 : bcr >= 50 ? 3.5 : 2.5);
    const heightScore = heightLimit == null ? 3.0 : (heightLimit >= 60 ? 4.5 : heightLimit >= 30 ? 3.5 : 2.0);
    const parts = [];
    if (bcr != null) parts.push(`허용 건폐율 ${bcr}%`);
    if (heightLimit != null) parts.push(`높이제한 ${heightLimit}m`);
    b3 = round1(bcrScore * 0.5 + heightScore * 0.5);
    metrics.push({ key: 'regulation', label: '건폐율·높이', score: b3, available: true, evidence: parts.join(' · ') });
  } else {
    metrics.push({ key: 'regulation', label: '건폐율·높이', score: null, available: false, evidence: '건폐율·높이 자료 없음' });
  }

  // B4 구역·특구·재개발 가감
  let mod = 0; const zoneParts = [];
  if (facts.inZone('tourism')) { mod += 0.5; zoneParts.push('관광숙박특화구역'); }
  if (facts.planNames.some(n => /재개발|도시정비/.test(n))) { mod += 0.7; zoneParts.push('도시정비형 재개발구역'); }
  else if (facts.inZone('district-plan') || facts.planNames.length) { mod += 0.3; zoneParts.push('지구단위계획구역'); }
  if (facts.inZone('education')) { mod -= 0.7; zoneParts.push('교육환경보호구역'); }
  if (facts.inZone('heritage')) { mod -= 1.0; zoneParts.push('문화재보존구역'); }
  const b4Available = zoneParts.length > 0;
  const b4 = b4Available ? clamp(3.0 + mod, 0, 5) : null;
  metrics.push({ key: 'zones', label: '구역·특구·재개발', score: b4, available: b4Available,
    evidence: zoneParts.length ? zoneParts.join(' · ') : '해당 구역 없음(중립)' });

  // 가중 합(자료 있는 지표만)
  const weighted = [];
  if (b1 != null) weighted.push([b1, 0.45]);
  if (b2 != null) weighted.push([b2, 0.25]);
  if (b3 != null) weighted.push([b3, 0.10]);
  if (b4 != null) weighted.push([b4, 0.20]);
  if (!weighted.length) return { ...base, available: false, score: null, metrics };
  const wsum = weighted.reduce((s, [, w]) => s + w, 0);
  const score = round1(weighted.reduce((s, [v, w]) => s + v * w, 0) / wsum);
  return { ...base, available: score != null, score, metrics };
}

// ---------- C. 입지·상권 ----------
function locationCategory(listing, commercial, surrounding) {
  const base = { key: 'location', label: '입지·상권', weight: 0.25 };
  const metrics = [];

  // C1 최근접 지하철역
  const stations = (surrounding?.projects || []).filter(p => p.type === '지하철역' && num(p.distanceM) != null);
  let c1 = null;
  if (stations.length) {
    const nearest = Math.min(...stations.map(p => Number(p.distanceM)));
    c1 = tableScore(nearest, [[200, 5.0], [350, 4.5], [500, 4.0], [700, 3.0], [1000, 2.0], [Infinity, 1.0]]);
    const name = stations.find(p => Number(p.distanceM) === nearest)?.name || '지하철역';
    metrics.push({ key: 'station', label: '지하철역', score: c1, available: true, evidence: `${name} 약 ${nearest}m` });
  } else {
    metrics.push({ key: 'station', label: '지하철역', score: null, available: false, evidence: '반경 내 지하철역 자료 없음' });
  }

  // C2 상권
  const n = commercial?.nearest;
  let c2 = null;
  if (n) {
    const dist = num(n.distanceM);
    const type = String(n.type || '');
    const strong = /발달상권|관광특구/.test(type);
    let s = strong ? 4.5 : 3.5;
    if (dist != null) s += dist <= 300 ? 0.5 : dist <= 700 ? 0 : -0.5;
    if (num(n.monthlySalesWon) > 0 || num(n.population) > 0) s += 0.3;
    c2 = clamp(round1(s), 1, 5);
    const bits = [`${n.name || '상권'}${type ? `(${type})` : ''}`];
    if (dist != null) bits.push(`약 ${dist}m`);
    const sales = num(n.monthlySalesWon), pop = num(n.population);
    if (sales > 0) bits.push(`월매출 약 ${(sales / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}억(상권 합계)`);
    if (pop > 0) bits.push(`유동인구 약 ${Math.round(pop / 1e4).toLocaleString('ko-KR')}만`);
    metrics.push({ key: 'commercial', label: '상권', score: c2, available: true, evidence: bits.join(' · ') });
  } else {
    metrics.push({ key: 'commercial', label: '상권', score: null, available: false, evidence: '반경 내 상권 자료 없음' });
  }

  // C3 주변 개발 이슈
  const devs = (surrounding?.projects || []).filter(p => ['도시개발', '도시철도', '공공사업', '관광공연장'].includes(p.type) && num(p.distanceM) != null);
  let c3 = 3.0;
  if (devs.length) {
    devs.sort((a, b) => Number(a.distanceM) - Number(b.distanceM));
    const d = devs[0];
    c3 = Number(d.distanceM) <= 500 ? 4.0 : 3.5;
    metrics.push({ key: 'development', label: '주변 개발', score: c3, available: true, evidence: `${d.name || d.type}(${d.type}) 약 ${Math.round(d.distanceM)}m` });
  } else {
    metrics.push({ key: 'development', label: '주변 개발', score: null, available: false, evidence: '표시할 주변 사업 없음' });
  }

  const weighted = [];
  if (c1 != null) weighted.push([c1, 0.50]);
  if (c2 != null) weighted.push([c2, 0.35]);
  if (devs.length) weighted.push([c3, 0.15]);
  if (!weighted.length) return { ...base, available: false, score: null, metrics };
  const wsum = weighted.reduce((s, [, w]) => s + w, 0);
  const score = round1(weighted.reduce((s, [v, w]) => s + v * w, 0) / wsum);
  return { ...base, available: score != null, score, metrics };
}

function gradeOf(stars) {
  if (stars >= 4.5) return '최상';
  if (stars >= 3.5) return '우수';
  if (stars >= 2.5) return '보통';
  if (stars >= 1.5) return '주의';
  return '낮음';
}

export function computeTeojabiScore({ listing, context, nearby, commercial, surrounding } = {}) {
  if (!listing) return { status: 'unavailable', score: null, grade: '', categories: [], note: NOTE };
  const categories = [
    priceCategory(listing, nearby),
    buildCategory(listing, context),
    locationCategory(listing, commercial, surrounding),
  ];
  const active = categories.filter(c => c.available && c.score != null);
  if (!active.length) return { status: 'pending', score: null, grade: '', categories, note: NOTE };
  const wsum = active.reduce((s, c) => s + c.weight, 0);
  const raw = active.reduce((s, c) => s + c.score * c.weight, 0) / wsum;
  const score = roundHalf(clamp(raw, 0, 5));
  const dataQuality = {};
  for (const c of categories) dataQuality[c.key] = c.available ? 'ok' : 'missing';
  return { status: 'ready', score, grade: gradeOf(score), categories, dataQuality, note: NOTE };
}

export const NOTE = '공공데이터와 당사 계산을 바탕으로 한 참고 지표이며, 감정평가·매매가·수익률·적정 입찰가가 아닙니다.';
