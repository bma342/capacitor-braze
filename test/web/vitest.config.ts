import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Block Vite from walking up to a parent project's postcss config.
  // capacitor-braze has no CSS in the test path, but Vite scans by
  // default and there's a stray postcss.config.cjs ancestor above.
  css: {
    postcss: {},
  },
  resolve: {
    alias: {
      // Dedupe `@braze/web-sdk` onto ONE copy.
      //
      // npm installs it twice — once at the repo root (which
      // `src/web.ts`'s dynamic import resolves to) and once under
      // `test/web/` (which these test files resolve to). Same version,
      // but two module instances with two independent singletons: the
      // plugin would initialize one while a test inspected the other,
      // and `instanceof` against SDK classes would be false for every
      // object the plugin produced. That is also the real-world failure
      // mode when a consumer bundles its own copy, so tests must run
      // against the deduped shape the plugin actually expects.
      '@braze/web-sdk': new URL('../../node_modules/@braze/web-sdk/src/index.js', import.meta.url).pathname,
    },
  },
  test: {
    // jsdom gives @braze/web-sdk a `window`, `localStorage`, and `fetch`
    // — all of which the SDK touches during init + event posting.
    environment: 'jsdom',
    globals: true,
    // Each test file starts a fresh mock server on a random port (see
    // src/test-utils.ts), so tests can run in parallel safely. But the
    // SDK has module-level singleton state — we serialize within a
    // file by using vitest's default sequential within-file order.
    pool: 'forks',
    isolate: true,
    // Generous: the SDK's openSession + first POST can take a beat
    // under jsdom.
    testTimeout: 15_000,
  },
});
