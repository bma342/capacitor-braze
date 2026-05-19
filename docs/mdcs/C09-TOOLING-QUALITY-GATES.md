# C09 — Tooling & quality gates

**The plugin uses Capacitor's official tooling set (ESLint, Prettier, SwiftLint, `@capacitor/docgen`) with the `@ionic/*` config presets. Lint failures fail CI. The README API section is generated from JSDoc, not hand-edited.**

This MDC exists to lock in the Capacitor-official toolchain. The alternative — letting each contributor pick lint rules, format on save in whatever editor they use, hand-write API docs — is what produces drift over time on multi-author plugins.

---

## Rule

The plugin's quality gates are exactly the set Capacitor's official plugins (`@capacitor/preferences`, `@capacitor/filesystem`, etc.) ship with. Versions move with Capacitor's template; rule sets do not get customized away from the `@ionic/*` defaults without recording the deviation in this MDC.

### Required dev dependencies

| Package | Purpose |
|---|---|
| `eslint` (8.x) | TS linting |
| `@ionic/eslint-config` | Capacitor's eslint rules (extends `@typescript-eslint`, `import/order`, etc.) |
| `prettier` (3.x) | TS / JS / HTML / CSS formatting |
| `@ionic/prettier-config` | Capacitor's prettier preset |
| `swiftlint` (npm wrapper) | Swift bridge linting |
| `@ionic/swiftlint-config` | Capacitor's swift rules |
| `@capacitor/docgen` | Auto-generates README API section from JSDoc |

### Required scripts

`package.json` MUST expose all of these:

```json
{
  "verify": "npm run verify:web",
  "verify:web": "npm run build",
  "lint": "npm run eslint && npm run prettier -- --check && npm run swiftlint -- lint",
  "fmt": "npm run eslint -- --fix && npm run prettier -- --write && npm run swiftlint -- --fix --format",
  "eslint": "ESLINT_USE_FLAT_CONFIG=false eslint . --ext ts",
  "prettier": "prettier \"**/*.{css,html,ts,js}\"",
  "swiftlint": "node-swiftlint",
  "docgen": "docgen --api BrazePlugin --output-readme README.md --output-json dist/docs.json",
  "build": "npm run clean && tsc && rollup -c rollup.config.mjs && npm run docgen"
}
```

### Required config files

| File | Purpose |
|---|---|
| `.eslintrc.cjs` | Extends `@ionic/eslint-config/recommended` |
| `.prettierrc.cjs` | Re-exports `@ionic/prettier-config` |
| `.prettierignore` | Excludes `dist/`, `node_modules/`, `*.md`, lockfiles |
| `.swiftlint.yml` | Inherits from `@ionic/swiftlint-config` |

## Rationale

Three reasons to use exactly Capacitor's tooling:

1. **A consumer reading our source recognizes the patterns instantly.** Capacitor plugin developers have seen `@ionic/eslint-config` rules a thousand times. Our deviation cost would be measured in confused PRs from contributors who learned the conventions from official plugins.
2. **Updates are tracked upstream.** When the Capacitor team bumps `@ionic/eslint-config` or changes a rule, we get the update by version bump. Custom rules would mean we own that maintenance.
3. **`@capacitor/docgen` works only with the conventions Capacitor's plugins follow** — JSDoc `@example`, single-method-per-interface-line, `export interface` for option types. Adopting docgen forces our TS interface to look like every other Capacitor plugin's, which is itself a quality property.

---

## What docgen produces

`@capacitor/docgen` reads `src/definitions.ts`, finds the `BrazePlugin` interface, and generates a Markdown API reference. It writes between two markers in `README.md`:

```md
## API reference

<docgen-index>
... auto-generated method list ...
</docgen-index>

<docgen-api>
... auto-generated per-method signatures + JSDoc body ...
</docgen-api>
```

**Never edit content between the docgen markers by hand.** Run `npm run docgen` (or `npm run build`, which calls it) to refresh. The `verify` CI job greps the API section for at least one method link; an empty section fails the build.

