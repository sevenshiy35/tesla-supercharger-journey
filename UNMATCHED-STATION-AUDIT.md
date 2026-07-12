# Unmatched Tesla Station Audit

审计日期：2026-07-12（America/New_York）
范围：仅调查 2026 年收据中两个未匹配地点；未修改 Supabase、NLR 筛选条件、收据解析结果或任何打卡/充电记录。

## 结论摘要

两个地点都不是地址缩写、大小写、连字符或地址顺序造成的“同站漏配”。Supabase 中没有相同地址、邮编或 1 mile 内的 Tesla 站点；当前 NLR 严格查询和 NJ 全量宽松查询也都没有这两个 Tesla Supercharger 记录。

两处地点均有 Tesla 官方运营证据：Piscataway 有可访问的 Tesla Find Us 官方详情页；Jersey City 有 31 份 Tesla 官方充电发票，覆盖 2026-02-26 至 2026-07-10。按本次要求的分类，两者均归类为 `tesla_official_missing_from_nlr`。

| Receipt location | Receipt count | Normalized address | Coordinates | Supabase candidate | Distance | NLR result | Tesla official result | Classification | Recommended action |
|---|---:|---|---|---|---:|---|---|---|---|
| Jersey City, NJ | 31 | `2-36 GARFIELD AVE, JERSEY CITY, NJ 07305` | 40.685172, -74.099118（Mapbox exact/point） | 无可靠候选；最近为 Newark, 281 Ferry St | 6,394 m | 严格 0；NJ 宽松 0 个相同地址 | Tesla 发票证实运营；第三方指向 location ID `27400`，但该官方 URL 当前 404 | `tesla_official_missing_from_nlr` | 暂不关联；在 Tesla App/车机确认稳定官方 ID 后，人工评审新增站点 |
| Piscataway, NJ | 1 | `88 CENTENNIAL AVE, PISCATAWAY, NJ 08854` | 40.539647, -74.501189（Mapbox exact/rooftop） | 无同城/同邮编 Tesla 候选；最近为 Bridgewater | 6,111 m | 严格 0；宽松最近是 201 Centennial Ave 的私人 J1772，非同站 | Tesla Find Us ID `15015`：Wawa、12 个、最高 325 kW、24/7 | `tesla_official_missing_from_nlr` | 可进入人工新增候选队列；先确认稳定 external ID 与坐标策略 |

距离均为以地址地理编码点为起点、使用 Haversine 公式计算的直线距离。项目阈值建议为：0-250 m 强候选；250-1,600 m 人工复核；超过 1 mile（1,609 m）通常不匹配。

## 1. 现有项目与匹配逻辑

### 1.1 项目正式代码没有收据匹配实现

仓库当前没有 Tesla 收据 OCR、地址匹配或 geocoding 实现。文档把 receipt OCR 明确列为未来工作；现有代码只完成 NLR 站点目录的读取、标准化、同步和公开查询。

- `src/lib/stations/nlr-source.ts:36-53` 构造 NLR 请求，正式筛选为 `ELEC + US + Tesla + public + E`。
- `src/lib/stations/mappers.ts:68-105` 把 NLR 记录映射为应用站点；`external_id` 直接取 NLR 数字 `id` 的字符串形式。
- `src/lib/stations/mappers.ts:108-118` 的 fingerprint 仅用于 NLR 导入去重，字段为名称、地址、城市、州及保留 5 位小数的经纬度。文本只做 trim、lowercase 和连续空格归一，不处理 `Ave/Avenue`、标点、门店名或地址数字顺序。
- `scripts/lib/station-sync.ts:87-107` 将标准化站点写成 Supabase 行；`scripts/sync-nlr-stations.ts:77` 以 `external_id` 为冲突键执行 upsert。
- `src/lib/stations/supabase-public-repository.ts:15-16,42-58` 只是分页读取站点并按 `external_id` 排序，不执行地址或距离匹配。
- `supabase/migrations/20260711_initial_journey_schema.sql:40-63` 定义站点字段：UUID、唯一 `external_id`、名称、完整地址、城市、州、邮编、经纬度、桩数、最大功率、状态、来源及时间戳。

