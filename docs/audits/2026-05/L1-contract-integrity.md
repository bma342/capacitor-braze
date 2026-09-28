# L1 — Contract integrity

## Verdict
**PASS** for 0.1.0
**GAP** for senior-dev review

## Summary
The 8-file lockstep holds: every one of the 35 standalone method names appears in `src/definitions.ts`, `src/web.ts`, `ios/Plugin/BrazePlugin.swift` (+ `BrazePlugin.m` registration), and `android/.../BrazePlugin.kt`, with matching parameter names. Two `addListener` overloads (`featureFlagsUpdated`, `contentCardsUpdated`) plus the inherited `removeAllListeners` round the surface out. Cross-platform parity on names + arity is clean; the real gaps are init-guard JSDoc lies and an inflated listener count in the audit prompt.

## Method inventory

### TypeScript interface (`src/definitions.ts`)
35 standalone methods + 2 `addListener(...)` overloads + `removeAllListeners()`. Standalone methods (lines reflect signature start):

`echo:532`, `initialize:551`, `changeUser:567`, `getUserId:576`, `setSdkAuthenticationSignature:592`, `setEmail:608`, `setPhoneNumber:615`, `setFirstName:622`, `setLastName:629`, `setLanguage:636`, `setCountry:643`, `setCustomUserAttribute:659`, `addToSubscriptionGroup:671`, `removeFromSubscriptionGroup:679`, `addAlias:693`, `getDeviceId:710`, `setDateOfBirth:725`, `setGender:734`, `setHomeCity:742`, `logCustomEvent:757`, `logPurchase:777`, `getFeatureFlag:792`, `getAllFeatureFlags:800`, `refreshFeatureFlags:814`, `logFeatureFlagImpression:823`, `getContentCards:840`, `requestContentCardsRefresh:852`, `logContentCardClick:862`, `logContentCardImpression:872`, `registerPushToken:907`, `wipeData:993`, `disableSDK:1008`, `enableSDK:1020`, `isDisabled:1031`, `requestImmediateDataFlush:1047`.

Listener overloads: `addListener('featureFlagsUpdated', ...)` at `931`, `addListener('contentCardsUpdated', ...)` at `950`, `removeAllListeners()` at `964`.

### Android `@PluginMethod` (`android/src/main/java/com/bma342/braze/BrazePlugin.kt`)
35 `@PluginMethod`-annotated functions. Names match TS one-for-one.

### iOS `@objc func` (`ios/Plugin/BrazePlugin.swift`)
35 `@objc` functions. Names match TS one-for-one. The Obj-C registration in `ios/Plugin/BrazePlugin.m` declares all 35 `CAP_PLUGIN_METHOD(...)` entries.

### Web (`src/web.ts`)
35 `async` methods on `BrazeWeb` implementing `BrazePlugin`. Names match.

### Parity matrix
All 35 standalone method names are present on all four implementations. No drift.

Listener events emitted via `notifyListeners`:
- `featureFlagsUpdated` — emitted from `src/web.ts:129`, `ios/Plugin/BrazePlugin.swift:124`, `android/.../BrazePlugin.kt:174`.
- `contentCardsUpdated` — emitted from `src/web.ts:135`, `ios/Plugin/BrazePlugin.swift:132`, `android/.../BrazePlugin.kt:181`.

Two events total, six emission points across three platforms.

### Re. the audit prompt's "36 TS / 35 native / 8 listeners" framing
The prompt undercounts TS (declaration count is 38 = 35 + 2 addListener overloads + removeAllListeners; the distinct method-name count is 36 if you collapse addListener overloads, 37 if you count `removeAllListeners`). And it overcounts listeners — there are 2 events, not 8. Worth reconciling so the survey numbers downstream don't propagate.

## Findings

