import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 内容集合入口：所有 Markdown frontmatter 都在这里做结构校验

// —— 工具测评 ——
const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    tool: z.string(), // 工具名
    category: z.string(), // AI 修图 / AI 写作 / AI 编程 …
    date: z.coerce.date(), // 最近更新
    dek: z.string(), // 一句话结论 / 态度
    cover: z.string().optional(),
    rating: z.number().min(0).max(10).optional(),
    pricing: z.string(), // 价格 / 免费额度（定性）
    freeTier: z.boolean().default(false),
    needsVpn: z.boolean().default(false), // 是否需要梯子
    chinese: z.enum(['优秀', '良好', '一般', '差']).default('良好'), // 中文支持度
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
    bestFor: z.array(z.string()).default([]),
    link: z.string().url().optional(), // 官网
    sample: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

// —— 横向对比（结构化表，列 + 行）——
const comparisons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comparisons' }),
  schema: z.object({
    title: z.string(),
    category: z.string(),
    date: z.coerce.date(),
    dek: z.string(),
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    tools: z.array(
      z.object({
        name: z.string(),
        reviewSlug: z.string().optional(),
        values: z.record(z.string()), // 列 key -> 显示值
      }),
    ),
    sample: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

// —— 场景合集（按「我要干什么」组织）——
const scenarios = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/collections' }),
  schema: z.object({
    title: z.string(),
    scenario: z.string(), // 我要干什么
    date: z.coerce.date(),
    dek: z.string(),
    items: z.array(
      z.object({
        tool: z.string(),
        role: z.string(), // 在流程里干嘛
        reviewSlug: z.string().optional(),
      }),
    ),
    sample: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

// —— AI 情报 / 资讯流 ——
const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    kind: z.enum(['限免', '涨价', '新功能', '跑路预警', '发布', '其它']).default('其它'),
    dek: z.string().optional(),
    source: z.string().optional(),
    link: z.string().url().optional(),
    sample: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

// Astro 通过这个对象暴露集合名；页面里的 getCollection 名称必须和这里一致
export const collections = { reviews, comparisons, collections: scenarios, news };
