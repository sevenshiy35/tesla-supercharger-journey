# MyTesla2026Journey Plan

## 当前项目情况

- 当前目录是一个 Git 仓库，暂无应用代码。
- 目录中已有 `DESIGN-apple.md`，已作为本轮主要视觉规范读取。
- 本轮将初始化一个新的 Next.js App Router 项目，不覆盖任何已有功能。

## 技术架构

- Next.js App Router + TypeScript。
- Tailwind CSS 负责视觉系统和响应式布局。
- Mapbox GL JS 仅在客户端动态加载，用 GeoJSON source/layer 渲染站点与聚合点。
- Lucide React 用于轻量图标。
- Zod 用于未来数据验证 schema。
- 数据访问先走 mock repository，未来可替换为 Supabase repository。

## 页面结构

- `/`：公开首页，包括导航、Hero、旅程介绍、地图、统计、最新打卡和 Footer。
- `/admin`、`/admin/check-in`、`/admin/trips`、`/admin/records`：下一阶段占位页。
- `/stations/[stationId]`：站点详情占位页。

## 组件结构

- `components/navigation`：全局导航。
- `components/hero`：Hero 和本地 SVG 视觉。
- `components/map`：客户端 Mapbox 地图、州筛选与选中站点面板。
- `components/statistics`：全美和州级统计展示。
- `components/check-ins`：最近打卡 editorial grid。
- `components/footer`：低调页脚。

## 数据结构

- `types/station.ts`：`StationStatus`、`SuperchargerStation`。
- `types/journey.ts`：`JourneySummary`、`CheckInRecord`、未来路线与打卡接口。
- `data/stations.sample.ts`：development seed data，不代表完整或官方 Tesla 数据。
- `data/us-states.ts`：州选项。
- `data/us-state-bounds.ts`：州 bounds 配置，避免在组件里硬编码。
- `lib/stations/repository.ts`：UI 使用的统一 repository 接口。
- `lib/stations/mock-repository.ts`：当前 mock 实现。
- `lib/journey/calculations.ts`：纯统计函数。

## 本轮开发步骤

1. 初始化 Next.js、TypeScript、Tailwind、ESLint 项目配置。
2. 建立类型、mock 数据、州 bounds、repository 和统计函数。
3. 创建首页 Server Component，动态加载地图 Client Component。
4. 实现 Apple-inspired 视觉：全宽 section、克制数据展示、黑色半透明导航、pill button。
5. 实现 Mapbox token 缺失和加载失败的友好空状态。
6. 创建未来页面占位和未来功能接口文档。
7. 运行 `npm run lint`、`npm run typecheck`、`npm run build` 并修复问题。

## 暂不实现的内容

- Tesla OAuth。
- 真实 Tesla Supercharger 数据抓取或同步。
- Supabase 连接、登录、私人后台 CRUD。
- GPS 现场打卡、照片上传。
- 真实路线规划、绕行里程计算。

## 潜在风险

- 没有 `NEXT_PUBLIC_MAPBOX_TOKEN` 时地图无法显示真实底图，因此必须提供可读空状态。
- 当前 mock 数据只用于开发预览，统计结果不能作为真实旅程进度。
- Mapbox GL 在 SSR 环境不可用，必须隔离为客户端组件并动态加载。
- 州 bounds 是轻量配置，足以支持 fitBounds，但不是精确州边界。
