// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

// Astro 主配置：静态生成负责内容和 SEO，少量交互交给 React islands
export default defineConfig({
  // 待办：备案和正式域名确定后替换，会影响 canonical、sitemap、og:url 和 robots
  site: 'https://touchstone.local',
  integrations: [react(), sitemap(), pagefind()],
  vite: {
    plugins: [tailwindcss()],
  },
});
