# Test coverage audit

> The **percentages below are measured**, not asserted: `npm run test:coverage` (from `test/web`)
> instruments `src/web.ts` with `@vitest/coverage-v8` and fails the run if coverage drops. The two
> native bridges are measured the same way as of `0.3.0` — JaCoCo on Android, `xccov` on iOS — see
> [Measured coverage of the native bridges](#measured-coverage-of-the-native-bridges). The
> **per-method table** further down is still maintained by hand — it answers "does this method have
> a behavioral test at all", which a line percentage cannot. Re-derive it when the suite changes.

**Audited:** 2026-09-22 (`0.2.0`); native coverage measured 2026-09-28 (`0.3.0`).
**Web test count:** **206 tests across 18 files, ~3.5s** (`npm test`).
**Native:** 108 Robolectric/JUnit (`android/src/test/`) + 82 XCTest (`ios/Tests/BrazePluginTests/`, none
skipped), both in CI. Of those, **17 on Android and 27 on iOS are C11's integration tier** — the real
Braze SDKs driven against a local HTTP server, asserting the wire and, for every listener event, the
`notifyListeners` payload the SDK's own parse produced. Both natives enter all 35 bridge methods
through a real `PluginCall` / `CAPPluginCall`.
**Methods on the surface:** 35, plus `addListener` (4 event overloads) and `removeAllListeners`.
**Directly covered:** **35 of 35**, plus dedicated rejection coverage for every input-validation
branch in `src/web.ts` ([`validation.test.ts`](../test/web/src/validation.test.ts)).

## Measured coverage of `src/web.ts`

```
npm --prefix test/web run test:coverage
```

| Metric | Covered / total | % | Ratchet threshold |
|---|---|---|---|
| Statements | 689 / 707 | **97.45** | 97 |
| Lines | 689 / 707 | **97.45** | 97 |
| Branches | 306 / 337 | **90.80** | 90 |
| Functions | 56 / 56 | **100** | 99 |

Thresholds live in [`test/web/vitest.config.ts`](../test/web/vitest.config.ts) and are a **ratchet**:
they sit just under the measured values, so a regression fails the run. Raise them as coverage
improves; never lower them to make a run pass. Instrumentation is off during plain `npm test` so the
fast loop stays fast — only `test:coverage` turns it on.

Scope is `src/web.ts` alone. `definitions.ts` is types (no runtime statements) and `index.ts` is
`registerPlugin`, which these tests bypass deliberately — they construct `BrazeWeb` directly so the
assertions are about the bridge, not about Capacitor's registration.

### What is not covered, and why

Line numbers drift; the symbol is the durable part. Re-derive with
`npm --prefix test/web run test:coverage`.

Three of the four regions are defensive paths unreachable without stubbing the SDK module. The
fourth is a real gap with a known fix.

| Lines | What | Status |
|---|---|---|
| 461–465 | `getDeviceId`'s "SDK has not generated a device ID yet" throw | Unreachable. `getDeviceId()` always returns an id once `initialize` has resolved; forcing `null` means replacing the SDK with a stub, at which point the test asserts against the stub rather than the SDK |
| 772–776 | `requireUser`'s "`getUser()` returned null" throw | Unreachable post-init for the same reason. The message itself tells the consumer to file an issue, which is the right shape for a can't-happen branch |
| 797–805 | `loadSdk`'s dynamic-import failure branch | Unreachable without intercepting the module loader: it needs the `@braze/web-sdk` import itself to fail (CSP violation, bundler interop, non-DOM context) |
| 282–283 | the `deepLinkHandling: 'app'` call to `interceptDeepLinks` inside the in-app-message subscription | **Coverable, and worth doing.** `deep-links.test.ts` covers the deep-link surface, but nothing yet delivers a *real* triggered in-app message while in `'app'` mode. Now that `in-app-messages.test.ts` can deliver one, this is a `deepLinkHandling: 'app'` override away |

Instrumenting paid for itself immediately: it surfaced three branches that *were* worth covering and
that the per-method table had made look covered — a valid `sessionTimeoutInSeconds` (only its
rejection was tested, so the conditional spread that forwards it to the SDK never ran),
`logPurchase`'s missing-`currency` rejection, and `requestContentCardsRefresh`'s failure callback.
All three now have tests.

**What 0.2.0 changed here.** The 2026-09 audit found that breadth was real but depth was not:
eleven tests would have passed with their implementation replaced by `return;`, and swapping
`setFirstName` with `setLastName` broke nothing. Every attribute setter now asserts its Braze wire
key, subscription groups assert `status`, `setGender` asserts the mapped wire value for all six
genders, `logPurchase` asserts `q` and `pr`, and `serializeInAppMessage` is covered for the first
time against real SDK message classes. Two listener events (`inAppMessageReceived`, `sdkAuthError`)
had zero coverage anywhere; `sdkAuthError` is now covered end-to-end on web and at payload level on
both natives.

## What's directly covered

Every consumer-facing method has at least one direct behavioral test. `initialize` is implicitly tested by every test that uses the freshly-initialized plugin (the `beforeAll` / `beforeEach` in every file).

| Method | Test file | Coverage |
|---|---|---|
| `initialize` | implicit (every file's `beforeAll`) | sufficient at this layer |
| `changeUser` | `identity.test.ts` | wire format |
| `getUserId` | `identity.test.ts` | return value |
| `setSdkAuthenticationSignature` | `identity.test.ts` | wire format + empty-rejection |
| `setEmail` / `setPhoneNumber` / `setFirstName` / `setLastName` / `setLanguage` / `setCountry` / `setCustomUserAttribute` / `setHomeCity` | `attributes.test.ts` | each puts value on wire |
| `setDateOfBirth` | `attributes.test.ts` | DOB on wire |
| `setGender` | `attributes.test.ts` | accept-each + reject-unknown |
| `addToSubscriptionGroup` / `removeFromSubscriptionGroup` | `subscription-groups.test.ts` | wire format + empty-rejection |
| `addAlias` | `identity.test.ts` | wire format + empty-rejection |
| `getDeviceId` | `identity.test.ts` | return value |
| `logCustomEvent` | `events.test.ts` | wire format + properties survive |
| `logPurchase` | `events.test.ts` | wire format + every validation rejection (productId, currency, price, quantity, property types) |
| `getFeatureFlag` | `feature-flags.test.ts` | empty-cache + empty-id rejection |
| `getAllFeatureFlags` | `feature-flags.test.ts` | empty-cache |
| `refreshFeatureFlags` | `feature-flags.test.ts` | does not throw |
| `logFeatureFlagImpression` | `feature-flags.test.ts` | does not throw + empty-id rejection |
| `getContentCards` | `content-cards.test.ts` | empty-cache |
| `requestContentCardsRefresh` | `content-cards.test.ts`, `content-cards-populated.test.ts` | populated refresh end-to-end + a 500 response resolves-with-warning and preserves the cache |
| `logContentCardClick` / `logContentCardImpression` | `content-cards.test.ts` | unknown-cardId rejection with specific message |
| `disableSDK` / `enableSDK` / `isDisabled` | `lifecycle.test.ts` | state transitions |
| `requestImmediateDataFlush` | `lifecycle.test.ts` | weak: no-op when nothing queued |
| `wipeData` | `privacy-lifecycle.test.ts` | resets `initialized` state + works pre-init (C07) |
| `registerPushToken` | `push.test.ts` | rejects on web with named, helpful error |
| `echo` | `privacy-lifecycle.test.ts` | Capacitor convention round-trip, init-independent |
| `addListener('featureFlagsUpdated', cb)` | `listeners.test.ts` | refresh fires callback with serialized DTOs |
| `addListener('contentCardsUpdated', cb)` | `listeners.test.ts`, `lifecycle.test.ts` | same, plus re-`initialize` mid-flight / settled / workspace-switch (self-healing config) |
| `addListener('inAppMessageReceived', cb)` | `in-app-messages.test.ts` | end-to-end trigger delivery: slideup / modal / full / control DTOs, button click actions, `enableInAppMessageUI` on and off |
| `addListener('sdkAuthError', cb)` | `listeners.test.ts` | scripted `auth_error` response fires the listener with userId / code / reason / signature |
| `removeAllListeners` | `listeners.test.ts`, `in-app-messages.test.ts` | subsequent refreshes and triggers do not invoke removed callbacks |
| Init guard | `privacy-lifecycle.test.ts` | clear message on `logCustomEvent`, `getFeatureFlag`, `getContentCards` without prior `initialize()` |

Plus 17 serializer unit tests (`serializers.test.ts`) covering `serializeFeatureFlag` / `serializeContentCard` / `detectContentCardType` / `serializeContentCards` in isolation, across all valid + edge-case shapes.

## Known gaps (the honest list)

These are coverage holes a maintainer should know about. They are filed here so they aren't "discovered" again on every audit.

### Gaps closed by populated-cache work (2026-05-20)

The populated-cache gap that this section originally tracked is **closed**. Two infrastructure additions and three new test files now exist:

- `mock-server` 0.0.2: `respondTo({pathPattern, body, method?})` lets tests script per-path responses; `method?: 'POST'` excludes CORS preflight `OPTIONS` from consuming oneShot scripts.
- `test/web/src/test-utils.ts` `freshPluginWithConfig()`: boots a fresh mock + new `BrazeWeb` + scripts the FIRST `/api/v3/data/` POST response with a server-config block that enables FF + CC refreshes (`{enabled: true, refresh_rate_limit: 0}`) BEFORE `plugin.initialize()` fires. The SDK reads its server config from this first POST response.
- `test/web/src/feature-flags-populated.test.ts`: 2 tests asserting that 3 different flags + every supported property type (`string` / `number` / `boolean` / `image` / `datetime` / `jsonobject`) roundtrip end-to-end via `refreshFeatureFlags → getFeatureFlag → BrazeFeatureFlag`. Cache-miss returns `flag:null`.
- `test/web/src/content-cards-populated.test.ts`: 1 fat test asserting that 3 card-type variants (`captionedImage` / `imageOnly` / `classic` per the [C02](./mdcs/C02-DTO-SHAPES.md) discriminator rules) roundtrip end-to-end via `requestContentCardsRefresh → getContentCards`. Click + impression resolve once the cardId is in the cache.

**Reason the consolidated tests are "fat" rather than focused:** `@braze/web-sdk` is a module-level singleton within a vitest worker. Once `initialize()` succeeds in test 1, subsequent `initialize()` calls within the same file's worker don't fully re-init the SDK's internal state. The clean alternative is one file per scenario; the per-file boot overhead outweighs the clarity benefit for what is one end-to-end assertion in each.

| Method | What's untested today | Why it matters |
|---|---|---|
| `getFeatureFlag` with populated cache | ✅ covered by `feature-flags-populated.test.ts` (single + multi-flag + all property types) |
| `getAllFeatureFlags` with populated cache | ✅ covered same file |
| `getContentCards` with real cards | ✅ covered by `content-cards-populated.test.ts` (3 card-type variants, type discriminator validated per C02) |
| `logFeatureFlagImpression` with known flag | ✅ covered in `feature-flags-populated.test.ts`: refresh → impression → flush → wire-level capture asserts the POST body contains the `ffi` event with `fid: <flag id>`. Event code verified against `@braze/web-sdk` `EventTypes.xo` = `"ffi"`. |
| `logContentCardClick` / `logContentCardImpression` with known card | ✅ wire-level covered in `content-cards-populated.test.ts`: refresh → click + impression → flush → captures assert `ccc` event for click and `cci` event for impression, each with `ids: [<card id>]`. Event codes verified against `@braze/web-sdk` card-manager (`p.os`/`p.ds`). |

### Gaps closed by listener-end-to-end tests (2026-05-20)

`listeners.test.ts` now drives the full listener lifecycle by triggering a real refresh through `freshPluginWithConfig` + mock-server scripted responses:

| Method | Status |
|---|---|
| `addListener('featureFlagsUpdated', cb)` | ✅ asserts callback fires after `refreshFeatureFlags` with the canonical `{ flags: BrazeFeatureFlag[] }` payload |
| `addListener('contentCardsUpdated', cb)` | ✅ asserts callback fires after `requestContentCardsRefresh` with the canonical `{ cards: BrazeContentCard[], lastUpdated: number \| null }` payload |
| `removeAllListeners` | ✅ asserts no further callback invocations after removal, even when a subsequent refresh fires |

### Gaps closed by end-to-end in-app-message delivery (2026-09-22)

Both gaps the 2026-09 audit left explicitly open on the web bridge are now closed.

**`inAppMessageReceived` delivery** — [`in-app-messages.test.ts`](../test/web/src/in-app-messages.test.ts),
8 tests. The mock now returns a real `triggers` array on the `/api/v3/data/` response, and the real
`@braze/web-sdk` trigger engine parses it, evaluates the condition, builds a real `InAppMessage`
subclass through its own factory, and invokes the subscription the plugin registered in
`initialize`. Nothing is stubbed; the assertions are on what a consumer's `addListener` callback
receives. Covered: session-start (`open`) slideup with the full C02 DTO, custom-event modal with
per-button click actions, full-screen, control message, a non-matching event firing nothing,
`enableInAppMessageUI` true (SDK presenter mounts) and false (listener fires, nothing renders), and
one-native-subscription fan-out to multiple JS listeners plus `removeAllListeners`.

The wire format (`triggers[].trigger_condition`, `triggers[].data`, the `type` discriminator, the
gating fields) was read out of `@braze/web-sdk` 6.13.0's own source and is documented on
`mockTrigger` in [`test-utils.ts`](../test/web/src/test-utils.ts).

**`contentCardsUpdated` after a second `initialize`.** The gap note's original premise ("the
re-subscribe is dead") was wrong; the real cause was a race against the Web SDK's server-config
memoization. The SDK reads `ab.storage.serverConfig` exactly once, synchronously, when an instance is
built. The plugin's re-init path used to `destroy()` and rebuild unconditionally; if the first cycle's
`/api/v3/data/` response had not landed by then, the fresh config manager memoized empty defaults
(`content_cards.enabled: false`, `feature_flags.enabled: false`) and the late response landed on the
destroyed manager. `requestContentCardsRefresh()` then sent no sync POST at all and parked on the
config-change subscription while still resolving. **Fixed in 0.2.0:** `initialize` now fingerprints
the construction-time options and keeps the instance on a same-configuration re-init (subscriptions
are still torn down and re-wired), so the in-flight response reaches the manager that owns the parked
refresh; a changed key / endpoint still rebuilds. `lifecycle.test.ts` pins both cases — settled re-init
and mid-flight re-init — and a genuine workspace switch, with the mock's `delayMs` making the race
deterministic rather than timing-dependent.

## Measured coverage of the native bridges

Measured **2026-09-28** at `0.3.0`: JDK 21 + Robolectric for Android, Xcode 26.6 on the iPhone 17
simulator for iOS. The iOS rows were re-measured the same day after the bridge-method sweep (82
XCTests; the first measurement, at 50, was 58.54% lines / 51.61% functions), and three consecutive
runs produced identical numbers.

| Bridge | Scope | Metric | Covered / total | % | Ratchet floor | Enforced by |
|---|---|---|---|---|---|---|
| Android | `BrazePlugin.kt` (all its classes; `R` / `BuildConfig` / `Manifest` excluded) | Lines | 600 / 668 | **89.82** | 89 | `:capacitor-braze:jacocoCoverageVerification` in `verify-android` |
| Android | same | Branches | 433 / 567 | **76.37** | 76 | same |
| Android | same | Methods (info) | 84 / 88 | 95.45 | — | — |
| iOS | `ios/Sources/BrazePlugin/*.swift` | Lines | 1481 / 1551 | **95.49** | 95 | `node scripts/ios-coverage-gate.mjs` in `verify-ios` |
| iOS | same | Functions | 140 / 155 | **90.32** | 90 | same |
| iOS | `BrazePlugin.swift` (info) | Lines | 1308 / 1338 | 97.76 | — | — |
| iOS | `BrazeIAMDelegate.swift` (info) | Lines | 173 / 213 | 81.22 | — | — |

The floors are the measured values rounded down to the whole percent — the same ratchet rule as
the web thresholds: raise them when coverage improves, never lower them to make a run pass. They
live in `android/build.gradle` (`jacocoCoverageVerification`) and at the top of
`scripts/ios-coverage-gate.mjs`. `xccov` reports no branch coverage for Swift, so iOS gates lines and
functions instead.

### How to run

```bash
# Android — from demo/android, after `npm run build` at the root and `npx cap sync android` in demo/.
./gradlew :capacitor-braze:testDebugUnitTest \
          :capacitor-braze:jacocoTestReport \
          :capacitor-braze:jacocoCoverageVerification --no-daemon
# HTML + XML: android/build/reports/jacoco/jacocoTestReport/

# iOS — from demo/ios/App, after `ruby scripts/ios-add-test-target.rb` and `pod install`.
xcodebuild test -workspace App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
  -enableCodeCoverage YES -resultBundlePath /tmp/tests.xcresult CODE_SIGNING_ALLOWED=NO
node ../../../scripts/ios-coverage-gate.mjs /tmp/tests.xcresult   # add --out <dir> for the raw report
```

CI uploads both reports as artifacts: `android-coverage` (JaCoCo XML + HTML) from `verify-android`
and `ios-coverage` (raw `xccov` JSON + a per-file summary) from `verify-ios`. The iOS gate also
writes its summary to the job's step summary.

**Instrumentation details that are easy to undo by accident.**

- **Android:** Robolectric loads the classes under test through its own sandbox class loader, which
  JaCoCo treats as having "no location" and skips — so `includeNoLocationClasses = true` on the test
  task is what makes the report non-empty (`jdk.internal.*` is excluded, as JaCoCo on JDK 11+
  requires). The report reads the Kotlin classes from `build/tmp/kotlin-classes/debug`.
- **iOS:** the committed shared scheme sets `codeCoverageEnabled` (generated by
  `scripts/ios-add-test-target.rb`), and CI passes `-enableCodeCoverage YES` as well. The scheme
  deliberately does **not** use `onlyGenerateCoverageForSpecifiedTargets`: the plugin's target lives
  in the CocoaPods-generated, gitignored `Pods.xcodeproj`, and pinning a committed scheme to that
  project's UUID would silently turn coverage off whenever CocoaPods re-derived it. The gate filters
  by source path instead, and **fails if any `.swift` file in `ios/Sources/BrazePlugin/` is missing
  from the report** — so instrumentation that stops reaching the plugin turns CI red rather than
  passing on an empty set. Both failure modes (floor breached, file missing) were confirmed red
  before the gate was trusted.

### What the numbers say

**Android** enters every one of the 35 `@PluginMethod`s. The uncovered lines are the
`handleOnResume` / `handleOnPause` lifecycle hooks (Capacitor calls them; the tests do not), the
in-app-message display callback that needs a live trigger (the `inAppMessageReceived` gap below),
part of `warnIfNotBrazeCluster`, and the lambda the `deepLinkHandling: 'app'` handler hands the SDK.

**iOS** now enters every one of the 35 `@objc` methods too. The first measurement (58.54% lines)
found twenty never entered by any XCTest — `echo`, `getUserId`, `setSdkAuthenticationSignature`,
`setPhoneNumber`, `setFirstName`, `setLastName`, `setLanguage`, `setCountry`, `setDateOfBirth`,
`setGender`, `setHomeCity`, `addAlias`, `getDeviceId`, `getFeatureFlag`, `getAllFeatureFlags`,
`logFeatureFlagImpression`, `getContentCards`, `logContentCardClick`, `logContentCardImpression`,
`isDisabled` — because the unit tier tested the *helpers* those methods call rather than driving a
`CAPPluginCall` through each. Two files close that, both on the existing integration harness:

- `BrazePluginBridgeContractTests.swift` (18) — the iOS twin of Android's contract sweep: every
  rejection branch of every method asserted byte-for-byte against `src/web.ts`, a table-driven
  init-guard sweep over all 29 guarded methods (cross-checked against `pluginMethods`, so a new method
  cannot slip past it), and the C07 quartet before `initialize` — including a pre-init `disableSDK`
  landing on the instance `initialize` then creates.
- `BrazePluginMethodWireTests.swift` (10) — the wire and the SDK state behind each of the twenty:
  `first_name` / `last_name` / `phone` / `country` / `language` / `home_city`, `dob`, all six
  `gender` codes, the `uae` alias event, `getUserId` null → id across `changeUser`, `getDeviceId`
  stable and equal to the wire's `device_id`, a rotated SDK-Authentication signature on later
  requests, `getAllFeatureFlags` / `getFeatureFlag` (all six property tags) / the `ffi` impression,
  and `getContentCards` / the `cci` impression / the `ccc` click against a served sync. `isDisabled`
  is read on both sides of each toggle in the existing `disableSDK` wire test.

What is left uncovered on iOS is unreachable or out of scope: `enablePushAutomation`'s wiring (it
asks the simulator for notification authorization), the "invalid date components" branch
(`Calendar` rolls any in-range day over rather than failing), the unknown-feature-flag-property and
`@unknown default` card branches (no such value exists at the pinned BrazeKit), and in
`BrazeIAMDelegate.swift` the *rendering* presenter's delivery path and some serializer variants.

The sweep also found a **real iOS bug** — see `setDateOfBirth` under "Remaining gaps" below.

### Native coverage — what the unit tiers cover

[C11](./mdcs/C11-NATIVE-TEST-HARNESSES.md)'s unit tiers landed in `0.2.0` and run in CI. On Android,
91 Robolectric tests cover every `@PluginMethod` validation branch byte-exact against `src/web.ts`,
an init-guard sweep over all 29 guarded methods, and every serializer against real Braze model
objects parsed from Braze's own wire JSON. On iOS, 37 XCTests cover the attribute-value classifier
(including the `0`/`1`-as-boolean regression), `dataFromHex` for `registerPushToken`, the C04 error
strings, extras stringification, the `sdkAuthError` payload, and every content-card variant; the 18
bridge-contract tests above add the per-method rejection and init-guard sweep. The iOS `enableSDK` / `isDisabled`
asymmetry this table used to list is gone — the plugin now tracks that state itself.

### Native coverage — what the integration tier adds

C11's **integration tier** is no longer design-only. 17 tests on Android and 27 on iOS drive the plugin's own
bridge code into the real Braze SDK and assert the bytes that reached a real local HTTP server:
MockWebServer under Robolectric on Android, an in-process `NWListener` on loopback on iOS. Counts are
now **108 Android** and **82 iOS**, none skipped.

Every listener event is now delivered end to end on **both** natives — server envelope → the SDK's
own parser (and, for in-app messages, its trigger engine) → the plugin's subscriber → the payload a
consumer's listener receives: `featureFlagsUpdated`, `contentCardsUpdated`, `sdkAuthError`, and
`inAppMessageReceived` (a session-start slide-up and a custom-event modal with buttons). Each of the
new iOS assertions was confirmed red against a bridge with its `notifyListeners` call removed, and
the Android in-app-message pair likewise.

This is the tier that makes cross-platform *wire* consistency assertable rather than merely DTO
consistency. Both platforms are asserted against the same envelopes the TypeScript mock serves the
web bridge, and the vocabulary they pin is identical: `events[].name = "ce"` with `data.n` for a
custom event, `"p"` with `{pid, c, p, q}` for a purchase, `"sgu"` with `{group_id, status}` for a
subscription-group change, `attributes[]` for profile fields, `X-Braze-Auth-Signature` for the SDK
Authentication JWT.

Two divergences the DTO-level tiers could not have surfaced, both now pinned in the tests:

- **`changeUser` looks different on the wire.** Android sends `attributes[].user_id`; BrazeKit
  instead stamps `respond_with.user_id` and every `events[]` entry.
- **The server-config envelope is not portable.** BrazeKit decodes a data response as a strict
  `Codable`, so its `config` block needs members Android ignores entirely — the three `*_blacklist`
  arrays among them. A `config` of just `{"time": N}` fails the *whole* response and silently leaves
  Feature Flags and Content Cards disabled.
- **BrazeKit is strict about every other body too.** A Content Cards sync needs
  `last_full_sync_at` / `last_card_updated_at`; every card needs fifteen keys and a *composite* id
  (base64 of `<campaign>_$_cc=<uuid>&mv=<variation>&pi=cmp`); an in-app message needs
  `message_close`, `orientation` and `use_webview`; a trigger needs a composite id. Android accepts
  all of these and ignores the extras, so the two tiers now share one set of envelopes. Each
  requirement is recorded on its fixture in `BrazeWireHarness.swift`.
- **SDK-Authentication errors arrive differently.** Android and web surface an `auth_error` member;
  BrazeKit 18.2.1 surfaces `optional_auth_error` and never hands `auth_error` to its delegate at any
  status tried (200, 400, 401, 403). The iOS test uses the envelope BrazeKit reports.

Two things that looked like SDK behaviour turned out to be the iOS **harness**, and are fixed:
every listener it registered was inert (a bare `BrazePlugin()` has a nil `eventListeners`, so
`addEventListener` stored nothing), and retried refreshes drained BrazeKit's persisted request-token
bucket, after which the SDK scheduled its next request up to an hour out. `BrazeWire.serverConfig`
now raises the bucket through `global_request_rate_limit`.

### Remaining gaps

| Surface | What's untested today | Plan |
|---|---|---|
| **iOS `setDateOfBirth` shifts the day west of UTC** (bug, not a coverage gap) | The bridge builds the date at *UTC* midnight; BrazeKit formats the calendar day in the device's *local* zone. In `America/Los_Angeles`, `setDateOfBirth(1990, 7, 4)` puts `1990-07-03T00:00:00Z` on the wire — every user west of UTC gets a birthday one day early. Android and web send the 4th in every zone. `BrazePluginMethodWireTests` pins it with a strict `XCTExpectFailure`, time zone forced both ways so the result does not follow the machine | Fix in `ios/Sources/BrazePlugin/BrazePlugin.swift` (build the `Date` in the calendar BrazeKit formats with), then delete the `XCTExpectFailure` wrapper — the strict expectation fails the test the moment the bridge is fixed |
| **iOS** `sdkAuthError` from a *required*-mode (`auth_error`) response | The delivery path is covered via `optional_auth_error`, the envelope BrazeKit 18.2.1 demonstrably reports. What a real backend sends in *required* mode, and whether BrazeKit reports it through the same delegate, is not reproducible from a mock | A Layer 4 smoke capture with SDK Authentication set to *required* |

## Is this enough to ship?

For the **web bridge**, yes: all 35 methods and every validation branch are covered, and as of
`0.2.0` the assertions are on the wire output rather than on "did not throw" — the 2026-09 audit
found eleven tests that would have survived their implementation being replaced with `return;`.

For the **native bridges**, the translation layer, the HTTP and every listener event are covered:
the integration tier drives the real SDKs against a local server, asserts the wire, and asserts the
payload each listener receives from the SDK's own parse. The table above is the honest remainder.

For **anything against a real Braze backend**, no: the Layer 4 smoke has never been run, for `0.1.0`
or `0.2.0`. That is stated in the README, the CHANGELOG, C08's bump protocol and
`REVIEW_READINESS.md` §7.

## Next moves

1. **Layer 4 smoke** (maintainer, ~2–3 hrs). Walk [`SMOKE-TEST-PLAYBOOK.md`](./SMOKE-TEST-PLAYBOOK.md)
   against a Braze trial; capture templates are pre-staged in [`smoke-tests/`](./smoke-tests/).
   Nothing in this repo has ever been run against a live Braze backend. It is also what would
   settle the one iOS envelope still inferred rather than captured — a *required*-mode SDK
   Authentication failure: capture the real response, replay it in the harness.
2. **Fix iOS `setDateOfBirth` west of UTC** (see "Remaining gaps"). The test that pins the bug is
   already in place and flips red when the fix lands.

~~Drive the 20 un-entered iOS bridge methods from XCTest~~ — **done**: every one of the 35 is entered
through a real `CAPPluginCall`, and the iOS floors rose from 58 / 51 to 95 / 90.

With (1), the plugin reaches "every method has at least one end-to-end behavioral test on the
platform it runs on." That is the bar this doc tracks against, and the integration tier closes most
of the distance.
