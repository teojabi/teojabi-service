// @ts-nocheck
// 데이터 API (Supabase Edge Function) — beta-service/serve.mjs 의 스냅샷 기반 엔드포인트 이식.
//   GET .../data/api/runtime
//   GET .../data/api/health
//   GET .../data/api/catalog?<browse query>
//   GET .../data/api/neighborhoods
//   GET .../data/api/activity
//   GET .../data/api/recommendations?<browse query>
// 스냅샷은 배포 시 워크플로가 snapshots.ts 로 생성한다. (Storage/DB 불필요)
import { selectedCatalog } from "./lib/selected-catalog.mjs";
import { browseCatalog, suggestCatalogChanges } from "./lib/catalog.mjs";
import { snapshots } from "./snapshots.ts";

const ALLOWED_ORIGINS = ["https://teojabi.com", "https://www.teojabi.com"];
const ALLOWED_REFERER_HOSTS = ["teojabi.com", "www.teojabi.com", "127.0.0.1", "localhost"];
const GUARD_ON = Deno.env.get("DATA_GUARD") !== "off";
const NAVER_MAP_CLIENT_ID = Deno.env.get("NAVER_MAP_CLIENT_ID") || "f8td9fq8kq";
const ACCOUNT_API_BASE = Deno.env.get("ACCOUNT_API_BASE") || "https://api.teojabi.com";

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
function allowedReferer(referer: string | null): boolean {
  try {
    const host = new URL(String(referer || "")).hostname;
    return Boolean(host) && ALLOWED_REFERER_HOSTS.includes(host);
  } catch {
    return false;
  }
}

let catalogCache: unknown = null;
function catalog() {
  if (catalogCache) return catalogCache;
  const hidden = new Set(Array.isArray(snapshots?.curationHidden?.ids) ? snapshots.curationHidden.ids : []);
  const snapshot = snapshots?.selectedCatalog;
  const filtered = snapshot && Array.isArray(snapshot.rows)
    ? { ...snapshot, rows: snapshot.rows.filter((row: any) => !hidden.has(row.id)) }
    : snapshot;
  catalogCache = selectedCatalog(filtered, snapshots?.selectedZoning, snapshots?.selectedDevelopment);
  return catalogCache;
}

function neighborhoodIndex() {
  const snapshot = snapshots?.neighborhoods;
  if (snapshot?.status === "ready" && snapshot.districts && Object.keys(snapshot.districts).length) {
    return snapshot.districts;
  }
  const hidden = new Set(Array.isArray(snapshots?.curationHidden?.ids) ? snapshots.curationHidden.ids : []);
  const fallback: Record<string, Set<string>> = {};
  for (const row of (snapshots?.selectedCatalog?.rows || [])) {
    if (hidden.has(row.id) || !row.district || !row.neighborhood) continue;
    (fallback[row.district] ??= new Set()).add(row.neighborhood);
  }
  return Object.fromEntries(Object.entries(fallback).map(([district, set]) => [district, [...set].sort((a, b) => a.localeCompare(b, "ko-KR"))]));
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "GET" && request.method !== "HEAD") return json({ status: "invalid" }, 405, origin);

  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ status: "forbidden" }, 403, origin);
  if (GUARD_ON && !origin && !allowedReferer(request.headers.get("referer"))) {
    return json({ status: "forbidden" }, 403, origin);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/data(?=\/|$)/, "");
  const params = url.searchParams;

  try {
    if (path === "/api/health") return json({ status: "ready", at: new Date().toISOString() }, 200, origin);
    if (path === "/api/runtime") {
      return json({ clientId: NAVER_MAP_CLIENT_ID, authMode: "current", accountApiBase: ACCOUNT_API_BASE }, 200, origin);
    }
    if (path === "/api/neighborhoods") {
      return json({ status: "ready", districts: neighborhoodIndex() }, 200, origin);
    }
    if (path === "/api/catalog" || path === "/api/recommendations") {
      const data = catalog();
      const current = browseCatalog(data, params);
      return json({ ...current, suggestions: suggestCatalogChanges(data, params, current) }, 200, origin);
    }
    if (path === "/api/activity") {
      const data = catalog();
      const total = browseCatalog(data, new URLSearchParams()).totalParcels;
      const inventory = snapshots?.inventorySummary;
      const discoActivity = snapshots?.discoActivity;
      const tradeUpdatedAt = discoActivity?.runs?.[0]?.completedAt || inventory?.transactionsUpdatedAt || null;
      return json({
        mode: "inventory",
        listingTotal: total,
        observedAt: inventory?.observedAt,
        items: [
          { label: "매물", value: total, unit: "개", updatedAt: data.observedAt || null, note: "현재 검색 가능한 매물 · 선별 구성 갱신일" },
          { label: "실거래", value: inventory?.transactions ?? null, unit: "건", updatedAt: tradeUpdatedAt, note: "보유한 실거래 자료" },
          { label: "건축물대장", value: inventory?.buildings ?? null, unit: "건", updatedAt: inventory?.buildingsUpdatedAt || null, note: "표제부·총괄표제부 보유 기록 합계" },
        ],
      }, 200, origin);
    }
    return json({ status: "not-found" }, 404, origin);
  } catch (_error) {
    return json({ status: "error", message: "데이터를 불러오지 못했습니다." }, 503, origin);
  }
});
