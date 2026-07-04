// 四类内容集合的 zod schema：与 src/content.config.ts 保持同构
// content.config.ts 依赖 astro:content 虚拟模块无法在纯 Node 里 import，
// 这里经 astro/zod 重写一份；改动 schema 时两处必须同步（见文件顶部对照）
import { z } from 'astro/zod';

const reviews = z.object({
  title: z.string().min(1),
  tool: z.string().min(1),
  category: z.string().min(1),
  date: z.coerce.date(),
  dek: z.string().min(1),
  rating: z.number().min(0).max(10).optional(),
  pricing: z.string().min(1),
  freeTier: z.boolean().default(false),
  needsVpn: z.boolean().default(false),
  chinese: z.enum(['优秀', '良好', '一般', '差']).default('良好'),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  bestFor: z.array(z.string()).default([]),
  link: z.string().url().optional(),
  sample: z.boolean().default(false),
  draft: z.boolean().default(false),
});

const comparisons = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  date: z.coerce.date(),
  dek: z.string().min(1),
  columns: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).min(1),
  tools: z
    .array(
      z.object({
        name: z.string().min(1),
        reviewSlug: z.string().optional(),
        values: z.record(z.string()),
      }),
    )
    .min(1),
  sample: z.boolean().default(false),
  draft: z.boolean().default(false),
});

const collections = z.object({
  title: z.string().min(1),
  scenario: z.string().min(1),
  date: z.coerce.date(),
  dek: z.string().min(1),
  items: z
    .array(
      z.object({
        tool: z.string().min(1),
        role: z.string().min(1),
        reviewSlug: z.string().optional(),
      }),
    )
    .min(1),
  sample: z.boolean().default(false),
  draft: z.boolean().default(false),
});

const news = z.object({
  title: z.string().min(1),
  date: z.coerce.date(),
  kind: z.enum(['限免', '涨价', '新功能', '跑路预警', '发布', '其它']).default('其它'),
  dek: z.string().optional(),
  source: z.string().optional(),
  link: z.string().url().optional(),
  sample: z.boolean().default(false),
  draft: z.boolean().default(false),
});

// dir 相对仓库根；label 用于后台导航与提交信息
export const COLLECTIONS = {
  reviews: { label: '工具测评', dir: 'src/content/reviews', schema: reviews },
  comparisons: { label: '横向对比', dir: 'src/content/comparisons', schema: comparisons },
  collections: { label: '场景合集', dir: 'src/content/collections', schema: collections },
  news: { label: 'AI 情报', dir: 'src/content/news', schema: news },
};
