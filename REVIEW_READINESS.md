# Review Readiness — Quality Bar & Pre-Release Checklist

> The standard the plugin must clear to (a) be genuinely easy for any Capacitor team to adopt, (b) be feature-complete enough to ship to production, and (c) survive a tough review from a senior Braze SDK engineer. Companion to [`PLAN.md`](./PLAN.md), [`SDK_SURFACE.md`](./SDK_SURFACE.md), [`SECURITY.md`](./SECURITY.md).

**Last updated:** 2026-09-22

## Review snapshot — 2026-09-22 (`0.2.0`)

Real numbers, verified against the tree on this date. Everything else in this document is a
standard to aim at; this block is what is true.

| | |
|---|---|
| **Version** | `0.2.0` (unreleased on this branch). `0.1.0` is on npm since 2026-05-22 |
| **Public surface** | 35 methods + 5 listener events (`featureFlagsUpdated`, `contentCardsUpdated`, `inAppMessageReceived`, `sdkAuthError`, `deepLinkReceived`) |
| **Web tests** | **206** vitest across **18 files**, ~3.4s, against an in-process Fastify mock |
| **Android tests** | **91** Robolectric/JUnit — run in CI |
| **iOS tests** | **35** XCTest — run in CI via a generated target (`scripts/ios-add-test-target.rb`) |
| **CI jobs** | **9** in `test.yml` + **2** CodeQL analyses in `codeql.yml`, all actions SHA-pinned, per-job least-privilege permissions |
| **Lint** | **ESLint 10** flat config (`eslint.config.cjs`) on `@ionic/eslint-config` 0.5.0, run with `--max-warnings=0`; Prettier 3.9; SwiftLint `--strict`; Android Lint `abortOnError true`. `npm audit` including dev deps: **0 vulnerabilities** |
| **Native pins** | BrazeKit/BrazeUI **18.2.1** (Xcode 26+), `com.braze:android-sdk-ui` **43.2.0**, `@braze/web-sdk` peer **`^6.13.0`** (security floor) |
| **Capacitor** | `^6.0.0 \|\| ^7.0.0`. **Capacitor 8: not supported**, tracked follow-up |
| **Coverage instrumentation** | **web only**: `src/web.ts` measured at 97.45% statements/lines, 90.80% branches, 100% functions, with ratcheted thresholds enforced in the `test-web` job. **Native: none** — the Android and iOS numbers are test counts. `docs/TEST-COVERAGE-AUDIT.md` reports the measurement |
| **Layer 4 (real Braze)** | **never run.** No release is validated against a live Braze backend |
| **e2e runner (Maestro/Detox)** | **none, and none planned** — decided against; see `PLAN.md` §14 |
| **Perf / bundle budgets in CI** | **one, enforced**: gzipped ESM bundle ≤ 20,480 B (measured 17,472 B). The other budgets in §2 were unmeasured guesses and are gone |
| **SAST / CodeQL** | **CodeQL on `javascript-typescript` + `actions`** (push, PR, weekly), plus `npm audit`, gitleaks and secret scanning. Swift/Kotlin need a traced native build — deferred, see `codeql.yml`. Snyk removed: its token was never provisioned |
| **Provenance** | `0.1.0` published by hand, **no attestation**. `0.2.0` will be the first workflow-published release |
| **Repo settings still to do** | private vulnerability reporting, `enforce_admins`, `v*` tag ruleset, npm Trusted Publishing — see [CONTRIBUTING](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020) |

Two self-audits sit behind this: [`docs/audits/2026-05/`](./docs/audits/2026-05/) (at `0.0.12`) and
[`docs/audits/2026-09/`](./docs/audits/2026-09/) (at `0.1.0`), each archived with a per-finding
resolution table.

**How to read the rest of this document.** §1–§4 are the *standard*; §5 is the release checklist;
§6 is the graded snapshot with evidence; §7 is what remains. Where §1–§4 describe something that
does not exist, they now say so inline rather than in the present indicative.

---

## 0. Operating philosophy

Three lenses, applied to every PR and every release:

1. **Adoption lens** — would a developer who has never heard of us ship this in their app in under 30 minutes?
2. **Completeness lens** — does the plugin cover the surface a real production Braze app actually needs, or is it a toy demo?
3. **Braze-engineer lens** — if a senior engineer from `braze-inc` reviewed this code looking for reasons to deny official endorsement, what would they find?

The third lens is the strictest. Pass it and the other two follow.

---

## 1. Adoption lens — DX standards

### Quick-start must be ≤5 lines

```ts
import { Braze } from 'capacitor-braze';

await Braze.initialize({ apiKey: 'YOUR-SDK-KEY', endpoint: 'sdk.iad-03.braze.com' });
await Braze.changeUser({ userId: 'user_123' });
await Braze.logCustomEvent({ name: 'app_opened' });
```

If a quick-start needs more, the API surface is wrong.

### One-command install

```bash
npm install capacitor-braze && npx cap sync
```

> ⛔ **Not met today, and unlikely to be.** Five consumer-side edits are mandatory: two Podfile lines
> (`platform :ios, '15.0'`, `use_frameworks! :linkage => :static`) and three Android Gradle bumps
> (AGP 8.6.0, Kotlin 2.2.0, compileSdk 35 + Gradle 8.7). Plus **Xcode 26+**. All are forced by how
> the Braze SDKs are packaged and by their transitive androidx deps, and the plugin cannot apply
> them — [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) forbids mutating a consumer's
> build files from a `postinstall`, which is also Capacitor's position.
>
> The standard the project actually holds itself to is the escape clause below: **if a step beyond
> `cap sync` is required, document it loudly**. That is met — the README's Platform setup section,
> its Troubleshooting table, and C10 all carry the exact edits and the exact error each omission
> produces.

### Type-driven discovery

