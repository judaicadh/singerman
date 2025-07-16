// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from '@astrojs/react';

import netlify from '@astrojs/netlify';

import sitemap from "@astrojs/sitemap";


// https://astro.build/config
export default defineConfig({

  site: "https://www.singerman.judaicadhpenn.org",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: netlify(),
});