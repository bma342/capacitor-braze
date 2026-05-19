# capacitor-braze — Plan

> An open-source Capacitor 6+ plugin wrapping the Braze native SDKs (Android, iOS, Web). The plugin Capacitor users have been asking for since 2020.

**Status:** Planning → scaffold next
**License:** MIT
**npm:** `capacitor-braze` (unscoped — slot confirmed available)
**Lighthouse customer:** Aromo customer app (Capacitor + Next.js)
**Owner:** Bryce Aspinwall (`bma342`)
**Last updated:** 2026-05-19

**Companion docs:**
- [`SDK_SURFACE.md`](./SDK_SURFACE.md) — complete Braze SDK capability catalog + plugin coverage roadmap
- [`SECURITY.md`](./SECURITY.md) — full security model
- [`CLAUDE.md`](./CLAUDE.md) — AI developer guide for this repo

---

## 0. Quick facts

| | |
|---|---|
| **What it is** | Capacitor plugin exposing Braze SDK methods to TypeScript with native bridges to Kotlin (Android) and Swift (iOS), plus a web fallback wrapping `@braze/web-sdk`. |
| **What it is not** | Not a reimplementation of Braze. Not a fork of an SDK. Not a CDP. Not coupled to Aromo. |
| **Target users** | Capacitor app teams that use Braze for customer engagement. Heavy in QSR / retail / fintech / media — exactly where Braze's customer base concentrates. |
| **Why now** | Cordova is sunsetting (Ionic deprecated it); Capacitor is the successor (55× more weekly npm downloads). Braze has not shipped a Capacitor plugin and shows no roadmap signal that they will. Community attempts (4 known) have all stalled at stub stage. |
| **Scope of v0.1** | ~15 core methods across user identity, custom events, purchases, push, content cards, in-app messages. All three platforms. |
| **First release target** | 3 weeks from scaffold start. |

---

## 1. Strategic framing

### Why this project exists

Braze ships first-party SDKs for native Android, native iOS, native Web, React Native, Flutter, Cordova, Expo, Unity, Xamarin, and Roku. Capacitor — the modern hybrid app framework that replaced Cordova as Ionic's default — has no first-party plugin. Real teams have been asking for one since 2020 (see [`braze-inc/braze-cordova-sdk` issue #49](https://github.com/braze-inc/braze-cordova-sdk/issues/49)).

Today's options for a Capacitor team that needs Braze:

1. **Use the Cordova SDK inside Capacitor** — works, but push token handoff broken in Capacitor 6+, in-app message rendering fights the WKWebView lifecycle, deep links unreliable.
2. **Use only the Web SDK in the WebView** — loses native push, loses native IAM rendering, performance worse.
3. **Roll a custom bridge** — 2–3 weeks of native engineering by someone who'd rather be shipping features.
4. **Skip Braze entirely** — marketing team revolts.

This plugin makes the answer `npm install` + 10 lines of init code. That's the entire value proposition.

### Strategic positioning in the Braze ecosystem

```
Tier 1: First-party native      → Android (Kotlin), Swift, Web JS
Tier 2: First-party hybrid      → React Native, Flutter, Cordova, Expo, Unity, Xamarin
Tier 3: Community plugins       → THIS PROJECT
```

Tier 3 has historically been the path to Braze devrel attention and eventual docs links. The realistic adoption arc:

1. Ship v0.1 → drive initial downloads via README + Ionic Discord + Braze community forum.
2. Build to "the obvious answer when you Google `braze capacitor`" via GitHub SEO + Stack Overflow answers.
3. Braze devrel notices → links from Braze docs as the recommended community option.
4. Possible outcomes: (a) Braze adopts officially, (b) co-maintained, (c) you become "the Braze + Capacitor person" in the ecosystem.

All three outcomes are wins. The cost is bounded (~2–3 weeks build, ~1–2 hrs/month maintenance).

### Why this works as a portfolio piece

Four signals stack:

1. **Native bridging** — proves Kotlin + Swift + TS + Capacitor bridge contract on three platforms.
2. **Real adoption potential** — the Cordova→Capacitor migration cohort is large and Braze-dense.
3. **Production lighthouse** — Aromo customer app ships it; "used in production by X" is a real recruiting hook.
4. **Vendor-relationship optionality** — Braze devrel knows you exist; the Capacitor community knows you exist.

---

## 2. Market validation (already done)

Cross-checked before committing — see prior session research. Summary:

