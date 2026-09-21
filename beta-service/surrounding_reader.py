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


def read_planned_rail(connection, query):
    """신설·예정 철도/지하철 (미래철도DB 정리본). 좌표가 없어 거리 기반이 아닌 참고 목록."""
    with connection.cursor() as cur:
        cur.execute(
            "SELECT 유형, 노선, 명칭, 구간, 개통예정, 설명, 지역 FROM public.planned_rail "
            "WHERE 유형 = '신설역' ORDER BY (개통예정 = '미정'), 개통예정, 명칭")
        rows = cur.fetchall()
    items = [{
        "type": r[0], "line": r[1], "name": r[2], "section": r[3],
        "opening": r[4] or "", "description": r[5] or "", "region": r[6] or "",
    } for r in rows]
    return {"status": "ready", "items": items,
            "source": "미래철도DB", "sourceUrl": "http://frdb2.ivyro.net",
            "notice": "개인 정리 자료로 공식 고시와 다를 수 있습니다."}


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
            LIMIT 300
            """,
            (lng, lat, radius))
        raw = cur.fetchall()
    merged = {}
    order = []
    for r in raw:
        kind, name = r[0], r[1]
        # 도시개발은 같은 지역의 유사 명칭(마곡구역 1지구/마곡도시개발구역 등)을 앞부분으로 묶는다.
        key = (kind, (name or "")[:2]) if kind == "도시개발" else (kind, name)
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
            prev = merged[key]
            if kind == "지하철역" and item["detail"] and item["detail"] not in prev["detail"]:
                lines = set(prev["detail"].split("·")) | {item["detail"]}
                prev["detail"] = "·".join(sorted(lines))
            elif kind == "도시개발":
                # 가장 가까운 항목을 대표로 두고 면적은 큰 값을 쓴다.
                prev["areaM2"] = max(prev["areaM2"] or 0, item["areaM2"] or 0) or None
    projects = [merged[k] for k in order]
    # 유형별 최대 3건까지만 (가까운 순) 남겨 한 유형이 목록을 독차지하지 않게 한다.
    capped = []
    counts = {}
    for item in projects:
        kind = item["type"]
        if counts.get(kind, 0) >= 3:
            continue
        counts[kind] = counts.get(kind, 0) + 1
        capped.append(item)
    projects = capped
    return {"status": "ready", "basis": {"radiusM": radius, "locationQuality": "listing-coords"},
            "projects": projects, "source": "서울시 공공데이터"}
