// 경매 API (Supabase Edge Function) — beta-service/auction_reader.py 를 이식.
// NCP의 Python/Node 부담을 줄이기 위한 파일럿. Supabase(PostgREST)만 사용한다.
//
// 라우트(함수 접두사 뒤):
//   GET .../auction/api/auctions            -> list  (?gu(다중)&usage(다중)&kind&q&minPrice&maxPrice&maxBidRate&minFail&maxFail&saleFrom&saleTo&dealType&sort&page&size)
//   GET .../auction/api/auctions/map        -> map   (?swLng&swLat&neLng&neLat + 필터, limit<=2000)
//   GET .../auction/api/auctions/<docid>    -> detail
//
// 아파트·자동차는 항상 제외한다. deal_type(whole/unit/land)은 auction_item 생성 컬럼.
// 보안: beta-service와 동일하게 Origin/Referer 가드. (긴급 시 AUCTION_GUARD=off)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const ALLOWED_ORIGINS = ["https://teojabi.com", "https://www.teojabi.com"];
const GUARD_ON = Deno.env.get("AUCTION_GUARD") !== "off";

// 경매 비고에서 파생한 위험·특이사항(flags jsonb) 필터 키. 선택 항목 중 하나라도 있으면 표시.
const RISK_COLUMNS = new Set([
  "lien", "legalSuperficies", "landSeparate", "unregistered", "illegalBuilding",
  "saleExcluded", "specialSale", "farmland", "coOwned", "extraBuilding",
]);

