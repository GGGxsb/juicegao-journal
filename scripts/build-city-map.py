"""Rebuild the offline city map from the MIT-licensed cnmaps-data 1.1.2 wheel.

Uses Python's standard library only. Downloads the required ZIP entries with HTTP
Range requests instead of installing cnmaps or downloading unrelated world data.
Run: python scripts/build-city-map.py
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
from pathlib import Path
import sqlite3
import struct
import time
import urllib.request
import zipfile
import zlib


ROOT = Path(__file__).resolve().parents[1]
WHEEL_URL = "https://files.pythonhosted.org/packages/48/70/2d727f4d94296f527b677539a6e29a12a4a4ed930973675abd4fd75b91b8/cnmaps_data-1.1.2-py3-none-any.whl"
WHEEL_SIZE = 77217678
PREFIX = "cnmaps_data/data/datasets/"
DATABASE = "cnmaps_data/data/index/administrative.db"
LICENSE = "cnmaps_data-1.1.2.dist-info/licenses/LICENSE"
METADATA = "cnmaps_data-1.1.2.dist-info/METADATA"
MUNICIPALITIES = {"110100": "110000", "120100": "120000", "310100": "310000"}
SOURCE = "cnmaps-data 1.1.2 · MIT；台湾县市：geoBoundaries / OpenStreetMap · ODbL 1.0"
TAIWAN_URL = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/TWN/ADM1/geoBoundaries-TWN-ADM1_simplified.geojson"
TAIWAN_NAMES = {
    "TW-HSQ": "新竹县", "TW-MIA": "苗栗县", "TW-LIE": "连江县", "TW-KIN": "金门县",
    "TW-CYQ": "嘉义县", "TW-ILA": "宜兰县", "TW-NAN": "南投县", "TW-CHA": "彰化县",
    "TW-PIF": "屏东县", "TW-TTT": "台东县", "TW-HUA": "花莲县", "TW-PEN": "澎湖县",
    "TW-YUN": "云林县", "TW-CYI": "嘉义市", "TW-HSZ": "新竹市", "TW-KEE": "基隆市",
    "TW-TXG": "台中市", "TW-TAO": "桃园市", "TW-NWT": "新北市", "TW-TNN": "台南市",
    "TW-TPE": "台北市", "TW-KHH": "高雄市",
}


def request_range(start: int, end: int) -> bytes:
    for attempt in range(3):
        try:
            request = urllib.request.Request(
                WHEEL_URL, headers={"Range": f"bytes={start}-{end}"}
            )
            with urllib.request.urlopen(request, timeout=40) as response:
                if response.status != 206:
                    raise ValueError("The source server did not honor the ZIP Range request")
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)
    raise AssertionError("unreachable")


def source_files(cache: Path) -> tuple[list[dict], Path]:
    cache.mkdir(parents=True, exist_ok=True)
    central = cache / "wheel-central.zip"
    if not central.exists() or central.stat().st_size != WHEEL_SIZE:
        start = WHEEL_SIZE - 1048576
        tail = request_range(start, WHEEL_SIZE - 1)
        with central.open("wb") as file:
            file.truncate(WHEEL_SIZE)
            file.seek(start)
            file.write(tail)
    with zipfile.ZipFile(central) as archive:
        entries = {info.filename: info for info in archive.infolist()}

    def fetch(name: str) -> Path:
        info = entries[name]
        path = cache / name
        if path.exists() and path.stat().st_size == info.file_size:
            return path
        raw = request_range(info.header_offset, info.header_offset + info.compress_size + 512)
        name_size, extra_size = struct.unpack_from("<HH", raw, 26)
        data_start = 30 + name_size + extra_size
        compressed = raw[data_start : data_start + info.compress_size]
        content = zlib.decompress(compressed, -15) if info.compress_type == 8 else compressed
        if len(content) != info.file_size or zlib.crc32(content) != info.CRC:
            raise ValueError(f"Source ZIP entry failed its size/CRC check: {name}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    database_path = fetch(DATABASE)
    with sqlite3.connect(database_path) as connection:
        connection.row_factory = sqlite3.Row
        rows = [dict(row) for row in connection.execute(
            "SELECT * FROM ADMINISTRATIVE WHERE country='中华人民共和国' AND level='市'"
        )]
    names = [PREFIX + row["path"] for row in rows]
    names.extend([
        PREFIX + "administrative/amap/land/100000.geojson",
        PREFIX + "administrative/amap/maritime/100000.geojson",
        LICENSE,
        METADATA,
    ])
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(fetch, dict.fromkeys(names)))
    return rows, cache


def geometry(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value["type"] == "Feature":
        return value["geometry"]
    return value


def rings(value: dict) -> list[list[list[float]]]:
    if value["type"] == "MultiPolygon":
        return [ring for polygon in value["coordinates"] for ring in polygon]
    if value["type"] == "Polygon":
        return value["coordinates"]
    if value["type"] == "MultiLineString":
        return value["coordinates"]
    if value["type"] == "LineString":
        return [value["coordinates"]]
    raise ValueError(f"Unsupported source geometry: {value['type']}")


RADIANS = math.pi / 180
N = (math.sin(25 * RADIANS) + math.sin(47 * RADIANS)) / 2
C = math.cos(25 * RADIANS) ** 2 + 2 * N * math.sin(25 * RADIANS)


def albers(point: list[float]) -> tuple[float, float]:
    longitude, latitude = point
    rho = math.sqrt(C - 2 * N * math.sin(latitude * RADIANS)) / N
    theta = N * (longitude - 105) * RADIANS
    return rho * math.sin(theta), rho * math.cos(theta)


def fit(points: list[tuple[float, float]], box: tuple[float, float, float, float]):
    left, top, width, height = box
    xmin, xmax = min(p[0] for p in points), max(p[0] for p in points)
    ymin, ymax = min(p[1] for p in points), max(p[1] for p in points)
    scale = min(width / (xmax - xmin), height / (ymax - ymin))
    xoffset = left + (width - (xmax - xmin) * scale) / 2
    yoffset = top + (height - (ymax - ymin) * scale) / 2

    def transform(point):
        x, y = albers(point)
        return xoffset + (x - xmin) * scale, yoffset + (y - ymin) * scale

    return transform


def simplify(points: list[tuple[float, float]], tolerance: float = 0.12):
    """Douglas-Peucker in display units; retain tiny island rings."""
    if len(points) <= 4:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    squared_tolerance = tolerance * tolerance
    while stack:
        first, last = stack.pop()
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        denominator = dx * dx + dy * dy
        furthest, distance = -1, squared_tolerance
        for index in range(first + 1, last):
            x, y = points[index]
            t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / denominator)) if denominator else 0
            candidate = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2
            if candidate > distance:
                furthest, distance = index, candidate
        if furthest >= 0:
            keep.add(furthest)
            stack.extend([(first, furthest), (furthest, last)])
    result = [points[index] for index in sorted(keep)]
    return result if len(result) >= 4 else points


def polygon_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:])) / 2


def contains(point, polygon):
    x, y = point
    inside = False
    for a, b in zip(polygon, polygon[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def center(polygon):
    area = polygon_area(polygon)
    if area:
        x = sum((a[0] + b[0]) * (a[0] * b[1] - b[0] * a[1]) for a, b in zip(polygon, polygon[1:])) / (6 * area)
        y = sum((a[1] + b[1]) * (a[0] * b[1] - b[0] * a[1]) for a, b in zip(polygon, polygon[1:])) / (6 * area)
        if contains((x, y), polygon):
            return [round(x, 2), round(y, 2)]
    xmin, xmax = min(p[0] for p in polygon), max(p[0] for p in polygon)
    ymin, ymax = min(p[1] for p in polygon), max(p[1] for p in polygon)
    midpoint = ((xmin + xmax) / 2, (ymin + ymax) / 2)
    candidates = [
        (xmin + (xmax - xmin) * x / 20, ymin + (ymax - ymin) * y / 20)
        for x in range(1, 20) for y in range(1, 20)
    ]
    candidates = [point for point in candidates if contains(point, polygon)]
    point = min(candidates, key=lambda p: (p[0] - midpoint[0]) ** 2 + (p[1] - midpoint[1]) ** 2) if candidates else polygon[0]
    return [round(point[0], 2), round(point[1], 2)]


def number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def build(cache: Path):
    rows, cache = source_files(cache)
    taiwan_path = cache / "taiwan-cities-source.geojson"
    if not taiwan_path.exists():
        with urllib.request.urlopen(TAIWAN_URL, timeout=40) as response:
            taiwan_path.write_bytes(response.read())
    taiwan_data = json.loads(taiwan_path.read_text(encoding="utf-8"))
    assert len(taiwan_data["features"]) == 22
    national = geometry(cache / PREFIX / "administrative/amap/land/100000.geojson")
    maritime = geometry(cache / PREFIX / "administrative/amap/maritime/100000.geojson")
    national_rings = rings(national)
    maritime_lines = rings(maritime)
    main_points = [albers(point) for ring in national_rings if max(p[1] for p in ring) >= 17.9 for point in ring]
    inset_points = [albers(point) for ring in national_rings if max(p[1] for p in ring) < 17.9 for point in ring]
    inset_points += [albers(point) for line in maritime_lines if max(p[1] for p in line) < 22 for point in line]
    main = fit(main_points, (28, 25, 944, 710))
    inset = fit(inset_points, (829, 643, 132, 126))

    def project_ring(ring, line=False):
        transform = inset if max(p[1] for p in ring) < (22 if line else 17.9) else main
        return simplify([transform(point) for point in ring])

    def path_for(value):
        line = value["type"] in ("LineString", "MultiLineString")
        paths, projected = [], []
        for ring in rings(value):
            points = project_ring(ring, line)
            projected.append(points)
            if len(points) < 2:
                continue
            paths.append("M" + "L".join(f"{number(x)},{number(y)}" for x, y in points) + ("" if line else "Z"))
        return "".join(paths), projected

    cities = []
    for row in rows:
        if row["province"] == "台湾省":
            continue
        value = geometry(cache / PREFIX / row["path"])
        identifier = Path(row["path"]).stem
        identifier = MUNICIPALITIES.get(identifier, identifier)
        path, polygons = path_for(value)
        largest = max(polygons, key=lambda polygon: abs(polygon_area(polygon)))
        cities.append({
            "id": identifier,
            "name": row["city"],
            "province": row["province"],
            "path": path,
            "center": center(largest),
        })
    taiwan_cities = []
    for feature in taiwan_data["features"]:
        identifier = feature["properties"]["shapeISO"]
        path, polygons = path_for(feature["geometry"])
        largest = max(polygons, key=lambda polygon: abs(polygon_area(polygon)))
        taiwan_cities.append({
            "id": identifier,
            "name": TAIWAN_NAMES[identifier],
            "province": "台湾省",
            "path": path,
            "center": center(largest),
        })
    cities.extend(taiwan_cities)
    cities.sort(key=lambda city: city["id"])
    assert len(cities) == 391 and len({city["id"] for city in cities}) == 391
    assert all(city["path"] and all(math.isfinite(p) for p in city["center"]) for city in cities)
    assert {city["id"]: city["name"] for city in cities}["460300"] == "三沙市"

    result = {
        "viewBox": [0, 0, 1000, 800],
        "cities": cities,
        "outlines": [
            {"path": path_for(national)[0], "name": "中国陆地及岛屿"},
            {"path": path_for(maritime)[0], "name": "海疆分段线"},
            {"path": "M820,625H972V780H820Z", "name": "南海诸岛插图边框"},
        ],
        "inset": {"label": "南海诸岛", "labelPosition": [896, 638], "box": [820, 625, 152, 155]},
        "source": SOURCE,
    }
    index = [{key: city[key] for key in ("id", "name", "province")} for city in cities]
    outputs = {
        ROOT / "public/data/china-cities.json": result,
        ROOT / "public/data/china-city-index.json": index,
        ROOT / "app/lib/china-city-index.json": index,
    }
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ROOT / "public/data/taiwan-cities-source.geojson").write_bytes(taiwan_path.read_bytes())
    (ROOT / "public/data/taiwan-city-paths.json").write_text(json.dumps({
        "license": "ODbL 1.0", "source": TAIWAN_URL,
        "attribution": "© OpenStreetMap contributors; geoBoundaries / William & Mary geoLab",
        "viewBox": result["viewBox"], "cities": taiwan_cities,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    notice = """中国城市文章地图 — 地图数据许可与来源

