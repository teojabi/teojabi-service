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
    where = "z.geom IS NOT NULL AND z.geom IS NOT NULL AND NOT ST_IsEmpty(z.geom)"
    args = []
    if bounds:
        where += " AND ST_Intersects(z.geom, ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),5174))"
        args = list(bounds)
    sql = (
        "SELECT z.id, z.zone_name AS name, z.category, z.mid_category, z.sub_category,"
        "       z.category_group, z.category_label, z.saup_cafe_id,"
        "       z.stage, z.implementer, z.households, z.area_m2,"
        "       ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(z.geom, 1.5), 4326))::json AS geometry "
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
                'stage': row['stage'],
                'implementer': row['implementer'],
                'households': row['households'],
                'areaM2': float(row['area_m2']) if row['area_m2'] is not None else None,
            },
            'geometry': geometry,
        })
    return {'status': 'ready', 'type': 'FeatureCollection', 'features': features}
