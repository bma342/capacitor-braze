import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // capacitor-braze is a file: dependency; let Vite pre-bundle it.
  // @braze/web-sdk needs explicit exclusion from pre-bundling to avoid the
  // "factory function is not a function" runtime error per their docs.
  optimizeDeps: {
    exclude: ['@braze/web-sdk'],
  },
});
