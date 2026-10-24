# 城市文章地图的数据

地图使用真实行政区域多边形，已经打包到站点内；浏览时不请求外部地图接口，也不需要地图 API key。文章使用城市索引中的稳定 `id` 关联城市，城市名称不作为主键。

## 来源和许可

- 大陆、直辖市、香港、澳门、全国陆地及海疆分段线：[cnmaps-data 1.1.2](https://pypi.org/project/cnmaps-data/1.1.2/)，包内完整 MIT License，Copyright (c) 2026 Clarmy。[项目与来源说明](https://github.com/cnmetlab/cnmaps-data)列明中国边界来自高德，并引用 GaryBikini/ChinaAdminDivisonSHP v2.0（2021），[DOI 10.5281/zenodo.4167299](https://doi.org/10.5281/zenodo.4167299)。同时保留上游 Copyright (c) 2020 GaryBikini 的 MIT 许可通知。
- 台湾 22 县市：[geoBoundaries TWN ADM1 元数据](https://www.geoboundaries.org/api/current/gbOpen/TWN/ADM1/)，使用固定提交 `9469f09` 中的简化版 GeoJSON，边界代表年份 2017。geoBoundaries 平台署名遵循 CC BY 4.0；原数据来自 OpenStreetMap / Wambacher，遵循 ODbL 1.0。地图页面应同时提供 [geoBoundaries](https://www.geoboundaries.org/) 和 [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) 的可点击署名。
- 公开许可文件：`/data/map-data-license.txt`，包含完整 MIT 原文、来源、年份、改动、ODbL 和 CC BY 链接。
- 台湾原始数据库公开在 `/data/taiwan-cities-source.geojson`；转换后的派生数据库公开在 `/data/taiwan-city-paths.json`；全部地图路径公开在 `/data/china-cities.json`。台湾派生数据库保留 ODbL 1.0，不影响网站程序和文章各自的许可。

数据于 2026-10-24 获取。数据包没有给出一个统一的现行行政区划时点；本图的来源参考版本为 2021，台湾为 2017，不能把包的 2026 发布年份当作边界年份。

## 覆盖与标识

最终有 **391 个城市级浏览单元**：cnmaps-data 的 370 个单元中去掉台湾整省单元，并加入 22 个台湾县市。

- 地级市、自治州、地区、盟与省直管县市都可以直接点击。海南包括文昌和三沙的各自真实面。三沙的南海岛屿显示在插图中。
- 北京、天津、上海、重庆各保留一个完整城市面；香港、澳门各保留一个完整面，不要求访客先选区县。
- 大陆和港澳沿用来源文件的六位 `adcode`；将北京市、天津市、上海市的市辖区总标识分别归一到 `110000`、`120000`、`310000`。
- 台湾 22 县市使用原始 ISO 标识，例如 `TW-TPE` 台北市、`TW-NWT` 新北市、`TW-HSQ` 新竹县，避免编造不一致的六位编码。金门、连江、澎湖和本岛县市都包含在内。
- 新疆来源包含十个兵团城市，来源之后新增的城市尚未收录；这个地图不是所有县级市和县的平铺列表。对一般省份，以地级行政区为主要粒度，省直管地区保留来源提供的单独单元。
- 两个来源各自的海岸线和坐标体系有轻微差异，本地图没有对行政区几何做人为重画，也没有将坐标用于导航或距离测量。

## 处理过程

`scripts/build-city-map.py` 仅依赖 Python 标准库，使用固定版本 wheel 的 ZIP 中央目录和 HTTP Range 请求，按需要取出 SQLite 索引、370 个城市文件、全国陆地、海疆分段线和许可文件。下载的 ZIP 条目会检查原始长度和 CRC32。

几何使用 Albers 投影（中央经线 105°、标准纬线 25° / 47°），转换到 `1000 × 800` 的 SVG 画布；Douglas–Peucker 简化误差不超过约 0.12 个显示单位。微小岛屿保留闭合多边形，南海岛屿和相应线段以插图显示；所有点击区域仍使用对应来源的真实多边形。城市中心优先取最大多边形的内部质心，必要时回退到内部采样点。

运行：

```sh
python scripts/build-city-map.py
python scripts/build-progressive-map.py
```

默认原数据缓存位于被 Git 忽略的 `outputs/map-source/`；可以通过 `--cache-dir` 指定已有缓存。无需安装 cnmaps、GIS 库或任何第三方 Python 包。

输出：

```text
public/data/china-cities.json
public/data/china-map-overview.json
public/data/map-provinces/{provinceId}.json
public/data/china-city-index.json
app/lib/china-city-index.json
public/data/map-data-license.txt
public/data/taiwan-cities-source.geojson
public/data/taiwan-city-paths.json
```

两个城市索引始终由同一次构建生成且内容一致。SVG 文件的 `inset` 字段还提供南海插图标签的位置；几何路径本身已包含插图转换，不需要前端二次投影。

## 按省渐进加载

页面首先读取 `/data/china-map-overview.json`（约 186 KiB，未压缩）。它包含同源的 34 个省级真实面、391 个城市的名称/标识/中心、海疆分段线与南海插图信息；城市边界按省分装在 `/data/map-provinces/{provinceId}.json`，放大到需要市级细节时再请求相关省份。旧的全量 `/data/china-cities.json` 保留兼容与开放数据下载，不用于首次地图加载。

`scripts/build-progressive-map.py` 复用原脚本的投影及南海插图规则，仅依赖 Python 标准库。省级面来自同一 `cnmaps-data 1.1.2` wheel 的省级条目，下载同样校验原始长度及 CRC32；概览按 0.65 个显示单位进行简化，并使用 SVG 相对坐标缩短路径。保留每个原始岛屿环，极小岛屿以原环上的顶点简化，城市详细路径和中心则逐字复用全量文件。省面已包含陆地和岛屿，因此概览不再重复下载一份全国海岸线；完整全国轮廓仍保留在全量公开文件中。

省份标识使用标准六位编码，台湾、香港、澳门分别为 `710000`、`810000`、`820000`。台湾 22 县市仍沿用原 ISO 标识，并归入台湾省分片；所有已有文章的城市关联保持兼容。每个城市的 `bounds` 覆盖其全部路径，三沙等城市也包含南海插图中的岛屿；省份的 `bounds` 同时覆盖省面及所有子城市，可直接用于视窗相交加载。

概览的省对象提供 `id`、`name`、`path`、`center`、`bounds`、`cityIds` 与 `detailUrl`；城市元数据提供 `id`、`name`、`province`、`provinceId`、`center`。省分片提供 `provinceId` 和带完整 `path`、`bounds` 的 `cities`。这些文件沿用上文的原始来源、署名与开放许可。
