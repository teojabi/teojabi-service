import { DISTRICTS } from './policy.mjs';

export const WALK_METERS_PER_MIN = 80;
const BROAD_ZONE = [['주거지역', '주거'], ['상업지역', '상업'], ['공업지역', '공업'], ['녹지지역', '녹지']];
const COMMERCIAL_TYPES = ['골목상권', '전통시장', '발달상권', '관광특구'];
const AUCTION_USAGES = ['상가', '근린시설', '근린생활시설', '오피스텔', '업무', '업무시설', '단독주택', '주택', '도시형생활주택', '다가구', '다세대', '연립주택', '빌라', '대지', '임야', '토지'];
const AUCTION_SOURCES = ['court', 'onbid', 'both'];
const AUCTION_DEAL_TYPES = ['whole', 'floor', 'unit', 'land'];
const AUCTION_DEAL_LABEL = { whole: '건물 통', floor: '층', unit: '호실', land: '토지' };
const ORIGIN_LABEL = { premium: '터잡이 추천 매물', registered: '터잡이 등록 매물', disco: '디스코 매물', naver: '네이버 매물' };
const won = value => Math.round(Number(value) * 100000000);
const m2 = (value, unit) => Math.round((unit === '평' ? Number(value) * 3.305785 : Number(value)) * 100) / 100;

// Deterministic Korean condition extraction. This runs first and always wins over saved conditions.
export function ruleFilters(text) {
  const t = String(text || '').slice(0, 500);
  const filters = {};
  const districts = DISTRICTS.filter(name => t.includes(name) || (name.endsWith('구') && name.length >= 3 && t.includes(name.slice(0, -1))));
  if (districts.length) filters.districts = districts;
  // 상권 조건: 유형 / 월매출 / 유동인구 / 상권명. (상권 검색은 AI 채팅에서만 노출된다)
  const commercialTypes = COMMERCIAL_TYPES.filter(type => t.includes(type));
  if (commercialTypes.length) filters.commercialType = commercialTypes;
  const salesMatch = t.match(/(?:월\s*매출|상권\s*매출|매출)\s*(\d+(?:\.\d+)?)\s*억/);
  if (salesMatch) filters.minCommercialSalesWon = won(salesMatch[1]);
  const popMatch = t.match(/(?:유동\s*인구|유동인구)\s*(\d+(?:\.\d+)?)\s*만/);
  if (popMatch) filters.minCommercialPopulation = Math.round(Number(popMatch[1]) * 10000);
  // "이 주위 상권"처럼 지시어가 붙은 표현을 상권 이름으로 잘못 잡지 않는다.
  const genericCommercial = /여기|저기|거기|이곳|요기|주위|주변|근처|동네|이쪽|저쪽|(?:^|\s)이(?:\s|$)|(?:^|\s)그(?:\s|$)|(?:^|\s)저(?:\s|$)|(?:^|\s)어느(?:\s|$)|(?:^|\s)어떤(?:\s|$)|(?:^|\s)무슨(?:\s|$)/;
  const cname = t.match(/([가-힣A-Za-z0-9]{2,20}(?:\s*\d+번)?)\s*상권/);
  if (cname && !COMMERCIAL_TYPES.some(type => cname[1].includes(type.replace('상권', ''))) && !genericCommercial.test(cname[1].trim()) && !DISTRICTS.includes(cname[1].trim())) {
    filters.commercialName = cname[1].trim();
  }
  // "상업지역", "특화구역" 같은 용도·구역 표현을 역 이름으로 잘못 잡지 않도록 제거한 뒤 역을 찾는다.
  // "홍대입구역"의 "입구역"처럼 역 이름 안의 글자를 지우지 않도록 구역은 알려진 접미사만 지운다.
  const stationText = t.replace(/[가-힣]{0,8}지역/g, ' ').replace(/(특화|보호|보존|계획|정비|개발|관리|시설|유원)구역/g, ' ');
  const station = stationText.match(/([가-힣A-Za-z0-9]{2,12})\s*역/);
  if (station && !filters.commercialName) filters.stationName = station[1];
  const walk = t.match(/도보\s*(\d+)\s*분/);
  if (walk) filters.maxDistanceM = Number(walk[1]) * WALK_METERS_PER_MIN;
  else {
    const meters = t.match(/(\d+)\s*(?:m|미터)\s*(?:안|이내|이하)?/);
    if (meters && filters.stationName) filters.maxDistanceM = Number(meters[1]);
  }
  // 매출 억은 예산으로 해석하지 않는다.
  const budgetText = t.replace(/(?:월\s*매출|상권\s*매출|매출)\s*\d+(?:\.\d+)?\s*억/g, '');
  const budget = budgetText.match(/(\d+(?:\.\d+)?)\s*억/);
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
  const dong = t.match(/([가-힣]{1,5}[0-9]가|[가-힣]{1,6}동)(?=[\s,.]|이|에|은|는|쪽|근처|$)/);
  if (dong) filters.neighborhood = dong[1];
  // 법원경매·온비드 공매 물건 검색. 매물과 의미가 달라 auction 하위 객체로 담는다.
  const wantsCourt = /경매|법원경매|법원\s*경매/.test(t);
  const wantsOnbid = /공매|온비드/.test(t);
  if (wantsCourt || wantsOnbid) {
    const source = wantsCourt && wantsOnbid ? 'both' : wantsOnbid ? 'onbid' : 'court';
    const auction = { enabled: true, source, usages: [] };
    const usageOptions = [['오피스텔','오피스텔'],['근린생활시설','근린생활시설'],['근린','근린생활시설'],['상가','상가'],['업무시설','업무시설'],['업무','업무'],['도시형생활주택','도시형생활주택'],['단독주택','단독주택'],['단독','단독주택'],['다가구','다가구'],['다세대','다세대'],['연립','연립주택'],['빌라','빌라'],['주택','주택'],['대지','대지'],['임야','임야'],['토지','토지']];
    const usage = usageOptions.find(([needle]) => t.includes(needle));
    if (usage) auction.usages.push(usage[1]);
    const minPrice = t.match(/(?:최저가|최저매각|최저입찰|최저)\s*(\d+(?:\.\d+)?)\s*억/);
    if (minPrice) auction.maxPriceWon = won(minPrice[1]);
    const rate = t.match(/(?:감정가|최저가율|낙찰가율)\s*(?:대비\s*)?(\d+(?:\.\d+)?)\s*(?:%|퍼센트|프로)/);
    if (rate) auction.maxBidRate = Number(rate[1]);
    // 거래 단위(건물 통·층·호실·토지).
    if (/건물\s*통|통\s*건물|(?:^|\s)통(?:째|으로|인|$)/.test(t)) auction.dealType = 'whole';
    else if (/층/.test(t)) auction.dealType = 'floor';
    else if (/호실|(?:^|\s)\d+\s*호/.test(t)) auction.dealType = 'unit';
    else if (/토지|땅|대지|임야/.test(t)) auction.dealType = 'land';
    // "경매 5억 이하"처럼 금액만 말하면 예산을 최저가에도 적용한다.
    if (!auction.maxPriceWon && filters.budgetWon) auction.maxPriceWon = filters.budgetWon;
    filters.auction = auction;
  }
  return filters;
}