| ID | Severity | File:Line | Issue | Fix |
|----|----------|-----------|-------|-----|
| L1-01 | BLOCKER | src/definitions.ts:704 | `getDeviceId` JSDoc claims `Init-independent: safe to call before {@link BrazePlugin.initialize}`. Both native bridges call `requireInitialized(call)` (`android:394`, `ios:293`) and `docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md:42` explicitly states "`getDeviceId` is NOT init-independent today". Calling getDeviceId before initialize on iOS or Android rejects; the JSDoc lies. | Remove the "Init-independent" sentence from the JSDoc — C07 already documents the correct behavior. |
| L1-02 | MAJOR | src/definitions.ts:1014 (enableSDK) and src/definitions.ts:1025 (isDisabled) | Both JSDoc blocks say "Init-independent: safe to call before initialize". On iOS BrazeKit 14.x there is no class-level `enableSDK`/`isDisabled`, so the iOS bridge gates `enableSDK` with `requireInitialized(call)` (`ios:697`) and `isDisabled` returns `false` pre-init (`ios:706`). C07 §"Per-platform init-independence asymmetry" acknowledges this but the public contract still promises uniform init-independence. A consumer following the JSDoc and calling `enableSDK` before `initialize` on iOS gets the standard "initialize() must be called" reject — silent on iOS only. | Either downgrade the JSDoc to "Init-independent on Web/Android only; iOS requires initialize" (the honest contract) or restrict the published contract to the most restrictive platform per C03 discipline. |
| L1-03 | MAJOR | docs/mdcs/C05-LISTENERS.md vs implementation | Audit prompt expected "8 listeners" — there are 2 listener events (`featureFlagsUpdated`, `contentCardsUpdated`). The MDC roadmap calls for sdk-auth errors, in-app message events, push events, etc. that are not yet implemented. Distinct from contract integrity, but a senior reviewer will ask. | Either ship the additional listener events for 0.1.0 or update the audit baseline. The contract is internally consistent today. |
| L1-04 | MINOR | src/definitions.ts:931, 950 + native bridges | Listener overloads only exist in TS — there is no per-event registration code in either native bridge beyond the always-on subscription set up at `initialize`. This is intentional (C05's "one native subscription per event, all JS listeners share via notifyListeners") but it means a consumer can `addListener('contentCardsUpdated', ...)` BEFORE `initialize` and get a JS-side handle that never fires. Capacitor's base `addListener` resolves immediately; nothing rejects. | Document this in the listener JSDoc — "Listener fires only after `initialize` has run; the handle is silently inert until then." |
| L1-05 | NIT | example/index.html | 38 method buttons. Lines up with 35 methods + featureFlags listener + contentCards listener + removeAllListeners = 38. Good. |
| L1-06 | NIT | All four bridges | Parameter naming is uniform: every `call.getString("userId")`, `call.getString("groupId")`, etc. matches the TS field name verbatim. Quick spot-check across iOS/Android shows identical field keys. |

## What's good
- All 35 method names present in all four files with matching parameter keys.
- Obj-C `CAP_PLUGIN_METHOD` registration (`ios/Plugin/BrazePlugin.m`) is complete; no Swift `@objc` method is missing its companion macro.
- Each method follows the C01 error format `Braze.<methodName>: \`<field>\` is required (<type>).` consistently across iOS and Android.
- Listener wiring follows C05: eager subscription at `initialize`, retained handle (iOS `Braze.Cancellable?`, Android `IEventSubscriber<…>?`, Web boolean guard), teardown in `wipeData` on iOS/Android. Defensive `teardownXxxSubscription()` on Android before re-subscribe avoids duplicate fan-out.
- Both events emit through `notifyListeners` on all three platforms.

## What's risky
- Init-independence is the most fragile contract surface. Three methods (`getDeviceId`, `enableSDK`, `isDisabled`) advertise it but don't actually have it on iOS. A consumer who reads only the JSDoc and skips C07 will write broken code on iOS.
- The audit baseline ("8 listeners") suggests roadmap drift between MDCs and what's actually shipped. Senior review will spot the mismatch.
- No native test harness exists yet (per C11 "impl pending"). The lockstep holds today, but a refactor of one bridge could silently break the others — Web Jest tests don't catch native drift.
