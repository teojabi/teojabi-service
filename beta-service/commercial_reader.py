# -*- coding: utf-8 -*-
"""상권 조회 (읽기 전용).

- read_commercial(connection, query): 매물 좌표 반경 안의 상권 목록 + 가장 가까운 상권 요약
  query = {lat, lng, radius?}
- read_commercial_areas(connection, query): 지도 레이어용 전체 상권 대표점 목록
  query = {} (선택: bounds=[w,s,e,n])

좌표는 대표점(4326). 최신분기 매출은 commercial_districts.최신월매출 사전집계 값을 쓴다.
"""
import json
import re

LATEST_SALES_QUARTER = '(SELECT max(기준년분기) FROM public.commercial_sales)'
DEFAULT_RADIUS = 500


def _num(value, default=None):
    try:
        n = float(value)
        return n
    except (TypeError, ValueError):
        return default


def _limit_radius(value):
    r = _num(value, DEFAULT_RADIUS) or DEFAULT_RADIUS
    return max(100, min(2000, r))


def _latest_quarter(cursor):
    cursor.execute(LATEST_SALES_QUARTER)
    return cursor.fetchone()[0]


def _top_categories(cursor, code, quarter):
    cursor.execute(
        '''SELECT 업종명, sum(월매출금액) AS sales FROM public.commercial_sales
           WHERE 상권코드=%s AND 기준년분기=%s GROUP BY 업종명 ORDER BY sales DESC LIMIT 3''',
        (code, quarter))
    return [{'name': r[0], 'salesWon': int(r[1] or 0)} for r in cursor.fetchall()]


def _district_row(row):
    return {
        'code': row[0], 'name': row[1], 'type': row[2], 'gu': row[3], 'dong': row[4],
        'distanceM': round(float(row[5])) if row[5] is not None else None,
        'population': int(row[6]) if row[6] is not None else None,
        'changeIndex': row[7] or '',
        'monthlySalesWon': int(row[8]) if row[8] is not None else 0,
    }


def read_commercial(connection, query):
    if isinstance(query, str):
        query = json.loads(query or '{}')
    if not isinstance(query, dict):
        raise ValueError('Invalid query')
    lat = _num(query.get('lat'))
    lng = _num(query.get('lng'))
    if lat is None or lng is None or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return {'status': 'missing'}
    radius = _limit_radius(query.get('radius'))
    with connection.cursor() as cursor:
        quarter = _latest_quarter(cursor)
        cursor.execute(
            '''
            WITH pt AS (SELECT ST_SetSRID(ST_MakePoint(%s,%s),4326) AS g)
            SELECT c.상권코드, c.상권명, c.상권유형, c.자치구, c.법정동,
                   ST_Distance(c.geom::geography, pt.g::geography) AS dist_m,
                   c.유동인구수, c.변화지표, c.최신월매출
            FROM public.commercial_districts c, pt
            WHERE c.geom IS NOT NULL
              AND ST_DWithin(c.geom::geography, pt.g::geography, %s)
            ORDER BY dist_m
            LIMIT 5
            ''',
            (lng, lat, radius))
        districts = [_district_row(r) for r in cursor.fetchall()]
        nearest = None
        if districts:
            base = districts[0]
            nearest = dict(base)
            nearest['topCategories'] = _top_categories(cursor, base['code'], quarter)
            cursor.execute(
                '''SELECT 기준년분기, sum(월매출금액) FROM public.commercial_sales
                   WHERE 상권코드=%s GROUP BY 기준년분기 ORDER BY 기준년분기''',
                (base['code'],))
            nearest['trend'] = [{'quarter': r[0], 'salesWon': int(r[1] or 0)} for r in cursor.fetchall()]
            cursor.execute(
                '''SELECT 기준년분기, 유동인구수 FROM public.commercial_population
                   WHERE 상권코드=%s ORDER BY 기준년분기''',
                (base['code'],))
            nearest['populationTrend'] = [{'quarter': r[0], 'population': int(r[1] or 0)} for r in cursor.fetchall()]
    return {
        'status': 'ready',
        'basis': {'quarter': quarter, 'radiusM': radius, 'locationQuality': 'listing-coords'},
        'nearest': nearest,
        'districts': districts,
        'source': '서울시 상권분석서비스',
    }


def read_commercial_areas(connection, query):
    if isinstance(query, str):
        query = json.loads(query or '{}')
    bounds = query.get('bounds') if isinstance(query, dict) else None
    where = ['geom IS NOT NULL', 'lat IS NOT NULL', 'lng IS NOT NULL']
    params = []
    if isinstance(bounds, (list, tuple)) and len(bounds) == 4:
        w, s, e, n = (_num(v) for v in bounds)
        if None not in (w, s, e, n):
            where.append('lng BETWEEN %s AND %s AND lat BETWEEN %s AND %s')
            params += [w, e, s, n]
    with connection.cursor() as cursor:
        quarter = _latest_quarter(cursor)
        cursor.execute(
            'SELECT 상권코드, 상권명, 상권유형, 자치구, lat, lng, 유동인구수, 변화지표, 최신월매출 '
            'FROM public.commercial_districts WHERE ' + ' AND '.join(where) +
            ' ORDER BY 상권코드',
            params)
        areas = [{
            'code': r[0], 'name': r[1], 'type': r[2], 'gu': r[3],
            'lat': float(r[4]), 'lng': float(r[5]),
            'population': int(r[6]) if r[6] is not None else None,
            'changeIndex': r[7] or '',
            'monthlySalesWon': int(r[8]) if r[8] is not None else 0,
        } for r in cursor.fetchall()]
    return {'status': 'ready', 'basis': {'quarter': quarter}, 'areas': areas,
            'source': '서울시 상권분석서비스'}
