"""정비사업(정비구역·모아타운) 경계와 진행단계를 읽는다. 읽기 전용.

지도 레이어용으로 현재 화면(bounds, EPSG:4326)에 걸리는 구역만 단순화해 GeoJSON으로 돌려준다.
"""
import json


def _bounds(params):
    if not isinstance(params, dict):
        return None
    value = params.get('bounds')
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        west, south, east, north = (float(value[0]), float(value[1]), float(value[2]), float(value[3]))
    except (TypeError, ValueError):
        return None
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        return None
    return west, south, east, north


def read_redevelop_map(connection, params):
    bounds = _bounds(params)
    where = "((z.geom IS NOT NULL AND NOT ST_IsEmpty(z.geom)) OR (z.lat IS NOT NULL AND z.lng IS NOT NULL))"
    args = []
    if bounds:
        west, south, east, north = bounds
        where += (" AND ( (z.geom IS NOT NULL AND ST_Intersects(z.geom, ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),5174)))"
                  " OR (z.geom IS NULL AND z.lat BETWEEN %s AND %s AND z.lng BETWEEN %s AND %s) )")
        args = [west, south, east, north, south, north, west, east]
    sql = (
        "SELECT z.id, z.zone_name AS name, z.category, z.mid_category, z.sub_category,"
        "       z.category_group, z.category_label, z.saup_cafe_id,"
        "       z.stage, z.implementer, z.households, z.area_m2, z.gu, z.notice_date,"
        "       CASE WHEN z.geom IS NOT NULL"
        "            THEN ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(z.geom, 1.5), 4326))::json"
        "            ELSE ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(z.lng, z.lat), 4326))::json END AS geometry "
        "FROM public.redevelopment_zone z WHERE " + where +
        " ORDER BY z.area_m2 DESC NULLS LAST LIMIT 1200"
    )
    from psycopg2.extras import RealDictCursor
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(sql, args)
        rows = cursor.fetchall()
    features = []
    for row in rows:
        geometry = row['geometry']
        if not geometry:
            continue
        features.append({
            'type': 'Feature',
            'properties': {
                'id': row['id'],
                'name': row['name'],
                'category': row['category'],
                'midCategory': row['mid_category'],
                'subCategory': row['sub_category'],
                'categoryGroup': row['category_group'],
                'categoryLabel': row['category_label'],
                'cafeId': row['saup_cafe_id'],
                'gu': row['gu'],
                'noticeDate': row['notice_date'].isoformat() if row['notice_date'] else None,
                'stage': row['stage'],
                'implementer': row['implementer'],
                'households': row['households'],
                'areaM2': float(row['area_m2']) if row['area_m2'] is not None else None,
            },
            'geometry': geometry,
        })
    return {'status': 'ready', 'type': 'FeatureCollection', 'features': features}


def read_redevelop_included(connection, pnu):
    """선택한 필지가 포함(또는 일부 걸침)된 도시계획사업을 돌려준다. 읽기 전용."""
    from psycopg2.extras import RealDictCursor
    sql = (
        "WITH parcel AS (SELECT geom FROM public.master_land WHERE pnu = %s AND geom IS NOT NULL LIMIT 1)"
        " SELECT z.id, z.zone_name AS name, z.category, z.mid_category, z.sub_category,"
        "        z.category_group, z.category_label, z.stage, z.implementer, z.households,"
        "        z.area_m2, z.gu, z.notice_date, z.saup_cafe_id,"
        "        ST_Contains(ST_Transform(z.geom, 5174), p.geom) AS contained,"
        "        ST_Intersects(ST_Transform(z.geom, 5174), p.geom) AS part"
        " FROM public.redevelopment_zone z CROSS JOIN parcel p"
        " WHERE z.geom IS NOT NULL AND NOT ST_IsEmpty(z.geom)"
        "   AND ST_Intersects(ST_Transform(z.geom, 5174), p.geom)"
    )
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(sql, (pnu,))
        rows = cursor.fetchall()
    zones = []
    for row in rows:
        zones.append({
            'id': row['id'],
            'name': row['name'],
            'categoryLabel': row['category_label'],
            'categoryGroup': row['category_group'],
            'stage': row['stage'],
            'implementer': row['implementer'],
            'households': row['households'],
            'gu': row['gu'],
            'noticeDate': row['notice_date'].isoformat() if row['notice_date'] else None,
            'cafeId': row['saup_cafe_id'],
            'areaM2': float(row['area_m2']) if row['area_m2'] is not None else None,
            'contained': bool(row['contained']),
            'part': bool(row['part']),
        })
    zones.sort(key=lambda z: (not z['contained'], z['areaM2'] if z['areaM2'] is not None else 1e18))
    return {'status': 'ready', 'pnu': pnu, 'zones': zones}
