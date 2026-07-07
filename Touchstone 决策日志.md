---
tags: [touchstone, vibe-coding, decisions]
aliases: [Touchstone 决策日志, Touchstone Decision Log]
created: 2026-06-16
---

# Touchstone 决策日志

总入口见 [[Touchstone MOC]]。记录关键取舍与理由，新决策往下追加，不删旧条。

## 2026-06-16 · Phase 1 v0 起步

- **合规底线**：本站不对公众提供生成式 AI 服务，作品全部站长离线生成后上传，用户只浏览 + 盲评 → 属内容媒体站，绕开生成式算法备案。任何站内调用模型生成内容的功能一律不做。
- **Astro 建在 Touchstone 根**（非 `site/` 子目录）：少一层嵌套，`src/` 本身即代码子目录，Obsidian 笔记与代码同根共存互不干扰。
- **`.gitignore` 优先落地**：Obsidian 库有自动定时提交，必须先忽略 `node_modules/ dist/ .astro/`，否则提交历史被几万文件撑爆。
- **pnpm 经 corepack 启用**（Node 24 自带），未全局装。
- **pnpm 11 构建脚本放行**：`esbuild`/`sharp` 默认被拦；配置已从 package.json `pnpm` 字段（11 不再读）迁到 `pnpm-workspace.yaml` 的 `allowBuilds`。
- **主题用 `light-dark()` 单一来源**：默认跟随系统，`data-theme` 锁定覆盖。比「dark 值写两遍」干净；老浏览器走 `@supports not(light-dark)` 的 hex 兜底块降级。
- **字体策略**：Latin 自托管（fontsource，离线、规避 Google Fonts 在国内不稳）；中文暂用系统兜底。**生产前需补**：中文 Noto SC 子集化自托管（全量 CJK 太大）。
- **字标字体**：站长要 Anthropic Sans，但其为私有商用字体、不可合法打包、手头也无文件。改用 **Hanken Grotesk**（humanist grotesque，免费）作字标专用近似（`--font-wordmark`），仅 logo 用。若日后拿到授权字体文件可直接替换该令牌。
- **Tailwind v4 + 令牌**：令牌为 CSS 自定义属性（真源），`@theme inline` 映射成工具类，主题切换实时生效——满足项目「Tailwind + CSS 变量」要求，且坚持「先声明令牌、再写页面」。
- **占位不造假**：v0 首页用占位封面 + 清晰标注「示例结构 · 数据 Phase 2 接入」，不编造真实模型分数/评测结论（原则：宁可占位，不造假数据）。

## 2026-06-16 · 内容站 + 交互层

- **内容层全 Markdown**：Content Collections + zod，4 类集合（reviews / comparisons / collections / news），不进数据库。
- **可排序横评 = 首个 React island**（`CompareTable.tsx`，`@astrojs/react` + `motion` 12）：点列头排序；行用 key-based 淡入入场（**刻意避开 `motion` 的 `layout` transform**——它在 `<tr>` 上跨浏览器有挤压坑）；尊重 `prefers-reduced-motion`。
- **Pagefind 搜索**（`astro-pagefind`）：索引在 `astro build` 时生成、写入 `dist/pagefind`；dev 下由集成中间件读「上次构建」的索引来服务。**改内容后需重新 `pnpm build` 才会刷新搜索结果。** 导入须带扩展名 `astro-pagefind/components/Search.astro`（包用通配 `exports`）。只索引 `<main data-pagefind-body>`，排除页眉页脚。
- **SEO 收尾**：`@astrojs/sitemap`（build 生成 `sitemap-index.xml`）+ `public/robots.txt`。
- **坑**：dev server 与 `astro build` 同时跑会抢 `.astro` 内容缓存，触发 "Duplicate id" 警告——**构建前先停 dev server**。

## 2026-06-16 · 移动端 & 翻页抖动修复