export function hasMeaningfulFilters(filters) {
  return Object.keys(filters || {}).some(key => !['limit', 'fromCondition'].includes(key) &&
    (Array.isArray(filters[key]) ? filters[key].length : filters[key] !== null && filters[key] !== undefined && filters[key] !== ''));
}

// "이 주위 상권 알려줘"처럼 현재 매물 기준으로 묻는 질문. 매물 맥락이 없으면 검색 대신 안내한다.
export function isRelativeQuestion(text) {
  const t = String(text || '');
  return /여기|저기|거기|이곳|요기|주위|주변|근처|동네|이쪽|저쪽|이\s*매물|이\s*건물|이\s*땅|이\s*필지|이\s*상권|이\s*근처/.test(t) &&
    /상권|상가|번화가|실거래|거래|시세|시가|역|지하철|교통|분위기|유동인구|매출|동네/.test(t);
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
  'Q. 터잡이는 어떤 서비스인가요? → 지도 기반으로 매물을 찾고, 용도지역·도로·구역 같은 공공자료와 주변 실거래를 결합해 공간을 고를 때 필요한 정보를 한곳에 모아 보여주는 부동산 서비스예요.',
  'Q. 어떤 매물을 찾을 수 있나요? → 터잡이가 선별한 매물과 기존 등록 매물을 함께 볼 수 있어요. 목적·예산·지역·대지면적·용도지역으로 찾고, 가격과 판매 여부는 상담 때 확인해요.',
  'Q. 검색 조건을 바꾸려면? → 목록 위 예산·지역·목적 조건을 누르면 바로 바뀌고, 가격순 정렬·목록 접기로 지도를 넓게 볼 수 있어요. 같은 브라우저는 마지막 조건을 기억해요.',
  'Q. 가격 비교는? → 매물 상세에서 가까운 필지 실거래를 최대 5곳 확인해요. 최근 36개월, 반경 500m에서 부족하면 1km까지. 거리순 참고자료이며 시세를 보증하지 않아요.',
  'Q. 방문 전 확인? → 지도·네이버 거리뷰로 주변을 보고, 보유 토지대장·건축물대장을 펼쳐볼 수 있어요. 원본 발급 서류는 아니에요.',
  'Q. 신축 조건? → 신축 목적 선택 시 용도·도로폭·교육보호구역/문화재보존구역 제외, 호텔은 관광숙박특화구역 우선 조건을 고를 수 있어요. 실제 건축 가능 여부는 별도 검토가 필요해요.',
  'Q. 기존 건물·여러 필지 검토? → 건물·토지에서 지도로 필지를 선택하면 주소가 자동 입력되고, 여러 필지 선택과 공부상 면적 합계 적용이 가능해요.',
  'Q. 공사비 계산? → 대지면적×용적률 검토 연면적 기준, 평당 공사비 기본 1,000만원(변경 가능), 설계비는 공사비의 5%로 표시해요. 토지비·철거비·세금을 포함한 총사업비는 아니에요.',
  'Q. 대장 보기? → 서비스가 보유한 건축물대장·토지대장 표제부 자료를 매물 상세에서 확인할 수 있어요. 등기사항증명서는 주소를 복사해 인터넷등기소에서 직접 열람·발급해요.',
  'Q. 저장·찜 기능? → 비회원의 검색 조건과 찜은 현재 브라우저에 임시 저장돼요. 로그인하면 관심 조건·찜한 매물·매물 의견·신축 검토 기록을 계정에서 관리할 수 있어요.',
  'Q. 회원가입·로그인? → 로그인하거나 3초 간편가입으로 시작할 수 있어요. 로그인하면 찜한 매물과 저장 조건, 신축 검토 기록을 계정에서 이어서 볼 수 있어요.',
  'Q. 요금·구독·결제·환불? → 지금은 베타 서비스로 신규 유료 구독 신청과 결제를 받지 않아요. 기존 결제·환불 문의는 teojabi@gmail.com 또는 카카오톡 상담으로 연락해 주세요.',
  'Q. 상담·문의? → 터잡이 고객센터는 teojabi@gmail.com, 070-8919-4609, 카카오톡 상담 채널이에요. 매물 상세에서 상담 정보를 복사해 문의할 수도 있어요.',
  'Q. 개인정보·약관? → 이용약관·개인정보처리방침·환불정책은 페이지 하단 "이용 정책"에서 확인할 수 있어요.',
].join('\n');

