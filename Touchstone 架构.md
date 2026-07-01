---
tags: [touchstone, vibe-coding, architecture]
aliases: [Touchstone 架构, Touchstone Architecture]
created: 2026-06-16
---

# Touchstone 架构

总入口见 [[Touchstone MOC]]。

## 技术栈

- **Astro 5**（实装 5.18）：内容页静态生成（SSG）吃满 SEO；交互组件用 React islands 局部水合，默认零 JS。
- **Tailwind CSS v4**（实装 4.3）：经 `@tailwindcss/vite` 插件，CSS-first；设计令牌走 CSS 自定义属性，`@theme inline` 接进工具类。
- **字体**：Latin 自托管（fontsource：Source Serif 4 Variable / Inter Variable / Geist Mono）；中文走系统兜底（Noto Serif/Sans SC → PingFang/YaHei）。
- **动效**：纯 CSS 过渡优先；islands 用 `motion` 12（横评排序行入场）。
- **搜索**：Pagefind（`astro-pagefind`，静态全文索引、零后端）；索引随 `astro build` 生成，改内容后需重建刷新。
- **SEO**：`@astrojs/sitemap` 生成 sitemap；`public/robots.txt`。
- **滚动条**：`overflow-y: scroll` 槽位常驻（宽度恒定 → 翻页零位移）+ 透明轨道（短页不可见）+ webkit 暖色细滑块；Firefox 经 `@supports` 用标准属性。纯 CSS、无依赖。
- **后端**：仅 Phase 2，Hono + SQLite，只做盲评/排行接口，无用户系统。详见 [[Touchstone Arena 机制]]。
- 包管理 pnpm（corepack 启用），TypeScript strict。

## 目录结构

```
Touchstone/
├─ Touchstone *.md          ← Obsidian 文档层（本系列笔记）
├─ pnpm-workspace.yaml      ← allowBuilds: esbuild/sharp
├─ astro.config.mjs · tsconfig.json · package.json
├─ public/                  favicon.svg · robots.txt（字体已自托管，无需放这里）
├─ server/                  Phase 2 后端：db.mjs · seed.mjs · index.mjs（Hono + node:sqlite）
└─ src/
   ├─ styles/tokens.css     设计令牌（颜色/字体/阴影，light-dark + hex 兜底）
   ├─ styles/global.css     Tailwind 接入 + base 层 + 颗粒噪点 + 组件原子(.ts-*)
   ├─ layouts/Base.astro    HTML 壳 + 无闪烁主题脚本 + ClientRouter + Header/Footer
   ├─ lib/seo.ts            title/description/canonical/OG + JSON-LD 组装
   ├─ content.config.ts     Content Collections + zod schema
   ├─ content/              reviews · comparisons · collections · news（Markdown 内容）
   ├─ components/
   │    ├─ Header.astro · Footer.astro · ThemeToggle.astro · SearchModal.astro   静态/壳
   │    └─ CompareTable.tsx · ArenaVote.tsx · Leaderboard.tsx                     React islands
   └─ pages/                index · about · styleguide · reviews/ · compare/
                            · collections/ · news/ · arena · leaderboard
```

## 信息架构 / 页面清单

**Phase 1（纯静态内容站）**

1. 首页 `/` —— 数字杂志封面气质：主张 + 当期榜单精选(占位) + 最新测评/合集/情报(接真实内容)。✅
2. 工具测评 `/reviews` + `/reviews/[...slug]` —— 结构化信息块 + 优缺点 + 适合谁 + 站长态度。✅
3. 横向对比 `/compare` + `/compare/[...slug]` —— 多维表，列头可点击排序（React island + motion）。✅
4. 场景合集 `/collections` + `/collections/[...slug]` —— 按「我要干什么」编号串联。✅
5. AI 情报 `/news` —— 限免/涨价/跑路预警 feed。✅
6. 关于 `/about`（含 `#method` 方法论）。✅
7. 盲评 Arena `/arena` —— 成对盲选 island，翻牌见模型，实时喂排行。✅(Phase 2)
8. 排行榜 `/leaderboard` —— 按模型聚合 Elo + 样本量 + 可信度 island。✅(Phase 2)
9. 设计系统预览 `/styleguide`。✅

每个内容页须：独立 title/description、Open Graph、JSON-LD（Article/Product/Review/ItemList 按页型）、响应式、`prefers-reduced-motion` 适配。

**Phase 2（盲评 Arena）· 本地已实现**：`server/`（Hono + `node:sqlite`）+ `/arena`、`/leaderboard` 两个 React island。`pnpm dev:all` 同起前后端。详见 [[Touchstone Arena 机制]]。

## 本地运行

```bash
corepack enable pnpm   # 仅首次
pnpm install
pnpm dev               # http://localhost:4321
pnpm build && pnpm preview
```

## 上线前提醒

- 域名 + ICP 备案后，替换 `astro.config.mjs` 的 `site`（影响 canonical / sitemap / og:url）。
- 部署：前端阿里云 OSS + CDN；Phase 2 后端 ECS + Nginx。
