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

    /**
     * Coverage of the web bridge (A5-15 — previously "no coverage tooling
     * at all; the 35/35 claim is a hand-maintained markdown table").
     *
     * `enabled` stays false so plain `npm test` is untouched: the fast
     * loop is what makes the suite get run at all. `npm run test:coverage`
     * flips it on.
     *
     * Scoped to `src/web.ts` deliberately. `definitions.ts` is types only
     * (no runtime statements) and `index.ts` is `registerPlugin`, which
     * these tests bypass on purpose — they construct `BrazeWeb` directly
     * so the assertions are about the bridge rather than about Capacitor's
     * registration. Including either would move the percentage without
     * measuring anything.
     *
     * Measuring a file ABOVE this package's root (`test/web`) needs three
     * things, and getting any of them wrong produces the same symptom — an
     * empty `All files | 0 | 0 | 0 | 0` table that reads like a broken
     * provider rather than a filter. In order:
     *
     *   - `allowExternal: true`, or out-of-root files are dropped outright.
     *   - An `include` glob that matches the file's ABSOLUTE path. The
     *     relative-looking `'../../src/web.ts'` silently matches nothing:
     *     patterns go through picomatch, which does not resolve leading
     *     `..` segments. The globstar form used below does match, and is
     *     unambiguous here — no other `src/web.ts` exists in the tree.
     *   - An explicit `exclude`. Vitest's default list contains a dotfile
     *     pattern that matches any path with a dot-prefixed segment, so
     *     coverage silently collects nothing whenever the checkout sits
     *     under one — a `.claude/worktrees/…` worktree, `~/.local/…`, a CI
     *     runner using a dot-prefixed workspace. Overriding it makes the
     *     result independent of where the repo happens to live. `include`
     *     names a single file, so `node_modules` is all that is worth
     *     keeping from the defaults.
     *
     * The thresholds are a RATCHET, set just below the values measured at
     * 0.2.0 (statements/lines 97.44, branches 90.26, functions 100) so
     * they fail on a regression. Raise them as coverage improves; never
     * lower them to make a run pass. `docs/TEST-COVERAGE-AUDIT.md` records
     * the current figures and what the three uncovered regions are.
     */
    coverage: {
      provider: 'v8',
      enabled: false,
      allowExternal: true,
      include: ['**/src/web.ts'],
      exclude: ['**/node_modules/**'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 97,
        branches: 90,
        functions: 99,
        statements: 97,
      },
    },

    /**
     * Drop jsdom's XHR transport errors from the output (A5-16).
     *
     * These are teardown artifacts, not failures. The Web SDK keeps its
     * own flush/retry timers; `teardownPlugin` destroys the SDK and the
     * mock gives in-flight work a bounded grace period, but a test that
     * deliberately abandons an SDK instance mid-request (the re-initialize
     * tests) can still leave one retry to fire against a port that has
     * since been freed. jsdom reports that as a multi-line
     * `Error: connect ECONNREFUSED` / `socket hang up` stack on stderr,
     * and a run that passes then reads like a run that failed — precisely
     * the "signal loss" the audit flagged.
     *
     * Safe to hide because it is never the signal: a connection failure
     * that actually mattered surfaces as a failed assertion or a
     * `waitForCaptured` / `waitUntil` timeout, both of which print their
     * own diagnostics. The filter is narrow on purpose — only jsdom's XHR
     * layer, only these two transport errors — so a genuine error thrown
     * from test or plugin code still prints.
     */
    onConsoleLog(log, type) {
      if (type === 'stderr' && log.includes('jsdom/living/xhr') && /ECONNREFUSED|socket hang up/.test(log)) {
        return false;
      }
      return undefined;
    },
  },
});
