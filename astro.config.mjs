import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// This repository is an org-level GitHub Pages repo (InteractiveIntelligenceLab/iil.github.io),
// so it deploys at the domain root: https://iil.github.io/ — no `base` path needed.
export default defineConfig({
  site: "https://iil.github.io",
  trailingSlash: "never",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: "directory",
  },
});
