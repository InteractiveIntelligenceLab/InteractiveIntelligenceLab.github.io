import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// This organization-level GitHub Pages repo deploys at the domain root:
// https://interactiveintelligencelab.github.io/ — no `base` path needed.
export default defineConfig({
  site: "https://interactiveintelligencelab.github.io",
  trailingSlash: "never",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: "directory",
  },
});