const LIST_COLUMNS =
  "docid, court_name, dept_name, case_no, usage_name, appraised_amt, min_price, noti_min_price, " +
  "noti_min_rate, fail_count, sale_date, sale_hour, sido, sigu, dong, lot_no, building_list, " +
  "area_min, area_max, lat, lng, pnu, use_zone, road_width_m, full_address, deal_type, sale_kind, flags, " +
  "detail_address, obj_area_m2, building_area_m2, land_area_m2, deal_type_final, area_source, obj_kind, " +
  "cancelled, acquired_rights, far_limit, bcr_limit, district_plan, " +
  "height_limit, height_district, landscape_district, special_zone, other_zone, " +
  "reg_plat_area, reg_floor_area, reg_foot_area, reg_far, reg_main_use";

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function num(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInt(value: string | null, fallback: number, lo: number, hi: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(lo, Math.min(hi, parsed));
}

// auction_reader._where 와 동일한 필터. (아파트·자동차 제외, 다중 지역·용도 지원)
function applyFilters(query: any, params: URLSearchParams, opts: { zoneCols?: boolean } = {}) {
  const xgus = params.getAll("gu").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const usages = params.getAll("usage").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean).slice(0, 6);
  const zones = params.getAll("zone").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean).slice(0, 4);
  const kind = (params.get("kind") || "").trim().toLowerCase();
  const dealType = (params.get("dealType") || "").trim().toLowerCase();
  // 서비스 타겟(건물 통·토지)처럼 여러 거래단위를 OR로 지정할 때 사용한다.
  const dealTypes = params.getAll("dealTypes").flatMap((v) => v.split(",")).map((v) => v.trim().toLowerCase()).filter((v) => ["whole", "floor", "unit", "land"].includes(v)).slice(0, 4);
  const saleKind = (params.get("saleKind") || "").trim().toLowerCase();
  const risks = params.getAll("risk").flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => RISK_COLUMNS.has(v)).slice(0, 10);
  const keyword = (params.get("q") || "").trim().slice(0, 60);
  const minArea = num(params.get("minArea"));
  const maxArea = num(params.get("maxArea"));
  const minPrice = num(params.get("minPrice"));
  const maxPrice = num(params.get("maxPrice"));
  const maxBidRate = num(params.get("maxBidRate"));
  const minFail = num(params.get("minFail"));
  const maxFail = num(params.get("maxFail"));
  const saleFrom = (params.get("saleFrom") || "").trim();
  const saleTo = (params.get("saleTo") || "").trim();

  // 지분 매각은 서비스 대상이 아니므로 항상 제외한다(건물주 목적 사용자 대상).
  let q = query.not("court_code", "is", null)
    .not("usage_name", "ilike", "%아파트%")
    .not("usage_name", "ilike", "%자동차%")
    .not("cancelled", "is", true)
    .not("sale_kind", "eq", "share")
    .not("is_share", "is", true);
  // 건축 부적합 토지(뒷골목·맹지·도로 등)는 목록·지도에서 숨긴다. hideNonBuildable=0 으로 끌 수 있다.
  //   - 지목이 도로·하천·구거·제방·유지·묘지 등 비건축인 토지는 값이 있으면 제외
  //   - 단독 토지는 너무 작은 필지(기본 60㎡ 미만) 제외 (건물 물건은 그대로 통과)
  if (!["0", "false"].includes((params.get("hideNonBuildable") || "1").toLowerCase())) {
    const minLandArea = num(params.get("landMinArea")) ?? 60;
    const nonBuildableJimok = ["도로", "하천", "구거", "제방", "유지", "묘지", "사사지", "수도용지", "철도용지", "공원", "체육용지", "유원지", "종교용지", "학교용지"];
    q = q.or(`jimok.is.null,jimok.not.in.(${nonBuildableJimok.join(",")})`);
    q = q.or(`deal_type_final.neq.land,deal_type_final.is.null,and(deal_type_final.eq.land,area_max.gte.${minLandArea})`);
  }
  if (xgus.length) q = q.in("sigu", xgus);
  if (usages.length) q = q.or(usages.map((u) => `usage_name.ilike.%${u}%`).join(","));
  if (zones.length) q = q.or(zones.map((z) => `use_zone.ilike.%${z}%`).join(","));
  if (minArea != null) q = q.gte("area_max", minArea);
  if (maxArea != null) q = q.lte("area_max", maxArea);
  if (kind === "land") q = q.eq("deal_type_final", "land");
  else if (kind === "building") q = q.in("deal_type_final", ["unit", "whole"]);
  // 상세에서 보정된 deal_type_final을 기준으로 거래단위를 거른다(원본 deal_type은 호실→통 오분류가 있음).
  if (dealTypes.length) q = q.in("deal_type_final", dealTypes);
  else if (["whole", "floor", "unit", "land"].includes(dealType)) q = q.eq("deal_type_final", dealType);
  if (["whole", "share", "bundle"].includes(saleKind)) q = q.eq("sale_kind", saleKind);
  if (risks.length) q = q.or(risks.map((key) => `flags->>${key}.eq.true`).join(","));
  if (keyword) q = q.or(`full_address.ilike.%${keyword}%,case_no.ilike.%${keyword}%,usage_name.ilike.%${keyword}%,dong.ilike.%${keyword}%`);
  if (minPrice != null) q = q.gte("min_price", minPrice);
  if (maxPrice != null) q = q.lte("min_price", maxPrice);
  if (maxBidRate != null) q = q.lte("noti_min_rate", maxBidRate);
  if (minFail != null) q = q.gte("fail_count", minFail);
  if (maxFail != null) q = q.lte("fail_count", maxFail);
  if (saleFrom) q = q.gte("sale_date", saleFrom);
  if (saleTo) q = q.lte("sale_date", saleTo);
  // 일반매물의 부지 조건(교육보호구역·문화재보존구역 제외)을 경매에도 적용한다.
  //   자료 미확인(null)도 제외한다(매물 검색과 동일한 보수적 기준).
  if (opts.zoneCols) {
    const excludeEducation = ["1", "true"].includes((params.get("excludeEducation") || "").toLowerCase());
    const excludeHeritage = ["1", "true"].includes((params.get("excludeHeritage") || "").toLowerCase());
    if (excludeEducation) q = q.eq("education", false);
    if (excludeHeritage) q = q.eq("heritage", false);
  }
  return q;
}

// auction_item에 교육/문화재/관광특구 컬럼이 있는지 1회 확인 후 캐시한다.
let zoneColsChecked: boolean | null = null;
async function zoneColsAvailable(): Promise<boolean> {
  if (zoneColsChecked != null) return zoneColsChecked;
  const { error } = await db.from("auction_item").select("education,heritage,tourism").limit(1);
  zoneColsChecked = !error;
  return zoneColsChecked;
}