const SPATIAL_KEYS = ['preferTourism', 'excludeEducation', 'excludeHeritage'];

// 자주 묻는 간단한 사이트 질문은 모델 없이 바로 답한다(빠르고 정확하게).
const SITE_FAQ = [
  { re: /대장|건축물대장|토지대장|등기/, reply: '건축물대장·토지대장은 매물 상세에서 펼쳐볼 수 있어요. 등기사항증명서는 주소를 복사해 인터넷등기소에서 직접 열람·발급해요. 보유 자료라 원본 발급 서류는 아니에요.' },
  { re: /신축|공사비|건폐율|용적률|설계비|건축\s*가능/, reply: '신축 검토는 대지면적·용적률·건폐율·높이로 규모와 공사비를 개략 계산한 참고 자료예요. 평당 공사비 기본 1,000만원, 설계비는 공사비의 5%로 표시해요. 지구단위계획구역이면 매물별 "이 매물 물어보기 > 📐 용적률·높이 기준"이나 상세페이지에서 구역의 기준 용적률·건폐율·높이제한도 확인할 수 있어요. 실제 건축 가능 여부는 별도 검토가 필요해요.' },
  { re: /실거래|거래가|시세\s*비교/, reply: '매물 상세에서 가까운 실거래를 최대 5건까지 볼 수 있어요. 거래일·대지면적·거래가격을 함께 비교할 수 있고, 거리순 참고자료라 시세를 보증하지는 않아요.' },
  { re: /가격|호가|시세|판매\s*여부/, reply: '표시 가격은 수집·등록 당시의 매매 호가예요. 가격 변경이나 거래 완료 여부는 상담 과정에서 다시 확인해요. 실제 거래 조건은 담당자에게 확인해 주세요.' },
  { re: /보호구역|규제|용도지역|지구단위|문화재|도로폭/, reply: '보유한 공공데이터로 용도지역·도로폭·교육환경보호구역·문화재 관련 구역·관광숙박특화구역·지구단위계획 정보를 보여드려요. 지구단위계획구역은 기준 용적률·건폐율·높이제한도 함께 표시해요. 교육보호구역·문화재보존구역 제외나 관광숙박특화구역 우선 조건은 메인 화면의 "건물 찾기 > 신축 검토"에서 설정해요.' },
  { re: /저장|찜|보관|북마크/, reply: '비회원의 검색 조건과 찜은 현재 브라우저에 임시 저장돼요. 로그인하면 관심 조건·찜한 매물·매물 의견·신축 검토 기록을 계정에서 관리할 수 있어요.' },
  { re: /회원|로그인|가입|계정/, reply: '로그인하거나 3초 간편가입으로 시작할 수 있어요. 로그인하면 찜한 매물과 저장 조건, 신축 검토 기록을 계정에서 이어서 볼 수 있어요.' },
  { re: /요금|가격표|구독|결제|유료|환불|무료/, reply: '지금은 베타 서비스로 신규 유료 구독 신청과 결제를 받지 않아요. 기존 결제·환불 문의는 teojabi@gmail.com 또는 카카오톡 상담으로 연락해 주세요.' },
  { re: /상담|문의|연락|전화|카카오|이메일|고객센터/, reply: '터잡이 고객센터는 teojabi@gmail.com, 070-8919-4609, 카카오톡 상담 채널이에요. 매물 상세에서 상담 정보를 복사해 문의할 수도 있어요.' },
  { re: /개인정보|약관|정책/, reply: '이용약관·개인정보처리방침·구독서비스·환불정책은 페이지 하단 "이용 정책"에서 확인할 수 있어요.' },
  { re: /추천|선별|별표/, reply: '터잡이 추천은 터잡이가 직접 검토해 별표로 구분한 매물이에요. 지도 상단의 "터잡이 추천 전체" 버튼으로 위치를 한 번에 볼 수 있어요.' },
  { re: /(검색|조건|필터).*(방법|어떻게|바꾸|설정|변경|추가|삭제)|어떻게\s*(찾|검색|이용|사용)/, reply: '목록 위 예산·지역·목적 조건을 누르면 바로 바뀌고, 가격순 정렬과 목록 접기로 지도를 넓게 볼 수 있어요. 로그인하면 마지막 조건을 계정에 저장해 이어서 볼 수 있어요.' },
  { re: /(매물|물건).*(종류|뭐가|무엇|어떤|얼마나)/, reply: '터잡이가 검토해 등록한 선별 매물과 터잡이 추천 매물을 볼 수 있어요. 목적·예산·지역·대지면적·용도지역 조건으로 결과를 좁힐 수 있어요.' },
  { re: /터잡이|이\s*사이트|서비스|(무엇|뭐|어떤).*(할\s*수|가능|있어요)/, reply: '터잡이는 지도 기반으로 매물을 찾고, 용도지역·도로·구역 같은 공공자료와 주변 실거래를 결합해 공간을 고를 때 필요한 정보를 한곳에 모아 보여주는 부동산 서비스예요. 원하는 지역·예산·면적 조건을 말씀해 주시면 매물도 찾아드릴게요.' },
];

