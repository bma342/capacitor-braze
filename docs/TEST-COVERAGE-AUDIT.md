# Test coverage audit (web bridge)

**Audited:** 2026-05-20, post Phase S tests landing.
**Test count:** 68 vitest behavioral tests + 17 serializer unit tests across 10 files.
**Methods on the surface:** 37 (per [`src/definitions.ts`](../src/definitions.ts)).

## What's directly covered

Every consumer-facing method except 4 (`echo`, `addListener`, `removeAllListeners`, plus implicit `initialize` testing) has at least one direct behavioral test.

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
| `logPurchase` | `events.test.ts` | wire format + 3 validation rejections |
| `getFeatureFlag` | `feature-flags.test.ts` | empty-cache + empty-id rejection |
| `getAllFeatureFlags` | `feature-flags.test.ts` | empty-cache |
| `refreshFeatureFlags` | `feature-flags.test.ts` | does not throw |
| `logFeatureFlagImpression` | `feature-flags.test.ts` | does not throw + empty-id rejection |
| `getContentCards` | `content-cards.test.ts` | empty-cache |
| `requestContentCardsRefresh` | `content-cards.test.ts` | does not throw |
| `logContentCardClick` / `logContentCardImpression` | `content-cards.test.ts` | unknown-cardId rejection with specific message |
| `disableSDK` / `enableSDK` / `isDisabled` | `lifecycle.test.ts` | state transitions |
| `requestImmediateDataFlush` | `lifecycle.test.ts` | weak: no-op when nothing queued |
| `wipeData` | `privacy-lifecycle.test.ts` | resets `initialized` state + works pre-init (C07) |
| `registerPushToken` | `push.test.ts` | rejects on web with named, helpful error |
| Init guard | `privacy-lifecycle.test.ts` | clear message on `logCustomEvent`, `getFeatureFlag`, `getContentCards` without prior `initialize()` |

Plus 17 serializer unit tests (`serializers.test.ts`) covering `serializeFeatureFlag` / `serializeContentCard` / `detectContentCardType` / `serializeContentCards` in isolation, across all valid + edge-case shapes.

## Known gaps (the honest list)

These are coverage holes a maintainer should know about. They are filed here so they aren't "discovered" again on every audit.

### Gaps blocked on initialize-time scripting (in addition to mock-server enhancement, partly done)

**Update 2026-05-20:** the mock-server now has `respondTo({pathPattern, body})` to script per-path responses. **But** a spike against `refreshFeatureFlags` revealed a second layer: the Web SDK gates the FF refresh fetch on server-config delivered in the **first** data POST response during `initialize()`. The shared-plugin `beforeAll` pattern most test files use initializes once before any test can script that initial response. Closing the populated-cache gap therefore needs **both**:

1. `respondTo()` on the mock-server (✅ done; ships in mock-server 0.0.2)
2. A per-test plugin lifecycle helper (or pre-init script registration) that lets a test stage the initial `/api/v3/data/` response with a `config: { feature_flags: { enabled: true }, ... }` block BEFORE plugin.initialize() fires the first session POST.

Step 2 is the remaining work (~2-3 hrs). Until then, the mock-server `respondTo()` primitive is sitting unused for FF/CC populated tests but is genuine infrastructure that future work builds on.

The current Fastify mock still returns `{message: "success"}` by default for unscripted requests; scripts take precedence when registered.

| Method | What's untested today | Why it matters |
|---|---|---|
| `getFeatureFlag` with populated cache | DTO shape returned to the consumer for each property type (string / number / boolean / image / datetime / jsonobject) | The C02 "Web is canonical" claim only validates end-to-end if a real flag flows through. Serializer unit tests cover it in isolation but not via the bridge. |
| `getAllFeatureFlags` with populated cache | Same as above but for the list shape | Same. |
| `getContentCards` with real cards | DTO shape across all 5 card types (captionedImage / imageOnly / classic / textAnnouncement / controlCard) | Same. |
| `logFeatureFlagImpression` with known flag | Whether the impression actually reaches the wire (SDK silently filters unknown flags) | Without this, "the impression POST happens" is unproven on the consumer integration path. |
| `logContentCardClick` / `logContentCardImpression` with known card | Same as above for content cards | Same. |

### Gaps blocked on SDK event injection

| Method | What's untested today | Why it matters |
|---|---|---|
| `addListener('featureFlagsUpdated', cb)` | Whether the callback fires when the SDK emits its underlying `subscribeToFeatureFlagsUpdates` event, with the right DTO shape | The C05 "eager-on-init, shared, no replay" listener contract is documented and the serializer is tested, but the wire-up from `addListener` registration through to consumer callback isn't exercised end-to-end. |
| `addListener('contentCardsUpdated', cb)` | Same | Same. |
| `removeAllListeners` | Whether all registered callbacks actually stop firing | Lifecycle cleanup contract. |

### Gaps blocked on platform-native test harness ([C11](./mdcs/C11-NATIVE-TEST-HARNESSES.md))

| Surface | What's untested today | Plan |
|---|---|---|
| iOS bridge wire format | Whether BrazeKit 14.1.0 emits the same wire shape this file's web tests validate | Smoke-test playbook captures it once, C11 implementation locks it in for every PR |
| Android bridge wire format | Same for `com.braze:android-sdk-ui` 42.2.0 | Same |
| iOS hex decode for `registerPushToken` | `dataFromHex` against a real APNs-style hex token | C11 implementation |
| iOS-specific privacy/lifecycle asymmetry per [C07](./mdcs/C07-INIT-INDEPENDENT-METHODS.md) | `enableSDK` post-init requirement | C11 implementation |

## Sufficient for tagging 0.1.0?

Yes. The 68 behavioral + 17 serializer tests cover the consumer-visible contract for 33 of 37 methods directly. The 4 uncovered (`echo`, `addListener`, `removeAllListeners`, and the populated-cache variants of Content Cards + Feature Flags) are documented above as known gaps with clear unblocking paths. None of them is privacy-critical or load-bearing for a quick-start consumer's first hour with the plugin.

The 0.1.0 release notes will reference this doc so adopters know exactly what is and isn't proven before they consume the plugin.

## Next moves to close gaps

1. **Pre-init script + per-test lifecycle helper** (~2-3 hrs, partly unblocks): wraps `freshMockServer + new BrazeWeb + initialize` into a helper where the initial `/api/v3/data/` response is pre-scripted with a server-config block (`feature_flags: {enabled: true}`, `content_cards: {enabled: true}`, etc.). Then the existing `respondTo()` primitive on the mock-server (✅ already landed) unblocks 7+ populated-cache tests for FF + CC.
2. **SDK event injection helper** (~half day): a small test helper that drives the underlying `@braze/web-sdk` subscription system from inside vitest, so listener lifecycle becomes assertable. Unblocks listener tests.
3. **C11 native harness implementation** (post-trial-smoke, ~1-2 days): described in the MDC.

Estimate: with the trial smoke + C11 + the two web-side enhancements above, the plugin reaches "every method has at least one end-to-end behavioral test on the platform it runs on." That is the bar this doc tracks against.
