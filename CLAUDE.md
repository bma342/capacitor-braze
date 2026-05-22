# capacitor-braze — AI Developer Configuration

**Project:** Open-source Capacitor 6+ plugin wrapping the Braze native SDKs (Android Kotlin, iOS Swift, Web JS).
**Owner:** Bryce Aspinwall (`bma342`), MIT-licensed, personal portfolio + Aromo lighthouse.
**npm package:** `capacitor-braze` (unscoped, slot confirmed available)

**Source-of-truth docs — read these before any non-trivial work:**
- [`PLAN.md`](./PLAN.md) — strategy, roadmap, risk decisions
- [`SDK_SURFACE.md`](./SDK_SURFACE.md) — complete Braze SDK capability catalog and version coverage
- [`SECURITY.md`](./SECURITY.md) — security model, threat analysis, plugin design decisions for every security-sensitive surface
- [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) — quality bar (DX + completeness + would-pass-Braze-review), pre-release checklist
- [`docs/mdcs/`](./docs/mdcs/) — per-subsystem design contracts (MDCs). Read the one matching your task before coding:
  - [C01](./docs/mdcs/C01-METHOD-ANATOMY.md) — 8-file lockstep, init guards, error message format
  - [C02](./docs/mdcs/C02-DTO-SHAPES.md) — Web SDK wire format as canonical DTO shape
  - [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) — month indexing, currency, decimals, dates, enums, sentinels
  - [C04](./docs/mdcs/C04-VALIDATION.md) — TS-at-boundary + native duplication
  - [C05](./docs/mdcs/C05-LISTENERS.md) — event listener lifecycle (eager-on-init, shared, no replay)
  - [C06](./docs/mdcs/C06-SECURITY-DEFAULTS.md) — security defaults, HTTPS-required endpoint, PII non-logging
  - [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md) — when a method may skip the init guard (the privacy/lifecycle quartet)
  - [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) — exact pin policy, bump protocol
  - [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md) — Capacitor's official toolchain (eslint/prettier/swiftlint/docgen), locked-in
  - [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) — consumer-side config the SDK pins force (Podfile, Gradle, peer dep)
  - [C11](./docs/mdcs/C11-NATIVE-TEST-HARNESSES.md) — iOS XCTest + Android JUnit/Robolectric mock-server harness design (impl pending)

### MDC glossary — when to consult which doc

| Doc | Topic | Read it before… |
|---|---|---|
| [C01](./docs/mdcs/C01-METHOD-ANATOMY.md) | 8-file lockstep, init guards, C01-format error strings | …adding *any* new method or touching a bridge |
| [C02](./docs/mdcs/C02-DTO-SHAPES.md) | Web SDK wire format as canonical DTO shape | …returning a Braze model (FeatureFlag, ContentCard, …) over the bridge |
| [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) | Month indexing, currency, decimals, dates, enums, sentinels, anonymous user id | …writing per-platform conversion logic |
| [C04](./docs/mdcs/C04-VALIDATION.md) | TS-at-boundary + native duplication, byte-identical error strings | …accepting any user input on a method |
| [C05](./docs/mdcs/C05-LISTENERS.md) | Listener lifecycle: eager subscription at `initialize`, shared, no replay | …adding a listener event or wiring a subscription |
| [C06](./docs/mdcs/C06-SECURITY-DEFAULTS.md) | Security defaults (`enableLogging: false`, HTTPS required, PII non-logging) | …touching `initialize` options or any logging path |
| [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md) | When a method may skip the init guard (the privacy/lifecycle quartet) | …adding a method consumers might call pre-`initialize` |
| [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) | Exact pin policy, bump protocol | …bumping a Braze SDK version |
| [C09](./docs/mdcs/C09-TOOLING-QUALITY-GATES.md) | Capacitor's official toolchain (eslint / prettier / swiftlint / docgen) | …editing CI, `package.json` scripts, or lint config |
| [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) | Consumer-side Podfile, Gradle, peer dep requirements the pin policy forces | …writing README integration sections or breaking-change notes |
| [C11](./docs/mdcs/C11-NATIVE-TEST-HARNESSES.md) | iOS XCTest + Android Robolectric mock-server harness (impl pending) | …implementing or extending the native test layer |