| Check | Finding |
|---|---|
| Does an official Braze Capacitor plugin exist? | **No.** Not on npm under `@braze/`, not on GitHub under `braze-inc`. |
| Capawesome plugin? | No — `@capawesome/capacitor-braze` 404s on npm. |
| Capgo plugin? | No — `@capgo/capacitor-braze` 404s on npm. |
| Ionic Enterprise plugin? | No — `@ionic-enterprise/braze` 404s on npm. |
| Any community attempt? | Four known, all stub-stage / abandoned: `dghathway/braze-capacitor` (3 methods, abandoned 2023), `agustinaleon/ionic-capacitor-braze` (not a plugin), `lowip/braze-cordova-ionic-capacitor-angular-sample` (Cordova workaround), `braze-inc/braze-cordova-ionic-capacitor-angular-sample` (archived). |
| Capacitor adoption | 2.58M weekly downloads (`@capacitor/core`), 55× Cordova's 47K. v8.1.0 active (Feb 2026). |
| Capacitor enterprise use | Burger King, Southwest, BBC, Wendy's, NHS, Popeyes, H&R Block. Paid Enterprise tier (Auth Connect, Identity Vault, Offline Storage). |
| Braze customer overlap | Burger King and Wendy's confirmed using both. Hathway (agency that built the abandoned plugin) builds Capacitor apps for QSR brands on Braze. Statistical certainty: hundreds-to-thousands of teams. |
| Demand signal | Abandoned `braze-capacitor` package still receives ~85 weekly npm downloads — people actively searching, finding nothing real. |

**Verdict:** the slot is genuinely open, demand is documented, no first-mover is established.

---

## 3. Architecture

The plugin **wraps** the native SDKs — it does not reimplement them. Braze's SDKs do all the actual work; this plugin is a thin bridge.

```
┌──────────────────────────────────────────────────────────────┐
│  Consumer's Capacitor app (TS / React / Vue / Angular)       │
│  await Braze.logCustomEvent({ name: 'cart_viewed' })         │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  @bma342/capacitor-braze                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ src/definitions.ts — TS interface (single source)    │    │
│  │ src/index.ts — Capacitor plugin registration         │    │
│  │ src/web.ts — web impl → @braze/web-sdk               │    │
│  │ ios/BrazePlugin.swift — bridge → braze-swift-sdk     │    │
│  │ android/BrazePlugin.kt — bridge → braze-android-sdk  │    │
│  └──────────────────────────────────────────────────────┘    │
└──────┬───────────────────┬────────────────────┬──────────────┘
       │ Maven             │ CocoaPods          │ npm peer dep
       ▼                   ▼                    ▼
┌────────────────┐ ┌──────────────────┐ ┌────────────────┐
│ com.braze:     │ │ BrazeKit / BrazeUI│ │ @braze/web-sdk │
│ android-sdk-ui │ │  (Swift)         │ │  (JS)          │
│ (Kotlin)       │ │                  │ │                │
└────────────────┘ └──────────────────┘ └────────────────┘
        Maintained by Braze, included as pinned deps
```

### Implications of this layering

- **No competition with Braze.** We make their SDKs reachable from a framework they don't support. Additive, not threatening.
- **Maintenance is bounded.** Braze releases SDK updates ~monthly. Bump one version pin per platform, smoke-test, ship a patch. ~1–2 hrs/month.
- **Bugs route to Braze.** If `logCustomEvent` doesn't appear in the dashboard, it's a Braze SDK issue. Close our GitHub issue with a link to theirs.
- **Trust is borrowed.** Consumers know Braze's SDK is battle-tested; the plugin is just the glue.

---

## 4. API surface (v0.1)

Bounded scope — ~15 methods covering the daily-use Braze surface. Anything more advanced (feature flags, content cards with rich rendering, geofences) goes in v0.2+.

### User identity

```ts
initialize(options: { apiKey: string; endpoint: string; enableLogging?: boolean }): Promise<void>
changeUser(options: { userId: string; sdkAuthSignature?: string }): Promise<void>
getUserId(): Promise<{ userId: string | null }>
setEmail(options: { email: string }): Promise<void>
setPhoneNumber(options: { phoneNumber: string }): Promise<void>
setCustomAttribute(options: { key: string; value: string | number | boolean | string[] }): Promise<void>
```

### Events & purchases

```ts
logCustomEvent(options: { name: string; properties?: Record<string, unknown> }): Promise<void>
logPurchase(options: {
  productId: string;
  currency: string;
  price: number;
  quantity?: number;
  properties?: Record<string, unknown>;
}): Promise<void>
```