- **移动导航**：`<md` 加汉堡菜单 + 下拉导航（`grid-rows: 0fr→1fr` 平滑展开，点链接 / Esc 收起）；图标按钮点击区域统一 36px。
- **翻页横向平移（根因 + 终解）**：短页无竖滚动条、长页有 → 可用宽度变化 → 居中容器(`max-w-6xl mx-auto`)重定位 → Header / 字标横移。演进：`scrollbar-gutter: stable`（残影）→ `overflow-y: scroll`（消抖但露可见空槽）→ `overflow-y: auto`（响应式但回到位移）→ OverlayScrollbars 浮层（隐藏原生 + 浮层可见，但其 JS 初始化对 body 那一帧重排导致**概率性**抖动，已弃用并移除依赖）。**终解（纯 CSS、零 JS 时序、确定性）：`html { overflow-y: scroll }` 槽位常驻 → 全站宽度永远恒定 → 零位移；轨道透明（`::-webkit-scrollbar-track` 透明，且不设 `scrollbar-width` 让 webkit 伪元素生效；Firefox 经 `@supports not selector(::-webkit-scrollbar)` 用 `scrollbar-width: thin` + 透明轨道）→ 短页只剩透明轨道＝不可见、不露空槽，长页才显示暖色细滑块。** 关键认知：原生 CSS 下「响应式（需要才显示）」与「零位移」互斥，只能选「常驻 + 轨道透明」来既消抖又不露空槽。
- **字标字体交换闪动**：`preload` Hanken 拉丁子集 woff2（`?url` 导入；Vite dedup 后 preload 的 href 与 @font-face 命中同一资源，preload 被使用、不浪费）。

## 2026-06-16 · Phase 2 盲评 Arena（本地）

- **DB 选型**：Node 24 内置 `node:sqlite`（零原生依赖，避开 better-sqlite3 在 Windows 编译坑）；上云再平滑换 libSQL/Turso。
- **后端**：Hono + `@hono/node-server`，纯 ESM `.mjs`（无构建步骤、`node` 直接跑）。接口：`/api/arena/pair`（匿名对子，不下发 model_label）· `/api/vote`（Elo K=32 + 去重 + IP 限速）· `/api/work/:id/reveal` · `/api/leaderboard`（按模型聚合）· `/api/categories`。
- **前后端分离**：静态前端 + 独立 API；`/arena`、`/leaderboard` 是 React island 客户端 fetch，API base 走 `PUBLIC_API_BASE`（默认 `http://localhost:8787`），其余页面照旧零 JS。
- **防刷（轻量）**：设备指纹＝localStorage UUID（FingerprintJS 留待）；`votes(fp_hash, pair_key)` 唯一索引去重；IP 10 分钟 60 票限速；Turnstile 钩子预留、dev 不接真 key。
- **合规**：后端只发对子/收票/算分/翻牌，站内零生成；占位作品由 seed 灌入，模型标签隐藏到翻牌。
- **运行**：`pnpm seed`（一次）→ `pnpm dev:all`（concurrently 起 Astro + Hono）。`server/*.db` 已 gitignore。

## 2026-06-16 · 宽度 & 导航吸顶

- **整体加宽**：对标 Anthropic 官网，主框架 `max-w-6xl`(1152px) → `max-w-7xl`(~1280px)，其余页面各加一档；正文仍由 `.prose { max-width: 68ch }` 锁定可读宽度，不会因容器变宽而行太长。
- **导航不吸顶（bug 修复）**：颗粒分层用的 `body > :not(.grain) { position: relative }` 把 header 的 `position: sticky` **覆盖成了 relative**（选择器特异性更高），导致滚动时导航栏滚走。改为只抬 `main`/`footer`；header 保留 `sticky` + `z-30`（本就在颗粒之上，无需额外抬）。
- **Arena 进页"刷新感"修复**：`/arena` 内容异步加载致页面高度突变、滚动条跳。给 section 预留 `min-h-[44rem]`，加载态与出对子后等高 → 不再跳。

## 2026-06-16 · View Transitions（客户端路由）

- 上 Astro `<ClientRouter />`：翻页改为客户端导航、不整页重载 → 消除"重载 / 主题反色"闪烁，达成 Anthropic 同款顺滑。（查证：Anthropic 官网用 Next.js 客户端路由 + **无深色模式**来规避此问题；我们保留深色，靠 ClientRouter 解决。）
- **Header / 搜索弹窗 `transition:persist`**：持久化 DOM → 主题切换 / 搜索 / 移动菜单的监听器（含 document 级 Ctrl+K、Esc）只绑一次、跨页存活，避免重复绑定与失效。**坑**：`transition:persist` 加在组件标签 `<Header transition:persist/>` 上不生成属性，必须加到组件**内部根元素** `<header transition:persist>`、`<dialog transition:persist>`（已验证各页同名 → 真持久）。
- **当前页高亮**：header 持久化后服务端 active 会冻结 → 改用 `aria-current="page"`（服务端首屏设 + `astro:page-load` 脚本每次导航同步）+ CSS 驱动下划线/颜色。
- **主题无闪**：`<html>` 跨导航持久，`data-theme` / `color-scheme` 不再重算。