> **THIS PROJECT WRAPS — IT DOES NOT REIMPLEMENT.** Braze's native SDKs do all the actual work (network calls, encryption, push handling, IAM rendering, analytics batching). This plugin is a thin bridge layer that translates Capacitor `PluginCall`s into native SDK invocations. Before writing any code, confirm whether the underlying Braze SDK already does what you want — almost always, the answer is yes, and your job is to expose it through the bridge.

---

## What this is / what this is not

### Is
- A Capacitor plugin (Capacitor 6+).
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
| **Capacitor** | `@capacitor/core` ^6.0 (forward-compat to 7/8 as released) | peer dep |
| **Android bridge** | Kotlin 2.x, Capacitor Android | `com.braze:android-sdk-ui` **42.2.0** (exact pin) |
| **iOS bridge** | Swift 5.9+, Capacitor iOS, Xcode 16+ | `BrazeKit` + `BrazeUI` **14.1.0** (exact pin) |
| **Web fallback** | TypeScript | `@braze/web-sdk` ^6.0 peer dep |
| **Build** | Rollup (Capacitor standard) | — |
| **Tests** | Jest (TS), instrumented (Android), XCTest (iOS), Maestro (e2e), Ktor (mock server) | — |
| **CI** | GitHub Actions | matrix: ubuntu + macOS |

---

## Status

Snapshot at `0.1.0` (see `package.json` for the live version):

