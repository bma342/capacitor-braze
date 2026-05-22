# L8 — Consumer-Facing Surface

## Verdict
- **0.1.0 ready:** **PASS**
- **Senior-dev review:** **PASS** (one Aromo/portfolio concern flagged)

## Summary
The consumer experience is the strongest non-test layer in the repo. README opens with prominent unofficial disclaimers, the 5-line quick-start matches the actual TS surface, the iOS Podfile requirement is surfaced loudly (the #1 fresh-install footgun), example app builds clean in ~870ms with a button per method, demo app commits both iOS and Android Capacitor projects with React 19 + Tailwind 4 + TanStack Router. CHANGELOG is genuinely human-readable Keep-a-Changelog format with rationale, not commit dumps. No committed API keys.

## Findings

| ID | Severity | File:Line | Issue | Fix |
|----|----------|-----------|-------|-----|
| L8-01 | MAJOR | example/src/main.ts:131 (and src/web.ts:437) | ESLint warning: `'_options' is defined but never used` in `src/web.ts:437:27`. Underscore prefix usually means "intentionally unused" but ESLint's rule isn't configured to allow that. Not a bug, but a CI red squiggle on every PR. | Either add `argsIgnorePattern: '^_'` to the eslint config, or fix the method signature to omit the unused param. |
| L8-02 | MINOR | demo/ios/App/Podfile.lock + demo/android/app/src/main/AndroidManifest.xml | The demo app commits `ios/App/Podfile.lock` + `android/local.properties.example`? Should spot-check that nothing demo-specific (firebase keys, prod endpoints) leaked through. (Quick grep showed nothing real; just Braze SDK example strings inside committed Pods/headers — those are upstream documentation, not secrets.) | Verify `demo/.env.example` contains only placeholders (it does — `BRAZE_API_KEY=YOUR-SDK-API-KEY-HERE` per existing inspection). No fix needed; documenting the check. |
| L8-03 | MINOR | demo/ios/App/Pods/ (205MB local) | Demo's local working tree has Pods/ (205MB) and android/build/ (42MB). Git correctly ignores them — confirmed via `git ls-files`. But the demo's own `.gitignore` doesn't explicitly list `Pods/` (it inherits from root). New contributors who run demo locally + accidentally `git add demo/ios/App/Pods` could leak 205MB into a PR. | Add `ios/App/Pods/` and `android/build/` to `demo/.gitignore` explicitly; defense in depth. |
| L8-04 | MINOR | README.md:24 (Status table) | README claims "35 methods + addListener / removeAllListeners for 2 events." Earlier survey grep counted 36 Promise-returning methods in `src/definitions.ts`. May be a counting mismatch (e.g. `echo` counted in one but not the other) — L1 agent will resolve. If genuinely off-by-one, the public README is wrong. | Reconcile against L1 contract-audit findings; update README. |
| L8-05 | MINOR | demo/package.json | Demo declares peer-equivalent imports of `@braze/web-sdk` but as a `dependencies` entry, not `devDependencies`. Fine for a forkable starter (consumers WILL want it as a direct dep), but worth a README callout that this is the recommended pattern. | Add a short note in demo/README.md: "Consumers should also list `@braze/web-sdk` in dependencies; the plugin declares it as peerDep so npm leaves resolution to the host app." |
| L8-06 | NIT | example/ | The example app's button-per-method UI is functional but bare. For portfolio leverage, consider screenshots in the main README showing the example app exercising a few methods with mock server responses visible. | Optional polish for portfolio screenshots before the 0.1.0 launch tweet/post. |
| L8-07 | NIT | README.md:25 — "Smoke-tested against real Braze: ❌ Not yet the next milestone" | Sentence is missing a comma/dash and reads slightly awkwardly. | "❌ Not yet — the next milestone." |

## What's good
- **Disclaimers everywhere**: README header blockquote, badges (`Unofficial Personal Project` orange shield), package.json description prefix, PLAN/SECURITY/SDK_SURFACE all carry the "not endorsed by Braze, Inc." statement. This is exactly the discipline a Braze senior would expect to see when there's no formal partnership.
- **Quick-start is honest about iOS Podfile edits** — most plugins hide this and the user discovers it via a cryptic CocoaPods error. The README quick-start mentions the two Podfile lines BEFORE `cap sync`, with the rationale and a link to C10. This single decision will save hours of "why doesn't this work" issues.
- **"Which API key do I use?"** is called out in the quick-start with a link to SECURITY.md §1. This is the discipline that wins trust — consumers WILL try to paste a REST key and you've told them not to before they file an issue.
- **Example app builds clean**: 868ms vite build, 209 modules, no warnings. `tsc --noEmit` runs first so type errors fail the build.
- **Demo app is a credible starter**: React 19, TanStack Router, Tailwind 4, Zustand. Two verticals (restaurant ordering + e-commerce per CLAUDE.md) — realistic enough that a consumer fork is a genuine head start.
- **CHANGELOG quality is review-grade.** Each entry has Added/Fixed sections, explains WHY (e.g., "Phase S PrivacyInfo entry walks through the App Store requirement, root cause, and the resource_bundles fix"). Most community plugin changelogs read like git logs; this reads like release notes for humans.
- **No committed real API keys.** `git log -p -S BRAZE_API_KEY` returned nothing; all `apiKey:` hits are either form-input bindings in example, the `.env.example` placeholder, or upstream BrazeKit documentation inside the (locally-installed-only) Pods/.
- **0 vulnerabilities** on `npm audit --audit-level=high --omit=dev`.

## What's risky
- The repo carries strong "this is a personal portfolio project" framing in disclaimers (good for legal/trust) but a Braze-senior reviewer skimming for endorsement-readiness might read those same disclaimers as "this is hobby code." That's the trade-off — REVIEW_READINESS already acknowledges this and lands on the right side. No action needed; documenting the tension.
- One ESLint warning (`_options` unused) means `npm run lint` exits non-zero (warning, not error — won't fail CI as configured, but is noisy). Easy fix.