因此，`external_id` 是 NLR 同步和既有站点稳定身份键，但 Tesla Receipt 本身不提供 NLR `external_id`，无法直接用它完成首次匹配。

### 1.2 当前 Excel 是调查性结果，不是项目正式流水线

当前结果文件为：

`outputs/tesla_receipt_locations_20260712/2026_Tesla_充电地点统计.xlsx`

其中“地点统计”和“打卡对应数据”把两个地点保留为未匹配，`station_id`/`external_id` 留空。上一轮调查性匹配主要使用州、邮编、城市、地址标准化、街道相似度及站名相似度；它不是仓库中的正式模块，也没有写数据库。

### 1.3 地址格式差异检查

收据地址与常见美国地址顺序不同：

- `Garfield Ave 2-36` -> `2-36 Garfield Ave`
- `Centennial Avenue 88` -> `88 Centennial Avenue`

本次标准化还统一了：

- `Ave` / `Avenue`
- `-` / `–` / `—`
- `2–36` / `2-36`
- 大小写、标点和多余空格
- 街道号位于街道名前后
- 城市、州、邮编格式

Mapbox Geocoding v6 对两个标准化地址均返回 exact match；Jersey City 为 `point` 精度，Piscataway 为 `rooftop` 精度。Mapbox 文档说明 forward geocoding 可将地址转换为标准地址和坐标；本次使用 `permanent=true`，未在客户端暴露 token。[Mapbox Geocoding v6 文档](https://docs.mapbox.com/api/search/geocoding-v6/)

结论：如果数据库中存在同一个站点，原始字符串确实可能因地址顺序和缩写而无法精确相等；但本次 Supabase 和 NLR 都不存在相同站点记录，所以格式差异不是这两个未匹配的根因。

## 2. Supabase 目录状态

本次只用 publishable key 执行 GET/SELECT，未使用写权限。

- `stations` 总数：3,032
- 所有记录 `source = nlr`
- `source_updated_at` 范围：2026-06-18 14:46:21Z 至 2026-07-10 15:05:01Z
- `created_at` / `updated_at`：2026-07-12 05:17:50Z 至 05:17:53Z
- 仓库没有持久化的同步日志表或同步日志文件；`stations.updated_at` 可作为本次全量 upsert 的操作时间代理。

项目 dry-run 结果：

```text
Mode: DRY RUN
NLR received: 3,032
Normalized: 3,032
Existing in Supabase: 3,032
New: 0
Updated: 3,032
Missing from current NLR response: 0
Succeeded: 0
Failed: 0
DRY RUN - no database changes were made
```

这证明 Supabase 不是较旧的 3,032 条子集；它与当前正式 NLR 严格结果的 external ID 集合完全一致。再次执行相同正式同步不会增加这两个站点。

## 3. Jersey City - 2-36 Garfield Ave

### 3.1 Receipt 原始信息

31 份 Tesla 发票中的 Charging Location 完全一致：

```text
Jersey City, NJ
Garfield Ave 2-36
07305 Jersey City NJ, US
```

- 首次收据事件日期：2026-02-26
- 最近收据事件日期：2026-07-10
- 收据没有 GPS 坐标
- 收据出现 10 个不同的 `S/N + stall` 组合，全部标注 `325 kW DC`
- 这些记录足以证明该地址存在实际 Tesla Supercharging 交易，不能因为数量多而强制映射到其他 Jersey City 站点

### 3.2 地址标准化和坐标

- 标准化地址：`2-36 GARFIELD AVE, JERSEY CITY, NJ 07305`
- Mapbox exact result：`2-36 Garfield Avenue, Jersey City, New Jersey 07305, United States`
- 坐标：40.685172, -74.099118
- 精度：`point`

### 3.3 Supabase 候选

Supabase 没有邮编 `07305` 的 Tesla 站点，也没有名称或地址包含 Garfield 的站点。合理查看的候选如下，全部超过 1 mile：

| Candidate | UUID | external_id | Coordinates | Distance | Why checked | Decision |
|---|---|---:|---|---:|---|---|
| Newark, NJ - Tesla Supercharger, 281 Ferry St | `c6ef1aef-aa8f-406f-9ce0-a67d252887d3` | `422574` | 40.727548, -74.150392 | 6,394 m | 物理距离最近 | 城市、地址和邮编不同；排除 |
| Jersey City, NJ - First Street, 160 First Street | `b3740ed5-b701-42ed-ba0a-5d8b2c19e1d1` | `102296` | 40.721706, -74.040223 | 6,415 m | 同城市 | 地址、邮编、功率与距离均不符；排除 |
| Jersey City, NJ - Mall Drive West, 30 Mall Drive West | `8640030e-6bc5-468d-9802-ccd3c5987a87` | `102300` | 40.727339, -74.039850 | 6,852 m | 同城市 | 地址、邮编与距离不符；排除 |

不存在 0-250 m 强候选或 250-1,600 m 人工复核候选。仅凭“Jersey City”匹配会把 31 次收据错误关联到已知旧站。

### 3.4 NLR 查询

NLR 官方 All Stations API 支持 `status`、`access`、`fuel_type`、`ev_network` 等筛选，并定义 `Tesla` 为 Tesla Supercharger 网络。[NLR All Stations API](https://developer.nlr.gov/docs/transportation/alt-fuel-stations-v1/all/)

正式严格查询：

```text
fuel_type=ELEC
country=US
state=NJ
ev_network=Tesla
access=public
status=E
```

- NJ 严格结果：104 条
- `2-36 Garfield Ave`：0 条

宽松查询去掉 Tesla、public 和 E 限制，读取 NJ 的 2,019 条电站记录：

- 相同地址：0 条
- 名称含 Twin City / Garfield 且地址相同：0 条
- 最近 NLR 记录：207 Fulton Ave 的两个 ChargePoint J1772，约 2,392 m；不是 Tesla DC fast
- 1017 Garfield Ave 的 Berry Lane Park 也只是 ChargePoint J1772，且为不同门牌和地点

因此该站不是被 `ev_network=Tesla`、`status=E` 或 `access=public` 误筛掉；它在当前 NLR 数据中根本没有相同记录。

NLR 数据集的 `last_updated` 为 2026-07-12 06:04:45Z；该 API 的官方用途和更新时间端点见 [NLR Last Updated Date API](https://developer.nlr.gov/docs/transportation/alt-fuel-stations-v1/last-updated/)。

### 3.5 Tesla 官方和辅助证据

Tesla 官方发票是本站存在和实际运营的第一方证据。公开网页方面：

- 第三方 ChargeHub 把该站列为 `2-36 Garfield Avenue`、Tesla、12 个 CCS/NACS 端口，并给出 Tesla location ID `27400`；但对应 [Tesla URL](https://www.tesla.com/findus/location/supercharger/27400) 当前返回 404，因此 `27400` 只能视为第三方报告，不能直接作为数据库稳定 ID。[ChargeHub 辅助页面](https://chargehub.com/en/ev-charging-stations/united-states/new-jersey/jersey-city/jersey-city-nj-supercharger/electric-car-stations-near-me?locId=162335)
- 第三方 DCFC Tracker 称其为 Twin City Shopping Center，12 个、最高 325 kW、2026-02-27 开放；这与收据从 2026-02-26 开始及 325 kW S/N 基本一致，但开放日期有一天差异，应视为辅助证据。[DCFC Tracker 辅助页面](https://dcfctracker.com/stations/451972)
- 物业方页面确认 Twin City Shopping Center 地址为 2-36 Garfield Avenue，并提到 Tesla EV chargers；它可确认场地，但不是 Tesla 站点目录。[Levin Management 场地页面](https://levinmgt.com/levinproperties/twin-city-shopping-center-jersey-city-nj/)

本次在 Tesla Find Us 交互地图搜索精确地址，地图缩放到了该位置，但没有得到可读取的官方站点卡片；结合 `27400` URL 404，当前公开 Find Us 身份无法独立确认。收据最近到 2026-07-10，因此不能把网页缺失解释为站点不存在。

### 3.6 分类与建议

- 最终分类：`tesla_official_missing_from_nlr`
- 不是地址格式问题
- Supabase 没有隐藏候选
- 重新运行当前 NLR 同步不会补入
- 不建议把 31 次记录关联到 First Street、Mall Drive West 或 Newark
- 建议人工新增，但应先在 Tesla App/车辆导航中确认：官方站名、稳定 location ID、精确站点入口坐标、桩数、开放状态
- 如最终使用第三方报告的 `27400`，必须标注“人工确认后采用”，不可仅因 ChargeHub 链接直接写入

## 4. Piscataway - 88 Centennial Avenue

### 4.1 Receipt 原始信息

唯一一份 Tesla 发票：

```text
Piscataway, NJ
Centennial Avenue 88
08854 Piscataway NJ, US
```

- 事件日期：2026-04-29
- 收据没有 GPS 坐标
- S/N：`GF2251120001ZJ - 3 / 325 kW DC`

### 4.2 地址标准化和坐标

- 标准化地址：`88 CENTENNIAL AVE, PISCATAWAY, NJ 08854`
- Mapbox exact result：`88 Centennial Avenue, Piscataway, New Jersey 08854, United States`
- 坐标：40.539647, -74.501189
- 精度：`rooftop`

### 4.3 Supabase 候选

Supabase 没有 Piscataway、邮编 `08854`、Centennial 或 Wawa 的 Tesla 站点。

| Candidate | UUID | external_id | Coordinates | Distance | Why checked | Decision |
|---|---|---:|---|---:|---|---|
| Bridgewater, NJ - Tesla Supercharger, 580 Union Avenue | `1a47be9a-a13a-4649-a3ec-6e76ff2d1b24` | `234962` | 40.567096, -74.563848 | 6,111 m | 物理距离最近 | 超过 1 mile，城市/地址/邮编不同；排除 |

没有同城、同邮编或 1 mile 内的 Supabase Tesla 候选。

### 4.4 NLR 查询

严格 Tesla/public/E 查询没有 `88 Centennial Avenue`。

宽松 NJ 查询的最近记录为：

| NLR ID | Name | Address | Network / access | Equipment | Distance | Decision |
|---:|---|---|---|---|---:|---|
| `123322` | Verizon - Piscataway | 201 Centennial Ave | Non-Networked / private | J1772 Level 2 | 721 m | 同一条街但门牌、访问方式和设备完全不同；不是同站 |
| `262126` | Keystone - Piscataway | 30 Knightsbridge Rd | AMPUP / public | J1772 Level 2 | 1,812 m | 不同地址和设备；排除 |

这个 721 m 记录说明“Centennial”关键词或最近距离单独使用会误配。它不是被正式 Tesla 筛选排除的同一站点，而是另一个私人 Level 2 站。

### 4.5 Tesla 官方和辅助证据

[Tesla Find Us 官方详情页（location ID 15015）](https://www.tesla.com/findus/location/supercharger/15015) 当前明确显示：

- 官方站名：Piscataway, NJ
- 场地：Wawa
- 地址：88 Centennial Avenue, Piscataway, NJ 08854
- 12 个 Superchargers
- 最高 325 kW
- 24/7
- 支持其他 EV，带适配器

第三方 DCFC Tracker 称其于 2026-03-20 开放；收据日期为 2026-04-29，时间顺序合理。该开放日期仅作为辅助证据。[DCFC Tracker 辅助页面](https://dcfctracker.com/stations/456082)

Tesla 官方页面没有显示经纬度，因此报告中的坐标来自 Mapbox exact rooftop geocode，而不是 Receipt GPS 或 Tesla 官方坐标。

### 4.6 分类与建议

- 最终分类：`tesla_official_missing_from_nlr`
- 不是地址格式问题
- Supabase 没有隐藏候选
- NLR 的 201 Centennial Ave 记录是不同站，不是被筛出的 Tesla 站
- 当前重新同步不会补入
- 建议进入人工新增站点评审；Tesla location ID `15015` 可作为稳定身份候选，但新增前仍应确认项目 external ID 命名空间和坐标来源策略

## 5. 为什么不是其他分类

| Classification | Jersey City | Piscataway |
|---|---|---|
| `existing_exact_station` | 否：Supabase 无相同地址/邮编 | 否：Supabase 无同城/同邮编 Tesla 站 |
| `existing_nearby_candidate` | 否：最近 6.4 km | 否：最近 Supabase Tesla 6.1 km |
| `present_in_nlr_not_synced` | 否：NLR 与 Supabase external ID 集合一致，dry-run New=0 | 否：同左 |
| `present_in_nlr_filtered_out` | 否：NJ 宽松 2,019 条中仍无同站 | 否：201 Centennial 是私人 J1772，不是同站 |
| `tesla_official_missing_from_nlr` | 是：Tesla 发票证明运营，NLR 无记录 | 是：Tesla Find Us 官方页存在，NLR 无记录 |
| `ambiguous_receipt_location` | 否：地址、邮编、重复交易和 S/N 清楚 | 否：地址、邮编和官方页完全一致 |
| `no_reliable_match` | 站点身份可靠，但目录缺记录 | 站点身份可靠，但目录缺记录 |

## 6. 推荐的未来匹配层级（本轮不实现）

1. Tesla 官方站点 ID 或其他稳定 external ID。
2. 已人工确认的地址别名映射，例如 `Garfield Ave 2-36` -> `2-36 Garfield Ave`。
3. 经纬度距离 + 地址一致；距离只生成候选，不单独决定。
4. 标准化地址精确匹配：处理 Ave/Avenue、标点、连字符、大小写、地址号顺序、邮编。
5. 城市、站名、场地名与距离组合生成候选。
6. 人工确认并记录证据、确认者和日期。
7. 证实目录缺失后新增站点，并使用不会与 NLR 数字 ID 冲突的 external ID 命名空间。

禁止自动规则：

- 仅城市名称匹配
- 仅站点名称模糊匹配
- 仅最近距离匹配
- 仅地址部分包含匹配
- 因 Receipt 数量多而降低确认阈值

如果以后先人工新增、NLR 随后补录，应设计显式的站点合并/身份迁移流程，保留原 Supabase UUID 和既有 visits，避免生成重复站点。

## 7. 下一步建议

1. 不要再次运行正式 NLR apply 来解决这两个地址；当前 dry-run 已证明不会新增。
2. 在 Tesla App 或车机导航中人工打开两个站点，记录官方站名、稳定 location ID、桩数、功率、精确入口坐标和当前状态。
3. Piscataway 可优先进入人工新增评审，因为官方 Find Us ID `15015` 可直接验证。
4. Jersey City 先解决官方 ID 不确定性；`27400` 仅为第三方报告，当前官方 URL 404。
5. 为人工站点设计独立 external ID 命名空间，例如 `tesla:<location-id>` 或 `manual:<slug>`；不要伪造 NLR 数字 ID。
6. 定期重查 NLR；若未来出现正式 NLR external ID，人工合并身份，不要创建第二个物理站点。
7. 在正式导入 charging records 前，先完成两处站点的人工确认和唯一身份决策。

## 8. 无修改确认

本轮执行内容只有：

- 本地代码和现有 Excel/PDF 的读取
- Supabase `stations` 的匿名只读 SELECT
- NLR、Mapbox 和 Tesla/公开网页的 GET 查询
- `npm run sync:stations:dry` 只读 dry-run
- 创建本报告 `UNMATCHED-STATION-AUDIT.md`

本轮没有：

- 插入、更新或删除 `stations`
- 创建 `station_visits` 或 `charging_sessions`
- 修改 Receipt 解析结果或 Excel
- 修改 NLR 正式筛选条件
- 创建 migration 或修改 schema
- 执行任何 Supabase apply/write 操作