- Every method, parameter, and return type has JSDoc.
- IDE autocomplete (VS Code, JetBrains) shows method signatures + examples on hover.
- ~~TypeDoc HTML reference auto-generated, hosted via GitHub Pages.~~ **Deliberately not done.** The project uses `@capacitor/docgen` into the README instead, per [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md) — one reference, in the place consumers already look, regenerated by `npm run build` and asserted by CI. §6 and §7 below record the same decision.
- No `any` types — discriminated unions for cross-platform divergent returns.

### Error messages that name the fix

Bad:
```
Error: Invalid parameter
```

Good:
```
BrazeInitializationError: `endpoint` is required and must start with 'https://'.
Got: 'sdk.iad-03.braze.com'. Try: 'https://sdk.iad-03.braze.com'.
Docs: https://github.com/bma342/capacitor-braze#initialization
```

Every plugin error class has: error code, what went wrong, what to try, link to relevant doc section.

### Example app that just works

`example/` contains a working Capacitor app with a button for every plugin method, including all
four listener events. **`cd example && npm install && npm run dev` works on a fresh clone** —
`npx cap run ios` does **not**, because `example/`'s native projects are deliberately not committed
(`npx cap add ios|android` generates them; `example/README.md` says so). The app with committed
native projects is `demo/`, which is what CI and the local native gates build.

### README structure (mirrors Braze's own docs)

| # | Section | Status |
|---|---|---|
| 1 | What this is + comparison to alternatives (Cordova SDK, web-only, custom bridge) | ✓ "Why this exists" |
| 2 | Install + quick-start | ✓ |
| 3 | Initialization options reference | ✓ table under Quick start, plus the full docgen reference |
| 4 | **Which key do I use?** (SDK vs. REST) | ✓ under Security |
| 5 | **Should I enable SDK Authentication?** | ✓ under Security |
| 6 | **Push notifications setup** | ✓ per-platform under Platform setup, incl. `enablePushAutomation` and both Android `FirebaseMessagingService` paths |
| 7 | **In-app messages** (defaults + customization) | ✓ via the `enableInAppMessageUI` option row + the docgen reference |
| 8 | Content cards / feature flags / etc. | ✓ docgen reference |
| 9 | Privacy & GDPR / CCPA flows | ✓ "Right to be forgotten" + "Privacy declarations you must make" |
| 10 | Platform parity matrix (honest table) | ⚠️ partial — the logging-semantics table and the per-platform notes in Status and Troubleshooting cover the divergences; there is no single parity grid. [`SDK_SURFACE.md` §3](./SDK_SURFACE.md) holds the authoritative one |
| 11 | Troubleshooting (top 10 issues + fixes) | ✓ 12-row table |
| 12 | Migration guides (per major version) | ○ n/a pre-1.0; breaking changes are enumerated in the CHANGELOG's `Breaking` section |
| 13 | Contributing | ✓ |
| 14 | License + maintainer | ✓ |

Note item 6: there is no `enableAutomaticPushHandling` option and never was — the iOS equivalent is
`enablePushAutomation`, and Android's automatic FCM registration is Braze's own, configured in
`braze.xml`.

---

## 2. Completeness lens — production readiness

### Required behaviors at v0.1

> **Every box below is unchecked because each one requires a live Braze dashboard to verify, and the
> Layer 4 smoke has never been run.** They are the Layer 4 checklist, and they stay unchecked until
> someone walks [`docs/SMOKE-TEST-PLAYBOOK.md`](./docs/SMOKE-TEST-PLAYBOOK.md) against a real trial
> and commits the capture files. Note what this does *not* mean: the bridge translation for each of
> these paths is covered by the 206 + 91 + 35 automated tests. What is unverified is the round trip
> to Braze's backend.

