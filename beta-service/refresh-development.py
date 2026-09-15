"""Prepare search evidence once from local data. No database writes."""
import importlib.util
from source_relations import remote_mode
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.local' / 'supabase' if remote_mode() else ROOT / '.local'
spec = importlib.util.spec_from_file_location('local_reader', ROOT / 'local-reader.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def refresh(selected=False):
    pnus=sorted({r['pnu'] for r in json.loads((CACHE/'selected-catalog.json').read_text(encoding='utf-8'))['rows'] if r.get('pnu')}) if selected else None
    ids_sql='SELECT unnest(%s::text[]) AS pnu' if selected else "SELECT DISTINCT pnu FROM public.naver WHERE pnu ~ '^11[0-9]{17}$'"
    connection = reader.connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout='60000'")
            cursor.execute('''
                WITH ids AS ('''+ids_sql+''')
                SELECT n.pnu,
                    (SELECT CASE WHEN count(*)=1 THEN max("도로폭_m") END FROM public.master_land m WHERE m.pnu=n.pnu) AS road,
                    (SELECT count(*)=1 AND bool_and(CASE WHEN ST_SRID(geom)=5174 AND GeometryType(geom) IN ('POLYGON','MULTIPOLYGON') THEN ST_IsValid(geom) AND NOT ST_IsEmpty(geom) ELSE false END)
                     FROM public.seoul_parcel_map p WHERE p.pnu=n.pnu) AS valid
                FROM ids n ORDER BY n.pnu
            ''', (pnus,) if selected else ())
            rows = {pnu: {'pnu': pnu, 'roadWidthM': float(road) if road is not None and road > 0 else None,
                          'parcelValid': valid is True} for pnu, road, valid in cursor.fetchall()}
            pnus = [pnu for pnu, row in rows.items() if row['parcelValid']]
            sources = {
                'education': ('education_protection', 'geom_5174', 5174, 'true'),
                'heritage': ('heritage_layers', 'the_geom', 4326, "s.layer_name IN ('CHL_PMPG_AS_1','CHL_PMPG_AS_23')"),
                'tourism': ('tourist_accommodation_zone', 'geom', 4326, 'true'),
            }
            if remote_mode():
                sources['education']=('education_safezones','geom',4326,'true')
                sources['tourism']=('tour_zones','geom',4326,'true')
            for key, (table, column, srid, restriction) in sources.items():
                for row in rows.values():
                    row[key] = 'clear' if row['parcelValid'] else 'unknown'
                # All SQL identifiers below are fixed source definitions above.
                geometry = 'geom' if srid == 5174 else 'ST_Transform(geom,4326)'
                cursor.execute(f'''
                    WITH parcels AS MATERIALIZED (
                        SELECT pnu,{geometry} AS geom FROM public.seoul_parcel_map WHERE pnu=ANY(%s)
                    )
                    SELECT p.pnu, CASE
                        WHEN s.{column} IS NULL OR ST_SRID(s.{column})<>{srid}
                            OR GeometryType(s.{column}) NOT IN ('POLYGON','MULTIPOLYGON')
                            OR NOT ST_IsValid(s.{column}) OR ST_IsEmpty(s.{column}) THEN 'unknown'
                        WHEN ST_Covers(s.{column},p.geom) THEN 'contained'
                        WHEN ST_Relate(s.{column},p.geom,'T********') THEN 'overlap'
                        WHEN ST_Touches(s.{column},p.geom) THEN 'touch'
                        ELSE 'clear' END AS relation
                    FROM parcels p JOIN public.{table} s ON s.{column} && p.geom
                    WHERE {restriction}
                ''', (pnus,))
                priority = {'clear': 0, 'touch': 1, 'overlap': 2, 'contained': 3, 'unknown': 4}
                for pnu, relation in cursor.fetchall():
                    if priority[relation] > priority[rows[pnu][key]]:
                        rows[pnu][key] = relation
                print(json.dumps({key: dict(Counter(r[key] for r in rows.values()))}, ensure_ascii=False), flush=True)
        payload = {'source': 'local-development-criteria-v1', 'observedAt': datetime.now(timezone.utc).isoformat(), 'rows': list(rows.values())}
        target = CACHE / ('selected-development.json' if selected else 'development-source.json')
        target.parent.mkdir(parents=True,exist_ok=True)
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        temporary.replace(target)
        print(json.dumps({'parcels': len(rows), 'roadKnown': sum(r['roadWidthM'] is not None for r in rows.values())}), flush=True)
    finally:
        connection.rollback()
        connection.close()


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    refresh(selected='--selected' in sys.argv)
