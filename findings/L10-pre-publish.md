# L10 — Pre-Publish Blockers

## Verdict
- **0.1.0 ready:** **PASS** with two MUST-FIX items
- **Senior-dev review:** **PASS**

## Summary
The publish pipeline is in good shape: clean `files` field (no test/docs/example leak), 104.4KB packed tarball, 522KB unpacked, `prepublishOnly: build`, no postinstall, provenance + 2FA wired into release.yml. No committed secrets, npm audit clean, build green. The two must-fix items before tagging 0.1.0 are: (a) one ESLint warning currently lives in the codebase (cosmetic, but `npm run lint` exits with warnings), and (b) version is still `0.0.12` — a version bump + CHANGELOG entry are the literal final steps.

## Findings

| ID | Severity | File:Line | Issue | Fix |
|----|----------|-----------|-------|-----|
| L10-01 | MAJOR (must-fix-before-0.1.0) | src/web.ts:437:27 | ESLint warning `'_options' is defined but never used (@typescript-eslint/no-unused-vars)`. CI's ESLint runs without `--max-warnings 0`, so this slips through, but a release with lint noise is sloppy. | Either configure eslint `argsIgnorePattern: '^_'` (preferred — preserves the "intentionally unused" semantic) or remove the `_options` param from the method signature. |
| L10-02 | MAJOR (must-fix-before-0.1.0) | package.json:3 | Version is `0.0.12`. The 0.1.0 release blocker is the manual steps PLAN/README already document: bump version + add CHANGELOG entry + tag. | When ready: `npm version 0.1.0 --no-git-tag-version`, update CHANGELOG `## [Unreleased]` → `## [0.1.0] - 2026-MM-DD`, commit, tag `v0.1.0`, push tag. release.yml does the rest. |
| L10-03 | MINOR | local-tooling | SwiftLint missing from local PATH on the macOS dev machine — `npm run lint` warns but proceeds. CI doesn't enforce swiftlint either (see L7-01). | `brew install swiftlint`. Combined with L7-01 to wire swiftlint into verify-ios. |
| L10-04 | MINOR | package.json `files` | `files` field lists `android/proguard-rules.pro` and `android/consumer-rules.pro` — both present in the tarball (verified via `npm pack --dry-run`). Good. But: `dist/docs.json` ships at 63.7KB — useful for IDE tooling but rarely consumed at runtime by plugin users. Worth confirming this is intentional. | If intentional (powering IDE tooling / docs sites): keep. Otherwise consider excluding to shrink tarball. Recommend keep. |
| L10-05 | MINOR | dist/esm/web.js.map (46.6KB) + plugin.cjs.js.map (47KB) + plugin.js.map (47KB) + definitions.js.map (38KB) | Source maps are 178KB of the 522KB unpacked total. Useful for consumers debugging in their app, standard practice. Documenting because it's a noticeable share. | No fix; documenting. |
| L10-06 | MINOR | dist/esm/definitions.d.ts (32KB) | The auto-generated .d.ts is 32KB. Healthy for an API of this size (35 methods + many interface types). | No fix. |
| L10-07 | NIT | README.md (66.9KB shipped in tarball) | README ships in the tarball — standard, but at 66.9KB it's the second-largest file after `dist/docs.json`. Worth confirming it's not bloated with content that belongs in docs/. | Skim for sections that could be moved to `docs/` and linked. Optional. |

## Pre-publish checklist (verified PASS)
- [x] `npm pack --dry-run` lists only intended files (26 files, no test/example/demo/node_modules leak)
- [x] `prepublishOnly` script runs `npm run build` — verified in package.json:46
- [x] No `postinstall` script
- [x] `prepare` script (`npm run build`) is safe — runs only on git-installs, executes the same build pipeline as `prepublishOnly`. This is the correct pattern given the README's "consume via git until 0.1.0" guidance. Verified added in package.json:55.
- [x] `files` field explicit (allowlist not denylist)
- [x] `dist/` populated and committed-to-CI on every PR
- [x] `npm audit --audit-level=high --omit=dev` → 0 vulnerabilities
- [x] `docgen` output present in tarball (`dist/docs.json` 63.7KB)
- [x] `dist/esm/index.d.ts` exists (types entry point)
- [x] `dist/plugin.cjs.js` exists (CommonJS main)
- [x] `dist/esm/index.js` exists (ESM module)
- [x] `dist/plugin.js` exists (UMD/unpkg)
- [x] LICENSE present, MIT, included in tarball
- [x] CapacitorBraze.podspec included
- [x] android sources included
- [x] ios/Plugin included incl. PrivacyInfo.xcprivacy + BrazePlugin.m
- [x] Release workflow checks tag matches package.json version
- [x] Release workflow uses `--provenance --access public`
- [x] No 0.0.x → 0.x.x leftover artifacts in dist/
- [x] No committed API keys (git log -S BRAZE_API_KEY clean)
- [x] No committed `.env` (only `.env.example` in demo/)

## What's good
- Tarball discipline: 26 files, 104.4KB packed. No dotfile leaks, no test dirs, no demo, no examples. The `files` field allowlist approach (rather than relying on .npmignore denylist) is the correct pattern for shipping plugins.
- Release workflow guards against the classic tag/version mismatch with an explicit shell check.
- Provenance attestation + signed-commits-on-main provide a credible supply-chain story.
- `prepublishOnly` ensures a fresh build runs at publish time — no possibility of publishing stale dist/.
- Package.json keywords include `appboy` (Braze's legacy name) — helps discovery for teams migrating from old docs.

## What's risky
- L10-01 (the ESLint warning) is cosmetic but is the kind of thing a senior reviewer notices in the first 30 seconds. Fix before tagging.
- L10-02 — version bump is a literal pre-flight item, not a finding, but listing it so SUMMARY.md captures it.
