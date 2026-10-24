"""Build the small province overview and lazy-loaded city map shards.

Uses the same cnmaps-data source, Albers projection, and South China Sea inset as
build-city-map.py. Requires only the Python standard library.
Run: python scripts/build-progressive-map.py [--cache-dir PATH]
"""

from __future__ import annotations

import argparse
import concurrent.futures
import importlib.util
import json
import math
from pathlib import Path
import re
import sqlite3
import struct
import zipfile
import zlib


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("city_map", Path(__file__).with_name("build-city-map.py"))
city_map = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(city_map)
PATH_POINT = re.compile(r"[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")


def fetch_provinces(cache: Path):
    """Reuse the verified ZIP source cache, fetching only missing province files."""
    city_map.source_files(cache)
    with sqlite3.connect(cache / city_map.DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        rows = [dict(row) for row in connection.execute(
            "SELECT * FROM ADMINISTRATIVE WHERE country='中华人民共和国' AND level='省'"
        )]
    with zipfile.ZipFile(cache / "wheel-central.zip") as archive:
        entries = {info.filename: info for info in archive.infolist()}

    def fetch(row):
        name = city_map.PREFIX + row["path"]
        info = entries[name]
        target = cache / name
        if target.exists() and target.stat().st_size == info.file_size:
            return
        raw = city_map.request_range(info.header_offset, info.header_offset + info.compress_size + 512)
        name_size, extra_size = struct.unpack_from("<HH", raw, 26)
        offset = 30 + name_size + extra_size
        compressed = raw[offset : offset + info.compress_size]
        content = zlib.decompress(compressed, -15) if info.compress_type == 8 else compressed
        if len(content) != info.file_size or zlib.crc32(content) != info.CRC:
            raise ValueError(f"Province ZIP entry failed its size/CRC check: {name}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(fetch, rows))
    assert len(rows) == 34
    return rows


def bounds(points):
    return [round(min(point[0] for point in points), 2), round(min(point[1] for point in points), 2),
            round(max(point[0] for point in points), 2), round(max(point[1] for point in points), 2)]


def union_bounds(rectangles):
    return [min(rect[0] for rect in rectangles), min(rect[1] for rect in rectangles),
            max(rect[2] for rect in rectangles), max(rect[3] for rect in rectangles)]


def simplify_overview(points, tolerance, closed):
    """Simplify even tiny island rings without discarding any original ring."""
    simplified = city_map.simplify(points, tolerance)
    if not closed or len(points) < 5:
        return simplified
    # The legacy simplifier preserves all points if a tiny closed ring simplifies
    # to fewer than four. Retain a small triangle instead at overview resolution.
    if len(simplified) == len(points):
        first = points[0]
        second = max(points[:-1], key=lambda point: (point[0] - first[0]) ** 2 + (point[1] - first[1]) ** 2)
        dx, dy = second[0] - first[0], second[1] - first[1]
        third = max(points[:-1], key=lambda point: abs(dx * (point[1] - first[1]) - dy * (point[0] - first[0])))
        if max(math.hypot(point[0] - first[0], point[1] - first[1]) for point in points) < tolerance * 2:
            return [first, second, third, first]
    return simplified


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def compact_path(points, closed):
    """Encode rounded geometry with short relative segments and implicit commands."""
    rounded = [(round(x, 2), round(y, 2)) for x, y in points]
    distinct = [point for index, point in enumerate(rounded) if index == 0 or point != rounded[index - 1]]
    if closed and len(distinct) > 1 and distinct[0] == distinct[-1]:
        distinct.pop()

    def number(value):
        text = city_map.number(value)
        return text.replace("0.", ".", 1) if abs(value) < 1 else text

    previous = distinct[0]
    result = f"M{number(previous[0])},{number(previous[1])}"
    command = None
    for point in distinct[1:]:
        absolute = f"{number(point[0])},{number(point[1])}"
        relative = f"{number(round(point[0] - previous[0], 2))},{number(round(point[1] - previous[1], 2))}"
        target = "l" if len(relative) <= len(absolute) else "L"
        result += (" " if command == target else target) + (relative if target == "l" else absolute)
        previous, command = point, target
    return result + ("Z" if closed else "")


def build(cache: Path, tolerance: float):
    rows = fetch_provinces(cache)
    full_path = ROOT / "public/data/china-cities.json"
    if not full_path.exists():
        city_map.build(cache)
    full = json.loads(full_path.read_text(encoding="utf-8"))
    assert len(full["cities"]) == 391

    national = city_map.geometry(cache / city_map.PREFIX / "administrative/amap/land/100000.geojson")
    maritime = city_map.geometry(cache / city_map.PREFIX / "administrative/amap/maritime/100000.geojson")
    national_rings = city_map.rings(national)
    maritime_lines = city_map.rings(maritime)
    main_points = [city_map.albers(point) for ring in national_rings if max(p[1] for p in ring) >= 17.9 for point in ring]
    inset_points = [city_map.albers(point) for ring in national_rings if max(p[1] for p in ring) < 17.9 for point in ring]
    inset_points += [city_map.albers(point) for line in maritime_lines if max(p[1] for p in line) < 22 for point in line]
    main = city_map.fit(main_points, (28, 25, 944, 710))
    inset = city_map.fit(inset_points, (829, 643, 132, 126))

    def path_for(geometry):
        line = geometry["type"] in ("LineString", "MultiLineString")
        paths, projected = [], []
        for ring in city_map.rings(geometry):
            transform = inset if max(p[1] for p in ring) < (22 if line else 17.9) else main
            points = [transform(point) for point in ring]
            projected.append(points)
            points = simplify_overview(points, tolerance, not line)
            if len(points) >= 2:
                paths.append(compact_path(points, not line))
        return "".join(paths), projected

    province_ids = {row["province"]: Path(row["path"]).stem for row in rows}
    metadata, shards = [], {identifier: [] for identifier in province_ids.values()}
    for original in full["cities"]:
        province_id = province_ids[original["province"]]
        city_bounds = bounds([(float(x), float(y)) for x, y in PATH_POINT.findall(original["path"])])
        city = {**original, "provinceId": province_id, "bounds": city_bounds}
        shards[province_id].append(city)
        metadata.append({key: city[key] for key in ("id", "name", "province", "provinceId", "center")})

    provinces = []
    for row in rows:
        identifier = province_ids[row["province"]]
        path, polygons = path_for(city_map.geometry(cache / city_map.PREFIX / row["path"]))
        largest = max(polygons, key=lambda polygon: abs(city_map.polygon_area(polygon)))
        # Include all lazy-loaded city geometry, including remote island insets,
        # so a viewport intersection never misses a city in this province.
        province_bounds = union_bounds([bounds([point for polygon in polygons for point in polygon])] +
                                       [city["bounds"] for city in shards[identifier]])
        provinces.append({
            "id": identifier, "name": row["province"], "path": path,
            "center": city_map.center(largest), "bounds": province_bounds,
            "cityIds": [city["id"] for city in shards[identifier]],
            "detailUrl": f"/data/map-provinces/{identifier}.json",
        })
    provinces.sort(key=lambda province: province["id"])
    overview = {
        "viewBox": full["viewBox"], "provinces": provinces, "cities": metadata,
        "outlines": [
            # Province polygons already include every land/island ring. Avoid
            # downloading that coastline again as a second national overlay.
            {"path": path_for(maritime)[0], "name": "海疆分段线"},
            full["outlines"][2],
        ],
        "inset": full["inset"], "source": full["source"],
    }
    # Write every shard before publishing the overview that references them.
    for identifier, cities in shards.items():
        assert cities, f"Province has no city browsing units: {identifier}"
        write_json(ROOT / f"public/data/map-provinces/{identifier}.json", {"provinceId": identifier, "cities": cities})
    write_json(ROOT / "public/data/china-map-overview.json", overview)
    assert len(metadata) == len({city["id"] for city in metadata}) == 391
    print(json.dumps({
        "provinces": len(provinces), "cities": len(metadata),
        "overviewBytes": (ROOT / "public/data/china-map-overview.json").stat().st_size,
        "detailBytes": sum((ROOT / f"public/data/map-provinces/{identifier}.json").stat().st_size for identifier in shards),
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "outputs/map-source")
    parser.add_argument("--tolerance", type=float, default=0.65, help="Overview simplification error in SVG display units")
    args = parser.parse_args()
    if not 0 < args.tolerance <= 1.5:
        parser.error("--tolerance must be in (0, 1.5]")
    build(args.cache_dir, args.tolerance)