function isSiteQuestion(text) {
  return /\?|？|뭐|무엇|어떻게|어떤|왜|어디|언제|얼마|가능|되나|인가|있나|없나|알려|궁금|차이|뜻|의미|소개|사용법|이용\s*방법/.test(text);
}

export function siteFaqAnswer(text) {
  const t = String(text || '');
  if (!isSiteQuestion(t)) return null;
  const hit = SITE_FAQ.find(item => item.re.test(t));
  return hit ? hit.reply : null;
}

// Free-form text goes to Gemini only when the rule parser found nothing.
export async function geminiFilters(message, key, condition) {
  if (!key) return null;
  const schema = `{"districts":["자치구"],"neighborhood":"동이름(예: 성산동)","q":"키워드","budgetWon":숫자(원),"minAreaM2":숫자,"maxAreaM2":숫자,"kind":"land|building","zones":["주거지역|상업지역|공업지역|녹지지역"],"stationName":"역이름","maxDistanceM":숫자,"minRoadWidthM":숫자,"purpose":"new-build","commercialType":["골목상권|전통시장|발달상권|관광특구"],"commercialName":"상권이름","minCommercialSalesWon":숫자(원),"minCommercialPopulation":숫자,"commercialRadiusM":숫자}`;
  const prompt = [
    '너는 터잡이(teojabi.com) 부동산 서비스의 안내 도우미다. 반드시 JSON 객체 하나만 출력한다(설명·인사말·코드블록 금지).',
    '하는 일은 두 가지뿐이다: (1) 매물 검색 조건 추출, (2) 터잡이 서비스 사용법·기능 안내.',
    '매물 검색이면 filters에 조건만 넣는다. 값이 없는 항목은 넣지 않는다. 도보 N분은 maxDistanceM = N*80(미터), N미터는 그대로. 가격 "N억"은 원 단위로 바꾼다(예: 30억 → 3000000000). 평은 그대로 넣지 말고 ㎡로 환산한다(1평=3.305785㎡).',
    '동 이름(예: 성산동, 종로5가)은 neighborhood에 넣는다. 구와 동을 함께 말하면(예: "마포구 성산동") districts와 neighborhood 모두 넣는다.',
    '상권 조건(골목상권·전통시장·발달상권·관광특구, 상권 월매출, 상권 유동인구, 상권 이름)은 commercialType·minCommercialSalesWon·minCommercialPopulation·commercialName 으로 넣는다. 매출 "5억 이상"은 minCommercialSalesWon=500000000, 유동인구 "30만 이상"은 minCommercialPopulation=300000 이다.',
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
  if (typeof raw.neighborhood === 'string' && raw.neighborhood.trim()) out.neighborhood = raw.neighborhood.trim().slice(0, 12);
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
  // 경매·공매 물건 조건(매물과 분리된 하위 객체).
  const auctionSource = raw.auction && typeof raw.auction === 'object' && !Array.isArray(raw.auction) ? raw.auction : raw.auction === true ? { enabled: true } : null;
  if (auctionSource && auctionSource.enabled === true) {
    const usages = Array.isArray(auctionSource.usages) ? [...new Set(auctionSource.usages.filter(u => typeof u === 'string' && AUCTION_USAGES.includes(u)))].slice(0, 6) : [];
    const auction = { enabled: true, usages };
    if (AUCTION_SOURCES.includes(auctionSource.source)) auction.source = auctionSource.source;
    if (AUCTION_DEAL_TYPES.includes(auctionSource.dealType)) auction.dealType = auctionSource.dealType;
    const price = Number(auctionSource.maxPriceWon);
    if (Number.isSafeInteger(price) && price > 0) auction.maxPriceWon = price;
    const rate = Number(auctionSource.maxBidRate);
    if (Number.isFinite(rate) && rate > 0 && rate <= 100) auction.maxBidRate = Math.round(rate * 100) / 100;
    out.auction = auction;
  }
  // 신축 구역 조건은 기존 검색기와 같은 플래그 이름을 쓴다.
  for (const key of ['preferTourism', 'excludeEducation', 'excludeHeritage']) {
    if (raw[key] === true) out[key] = true;
  }
  if (Array.isArray(raw.zones)) {
    const list = BROAD_ZONE.map(z => z[0]).filter(z => raw.zones.includes(z));
    if (list.length) out.zones = list;
  }
  if (typeof raw.stationName === 'string' && raw.stationName.trim()) out.stationName = raw.stationName.trim().slice(0, 12);
  // 상권 조건 (AI 채팅 전용)
  if (typeof raw.commercialName === 'string' && raw.commercialName.trim()) out.commercialName = raw.commercialName.trim().slice(0, 30);
  if (typeof raw.commercialCode === 'string' && raw.commercialCode.trim()) out.commercialCode = raw.commercialCode.trim().slice(0, 20);
  if (Array.isArray(raw.commercialType)) {
    const list = COMMERCIAL_TYPES.filter(type => raw.commercialType.includes(type));
    if (list.length) out.commercialType = [...new Set(list)];
  }
  for (const [key, max] of [['minCommercialSalesWon', 1e13], ['minCommercialPopulation', 1e9], ['commercialRadiusM', 2000]]) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0 && value <= max) out[key] = Math.round(value);
  }
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
    mainUse: row.mainUse || '', farPercent: row.farPercent ?? null, approvalDate: row.approvalDate || '', buildingFacts: row.buildingFacts || null,
    kind: row.kind, kindConfirmed: true, areaSource: 'listing', floorAreaSource: 'listing', locationStatus: 'pin-estimated',
    zoning, development: null, nearbyTransactions: { status: 'unavailable', cases: [] },
    station: row.station || null, origin, groupKey: row.id,
    commercial: row.commercial || null,
  };
}

