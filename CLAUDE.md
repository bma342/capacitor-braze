# capacitor-braze — AI Developer Configuration

**Project:** Open-source Capacitor 6/7 plugin wrapping the Braze native SDKs (Android Kotlin, iOS Swift, Web JS).
**Owner:** Bryce Aspinwall (`bma342`), MIT-licensed, personal portfolio + Aromo lighthouse.
**npm package:** [`capacitor-braze`](https://www.npmjs.com/package/capacitor-braze) — published; `0.1.0` is on the registry, `0.2.0` is this branch.
**Current state:** 35 methods + 5 listener events; 205 web + 91 Android + 35 iOS tests, all in CI; BrazeKit/BrazeUI 18.2.1 (Xcode 26+), `com.braze:android-sdk-ui` 43.2.0, `@braze/web-sdk` peer `^6.13.0`.

**Source-of-truth docs — read these before any non-trivial work:**
- [`PLAN.md`](./PLAN.md) — the **original 2026-05 plan**, kept as history. Where it disagrees with the code, the code wins; read `CHANGELOG.md` + `SDK_SURFACE.md` §2 for the live roadmap.
- [`SDK_SURFACE.md`](./SDK_SURFACE.md) — complete Braze SDK capability catalog and version coverage
- [`SECURITY.md`](./SECURITY.md) — security model, threat analysis, plugin design decisions for every security-sensitive surface
- [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) — quality bar (DX + completeness + would-pass-Braze-review), release checklist, dated readiness snapshot
- [`docs/audits/`](./docs/audits/) — the two self-audits (2026-05, 2026-09), each archived with a per-finding resolution table. **Read them as history**, not as open punch lists.
- [`docs/mdcs/`](./docs/mdcs/) — per-subsystem design contracts (MDCs). Read the one matching your task before coding:
  - [C01](./docs/mdcs/C01-METHOD-ANATOMY.md) — the method lockstep (canonical checklist), init guards, error message format
  - [C02](./docs/mdcs/C02-DTO-SHAPES.md) — Web SDK wire format as canonical DTO shape
  - [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) — month indexing, currency, decimals, dates, enums, sentinels
  - [C04](./docs/mdcs/C04-VALIDATION.md) — TS-at-boundary + native duplication
  - [C05](./docs/mdcs/C05-LISTENERS.md) — event listener lifecycle (eager-on-init, shared, no replay)
  - [C06](./docs/mdcs/C06-SECURITY-DEFAULTS.md) — security defaults, HTTPS-required endpoint, PII non-logging
  - [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md) — when a method may skip the init guard (the privacy/lifecycle quartet)
  - [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) — exact pin policy, bump protocol
  - [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md) — Capacitor's official toolchain (eslint/prettier/swiftlint/docgen), locked-in
  - [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) — consumer-side config the SDK pins force (Podfile, Gradle, peer dep)
  - [C11](./docs/mdcs/C11-NATIVE-TEST-HARNESSES.md) — iOS XCTest + Android Robolectric harnesses (**implemented**: 91 Android + 35 iOS, both in CI; the HTTP-intercept integration tier is still design-only, and native coverage instrumentation is the open gap)

### MDC glossary — when to consult which doc

| Doc | Topic | Read it before… |
|---|---|---|
| [C01](./docs/mdcs/C01-METHOD-ANATOMY.md) | The method lockstep (canonical checklist), init guards, C01-format error strings | …adding *any* new method or touching a bridge |
| [C02](./docs/mdcs/C02-DTO-SHAPES.md) | Web SDK wire format as canonical DTO shape | …returning a Braze model (FeatureFlag, ContentCard, …) over the bridge |
| [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) | Month indexing, currency, decimals, dates, enums, sentinels, anonymous user id | …writing per-platform conversion logic |
| [C04](./docs/mdcs/C04-VALIDATION.md) | TS-at-boundary + native duplication, byte-identical error strings | …accepting any user input on a method |
| [C05](./docs/mdcs/C05-LISTENERS.md) | Listener lifecycle: eager subscription at `initialize`, shared, no replay | …adding a listener event or wiring a subscription |
| [C06](./docs/mdcs/C06-SECURITY-DEFAULTS.md) | Security defaults (`enableLogging: false`, HTTPS required, PII non-logging) | …touching `initialize` options or any logging path |
| [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md) | When a method may skip the init guard (the privacy/lifecycle quartet) | …adding a method consumers might call pre-`initialize` |
| [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) | Exact pin policy, bump protocol | …bumping a Braze SDK version |
| [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md) | Capacitor's official toolchain (eslint / prettier / swiftlint / docgen) | …editing CI, `package.json` scripts, or lint config |
| [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) | Consumer-side Podfile, Gradle, peer dep requirements the pin policy forces | …writing README integration sections or breaking-change notes |
| [C11](./docs/mdcs/C11-NATIVE-TEST-HARNESSES.md) | iOS XCTest + Android Robolectric harnesses (implemented; integration tier design-only) | …implementing or extending the native test layer |

> **THIS PROJECT WRAPS — IT DOES NOT REIMPLEMENT.** Braze's native SDKs do all the actual work (network calls, encryption, push handling, IAM rendering, analytics batching). This plugin is a thin bridge layer that translates Capacitor `PluginCall`s into native SDK invocations. Before writing any code, confirm whether the underlying Braze SDK already does what you want — almost always, the answer is yes, and your job is to expose it through the bridge.

---

## What this is / what this is not

### Is
- A Capacitor plugin (Capacitor 6 or 7; **not** 8 yet).
- A bridge layer: TS interface + native Kotlin + native Swift + web fallback.
- A pinned consumer of `com.braze:android-sdk-ui`, `BrazeKit`/`BrazeUI`, and `@braze/web-sdk`.
- An open-source, MIT-licensed package intended for npm distribution.

### Is not
- A reimplementation of Braze.
- A fork of any Braze SDK.
- An Aromo-coupled component (Aromo is the lighthouse user but the plugin is independent).
- A CDP, customer data platform, or marketing automation layer.

If you find yourself writing more than ~20 lines for a single method, you're probably reimplementing Braze instead of calling it. Stop and look up the SDK method.

---

## Stack

| Layer | Tech | Version pin |
|---|---|---|
| **TypeScript API** | TypeScript 5.x | strict, no `any` |
| **Capacitor** | `@capacitor/core` `^6.0.0 \|\| ^7.0.0` (podspec `>= 6.0, < 8.0`). **Capacitor 8 is out of scope** — it needs AGP 8.13 / Gradle 8.14.3 / Kotlin 2.2.20 / compileSdk 36 and generates SPM iOS projects; tracked as a follow-up | peer dep |
| **Android bridge** | Kotlin 2.2.0, Capacitor Android, JDK 21 toolchain / JVM 17 bytecode | `com.braze:android-sdk-ui` **43.2.0** (exact pin) |
| **iOS bridge** | Swift 5.9+, Capacitor iOS, **Xcode 26+** (BrazeKit ≥ 15 requires it) | `BrazeKit` + `BrazeUI` **18.2.1** (exact pin) |
| **Web bridge** | TypeScript | `@braze/web-sdk` **`^6.13.0`** peer dep — a security floor, see SECURITY.md §6 |
| **Build** | Rollup (Capacitor standard) → ESM + CJS only; the IIFE/`unpkg` bundle was removed in 0.2.0 | — |
| **Tests** | **vitest** (web, 205 across 18 files, with a `@vitest/coverage-v8` ratchet on `src/web.ts`), **Robolectric/JUnit** (Android, 91), **XCTest** (iOS, 35), **Fastify** mock Braze server (TypeScript, in-process, ephemeral port). No Jest, no Ktor, no Maestro anywhere in this repo | — |
| **Lint** | **ESLint 10** flat config (`eslint.config.cjs`) on `@ionic/eslint-config` 0.5.0 — the preset's flat rewrite, which peer-requires ESLint 10 — plus Prettier 3.9 (`@ionic/prettier-config`, 120-char width) and SwiftLint. `npm run eslint` runs `--max-warnings=0` | see `package.json` |
| **CI** | GitHub Actions, all actions SHA-pinned: **9 jobs in `test.yml`** (`lint`, `build-plugin`, `pack-check`, `build-example`, `build-demo`, `test-web`, `audit`, `verify-ios`, `verify-android`) **+ 2 CodeQL analyses** in `codeql.yml` (`javascript-typescript`, `actions`) | ubuntu + macOS |

---

## Status

Snapshot at `0.2.0`, verified 2026-09-22 (see `package.json` for the live version):

| Milestone | Status |
|---|---|
| TS interface + web impl — 35 methods, 5 listener events | ✅ |
| Android bridge against `com.braze:android-sdk-ui:43.2.0` | ✅ |
| iOS bridge against `BrazeKit / BrazeUI 18.2.1` (needs Xcode 26+) | ✅ |
| Mock Braze server (**Fastify + TypeScript**, in `test/mock-server`) | ✅ |
| Web behavioral tests (vitest + mock) — 205 across 18 files | ✅ |
| Web coverage ratchet — `src/web.ts` 97.38% statements/lines, 90.66% branches, 100% functions; thresholds enforced in the `test-web` job | ✅ |
| Android native tests (Robolectric/JUnit) — 91, run in CI | ✅ |
| iOS native tests (XCTest) — 35, run in CI via a generated target | ✅ |
| Native coverage instrumentation (JaCoCo / `-enableCodeCoverage`) | ⏳ not wired — the native counts are test counts, not coverage |
| CI: `verify-ios` runs `xcodebuild test`; `verify-android` runs build + tests + Lint on JDK 21 | ✅ |
| Tarball manifest gate (`pack-check` job / `npm run pack:check`) | ✅ |
| Release publishing gated on the full CI suite, with `--provenance` | ✅ |
| All GitHub Actions pinned to commit SHAs; per-job least-privilege permissions | ✅ |
| Demo + example apps build in CI | ✅ |
| Privacy manifest (`PrivacyInfo.xcprivacy` via podspec) | ✅ |
| `inAppMessageReceived` + `sdkAuthError` listener events | ✅ all 3 platforms. Both now covered **end-to-end on web** — the mock server returns real triggers, the Web SDK's own trigger engine builds the message, and the tests assert the DTO a consumer's listener receives. The **DTO** is covered by serializer tests on all three; the native **delivery paths** are still only covered by those serializer tests |
| `deepLinkReceived` listener + `initialize({ deepLinkHandling })` | ✅ all 3 platforms. Per-channel coverage (and the two channels it cannot cover) is in [`SECURITY.md` §7](./SECURITY.md#7-deep-link-security) |
| iOS in-app message presenter wired (`BrazeInAppMessageUI`), opt-out via `enableInAppMessageUI` | ✅ |
| Android IAM lifecycle wired (`BrazeInAppMessageManager`) + session handling | ✅ |
| URL parsing + cluster sanity check at `initialize` — all 3 platforms | ✅ |
| SDK Authentication enforcement on `changeUser` | ✅ |
| Signed-commit + required-check branch protection on `main` | ✅ |
| Gitleaks CI step | ✅ |
| CodeQL SAST (`codeql.yml`) — `javascript-typescript` + `actions`, push/PR to `main` + weekly | ✅ — ⏳ not yet a *required* check (needs one run on `main` to name it) |
| Bundle-size gate (`.github/scripts/assert-size.mjs` in `build-plugin`) | ✅ gzipped ESM budget 20,480 B; measured 16,180 B at `0.2.0` |
| Capacitor 7 forward-compat (`^6 \|\| ^7` peer dep) | ✅ |
| Smoke wrappers (`npm run smoke:web/ios/android`) | ✅ scripts exist |
| Audit cleanup — `docs/audits/2026-05` (17 phases) + `docs/audits/2026-09` (this wave) | ✅ |
| `0.1.0` to npm | ✅ [npmjs.com/package/capacitor-braze](https://www.npmjs.com/package/capacitor-braze) — published **by hand**, no provenance attestation |
| `0.2.0` to npm | ⏳ will be the first workflow-published release |
| C11 native test harnesses — integration tier (URLProtocol / MockWebServer intercept) | ⏳ design-only, lives in the C11 MDC |
| **Layer 4 real-Braze smoke** | ⏳ **never run.** Templates only in `docs/smoke-tests/`; no release is validated against a live Braze backend |
| Private vulnerability reporting, `enforce_admins`, `v*` tag ruleset, npm Trusted Publishing | ⏳ maintainer actions — commands in `CONTRIBUTING.md` |
| Capacitor 8 support, SPM, CodeQL for Swift/Kotlin, native coverage instrumentation | ⏳ tracked follow-ups, not started |

**This table drifts.** When in doubt, source-of-truth checks:
- Versions, scripts, dependencies → `package.json`
- What's actually been done → `git log --oneline`
- What's left for the next release → `CHANGELOG.md` `[Unreleased]` section
- What's planned next → `PLAN.md`

---

## Apps in this repo

Two apps live alongside the plugin source — same monorepo, different audiences:

- **`example/`** — developer testbed. Every plugin method is a button on an HTML page; clicking it invokes the method and logs the result. Maintainers use this to verify changes; consumers do not.
- **`demo/`** — fork-as-starter Capacitor + Braze reference. React 19 + TanStack Router + Tailwind 4 + Zustand. Two verticals (restaurant ordering, e-commerce), mock backend, realistic flows. Consumers fork this to start their own integration; maintainers use it for portfolio screenshots / demo videos.

Each app builds against the plugin via `file:..` so a `npm run build` at the repo root automatically propagates into both apps' next install. CI builds all three artifacts on every push.

## Repo structure

```
capacitor-braze/
├── CLAUDE.md / PLAN.md / SECURITY.md / SDK_SURFACE.md / REVIEW_READINESS.md / CHANGELOG.md
├── README.md                                              # auto-regenerated by docgen
├── package.json                                           # peer deps + scripts
├── eslint.config.cjs                                      # ESLint 10 flat config (@ionic/eslint-config 0.5)
├── CapacitorBraze.podspec                                 # iOS CocoaPod manifest
├── src/
│   ├── definitions.ts                                     # TS interface — SOURCE OF TRUTH
│   ├── index.ts                                           # registerPlugin('Braze', ...)
│   └── web.ts                                             # WebPlugin impl (@braze/web-sdk wrapper)
├── ios/Plugin/
│   ├── BrazePlugin.swift                                  # CAPPlugin bridge → BrazeKit 18.2.1
│   ├── BrazeIAMDelegate.swift                             # in-app message presenters (rendering + observing)
│   ├── BrazePlugin.m                                      # CAP_PLUGIN_METHOD obj-c registrations
│   └── PrivacyInfo.xcprivacy                              # App Store privacy manifest
├── android/
│   ├── build.gradle                                       # com.braze:android-sdk-ui:43.2.0
│   ├── consumer-rules.pro                                 # R8/ProGuard rules consumer apps inherit
│   └── src/main/java/com/bma342/braze/BrazePlugin.kt      # @CapacitorPlugin bridge
│   └── src/test/java/com/bma342/braze/                    # 91 Robolectric/JUnit tests
├── ios/PluginTests/                                       # 35 XCTests (target generated by scripts/)
├── scripts/
│   ├── ios-add-test-target.rb                             # generates the demo's CapacitorBrazeTests target
│   └── smoke-{web,ios,android}.sh                         # Layer 4 wrappers (never yet run for real)
├── dist/                                                  # build output (gitignored) — ESM + CJS only
├── .github/scripts/                                       # assert-pack.mjs + assert-size.mjs CI gates
├── docs/
│   ├── mdcs/                                              # C01–C11 design-contract docs
│   ├── audits/2026-05/                                    # archived self-audit (0.0.12) + resolution status
│   ├── audits/2026-09/                                    # archived self-audit (0.1.0) + resolution status
│   └── smoke-tests/                                       # staged real-Braze smoke run templates
├── example/                                               # developer testbed (per-method buttons)
├── demo/                                                  # consumer-fork-starter (React 19 + TanStack)
└── test/
    ├── mock-server/                                       # Fastify mock Braze backend (ephemeral port)
    └── web/src/                                           # 205 vitest behavioral tests across 18 files
```

**The method lockstep:** adding or changing a plugin method touches a fixed list of files, and
[**C01 is the single authoritative copy of that list**](./docs/mdcs/C01-METHOD-ANATOMY.md#the-lockstep-checklist).
`CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md` reference C01 rather than restating it —
four divergent copies of this list is exactly what the 2026-09 audit found (A6-22), so do not add a
fifth here. The short version: four bridge files (`src/definitions.ts`, `src/web.ts`,
`ios/Plugin/BrazePlugin.swift` + `ios/Plugin/BrazePlugin.m`,
`android/src/main/java/com/bma342/braze/BrazePlugin.kt`), the tests, the example app, and the
CHANGELOG.

---

## Plugin patterns (Capacitor conventions)

### TypeScript

```ts
// src/definitions.ts — interface is the contract
export interface BrazePlugin {
  logCustomEvent(options: { name: string; properties?: Record<string, unknown> }): Promise<void>;
}

// src/index.ts — registration
import { registerPlugin } from '@capacitor/core';
import type { BrazePlugin } from './definitions';
const Braze = registerPlugin<BrazePlugin>('Braze', {
  web: () => import('./web').then(m => new m.BrazeWeb()),
});
export * from './definitions';
export { Braze };
```

### Swift bridge

```swift
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin {
    @objc func logCustomEvent(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("name required")
            return
        }
        let properties = call.getObject("properties")
        AppDelegate.braze?.logCustomEvent(name: name, properties: properties)
        call.resolve()
    }
}
```

### Kotlin bridge

```kotlin
@CapacitorPlugin(name = "Braze")
class BrazePlugin : Plugin() {
    @PluginMethod
    fun logCustomEvent(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("name required")
        val properties = call.getObject("properties")
        Braze.getInstance(context).logCustomEvent(name, properties?.toBrazeProperties())
        call.resolve()
    }
}
```

### Web impl

```ts
import { WebPlugin } from '@capacitor/core';
import * as braze from '@braze/web-sdk';
import type { BrazePlugin } from './definitions';

export class BrazeWeb extends WebPlugin implements BrazePlugin {
  async logCustomEvent({ name, properties }: { name: string; properties?: Record<string, unknown> }) {
    braze.logCustomEvent(name, properties);
  }
}
```

**Pattern rule:** every method follows this exact shape across all four files. **Input validation goes at both boundaries** — the web impl throws `new Error('Braze.<method>: \`<field>\` is required (<type>).')` and the native bridges duplicate the same check with `call.reject(...)` using the byte-identical error string. See [`C04`](./docs/mdcs/C04-VALIDATION.md). The web impl throws (Capacitor's web layer translates throws into rejected promises); the native bridges call `call.reject()` directly. **Never throw from a native bridge** — Capacitor expects a rejected promise, not a crash.

---

## Testing

Four tiers. Tiers 1–3 are fully local and hermetic; tier 4 has never been run.

```bash
# Tier 1-3 (web): 205 vitest behavioral tests driving the real @braze/web-sdk
# under jsdom against an in-process Fastify mock Braze server. ~3.4s.
npm test

# Same suite with V8 coverage on src/web.ts, against ratcheted thresholds that
# fail the run on a regression. Plain `npm test` stays uninstrumented so the
# fast loop stays fast; CI runs both in the test-web job. Output lands in
# test/web/coverage/ (gitignored, and listed in .prettierignore so `npm run
# lint` does not go red the moment you run it).
cd test/web && npm run test:coverage

# First time only — this repo has no npm workspaces:
(cd test/mock-server && npm install) && (cd test/web && npm install)

# Mock server standalone, for manual exploration. Prints the URL it bound to
# (an ephemeral port, not 8080). Point initialize({ endpoint, allowInsecureEndpoint: true }) at it.
cd test/mock-server && npm run standalone

# Android: 91 Robolectric/JUnit tests. Needs JDK 21 + ANDROID_HOME.
cd demo/android && ./gradlew :capacitor-braze:testDebugUnitTest --no-daemon

# iOS: 35 XCTests. Needs Xcode 26+ and CocoaPods. The test target is generated
# into the demo's Xcode project and the result is committed; the script is idempotent.
ruby scripts/ios-add-test-target.rb
cd demo/ios/App && pod install
xcodebuild test -workspace App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' CODE_SIGNING_ALLOWED=NO

# Supporting gates
npm run lint            # eslint + prettier --check + swiftlint
npm run typecheck:tests # tsc --noEmit over test/mock-server + test/web (vitest never type-checks)
npm run pack:check      # assert the npm tarball's contents
npm run build && node .github/scripts/assert-size.mjs   # gzipped ESM <= 20,480 B

# Tier 4: real Braze smoke (manual, against a trial account). NEVER YET RUN.
BRAZE_API_KEY=$REAL_TRIAL_KEY npm run smoke:web    # or :ios / :android
```

The mock server is started **in-process by the tests themselves** (`freshMockServer()` in
`test/web/src/test-utils.ts`) — there is no separate server to launch before `npm test`, and CI does
not run it as a service container.

---

## Native SDK pinning

Pinned versions live in:
- `android/build.gradle` — `com.braze:android-sdk-ui:43.2.0` (exact pin, not range)
- `CapacitorBraze.podspec` — `s.dependency 'BrazeKit', '18.2.1'` + `s.dependency 'BrazeUI', '18.2.1'` (exact)
- `package.json` peer dep — `"@braze/web-sdk": "^6.13.0"` (range, web peer dep only per [`C08`](./docs/mdcs/C08-NATIVE-SDK-PINNING.md)). The `6.13.0` floor is a **security** floor — see SECURITY.md §6.

**When bumping native SDK versions:**

1. Read the Braze SDK changelog for breaking changes.
2. Update the pin in the relevant manifest.
3. Run the full CI matrix.
4. If Layer 4 smoke tests pass against real Braze, ship a minor/patch.
5. If the bump is breaking for consumers (a toolchain floor, a behaviour change, a new Pod): **pre-1.0 that is a minor with explicit `BREAKING:` lines in the CHANGELOG; post-1.0 it is a major.** See C08 step 8 — this rule was contradictory until 0.2.0.

There is **no** spec-drift CI job. The only scheduled workflow is CodeQL's weekly re-analysis
(Mondays 05:27 UTC), which says nothing about Braze SDK versions. You catch SDK changes by
subscribing to Braze's SDK release notes and running the bump protocol by hand. Do not let a doc
tell you otherwise.

---

## Adding a new method — the lockstep, annotated

[**C01 owns the canonical checklist.**](./docs/mdcs/C01-METHOD-ANATOMY.md#the-lockstep-checklist)
`CONTRIBUTING.md` and the PR template reference it; so does this section. What follows is the same
ten steps with the implementation detail an assistant needs — **if it ever disagrees with C01, C01
wins and this section is the bug.**

When the surface grows (which should only happen per the [`SDK_SURFACE.md`](./SDK_SURFACE.md)
roadmap), walk them in this order:

1. **`src/definitions.ts`** — declare the method signature on the `BrazePlugin` interface. Include JSDoc with at least one `@example` block ([`C01`](./docs/mdcs/C01-METHOD-ANATOMY.md)). Define any new option / result interfaces in the same file. If the method returns a Braze model, define the DTO with a `type` discriminator per [`C02`](./docs/mdcs/C02-DTO-SHAPES.md).
2. **`src/web.ts`** — implement on `BrazeWeb`. Validate input at the top with `throw new Error('Braze.<method>: \`<field>\` is required (<type>).')` matching the format in [`C01`](./docs/mdcs/C01-METHOD-ANATOMY.md). Gate non-init-independent methods through `this.requireInitialized()` or `this.requireUser()`.
3. **`ios/Plugin/BrazePlugin.swift`** — `@objc func <method>(_ call: CAPPluginCall)`. Validate with `call.reject(...)` using the byte-identical error string. Gate through `Self.requireInitialized(call)` (or the C07 quartet bypass).
4. **`ios/Plugin/BrazePlugin.m`** — add the `CAP_PLUGIN_METHOD(<method>, CAPPluginReturnPromise);` registration. Missing this line means the Capacitor bridge can't see the Swift method.
5. **`android/src/main/java/com/bma342/braze/BrazePlugin.kt`** — `@PluginMethod fun <method>(call: PluginCall)`. Validate with `call.reject(...)`. Gate through `requireInitialized(call)` / `requireUser(call)`.
6. **`test/web/src/<area>.test.ts`** — vitest behavioral test. Drive the method through `BrazeWeb` against the Fastify mock. Assert the **wire output** (the outbound request body), not just that it resolved — a test that only asserts "does not throw" survives the implementation being replaced by `return;`, and the 2026-09 audit found eleven of those.
7. **`android/src/test/java/com/bma342/braze/BrazePluginContractTest.kt`** — assert every validation branch byte-exact against `src/web.ts`. `TestSupport.kt`'s `fakePluginCall` replicates `PluginCall`'s strict accessor semantics, and `initializedPlugin()` gives you a Robolectric-backed initialized plugin so post-init paths are reachable.
8. **`ios/PluginTests/BrazePluginContractTests.swift`** — the same, in XCTest. Then re-run `ruby scripts/ios-add-test-target.rb` and commit the resulting `project.pbxproj`; CI fails if the generated project is out of date with the directory contents.
9. **`example/index.html` + `example/src/main.ts`** — add a button that calls the method and logs the result, so the developer testbed exercises the full surface.
10. **`CHANGELOG.md`** — under `Unreleased`, a one-line entry describing the addition. If the method is new to the roadmap, also update [`SDK_SURFACE.md`](./SDK_SURFACE.md) §1/§2.

If you skip one of these, here is what actually happens:
- Missing the `BrazePlugin.m` macro → the Swift method is invisible to the Capacitor bridge and the call rejects at runtime with "not implemented". **`verify-ios` will not catch this** — it compiles and runs XCTests, it does not exercise the JS bridge. Add the macro.
- Missing a native bridge → the web tests still pass (web is independent), but iOS / Android consumers hit "method not implemented" at runtime. Nothing in CI catches an entirely absent native implementation; the lockstep is the control.
- Missing the docgen `@example` → `npm run build` regenerates `README.md`, and the diff shows up in review. The `build-plugin` job asserts the `<docgen-api>` block is populated, not that every method has an example.
- Missing tests → nothing fails. This is why tests are *in* the lockstep and on the PR checklist.

---

## Tips for AI assistants

Short, sharp, codebase-specific patterns that pay off repeatedly:

### Before writing code, grep these

- **C01 error format** — `grep -rn 'call.reject("Braze' ios android src` to copy the error-string format and stay byte-identical across platforms.
- **Existing typed-id usage on Web SDK** — `grep -rn '@braze/web-sdk' src` shows how the dynamic-import is structured. Don't add a static import.
- **What the contract promises for a DTO** — open `src/definitions.ts` and find the matching `export interface Braze<Name>` — that's the contract, native bridges follow it.
- **What the SDK actually returns** — for iOS, `find /tmp/brazekit -name '*.swiftinterface'` (after `curl https://github.com/braze-inc/braze-swift-sdk/releases/download/18.2.1/BrazeKit.zip`); for Android, `gh api repos/braze-inc/braze-android-sdk/contents/<path>`; for Web, `node_modules/@braze/web-sdk/index.d.ts`. The audit punch list and Phase 1 commit show how to do this without a local Pod install.

### Common gotchas, sorted by how often AI gets them wrong

1. **Months are 1-indexed.** TS/Web pass `month: 7` for July. Android wraps via `Month.entries[month - 1]`; iOS uses `DateComponents(.month, value: 7)`. Never pass 0-indexed.
2. **Timestamps are epoch milliseconds at the wire.** Android SDK uses seconds for `card.created` + `getContentCardsLastUpdatedInSecondsFromEpoch()`; bridge multiplies by 1000. iOS BrazeKit uses `TimeInterval` (seconds with fraction); bridge converts via `Int(seconds * 1000)`. The DTO contract is always epoch ms.
3. **`iOS getInt` truncates non-integer doubles.** When you write `if let v = call.getInt(...)` for a value field that could be a JS `number`, doubles silently lose their fractional part. For `setCustomUserAttribute`, check `getDouble` first when the value has a fractional component (see audit L4-S02).
4. **Content card type discrimination is `instanceof` (web) / enum-case (iOS) / class-based `when` (Android).** Field-presence heuristics fail on sparse cards. See `serializeContentCard` in each bridge.
5. **Feature flag properties are a tagged union** `{ type, value }` per [`C02`](./docs/mdcs/C02-DTO-SHAPES.md). Order accessors so image-before-string and timestamp-before-number; BrazeKit's typed accessors return nil if the property isn't of the requested type.
6. **The init guard is non-negotiable except for the C07 quartet** (`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`). The old iOS asymmetry (`enableSDK` needed init; `isDisabled` reported `false` after a pre-init `disableSDK`) is **gone** as of 0.2.0: the plugin keeps the consent decision in its own state and applies it when `initialize` creates the `Braze` instance, so all three platforms behave identically and this cannot regress on a pin bump. The one genuine platform difference left is iOS's pre-init `wipeData`, which disables the SDK for the rest of the app run.
7. **`MARK:` / `// MARK:` comments and `@objc` decorations matter.** Removing them confuses Xcode navigation; removing `@objc` from a method breaks the Obj-C registration in `BrazePlugin.m`.

### Where to find what

| If you want… | Look at… |
|---|---|
| The plugin's full method list and JSDoc | [`src/definitions.ts`](./src/definitions.ts) |
| How a method should validate input | [`C04`](./docs/mdcs/C04-VALIDATION.md) + existing methods in `src/web.ts` |
| What error string to emit | `grep -rn 'Braze\.' src ios android \| grep call.reject` for examples |
| What the Web SDK exposes | `node_modules/@braze/web-sdk/index.d.ts` (typed) and `node_modules/@braze/web-sdk/src/` (source) |
| What the iOS SDK exposes | Download `BrazeKit.zip` from `braze-inc/braze-swift-sdk` releases; read `BrazeKit.framework/Modules/BrazeKit.swiftmodule/arm64-apple-ios.swiftinterface` |
| What the Android SDK exposes | `gh api repos/braze-inc/braze-android-sdk/contents/<path>` against the public source; the actual `Card` model classes are closed-source but `com.braze.models.cards.{CaptionedImageCard, ImageOnlyCard, ShortNewsCard, TextAnnouncementCard}` field access is visible in the open `android-sdk-ui` module |
| What was already audited, and what came of it | [`docs/audits/`](./docs/audits/) — 2026-05 and 2026-09 self-audits, each with a per-finding resolution table. **Archives, not open punch lists** |
| What is knowingly still broken | the README's [Known gaps](./README.md#known-gaps-in-020) section |
| Whether a behavior is intended | git log → commit messages have rationale; `CHANGELOG.md` has the user-facing version |
| What the test fixtures look like | [`test/web/src/test-utils.ts`](./test/web/src/test-utils.ts) for the `freshPluginWithConfig()` helper |

### Things that look like bugs but aren't

- **`prepare: npm run build` runs on every `npm install` in this repo.** Annoying for local dev but required so `npm install bma342/capacitor-braze` from a git URL works; `prepare` is skipped on consumer installs from the npm registry tarball.
- **`addListener` resolves immediately without firing.** Listeners attach to a native subscription created at `initialize` time; if `initialize` hasn't run yet, the handle is silently inert. See [`C05`](./docs/mdcs/C05-LISTENERS.md) and the listener JSDocs.
- **Subscribed events don't replay.** A consumer that subscribes after `initialize` won't see flags / cards that already arrived; the SDK keeps them in cache and the consumer should call `getFeatureFlag` / `getContentCards` to read current state.
- **iOS `wipeData()` *before* `initialize` disables the SDK for the app run.** The pre-init branch
  uses `Braze.wipeDataAndDisableForAppRun()`, which does not auto-re-enable; a subsequent
  `initialize` no-ops until the next app launch. Still true at BrazeKit 18.2.1, and still the only
  class-level wipe it offers (every alternative is deprecated too), so this is a BrazeKit
  constraint, not a plugin bug. It is the source of the one deliberate deprecation warning in the
  iOS build.
- **Web `wipeData()` before `initialize` does nothing.** There is no SDK storage manager to act on
  yet. It resolves without effect rather than implicitly initializing. Documented in the JSDoc and
  C07.
- **`npm test` needs two extra installs on a fresh clone.** There are no npm workspaces, so root
  `npm install` does not populate `test/web/node_modules` or `test/mock-server/node_modules`.
- **`~40 -strict-concurrency=complete warnings on iOS are expected.`** `CAPPlugin` and
  `CAPPluginCall` are non-`Sendable` in Capacitor 6/7, so any correct main-actor hop trips the
  checker. Swift 5 mode — what the podspec builds with — is clean.

### Verifying native changes without a local Xcode / Android Studio

- Use the CI `verify-ios` (xcodebuild against BrazeKit) and `verify-android` (gradle against `com.braze:android-sdk-ui`) jobs — they run on every PR.
- For local verification, download the BrazeKit xcframework directly:
  ```bash
  curl -L https://github.com/braze-inc/braze-swift-sdk/releases/download/18.2.1/BrazeKit.zip -o /tmp/brazekit.zip
  unzip -q /tmp/brazekit.zip -d /tmp/brazekit
  # API in /tmp/brazekit/BrazeKit.xcframework/.../*.swiftinterface
  ```
- For Android, the public source at `braze-inc/braze-android-sdk` has the UI module open; field signatures on `Card` and subclasses are inferable from `android-sdk-ui/src/main/java/com/braze/ui/contentcards/view/*.kt`.

---

## Forbidden

- **Reimplementing Braze functionality** in TS/Swift/Kotlin instead of calling the SDK. If the SDK doesn't expose something, file an issue with Braze — don't work around it in the bridge.
- **Adding methods not in [`SDK_SURFACE.md`](./SDK_SURFACE.md)** for the current target version. Every method = maintenance × 3 platforms.
- **Using `any` types** in TypeScript. Plugin consumers depend on type safety.
- **Throwing exceptions** from bridge code without going through `call.reject()`. Capacitor expects rejected promises, not crashes.
- **Hardcoded Braze endpoints** anywhere. Always come from `initialize({ endpoint })` so tests can point at the mock server.
- **Aromo-specific code** in this repo. If a feature is Aromo-only, it belongs in Aromo, not here.
- **Breaking the bridge contract silently.** If `definitions.ts` changes, both native bridges must change in the same PR.
- **`TODO` comments.** Open a GitHub issue instead.
- **`@Suppress` annotations** without a documented Braze SDK reason.
- **Committing Braze API keys** anywhere (even trial keys). Use env vars + `.env.example`. See [`SECURITY.md §13`](./SECURITY.md#13-ci--release-security).
- **Logging PII** at any log level. The bridge currently emits no log line containing user data on any platform, and keeping it that way is cheaper than masking. See [`SECURITY.md §3`](./SECURITY.md#3-pii-handling).
- **Adding a `unpkg` / IIFE browser bundle back.** It was removed in 0.2.0 because the web bridge dynamically imports a bare `@braze/web-sdk` specifier, which a `<script>` tag cannot resolve. ESM + CJS only.
- **Accepting REST API keys** in `initialize()` — only public SDK keys belong in the plugin. See [`SECURITY.md §1`](./SECURITY.md#1-api-keys--public-sdk-keys-vs-secret-rest-keys).
- **Bypassing SDK Authentication** when `enableSdkAuthentication: true`. Plugin must reject `changeUser` calls without signatures client-side, not silently let them through.

---

## Lighthouse: Aromo

Aromo (private monorepo at `~/eatsuite/aromo-kotlin/`) is the first production consumer. The relationship is **arm's-length**:

- Aromo imports this plugin from npm like any other dependency.
- The plugin repo is public; no Aromo code or secrets leak here.
- Aromo's Braze backend integration (server-side event sink, BYO-credential per client) is documented separately in `aromo-kotlin/docs/plans/BRAZE_INTEGRATION.md` (to be written).
- This plugin handles the **customer-app side** only: customer Capacitor app initializes Braze with the brand's keys (from Aromo's `AppConfig`) and uses the standard plugin API.

The README does **not** currently cite Aromo as a production user, and should not until the integration actually ships — an unverifiable production-user claim is worth less than nothing to a reviewer. When it does ship, that citation is a credibility multiplier; don't compromise it by leaking Aromo IP.

---

## Release process

1. Branch from `main`.
2. Make changes; ensure CI green.
3. Bump version in `package.json` per semver.
4. Update `CHANGELOG.md` with user-facing notes (not commit messages).
5. PR → review → squash merge.
6. Tag `vX.Y.Z` on `main`.
7. GitHub Action publishes to npm.
8. Create GitHub Release with changelog excerpt.

**Pre-1.0:** breaking changes allowed between minors; document loudly in CHANGELOG.

**Post-1.0:** strict semver. Breaking changes require major bump + migration guide.

---

## Key reminders

- **Read [`PLAN.md`](./PLAN.md), [`SDK_SURFACE.md`](./SDK_SURFACE.md), and [`SECURITY.md`](./SECURITY.md) before starting any non-trivial work.** They are the source of truth for strategy, capability scope, and security posture respectively.
- **Read the matching MDC in [`docs/mdcs/`](./docs/mdcs/) before coding.** C01 (any method), C02 (returning a Braze model), C03 (cross-platform conversion), C04 (any user input), C05 (any listener). If your change invents a new pattern, write a new MDC in the same commit as the code.
- **The TS interface is the contract.** Native bridges implement it; web impl implements it; tests assert it. Drift = bug.
- **Mock server first, real Braze last.** ~95% of dev cycles never hit real Braze.
- **Pin native SDKs exactly.** Range pins make Layer 4 smoke flaky and CI non-reproducible.
- **Bounded scope.** Current target version's method list in [`SDK_SURFACE.md §2`](./SDK_SURFACE.md#2-plugin-version-roadmap) is authoritative. New methods are scope changes that require a roadmap update.
- **One bridge pattern, applied identically.** If you're improvising a different bridge shape for one method, you're doing it wrong.
- **Security defaults matter most for things consumers won't set themselves.** Defaults: `enableLogging: false`, `allowInsecureEndpoint: false`, push handoff explicit. See [`SECURITY.md`](./SECURITY.md).
- **PII never crosses the logging boundary.** Mask emails, phones, user IDs in any plugin log line — even at debug level. See [`SECURITY.md §3`](./SECURITY.md#3-pii-handling).
- **Consumer-facing errors are README issues, not code issues.** Push token handoff + IAM lifecycle generate the most confusion — invest in docs.
- **Don't add CI checks that depend on real Braze.** No workflow talks to Braze and no Braze credential exists in CI; the whole suite is self-contained against the Fastify mock. The Layer 4 smoke is a manual, local procedure.
