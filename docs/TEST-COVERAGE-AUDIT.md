# Test coverage audit (web bridge)

> The **percentages below are measured**, not asserted: `npm run test:coverage` (from `test/web`)
> instruments `src/web.ts` with `@vitest/coverage-v8` and fails the run if coverage drops. The
> **per-method table** further down is still maintained by hand — it answers "does this method have
> a behavioral test at all", which a line percentage cannot. Re-derive it when the suite changes.

**Audited:** 2026-09-22 (`0.2.0`).
**Web test count:** **206 tests across 18 files, ~3.5s** (`npm test`).
**Native:** 74 Robolectric/JUnit (`android/src/test/`) + 26 XCTest (`ios/PluginTests/`), both in CI.
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
| `addListener('contentCardsUpdated', cb)` | `listeners.test.ts`, `lifecycle.test.ts` | same, plus the re-`initialize` config gate (both branches) |
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

**`contentCardsUpdated` after a second `initialize`** — three tests in
[`lifecycle.test.ts`](../test/web/src/lifecycle.test.ts). The behaviour reproduces, but the earlier
diagnosis ("the SDK does not publish to a fresh subscriber") was wrong: the subscription is fine,
and the same listener fires once the gate opens. The real cause is a race against the Web SDK's
server-config memoization. `initialize` reads `ab.storage.serverConfig` exactly once, synchronously;
the plugin's re-init path destroys the previous SDK instance first (it must, or the SDK would keep
the original API key and base URL). If the first cycle's `/api/v3/data/` response has not landed by
then, the fresh config manager memoizes empty defaults — `content_cards.enabled: false` — and the
response lands on the destroyed manager. `requestContentCardsRefresh()` then sends no sync POST at
all and parks on the config-change subscription; the promise still resolves. Any later data round
trip repairs it. Feature flags are gated identically; in-app messages and `sdkAuthError` are not
config-gated and are unaffected. The tests pin both branches — settled re-init works, mid-flight
re-init is gated until a data round trip — and the mock's new `delayMs` makes the race deterministic
rather than timing-dependent.

### Native coverage — what the unit tiers now cover

[C11](./mdcs/C11-NATIVE-TEST-HARNESSES.md)'s unit tiers landed in `0.2.0` and run in CI. On Android,
74 Robolectric tests cover every `@PluginMethod` validation branch byte-exact against `src/web.ts`,
an init-guard sweep over all 29 guarded methods, and every serializer against real Braze model
objects parsed from Braze's own wire JSON. On iOS, 26 XCTests cover the attribute-value classifier
(including the `0`/`1`-as-boolean regression), `dataFromHex` for `registerPushToken`, the C04 error
strings, extras stringification, and the `sdkAuthError` payload. The iOS `enableSDK` / `isDisabled`
asymmetry this table used to list is gone — the plugin now tracks that state itself.

### Remaining gaps

| Surface | What's untested today | Plan |
|---|---|---|
| iOS / Android bridge **wire format** | Whether BrazeKit 18.2.1 and `com.braze:android-sdk-ui` 43.2.0 emit the same HTTP this file's web tests validate. The native tiers assert the bridge's *translation* against SDK model objects, not the bytes the SDK then sends | C11's integration tier (URLProtocol / MockWebServer), still design-only. The Layer 4 smoke would capture the ground truth to write it against |
| Coverage percentages on the **native** bridges | Android and iOS have no instrumentation; only the web bridge is measured | JaCoCo on the Robolectric tier and `xcodebuild -enableCodeCoverage` on the XCTest tier are both a config change away |
| `inAppMessageReceived` delivery on **iOS / Android** | Closed on web (below). The native serializers are covered against real SDK message classes, but neither native tier drives a real trigger through the SDK's trigger engine | C11's integration tier, or a Layer 4 smoke capture |

## Is this enough to ship?

For the **web bridge**, yes: all 35 methods and every validation branch are covered, and as of
`0.2.0` the assertions are on the wire output rather than on "did not throw" — the 2026-09 audit
found eleven tests that would have survived their implementation being replaced with `return;`.

For the **native bridges**, the translation layer is covered and the HTTP is not.

For **anything against a real Braze backend**, no: the Layer 4 smoke has never been run, for `0.1.0`
or `0.2.0`. That is stated in the README, the CHANGELOG, C08's bump protocol and
`REVIEW_READINESS.md` §7.

## Next moves

1. **C11's integration tier** — URLProtocol intercept on iOS, MockWebServer on Android, asserting
   real HTTP rather than DTO shape. Still design-only, and deliberately so: writing it well needs
   captured ground truth from a real Braze backend to assert against, which is what the smoke run
   would produce. The unit tiers (74 + 26) already lock in the bridge translation on every PR.
2. **Layer 4 smoke** (maintainer, ~2–3 hrs). Walk [`SMOKE-TEST-PLAYBOOK.md`](./SMOKE-TEST-PLAYBOOK.md)
   against a Braze trial; capture templates are pre-staged in [`smoke-tests/`](./smoke-tests/).
   Nothing in this repo has ever been run against a live Braze backend.
3. **Native coverage instrumentation** — JaCoCo on the Robolectric tier, `-enableCodeCoverage` on the XCTest tier. The web bridge is instrumented and ratcheted as of `0.2.0`; the natives are not.

With (1) and (2), the plugin reaches "every method has at least one end-to-end behavioral test on
the platform it runs on." That is the bar this doc tracks against, and it is not met yet.