// 법원 소재지를 대지위치(지번)와 상세주소(건물·호)로 나눈다.
const splitAuctionAddress = row => {
  const full = String(row.full_address || '').trim(), lot = String(row.lot_no || '').trim();
  let land = full, detail = String(row.building_list || '').trim();
  if (lot) { const idx = full.indexOf(lot); if (idx >= 0) { land = full.slice(0, idx + lot.length).trim(); const rest = full.slice(idx + lot.length).trim(); if (rest) detail = rest; } }
  if (!land) land = [row.sido, row.sigu, row.dong, lot].map(v => String(v || '').trim()).filter(Boolean).join(' ');
  return { land, detail };
};
// 경매 물건(auction_item)을 건물찾기 카드·지도가 쓰는 매물 모양으로 맞춘다.
export function viewAuctionRow(row) {
  const usage = String(row.usage_name || ''), zone = String(row.use_zone || '');
  const broad = BROAD_ZONE.find(z => zone.includes(z[1]));
  const zoning = zone ? { status: 'matched', groups: broad ? [broad[0]] : [], entries: [{ name: zone }] } : { status: 'missing', groups: [], entries: [] };
  const id = `auction:${row.docid}`, addr = splitAuctionAddress(row);
  return {
    id, source: 'auction', sourceId: String(row.docid), sourceUrl: row.source_url || 'https://www.courtauction.go.kr/', cohort: 'auction', origin: 'auction',
    district: row.sigu || '', neighborhood: row.dong || '', address: addr.land, detailAddress: addr.detail,
    pnu: row.pnu || null, position: Number.isFinite(row.lat) && Number.isFinite(row.lng) ? { lat: Number(row.lat), lng: Number(row.lng) } : null,
    priceWon: row.min_price == null ? null : Number(row.min_price), areaM2: row.area_max == null ? null : Number(row.area_max), floorAreaM2: null,
    description: '', floorInfo: '', kind: /토지|대지|임야|전답|잡종지|답|전/.test(usage) ? 'land' : 'building', kindConfirmed: true,
    areaSource: 'listing', floorAreaSource: 'listing', locationStatus: 'pin-estimated', zoning, development: null, nearbyTransactions: { status: 'unavailable', cases: [] },
    groupKey: id,
    auction: {
      docid: String(row.docid), usageName: usage, minPrice: row.min_price == null ? null : Number(row.min_price), appraisedWon: row.appraised_amt == null ? null : Number(row.appraised_amt),
      failCount: row.fail_count == null ? null : Number(row.fail_count), saleDate: row.sale_date || '', saleHour: row.sale_hour || '', courtName: row.court_name || '', deptName: row.dept_name || '',
      caseNo: row.case_no || '', notiMinRate: row.noti_min_rate == null ? null : Number(row.noti_min_rate), roadWidthM: row.road_width_m == null ? null : Number(row.road_width_m),
      sourceUrl: row.source_url || 'https://www.courtauction.go.kr/',
    },
  };
}