- [ ] App initializes Braze, identifies user, logs an event → event appears in Braze dashboard.
- [ ] App handles push permission request → granted state matches OS. *(via `@capacitor/push-notifications`; the plugin exposes no permission method)*
- [ ] App receives a push notification → opens app, deep link routes correctly. *(iOS needs `enablePushAutomation: true` for opens; Android needs the consumer's `FirebaseMessagingService` wiring — see C10)*
- [ ] App receives an in-app message → renders, click logs back to Braze.
- [ ] App fetches content cards → renders, impression + click log back.
- [ ] User logs out → `wipeData()` + `disableSDK()` → no further events sent.
- [ ] App background → foreground → session continues correctly.
- [ ] App killed → relaunched → user identity preserved.
- [ ] OS revokes push permission → SDK gracefully handles, doesn't crash.
- [ ] Network unavailable → events queued, sent when connectivity returns.
- [ ] SDK Authentication enabled → invalid JWT → consumer's error handler fires.
- [ ] SDK Authentication enabled → JWT expires mid-session → re-auth flow works.

~~Each gets a Maestro e2e test before v0.1 ships.~~ **Superseded.** There is no Maestro test, no
e2e runner, and none planned — see `PLAN.md` §14 item 3 for the decision and §7 below for the
deferral. These scenarios are covered by the web behavioral suite where the bridge owns the
behaviour (the SDK-Auth enforcement cases in particular), and belong to the Layer 4 playbook where
they need a real backend.

### Edge cases covered in tests

- Init called twice → second call is no-op (or replaces config, documented).
- `changeUser` to same userId → no-op (no spurious profile churn).
- `logCustomEvent` with `null` property values → handled cleanly.
- Custom attribute with array > 100 items → clear error, references Braze limit.
- Push token received before init complete → queued and registered on init.
- App version update → device ID preserved unless `wipeData` called.

### Performance budgets (per [SDK_SURFACE.md §5](./SDK_SURFACE.md#5-bundle-size--performance))

> **One budget is measured and enforced. The rest have been deleted rather than left standing as
> aspirations** — an unmeasured budget in a readiness document is a claim a reviewer can falsify in
> thirty seconds, which is worse than admitting there is no budget.

| Metric | Budget | How it is measured | Enforced? |
|---|---|---|---|
| Web bundle gzipped, plugin only (`dist/esm/**/*.js`) | **≤ 20,480 B** — measured **17,472 B** at `0.2.0` (2026-09-22) | `node .github/scripts/assert-size.mjs`, run in the `build-plugin` job | **✓ fails the build** |

The number is what it is: ~13.2 KB gzipped for the bridge, not the **"<5 KB"** this table used to
promise. Thirty-five methods of boundary validation, DTO serializers and listener plumbing do not
fit in 5 KB, and nobody had ever checked. `dist/plugin.cjs.js` (13,213 B gzipped) is printed
alongside for information and is not gated — Rollup builds it from the same modules, so it tracks
the ESM total. `@braze/web-sdk` is a peer dependency and is never bundled, so it is outside the
budget by construction.

The budget carries ~17% headroom over the measurement, which absorbs ordinary method-by-method
growth while still catching a dependency accidentally inlined into the bundle. Raising it is
allowed, in the same commit as the code that needs it, with the new measurement recorded in the
script header and here; raising it to turn a red build green is not.

**Removed from this table, and honestly so:** `.aar` size (<50 KB), `.framework` size (<100 KB),
cold-start init time (<100 ms native / <50 ms web) and bridge round-trip (<5 ms). None was ever
measured, none had an instrument, and two of them (the native binary sizes) are dominated by the
Braze SDKs rather than by anything this plugin controls. If a real need for them appears, they come
back with a measurement attached, not as targets.

The other size-related gate is `pack-check`, which asserts the npm tarball's *contents* — every
consumer-required artifact present, no repo-internal directory leaked — not its size.

---

## 3. Braze-engineer lens — what a senior reviewer would check

Concrete things a senior Braze SDK engineer would look for when deciding whether to (a) link from Braze docs, (b) absorb officially, or (c) actively deny.

### Native code quality

**Android Kotlin (`BrazePlugin.kt`):**
- [x] Uses `@CapacitorPlugin` annotation per Capacitor's official pattern.
- [x] Calls Braze SDK only through public `Braze.getInstance(context)` API — no reflection, no private API access.
- [x] No `!!`, no `Any`, no `@Suppress` without documented reason.
- [x] Coroutine-correct: no `runBlocking`, no UI thread blocking.
- [x] ProGuard rules in `consumer-rules.pro` so minified consumer apps don't strip Braze SDK classes.
- **[ ]** Not audited against `braze-react-native-sdk`'s Android bridge. The plugin follows Capacitor's own conventions instead, which is the more load-bearing style contract for a Capacitor plugin.
- **[x]** Android Lint runs on the library module with `abortOnError true` and is a CI gate. Two warnings remain, both "a newer version is available" advisories against deliberate C08 pins, so `warningsAsErrors` stays `false`. No lint rule is disabled anywhere.
- [x] No version range pins; everything exact.

**iOS Swift (`BrazePlugin.swift`):**
- [x] Uses `CAPPlugin` + `CAPPluginCall` per Capacitor's pattern.
- [x] Calls `BrazeKit` via official public API — no `@objc` private hooks.
- [x] No force unwraps (`!`), proper `guard let` / `if let`.
- [x] `[weak self]` in all closures retaining the plugin.
- [x] UI-affecting calls dispatched to main thread explicitly.
- [x] `PrivacyInfo.xcprivacy` manifest included (Apple App Store requirement).
- **[ ]** **CocoaPods only.** There is no `Package.swift` and no `CAPBridgedPlugin` conformance. This matters more than it used to: Capacitor 8's CLI generates SPM iOS projects by default, so the plugin does not install into a default-generated Cap 8 app. Tracked in `SDK_SURFACE.md`'s roadmap.
- **[ ]** Not audited against `braze-react-native-sdk`'s iOS bridge — same reasoning as the Android row.
- [x] SwiftLint clean.

**TypeScript (`src/`):**
- [x] `strict: true` in tsconfig.
- [x] No `any`, no `unknown` returned to consumers (always typed).
- [x] Discriminated unions for cross-platform divergent results.
- [x] Every public method has a JSDoc comment with `@example`.
- [x] Tree-shakeable (no top-level side effects in `index.ts`).
- [x] No runtime dependencies beyond `@capacitor/core` peer.

### Security posture

- [x] SDK Authentication first-class in v0.1, not bolted on later.
- [x] `enableLogging` defaults to `false`.
- [x] HTTPS enforced by default (`allowInsecureEndpoint: false`).
- [x] PII never logged, even at debug level (per [`SECURITY.md §3`](./SECURITY.md#3-pii-handling)).
- [x] Push token single-owner enforced.
- [x] Threat model published in `SECURITY.md`.
- [x] Vulnerability disclosure policy in `SECURITY.md`.
- **[x]** No `postinstall`. Note the nuance: `prepare` runs the build, which executes on a **git-URL or local** install (arbitrary code at install time) but is skipped for registry-tarball installs — and the README now tells consumers to install from the registry.
- **⚠️** Provenance: yes, from `0.2.0` onward — `0.1.0` was published by hand and has **no attestation**. 2FA: **no** — the publish uses an automation token, which bypasses 2FA by design. npm Trusted Publishing is the intended fix and is not yet configured.

### Testing rigor

- **⚠️** Layers 1–3 exist and run in CI (206 vitest against the Fastify mock, 91 Robolectric, 35 XCTest). **Layer 4 has never been run.** The HTTP-intercept native integration tier designed in C11 is also unbuilt.
- **⚠️** iOS simulator: yes (`xcodebuild test`). Android: **JVM/Robolectric, not an emulator** — deliberate, per C11, because emulator startup is a 5-minute tax per job. Web: jsdom, not headless Chrome — also deliberate; the assertions are on outbound HTTP, not on rendering.
- **[ ]** **Does not exist, and is deliberately deferred.** No workflow is scheduled and no Braze credential exists in CI. Drift is caught by a human reading Braze's release notes (C08).
- **⚠️** Coverage instrumentation exists on **web only** — `@vitest/coverage-v8` over `src/web.ts`, with ratcheted thresholds enforced in the `test-web` job (97.45% statements/lines, 90.80% branches, 100% functions at `0.2.0`). The Android and iOS suites report test counts, not coverage; JaCoCo / `xcodebuild -enableCodeCoverage` is the open gap. `docs/TEST-COVERAGE-AUDIT.md` records both.
- [x] No tests that depend on real Braze for every PR.

### Documentation completeness

- [x] README answers "should I use this?" in the first paragraph.
- [x] Quick-start works copy-paste.
- [x] Every public method documented with type + JSDoc + example.
- **⚠️** `SDK_SURFACE.md` §1 and §3 carry the authoritative matrix and divergence list, both rebuilt against `src/definitions.ts` in 0.2.0. The README has per-platform notes rather than a single parity grid.
- **[x]** Per-platform, under README → Platform setup: iOS entitlements + `enablePushAutomation`, and Android's two `FirebaseMessagingService` paths + `braze.xml`. Expanded reference in C10.
- **○ Deliberate deviation.** The README has the *decision* (when to enable, what the plugin enforces, how to recover from `sdkAuthError`) and links Braze's own SDK Authentication docs for JWT claims, key generation and rotation. Maintaining a second copy of another vendor's signing documentation in five languages is a drift liability, not an asset — `SECURITY.md` §2 used to promise exactly that and it never existed.
- [x] Privacy / GDPR / CCPA flows have a dedicated section.
- **○** Pre-1.0, breaking changes are enumerated in the CHANGELOG's `Breaking` section — `0.2.0` has a substantial one. A separate migration-guide format waits for 1.0.
- [x] CHANGELOG written for humans, not commit messages.

### Release hygiene

- [x] Strict semver from day 1 (pre-1.0 allows minor breaking; documented).
- [x] Native SDK versions pinned exactly, bumped per published policy.
- [x] CHANGELOG entry per release.
- [x] Git tags per release.
- **[x]** `v0.1.0` exists and `release.yml` creates a Release from the tag automatically.
- **⚠️** From `0.2.0` onward. `0.1.0` has none.

### Adoption / trust signals

- **[ ]** **Not cited, deliberately.** The Aromo integration has not shipped, and an unverifiable production-user claim costs more credibility than it buys. The citation lands when the integration does.
- [x] Maintainer named (not anonymous).
- [x] Active git history (commits over time, not single dump).
- **[ ]** Unmeasured — the repo has had no inbound issues. `SECURITY.md` §14 commits to 72h acknowledgement for security reports specifically.
- [x] Real LICENSE file (MIT).
- [x] CONTRIBUTING.md with clear PR guidance.
- [x] Issue templates that route correctly (bug / Braze SDK bug / feature / docs).

### What would specifically annoy a Braze senior

These get flagged in any honest review. Avoid all of them:

1. **Re-implementing Braze functionality** because "the SDK doesn't quite do what I want." → File upstream issue; don't work around.
2. **Vendoring Braze SDK code** instead of pinning the official package. → Always pull from Maven/CocoaPods/npm.
3. **Logging or echoing PII** that the Braze SDK itself doesn't log. → Match or exceed their PII discipline, never weaken it.
4. **Weakening security defaults** vs. native SDK (e.g., disabling JWT validation, sending over HTTP). → Defaults must match or exceed native.
5. **Bridge that violates threading assumptions** (calling SDK methods on wrong thread, blocking UI). → Test on real devices, not just emulators.
6. **Breaking ProGuard / R8 minification** by missing keep rules. → Include `consumer-rules.pro`.
7. **Missing `PrivacyInfo.xcprivacy`** on iOS → App Store rejection cascades onto Braze (since Braze SDK is what triggers the requirement).
8. **Forking the README copy** from Braze docs without attribution. → Link, don't copy.
9. **Implying official Braze endorsement** when there isn't one. → "Community plugin, not affiliated with Braze, Inc." in the header until/unless that changes.
10. **Abandoned-looking repo** (no commits for 3 months, unanswered issues). → Active maintenance is the price of credibility.

---

## 4. Engaging Braze proactively

The plugin's adoption trajectory accelerates dramatically with Braze devrel's awareness. Recommended sequence:

### Pre-launch (before 0.1.0)

1. Sign up for Braze free trial (validates Layer 4 smoke tests).
2. **Email `developers@braze.com`** with:
   - One-paragraph description.
   - Link to the GitHub repo (private until ready, then public).
   - "We're building this because [issue #49 + Hathway abandonment + your customers asking]. We follow your SDK conventions, pin to official Braze SDK versions, and would value any review or guidance."
   - Don't ask for endorsement; ask for technical review.
3. Apply to **Braze Alloys** partner program (linked from Braze website). Approval gives you a sandbox workspace + sometimes co-marketing on launch.

### At launch (0.1.0 ships)

4. Post in Braze's community forum (`braze.com/braze-community`) under Developer / SDK Discussion.
5. Post in Ionic Discord `#plugins` and `#showcase`.
6. Show HN: "Capacitor plugin for Braze (the customer-engagement platform)."
7. Tag relevant Braze devrel folks on LinkedIn/X with the announcement (don't be spammy — one tagged post).

### Post-launch (months 1–6)

8. Respond to GitHub issues within 7 days.
9. Ship Braze SDK version bumps within 1 week of upstream release.
10. Track adoption (npm downloads, GitHub stars, issues, who's using it).
11. If a Braze customer publicly says they use it, ask for permission to cite in README.
12. **At ~100 weekly downloads or first production user other than Aromo:** reach back out to Braze devrel with traction data + ask about being linked from Braze docs.

### What success with Braze looks like

| Stage | Sign |
|---|---|
| Friendly awareness | They reply to your initial email within a week. |
| Active collaboration | A Braze engineer reviews a PR or files an issue. |
| Doc endorsement | Braze docs link to the plugin in their Capacitor section. |
| Official adoption | Braze offers to transfer the repo to `braze-inc/` or co-maintain. |

Each stage is a real outcome. None depend on the next. Even friendly awareness is a meaningful resume signal.

---

## 5. Pre-release checklist (literal — walk through before each 0.x release)

Use this verbatim before publishing any version to npm. Items marked **[CI]** are enforced by a
required status check — you do not have to verify them by hand, you have to not override them.
Items marked **[manual]** are yours. §6 grades the current state of each.

### Code

- **[CI]** All TS types pass `tsc --strict --noEmit` — `build-plugin`
- **[CI]** Test directories type-check — `test-web` (`npm run typecheck:tests`)
- **[CI]** Web behavioral tests pass — `test-web`
- **[CI]** Android bridge compiles, Robolectric tests pass, Android Lint clean — `verify-android`
- **[CI]** iOS bridge compiles, XCTests pass, SwiftLint `--strict` clean — `verify-ios`
- **[CI]** Lint clean: ESLint, Prettier, SwiftLint, Android Lint (**no ktlint** — see C09)
- **[manual]** Layer 4 smoke against a real Braze trial. **Never yet done.** If you ship without it, say so in the release notes, as `0.2.0` does
- **[manual]** No `any`, no `!`, no `TODO`, no `@Suppress` (without a documented reason)
- **[CI]** Web coverage thresholds met — `test-web` runs `npm --prefix test/web run test:coverage`, which fails on a regression below the ratchet in `test/web/vitest.config.ts`. **Native coverage is still unmeasured**, so there is nothing to check there
- **[CI]** Bundle size budget met — `assert-size.mjs` in `build-plugin` fails above 20,480 B gzipped ESM; see §2

### Docs

- **[manual]** README quick-start works on a fresh `cap init` project
- **[CI]** README docgen block regenerated and populated — `build-plugin`
- **[manual]** Every new public method has JSDoc with an `@example` (docgen renders it; CI does not check per-method)
- **[manual]** `SDK_SURFACE.md`'s shipped list and matrix updated
- **[manual]** Cross-platform divergence recorded in `SDK_SURFACE.md` §3 and the relevant MDC
- **[CI]** CHANGELOG has a section for the version being released — the release workflow greps for it and refuses to publish without it
- **[manual]** CHANGELOG entry is human-readable, with a `Breaking` section if anything changed for consumers

### Security

- **[CI]** `npm audit --audit-level=high --omit=dev` clean — `audit`
- **[CI]** No real API keys in any commit — gitleaks, full history, `audit`
- **[manual]** `SECURITY.md` reflects any new attack surface, and every claim in it is still true
- **[manual]** `enableLogging` still defaults to `false` **and the `false` branch still silences the SDK on all three platforms** (it did not, on either native platform, until 0.2.0)
- **[manual]** `allowInsecureEndpoint` still defaults to `false`, checked with strict `=== true`
- **[manual]** No plugin log line carries a consumer-supplied value (grep `src/`, `ios/Sources/BrazePlugin/`, `android/src/main/`)

### Release mechanics

- **[manual]** Version bumped in `package.json`. Pre-1.0, breaking changes ship in a **minor** with `BREAKING:` lines (C08 step 8)
- **[CI]** Publish gated on the full test workflow — `release.yml` calls `test.yml` via `workflow_call`
- **[CI]** Version is not already on the registry; `npm publish --dry-run` first; `--provenance`; attestation verified afterwards
- **[manual]** Git tag created (`v0.x.y`), signed
- **[CI]** GitHub Release created from the tag
- **[manual]** Repo settings verified — see the [maintainer pre-tag checklist](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020). **Several of these are not yet done**
- ~~npm 2FA verified~~ — the publish uses an **automation token, which bypasses 2FA by design**. The fix is npm Trusted Publishing, not a 2FA checkbox; see `SECURITY.md` §13

### Post-release

- **[manual]** Smoke-test the published package: `npm install capacitor-braze@latest` in a fresh project, run the quick-start, verify it works — including the Podfile and Gradle edits the README prescribes
- **[manual]** Verify the provenance attestation is visible on npmjs.com
- **[manual]** Triage open Dependabot PRs against the new baseline
- **[manual]** Update the README Status table and this document's Review snapshot

---

## 6. Current readiness snapshot — `0.2.0`, 2026-09-22

Honest walk through every checkbox above, with verifiable state. §1–§5 set the bar; this section reports where the repo actually is against it, re-verified on 2026-09-22.

Status legend: ✓ done · ○ deliberate deviation (with reason) · ◌ open · ⚠️ partial.

### Code (§5)

| Checkbox | Status | Evidence |
|---|---|---|
| TS types pass `tsc --strict --noEmit` | ✓ | `build-plugin` CI job |
| `npm test` passes | ✓ | `test-web` CI job — **206 tests across 18 files in ~3.4s**, all 35 methods covered, followed by a coverage-threshold run. Map + measured numbers in [`docs/TEST-COVERAGE-AUDIT.md`](./docs/TEST-COVERAGE-AUDIT.md) |
| Android native tests pass in CI | ✓ | `verify-android` compiles the bridge against `com.braze:android-sdk-ui` 43.2.0, runs **91** Robolectric tests, and runs Android Lint with `abortOnError true`. The HTTP-intercept tier (C11) is still design-only |
| iOS native tests pass in CI | ✓ | `verify-ios` compiles against BrazeKit 18.2.1 and runs **35** XCTests via a generated target. Until `0.2.0` the suite had no target and had never been compiled |
| Web Layer 3 passes in CI | ✓ | `test-web` runs the vitest + Fastify-mock harness |
| Layer 4 manual smoke against real Braze | ◌ | **Never run.** `0.1.0` and `0.2.0` both ship on mock-verified wire format only, and say so |
| No `any`, no `!`, no `TODO`, no `@Suppress` (without docs) | ✓ | Re-verified 2026-09-22 by grep over `src/`, `ios/Sources/BrazePlugin/`, `android/src/main/`: no TODO/FIXME, no `@Suppress`, no Swift force-unwraps / `try!` / `as!` / `fatalError`, no `any` |
| Lint clean | ✓ | **ESLint 10** (flat config, `--max-warnings=0`) + Prettier 3.9 in `lint`; **SwiftLint `--strict`, 0 violations** in `verify-ios` — the binary is now installed and asserted, having previously been absent, which made the gate a silent no-op; **Android Lint** `abortOnError true` in `verify-android`. **ktlint deliberately not used** per [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md) |
| Code coverage targets met | ⚠️ | **Web only.** `src/web.ts` is measured at 97.45% statements/lines, 90.80% branches, 100% functions, with thresholds that fail the `test-web` job on a regression. The 91 Android and 35 iOS tests are counts, not coverage — no JaCoCo, no `-enableCodeCoverage`. 332 tests across three platforms; [`docs/TEST-COVERAGE-AUDIT.md`](./docs/TEST-COVERAGE-AUDIT.md) reports both halves |
| Bundle size budget met | ✓ | **Measured and enforced** as of `0.2.0`: `node .github/scripts/assert-size.mjs` runs in `build-plugin` and fails above **20,480 B** gzipped for `dist/esm/**/*.js`; the measured total is **17,472 B**. The four unmeasurable budgets (`.aar`, `.framework`, init time, round-trip) were deleted from §2 rather than left as aspirations |

### Docs (§5)

| Checkbox | Status | Evidence |
|---|---|---|
| README quick-start works on a fresh `cap init` project | ✓ | Validated 2026-05-20 on a fresh `cap-init` install in `/tmp/capbraze-freshtest-tLWX`. Surfaced an iOS Podfile-edit requirement (per C10) that was missing from the quick-start; now inlined |
| Every public method has JSDoc + `@capacitor/docgen` render | ✓ | All 35 methods + 5 listener overloads carry JSDoc with `@example`. **TypeDoc deliberately not used** per [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md). The README API section is regenerated by `npm run build` and asserted by CI |
| Platform parity matrix updated | ✓ | `SDK_SURFACE.md` §1 rebuilt against `src/definitions.ts` with explicit ✅ shipped / ⏳ roadmap markers, and §3's divergence list rewritten to describe only divergences that exist |
| CHANGELOG entry written (human-readable) | ✓ | Every phase commit ships a CHANGELOG entry |
| Migration notes if any breaking changes (pre-1.0) | ✓ | `0.2.0` has a dedicated `Breaking` section: Xcode 26, the web-sdk security floor, three BrazeKit behaviour changes, logging semantics, Android second-`initialize`, unknown-variant drops, the `sdkAuthError.userId` sentinel, and a renamed internal Swift symbol |
| All `SDK_SURFACE.md` coverage flags updated | ✓ | "Currently shipped (as of `0.2.0`)" enumerates 35 methods + 5 listener events, and is declared authoritative over the matrix rows |

### Security (§5)

| Checkbox | Status | Evidence |
|---|---|---|
| `npm audit` clean | ✓ | `audit` CI job at `--audit-level=high --omit=dev` |
| No real API keys in any commit | ✓ | Verified via git log scan; only `'test-key'` / `'YOUR-SDK-API-KEY'` placeholders |
| `SECURITY.md` reflects new attack surface | ✓ | No new attack surface since the doc was written; surface additions (push token, SDK auth signature rotation) reference back to it |
| `enableLogging` defaults to `false` **and the default silences the SDK** | ✓ | Both halves now true. The default was always `false`, but iOS set BrazeKit's `.info` and Android set nothing; both now set errors-only, asserted end-to-end under Robolectric on Android |
| `allowInsecureEndpoint` defaults to `false` | ✓ | Same |
| No plugin log line carries user data | ✓ | Re-verified by grep. Errors name the field, never the value — with one sanctioned closed-enum exemption (`setGender`), documented in C06 §4 and C01. `SECURITY.md` §3 now describes this posture instead of a masking scheme that was never implemented |

### Release mechanics (§5)

| Checkbox | Status | Evidence |
|---|---|---|
| Version bumped per semver | ✓ | `0.2.0`. Pre-1.0, breaking changes ship in a minor with `BREAKING:` lines — C08 step 8, which was self-contradictory until `0.2.0` |
| Git tag created | ⚠️ | `v0.1.0` exists. `v0.2.0` is not yet tagged — see §7's pre-tag checklist |
| GitHub Release created | ✓ | `release.yml` creates one from the tag |
| `npm publish --provenance` from CI (not local) | ⚠️ | True from `0.2.0` onward, and now **gated on the full test suite** via `workflow_call`. `0.1.0` was published **by hand** and has no attestation on npm |
| npm 2FA verified | ○ | **Not applicable as stated.** CI publishes with an automation token, which bypasses 2FA by design. The real fix is npm Trusted Publishing (OIDC), which is on §7's pre-tag checklist |
| Repo settings (branch protection, signed commits, no force-push) | ⚠️ | In force: required status checks (strict), `required_signatures: true`, no force pushes, no deletions, conversation resolution. **Not in force:** `enforce_admins` (so the checks don't bind the admin), linear history, a `v*` tag ruleset, private vulnerability reporting, Dependabot *security* updates. All are on §7's pre-tag checklist with exact commands. Required reviewers are deliberately not enabled on a single-maintainer repo |
| Dependabot still enabled | ✓ | Five directories + `github-actions`. The `/test/mock-server` entry declared a `gradle` ecosystem for an npm project and had failed weekly since July; fixed in `0.2.0`, and `/test/web` added |

### Native code quality (§3)

| Checkbox | Status | Evidence |
|---|---|---|
| Android: `@CapacitorPlugin` annotation | ✓ | `android/.../BrazePlugin.kt` |
| Android: public `Braze.getInstance(context)` only | ✓ | No reflection, no private API access |
| Android: no `!!`, no `Any`, no `@Suppress` | ✓ | Grep clean |
| Android: ProGuard rules in `consumer-rules.pro` | ✓ | Narrowed in `0.2.0` to `-keep class com.bma342.braze.** { *; }` only. It previously widened Braze's own deliberate `-keepnames` rules to `-keep … { *; }` across ~910 SDK classes, and carried dead `com.appboy.**` rules |
| Android: matches Braze RN bridge style | ⚠️ | Patterns are similar; haven't done a literal diff |
| Android: `./gradlew lint` clean | ✓ | `:capacitor-braze:lintDebug` runs in `verify-android` with `abortOnError true`. Verified non-vacuous: a probe calling an API-26 method failed the build with `[NewApi]`. Two "newer version available" advisories remain against deliberate C08 pins |
| iOS: `CAPPlugin` + `CAPPluginCall` | ✓ | `ios/Sources/BrazePlugin/BrazePlugin.swift` |
| iOS: official BrazeKit API | ✓ | All calls go through `braze.X` or `Braze.X` statics, verified by Phase O compile |
| iOS: no force unwraps, proper `guard let` | ✓ | Verified |
| iOS: `[weak self]` in closures | ✓ | Both subscribeToUpdates closures capture `[weak self]` |
| iOS: `PrivacyInfo.xcprivacy` manifest | ✓ | Shipped via podspec `resource_bundles` (Phase S). Verified on fresh-`cap-init` install: `CapacitorBraze.bundle` resource target generated in Pods.xcodeproj with the manifest as a build file. The manifest declares "no tracking, no required-reason API access" because the plugin layer doesn't directly touch any (BrazeKit's own manifest covers what the SDK does) |
| iOS: SwiftPM + CocoaPods install paths tested | ⚠️ | **CocoaPods only.** There is no `Package.swift`. Capacitor 8's CLI generates SPM projects by default, so this is now coupled to the Capacitor 8 lane |
| iOS: matches Braze RN bridge style | ⚠️ | Patterns are similar; no literal diff |
| iOS: SwiftLint clean | ✓ | `swiftlint lint --strict` → **0 violations in 3 files**, including `ios/Tests/BrazePluginTests`. The config previously pointed `parent_config` at a nonexistent path, so no Ionic rule had ever run; the ruleset is now inlined |
| TS: `strict: true` | ✓ | `tsconfig.json` |
| TS: no `any`, no `unknown` returned | ✓ | All public returns are typed |
| TS: discriminated unions for divergent results | ✓ | `BrazeContentCard`, `BrazeFeatureFlagPropertyValue` |
| TS: every public method has JSDoc + `@example` | ✓ | Verified by docgen output |
| TS: tree-shakeable | ⚠️ | No top-level side effects in `src/index.ts`; not verified with a tree-shaker. The package ships ESM + CJS only — the IIFE/`unpkg` artifact was removed in `0.2.0` because it dynamically imported a bare specifier no browser can resolve |
| TS: no runtime deps beyond peers | ✓ | Zero `dependencies`. Peers are `@capacitor/core` and `@braze/web-sdk` (`^6.13.0`, required, loaded via dynamic import). Wrapping Braze without depending on Braze is not a goal |

### Testing rigor (§3)

| Checkbox | Status | Evidence |
|---|---|---|
| Four-layer test pyramid | ⚠️ | Layers 1–3 exist and run in CI: 206 vitest against the Fastify mock, 91 Robolectric, 35 XCTest. **Layer 4 has never been run.** C11's native HTTP-intercept tier is also unbuilt |
| CI runs the local tiers across iOS sim + Android + jsdom | ⚠️ | iOS: real simulator via `xcodebuild test`. Android: **JVM/Robolectric, not an emulator** — deliberate per C11 (emulator startup is a 5-minute tax per job). Web: jsdom, not headless Chrome — also deliberate, since the assertions are on outbound HTTP |
| Daily spec-drift job against real Braze trial | ○ | **Does not exist, deliberately.** No workflow is scheduled and no Braze credential exists in CI. Five documents claimed otherwise until `0.2.0`. Drift is caught by reading Braze's release notes (C08) |
| Code coverage >80% TS, >70% native | ⚠️ | TS: **met and enforced** — `src/web.ts` at 97.45% statements/lines against a 97 threshold. Native: **not measured**, so the >70% target is neither met nor refuted. See the "Code coverage" row above |
| No tests that depend on real Braze for every PR | ✓ | Mock-server harness is self-contained |

### Adoption / trust signals (§3)

| Checkbox | Status | Evidence |
|---|---|---|
| Lighthouse production user cited (Aromo) | ◌ | **Deliberately not cited.** The integration has not shipped; an unverifiable production-user claim costs more than it buys. The citation lands when the integration does |
| Maintainer named | ✓ | `package.json` author field, README badges, LICENSE |
| Active git history | ✓ | Commits over time across the audit and fix waves, not a single dump |
| Real LICENSE file (MIT) | ✓ | `LICENSE` |
| CONTRIBUTING.md with PR guidance | ✓ | `CONTRIBUTING.md` |
| Issue templates routing correctly | ✓ | `.github/ISSUE_TEMPLATE/` has bug + feature templates and a `config.yml` with `blank_issues_enabled: false` plus contact links routing Braze Android / Swift / Web SDK bugs and Capacitor bugs upstream |

---

## 7. Remaining work

### Cleared

Everything §7 previously listed as a `0.1.0` blocker, plus what `0.2.0` closed:

- ✅ **`PrivacyInfo.xcprivacy`** ships via the podspec's `resource_bundles`; verified on a fresh `cap init`.
- ✅ **`SDK_SURFACE.md` §1 coverage table** — rebuilt mechanically against `src/definitions.ts` in `0.2.0` after the 2026-09 audit found nine wrong rows.
- ✅ **README quick-start fresh-`cap-init` validation** — surfaced the iOS Podfile requirement, which the quick-start now inlines alongside the three Android Gradle edits.
- ✅ **Branch protection on `main`** — required status checks (strict), signed commits, no force pushes, no deletions, conversation resolution.
- ✅ **Native test harnesses (C11)** — 91 Robolectric + 35 XCTest, both running in CI. The iOS suite had no Xcode target until `0.2.0` and had never been compiled.
- ✅ **Release pipeline gated on CI**, with a not-already-published guard, a dry run, `--provenance` and an attestation check.

### Before tagging `0.2.0`

Maintainer actions, none of which a code change can perform. Exact `gh api` commands are in
[CONTRIBUTING → Maintainer pre-tag checklist](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020).

Numbered to match CONTRIBUTING's checklist, so the two documents can be read side by side.

1. ☐ **Enable private vulnerability reporting.** `SECURITY.md` §14 documents the advisory channel; it is switched off, so a non-collaborator cannot file through it. §14 carries a warning banner until this lands.
2. ☐ **Enable `enforce_admins`** so the required checks bind the admin too.
3. ☐ **Require linear history** (you already squash-merge).
4. ☐ **Enable Dependabot security updates** (distinct from the version updates already configured).
5. ☐ **Create a `v*` tag ruleset** (deletion + non-fast-forward + required signatures).
6. ☐ **Create the `npm-publish` GitHub environment** with a required reviewer and a `v*` tag deployment-branch policy — `release.yml` already references it.
7. ☐ **Configure npm Trusted Publishing** (web UI only), then delete `NODE_AUTH_TOKEN` from `release.yml` and revoke `NPM_TOKEN`. Until then the publish uses a 2FA-bypassing automation token, and `SECURITY.md` §13 says so.
8. ☐ **Make CodeQL a required status check** (`Analyze (javascript-typescript)`, `Analyze (actions)`) once the first run on `main` is green. Nothing to provision — CodeQL needs no token on a public repo, and `SNYK_TOKEN` is no longer referenced by any workflow.

Plus, before tagging: ☐ **triage the six open Dependabot PRs** — the per-PR verdicts are in [CONTRIBUTING → Dependabot PR triage](./CONTRIBUTING.md#dependabot-pr-triage-before-tagging). Note **#22 is now a close**, not a rebase: six of its seven dev-dependency bumps were absorbed by the ESLint 10 flat-config migration on this branch.

### Still open, and honestly so

- ☐ **Layer 4 manual smoke.** Walk [`docs/SMOKE-TEST-PLAYBOOK.md`](./docs/SMOKE-TEST-PLAYBOOK.md) on all three platforms against a real trial and commit the captures. **Neither `0.1.0` nor `0.2.0` is validated against a live Braze backend**, and the README, CHANGELOG and C08 all say so rather than implying otherwise. This is the single largest gap in the project.
- ☐ **Capacitor 8 support** and ☐ **SPM packaging** — see `SDK_SURFACE.md`'s roadmap. Related: Capacitor 8's CLI generates SPM projects by default.
- ☐ **C11's integration tier** — URLProtocol on iOS, MockWebServer on Android, asserting real HTTP rather than DTO shape.
- ☐ **`inAppMessageReceived` delivery-path coverage on iOS and Android.** Web is covered end to end as of `0.2.0` (the mock server returns real trigger envelopes); the native tiers still cover the DTO only, at the serializer level.
- ☐ **Setter return values** (audit A1-10): `setEmail('nonsense')` resolves everywhere. Deferred as a cross-platform contract change.

### Deliberately deferred — documented exclusions

These are decisions, not backlog. Each is recorded where it applies so a reviewer does not read the
absence as an oversight.

- **TypeDoc rendering** — replaced by `@capacitor/docgen` into the README, per C09.
- **ktlint** — not in Capacitor's standard toolchain, per C09. Android Lint covers Kotlin *static analysis*; Kotlin *formatting* is reviewed by hand.
- **Numeric code-coverage budgets on the native bridges** — no instrumentation there, so there is no number to gate. (The web bridge *is* instrumented and ratcheted as of `0.2.0`.) (Bundle size is no longer on this list: §2's gzipped-ESM budget is measured and enforced as of `0.2.0`.)
- **CodeQL for Swift and Kotlin** — both need a full native compile inside the CodeQL tracer, duplicating `verify-ios` / `verify-android` and roughly doubling their runtime. The `javascript-typescript` and `actions` analyses do run. Reasoning in the header of `.github/workflows/codeql.yml`.
- **A daily spec-drift job against real Braze** — the Fastify mock covers the bulk, and drift is caught by reading Braze's release notes (C08). Five documents described this job as existing; none of them was right.
- **Maestro / Detox e2e** — decided against outright, not merely deferred. See `PLAN.md` §14 item 3.

---

## 8. The single most important thing

**Boring excellence beats clever surface.** A plugin with 15 methods that all work flawlessly, ship security defaults correctly, document edge cases honestly, and follow Braze's own conventions will earn endorsement faster than a 200-method kitchen sink that's 95% correct.

Discipline = trust. Trust = adoption. Adoption = the resume signal.

---

## References

- [`PLAN.md`](./PLAN.md) — strategy and roadmap
- [`SDK_SURFACE.md`](./SDK_SURFACE.md) — what to build (capability catalog)
- [`SECURITY.md`](./SECURITY.md) — how to build it safely
- [Braze React Native SDK](https://github.com/braze-inc/braze-react-native-sdk) — reference for native bridge style
- [Capacitor Plugin Creation Guide](https://capacitorjs.com/docs/plugins/creating-plugins)
- [Capacitor Plugin Best Practices](https://capacitorjs.com/docs/plugins/tutorial/packaging)
