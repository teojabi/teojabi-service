// 공매(온비드/캠코) API (Supabase Edge Function).
//
// 라우트(함수 접두사 뒤):
//   GET .../onbid/api/onbid            -> list  (?gu(다중)&usage&q&minPrice&maxPrice&sort&page&size)
//   GET .../onbid/api/onbid/map        -> map   (?swLng&swLat&neLng&neLat + 필터, limit<=2000)
//   GET .../onbid/api/onbid/<cltrMngNo> -> detail (item + detail)
//
// 보안: beta-service와 동일하게 Origin/Referer 가드. (긴급 시 ONBID_GUARD=off)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const ALLOWED_ORIGINS = ["https://teojabi.com", "https://www.teojabi.com"];
const GUARD_ON = Deno.env.get("ONBID_GUARD") !== "off";

const LIST_COLUMNS =
  "onbid_cltrno, cltr_mng_no, pbct_cdtn_no, cltr_nm, prpt_div_cd, prpt_div_nm, " +
  "dsps_mthod_nm, bid_mthod_nm, cptn_mthod_nm, usg_lcls_nm, usg_mcls_nm, usg_scls_nm, " +
  "appraised_amt, lowst_bid_prc, lowst_bid_disp, apsl_ctrs_lowst_ratio, bid_begin_dt, bid_end_dt, " +
  "sido, sigu, dong, lot_no, full_address, pnu, lat, lng, deal_type";

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

function applyFilters(query: any, params: URLSearchParams) {
  const gus = params.getAll("gu").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const usages = params.getAll("usage").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean).slice(0, 6);
  const keyword = (params.get("q") || "").trim().slice(0, 60);
  const minPrice = num(params.get("minPrice"));
  const maxPrice = num(params.get("maxPrice"));
  const prpt = (params.get("prptDivCd") || "").trim();
  const dealType = (params.get("dealType") || "").trim().toLowerCase();

  let q = query.not("cltr_mng_no", "is", null);
  if (gus.length) q = q.in("sigu", gus);
  if (usages.length) q = q.or(usages.map((u) => `usg_mcls_nm.ilike.%${u}%`).join(","));
  if (prpt) q = q.eq("prpt_div_cd", prpt);
  if (["whole", "floor", "unit", "land"].includes(dealType)) q = q.eq("deal_type", dealType);
  if (keyword) q = q.or(`cltr_nm.ilike.%${keyword}%,full_address.ilike.%${keyword}%`);
  if (minPrice != null) q = q.gte("lowst_bid_prc", minPrice);
  if (maxPrice != null) q = q.lte("lowst_bid_prc", maxPrice);
  return q;
}

function orderFor(sort: string): { column: string; ascending: boolean } {
  switch (sort) {
    case "price": return { column: "lowst_bid_prc", ascending: true };
    case "price_desc": return { column: "lowst_bid_prc", ascending: false };
    case "bid": return { column: "bid_end_dt", ascending: true };
    case "appraisal": return { column: "appraised_amt", ascending: false };
    default: return { column: "bid_end_dt", ascending: true };
  }
}

async function doList(params: URLSearchParams, origin: string | null): Promise<Response> {
  const page = clampInt(params.get("page"), 1, 1, 500);
  const size = clampInt(params.get("size"), 20, 1, 200);
  const sort = (params.get("sort") || "bid").trim();
  const { column, ascending } = orderFor(sort);
  let query = db.from("onbid_item").select(LIST_COLUMNS, { count: "exact" });
  query = applyFilters(query, params);
  query = query.order(column, { ascending, nullsFirst: false }).range((page - 1) * size, (page - 1) * size + size - 1);
  const { data, count, error } = await query;
  if (error) throw error;
  return json({ status: "ready", total: count ?? 0, page, size, sort, rows: data ?? [] }, 200, origin);
}

async function doMap(params: URLSearchParams, origin: string | null): Promise<Response> {
  const swLng = num(params.get("swLng")), swLat = num(params.get("swLat"));
  const neLng = num(params.get("neLng")), neLat = num(params.get("neLat"));
  if (swLng == null || swLat == null || neLng == null || neLat == null) {
    return json({ status: "invalid", rows: [] }, 200, origin);
  }
  const limit = clampInt(params.get("limit"), 800, 1, 2000);
  let query = db.from("onbid_item").select("cltr_mng_no, pbct_cdtn_no, cltr_nm, lowst_bid_prc, appraised_amt, bid_end_dt, lat, lng, sigu, dong");
  query = applyFilters(query, params);
  query = query
    .gte("lat", Math.min(swLat, neLat)).lte("lat", Math.max(swLat, neLat))
    .gte("lng", Math.min(swLng, neLng)).lte("lng", Math.max(swLng, neLng))
    .limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return json({ status: "ready", rows: data ?? [] }, 200, origin);
}

async function doDetail(cltrMngNo: string, pbctCdtnNo: string | null, origin: string | null): Promise<Response> {
  let query = db.from("onbid_item").select("*").eq("cltr_mng_no", cltrMngNo);
  if (pbctCdtnNo) query = query.eq("pbct_cdtn_no", pbctCdtnNo);
  const itemResult = await query.limit(1).maybeSingle();
  if (itemResult.error) throw itemResult.error;
  if (!itemResult.data) return json({ status: "missing" }, 200, origin);
  const detailResult = await db.from("onbid_detail").select("*")
    .eq("cltr_mng_no", cltrMngNo).limit(1).maybeSingle();
  if (detailResult.error) throw detailResult.error;
  return json({ status: "ready", item: itemResult.data, detail: detailResult.data ?? null }, 200, origin);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "GET" && request.method !== "HEAD") return json({ status: "invalid" }, 405, origin);
  if (!ALLOWED_ORIGINS.includes(origin ?? "")) return json({ status: "forbidden" }, 403, origin);
  if (GUARD_ON && !referer && !ALLOWED_ORIGINS.includes(origin ?? "")) return json({ status: "forbidden" }, 403, origin);

  const url = new URL(request.url);
  // 함수명(onbid) 뒤 경로만 취한다. 라우트(/api/onbid)가 onbid로 끝나므로 non-greedy.
  const path = url.pathname.replace(/^.*?\/onbid(?=\/|$)/, "");
  const params = url.searchParams;
  try {
    if (path === "/api/onbid") return await doList(params, origin);
    if (path === "/api/onbid/map") return await doMap(params, origin);
    if (path.startsWith("/api/onbid/")) {
      const rest = decodeURIComponent(path.slice("/api/onbid/".length));
      const [cltr, pbct] = rest.split("::");
      return await doDetail(cltr, pbct || null, origin);
    }
    if (path === "/api/health") return json({ status: "ready" }, 200, origin);
    return json({ status: "not-found" }, 404, origin);
  } catch (_error) {
    return json({ status: "error", message: "공매 자료를 불러오지 못했습니다." }, 503, origin);
  }
});
