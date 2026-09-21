# -*- coding: utf-8 -*-
"""주변 사업·시설 조회 (읽기 전용).

read_surrounding(connection, query): 매물 좌표 반경 안의 도시개발·지하철역·관광공연장
query = {lat, lng, radius?}
같은 지하철역(환승)은 이름으로 묶어 노선을 합친다.
"""
import json


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def read_surrounding(connection, query):
    if isinstance(query, str):
        query = json.loads(query or "{}")
    if not isinstance(query, dict):
        raise ValueError("Invalid query")
    lat = _num(query.get("lat"))
    lng = _num(query.get("lng"))
    if lat is None or lng is None or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return {"status": "missing"}
    radius = _num(query.get("radius"), 1000) or 1000
    radius = max(100, min(3000, radius))
    with connection.cursor() as cur:
        cur.execute(
            """
            WITH pt AS (SELECT ST_SetSRID(ST_MakePoint(%s,%s),4326) AS g)
            SELECT 유형, 이름, 자치구, 법정동, 상태, 상세, 면적, 기준일,
                   ST_Distance(geom::geography, pt.g::geography) AS dist_m
            FROM public.surrounding_projects, pt
            WHERE geom IS NOT NULL
              AND ST_DWithin(geom::geography, pt.g::geography, %s)
            ORDER BY dist_m
            LIMIT 80
            """,
            (lng, lat, radius))
        raw = cur.fetchall()
    merged = {}
    order = []
    for r in raw:
        kind, name = r[0], r[1]
        key = (kind, name)
        item = {
            "type": kind, "name": name, "gu": r[2] or "", "dong": r[3] or "",
            "status": r[4] or "", "detail": r[5] or "",
            "areaM2": float(r[6]) if r[6] is not None else None,
            "date": r[7] or "",
            "distanceM": round(float(r[8])) if r[8] is not None else None,
        }
        if key not in merged:
            merged[key] = item
            order.append(key)
        else:
            # 같은 역의 여러 노선을 합친다.
            prev = merged[key]
            if kind == "지하철역" and item["detail"] and item["detail"] not in prev["detail"]:
                lines = set(prev["detail"].split("·")) | {item["detail"]}
                prev["detail"] = "·".join(sorted(lines))
    projects = [merged[k] for k in order]
    return {"status": "ready", "basis": {"radiusM": radius, "locationQuality": "listing-coords"},
            "projects": projects, "source": "서울시 공공데이터"}
