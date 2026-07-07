---
tags: [touchstone, vibe-coding, moc]
aliases: [Touchstone MOC, Touchstone 总入口]
created: 2026-06-16
---

# Touchstone MOC

Touchstone —— 站长发布作品、用户盲评、生成可信排行榜的中文 AI 工具测评媒体站。
本笔记是项目总入口，汇总架构 / 设计 / Arena 机制 / 待办 / 决策。

> 定位：卖判断，不卖链接。美、可信、克制，压过其它一切。

## 子笔记

- [[Touchstone 架构]] —— 技术栈、信息架构、页面清单、Phase 划分、本地运行命令
- [[Touchstone 设计系统]] —— 视觉方向与设计令牌（颜色 / 字体 / 间距 / 动效）
- [[Touchstone 决策日志]] —— 关键取舍与理由
- [[Touchstone 待办]] —— Phase 进度与下一步
- [[Touchstone Arena 机制]] —— Phase 2 盲评 + 排行榜规格（本地已实现）

## 当前状态（2026-07-07）

- **Phase 1 完成**：设计系统 + 五大板块内容站（测评 / 横评 / 合集 / 情报 / 关于 + styleguide）+ 可排序横评 + Pagefind 搜索 + SEO/JSON-LD/sitemap + 移动端汉堡导航 + View Transitions 客户端路由（翻页无重载、主题无闪）。
- **Phase 2 本地已实现**：盲评 Arena + 排行榜 + 轻后端（Hono + `node:sqlite`，零原生依赖）。首页当期榜单已接 AI 生图累计榜前三和真实封面。`pnpm seed` 一次 → `pnpm dev:all` 同起前端(:4321) + API(:8787)。
- **Phase 3 管理后台已实现**：独立进程 `admin/`（`pnpm dev:admin`，:8790）——单管理员登录、四类内容 CRUD（写 Markdown + 自动 git commit）、Arena prompt/作品 CRUD + 本地媒体上传、一键重建站点（串行化 `pnpm build`）。视觉与主站同源（直接回源 tokens.css）。
- 待办：测评/合集/情报正式内容替换 `sample`；移动端真机回归；上线（Turnstile / ICP / OSS+ECS）。详见 [[Touchstone 待办]]。
