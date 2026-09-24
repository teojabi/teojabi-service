// @ts-nocheck
// 데이터 API (Supabase Edge Function) — beta-service/serve.mjs 의 스냅샷 기반 엔드포인트 이식.
//   GET .../data/api/runtime
//   GET .../data/api/health
//   GET .../data/api/catalog?<browse query>
//   GET .../data/api/neighborhoods
//   GET .../data/api/activity
//   GET .../data/api/recommendations?<browse query>
// 스냅샷은 Supabase `public.snapshots` 테이블에서 읽는다. (서버가 큐레이션 후 업로드)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { selectedCatalog } from "./lib/selected-catalog.mjs";
import { browseCatalog, suggestCatalogChanges, DOCUMENT_LINKS } from "./lib/catalog.mjs";
import { buildParcelContext, buildBuildingRecords } from "./lib/risk-policy.mjs";
import { normalizeLandRecord } from "./lib/land-policy.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

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

let snapshotCache: Record<string, any> | null = null;
let snapshotCachedAt = 0;
async function loadSnapshots(): Promise<Record<string, any>> {
  if (snapshotCache && Date.now() - snapshotCachedAt < 60000) return snapshotCache;
  const { data, error } = await db.from("snapshots").select("name,data");
  if (error) throw error;
  const map: Record<string, any> = {};
  for (const row of data || []) map[row.name] = row.data;
  snapshotCache = map;
  snapshotCachedAt = Date.now();
  return map;
}

function catalog(snaps: Record<string, any>) {
  const hidden = new Set(Array.isArray(snaps["curation-hidden"]?.ids) ? snaps["curation-hidden"].ids : []);
  const snapshot = snaps["selected-catalog"];
  const filtered = snapshot && Array.isArray(snapshot.rows)
    ? { ...snapshot, rows: snapshot.rows.filter((row: any) => !hidden.has(row.id)) }
    : snapshot;
  return selectedCatalog(filtered, snaps["selected-zoning"], snaps["selected-development"]);
}

