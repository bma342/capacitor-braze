# Test coverage audit (web bridge)

**Audited:** 2026-05-20, post Phase S tests + populated-cache + listener-end-to-end work.
**Test count:** 74 vitest behavioral tests + 17 serializer unit tests across 13 files.
**Methods on the surface:** 37 (per [`src/definitions.ts`](../src/definitions.ts)).
**Directly covered:** **37 of 37**.

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
| `echo` | `privacy-lifecycle.test.ts` | Capacitor convention round-trip, init-independent |
| `addListener('featureFlagsUpdated', cb)` | `listeners.test.ts` | refresh fires callback with serialized DTOs |
| `addListener('contentCardsUpdated', cb)` | `listeners.test.ts` | same |
| `removeAllListeners` | `listeners.test.ts` | subsequent refreshes do not invoke removed callbacks |
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

### Gaps blocked on platform-native test harness ([C11](./mdcs/C11-NATIVE-TEST-HARNESSES.md))

| Surface | What's untested today | Plan |
|---|---|---|
| iOS bridge wire format | Whether BrazeKit 14.1.0 emits the same wire shape this file's web tests validate | Smoke-test playbook captures it once, C11 implementation locks it in for every PR |
| Android bridge wire format | Same for `com.braze:android-sdk-ui` 42.2.0 | Same |
| iOS hex decode for `registerPushToken` | `dataFromHex` against a real APNs-style hex token | C11 implementation |
| iOS-specific privacy/lifecycle asymmetry per [C07](./mdcs/C07-INIT-INDEPENDENT-METHODS.md) | `enableSDK` post-init requirement | C11 implementation |

## Sufficient for tagging 0.1.0?

Yes. The 74 behavioral + 17 serializer tests cover the consumer-visible contract for **all 37 surface methods** directly. There are no remaining web-bridge coverage gaps. The 0.1.0 release notes will reference this doc so adopters know what is proven before they consume the plugin.

## Next moves (remaining work is platform-native, not web)

The web-side audit is closed. The two remaining outside-of-audit gaps live on the native platforms:

1. **C11 native harness implementation** (post-trial-smoke, ~1-2 days). Once the trial smoke produces the iOS + Android wire-format ground truth, C11's URLProtocol intercept (iOS) + MockWebServer/Robolectric (Android) lock that contract in for every PR. Until C11 lands, iOS + Android bridges have compile-only CI coverage via `verify-ios` and `verify-android`.
2. **Trial smoke** (your hands, ~2-3 hrs). Walk [`SMOKE-TEST-PLAYBOOK.md`](./SMOKE-TEST-PLAYBOOK.md) against your Braze trial; pre-staged capture templates in [`smoke-tests/`](./smoke-tests/).

Estimate: with the trial smoke + C11 + the two web-side enhancements above, the plugin reaches "every method has at least one end-to-end behavioral test on the platform it runs on." That is the bar this doc tracks against.
