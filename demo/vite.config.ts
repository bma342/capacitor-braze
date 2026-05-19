import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Note: we use TanStack Router's *programmatic* route tree (see
  // `src/router.tsx`), not the file-based router plugin. Tailwind 4
  // ships its own Vite plugin and replaces the legacy PostCSS pipeline,
  // so `css.postcss: {}` is set to stop Vite from walking parent
  // directories for a stray `postcss.config.*`.
  plugins: [react(), tailwindcss()],
  css: {
    postcss: {},
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