// 공매(온비드) 물건(onbid_item)을 건물찾기 카드·지도가 쓰는 매물 모양으로 맞춘다.
export function viewOnbidRow(row) {
  const usage = String(row.usg_mcls_nm || row.usg_lcls_nm || '');
  const land = /토지|대지|임야|전답|잡종지|과수원|답/.test(usage);
  const id = `onbid:${row.cltr_mng_no}::${row.pbct_cdtn_no}`;
  return {
    id, source: 'onbid', sourceId: String(row.cltr_mng_no), sourceUrl: 'https://www.onbid.co.kr/', cohort: 'onbid', origin: 'onbid',
    district: row.sigu || '', neighborhood: row.dong || '', address: row.full_address || '', detailAddress: '',
    pnu: /^11\d{17}$/.test(String(row.pnu || '')) ? row.pnu : null,
    position: Number.isFinite(row.lat) && Number.isFinite(row.lng) ? { lat: Number(row.lat), lng: Number(row.lng) } : null,
    priceWon: row.lowst_bid_prc == null ? null : Number(row.lowst_bid_prc), areaM2: null, floorAreaM2: null,
    description: '', floorInfo: '', kind: land ? 'land' : 'building', kindConfirmed: true,
    areaSource: 'listing', floorAreaSource: 'listing', locationStatus: 'pin-estimated',
    zoning: { status: 'missing', groups: [], entries: [] }, development: null, nearbyTransactions: { status: 'unavailable', cases: [] },
    groupKey: id,
    auction: {
      docid: id, usageName: usage, minPrice: row.lowst_bid_prc == null ? null : Number(row.lowst_bid_prc), appraisedWon: row.appraised_amt == null ? null : Number(row.appraised_amt),
      failCount: null, saleDate: row.bid_end_dt || '', saleHour: '', courtName: '한국자산관리공사', deptName: row.prpt_div_nm || '',
      caseNo: row.cltr_mng_no || '', notiMinRate: row.apsl_ctrs_lowst_ratio == null ? null : Number(row.apsl_ctrs_lowst_ratio), roadWidthM: null,
      dealType: row.deal_type || '', sourceUrl: 'https://www.onbid.co.kr/',
    },
  };
}

export function buildAuctionResult(filters, data) {
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map(viewAuctionRow);
  const total = Number(data?.total || rows.length);
  const groups = rows.map(listing => ({ key: listing.id, pnu: listing.pnu, representative: listing, listings: [listing] }));
  const described = describe(filters);
  const reply = total === 0
    ? `${described.length ? described.join(' · ') + ' 조건에 맞는' : '조건에 맞는'} 경매 물건을 찾지 못했어요. 지역·용도·가격 조건을 바꿔볼까요?`
    : `조건에 맞는 경매 물건 ${total.toLocaleString('ko-KR')}건 중 ${Math.min(5, groups.length)}건을 보여드릴게요. 대법원 법원경매정보 공시 기준이며, 권리분석·적정 입찰가는 제공하지 않아요.`;
  return {
    status: 'ready', reply, filters, chips: chipList(filters), total, groups,
    originTotals: { premium: 0, registered: 0, disco: 0, naver: 0, auction: total },
    station: null, districts: [], commercial: null, suggestions: [], relaxations: [], unsupported: null, searchedAt: new Date().toISOString(),
  };
}

// 매물(네이버)과 경매(법원)·공매(온비드) 결과를 한 화면에 함께 담는다. AI가 함께 추천하는 경로.
export function buildCombinedResult(filters, listingSearch, auctionData, onbidData) {
  const auctionRows = (Array.isArray(auctionData?.rows) ? auctionData.rows : []).map(viewAuctionRow);
  const auctionTotal = auctionData == null ? 0 : Number(auctionData.total || auctionRows.length);
  const auctionGroups = auctionRows.map(listing => ({ key: listing.id, pnu: listing.pnu, representative: listing, listings: [listing] }));
  const onbidRows = (Array.isArray(onbidData?.rows) ? onbidData.rows : []).map(viewOnbidRow);
  const onbidTotal = onbidData == null ? 0 : Number(onbidData.total || onbidRows.length);
  const onbidGroups = onbidRows.map(listing => ({ key: listing.id, pnu: listing.pnu, representative: listing, listings: [listing] }));
  const base = listingSearch
    ? buildResult(filters, listingSearch, null)
    : { status: 'ready', reply: '', filters, chips: chipList(filters), total: 0, groups: [], originTotals: { premium: 0, registered: 0, disco: 0, naver: 0 }, station: null, districts: [], commercial: null, suggestions: [], relaxations: [], unsupported: null, searchedAt: null };
  const groups = [...base.groups, ...auctionGroups, ...onbidGroups];
  const total = Number(base.total || 0) + auctionTotal + onbidTotal;
  const lines = [];
  if (base.total > 0) lines.push(`매물 ${base.total.toLocaleString('ko-KR')}건`);
  if (auctionTotal > 0) lines.push(`법원경매 물건 ${auctionTotal.toLocaleString('ko-KR')}건`);
  if (onbidTotal > 0) lines.push(`온비드 공매 물건 ${onbidTotal.toLocaleString('ko-KR')}건`);
  let reply;
  if (lines.length) {
    reply = `조건에 맞는 결과는 ${lines.join(', ')}이에요. 아래에서 확인해 보세요.`;
    if (auctionTotal > 0 || onbidTotal > 0) reply += ' 법원경매정보·온비드 공시 기준이며, 권리분석·적정 입찰가는 제공하지 않아요.';
  } else {
    reply = base.reply;
  }
  return { ...base, reply, total, groups, originTotals: { ...base.originTotals, auction: auctionTotal, onbid: onbidTotal } };
}