If you want to add prose around the API reference, put it OUTSIDE the markers. Headers, intro paragraphs, examples, and consumer-facing guides all go above or below.

## What lint catches

- **ESLint** (`@ionic/eslint-config/recommended`): TS type imports, import order (alphabetized, grouped by source), `@typescript-eslint/explicit-module-boundary-types`, no mutable exports, no duplicate imports. The full rule set is in `node_modules/@ionic/eslint-config/recommended.js`.
- **Prettier** (`@ionic/prettier-config`): trailing commas, single quotes, 100-char line width, LF endings.
- **SwiftLint** (`@ionic/swiftlint-config`): standard Swift style — line length, force-cast warnings, trailing whitespace, naming conventions.

The rules ARE the design contract. If a contributor wants to deviate, the deviation gets argued in a PR that updates this MDC and the relevant config file. Not by adding a `// eslint-disable-next-line` to one file.

## What lint does NOT catch

- **Kotlin formatting.** Capacitor's official template targets Java (via `prettier-plugin-java`), not Kotlin. The Kotlin ecosystem's de-facto formatter is `ktlint`; we don't run it today. Kotlin style is reviewed by hand. Add `ktlint` if/when Kotlin diff churn becomes a real cost.
- **Cross-file consistency** (e.g. "did you add this method to all 8 files"). That's [C01](./C01-METHOD-ANATOMY.md) discipline and PR review, not lint.
- **Behavior correctness.** Lint is shape-level. Behavior is caught by the example app and Layer 4 smoke testing.

## CI integration

The `.github/workflows/test.yml` workflow runs:

1. **`lint` job** (Ubuntu): `npm run eslint` + `npm run prettier -- --check`. SwiftLint is skipped because Ubuntu runners don't have it; SwiftLint runs in the verify:ios job (forthcoming) on macOS runners.
2. **`build-plugin` job** (Ubuntu): `npm run build` then asserts `dist/` artifacts exist AND the README docgen markers are populated.
3. **`build-example` job** (Ubuntu): builds the example app against the freshly built plugin.

A `verify:ios` macOS-runner job will land when iOS smoke testing is wired up; that's where SwiftLint runs in CI.

## Rules for extending

When you add a new file type that should be formatted:

1. Add the extension to the `prettier` script glob.
2. If it needs a non-default prettier plugin, add the plugin to devDeps and document it here.

When you discover a new lint rule that should fire:

1. If it's already in `@ionic/eslint-config`, you don't have to do anything — bump the preset version.
2. If it's a project-specific rule, add it to `.eslintrc.cjs` AND record the addition + reason in this MDC. The reason matters: future you will read "why is this rule on" and need to know it wasn't arbitrary.

When you upgrade Capacitor major versions:

1. Look at what `npm init @capacitor/plugin@latest` generates against the new major. Diff its `package.json` against ours.
2. Bump our `@ionic/*` config preset versions to match.
3. Run `npm run lint` and `npm run fmt`. Fix any output.
4. Document the upgrade in the CHANGELOG.

## Forbidden

- **`// eslint-disable` comments** without a `-- reason: ...` annotation in the same line. Disables get audited.
- **Custom prettier config** that overrides `@ionic/prettier-config`. The whole point of using the preset is uniformity with other Capacitor plugins.
- **Hand-edited README content inside `<docgen-api>` / `<docgen-index>` markers.** Will be overwritten next docgen run.
- **`prepare`-script tooling that runs on consumer installs.** Our scripts run for developers, not consumers. A consumer running `npm install capacitor-braze` does not get ESLint installed in their tree.
- **Project-local linting tools** (markdownlint, stylelint, etc.) without an MDC update. The set above is intentionally small; expanding requires a deliberate decision.
- **Skipping the lint job in CI** because "the change is small." The lint job is fast (~10s); skipping is more expensive than running.
