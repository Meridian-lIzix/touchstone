---
tags: [touchstone, vibe-coding, design]
aliases: [Touchstone 设计系统, Touchstone Design System]
created: 2026-06-16
---

# Touchstone 设计系统

总入口见 [[Touchstone MOC]]。视觉工艺由 `web-design-engineer` skill 方法论主导；本页是落地后的令牌留存。
代码：`src/styles/tokens.css`（令牌）+ `src/styles/global.css`（Tailwind 接入与组件原子）。预览页：`/styleguide`。

## 唯一视觉方向

**warm editorial minimalism（暖编辑型极简）**，对标 Anthropic 官网 + 数字杂志。全站只有这一个方向，不混搭其它风格系统。判断尺子：是否服务于「温暖、克制、像一本好杂志」。

四问定位：叙事＝杂志封面/内容页；距离＝笔记本＋手机；温度＝温暖·克制·有态度；容量＝内容驱动、大留白。

## 颜色（oklch 定义，hex 兜底；light-dark 单一来源）

| 令牌 | Light | 角色 |
|---|---|---|
| `--bg` | `oklch(0.97 0.008 85)` #FAF9F5 | 页面基底（暖奶白，非纯白）|
| `--bg-subtle` | `oklch(0.95 0.012 80)` #F0EEE6 | 次级底 / 占位 |
| `--surface` | `oklch(0.99 0.004 85)` #FEFDFB | 卡片面 |
| `--text` | `oklch(0.22 0.01 60)` #28261F | 正文（暖近黑）|
| `--text-muted` | `oklch(0.52 0.015 60)` #6B655B | 次级文字 |
| `--border` | `oklch(0.90 0.012 80)` #E4E0D6 | 细描边 |
| `--primary` | `oklch(0.64 0.13 42)` #CC785C | 珊瑚陶土 · **唯一主色**，仅点睛 |
| `--primary-hover` | `oklch(0.58 0.14 42)` #B8674C | 主色按下态 |

- Dark 为暖调暗色（非冷蓝灰），由 `color-scheme` 切换 `light-dark()` 自动取值；默认跟随系统，`data-theme` 手动覆盖并写 localStorage（无闪烁）。
- 珊瑚陶土只用于 CTA / 强调 / 活跃态，绝不大面积铺。语义色 `--good/--warn/--bad` 低饱和。

## 字体

- 大标题衬线：`Source Serif 4 Variable` / `Noto Serif SC`（思源宋体）。
- 正文 / UI：`Inter Variable` / `Noto Sans SC`（思源黑体）。
- 数字 / 代码：`Geist Mono`（`.ts-num` 开 `tnum`）。
- 字标 / logo：`Hanken Grotesk Variable`（`--font-wordmark`）—— Anthropic Sans 的免费合法近似，仅作用于品牌字标。
- `font-optical-sizing: auto`；正文行高 1.7；阅读宽 ~68ch；标题 `text-wrap: balance`，正文 `text-wrap: pretty`。

## 间距 / 圆角 / 阴影 / 动效

- 间距：4px 基数，8pt 节奏（4/8/12/16/24/32/48/64…），沿用 Tailwind 默认刻度。
- 圆角：克制——4–8px 为主，最大 12px；拒绝全员胶囊。
- 阴影：极弱，主要靠 1px 描边 + `bg-subtle` 分层；仅浮层用 `--shadow-soft`。
- 动效：一套基调——柔和弹簧 + 列表错位入场（`.ts-rise`）+ 平滑滚动；仅 islands 用 `motion`。全程尊重 `prefers-reduced-motion`（偏好关闭时一律静止）。
- 签名质感：**唯一一处装饰**——极轻 SVG 颗粒噪点（`.grain`，opacity ~0.04）去塑料感。不上玻璃拟态等。

## 组件原子（global.css）

`.ts-btn` / `.ts-btn-primary` / `.ts-btn-ghost`（按钮态）· `.ts-card`（卡片）· `.ts-eyebrow`（mono 小标）· `.ts-num`（等宽数字）· `.ts-rise`（错位入场）。