export function describe(filters) {
  const parts = [];
  if (filters.auction?.enabled) {
    parts.push(filters.auction.source === 'onbid' ? '공매 물건' : filters.auction.source === 'both' ? '경매·공매 물건' : '경매 물건');
    if (filters.auction.dealType) parts.push(AUCTION_DEAL_LABEL[filters.auction.dealType] || filters.auction.dealType);
    if (filters.auction.usages?.length) parts.push(filters.auction.usages.join('·'));
    if (filters.auction.maxPriceWon) parts.push(`최저 ${(filters.auction.maxPriceWon / 1e8).toLocaleString('ko-KR')}억 이하`);
    if (filters.auction.maxBidRate) parts.push(`최저가율 ${filters.auction.maxBidRate}% 이하`);
  }
  if (filters.districts?.length) parts.push(filters.districts.join('·'));
  else if (filters.q) parts.push(filters.q);
  if (filters.neighborhood) parts.push(filters.neighborhood);
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
  if (filters.commercialName) parts.push(`${filters.commercialName} 상권 인근`);
  else if (filters.commercialType?.length) parts.push(`${filters.commercialType.join('·')} 인근`);
  else if (filters.commercialCode) parts.push('선택한 상권 인근');
  if (filters.minCommercialSalesWon) parts.push(`상권 월매출 ${(filters.minCommercialSalesWon / 1e8).toLocaleString('ko-KR')}억 이상`);
  if (filters.minCommercialPopulation) parts.push(`상권 유동인구 ${Math.round(filters.minCommercialPopulation / 10000).toLocaleString('ko-KR')}만 이상`);
  if (filters.commercialRadiusM && (filters.commercialName || filters.commercialCode || filters.commercialType?.length)) parts.push(`반경 ${filters.commercialRadiusM}m`);
  return parts;
}