## 2026-06-17 · View Transitions 后续修复（主题 + 搜索）

- **切页变暗**：ClientRouter 每次 swap 把 `<html>` 属性重置为服务端版本（无 data-theme）→ 回退系统主题。修：`astro:after-swap` 重新套用 data-theme/color-scheme（首屏脚本里注册一次，带 window 守卫）。
- **主题模型改为硬默认浅色（不再跟随系统）**：站长诉求「设啥是啥、默认浅色、刷新不闪暗」。`:root { color-scheme: light }`（原 `light dark`）+ `<meta color-scheme="light">` → 样式加载前底色就是浅色，消除系统暗色机器上的暗闪；`light-dark()` 仍用（color-scheme 现在确定性：默认 light / `[data-theme=dark]` 才 dark）。主题脚本提到 head 最前;ThemeToggle、@supports 兜底、grain 暗色选择器都去掉 `prefers-color-scheme`/`:not([data-theme=light])` 的系统跟随。`USER` 设过则 localStorage 记住。（注：与原 prompt §4「跟随系统」相比，站长明确改为硬默认浅色。）
- **搜索结果被裁 / 弹窗跑到页底**：
  - astro-pagefind 的 `<Search>` 渲染 `<pagefind-searchbox>`（下拉式 web component），放模态里结果下拉被裁；且我误用 `uiOptions`（实际是 `searchboxOptions`，被忽略）。**改用经典 `PagefindUI`**（结果内联、撑高 + 可滚），手动加载 `/pagefind/pagefind-ui.{js,css}`（整合仍会生成这些产物，移除 `<Search>` 不影响 `/pagefind/`）。
  - `<dialog>` 坑：给 `.ts-search` 直接 `display:flex` 覆盖了关闭态 UA `display:none` → 弹窗常驻页底。改为不在基样式设 display，交给浏览器（关闭 none / 打开 block）。
- 弹窗用 **document 级事件委托 + 守卫**，配合 `transition:persist` 跨页只绑一次、不重复。

## 2026-07-04 · 管理后台（admin/）

- **独立第三进程**：后台放新顶层目录 `admin/`（与 `server/` 平级），`pnpm dev:admin` 启动（默认 :8790，`ADMIN_PORT`/`PORT` 可覆盖）。不并入 Astro 工程、不改主站静态输出；公共 API `server/index.mjs` 对访客的行为零改动。
- **内容不进库**：测评/横评/合集/情报仍是 Markdown + git 唯一权威。后台直接读写 `src/content/*/**.md`，每次保存/删除只 `git add` + `git commit` 那一个文件（`content: add|update|delete <集合>/<slug>.md`），**不自动 push**。机器没配 git 身份时以 `Touchstone Admin <admin@touchstone.local>` 落款兜底，配了则尊重原配置。
- **frontmatter 读写选 `yaml` 包**（纯 JS，非原生依赖，不违背零原生依赖底线）：横评的 columns/tools、合集的 items 是嵌套结构，手写 YAML 解析器一旦出错会静默毁内容，不值得省这一个依赖。序列化按 schema 键序输出、false 布尔省略，与手写文件习惯一致；但**编辑旧文件会重排 frontmatter 格式**（如去掉多余引号），diff 略吵、内容无损。
- **zod 校验双份同构**：`content.config.ts` 依赖 `astro:content` 虚拟模块，纯 Node 进程 import 不了，遂在 `admin/schemas.mjs` 经 `astro/zod` 重写同构 schema，保存前先校验、不合法直接 422 拒写。**改 schema 时两处必须同步**。草稿沿用既有 `draft` 布尔（Astro 页面已按 `!data.draft` 过滤）。
- **认证走内置 crypto**：单管理员账号存独立 `admin/admin.db`（`admin_users` 表，不与 Arena 高频写入的 arena.db 混用）；密码 `crypto.scrypt`（同 node:sqlite 的选型理由：零原生依赖、避开 Windows 编译坑）；会话为 Hono 自带 `setSignedCookie` 签名的 httpOnly + SameSite=Strict cookie，签名密钥持久化在 admin.db 里（重启不掉登录）。首次启动自动建 `admin` 账号（密码取 `ADMIN_PASSWORD` 或随机生成打印一次）；忘记密码 `node admin/reset-password.mjs <新密码>`。登录失败同 IP 10 分钟限 10 次。
- **Arena CRUD 复用 `server/db.mjs`**：新增导出 `arenaAdmin`（prompts/works 增删改的预编译语句），公共接口不引用它。删 prompt/作品会级联删相关投票，避免孤儿数据；改 prompt 品类同步名下作品的冗余 category。
- **媒体上传 = 存储适配器**：`admin/storage.mjs` 只暴露 `upload(buffer, name) -> url`；默认 local 适配器落盘 `admin/uploads/`（已 gitignore）并由后台以公开只读路由 `/uploads/*` 提供（Arena island 要能直接引用）。日后接真 OSS：同文件里补一个同接口 adapter + 设 `ADMIN_STORAGE=oss`，调用方零改动。上传按扩展名白名单过滤、50MB 上限。
- **构建串行化**：后台「重新构建站点」按钮起子进程跑仓库根的 `pnpm build`，进程内互斥标志保证同刻只有一个构建（第二次触发返回 409），日志/成败回显到总览页。不上队列库——单人后台，正确 + 不并发即够。
- **后台 UI 不上 React/Vite**：Hono `hono/html` 服务端渲染 + 原生 JS fetch。设计令牌**直接以 `/assets/tokens.css` 路由回源主站 `src/styles/tokens.css` 真源文件**（非复制，主站改令牌后台自动跟上）；`.ts-btn`/`.ts-card`/`.ts-eyebrow`/`.ts-num`/`.grain` 等原子在 `admin/public/admin.css` 手写同名同形；四款自托管字体从 node_modules 的 fontsource 文件直接回源。深浅色沿用主站同一 `ts-theme` localStorage 键。
- **坑**：① Windows 下 spawn `pnpm` 必须 `shell: true`（.cmd 垫片）；② curl 发 multipart 到本机 Hono 会连接失败（curl 侧问题），浏览器/Node fetch 的 FormData 正常——用 curl 调试上传接口会误判；③ git 无全局身份的机器上 commit 会炸 "Author identity unknown"，已在后台内兜底。
- 明确不做（v1 范围外）：访问统计面板、多账号/角色、真 OSS 凭证接入、CI/CD 触发构建、生产部署配置。

