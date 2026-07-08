// 站点常量与 JSON-LD 构造器；SEO 是这个站的命根子，结构化数据按页型选用

// 全站共享品牌信息，页面标题、描述和结构化数据都从这里取默认值
export const SITE = {
  name: 'Touchstone',
  tagline: '站长实测、用户盲评、贝叶斯排行的中文 AI 工具测评 — 真金，不怕盲测',
  locale: 'zh_CN',
} as const;

// 相对路径转绝对 URL；Astro.site 缺失时退回原路径，避免本地开发报错
export function abs(path: string, site: URL | undefined): string {
  try {
    return site ? new URL(path, site).href : path;
  } catch {
    return path;
  }
}

type Img = string | undefined;

// 普通文章页的结构化数据，供横评、资讯和合集等内容页复用
export function articleLd(o: {
  headline: string;
  description?: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  image?: Img;
  section?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: o.headline,
    description: o.description,
    url: o.url,
    mainEntityOfPage: o.url,
    datePublished: o.datePublished,
    dateModified: o.dateModified ?? o.datePublished,
    articleSection: o.section,
    image: o.image ? [o.image] : undefined,
    author: { '@type': 'Organization', name: SITE.name },
    publisher: { '@type': 'Organization', name: SITE.name },
  };
}

// 测评详情页的结构化数据，重点声明被测工具和评分
export function reviewLd(o: {
  itemName: string;
  category?: string;
  description?: string;
  url: string;
  ratingValue?: number;
  datePublished?: string;
  image?: Img;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    url: o.url,
    datePublished: o.datePublished,
    itemReviewed: {
      '@type': 'SoftwareApplication',
      name: o.itemName,
      applicationCategory: o.category,
    },
    reviewRating:
      o.ratingValue != null
        ? { '@type': 'Rating', ratingValue: o.ratingValue, bestRating: 10, worstRating: 0 }
        : undefined,
    reviewBody: o.description,
    image: o.image ? [o.image] : undefined,
    author: { '@type': 'Organization', name: SITE.name },
    publisher: { '@type': 'Organization', name: SITE.name },
  };
}

// 列表页的结构化数据，用于告诉搜索引擎当前页是一组内容索引
export function itemListLd(o: { name: string; url: string; items: { name: string; url: string }[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: o.name,
    url: o.url,
    numberOfItems: o.items.length,
    itemListElement: o.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

// 面包屑结构化数据，当前预留给需要多级路径的页面使用
export function breadcrumbLd(crumbs: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}
