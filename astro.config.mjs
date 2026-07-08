// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

export default defineConfig({
  site: 'https://touchstone.anamnesis.team',
  devToolbar: { enabled: false },
  integrations: [react(), sitemap(), pagefind()],
  vite: {
    plugins: [tailwindcss()],
  },
});