### Push

```ts
requestPushPermission(): Promise<{ granted: boolean }>
registerPushToken(options: { token: string }): Promise<void>     // for manual handoff scenarios
```

### Content Cards & in-app messages

```ts
getContentCards(): Promise<{ cards: ContentCard[] }>
logContentCardClick(options: { cardId: string }): Promise<void>
logContentCardImpression(options: { cardId: string }): Promise<void>
addListener(eventName: 'inAppMessageReceived', listener: (msg: InAppMessage) => void): PluginListenerHandle
```

### Data lifecycle

```ts
requestImmediateDataFlush(): Promise<void>
wipeData(): Promise<void>          // for logout / privacy compliance
```

### Method-count discipline

Anything not on this list waits for v0.2. Resist scope creep — every method is a maintenance liability across three platforms.

**Full coverage roadmap** (v0.1 → v0.2 → v0.5 → v1.0): see [`SDK_SURFACE.md §2`](./SDK_SURFACE.md#2-plugin-version-roadmap).

---

## 5. Test strategy

Four-layer pyramid. Two layers need zero Braze access.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: TS contract tests       — no Braze, no native         │
│  Layer 2: Native bridge unit tests — no Braze, native runtime   │
│  Layer 3: Mock-server integration  — no Braze, native runtime   │
│  Layer 4: Real Braze smoke tests   — real Braze (14-day trial)  │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 1 — TS contract

- **Tool:** Jest, runs in Node.
- **Validates:** method signatures, input validation, error shapes, types compile.
- **Runtime:** <1 minute.
- **Goal:** catch 50% of bugs before they reach a device.

### Layer 2 — Native bridge unit tests

- **Android:** instrumented tests on an emulator; `mockk` the Braze SDK at the class loader; assert `BrazePlugin.kt` translates `PluginCall` arguments correctly.
- **iOS:** XCTest; mock `Braze.shared`; assert the Swift bridge passes through.
- **Validates:** the bridge contract independent of Braze's actual behavior.

### Layer 3 — Mock Braze server (load-bearing)

The foundation: **every Braze SDK accepts an arbitrary `baseUrl`** at init. Point it at `http://localhost:8080` and the SDK will dutifully POST events there. Braze does not validate the endpoint exists.

Build a small Ktor server (~150 LOC) that:

- Implements the SDK-facing endpoints: `/api/v3/data/`, `/users/track`, `/users/identify`, `/data/messages`, `/sdk_auth`, `/feature_flags/sync`, `/feed/get`.
- Returns realistic canned responses (reverse-engineered from Braze's [official Postman collection](https://www.postman.com/braze-inc/braze-public-workspace/)).
- Records every request to an in-memory log with timestamps.
- Exposes `/__test/requests` so tests can assert request shape.

The example Capacitor app initializes with `baseUrl: 'http://10.0.2.2:8080'` (Android emulator) or `http://localhost:8080` (iOS sim / web), drives interactions via Detox or Maestro, and tests assert the mock server received correctly-shaped requests.

This is the same pattern Braze uses internally to test their own SDKs.

### Layer 4 — Real Braze smoke tests (pre-release)

- Sign up at [try.braze.com/free_trial](https://try.braze.com/free_trial) — self-serve, 14 days, 250 profiles, 1000 test emails.
- Run example app pointed at real Braze.
- Manually trigger each public method.
- Screenshot the dashboard showing data arriving.
- Manual + scripted; not part of every-PR CI.

Trial refresh paths: Braze for Startups (longer access if qualified), Braze Alloys partner program (sandbox + co-marketing), direct devrel outreach (`developers@braze.com`).

---

## 6. CI strategy

```yaml
# .github/workflows/test.yml
jobs:
  ts-contract:                      # Layer 1, <1 min
    runs-on: ubuntu-latest

  android-bridge:                   # Layer 2 + 3 on Android emulator
    runs-on: macos-latest           # for emulator support

  ios-bridge:                       # Layer 2 + 3 on iOS simulator
    runs-on: macos-latest

  web-integration:                  # Layer 3 on web (headless Chrome)
    runs-on: ubuntu-latest

  mock-server-spec-drift:           # daily — real Braze trial vs. mock fixtures
    runs-on: ubuntu-latest
    schedule: '0 9 * * *'
```

The daily spec-drift job is the unsung hero: hits real Braze trial endpoint, captures the response, diffs against the mock server's canned response. If Braze changes a response shape, CI fails the next morning — not six weeks later via a user GitHub issue.

---

## 7. Phased roadmap

### Week 1 — Foundation

- [ ] Run `npm init @capacitor/plugin@latest capacitor-braze` to scaffold.
- [ ] Repo + GitHub remote + MIT license + initial README stub.
- [ ] TS API surface: `definitions.ts` with all 15 method signatures.
- [ ] Web impl: `web.ts` wrapping `@braze/web-sdk`.
- [ ] Mock Braze server in Ktor (or Express if Ktor friction): 6 endpoints, canned responses.
- [ ] Layer 1 + Layer 3 (web only) passing in CI.
- [ ] Sign up for Braze 14-day trial → real API key in hand.

### Week 2 — Native bridges

- [ ] Android: Kotlin plugin class, Maven dep wired to `com.braze:android-sdk-ui:34.x`, all 15 methods.
- [ ] iOS: Swift plugin class, CocoaPod wired to `BrazeKit + BrazeUI ~> 12.x`, all 15 methods.
- [ ] Example app showing all three platforms working against mock server.
- [ ] Layer 2 + Layer 3 passing on Android + iOS in CI.
- [ ] Push token handoff working on both natives (see §8).

### Week 3 — Hardening & ship

- [ ] Layer 4 smoke tests against real Braze trial.
- [ ] In-app message lifecycle in WKWebView verified (see §9).
- [ ] README with: install instructions, full method docs, platform parity matrix, GIF of example app on iOS+Android+web, comparison table vs. Cordova workaround.
- [ ] CONTRIBUTING.md + CODE_OF_CONDUCT.md.
- [ ] CHANGELOG.md.
- [ ] Publish `0.1.0` to npm under `@bma342/capacitor-braze`.
- [ ] Post in: Ionic Discord `#plugins`, Braze community forum, Reddit `r/ionic`, Hacker News (Show HN: Capacitor plugin for Braze).

### Beyond v0.1

- v0.2: feature flags, geofences (where supported), more attribute types, rich content card rendering helpers.
- v0.3: Capacitor 8 / 9 forward-compat; Braze SDK 35+ pins; deep link router integration.
- v1.0: declared stable when used in production by ≥5 distinct organizations.

---

## 8. Push token handoff — the gnarly bit

This is the hardest part of the build. Two systems both want to own push registration:

- **Capacitor's `@capacitor/push-notifications` plugin** registers with APNs / FCM and returns a token via `addListener('registration', …)`.
- **Braze's native SDK** wants to register itself and receive tokens directly via its own listener.

If both register, you get duplicate registration, conflicting handlers, and tokens going to the wrong place. The plugin must make this clean.

### Design

A boolean init flag: `Braze.initialize({ ..., enableAutomaticPushHandling: true | false })`.

**`enableAutomaticPushHandling: true` (default):**
- Plugin tells Braze SDK to handle push registration end-to-end.
- Consumer does NOT call `PushNotifications.register()` from `@capacitor/push-notifications`.
- Braze receives tokens, registers them with Braze backend, handles incoming push payloads, renders notifications.

**`enableAutomaticPushHandling: false` (advanced):**
- Consumer keeps using `@capacitor/push-notifications` as the source of truth.
- Consumer calls `Braze.registerPushToken({ token })` manually after receiving the token from Capacitor's plugin.
- Useful for teams that already have a custom push pipeline or want to route tokens to multiple destinations.

### Documentation requirement

The README must have a dedicated "Push Notifications" section with a decision tree:
- Don't have Capacitor push working yet? → use `enableAutomaticPushHandling: true`.
- Already using `@capacitor/push-notifications`? → use `false` + manual handoff.
- Using Firebase Messaging directly? → use `false` + manual handoff.

Bad docs here will generate the majority of GitHub issues. Invest in this section.

---

## 9. In-app message lifecycle in WKWebView

Braze's native iOS SDK renders IAMs as native `UIView`s overlaid on the app. In a Capacitor app, the entire UI is a WKWebView — the IAM ends up overlaid on the WebView, which mostly works but has edge cases:

- **WebView keyboard interactions** — IAM appears while a text input is focused → keyboard fights IAM for screen space.
- **Status bar / safe area** — IAM positions assume native chrome; Capacitor apps may render edge-to-edge.
- **Deep links from IAM CTA** — must route through Capacitor's URL handler, not iOS's default.
- **Backgrounding mid-IAM** — IAM state must persist across app lifecycle events.

### Mitigation

- Surface a `addListener('inAppMessageReceived', listener)` event that fires *before* Braze renders.
- Consumer can return `'discard' | 'reenqueue' | 'display'` to control rendering.
- Default behavior: let Braze render natively unless consumer intercepts.
- Document known WKWebView edge cases in README troubleshooting section.

Equivalent considerations on Android (WebView lifecycle, edge-to-edge) but generally less fraught than iOS.

---

## 10. Repo structure

```
capacitor-braze/
├── README.md                           # public-facing docs + adoption story
├── PLAN.md                             # this document
├── CLAUDE.md                           # AI dev guide for this repo
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── LICENSE                             # MIT
├── package.json                        # @bma342/capacitor-braze
├── tsconfig.json
├── rollup.config.js                    # Capacitor's standard build
├── BrazePlugin.podspec                 # iOS CocoaPod
│
├── src/
│   ├── definitions.ts                  # TypeScript interface (single source of truth)
│   ├── index.ts                        # plugin registration
│   └── web.ts                          # web impl → @braze/web-sdk
│
├── ios/Plugin/
│   ├── BrazePlugin.swift               # Capacitor bridge → braze-swift-sdk
│   └── BrazePlugin.m                   # Objective-C plugin declaration
│
├── android/
│   ├── build.gradle                    # com.braze:android-sdk-ui:34.x
│   └── src/main/java/com/bma342/braze/
│       └── BrazePlugin.kt              # Capacitor bridge → braze-android-sdk
│
├── example/                            # working Capacitor app for manual + automated testing
│   ├── ios/
│   ├── android/
│   ├── src/
│   └── capacitor.config.ts
│
├── test/
│   ├── mock-server/                    # Ktor mock Braze (or Express alt)
│   │   ├── src/main/kotlin/MockBrazeServer.kt
│   │   └── fixtures/                   # canned response JSON
│   ├── ts/                             # Layer 1 Jest tests
│   ├── e2e/                            # Layer 3 Detox / Maestro flows
│   └── smoke/                          # Layer 4 manual scripts + screenshots
│
└── .github/
    ├── workflows/
    │   ├── test.yml                    # CI matrix
    │   ├── release.yml                 # semver bump + npm publish
    │   └── spec-drift.yml              # daily real-Braze vs. mock diff
    ├── ISSUE_TEMPLATE/
    │   ├── bug_report.md
    │   ├── feature_request.md
    │   └── braze-sdk-issue.md          # routes Braze SDK bugs to upstream
    └── dependabot.yml
```

---

## 11. Versioning & release

- **Semver** strictly. Pre-1.0 means breaking changes possible between minors.
- **Native SDK version compatibility** documented per release in CHANGELOG (e.g., `0.3.0 requires braze-android-sdk >= 33.0`).
- **Capacitor compatibility matrix** in README — supported Capacitor major versions per plugin major version.
- **Release process:** PR → CI green → bump version → tag → GitHub Action publishes to npm.
- **Branch model:** `main` is releasable; feature branches → PR → squash merge.

---

## 12. Lighthouse — Aromo integration

Aromo is the first production consumer. The relationship is intentional and arm's-length:

- Aromo imports `@bma342/capacitor-braze` from npm like any other dependency.
- Aromo references the plugin in `web/package.json` and wires it behind a per-client feature flag in `AppConfig`.
- Aromo's BYO-Braze integration plan (`aromo-kotlin/docs/plans/BRAZE_INTEGRATION.md` — to be written) is the backend side; this plugin is the customer-app side.
- The plugin repo is public; no Aromo code or secrets leak into it.

The README cites Aromo as a production user once `0.1.0` ships and is integrated. That citation strengthens the plugin's credibility; it doesn't compromise Aromo's IP.

---

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Braze ships their own official Capacitor plugin | Medium | High | First-mover advantage + community trust. If they ship, offer to contribute / deprecate gracefully. Aromo integration work isn't wasted either way. |
| Braze SDK API changes break the bridge | High (it will happen) | Medium | Daily spec-drift CI job catches it within 24h. Pinned native versions per plugin release. |
| WKWebView IAM rendering bugs | High | Medium | Dedicated documentation section + listener pattern lets consumers intercept. |
| Push token handoff confusion → GitHub issue flood | Very high | Medium | Invest heavily in push docs with decision tree. Add issue template specifically for push problems. |
| Capacitor major version churn (v6 → v7 → v8) | Certain | Low | Compatibility matrix in README. Drop old Capacitor support gracefully across plugin majors. |
| Maintenance burnout | Medium | Medium | Bounded scope (15 methods). Daily CI catches issues, doesn't require manual monitoring. Aromo as anchor user keeps it relevant. |
| Low adoption | Low | Low | Even with low adoption the resume signal stands; build cost is ~3 weeks. |

---

## 14. Open decisions

1. **npm name:** ~~`@bma342/capacitor-braze`~~ → **`capacitor-braze` (unscoped)**. Confirmed available on npm (different word order from the abandoned `braze-capacitor` stub). Cleaner install (`npm i capacitor-braze`); matches `capacitor-secure-storage-plugin` and similar community plugin conventions.
2. **Mock server language:** Ktor (matches Aromo, you know it deeply) vs. Express (more accessible to the JS-native Capacitor community). **Default: Ktor for first build, document alt path.**
3. **E2E test runner:** Detox (mature, RN heritage) vs. Maestro (newer, simpler YAML flows). **Default: Maestro — lower setup cost, faster feedback.**
4. **Min Capacitor version supported:** v6.0 (current) or v5.0 (broader audience). **Default: v6.0 — v5 is sunsetting and supporting it adds bridge complexity.**
5. **Min Android API / iOS version:** match Braze SDK's own minimums (Android API 26+, iOS 15+). **Default: yes, match.**
6. **Should Aromo be the lighthouse on day 1, or wait for v0.2?** Day 1 = real production validation but locks the v0.1 surface to Aromo's actual usage. v0.2 = cleaner first release. **Default: day 1 — better story, real bugs found faster.**
7. **SDK Authentication default:** opt-in via `enableSdkAuthentication: true` in v0.1, with README pushing hard for production use. See [`SECURITY.md §2`](./SECURITY.md#2-sdk-authentication-signed-jwt).

---

## 15. Long-term vision

| Horizon | What success looks like |
|---|---|
| **3 months** | `0.1.0` shipped, ~20 GitHub stars, ~200 weekly npm downloads, used in Aromo production, no critical bugs. |
| **6 months** | `0.5.0` covers feature flags + geofences, ~100 stars, ~1k weekly downloads, listed in Capacitor plugin awesome lists, mentioned in Braze community forum. |
| **12 months** | `1.0.0` stable, ~500 stars, ~5k weekly downloads, used by ≥5 organizations publicly, linked from Braze docs as recommended community plugin. |
| **24 months** | Either (a) blessed/co-maintained by Braze, (b) acquired/absorbed officially, or (c) firmly established as "the Braze + Capacitor person" identity on Bryce's GitHub profile. |

None of these depend on the others; even the 3-month outcome alone makes the resume signal worth the build.

---

## Appendix — references

### Braze
- [Braze API Overview](https://www.braze.com/docs/api/basics)
- [Braze API and SDK Endpoints](https://www.braze.com/docs/user_guide/administer/personal/sdk_endpoints)
- [Braze Android SDK](https://github.com/braze-inc/braze-android-sdk)
- [Braze Swift SDK](https://github.com/braze-inc/braze-swift-sdk)
- [Braze Web SDK](https://github.com/braze-inc/braze-web-sdk)
- [Braze Postman collection](https://www.postman.com/braze-inc/braze-public-workspace/)
- [Braze Free Trial](https://try.braze.com/free_trial)
- [Issue #49 — Capacitor support question](https://github.com/braze-inc/braze-cordova-sdk/issues/49)

### Capacitor
- [Capacitor docs](https://capacitorjs.com/)
- [Capacitor Enterprise](https://capacitorjs.com/enterprise)
- [Creating a Capacitor plugin](https://capacitorjs.com/docs/plugins/creating-plugins)
- [`@capacitor/create-plugin` scaffolder](https://www.npmjs.com/package/@capacitor/create-plugin)

### Prior attempts (for due diligence)
- [`dghathway/braze-capacitor`](https://github.com/dghathway/braze-capacitor) — abandoned stub
- [`agustinaleon/ionic-capacitor-braze`](https://github.com/agustinaleon/ionic-capacitor-braze) — app scaffold, not a plugin
- [`braze-inc/braze-cordova-ionic-capacitor-angular-sample`](https://github.com/braze-inc/braze-cordova-ionic-capacitor-angular-sample) — archived workaround
