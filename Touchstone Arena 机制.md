---
tags: [touchstone, vibe-coding, arena, phase2]
aliases: [Touchstone Arena 机制, 盲评 Arena, 排行榜机制]
created: 2026-06-16
---

# Touchstone Arena 机制（Phase 2 · 本地已实现）

总入口见 [[Touchstone MOC]]。规格 + 落地说明（见末尾「落地实现」）。本地已跑通：`pnpm seed` 一次 →  `pnpm dev:all`。上线项（Turnstile / ICP / 部署）仍待办。

## 内容来源

作品由站长后台/脚本批量上传：同一套 prompt 喂给不同模型 → 一组作品，每条记 `真实模型标签`（对用户隐藏，翻牌前不展示）。因此模型标签 100% 可信，无用户造假、无内容审核负担。

## 评测形态

- **首选：成对盲选（pairwise / Arena 式）**——同一 prompt 下两个匿名作品二选一，用 Elo / Bradley-Terry 更新模型分。对恶意更鲁棒、决策更轻。
- 备选：单作品 1–5 星打分。

## 排行榜排序（贝叶斯均值，不用裸均分/票数）

```
score = (C·m + Σr) / (C + n)
m  = 全站平均分（先验）
C  = 先验权重（虚拟票数，初始 ~20）
n  = 该作品/模型真实票数
Σr = 真实评分总和
```

n 越小越被 m 拉回中枢；恶意噪声影响 ∝ 1/n。成对盲选则改用 Elo/Bradley-Terry，并展示置信区间与样本量。

## 防刷（轻量三件套，不过度设计）

- 免注册匿名投票：localStorage + IP + 轻量设备指纹（FingerprintJS）做「一作品一设备一票」去重。
- IP 限速：同 IP 单位时间投票封顶（治无痕反复刷）。
- 人机验证：Cloudflare Turnstile（无感）挡脚本。
- 排序层已用贝叶斯/Elo 兜底。早期流量小不为想象中的攻击者过度加固，**预留异常投票检测钩子即可**。

## 后端接口（最小集 · Hono + SQLite）

```
POST /api/vote        { pairId | workId, choice|rating, turnstileToken, fp }
GET  /api/leaderboard?category=image   -> 排名 + Elo + 样本量 + coverUrl
GET  /api/arena/pair?category=image    -> 一对匿名作品
GET  /api/work/:id/reveal              -> 翻牌：真实模型标签
```

## 数据模型

```
works:   id, category, prompt_id, model_label(隐藏), media_url,
         created_at, bayesian_score, elo, vote_count
prompts: id, category, text, note
votes:   id, work_id|pair_id, choice|rating, fp_hash, ip_hash, created_at
```

工具库/测评/合集/资讯 Phase 1 全走 Content Collections（Markdown），不进数据库。

## 落地实现（2026-06-16）

- **后端** `server/`：Hono + `@hono/node-server`，纯 ESM。`db.mjs`（建表 + `sha`/`pairKey`/`updateElo` K=32）· `seed.mjs`（4 prompt / 14 占位作品，模型标签隐藏）· `index.mjs`（接口 + CORS）。
- **DB**：Node 24 内置 `node:sqlite`（零原生依赖）。表 `prompts / works / votes`；`votes(fp_hash, pair_key)` 唯一索引去重，`votes(ip_hash, created_at)` 索引做限速查询。
- **接口**：`GET /api/arena/pair?category=`（匿名对子）· `POST /api/vote`（Elo + 去重 + IP 限速 + 翻牌）· `GET /api/work/:id/reveal` · `GET /api/leaderboard?category=`（按模型聚合 Elo/样本量，并返回可展示封面 `coverUrl`）· `GET /api/categories`。
- **前端**：`src/components/ArenaVote.tsx`（盲选 + 翻牌 + 品类切换）、`Leaderboard.tsx`（排名 + 可信度）、`HomeRanking.tsx`（首页 AI 生图累计榜前三 + 封面）三个 React island；`/arena`、`/leaderboard` 和首页加载它们。API base = `PUBLIC_API_BASE`（默认 `http://localhost:8787`）。
- **防刷现状**：设备指纹用 localStorage UUID（FingerprintJS 钩子留待）；IP 10 分钟 60 票；Turnstile dev 未接真 key。
- **运行**：`pnpm dev:all` 同时起 Astro(:4321) + Hono(:8787)；`server/*.db` 已 gitignore。