| Milestone | Status |
|---|---|
| Strategic plan (`PLAN.md`) | ✅ |
| AI dev guide (this file) | ✅ |
| TS interface + web impl | ✅ |
| Android bridge against `com.braze:android-sdk-ui:42.2.0` | ✅ |
| iOS bridge against `BrazeKit / BrazeUI 14.1.0` | ✅ |
| Mock Braze server (Ktor, in `test/mock-server`) | ✅ |
| Web behavioral tests (vitest + mock) — 108/108 | ✅ |
| CI: `verify-ios` (xcodebuild) + `verify-android` (gradle) | ✅ |
| Demo + example apps build in CI | ✅ |
| Privacy manifest (`PrivacyInfo.xcprivacy` via podspec) | ✅ |
| `inAppMessageReceived` + `sdkAuthError` listener events | ✅ (all 3 platforms) |
| iOS in-app message presenter wired (`BrazeInAppMessageUI`) | ✅ |
| Android IAM lifecycle wired (`BrazeInAppMessageManager`) | ✅ |
| URL parsing + cluster sanity check at `initialize` | ✅ |
| SDK Authentication enforcement on `changeUser` | ✅ |
| Required signed-commit branch protection on `main` | ✅ |
| Gitleaks CI step | ✅ |
| Snyk CI step (gated on `SNYK_TOKEN`) | ✅ |
| Capacitor 7 forward-compat (`^6 \|\| ^7` peer dep) | ✅ |
| `noUncheckedIndexedAccess` in main tsconfig | ✅ |
| Smoke wrappers (`npm run smoke:web/ios/android`) | ✅ |
| Audit cleanup (`findings/` punch list, Phases 1–17) | ✅ |
| `0.1.0` to npm | ✅ [npmjs.com/package/capacitor-braze](https://www.npmjs.com/package/capacitor-braze) |
| C11 native test harnesses — first batch | ✅ Android (Robolectric, 7 tests); iOS scaffolded |
| C11 native test harnesses — full integration tier | ⏳ URLProtocol-intercept design lives in C11 MDC |
| Layer 4 real-Braze smoke (manual against trial) | ⏳ wrappers staged, captures pending maintainer trial |
| Snyk token provisioned in CI | ⏳ maintainer setup (CONTRIBUTING.md) |

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
├── CapacitorBraze.podspec                                 # iOS CocoaPod manifest
├── src/
│   ├── definitions.ts                                     # TS interface — SOURCE OF TRUTH
│   ├── index.ts                                           # registerPlugin('Braze', ...)
│   └── web.ts                                             # WebPlugin impl (@braze/web-sdk wrapper)
├── ios/Plugin/
│   ├── BrazePlugin.swift                                  # CAPPlugin bridge → BrazeKit 14.1.0
│   ├── BrazePlugin.m                                      # CAP_PLUGIN_METHOD obj-c registrations
│   └── PrivacyInfo.xcprivacy                              # App Store privacy manifest
├── android/
│   ├── build.gradle                                       # com.braze:android-sdk-ui:42.2.0
│   ├── consumer-rules.pro                                 # R8/ProGuard rules consumer apps inherit
│   └── src/main/java/com/bma342/braze/BrazePlugin.kt      # @CapacitorPlugin bridge
├── dist/                                                  # build output (gitignored, regen via npm run build)
├── docs/
│   ├── mdcs/                                              # C01–C11 design-contract docs
│   └── smoke-tests/                                       # staged real-Braze smoke run templates
├── findings/                                              # current audit punch list (see SUMMARY.md)
├── example/                                               # developer testbed (per-method buttons)
├── demo/                                                  # consumer-fork-starter (React 19 + TanStack)
└── test/
    ├── mock-server/                                       # Ktor mock Braze backend (port 8080)
    └── web/src/                                           # vitest behavioral tests (94 as of 0.0.12)
```

**The 8-file lockstep:** when adding or changing a plugin method, you touch four files in lockstep — `src/definitions.ts`, `src/web.ts`, `ios/Plugin/BrazePlugin.swift`, `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — plus four test files (web + native harness × 2 when C11 lands). Add to one without the others and CI catches it. See [`docs/mdcs/C01-METHOD-ANATOMY.md`](./docs/mdcs/C01-METHOD-ANATOMY.md).

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

## Testing — the four-layer pyramid

See [PLAN.md §5](./PLAN.md) for the full strategy. Commands:

```bash
# Layer 1: TS contract tests (Jest, <1 min)
npm test

# Layer 2 + 3 (Android): bridge + mock server integration
cd example && npm run test:android

# Layer 2 + 3 (iOS): bridge + mock server integration
cd example && npm run test:ios

# Layer 3 (web): integration against mock server
cd example && npm run test:web

# Mock server standalone (for manual exploration)
cd test/mock-server && ./gradlew run
# server starts on http://localhost:8080
# init Braze with baseUrl: 'http://localhost:8080'

# Layer 4: real Braze smoke (manual, against trial account)
cd example && BRAZE_API_KEY=$REAL_TRIAL_KEY npm run smoke
```

**Critical:** the mock server must be running for Layer 3 tests. CI starts it as a service container; locally start it manually before running e2e.

---

## Native SDK pinning

Pinned versions live in:
- `android/build.gradle` — `com.braze:android-sdk-ui:42.2.0` (exact pin, not range)
- `CapacitorBraze.podspec` — `s.dependency 'BrazeKit', '14.1.0'` + `s.dependency 'BrazeUI', '14.1.0'` (exact)
- `package.json` peer dep — `"@braze/web-sdk": "^6.0.0"` (range, web peer dep only per [`C08`](./docs/mdcs/C08-NATIVE-SDK-PINNING.md))

**When bumping native SDK versions:**

1. Read the Braze SDK changelog for breaking changes.
2. Update the pin in the relevant manifest.
3. Run the full CI matrix.
4. If Layer 4 smoke tests pass against real Braze, ship a minor/patch.
5. If the bump is a breaking change for consumers (e.g. requires Android API level bump or new Pod), ship a major and document in `CHANGELOG.md`.

Daily spec-drift CI catches Braze REST changes; you catch SDK changes by subscribing to Braze SDK release notes.

---

## Adding a new method — the 8-file lockstep

When the surface grows (which should only happen per the [`SDK_SURFACE.md`](./SDK_SURFACE.md) roadmap), every method touches the same eight artifacts. Walk them in this order:

1. **`src/definitions.ts`** — declare the method signature on the `BrazePlugin` interface. Include JSDoc with at least one `@example` block ([`C01`](./docs/mdcs/C01-METHOD-ANATOMY.md)). Define any new option / result interfaces in the same file. If the method returns a Braze model, define the DTO with a `type` discriminator per [`C02`](./docs/mdcs/C02-DTO-SHAPES.md).
2. **`src/web.ts`** — implement on `BrazeWeb`. Validate input at the top with `throw new Error('Braze.<method>: \`<field>\` is required (<type>).')` matching the format in [`C01`](./docs/mdcs/C01-METHOD-ANATOMY.md). Gate non-init-independent methods through `this.requireInitialized()` or `this.requireUser()`.
3. **`ios/Plugin/BrazePlugin.swift`** — `@objc func <method>(_ call: CAPPluginCall)`. Validate with `call.reject(...)` using the byte-identical error string. Gate through `Self.requireInitialized(call)` (or the C07 quartet bypass).
4. **`ios/Plugin/BrazePlugin.m`** — add the `CAP_PLUGIN_METHOD(<method>, CAPPluginReturnPromise);` registration. Missing this line means the Capacitor bridge can't see the Swift method.
5. **`android/src/main/java/com/bma342/braze/BrazePlugin.kt`** — `@PluginMethod fun <method>(call: PluginCall)`. Validate with `call.reject(...)`. Gate through `requireInitialized(call)` / `requireUser(call)`.
6. **`test/web/src/<area>.test.ts`** — vitest behavioral test. Drive the method through `BrazeWeb` against the mock server (`capacitor-braze-mock-server`). Assert both happy path and validation rejections.
7. **`example/index.html` + `example/src/main.ts`** — add a button that calls the method and logs the result, so the developer testbed exercises the full surface.
8. **`CHANGELOG.md`** — under `Unreleased`, a one-line entry describing the addition. Pre-1.0 we don't gate on semver; post-1.0 a new method is a minor bump.

If you skip one of these, CI catches it:
- Missing the `BrazePlugin.m` macro → the Capacitor `verify-ios` job's smoke test for the method 404s.
- Missing the native bridge → contract tests in `test/web/src/` still pass (web is independent), but iOS / Android consumers hit "method not implemented" at runtime.
- Missing the docgen `@example` → `npm run build` (docgen step) regenerates `README.md` with a placeholder, lint diff catches it.

---

## Tips for AI assistants

Short, sharp, codebase-specific patterns that pay off repeatedly:

### Before writing code, grep these

- **C01 error format** — `grep -rn 'call.reject("Braze' ios android src` to copy the error-string format and stay byte-identical across platforms.
- **Existing typed-id usage on Web SDK** — `grep -rn '@braze/web-sdk' src` shows how the dynamic-import is structured. Don't add a static import.
- **What the contract promises for a DTO** — open `src/definitions.ts` and find the matching `export interface Braze<Name>` — that's the contract, native bridges follow it.
- **What the SDK actually returns** — for iOS, `find /tmp/brazekit -name '*.swiftinterface'` (after `curl https://github.com/braze-inc/braze-swift-sdk/releases/download/14.1.0/BrazeKit.zip`); for Android, `gh api repos/braze-inc/braze-android-sdk/contents/<path>`; for Web, `node_modules/@braze/web-sdk/index.d.ts`. The audit punch list and Phase 1 commit show how to do this without a local Pod install.

### Common gotchas, sorted by how often AI gets them wrong

1. **Months are 1-indexed.** TS/Web pass `month: 7` for July. Android wraps via `Month.entries[month - 1]`; iOS uses `DateComponents(.month, value: 7)`. Never pass 0-indexed.
2. **Timestamps are epoch milliseconds at the wire.** Android SDK uses seconds for `card.created` + `getContentCardsLastUpdatedInSecondsFromEpoch()`; bridge multiplies by 1000. iOS BrazeKit uses `TimeInterval` (seconds with fraction); bridge converts via `Int(seconds * 1000)`. The DTO contract is always epoch ms.
3. **`iOS getInt` truncates non-integer doubles.** When you write `if let v = call.getInt(...)` for a value field that could be a JS `number`, doubles silently lose their fractional part. For `setCustomUserAttribute`, check `getDouble` first when the value has a fractional component (see audit L4-S02).
4. **Content card type discrimination is `instanceof` (web) / enum-case (iOS) / class-based `when` (Android).** Field-presence heuristics fail on sparse cards. See `serializeContentCard` in each bridge.
5. **Feature flag properties are a tagged union** `{ type, value }` per [`C02`](./docs/mdcs/C02-DTO-SHAPES.md). Order accessors so image-before-string and timestamp-before-number; BrazeKit's typed accessors return nil if the property isn't of the requested type.
6. **The init guard is non-negotiable except for the C07 quartet** (`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`). iOS BrazeKit 14.x asymmetry: `enableSDK` requires init on iOS; `isDisabled` returns false pre-init on iOS. JSDoc in `definitions.ts` reflects this.
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
| What's left to fix before `0.1.0` | [`findings/SUMMARY.md`](./findings/SUMMARY.md) — current audit punch list |
| Whether a behavior is intended | git log → commit messages have rationale; `CHANGELOG.md` has the user-facing version |
| What the test fixtures look like | [`test/web/src/test-utils.ts`](./test/web/src/test-utils.ts) for the `freshPluginWithConfig()` helper |

### Things that look like bugs but aren't

- **`prepare: npm run build` runs on every `npm install` in this repo.** Annoying for local dev but required so `npm install bma342/capacitor-braze` from a git URL works; `prepare` is skipped on consumer installs from the npm registry tarball.
- **`addListener` resolves immediately without firing.** Listeners attach to a native subscription created at `initialize` time; if `initialize` hasn't run yet, the handle is silently inert. See [`C05`](./docs/mdcs/C05-LISTENERS.md) and the listener JSDocs.
- **Subscribed events don't replay.** A consumer that subscribes after `initialize` won't see flags / cards that already arrived; the SDK keeps them in cache and the consumer should call `getFeatureFlag` / `getContentCards` to read current state.
- **iOS `wipeData()` post-wipe disables SDK for the app run.** `Braze.wipeDataAndDisableForAppRun()` on iOS doesn't auto-re-enable; a subsequent `initialize` no-ops until next app launch. This is a BrazeKit constraint, not a plugin bug.

### Verifying native changes without a local Xcode / Android Studio

- Use the CI `verify-ios` (xcodebuild against BrazeKit) and `verify-android` (gradle against `com.braze:android-sdk-ui`) jobs — they run on every PR.
- For local verification, download the BrazeKit xcframework directly:
  ```bash
  curl -L https://github.com/braze-inc/braze-swift-sdk/releases/download/14.1.0/BrazeKit.zip -o /tmp/brazekit.zip
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
- **Logging PII** at any log level. See [`SECURITY.md §3`](./SECURITY.md#3-pii-handling) for the masking rules.
- **Accepting REST API keys** in `initialize()` — only public SDK keys belong in the plugin. See [`SECURITY.md §1`](./SECURITY.md#1-api-keys--public-sdk-keys-vs-secret-rest-keys).
- **Bypassing SDK Authentication** when `enableSdkAuthentication: true`. Plugin must reject `changeUser` calls without signatures client-side, not silently let them through.

---

## Lighthouse: Aromo

Aromo (private monorepo at `~/eatsuite/aromo-kotlin/`) is the first production consumer. The relationship is **arm's-length**:

- Aromo imports this plugin from npm like any other dependency.
- The plugin repo is public; no Aromo code or secrets leak here.
- Aromo's Braze backend integration (server-side event sink, BYO-credential per client) is documented separately in `aromo-kotlin/docs/plans/BRAZE_INTEGRATION.md` (to be written).
- This plugin handles the **customer-app side** only: customer Capacitor app initializes Braze with the brand's keys (from Aromo's `AppConfig`) and uses the standard plugin API.

When the plugin reaches `0.1.0`, the README cites Aromo as a production user. That citation is a credibility multiplier — don't compromise it by leaking Aromo IP.

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
- **Don't add CI checks that depend on real Braze for every PR.** Only the daily spec-drift job hits real Braze; PR CI is fully self-contained.