function neighborhoodIndex(snaps: Record<string, any>) {
  const snapshot = snaps["neighborhoods"];
  if (snapshot?.status === "ready" && snapshot.districts && Object.keys(snapshot.districts).length) {
    return snapshot.districts;
  }
  const hidden = new Set(Array.isArray(snaps["curation-hidden"]?.ids) ? snaps["curation-hidden"].ids : []);
  const fallback: Record<string, Set<string>> = {};
  for (const row of (snaps["selected-catalog"]?.rows || [])) {
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

    const snaps = await loadSnapshots();

    if (path === "/api/neighborhoods") {
      return json({ status: "ready", districts: neighborhoodIndex(snaps) }, 200, origin);
    }
    if (path === "/api/catalog" || path === "/api/recommendations") {
      const data = catalog(snaps);
      const current = browseCatalog(data, params);
      return json({ ...current, suggestions: suggestCatalogChanges(data, params, current) }, 200, origin);
    }
    if (path === "/api/activity") {
      const data = catalog(snaps);
      const total = browseCatalog(data, new URLSearchParams()).totalParcels;
      const inventory = snaps["inventory-summary"];
      const discoActivity = snaps["disco-activity"];
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
    if (path.startsWith("/api/parcels/")) {
      const pnu = decodeURIComponent(path.slice("/api/parcels/".length));
      if (!/^\d{19}$/.test(pnu)) return json({ status: "missing" }, 404, origin);
      const data = catalog(snaps);
      if (!data.rows.some((row: any) => row.pnu === pnu)) return json({ status: "missing" }, 404, origin);
      const { data: result, error } = await db.rpc("teojabi_parcel", { p_pnu: pnu });
      if (error) throw error;
      return json(result, 200, origin);
    }
    if (path.startsWith("/api/parcel-context/")) {
      const pnu = decodeURIComponent(path.slice("/api/parcel-context/".length));
      if (!/^11\d{17}$/.test(pnu)) return json({ status: "error" }, 400, origin);
      const { data: raw, error } = await db.rpc("teojabi_parcel_context", { p_pnu: pnu });
      if (error) throw error;
      const planRows = (raw && raw.plans && raw.plans.rows) || [];
      const names = [];
      for (const row of planRows) { for (const key of ["dgmName", "name"]) { const v = row[key]; if (typeof v === "string" && v.trim()) { names.push(v.trim()); break; } } }
      const farNames = [...new Set(names)].sort().slice(0, 20);
      if (farNames.length) {
        const { data: sources } = await db.rpc("teojabi_district_sources", { p_names: farNames });
        const byName = new Map();
        for (const item of ((sources && sources.rows) || [])) if (!byName.has(item.dgmName)) byName.set(item.dgmName, item);
        const mergeKeys = ["baseNoticeNo","baseNoticeDate","baseNoticeName","baseNoticeUrl","originNoticeNo","originNoticeDate","latestNoticeNo","latestNoticeDate","repKind","repGroup","repName","repUrl","repDate","repUsed","guidelines"];
        for (const row of planRows) { const item = byName.get(row.dgmName); if (!item) continue; for (const k of mergeKeys) row[k] = item[k]; }
        const { data: far } = await db.rpc("teojabi_far", { p_names: farNames });
        raw.far = far;
      } else {
        raw.far = { status: "mismatch", rows: [] };
      }
      raw.recap = { status: "skipped", rows: [] };
      raw.buildings = { status: "skipped", rows: [] };
      return json(buildParcelContext(pnu, raw), 200, origin);
    }
    if (path.startsWith("/api/parcel-documents/")) {
      const pnu = decodeURIComponent(path.slice("/api/parcel-documents/".length));
      if (!/^11\d{17}$/.test(pnu)) return json({ status: "error" }, 400, origin);
      const { data: listingAddressData } = await db.rpc("teojabi_address", { p_pnu: pnu });
      const listingAddress = String(listingAddressData || "");
      let address = listingAddress.replace(/\s+/g, " ").trim();
      address = address.replace(/^서울시 /, "서울특별시 ");
      address = address.replace(/번지$/, "").trim();
      const addresses = address ? [...new Set([address, address + "번지", listingAddress])] : [];
      const parts = address.split(/\s+/).filter(Boolean);
      const district = parts.find((p) => p.endsWith("구") || p.endsWith("군")) || "";
      const neighborhood = parts.find((p) => ["동", "가", "읍", "면"].some((s) => p.endsWith(s))) || "";
      let lotPair = null, mainPair = null, subPair = null, patterns = null;
      const mainLot = String(Number(pnu.slice(11, 15)));
      const subLot = String(Number(pnu.slice(15, 19)));
      const lotText = subLot === "0" ? mainLot : mainLot + "-" + subLot;
      lotPair = [lotText, lotText + "번지"];
      mainPair = [mainLot, mainLot.padStart(4, "0")];
      subPair = [subLot, subLot.padStart(4, "0")];
      if (district && neighborhood) patterns = ["%" + district + "%" + neighborhood + "% " + lotText, "%" + district + "%" + neighborhood + "% " + lotText + "번지"];
      const { data: registers, error: regErr } = await db.rpc("teojabi_registers", {
        p_pnu: pnu, p_address: address, p_district: district || null, p_neighborhood: neighborhood || null,
        p_addresses: addresses, p_lot_pair: lotPair, p_main_pair: mainPair, p_sub_pair: subPair, p_patterns: patterns,
      });
      if (regErr) throw regErr;
      const { data: land, error: landErr } = await db.rpc("teojabi_land_record", { p_pnu: pnu, p_address: address });
      if (landErr) throw landErr;
      const listing = { id: pnu, sourceId: pnu, pnu, address: registers.address };
      const result = {
        status: "ready", pnu, address: registers.address,
        building: buildBuildingRecords(listing, registers),
        land: normalizeLandRecord({ ...listing, areaM2: null }, land),
        registry: { status: "external", url: DOCUMENT_LINKS.registry },
      };
      return json(result, 200, origin);
    }
    return json({ status: "not-found" }, 404, origin);
  } catch (_error) {
    return json({ status: "error", message: "데이터를 불러오지 못했습니다." }, 503, origin);
  }
});
