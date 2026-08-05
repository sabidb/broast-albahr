import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Static single-page ordering app for Broast Albahr.
// Builds to ./dist — deploy on any static host (Vercel, Netlify, GH Pages…).
export default defineConfig({
  output: 'static',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  devToolbar: { enabled: false },
});
