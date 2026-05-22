module.exports = {
  root: true,
  extends: ['@ionic/eslint-config/recommended'],
  ignorePatterns: ['dist/', 'node_modules/', 'example/', 'demo/', 'test/mock-server/'],
  rules: {
    // L10-01: allow underscore-prefixed unused params/vars (e.g. interface-
    // required arg names on web shims that don't yet use the value).
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // L4-T09: lint the web test files (they previously fell through the
      // ignore pattern). Test code can use `expect.any`-style patterns that
      // don't fit the strict any-ban, so we relax those rules here while
      // keeping the rest of the recommended config intact.
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
  ],
};
