import argparse
import os
from pathlib import Path

import geopandas as gpd
from sqlalchemy import create_engine, text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load LSMD_CONT_LDREG_SEOUL shapefile(s) into PostGIS."
    )
    parser.add_argument(
        "--shp-dir",
        default="../data/LSMD_CONT_LDREG_SEOUL",
        help="Directory containing .shp files.",
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL"),
        help="PostgreSQL connection URL. Defaults to env DATABASE_URL.",
    )
    parser.add_argument("--schema", default="public", help="Target DB schema.")
    parser.add_argument(
        "--table",
        default="land_use_district_seoul",
        help="Target table name.",
    )
    parser.add_argument(
        "--target-srid",
        type=int,
        default=4326,
        help="Transform geometry to this SRID before insert.",
    )
    parser.add_argument(
        "--source-crs",
        default=None,
        help="Source CRS (e.g., EPSG:5186) if CRS is missing in shapefile.",
    )
    parser.add_argument(
        "--if-exists",
        choices=["fail", "replace", "append"],
        default="replace",
        help="How to behave if table already exists.",
    )
    parser.add_argument(
        "--encoding",
        default="cp949",
        help="DBF encoding for read_file(). Typical value: cp949.",
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=20000,
        help="Batch insert size.",
    )
    return parser.parse_args()


def find_shp_files(shp_dir: Path) -> list[Path]:
    return sorted(shp_dir.glob("*.shp"))


def normalize_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf.columns = [col.strip().lower() for col in gdf.columns]
    gdf = gdf.rename_geometry("geom")
    return gdf


def ensure_valid_crs(gdf: gpd.GeoDataFrame, source_crs: str | None) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        if not source_crs:
            raise ValueError(
                "CRS is missing in shapefile. Provide --source-crs (e.g., EPSG:5186)."
            )
        gdf = gdf.set_crs(source_crs)
    return gdf


def create_indexes(engine, schema: str, table: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f'CREATE INDEX IF NOT EXISTS "{table}_geom_gix" '
                f'ON "{schema}"."{table}" USING GIST (geom)'
            )
        )
        conn.execute(
            text(
                f'CREATE INDEX IF NOT EXISTS "{table}_pnu_idx" '
                f'ON "{schema}"."{table}" (pnu)'
            )
        )


def main() -> None:
    args = parse_args()
    if not args.db_url:
        raise ValueError("DATABASE_URL is required. Set env var or pass --db-url.")

    shp_dir = Path(args.shp_dir)
    shp_files = find_shp_files(shp_dir)
    if not shp_files:
        raise FileNotFoundError(f"No .shp files found in: {shp_dir.resolve()}")

    print(f"Found {len(shp_files)} shapefile(s) in {shp_dir.resolve()}")
    for shp in shp_files:
        print(f" - {shp.name}")

    engine = create_engine(args.db_url)
    first_write_mode = args.if_exists

    for idx, shp in enumerate(shp_files):
        write_mode = first_write_mode if idx == 0 else "append"
        print(f"\nReading: {shp}")
        gdf = gpd.read_file(shp, encoding=args.encoding)
        gdf = normalize_columns(gdf)
        gdf = ensure_valid_crs(gdf, args.source_crs)
        gdf = gdf.to_crs(epsg=args.target_srid)

        print(f"Rows: {len(gdf):,}")
        print(f"CRS: {gdf.crs}")
        print(f"Writing to {args.schema}.{args.table} (if_exists={write_mode}) ...")
        gdf.to_postgis(
            name=args.table,
            con=engine,
            schema=args.schema,
            if_exists=write_mode,
            index=False,
            chunksize=args.chunksize,
        )

    create_indexes(engine, args.schema, args.table)
    print("\nLoad complete.")


if __name__ == "__main__":
    main()
