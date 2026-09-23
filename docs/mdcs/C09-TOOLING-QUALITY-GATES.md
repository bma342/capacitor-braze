# C09 — Tooling & quality gates

**The plugin uses Capacitor's official tooling set (ESLint, Prettier, SwiftLint, `@capacitor/docgen`) with the `@ionic/*` config presets. Lint failures fail CI. The README API section is generated from JSDoc, not hand-edited.**

This MDC exists to lock in the Capacitor-official toolchain. The alternative — letting each contributor pick lint rules, format on save in whatever editor they use, hand-write API docs — is what produces drift over time on multi-author plugins.

---

## Rule

The plugin's quality gates are exactly the set Capacitor's official plugins (`@capacitor/preferences`, `@capacitor/filesystem`, etc.) ship with. Versions move with Capacitor's template; rule sets do not get customized away from the `@ionic/*` defaults without recording the deviation in this MDC.

### Required dev dependencies

| Package | Purpose |
|---|---|
| `eslint` (10.x) | TS linting. **Flat config** — see "ESLint flat config" below |
| `@ionic/eslint-config` (0.5.x) | Capacitor's eslint rules (extends `@typescript-eslint`, `import-x/order`, etc.) |
| `prettier` (3.x) | TS / JS / HTML / CSS formatting |
| `@ionic/prettier-config` | Capacitor's prettier preset |
| `swiftlint` (npm wrapper) | Swift bridge linting |
| `@ionic/swiftlint-config` | Capacitor's swift rules |
| `@capacitor/docgen` | Auto-generates README API section from JSDoc |
| `@vitest/coverage-v8` (in `test/web`) | V8 coverage over `src/web.ts`, with ratcheted thresholds — see "CI integration" below |

### Required scripts

`package.json` MUST expose all of these:

```json
{
  "verify": "npm run verify:web",
  "verify:web": "npm run build",
  "lint": "npm run eslint && npm run prettier -- --check && npm run swiftlint -- lint",
  "fmt": "npm run eslint -- --fix && npm run prettier -- --write && npm run swiftlint -- --fix --format",
  "eslint": "eslint . --max-warnings=0",
  "prettier": "prettier \"**/*.{css,html,ts,js}\"",
  "swiftlint": "node-swiftlint",
  "docgen": "docgen --api BrazePlugin --output-readme README.md --output-json dist/docs.json",
  "build": "npm run clean && tsc && rollup -c rollup.config.mjs && npm run docgen"
}
```

### Required config files

| File | Purpose |
|---|---|
| `eslint.config.cjs` | Spreads `@ionic/eslint-config/recommended` (flat config) |
| `.prettierrc.cjs` | Re-exports `@ionic/prettier-config` |
| `.prettierignore` | Excludes `dist/`, `node_modules/`, `*.md`, lockfiles |
| `.swiftlint.yml` | Inherits from `@ionic/swiftlint-config` |

There is no `.eslintrc.cjs` and no `.eslintignore`; flat config reads neither. Ignores live in the
first block of `eslint.config.cjs`.

## Rationale

Three reasons to use exactly Capacitor's tooling:

1. **A consumer reading our source recognizes the patterns instantly.** Capacitor plugin developers have seen `@ionic/eslint-config` rules a thousand times. Our deviation cost would be measured in confused PRs from contributors who learned the conventions from official plugins.
2. **Updates are tracked upstream.** When the Capacitor team bumps `@ionic/eslint-config` or changes a rule, we get the update by version bump. Custom rules would mean we own that maintenance.
3. **`@capacitor/docgen` works only with the conventions Capacitor's plugins follow** — JSDoc `@example`, single-method-per-interface-line, `export interface` for option types. Adopting docgen forces our TS interface to look like every other Capacitor plugin's, which is itself a quality property.

---

## ESLint flat config

The repo ran ESLint 8 with `.eslintrc.cjs` and an explicit `ESLINT_USE_FLAT_CONFIG=false` until
`0.2.0`. That was a dead end: ESLint 8 is end-of-life, and its config loader kept accreting
advisories — audit finding **A4-21** was two high `js-yaml` DoS advisories reached only through it.
The dev tree is now on **ESLint 10 + flat config**, and full `npm audit` (including dev) reports
zero vulnerabilities.

### Why ESLint 10 and not 9

