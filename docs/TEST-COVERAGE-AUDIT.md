# Test coverage audit (web bridge)

**Audited:** 2026-05-20, post Phase S tests + populated-cache work landing.
**Test count:** 71 vitest behavioral tests + 17 serializer unit tests across 12 files.
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

Yes. The 71 behavioral + 17 serializer tests cover the consumer-visible contract for **35 of 37 methods** directly. The two uncovered (`echo`, `addListener`/`removeAllListeners`) are listed above as known gaps with clear unblocking paths. Neither is privacy-critical or load-bearing for a quick-start consumer's first hour with the plugin.

The 0.1.0 release notes will reference this doc so adopters know exactly what is and isn't proven before they consume the plugin.

## Next moves to close remaining gaps

1. **SDK event injection helper** (~half day): a small test helper that drives the underlying `@braze/web-sdk` subscription system from inside vitest, so listener lifecycle (`addListener` / `removeAllListeners`) becomes assertable end-to-end.
2. ~~**Wire-level event-capture for impression methods**~~ ✅ done 2026-05-20: `logFeatureFlagImpression` POSTs `ffi`, `logContentCardClick` POSTs `ccc`, `logContentCardImpression` POSTs `cci`. All three asserted via the populated-cache tests.
3. **C11 native harness implementation** (post-trial-smoke, ~1-2 days): described in the MDC.

Estimate: with the trial smoke + C11 + the two web-side enhancements above, the plugin reaches "every method has at least one end-to-end behavioral test on the platform it runs on." That is the bar this doc tracks against.
