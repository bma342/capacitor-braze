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

| Phase | Status |
|---|---|
| Strategic plan ([PLAN.md](./PLAN.md)) | ✅ written |
| AI dev guide (this file) | ✅ written |
| Repo scaffold (`npm init @capacitor/plugin`) | ⏳ next |
| Mock Braze server | ⏳ Week 1 |
| Web impl | ⏳ Week 1 |
| Android bridge | ⏳ Week 2 |
| iOS bridge | ⏳ Week 2 |
| Real Braze smoke tests | ⏳ Week 3 |
| `0.1.0` to npm | ⏳ Week 3 target |

Always check actual `package.json` + git log for current state; this table can drift.

---

## Repo structure (planned)

```
capacitor-braze/
├── PLAN.md / CLAUDE.md / README.md
├── package.json                        # peer deps + scripts
├── BrazePlugin.podspec                 # iOS CocoaPod
├── src/
│   ├── definitions.ts                  # TS interface — SINGLE SOURCE OF TRUTH
│   ├── index.ts                        # registerPlugin()
│   └── web.ts                          # WebPlugin impl
├── ios/Plugin/BrazePlugin.swift        # CAPPlugin bridge → braze-swift-sdk
├── android/src/main/java/com/bma342/braze/BrazePlugin.kt   # @CapacitorPlugin bridge → braze-android-sdk
├── example/                            # working Capacitor app for testing
└── test/
    ├── mock-server/                    # Ktor mock Braze server
    ├── ts/                             # Jest unit tests
    └── e2e/                            # Maestro flows
```

When adding a new method, you touch four files in lockstep: `definitions.ts`, `web.ts`, `BrazePlugin.swift`, `BrazePlugin.kt`. Add to one without the others and CI will catch it.

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

**Pattern rule:** every method follows this exact shape across all four files. Input validation in the native bridge (Swift/Kotlin), not in TS. Errors via `call.reject()` with a clear message, not by throwing.

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
- `android/build.gradle` — `com.braze:android-sdk-ui:34.x.x` (exact, not range)
- `BrazePlugin.podspec` — `s.dependency 'BrazeKit', '12.x.x'` (exact)
- `package.json` peer dep — `"@braze/web-sdk": "^6.0.0"` (range, web only)

**When bumping native SDK versions:**

1. Read the Braze SDK changelog for breaking changes.
2. Update the pin in the relevant manifest.
3. Run the full CI matrix locally.
4. If Layer 4 smoke tests pass against real Braze, ship a minor/patch.
5. If the bump is a breaking change for consumers (e.g., requires Android API level bump), ship a major and document in CHANGELOG.

Daily spec-drift CI catches Braze REST changes; you catch SDK changes by subscribing to Braze SDK release notes.

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