A4-21 called this "the ESLint 9/10 migration" and named `@ionic/eslint-config` 0.5.0 as the likely
unblocker. It is — and it settles the 9-vs-10 question by itself. 0.5.0 is the flat-config rewrite
of the same preset, and it peer-requires `eslint@^10`. Its own README is explicit: *"v0.5.0 requires
ESLint 10 [...] Staying on ESLint 8 or 9? Keep using `@ionic/eslint-config@0.4.0`."*

So ESLint 9 was never actually on the menu. Targeting 9 would have meant staying on the 0.4.0
eslintrc preset (not a migration at all) or hand-rolling an equivalent rule set from
`typescript-eslint` + `eslint-plugin-import`. **Hand-rolling is the thing this MDC exists to
prevent** — the whole rationale below is that we run exactly Capacitor's ruleset so it tracks
upstream. ESLint 10 keeps the official preset as the base and clears the EOL chain in one move.

### What changed in the rule set

`@ionic/eslint-config` 0.5.0 is the same preset, so most of this is renaming, but four things
genuinely moved:

- `import/*` rules are now [`import-x/*`](https://github.com/un-ts/eslint-plugin-import-x). Any
  `eslint-disable` comment naming an `import/` rule needs updating.
- `@typescript-eslint/prefer-optional-chain` left `recommended` — it now requires typed linting,
  which we do not run.
- `@typescript-eslint/no-unused-vars` is now in the preset itself, at `error`, with the same `^_`
  pattern this repo already set. We keep stating it in `eslint.config.cjs` anyway (see L10-01 there):
  it is our contract, and it should survive a preset bump that drops it rather than silently
  changing behaviour.
- `no-var-requires` was renamed `no-require-imports`.

### Scope: TypeScript only, stated explicitly

Flat config ignores `--ext`, and both Ionic rule sets scope themselves to `**/*.{ts,tsx,mts,cts}`.
That covers the old `--ext ts` behavior, but flat config *also* walks `.js` / `.mjs` / `.cjs` by
default. Those files would then be parsed and matched by no rule block at all — four files
(`rollup.config.mjs`, `.github/scripts/assert-pack.mjs`, `.prettierrc.cjs`, `eslint.config.cjs`)
carrying coverage that reads as real and can never fail.

Per the closing rule of this MDC, a gate that cannot fail is worse than no gate, so the JS
extensions are named in `ignores` rather than left to look linted. This keeps the lint scope
identical to Prettier's (TypeScript only) and identical to the pre-migration baseline: **19 files —
`src/` (3), `test/web/src/` (15), and `test/web/vitest.config.ts`.** Widening to `.mjs` remains the
deliberate non-decision described under "Rules for extending".

### `no-console` is now on (L9-01)

Turning on unused-directive reporting — the ESLint 9+ default — surfaced five
`// eslint-disable-next-line no-console` comments in `src/web.ts` that had never suppressed
anything: `no-console` is in neither `eslint:recommended` nor either Ionic preset, so the rule they
disabled was not enabled in the first place.

The resolution was to enable the rule rather than delete the comments. It matches the evident
intent of whoever wrote them, and it earns its place independently: `SECURITY.md` §3 forbids PII
crossing the logging boundary, and the bridge currently emits no log line containing user data on
any platform. With `no-console` at `error`, keeping it that way stops depending on a reviewer
noticing a new `console.log`. The five existing `console.warn` calls keep their now-live disables.

### `tsconfig.json` pins `"types": []` — do not remove it

`@types/node` is **not used by `src/`** — the plugin targets `lib: ["dom", "es2017"]` and touches no
Node API. It is in the tree only transitively (`swiftlint` → `@ionic/utils-fs` → `@types/fs-extra`,
which asks for `*`), and with no `types` allowlist TypeScript auto-includes it in the library build.

That was harmless only by accident: `@capacitor/docgen` 0.3.0 declared `@types/node` as a real
dependency, which pinned the whole tree to 14.x. 0.3.1 moved it to devDependencies, the `*` floated
to v26, and v26 uses lib types (`IteratorObject`, `BuiltinIteratorReturn`) that TypeScript 5.4 does
not ship — `npm run build` broke with eight errors inside `node_modules/@types/node`.

The first fix was an explicit `@types/node: ^22` devDependency. That was a symptom fix, and it is
gone: `tsconfig.json` now sets `"types": []`, which drops every dev-only transitive `@types/*` out
of a browser-targeted library's type surface for good and makes the build immune to this drift in
both directions. **Do not remove that line**, and do not re-add `@types/node` as a devDependency to
make some tool happy — give that tool its own tsconfig instead.

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

- **ESLint** (`@ionic/eslint-config/recommended`): TS type imports, import order (alphabetized, grouped by source), `@typescript-eslint/explicit-module-boundary-types`, no mutable exports, no duplicate imports. Plus this repo's own `no-console` (L9-01) and `no-unused-vars` `^_` exemption (L10-01). The full preset is in `node_modules/@ionic/eslint-config/recommended.js`; the local additions are in `eslint.config.cjs`. `--max-warnings=0` means a warning fails the build exactly like an error.
- **Prettier** (`@ionic/prettier-config`): trailing commas, single quotes, **120**-char line width, LF endings.
- **SwiftLint** (`@ionic/swiftlint-config`): standard Swift style — line length, force-cast warnings, trailing whitespace, naming conventions.

The rules ARE the design contract. If a contributor wants to deviate, the deviation gets argued in a PR that updates this MDC and the relevant config file. Not by adding a `// eslint-disable-next-line` to one file.

## What lint does NOT catch

- **Kotlin *formatting*.** Capacitor's official template targets Java (via `prettier-plugin-java`), not Kotlin. The Kotlin ecosystem's de-facto formatter is `ktlint`; we don't run it. Kotlin style is reviewed by hand. Add `ktlint` if/when Kotlin diff churn becomes a real cost.
- **`.mjs` files.** The prettier glob is `**/*.{css,html,ts,js}`, so `rollup.config.mjs`, `.github/scripts/assert-pack.mjs` and `.github/scripts/assert-size.mjs` are unformatted by design, and ESLint names the JS extensions in `ignores` so flat config does not pick them up either (see "Scope: TypeScript only" above). Widening either is an MDC change (see "Rules for extending").
- **Cross-file consistency** (e.g. "did you touch every artifact in the lockstep"). That is [C01](./C01-METHOD-ANATOMY.md) discipline and PR review, not lint. Worth being blunt: **nothing in CI fails when a method ships without a native implementation or without tests.**
- **Behavior correctness.** Lint is shape-level. Behaviour is caught by the three test tiers (205 vitest / 91 Robolectric / 35 XCTest), the example app, and — in principle — Layer 4 smoke testing, which has not been run.
- **Swift and Kotlin security analysis.** CodeQL covers `javascript-typescript` and `actions` only. Both native languages need a traced compile inside the CodeQL tracer, which would duplicate the `verify-ios` / `verify-android` setup and roughly double their 8–15-minute runtime; that is a deliberate deferral in the same class as ktlint, and the reasoning is in `codeql.yml`'s header. SwiftLint `--strict`, Android Lint and the 126 native contract tests are what stand in.

**Kotlin static analysis is covered**, separately from formatting: Android Lint runs on the library
module with `abortOnError true`, which is what catches e.g. a call above the `minSdkVersion` floor.
It is in the table below.

## CI integration

The `.github/workflows/test.yml` workflow runs the following jobs on every push to `main` and every PR targeting `main`:

**Nine jobs in `test.yml`, plus two CodeQL analyses in `codeql.yml`.** `test.yml` also runs on a
`v*` tag push and is invoked by `release.yml` via `workflow_call`, which is what puts every one of
its gates in front of `npm publish`. `codeql.yml` is a separate workflow because it needs
`security-events: write` and a language matrix the other jobs have no use for; it is **not** in the
publish path, and is a tracked pre-tag item to make a required check.

| Job | Runner | What it does |
|---|---|---|
| `lint` | ubuntu-latest | `npm run eslint` + `npm run prettier -- --check`. **Not SwiftLint** — see below |
| `build-plugin` | ubuntu-latest | `npm run build`, then asserts the dist artifacts (`dist/esm/index.js`, `dist/esm/index.d.ts`, `dist/plugin.cjs.js`, `dist/docs.json`) exist and the README docgen block is populated, then `node .github/scripts/assert-size.mjs` — gzipped `dist/esm/**/*.js` ≤ **20,480 B**, fails the build above it (measured **17,472 B** at `0.2.0`) |
| `pack-check` | ubuntu-latest | `npm run pack:check` → `.github/scripts/assert-pack.mjs`: asserts every consumer-required path is in the tarball and that nothing from `test/ example/ demo/ docs/ .claude/` leaked |
| `build-example` | ubuntu-latest | Builds the `example/` testbed app against the freshly built plugin |
| `build-demo` | ubuntu-latest | Builds the `demo/` reference app's web assets against the freshly built plugin |
| `test-web` | ubuntu-latest | Type-checks `test/mock-server` and `test/web` (vitest never type-checks), runs the **205** behavioral tests, then re-runs them under `npm run test:coverage` so a drop below the `src/web.ts` coverage ratchet fails the job. Both steps are kept so a test failure and a coverage regression are distinguishable in the log |
| `audit` | ubuntu-latest | `npm audit --audit-level=high --omit=dev` + gitleaks over full history. Snyk was removed in `0.2.0` — its token was never provisioned, so the step always skipped |
| `verify-ios` | macos-latest | Pins `DEVELOPER_DIR` to an Xcode 26.x, installs SwiftLint, runs `swiftlint lint --strict`, regenerates the XCTest target and fails if the committed project is stale, then **one** `xcodebuild test` that builds the demo against BrazeKit 18.2.1 and runs the **35** XCTests |
| `verify-android` | ubuntu-latest | JDK 21. `:app:assembleDebug` against `com.braze:android-sdk-ui` 43.2.0, then `:capacitor-braze:testDebugUnitTest` (**91** Robolectric tests), then `:capacitor-braze:lintDebug` (Android Lint, `abortOnError true`) |
| `analyze (javascript-typescript)` | ubuntu-latest | CodeQL SAST, `build-mode: none`. Separate workflow (`codeql.yml`): push + PR to `main`, plus Mondays 05:27 UTC |
| `analyze (actions)` | ubuntu-latest | CodeQL over the workflow files themselves — `run:`-block injection, over-broad permissions. Same workflow and triggers |

No job talks to a real Braze backend, and no Braze credential exists in CI. The whole suite is
self-contained against the in-process Fastify mock.

**Why the verify-ios + verify-android jobs are non-negotiable now.** Phase N's commit had to be amended twice in Phase O once the iOS bridge was finally compiled against real BrazeKit — methods I'd inferred from documentation didn't exist; cases I'd assumed existed had different names. Same exercise for Android in the follow-up phase. These two slow jobs eliminate the "discover bugs by manual compile attempts every few weeks" pattern by running them on every PR. The cost is ~13-20 extra CI minutes per push; the savings are unbounded.

**SwiftLint runs inside `verify-ios`, and the runner does *not* ship it.** This matters more than it
sounds: `node-swiftlint` warns and exits `0` when the binary is absent, so for as long as the job
assumed the image provided it, the `--strict` gate was a silent no-op that had never enforced a
single rule. `verify-ios` now installs the binary and asserts `swiftlint version` answers before
linting. The `lint` job on Ubuntu deliberately runs ESLint and Prettier only.

A related trap, same shape: `.swiftlint.yml` pointed `parent_config` at
`node_modules/@ionic/swiftlint-config/.swiftlint.yml`, which does not exist — that package ships a
JS module, not YAML. SwiftLint silently ignored the missing parent and ran with no Ionic rules. The
ruleset is now inlined. **When a linter can be configured to lint nothing, prove it fails on
purpose**; the same applies to Android Lint, which was verified by a throwaway file that deliberately
tripped `[NewApi]`.

## Rules for extending

When you add a new file type that should be formatted:

1. Add the extension to the `prettier` script glob in `package.json`.
2. If it needs a non-default prettier plugin, add the plugin to devDeps and document it here.
3. Update the "What lint does NOT catch" list above if the addition closes one of its gaps.

Adding `.mjs` is the obvious candidate and is deliberately not done: it is a two-file gain
(`rollup.config.mjs`, `.github/scripts/assert-pack.mjs`) against a glob change that also sweeps in
anything a future dependency drops at the repo root.

When you discover a new lint rule that should fire:

1. If it's already in `@ionic/eslint-config`, you don't have to do anything — bump the preset version.
2. If it's a project-specific rule, add it to `eslint.config.cjs` AND record the addition + reason in this MDC. The reason matters: future you will read "why is this rule on" and need to know it wasn't arbitrary. `no-console` (L9-01) is the worked example.

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
- **Skipping the lint job in CI** because "the change is small." The lint job is fast; skipping is more expensive than running.
- **A gate that cannot fail.** A linter whose config points at a missing file, a `node-swiftlint` with no binary, an `abortOnError false` — all three of these shipped here and all three read as green. When you add or change a gate, break something on purpose and confirm it goes red before you trust it.
