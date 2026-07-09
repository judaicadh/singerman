// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';

import netlify from '@astrojs/netlify';

import sitemap from "@astrojs/sitemap";


// https://astro.build/config
export default defineConfig({
  markdown: {
    processor: unified(),
  },
  site: "https://singerman.judaicadhpenn.org",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: netlify(),
});