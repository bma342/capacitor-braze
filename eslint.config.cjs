// ESLint 10 flat config. Replaces `.eslintrc.cjs` + `ESLINT_USE_FLAT_CONFIG=false`.
//
// The base is still Capacitor/Ionic's official ruleset (C09): `@ionic/eslint-config`
// 0.5.0 is the flat-config rewrite of the same preset and peer-requires ESLint 10,
// so no rules are hand-rolled here. See docs/mdcs/C09-TOOLING-QUALITY-GATES.md.
//
// Both Ionic rule sets scope themselves to TypeScript files, which is why flat
// config needs no replacement for the old `--ext ts` flag.

const ionic = require('@ionic/eslint-config/recommended');

module.exports = [
  {
    // Flat config has no `.eslintignore`; these are the `ignorePatterns` from
    // the old `.eslintrc.cjs`, plus the nested `node_modules/` that ESLint 8
    // ignored implicitly and flat config does not.
    ignores: [
      'dist/**',
      '**/node_modules/**',
      // Local-only: Claude Code agent worktrees are checked out under .claude/
      // (gitignored). Flat config does not consult .gitignore.
      '.claude/**',
      'example/**',
      'demo/**',
      'test/mock-server/**',

      // Flat config lints `.js` / `.mjs` / `.cjs` by default, where the old
      // `--ext ts` did not. Both Ionic rule sets scope themselves to TypeScript,
      // so those files would be walked and matched by no rule block at all —
      // coverage that reads as real and can never fail. C09 keeps the lint and
      // Prettier scope deliberately TypeScript-only (`rollup.config.mjs` and
      // `.github/scripts/assert-pack.mjs` are the whole population), so say so
      // here rather than leaving a vacuous gate behind.
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  },

  ...ionic,

  {
    // L10-01: allow underscore-prefixed unused params/vars (e.g. interface-
    // required arg names on web shims that don't yet use the value).
    //
    // `@ionic/eslint-config` 0.5.0 now ships this same `^_` pattern itself, at
    // `error`. Keeping it stated here is deliberate: it is the repo's own
    // contract, and it should survive a preset bump that drops or renames the
    // upstream copy rather than silently changing behaviour.
    name: 'capacitor-braze/unused-vars',
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // L9-01: `no-console` is in neither `eslint:recommended` nor either
      // Ionic preset, so the five `// eslint-disable-next-line no-console`
      // directives in `src/web.ts` had never suppressed anything. ESLint 9+
      // reports unused directives by default, which is what surfaced it.
      //
      // Turning the rule on is the resolution that matches the author's
      // evident intent, and it is worth having on its own merits: SECURITY.md
      // §3 forbids PII crossing the logging boundary, so every console call in
      // the bridge should be a deliberate, reviewed opt-out rather than
      // something that can be added without anyone noticing.
      'no-console': 'error',
    },
  },

  {
    // L4-T09: lint the web test files (they previously fell through the
    // ignore pattern). Test code can use `expect.any`-style patterns that
    // don't fit the strict any-ban, so we relax those rules here while
    // keeping the rest of the recommended config intact.
    name: 'capacitor-braze/web-tests',
    files: ['test/web/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test teardown frequently uses `try { ... } catch {}` and
      // `.catch(() => {})` to suppress errors from stale resources
      // (mock server already stopped, plugin already wiped, etc.).
      // That pattern is the right call inside afterAll/afterEach;
      // forbidding empty blocks here would force noise without
      // catching real bugs.
      'no-empty': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
];