// auction_reader.do_list 의 정렬 매핑. (NULLS LAST)
function orderFor(sort: string): { column: string; ascending: boolean } {
  switch (sort) {
    case "price": return { column: "min_price", ascending: true };
    case "price_desc": return { column: "min_price", ascending: false };
    case "fail": return { column: "fail_count", ascending: false };
    case "area": return { column: "area_max", ascending: false };
    default: return { column: "sale_date", ascending: true };
  }
}

async function doList(params: URLSearchParams, origin: string | null): Promise<Response> {
  const page = clampInt(params.get("page"), 1, 1, 500);
  const size = clampInt(params.get("size"), 20, 1, 200);
  const sort = (params.get("sort") || "sale").trim();
  const { column, ascending } = orderFor(sort);

  let query = db.from("auction_item").select(LIST_COLUMNS, { count: "exact" });
  const wantsZoneCols = ["excludeEducation", "excludeHeritage", "preferTourism"].some((k) => ["1", "true"].includes((params.get(k) || "").toLowerCase()));
  const zoneCols = wantsZoneCols ? await zoneColsAvailable() : false;
  query = applyFilters(query, params, { zoneCols });
  // 관광숙박특화구역 우선 보기: 해당 구역 물건을 먼저 정렬한다(필터가 아니라 우선순위).
  if (zoneCols && ["1", "true"].includes((params.get("preferTourism") || "").toLowerCase())) {
    query = query.order("tourism", { ascending: false, nullsFirst: false });
  }
  query = query.order(column, { ascending, nullsFirst: false }).range((page - 1) * size, (page - 1) * size + size - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return json({ status: "ready", total: count ?? 0, page, size, sort, rows: data ?? [] }, 200, origin);
}

async function doMap(params: URLSearchParams, origin: string | null): Promise<Response> {
  const swLng = num(params.get("swLng"));
  const swLat = num(params.get("swLat"));
  const neLng = num(params.get("neLng"));
  const neLat = num(params.get("neLat"));
  if (swLng == null || swLat == null || neLng == null || neLat == null) {
    return json({ status: "invalid", rows: [] }, 200, origin);
  }
  const limit = clampInt(params.get("limit"), 800, 1, 2000);

  let query = db.from("auction_item").select(
    "docid, usage_name, min_price, appraised_amt, fail_count, sale_date, lat, lng, sigu, dong, deal_type",
  );
  query = applyFilters(query, params);
  query = query
    .gte("lat", Math.min(swLat, neLat)).lte("lat", Math.max(swLat, neLat))
    .gte("lng", Math.min(swLng, neLng)).lte("lng", Math.max(swLng, neLng))
    .limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return json({ status: "ready", rows: data ?? [] }, 200, origin);
}

async function doDetail(docid: string, origin: string | null): Promise<Response> {
  const itemResult = await db.from("auction_item").select("*").eq("docid", docid).maybeSingle();
  if (itemResult.error) throw itemResult.error;
  if (!itemResult.data) return json({ status: "missing" }, 200, origin);

  const detailResult = await db.from("auction_detail").select("*").eq("docid", docid).maybeSingle();
  if (detailResult.error) throw detailResult.error;

  return json({ status: "ready", item: itemResult.data, detail: detailResult.data ?? null }, 200, origin);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ status: "invalid" }, 405, origin);
  }
  if (!ALLOWED_ORIGINS.includes(origin ?? "")) {
    return json({ status: "forbidden" }, 403, origin);
  }
  if (GUARD_ON && !referer && !ALLOWED_ORIGINS.includes(origin ?? "")) {
    return json({ status: "forbidden" }, 403, origin);
  }

  const url = new URL(request.url);
  // 배포 환경에 따라 앞부분이 달라질 수 있어 함수명(auction) 뒤 경로만 취한다.
  const path = url.pathname.replace(/^.*\/auction(?=\/|$)/, "");
  const params = url.searchParams;

  try {
    if (path === "/api/auctions") return await doList(params, origin);
    if (path === "/api/auctions/map") return await doMap(params, origin);
    if (path.startsWith("/api/auctions/")) {
      return await doDetail(decodeURIComponent(path.slice("/api/auctions/".length)), origin);
    }
    if (path === "/api/health") return json({ status: "ready", at: new Date().toISOString() }, 200, origin);
    return json({ status: "not-found" }, 404, origin);
  } catch (_error) {
    return json({ status: "error", message: "경매 자료를 불러오지 못했습니다." }, 503, origin);
  }
});