使用数据包：cnmaps-data 1.1.2
项目：https://github.com/cnmetlab/cnmaps-data
数据包：https://pypi.org/project/cnmaps-data/1.1.2/
来源说明：中国省、市、县边界来自高德（Amap）；包内 README 的参考版本为 GaryBikini/ChinaAdminDivisonSHP v2.0 (2021)，DOI https://doi.org/10.5281/zenodo.4167299。
上游项目：https://github.com/GaryBikini/ChinaAdminDivisonSHP
本网页派生处理：Albers 投影、在 1000×800 画布上轻度简化、南海诸岛插图、保留原始六位 adcode；直辖市使用全市标识。未改画行政区几何。
获取日期：2026-10-24。数据包未声明一个统一的现行行政区划时点；这里是文章浏览索引，不是 2026 年最新行政区划表。
覆盖：391 个城市级浏览单元，含大陆地级行政区、省直管县市、四直辖市、香港和澳门，以及台湾22县市。新疆按来源包含 10 个兵团城市，来源后新增城市尚未加入。
全国陆地（含岛屿）和海疆分段线均来自同一个包。南海岛屿及相应线段以插图显示。
地图生成源代码：scripts/build-city-map.py；更多说明见仓库 docs/map-data.md。

台湾县市补充数据：geoBoundaries TWN ADM1，代表年份2017，来源 OpenStreetMap / Wambacher。
geoBoundaries 平台署名：geoBoundaries / William & Mary geoLab，https://www.geoboundaries.org/ ，CC BY 4.0，https://creativecommons.org/licenses/by/4.0/ 。
原始数据库署名：© OpenStreetMap contributors，https://www.openstreetmap.org/copyright 。原始数据及其派生数据库遵循 ODbL 1.0：https://opendatacommons.org/licenses/odbl/1-0/ 。
元数据：https://www.geoboundaries.org/api/current/gbOpen/TWN/ADM1/
固定版本：https://github.com/wmgeolab/geoBoundaries/tree/9469f09/releaseData/gbOpen/TWN/ADM1
改动：简体中文名称、保留ISO地区标识、Albers投影与轻度简化；台湾原始GeoJSON公开于 /data/taiwan-cities-source.geojson ，派生数据库公开于 /data/taiwan-city-paths.json ，全地图路径公开于 /data/china-cities.json 。
这些数据库可按相应开放许可获取、修改、再分发；台湾数据库的开放许可不限制文章或网站程序代码。

以下为 cnmaps-data 包中原样保留的完整 MIT License：

"""
    notice += (cache / LICENSE).read_text(encoding="utf-8")
    notice += "\n\n上游 ChinaAdminDivisonSHP 的许可通知：\n\nMIT License\n\nCopyright (c) 2020 GaryBikini\n\n"
    upstream = (cache / LICENSE).read_text(encoding="utf-8")
    notice += upstream[upstream.index("Permission is hereby granted"):]
    (ROOT / "public/data/map-data-license.txt").write_text(notice, encoding="utf-8")
    print(json.dumps({"cities": len(cities), "bytes": (ROOT / "public/data/china-cities.json").stat().st_size,
                      "index": str(ROOT / "app/lib/china-city-index.json")}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "outputs/map-source")
    args = parser.parse_args()
    build(args.cache_dir)
