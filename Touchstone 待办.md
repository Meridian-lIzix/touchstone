---
tags: [touchstone, vibe-coding, todo]
aliases: [Touchstone 待办, Touchstone TODO]
created: 2026-06-16
---

# Touchstone 待办

总入口见 [[Touchstone MOC]]。

## Phase 1 · v0（设计系统 + 骨架）—— 等站长验收调性

- [x] Astro + Tailwind v4 工程脚手架，`pnpm build` 干净通过
- [x] 设计令牌（颜色/字体/间距/阴影，light-dark + hex 兜底）
- [x] Base 布局 + Header/Footer + 深浅色切换（无闪烁）
- [x] 首页骨架（Hero + 当期榜单精选 + 最新测评 + 合集 + 情报，占位）
- [x] `/styleguide` 设计系统预览页
- [x] 颗粒噪点 + 错位入场 + `prefers-reduced-motion` 适配
- [x] **站长验收 v0 视觉与体验**（已确认继续；字标改纯英文 `Touchstone` + Hanken Grotesk）

## Phase 1 · 内容站全量

- [x] Content Collections + zod schema：reviews / comparisons / collections / news（`src/content.config.ts`）
- [x] 五类内容页静态实现：测评(列表+详情) / 横评(列表+静态表) / 合集(列表+详情) / 情报(feed) / 关于(含 #method 方法论)
- [x] 示例真内容：Photoroom、Cursor 两篇测评 + AI 修图横评 + 小红书封面合集 + 3 条情报（均标 `sample`，文案遵循统一品牌口吻）
- [x] SEO：每页 title/description/canonical/OG/Twitter + JSON-LD（Review / Article / ItemList / Organization）
- [x] 首页接真实内容；`/leaderboard` 诚实占位页（不放假数据）
- [x] 横评表可排序 island（`CompareTable.tsx`，`@astrojs/react` + `motion`）
- [x] Pagefind 站内搜索（`astro-pagefind`，Header 按钮 + `Ctrl/⌘K` 弹窗；索引随 build 生成）
- [x] sitemap（`@astrojs/sitemap`）+ `robots.txt`
- [x] 移动端导航：汉堡菜单 + 下拉导航（平滑展开 / 点链接 / Esc 收起）；图标按钮点击区域
- [x] View Transitions 客户端路由：翻页无重载、无闪；header + 搜索弹窗 `transition:persist`，当前页高亮用 `aria-current` 同步
- [ ] 移动端逐页回归 + 真机验证（站长一起过；需要可 `pnpm dev --host` 局域网开手机看）
- [ ] 站长用真实内容替换 `sample` 示例

## Phase 2 · 盲评 Arena（本地已跑通）

- [x] 轻后端：Hono + `node:sqlite`（零原生依赖）；5 接口 + Elo(K=32) + 去重/IP 限速 + seed
- [x] `/arena` 成对盲选 island（翻牌、品类切换、设备指纹去重）
- [x] `/leaderboard` 真实数据 island（按模型聚合 Elo + 样本量 + 可信度）
- [x] 一键起前后端：`pnpm dev:all`；导航/页脚接入盲评与排行
- [ ] 站长上传真实作品替换占位（媒体 + 真实模型标签）
- [ ] 上线：真 Turnstile key、防刷加固、ICP、OSS+ECS 部署
- 细节见 [[Touchstone Arena 机制]]

## 上线

- [ ] ICP 备案 → 替换 `site` 域名 → OSS+CDN 部署
