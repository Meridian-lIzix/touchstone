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

## Phase 3 · 管理后台（本地已跑通）

- [x] 独立后台进程 `admin/`：`pnpm dev:admin`（:8788），零原生依赖（node:sqlite + scrypt + 签名 cookie）
- [x] 单管理员登录（首启自动建号，`ADMIN_PASSWORD` 或随机打印；`reset-password.mjs` 找回）；未登录一律拒绝
- [x] 四类内容 CRUD（测评/横评/合集/情报）：表单校验（与 content.config.ts 同构 zod）→ 写 Markdown → 自动 git commit（不 push）；draft 草稿沿用主站过滤
- [x] Arena prompt/作品 CRUD（复用 server/db.mjs，级联清投票）+ 本地媒体上传（存储适配器 + `/uploads/` 只读服务）
- [x] 一键重建站点：串行化 `pnpm build`（并发触发拒绝）+ 日志/成败回显
- [x] 后台 UI 与主站同源视觉（回源 tokens.css + 同名 .ts-* 原子 + 颗粒噪点 + 深浅色）
- [ ] 真 OSS 适配器（storage.mjs 里补 oss adapter + `ADMIN_STORAGE=oss`，等凭证）
- [ ] 访问统计面板（明确延后，不建 page_views 表）
- [ ] 多账号 / 角色权限（v1 单账号，加号手动插 admin_users 表）
- [ ] CI/CD 触发构建、生产部署（Nginx/域名/进程守护）——随上线一并做

## 上线

- [ ] ICP 备案 → 替换 `site` 域名 → OSS+CDN 部署