## 2026-07-07 · 首页当期榜单接真实 Arena 数据

- **不再静态占位**：首页“当期榜单 · AI 生图”移除候选 A/B/C 和封面 4:3，改为 `HomeRanking.tsx` 客户端读取 `/api/leaderboard?category=image` 的累计前三名；当前接口没有月份过滤，因此不标“本月”。
- **排行榜接口补展示封面**：`/api/leaderboard` 聚合模型 Elo、票数、作品数时附带同模型可用图片作品 `coverUrl`；首页直接显示真实媒体，没有封面时降级为模型名文本。
- **验证**：`pnpm build` 通过；API 返回 `coverUrl`；首页产物无“候选 / 封面 4:3 / Phase 2 / 示例结构”残留。

## 2026-07-07 · 后台 Arena 列表筛选与按钮规格

- **字段含义**：Prompt 列表的 `品类` 来自 `prompts.category`；`作品数` 是该 prompt 关联 works 的实时计数。当前 text/code/image 常见 6/7/2 是导入数据批次的模型数量差异，不是固定 UI 规则。
- **筛选方式**：Arena 列表页新增搜索、品类按钮、作品数下拉和重置；筛选在前端即时执行，不改变 CRUD 接口。
- **按钮规格统一**：后台 `.ts-btn` 与输入框统一高度；表格小操作按钮统一最小宽度，避免“管理作品 / 删除”尺寸漂移。
- **作品详情可见**：Prompt 详情页的作品行改为服务端直出，避免前端脚本异常时整表空白；后台补只读 `/media/*` 托管，用于查看导入包里的原图、代码和文案原文。
- **详情页返回按钮统一**：Arena prompt 详情页统一把“返回列表”放在标题下方左侧，不再因 prompt 文本长短变化而跑到不同位置。

## 2026-07-07 · 测评封面图字段与后台上传

- **字段约定**：工具测评新增可选 `cover` frontmatter 字段；首页最新测评、测评列表、测评详情页顶部图和社交分享图都读取该字段。
- **上传落点**：后台测评表单上传封面时写入 `public/uploads/content/`，返回 `/uploads/content/...`，保证 Astro 构建和 GitHub 部署能直接带上静态图片。
- **后台入口**：测评编辑页新增封面 URL、上传图片和 16:9 预览；无 `cover` 时前台继续显示“封面 16:9 / 实测截图 16:9”占位。

## 已处理 / 待决

- 待决：正式域名 + ICP 备案后替换 `astro.config.mjs` 的 `site`。