export function chipList(filters) {
  const chips = [];
  if (filters.auction?.enabled) chips.push({ key: 'auction', value: true, label: filters.auction.source === 'onbid' ? '공매 물건' : filters.auction.source === 'both' ? '경매·공매 물건' : '경매 물건', kind: 'value' });
  if (filters.auction?.source) chips.push({ key: 'auctionSource', value: filters.auction.source, label: filters.auction.source === 'onbid' ? '온비드 공매' : filters.auction.source === 'both' ? '경매+공매' : '법원경매', kind: 'value' });
  if (filters.auction?.dealType) chips.push({ key: 'auctionDealType', value: filters.auction.dealType, label: AUCTION_DEAL_LABEL[filters.auction.dealType] || filters.auction.dealType, kind: 'value' });
  (filters.auction?.usages || []).forEach(u => chips.push({ key: 'auctionUsage', value: u, label: u, kind: 'list' }));
  if (filters.auction?.maxPriceWon) chips.push({ key: 'auctionMaxPriceWon', value: filters.auction.maxPriceWon, label: `최저 ${(filters.auction.maxPriceWon / 1e8).toLocaleString('ko-KR')}억 이하`, kind: 'value' });
  if (filters.auction?.maxBidRate) chips.push({ key: 'auctionMaxBidRate', value: filters.auction.maxBidRate, label: `최저가율 ${filters.auction.maxBidRate}% 이하`, kind: 'value' });
  (filters.districts || []).forEach(d => chips.push({ key: 'districts', value: d, label: d, kind: 'list' }));
  if (filters.neighborhood) chips.push({ key: 'neighborhood', value: filters.neighborhood, label: filters.neighborhood, kind: 'value' });
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
  if (filters.commercialName) chips.push({ key: 'commercialName', value: filters.commercialName, label: `${filters.commercialName} 상권`, kind: 'value' });
  (filters.commercialType || []).forEach(type => chips.push({ key: 'commercialType', value: type, label: `${type} 인근`, kind: 'list' }));
  if (filters.minCommercialSalesWon) chips.push({ key: 'minCommercialSalesWon', value: filters.minCommercialSalesWon, label: `상권 월매출 ${(filters.minCommercialSalesWon / 1e8).toLocaleString('ko-KR')}억 이상`, kind: 'value' });
  if (filters.minCommercialPopulation) chips.push({ key: 'minCommercialPopulation', value: filters.minCommercialPopulation, label: `상권 유동 ${Math.round(filters.minCommercialPopulation / 10000).toLocaleString('ko-KR')}만 이상`, kind: 'value' });
  if (filters.commercialRadiusM) chips.push({ key: 'commercialRadiusM', value: filters.commercialRadiusM, label: `상권 반경 ${filters.commercialRadiusM}m`, kind: 'value' });
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
  // 디스코를 앞세우지 않고 네이버와 무작위로 섞는다. 터잡이 추천·등록은 먼저 보여준다.
  const mixed = [...buckets.disco, ...buckets.naver];
  for (let i = mixed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = mixed[i]; mixed[i] = mixed[j]; mixed[j] = tmp; }
  const ordered = [...buckets.premium, ...buckets.registered, ...mixed];
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
  const commercial = search.commercial || null;
  if (total > 0 && commercial) {
    const sales = commercial.monthlySalesWon ? `월매출 ${(commercial.monthlySalesWon / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : '월매출 자료 없음';
    const pop = commercial.population ? `유동인구 ${Math.round(commercial.population / 10000).toLocaleString('ko-KR')}만` : '';
    reply += `\n🏪 ${commercial.name}(${commercial.type}) 기준이에요. ${[sales, pop, commercial.changeIndex].filter(Boolean).join(' · ')}.`;
  } else if (total > 0 && (filters.commercialType?.length || filters.minCommercialSalesWon || filters.minCommercialPopulation)) {
    reply += `\n🏪 조건에 맞는 상권 반경 ${filters.commercialRadiusM || 500}m 안의 매물이에요.`;
  }
  return {
    status: 'ready', reply, filters, chips: chipList(filters), total, groups,
    originTotals: { premium, registered, disco, naver },
    station: search.station || null, districts: search.districts || [],
    commercial,
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
  // 저장 조건의 신축 구역 플래그는 비서 검색에서 다루지 않으므로 제외한다(메인 '신축 검토'에서 처리).
  for (const key of SPATIAL_KEYS) delete saved[key];
  const spoken = ruleFilters(message);
  let merged = mergeFilters(spoken, saved);
  let unsupported = null;
  let reply = null;
  let source = Object.keys(spoken).length ? 'spoken' : Object.keys(saved).length ? 'saved' : 'none';
  const strongKeys = ['auction', 'districts', 'neighborhood', 'budgetWon', 'minAreaM2', 'maxAreaM2', 'zones', 'stationName', 'maxDistanceM', 'minRoadWidthM', 'commercialName', 'commercialCode', 'commercialType', 'minCommercialSalesWon', 'minCommercialPopulation'];
  const hasStrong = strongKeys.some(key => { const value = spoken[key]; return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''; });
  const conversational = /안녕|반갑|반가|잘\s*부탁|고마|감사|수고|하이|헬로|hello|\bhi\b/i.test(String(message || ''));
  const bare = !hasMeaningfulFilters(spoken);
  if (!hasStrong) {
    // 인사·감사는 검색 없이 바로 답한다.
    if (conversational && bare) {
      return { filters: {}, unsupported: null, source: 'chat', conflicts: [], reply: '안녕하세요! 터잡이 AI 부동산 비서예요. 터잡이 이용 방법이 궁금하면 물어봐 주세요. 원하시는 지역·예산·면적·용도지역을 알려주시면 매물을 찾아드릴게요.' };
    }
    // 매물 맥락 없이 "이 주위 상권"을 물으면 검색하지 않고 어느 매물 기준인지 안내한다.
    if (bare && isRelativeQuestion(message)) {
      return { filters: {}, unsupported: null, source: 'prompt', conflicts: [], reply: '어느 매물이나 지역 기준인지 알려주시면 주변 상권·실거래를 찾아드릴게요. 매물 카드에서 "이 매물 물어보기"를 누른 뒤 "이 주위 상권 알려줘"라고 물어보시면 바로 확인할 수 있어요.' };
    }
    // 사이트 사용법·기능 같은 간단한 질문은 모델 없이 바로 답한다.
    if (bare) {
      const faq = siteFaqAnswer(message);
      if (faq) return { filters: {}, unsupported: null, source: 'faq', conflicts: [], reply: faq };
    }
    // 그 외 자유 문장만 Gemini가 매물 검색인지 대화인지 판단한다.
    const gem = await geminiFilters(message, geminiKey, condition);
    if (gem && hasMeaningfulFilters(gem.filters)) {
      merged = mergeFilters({ ...spoken, ...gem.filters }, saved); source = 'gemini';
    } else if (gem) {
      merged = {}; unsupported = gem.unsupported; reply = gem.reply; source = 'none';
    } else {
      // Gemini를 쓸 수 없으면 규칙 결과로 최선을 다한다.
      merged = mergeFilters(spoken, saved);
    }
  }
  const filters = sanitize(merged); filters.limit = 60;
  // 규칙이 잡은 신축 공간 조건은 Gemini 응답이 덮어써도 보존한다(공간 안내에 필요).
  for (const key of SPATIAL_KEYS) if (spoken[key]) filters[key] = true;
  return { filters, unsupported, source, conflicts: conflicts(spoken, saved), reply };
}

export { ORIGIN_LABEL };
