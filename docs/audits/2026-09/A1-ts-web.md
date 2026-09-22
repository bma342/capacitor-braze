> **Archived audit report — read the resolution table first.**
> Point-in-time review of `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated 2026-09-22.
> The findings below were current *then*. The table immediately after this banner records what
> happened to each one in `0.2.0`. Where the report and the current code disagree, the code wins.
> Index of audits: [`../README.md`](../README.md).

## Resolution status

| ID | Status in 0.2.0 | Note |
|---|---|---|
| A1-01 | fixed | `initialize` checks the Web SDK's boolean and rejects with a specific message when it declines. |
| A1-02 | fixed | `openSession()` now runs after all four subscriptions. |
| A1-03 | fixed | Subscription GUIDs replace the four booleans; `teardownSubscriptions()` runs on re-init, `wipeData`, `disableSDK`, `enableSDK`. |
| A1-04 | fixed | `getDeviceId` goes through `requireInitialized()`. This is the finding 0.1.0 claimed to have closed as L1-01 but had only documented. |
| A1-05 | fixed | Both now clear `initialized` and the SDK-auth state, matching the SDK's own `destroy()`. |
| A1-06 | documented | Pre-`initialize` `wipeData()` genuinely cannot wipe on web (no storage manager yet). Stated in the JSDoc and in [C07](../../mdcs/C07-INIT-INDEPENDENT-METHODS.md) rather than papered over. |
| A1-07 | documented | The iOS "disables the SDK for the app run" behaviour is now in the `wipeData` JSDoc, C07 and the README. |
| A1-08 | fixed | Property validation on all three platforms with one shared error string. |
| A1-09 | fixed | See [A2-02](./A2-ios.md); `CFGetTypeID` discrimination on iOS. |
| A1-10 | **partly fixed** — the contract change is still deferred | Every SDK return value is still discarded, so `setEmail('nonsense')` resolves. **Web and Android** now emit one non-PII warning — `Braze.<method>: the Braze SDK rejected the value (see SDK logs)`, byte-identical on both — where the earlier note had this backwards. **iOS reports nothing**, because BrazeKit 18.2.1's setters return `Void`; that is why turning a rejection into a promise rejection would still break cross-platform parity. Deferred as a contract change and listed in the README's *Known gaps*. |
| A1-11 | fixed | Web gained the `echo` / `setGender` validators; iOS and Android moved to web's canonical HTTPS, card-not-found and `getDeviceId` strings. The Android `requireUser` `currentUser` wording is retained as a sanctioned exception, documented in [C04](../../mdcs/C04-VALIDATION.md). |
| A1-12 | fixed | Warning matches on the parsed hostname (so `:443` no longer misfires) and never interpolates the endpoint. |
| A1-13 | fixed | Feature-flag properties, `jsonobject` values, card `extras` and IAM `extras` are all copied. |
| A1-14 | fixed | `aspectRatio` on classic cards, `null` where the SDK has none. |
| A1-15 | fixed | Button `useWebView` derives from the message's `openTarget`. |
| A1-16 | fixed | Unknown IAM variants and unclassifiable cards are dropped with one non-PII warning; nothing is reshaped. |
| A1-17 | fixed | `requestImmediateDataFlush` resolves on the callback and rejects on reported failure; both refresh methods warn on error. |
| A1-18 | fixed | A second `initialize` tears down and re-initializes. |
| A1-19 | fixed | The underlying error is reported and attached as `cause`. |
| A1-20 | **fixed** | Originally closed as JSDoc stating that `allowUserSuppliedJavascript` was deliberately not exposed. It is now exposed: `initialize({ allowUserSuppliedJavascript })`, default `false`, web-only, and it is what makes the `html` variant reachable on web at all. iOS and Android ignore it — neither SDK has a counterpart. See [A4-03](./A4-security.md). |
| A1-21 | fixed | The IIFE build and the `unpkg` field were **removed**. The package ships ESM + CJS only. |
| A1-22 | fixed | Peer floor `^6.13.0` (a security floor) and the example/demo lockfiles were regenerated, so CI genuinely exercises 6.13.0. |
| A1-23 | fixed | Structural casts removed from the IAM serializers; `WEB_GENDER_MAP` is typed so `setGender` needs no cast. |
| A1-24 | fixed | The garbled and stale JSDoc blocks were rewritten. |
| A1-25 | partly fixed | `sdkAuthError.userId` is `null` for anonymous. `BrazeContentCardBase.id` deliberately keeps `''`: making it nullable would break `logContentCardClick({ cardId: card.id })` for every consumer, and `''` trips the existing required-field guard, which is the right outcome for a card that cannot be logged. Rationale is in the JSDoc. |
| A1-26 | resolved by documentation | C01 and C06 disagreed about echoing a rejected `gender` value. [C06](../../mdcs/C06-SECURITY-DEFAULTS.md) now carries an explicit closed-enum exemption: a value drawn from a fixed, non-secret enum may be echoed because it is the only way to make the error actionable. C01's string is unchanged on all three platforms. |
| A1-27 | documented | `?brazeLogging=true` in the page URL re-enables Web SDK logging regardless of `enableLogging: false`. The plugin cannot close it; it is now stated in `SECURITY.md` §8 and the README. |

---

# A1 — TypeScript contract + web implementation audit

**Scope:** `src/definitions.ts` (1273 lines), `src/web.ts` (1000 lines), `src/index.ts`, checked against
`@braze/web-sdk` **6.7.1** (installed; `node_modules/@braze/web-sdk/package.json`) and its `index.d.ts` +
shipped `src/*.js`, plus cross-checks into `ios/Plugin/BrazePlugin.swift` and
`android/src/main/java/com/bma342/braze/BrazePlugin.kt` where the TS contract makes a platform claim.
Contracts read first: `CLAUDE.md`, MDC C01–C07. Prior audit (`findings/`, May 2026) treated as a claim.

Everything below was verified against the actual code or the actual SDK source in `node_modules`, not from
memory of Braze's docs. Where a finding depends on runtime composition I could not execute, the confidence
is marked accordingly.

---

## A1-01 — `initialize()` discards the SDK's success/failure return and reports success unconditionally

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:136-146`

```ts
braze.initialize(options.apiKey, { baseUrl: options.endpoint, ... });
braze.openSession();
this.initialized = true;
```

`@braze/web-sdk` types this as `initialize(apiKey, options): boolean`, documented (index.d.ts:2186) as
*"Whether or not the braze instance has been successfully initialized. Reasons for returning false include a
missing API key/base URL, user opt out, and ignored crawler bot activity."* The shipped implementation
(`src/managers/braze-instance.js`) returns `false` for: non-string/empty API key, non-string/empty `baseUrl`,
and crawler user-agents; it also returns `true` early with only an info log when the SDK was already
initialized.

The plugin ignores that boolean and sets `this.initialized = true` regardless. Two downstream consequences,
both silent:

1. Every `braze.subscribeTo*` call immediately after is gated on `r.rr()` (`isInitialized && !crawler`) and
   returns `undefined` without subscribing — but the plugin still flips `featureFlagsSubscribed`,
   `contentCardsSubscribed`, `inAppMessageSubscribed`, `sdkAuthErrorSubscribed` to `true`, so the
   subscriptions are never retried (see A1-03). All four listener events are dead for the page lifetime.
2. `requireInitialized()` passes, so the first user-attribute call reaches `requireUser()` →
   `braze.getUser()` returns `undefined` (`Core/get-user.js` returns nothing when `rr()` is false) → the
   consumer gets *"Braze: `getUser()` returned null. This should not happen post-init; file an issue at
   github…"* for what is actually their own bad API key.

**Why a reviewer cares:** the plugin's entire init-guard story rests on `this.initialized` being truthful.
This is the one place the SDK hands you ground truth and it is thrown away.

**Fix:** `const ok = braze.initialize(...); if (!ok) throw new Error('Braze.initialize: the Braze Web SDK
refused to initialize (check \`apiKey\` and \`endpoint\`; crawler user-agents are ignored by design).');`
6.x also exposes `braze.isInitialized()` (index.d.ts:2749) as a second assertion point.

---

## A1-02 — `openSession()` is called *before* the four subscriptions, contrary to explicit SDK guidance

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:144` (openSession) vs `:151-191` (all four `subscribeTo*` calls)

The Web SDK is unambiguous in three separate doc blocks:

- `openSession` (index.d.ts:2399): *"Be sure to call `openSession` at the end of your initialization code
  section, after any calls to `changeUser` or subscribing to Content Cards, In-App Message, and Feature Flag
  updates."* and *"Content Cards are refreshed automatically if the `subscribeToContentCardsUpdates` has been
  registered prior to `openSession`."*
- `subscribeToInAppMessage` (index.d.ts:2570): *"This method should be called before calling `openSession`."*
- `subscribeToFeatureFlagsUpdates` (index.d.ts:2650): *"This method should be called before calling
  `openSession`."*

The plugin does the exact opposite. Confirmed consequences in the shipped SDK source:

- `ContentCards/subscribe-to-content-cards-updates.js` registers the **new-session refresh hook** at
  subscribe time (`o.rn(() => t.lr(undefined, undefined, true))`). Subscribing after `openSession` means the
  session that was just opened never triggers a content-card fetch, so `getContentCards()` returns the stale
  cache until the consumer explicitly calls `requestContentCardsRefresh()` or a new session starts.
- `triggers/triggers-provider.js:156` drops a triggered in-app message outright when there is no subscriber
  at fire time: `0 === this.Rs.Le() ? E.info("Not displaying trigger … because neither
  automaticallyShowInAppMessages() nor subscribeToInAppMessage() were called")`. Any session-start IAM that
  resolves from cache inside `openSession()` is discarded before the plugin subscribes one line later.

**Fix:** move `braze.openSession()` to the end of `initialize`, after all four subscription blocks. One-line
change; it is also what the SDK's own README snippet does.

---

## A1-03 — The whole web listener lifecycle rests on a false premise; both re-init paths are broken

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:83-110` (the four boolean guards), `:151-191` (subscribe), `:464-497` (wipeData /
disableSDK / enableSDK); also `docs/mdcs/C05-LISTENERS.md` "Web bridge — guard-once-per-page-lifetime".

The code and the MDC both assert:

```ts
/** … The Braze Web SDK does not return an unsubscribe handle from `subscribeToFeatureFlagsUpdates`
 *  (the API is fire-and-forget) … */
private featureFlagsSubscribed = false;
```

That is factually wrong. All four subscribe functions return the subscription GUID
(`subscribeToFeatureFlagsUpdates`, `subscribeToContentCardsUpdates`, `subscribeToInAppMessage`,
`subscribeToSdkAuthenticationFailures` are each declared `(…): string | undefined`), and the module exports
`removeSubscription(subscriptionGuid)` (index.d.ts:2454) and `removeAllSubscriptions()` (index.d.ts:2446).
Web has exactly the same teardown capability iOS (`Braze.Cancellable`) and Android
(`removeSingleSubscription`) have; the bridge just never used it.

Because the design is built on that false premise, both lifecycle transitions are wrong — in opposite
directions:

**(a) `wipeData()` → `initialize()` stacks duplicate subscriptions.** `wipeData` resets all four booleans
(`web.ts:478-481`) with the comment *"without resetting these flags the next initialize would skip
subscription setup and listeners would silently go dead."* But `Core/wipe-data.js` only calls `clearData()`
on the storage adapters and providers — `FeatureFlags/feature-flags-provider.js:199 clearData() { this.Y(); }`
clears cached flags, never the subscriber map (`managers/subscription-manager.js` `this.In`). The SDK
subscriptions survive, so re-initialising adds a second one. Every `featureFlagsUpdated` /
`contentCardsUpdated` / `inAppMessageReceived` then fires `notifyListeners` **twice** (N times after N
wipe/init cycles) — precisely what C05 lists under "Forbidden: stacked subscribers will fan out
notifyListeners N times per event." Worse, `ContentCards/content-cards-provider.js:325 clearData()` publishes
an empty `ContentCards` to subscribers synchronously, so the duplicate path is exercised on the very next
wipe.

**(b) `disableSDK()` / `enableSDK()` → `initialize()` leaves the listeners permanently dead.** Both
`Core/disable-sdk.js` and `Core/enable-sdk.js` end with `r.destroy(false)`, and
`managers/braze-instance.js:245-268 destroy()` calls `removeAllSubscriptions()` and destroys every registered
provider. All SDK-side subscriptions are gone — but the plugin's four booleans are **not** reset on
disable/enable (only on `wipeData`), so the next `initialize()` skips every subscribe block. Feature-flag,
content-card, IAM and SDK-auth events never fire again, and because there is no IAM subscriber, in-app
messages stop being displayed entirely (same `Rs.Le() === 0` drop path as A1-02). A consent toggle
(disable → enable → re-init) is a normal GDPR flow, and it silently kills messaging.

**Fix:** store the four GUIDs instead of booleans; `removeSubscription(guid)` in `wipeData`, `disableSDK` and
`enableSDK`; re-subscribe unconditionally in `initialize` after tearing down any retained GUIDs — i.e. the
same "defensive teardown before re-subscribe" shape the Android bridge already uses
(`teardownFeatureFlagsSubscription()`). Update C05's Web column, which currently documents the wrong SDK
capability.

---

## A1-04 — `getDeviceId` skips the init guard on web while the JSDoc promises it on all three platforms

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:320-330`; contract at `src/definitions.ts:869-883`

```ts
async getDeviceId(): Promise<BrazeGetDeviceIdResult> {
  const braze = await this.loadSdk();          // <- not requireInitialized()
  const deviceId = braze.getDeviceId();
```

The JSDoc says the opposite, in so many words:

> *"Requires `initialize` to have been called. The accessor is instance-bound on iOS … and Android … only Web
> exposes a true static. **To keep the contract uniform across platforms (see C03 / C07) the plugin gates this
> method behind the init guard on all three.**"*

Both native bridges do gate it (`ios/Plugin/BrazePlugin.swift:415 guard let braze = Self.requireInitialized(call)`,
`android/.../BrazePlugin.kt:642 if (!requireInitialized(call)) return`). Web does not — it returns a device id
pre-init where iOS/Android reject. C07's "Why `getDeviceId` is init-dependent" section exists solely to
forbid this.

Note for the reviewer's trust model: this is the *residual half* of prior finding **L1-01**
(`findings/L1-contract-integrity.md:44`), which was closed by rewriting the JSDoc rather than by adding the
guard. The doc now claims a behaviour the code still doesn't have.

**Fix:** `const braze = this.requireInitialized();` and drop the bespoke "SDK has not generated a device ID
yet" branch down to a parity-matched message (see A1-11).

---

## A1-05 — `disableSDK()` / `enableSDK()` leave `initialized = true` although the SDK instance is destroyed; `enableSDK`'s JSDoc is false

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:484-492`; contract at `src/definitions.ts:1228-1242`

```ts
async disableSDK(): Promise<void> { const braze = await this.loadSdk(); braze.disableSDK(); }
async enableSDK(): Promise<void>  { const braze = await this.loadSdk(); braze.enableSDK(); }
```

Both SDK functions end in `r.destroy(false)` (`Core/disable-sdk.js`, `Core/enable-sdk.js`), which sets
`isInitialized = false`, nulls the user manager and removes all subscriptions. The SDK's own doc on
`enableSDK` (index.d.ts:2496) states: *"You must call `initialize` after calling this method before calling
subsequent methods."*

Plugin state is now a lie: `this.initialized` stays `true`, so `requireInitialized()` passes and
`requireUser()` hits `braze.getUser() === undefined` → the consumer is told *"This should not happen
post-init; file an issue at https://github.com/bma342/capacitor-braze/issues"* after making a perfectly legal
`disableSDK()` call. Expect bogus issues on day 2.

The contract also states *"No-op if the SDK was not previously disabled"* for `enableSDK`. It is never a
no-op on web — it always destroys the instance.

**Fix:** set `this.initialized = false` (and the sdk-auth + subscription state, per A1-03) in both methods;
change the `enableSDK` JSDoc to state that web/iOS require a subsequent `initialize()`.

---

## A1-06 — `wipeData()` is a silent no-op on web before `initialize`, though it is sold as the pre-init GDPR erasure path

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:464-482`; contract at `src/definitions.ts:1188-1211` (*"Init-independent: safe to call
before initialize"*); C07 table (*"Web: init-independent (class-level `braze.wipeData()`)"*).

`Core/wipe-data.js`:

```js
export function wipeData() {
  const o = r.p();
  if (null == o) return void E.warn(R.ee);   // no storage manager => warn and return
  o.clearData(); …
}
```

`r.p()` returns the storage manager, which only exists after `initialize`. Pre-init, `wipeData()` logs a
console warning and wipes nothing — and the plugin resolves the promise successfully. C07 grounds this
method's init-independence in GDPR Art. 17 / CCPA §1798.105 ("`wipeData()` must work then"); on web it
doesn't, and the caller gets no signal.

The existing test does not catch this because it only asserts the promise settles:
`test/web/src/privacy-lifecycle.test.ts:54 await expect(plugin.wipeData()).resolves.toBeUndefined();`

**Fix:** either load-and-initialize-then-wipe, or reject/warn explicitly pre-init and document the real
per-platform matrix in the `wipeData` JSDoc. At minimum, correct C07's Web row and strengthen the test to
assert the localStorage/IndexedDB keys are actually gone.

---

## A1-07 — `wipeData`'s iOS "disables the SDK for the rest of the app run" behaviour is absent from the TS contract

**Severity:** MAJOR **Confidence:** high
**File:** `src/definitions.ts:1188-1211`; behaviour at `ios/Plugin/BrazePlugin.swift:920-942`

```swift
} else {
    // Pre-init: fall back to the class-level wipe that also
    // disables the SDK for the rest of this app run.
    Braze.wipeDataAndDisableForAppRun()
}
```

A consumer who calls `wipeData()` before `initialize()` on iOS (the exact consent-revocation flow C07 exists
to enable) gets an SDK that no-ops until the app is relaunched — a subsequent `initialize()` does nothing.
The plugin's own `CLAUDE.md` lists this under "Things that look like bugs but aren't", and the Swift file
comments it, but `definitions.ts` — the contract consumers actually read — says only *"Init-independent: safe
to call before initialize."*

C03 names this exact failure mode under **Forbidden**: *"Per-platform JSDoc lies. If iOS does something
different from Web … document it in the central JSDoc on the TS method, not as a comment on the iOS bridge
only."*

**Fix:** add a "Platform behavior" block to the `wipeData` JSDoc covering iOS (pre-init wipe disables for the
app run; re-init requires relaunch) and web (pre-init is a no-op, per A1-06).

---

## A1-08 — Event / purchase property values are validated on no platform, and silently dropped on one

**Severity:** MAJOR **Confidence:** high
**File:** `src/web.ts:365-371` and `:448-454`; contract at `src/definitions.ts:247-262`

```ts
braze.logCustomEvent(options.name, options.properties);
braze.logPurchase(options.productId, options.price, options.currency, options.quantity, options.properties);
```

The contract narrows properties to scalars — `export type BrazeEventPropertyValue = string | number |
boolean;` — but nothing enforces it at any boundary, and each platform behaves differently for a consumer
whose properties came from `any`-typed code or `JSON.parse`:

| Platform | Nested object / array / `null` property value |
|---|---|
| Web | forwarded verbatim; the SDK accepts nested objects, so it **works** |
| iOS | `call.getObject("properties") as? [String: Any]` forwarded verbatim; works |
| Android | **silently dropped** — `jsObjectToBrazeProperties` (`BrazePlugin.kt:1297-1315`) has a `when` over String/Int/Long/Double/Float/Boolean with **no `else` branch** |

So the same call ships full properties on web/iOS and a property-stripped event on Android, with no error
anywhere. This is the failure mode C04 was written to prevent ("Letting Braze reject the bad input" /
"Skipping validation on a native bridge"), and the team already solved the identical problem correctly for
`setCustomUserAttribute` (`web.ts:278-281` plus byte-identical native checks) — the same treatment was simply
never applied to event/purchase properties.

**Fix:** add a `validateProperties(props, method)` helper in `web.ts` rejecting non-scalar values with
`Braze.<method>: \`properties.<key>\` must be string, number, or boolean.`, and mirror it in both bridges
(Android's `when` needs an `else -> { call.reject(...) }`).

---

## A1-09 — iOS turns the numbers `0` and `1` into booleans in `setCustomUserAttribute`, contradicting `BrazeAttributeValue`'s JSDoc

**Severity:** MAJOR **Confidence:** medium (needs an iOS runtime check — flagging for the iOS auditor)
**File:** contract at `src/definitions.ts:156-180`; behaviour at `ios/Plugin/BrazePlugin.swift:346-366`

The contract promises: *"a fractional value (e.g. 42.5) lands on the Double overload, a whole-number value
lands on the Int / Long overload."* The iOS dispatch order is `getBool` → `getString` → `getDouble`/`getInt`,
and Capacitor's implementation is a plain bridged cast
(`node_modules/@capacitor/ios/Capacitor/Capacitor/JSTypes.swift:141`):

```swift
public func getBool(_ key: String) -> Bool? { return jsObjectRepresentation[key] as? Bool }
```

Swift's `NSNumber as? Bool` succeeds for an `NSNumber` holding exactly `0` or `1`, so
`setCustomUserAttribute({ key: 'lifetime_orders', value: 1 })` plausibly lands as boolean `true` on iOS while
it is the number `1` on web and Android — a dashboard type divergence on the most-called SDK method. Note
C04's "Type-coercion quirks" section explicitly chose `getBool`-first to avoid the *inverse* hazard
(`true` read as `1`) without considering this direction.

**Fix (if confirmed):** inspect the raw value instead of relying on the cast ladder — e.g. branch on
`call.getValue("value")` and test `CFGetTypeID(v as CFTypeRef) == CFBooleanGetTypeID()` before the numeric
overloads. Worth a dedicated XCTest once C11's harness lands.

---

## A1-10 — Every Braze Web SDK return value is discarded; rejected calls resolve as success

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:208, 237-262, 282, 292-298, 313, 339, 353, 370, 400, 408, 429, 435, 441, 453, 501`

Nearly every method the plugin calls returns a "was this accepted?" boolean that the bridge throws away:
`changeUser` returns void but silently no-ops for a >997-byte userId (`Core/change-user.js`),
`logCustomEvent`/`logPurchase`/`logContentCardClick`/`logContentCardImpressions` return `boolean`,
`logFeatureFlagImpression` returns `boolean | undefined`, and every `User.set*` returns `boolean`
(*"Whether the update was successfully enqueued"*). All of them return `false` for Braze-side validation
failures (name begins with `$`, over-length strings, RFC-5322 email failure, unsupported currency code) that
the plugin does **not** duplicate.

Result: `await Braze.setEmail({ email: 'not-an-email' })` resolves successfully and the attribute is never
sent. C04's "Forbidden" section says the consumer must not be left to discover this at the Braze backend;
here they can't discover it at all.

**Fix:** treat `false` as an error at the web boundary —
`if (!braze.logCustomEvent(name, props)) throw new Error('Braze.logCustomEvent: the Braze SDK rejected the
event (check name/property constraints; enable \`enableLogging\` for the SDK's reason).')` — or, at minimum,
document in each JSDoc that resolution means "handed to the SDK", not "accepted".

---

## A1-11 — Error-string parity: 4 divergent strings + 2 validators missing on web (C04 requires byte-identical)

**Severity:** MINOR **Confidence:** high

Full table of every distinct error string in `src/web.ts` versus the two native bridges (verified with
`grep -F` against each file; template-literal helpers `requireGroupId` / `requireContentCardById` resolve to
the same text at runtime and are matched manually):

| # | web.ts | Error text (after the `Braze.` prefix) | iOS | Android |
|---|---|---|---|---|
| 1 | 201 | ``changeUser: `userId` is required (string).`` | ✅ | ✅ |
| 2 | 204 | ``changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.`` | ✅ | ✅ |
| 3 | 222 | ``setSdkAuthenticationSignature: `signature` is required (string).`` | ✅ | ✅ |
| 4 | 271 | ``setCustomUserAttribute: `key` is required (string).`` | ✅ | ✅ |
| 5 | 280 | ``setCustomUserAttribute: `value` must be string, number, or boolean.`` | ✅ | ✅ |
| 6 | 308/311 | ``addAlias: `alias` / `label` is required (string).`` | ✅ | ✅ |
| 7 | 324 | ``getDeviceId: SDK has not generated a device ID yet. Call `initialize` first or wait until the SDK has finished bootstrapping.`` | ❌ **absent** | ⚠️ **truncated** (`…yet.` only) |
| 8 | 346 | ``setGender: unknown gender "<v>". Allowed: male, female, …`` | ✅ | ✅ |
| 9 | 368 | ``logCustomEvent: `name` is required (string).`` | ✅ | ✅ |
| 10 | 386 | ``getFeatureFlag: `id` is required (string).`` | ✅ | ✅ |
| 11 | 406 | ``logFeatureFlagImpression: `id` is required (string).`` | ✅ | ✅ |
| 12 | 517 | ``registerPushToken is not supported on web…`` | n/a by design (C03) | n/a |
| 13 | 535 | `initialize() must be called before any other Braze method.` | ✅ | ✅ |
| 14 | 551 | ``Braze: `getUser()` returned null. This should not happen post-init; file an issue…`` | n/a | ⚠️ **`currentUser` instead of `getUser()`** |
| 15 | 568 | `capacitor-braze: @braze/web-sdk peer dependency is not installed…` | n/a | n/a |
| 16 | 584 | ``<method>: `groupId` is required (string).`` | ✅ | ✅ |
| 17 | 595/598/601 | ``setDateOfBirth: `year`/`month`/`day` must be an integer between …`` | ✅ | ✅ |
| 18 | 905 | ``<method>: `cardId` is required (string).`` | ✅ | ✅ |
| 19 | 910 | ``<method>: no cached content card with id "<id>". Call getContentCards() to verify the id, or wait for the next refresh.`` | ⚠️ **truncated** (first sentence only) | ✅ |
| 20 | 924/927/930/934 | ``logPurchase: `productId`/`currency`/`price`/`quantity` …`` | ✅ | ✅ |
| 21 | 946/949 | ``initialize: `apiKey` / `endpoint` is required (string).`` | ✅ | ✅ |
| 22 | 955 | ``initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` only for local mock-server testing. See SECURITY.md §4.`` | ⚠️ **missing `See SECURITY.md §4.`** | ⚠️ **missing `See SECURITY.md §4.`** |
| 23 | 971 | ``initialize: `endpoint` is malformed …`` | ✅ | ✅ |
| 24 | 996 | ``initialize: `sessionTimeoutInSeconds` must be a positive integer.`` | ✅ | ✅ |
| — | — | ``echo: `value` is required (string).`` | ✅ (`swift:102`) | ✅ (`kt:289`) | **missing on web** |
| — | — | ``setGender: `gender` is required (string).`` | ✅ (`swift:463`) | ✅ (`kt:699`) | **missing on web** — an `undefined` gender yields `unknown gender "undefined"` instead |

Row 22 is the one to fix first: **C06 §2 explicitly asserts "All three messages reference `SECURITY.md §4`"**
— they don't; only web does. Rows 7/14/19 are one-line native edits. The two missing web validators are
one-line additions (`echo` also has no init guard by design, so it is pure input validation).

---

## A1-12 — `console.warn` interpolates the endpoint, which C06 lists as not-loggable; cluster regex misfires on `host:port`

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:978-993`

```ts
console.warn(
  `Braze.initialize: \`endpoint\` "${options.endpoint}" doesn't match the documented ` + …
```

C06 §3's "What's safe to log" list reads: *"SDK initialization milestones (**without `apiKey`, without
`endpoint`**)"*. This is the plugin's only `console.*` call and it logs the endpoint. Low real-world impact
(the endpoint isn't PII), but it is a direct, greppable contradiction of the MDC the file claims to follow,
and it lands in whatever console aggregator the consumer runs.

Secondary defect in the same block: the host is derived as `parseTarget.replace(/^https?:\/\//,'').split('/')[0]`,
which keeps the port, while `isKnownBraze = /^sdk\.[a-z]+-\d+\.braze\.(com|eu)$/` has no port allowance. A
perfectly valid `https://sdk.us-01.braze.com:443` triggers the "doesn't match the documented Braze cluster
pattern" warning.

**Fix:** log the *shape* (`"…\`endpoint\` host doesn't match the documented Braze cluster pattern…"`) with no
interpolation, and strip the port via `new URL(parseTarget).hostname` (already parsed on the line above).

---

## A1-13 — "not a live reference into the SDK's cache" is only half true

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:605-639` (JSDoc + `serializeFeatureFlag`), `:676-683` (`serializeContentCard` base)

```ts
/** … so we shallow-copy entries through unchanged … so the public object isn't a
 *  live reference into the SDK's cache. */
properties[key] = entry as BrazeFeatureFlagPropertyValue;   // same object identity
```

Only the containing map is new; each `{ type, value }` entry — and, for `jsonobject`, its nested value — is
the SDK's own object. Same for content cards: `extras: card.extras` (`web.ts:680`) hands out the SDK's live
`Record<string, string>`. On web there is no Capacitor JSON hop, so a consumer who mutates
`card.extras.foo` or `flag.properties.x.value` mutates the SDK's cache — and gets different behaviour from
iOS/Android, where the bridge serialises. C02's whole premise is one DTO shape with one set of semantics.

**Fix:** `structuredClone` / spread the entries (`properties[key] = { ...entry }`, `extras: { ...card.extras }`),
or correct the JSDoc to say the objects are live SDK references on web only.

---

## A1-14 — `BrazeClassicContentCard` drops `aspectRatio`, which the SDK's `ClassicCard` carries

**Severity:** MINOR **Confidence:** high
**File:** `src/definitions.ts:370-382`, serializer at `src/web.ts:728-738`

`@braze/web-sdk`'s `ClassicCard` declares `aspectRatio: number | null` (index.d.ts, ClassicCard block) exactly
as `CaptionedImage` and `ImageOnly` do. The plugin surfaces `aspectRatio` on `captionedImage` and `imageOnly`
but not on `classic`, and the serializer never reads it. C02 rule 2: *"Declare the TS interface … matching the
Web SDK shape exactly."*

**Fix:** add `aspectRatio: number | null` to `BrazeClassicContentCard` and emit `cc.aspectRatio ?? null`;
mirror on both native bridges (Android/iOS classic cards).

---

## A1-15 — In-app message **button** click actions always report `useWebView: true`

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:853-857` feeding `:882-893`

```ts
clickAction: this.serializeIamClickAction(btn as unknown as BrazeWebSdkModule.InAppMessage),
…
const useWebView = m.openTarget !== 'BLANK';
```

`InAppMessageButton` (index.d.ts:1458+) declares `text`, `clickAction`, `uri`, `id`, and colors — there is
**no `openTarget` on a button**; only the message classes have it. So `m.openTarget` is always `undefined`
for buttons and `useWebView` is hard-coded `true`, regardless of how the dashboard configured the message's
open target. A consumer who honours `useWebView` (which the JSDoc at `definitions.ts:471-477` tells them to)
will open every button URL in-app even when the campaign says "new tab".

**Fix:** pass the parent message's `openTarget` down when serializing buttons —
`serializeIamClickAction({ ...btn, openTarget: immersive.openTarget })`, or give the helper an explicit
`openTarget` parameter (and drop the misleading `as unknown as InAppMessage` cast while you're there — the
helper takes `unknown`).

---

## A1-16 — Unknown variants: IAMs are fabricated as empty slide-ups, content cards vanish without a trace

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:826-829` (IAM fallback) vs `:756-774` + `:651-653` (card fallback)

```ts
// Unknown subclass — surface as a slideup with empty fields so the contract stays a strict union.
return { ...base, type: 'slideup', message: message.message ?? '', slideFrom: 'bottom' };
```

Two problems, and they are inconsistent with each other:

- The IAM path **invents** a variant. C02's Forbidden list opens with *"Inventing tag names not in the Web SDK…
  drop it."* A consumer switching on `message.type === 'slideup'` renders a blank banner for, say, a future
  Braze message class.
- The content-card path does the opposite — `classifyContentCard` returns `null` and `serializeContentCards`
  filters it out (`.filter((card): card is BrazeContentCard => card !== null)`), so unclassifiable cards
  disappear from `getContentCards()` with no warning, while the JSDoc says *"Returns **all** content cards
  currently cached"*. This also silently swallows the realistic dual-module-instance case (consumer bundles
  its own `@braze/web-sdk` copy → `instanceof braze.ClassicCard` is false for every card).

**Fix:** pick one policy for both (drop-with-diagnostic is the safer one), surface a non-PII
`console.warn('Braze: dropped an unrecognized <content card|in-app message> variant')`, and state the policy
in the DTO JSDoc.

---

## A1-17 — Refresh / flush methods discard the SDK's success and error callbacks

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:398-401`, `:427-430`, `:499-502`; contract at `src/definitions.ts:975-987`, `:1015-1025`, `:1258-1272`

`refreshFeatureFlags(successCallback?, errorCallback?)`, `requestContentCardsRefresh(successCallback?,
errorCallback?)` and `requestImmediateDataFlush(callback?: (success: boolean) => void)` all take completion
callbacks; the plugin passes none. For the two refreshes that is documented as deliberate ("Fire-and-forget"),
but the **error** callback is dropped too, so a failed refresh is indistinguishable from a successful one.

`requestImmediateDataFlush` is the weaker case: its JSDoc says *"Forces an immediate flush of any queued
events"* and pitches it for *"Layer 4 smoke testing where you want events to appear in the dashboard
immediately"* and *"edge cases where app may be killed before the next batch"* — both of which require
awaiting actual completion. The promise resolves before the network round-trip.

**Fix:** wrap `requestImmediateDataFlush` in a promise resolving on the SDK callback (and reject on
`success === false`); at minimum add "resolves once dispatched, not once flushed" to its JSDoc the way the two
refresh methods already do.

---

## A1-18 — A second `initialize()` silently does nothing on web, while the plugin reports success

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:132-192`; contract at `src/definitions.ts:708-721`

`managers/braze-instance.js` `initialize()` opens with
`if (this.ao()) return E.info("Braze has already been initialized with an API key."), !0;` and the SDK's own
doc (index.d.ts:2180) says *"Subsequent calls will be ignored until `destroy` is called."*

So a consumer switching brands/workspaces at runtime (`initialize({ apiKey: B })` after
`initialize({ apiKey: A })`) — a realistic multi-tenant case, and exactly the Aromo BYO-credential pattern
named in `CLAUDE.md` — keeps talking to workspace A, with a resolved promise and no warning. The plugin also
re-affirms `sdkAuthenticationEnabled` from the ignored options, so the enforcement flag and the SDK's actual
config can disagree.

**Fix:** either call `braze.destroy()` before re-initialising when `this.initialized` is already true (the
SDK's supported path), or throw `Braze.initialize: already initialized; call wipeData() … before
re-initializing.` Document whichever you pick in the `initialize` JSDoc.

---

## A1-19 — `loadSdk()` reports every import failure as a missing peer dependency

**Severity:** MINOR **Confidence:** high
**File:** `src/web.ts:563-575`

```ts
} catch (err) {
  throw new Error('capacitor-braze: `@braze/web-sdk` peer dependency is not installed. Run `npm install …`');
}
```

`err` is captured and thrown away. Any failure inside the module's evaluation (a CSP violation on the chunk, a
bundler interop error, an SSR/Node context with no `document` — the SDK touches `document` and `navigator` at
init) is reported to the consumer as "not installed", sending them down the wrong debugging path.

**Fix:** `throw new Error('…', { cause: err })` (ES2022; or append `String(err)`), and ideally distinguish
`ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND` from other failures.

---

## A1-20 — The `html` in-app-message variant is unreachable on web, and its JSDoc points at an option the plugin doesn't expose

**Severity:** MINOR **Confidence:** high
**File:** `src/definitions.ts:555-563`; `BrazeInitializeOptions` at `:22-59`

> *"Custom HTML rendered inside a WebView. `message` is the raw HTML; the Braze SDK already sandboxes the
> WebView (no JS bridge unless `allowUserSuppliedJavascript: true` was set at init — see SECURITY.md §6)."*

`allowUserSuppliedJavascript` is a real `InitializationOptions` field, documented as: *"By default, the Braze
Web SDK does not allow user-supplied Javascript click actions, **or enable HTML in-app messages** and
Banners."* The plugin neither exposes nor sets it, so on web `HtmlMessage` is never produced — the
`BrazeHtmlInAppMessage` union member is dead on the platform whose class hierarchy the union is modelled on.
The JSDoc reads as if the consumer has a knob that this plugin does not give them.

This is a *safe* default (C06-aligned), so the finding is the documentation and the dead union member, not the
security posture.

**Fix:** state "HTML in-app messages are disabled on web by default and this plugin does not expose
`allowUserSuppliedJavascript`; the `html` variant only occurs on iOS/Android" in the variant's JSDoc, or add
the option with a default of `false` and a SECURITY.md §6 cross-reference.

---

## A1-21 — The `unpkg` (IIFE) build ships a bare `await import('@braze/web-sdk')` that no browser can resolve

**Severity:** MINOR **Confidence:** high
**File:** `rollup.config.mjs` (`external: [..., '@braze/web-sdk']`, `format: 'iife'`) → `dist/plugin.js:455`

```js
this.braze = await import('@braze/web-sdk');
```

`package.json` advertises `"unpkg": "dist/plugin.js"`. A `<script src="…/dist/plugin.js">` consumer (the whole
point of an IIFE/global build) hits `TypeError: Failed to resolve module specifier "@braze/web-sdk"` the first
time any Braze method runs — bare specifiers are unresolvable without an import map. The CJS build
(`dist/plugin.cjs.js`, the `main` entry) has the same line but survives because bundlers/Node handle it.

**Fix:** either drop the `unpkg` entry (the plugin is not usable standalone in a script tag anyway), or emit a
global-lookup fallback (`globalThis.braze`) for the IIFE build.

---

## A1-22 — Peer range is `^6.0.0`, CI only ever exercises 6.7.1

**Severity:** MINOR **Confidence:** high
**File:** `package.json` peerDependencies; `package-lock.json:62-67`; `.github/workflows/test.yml` (`npm ci`)

`@braze/web-sdk` is a peer dep with no dev-dependency pin; npm auto-installs it and the lockfile freezes
**6.7.1** (`"peer": true`). CI uses `npm ci` everywhere, so every type-check and every one of the 108
behavioural tests runs against 6.7.1 while consumers on `^6.0.0` resolve to 6.13.x today. Six minor versions
of `instanceof`-based DTO classification, `PropertiesJson` tags and new card/message classes are unverified —
and A1-16 shows the failure mode is silent dropping, not a loud error.

C08 pins the native SDKs exactly *"because range pins make Layer 4 smoke flaky and CI non-reproducible"*; the
same argument applies here and is not being honoured on the one platform CI actually tests.

**Fix:** add a CI matrix leg that installs the latest `6.x` (`npm install @braze/web-sdk@^6 --no-save`) before
`npm run build && npm test`, or state the tested floor/ceiling in README + C08.

---

## A1-23 — Structural casts defeat compile-time detection of SDK drift

**Severity:** NIT **Confidence:** high
**File:** `src/web.ts:804-809`, `:846-852`, `:353`, `:856`, `:860`

```ts
const slideup = message as BrazeWebSdkModule.SlideUpMessage & {
  imageUrl?: string; altImageText?: string; language?: string; slideFrom?: string;
};
```

Every field in that intersection already exists on `SlideUpMessage` (and on `ModalMessage`/`FullScreenMessage`
for the `serializeImmersiveIam` equivalent) with *narrower* types — `slideFrom` is the literal union
`'TOP' | 'BOTTOM'`, and the cast widens it to `string`. The effect is that if Braze renames or removes a field
in a 6.x minor, the property silently becomes `undefined` at runtime instead of failing `tsc`. For a bridge
whose entire value proposition is "we track the SDK so you don't", that's the wrong trade.

Related, smaller:
- `web.ts:353` — `code as unknown as Parameters<typeof user.setGender>[0]` is avoidable: typing
  `WEB_GENDER_MAP` as `Readonly<Record<BrazeGender, 'm'|'f'|'o'|'u'|'n'|'p'>>` instead of
  `Record<BrazeGender, string>` makes it assignable to the SDK's `Genders` union with no cast at all.
- `web.ts:856` — `btn as unknown as BrazeWebSdkModule.InAppMessage` on a value that is neither; the callee's
  parameter is `unknown`, so the cast is pure noise that obscures A1-15.
- `web.ts:844-860` — `serializeImmersiveIam` takes a `braze` parameter it never uses and discards it with
  `void braze; // kept for symmetry`. Delete the parameter.

**Fix:** delete the structural intersections and read the typed fields directly; fix the narrow types above.

---

## A1-24 — Stale and garbled JSDoc a consumer would act on

**Severity:** NIT **Confidence:** high

- `src/definitions.ts:975-987` — `refreshFeatureFlags`: *"the subscribe-to-updates listener API will land in a
  later version."* It shipped: `addListener('featureFlagsUpdated', …)` is declared 120 lines below in the same
  file. A consumer polling with `setTimeout` because of this sentence is writing worse code than the plugin
  supports.
- `src/definitions.ts:178` — ``/** Attribute value. Use `setCustomUserAttribute` to remove via wipeData. */``
  is not a sentence that parses; it appears to be a merge of two different notes, and it contradicts
  `:169-172` (which correctly says use a wipe/clear flow).
- `src/definitions.ts:1173-1182` — `removeAllListeners`: *"Underlying native subscriptions stay alive (managed
  by the plugin) so adding a listener again after `removeAllListeners` works without an `initialize` cycle."*
  True today on web, but it is exactly the claim A1-03's fix will change; keep them in sync.
- `setGender` / `setDateOfBirth` accept no null although the SDK supports clearing
  (`setGender(gender: Genders | null)`, `setDateOfBirth(null, null, null)`), while every other standard setter
  documents `null` as "clear". Worth an explicit "cannot be cleared in v0.1" note so the asymmetry reads as
  deliberate.

---

## A1-25 — Empty-string sentinels on the public contract, which C03 forbids

**Severity:** NIT **Confidence:** high
**File:** `src/web.ts:184` (`userId: error.userId ?? ''`), `:677` (`id: card.id ?? ''`), `:707/720/728`
(`imageUrl ?? ''`, `title ?? ''`, `description ?? ''`)

C03's Forbidden list ends with *"no empty-string sentinels"*, and its anonymous-user row establishes `null` as
the canonical "absent" value. Yet `BrazeSdkAuthErrorEvent.userId` is typed `string` and gets `''` for an
anonymous user (Android does the same at `BrazePlugin.kt:405`, so it is at least consistent), and
`BrazeContentCardBase.id` is typed `string` but the SDK's `Card.id` is `id?: string` — a card with no id
becomes `''`, which then fails `logContentCardClick` with "`cardId` is required". Separately,
`BrazeSdkAuthErrorEvent.errorEventId` is documented as *"Unique error event id, useful for support
correlation"* but is hard-coded `null` on web and Android; only the JSDoc suggests it might ever be populated.

**Fix:** make these `string | null` on the contract and coalesce to `null`, or document per-field why `''` is
the chosen sentinel. Mark `errorEventId` "iOS only; `null` on web and Android."

---

## A1-26 — `setGender` interpolates the supplied value into the error message; C01 and C06 disagree here

**Severity:** NIT **Confidence:** high
**File:** `src/web.ts:346-349` (and the byte-identical native mirrors)

```ts
throw new Error(`Braze.setGender: unknown gender "${options.gender}". Allowed: …`);
```

C01's worked examples prescribe exactly this string, but C06 §3 lists gender as PII and C06 §4 says error
messages *"name the field, never the value"* with the rationale that *"error messages reach crash reporters,
support tickets, and customer-facing surfaces."* Only rejected (i.e. non-SDK-valid) values are echoed, so real
exposure is near-zero — but a security reviewer will spot the two MDCs contradicting each other and expect the
repo to have resolved it.

**Fix:** resolve the conflict in the MDCs (either exempt closed enum values explicitly in C06, or drop the
value from the message and keep only the allowed-list).

---

## A1-27 — `enableLogging: false` is not actually enforceable on web

**Severity:** NIT **Confidence:** high
**File:** `src/web.ts:138`; SDK at `managers/braze-instance.js` (`h && "true" === h.brazeLogging && (n = !0)`)

The SDK re-enables its own logger whenever the page URL carries `?brazeLogging=true`, regardless of the
`enableLogging` value the plugin passes. Since Braze's SDK logs include event payloads, anyone with the URL
can turn on PII-bearing console logging on a production page. C06 frames defaults as *"the only security
boundary the plugin owns end-to-end"* — on web, this one has a documented bypass the plugin can't close (and
`braze.setLogger()` exists as the mitigation the plugin doesn't wire).

**Fix:** document the bypass in SECURITY.md §8 and consider exposing `setLogger` so consumers can route SDK
logs to a scrubbing sink.

---

# What is genuinely good

Not padding — these are things I went looking to criticise and couldn't:

- **Validation coverage and error-message discipline are far above the norm for a community Capacitor plugin.**
  24 of ~30 distinct error strings are byte-identical across three independently written bridges (table in
  A1-11). The C01 format is applied consistently, field names are backtick-fenced everywhere, and the
  validation order (presence → type → enum → range) is genuinely followed, including the subtle
  `Number.isInteger` before range-compare ordering that makes `NaN` fail correctly.
- **`serializeFeatureFlag`'s allow-list is the right call.** Re-emitting only the six enumerated type tags and
  dropping unknown ones keeps the DTO faithful to its declared union instead of guessing — exactly what C02
  prescribes, and the inverse of what most bridges do.
- **`instanceof`-based content-card classification** against the SDK's own concrete classes is the correct fix
  for the sparse-card misclassification that field-presence heuristics cause, and the JSDoc explains *why* the
  old heuristic was wrong. That's institutional memory encoded where the next contributor will read it.
- **SDK Authentication enforcement on `changeUser`** is real on all three platforms, with the identical error
  string and a SECURITY.md §2 cross-reference — this was a prior-audit BLOCKER (L4-K01/S01/T01) and it is
  genuinely closed.
- **iOS's `setCustomUserAttribute` numeric dispatch** (`getDouble`, then `getInt` only when
  `Double(intValue) == doubleValue`) is a careful, correctly-reasoned fix to the L4-S02 truncation bug, with
  the rationale in the comment. (A1-09 is a different edge of the same method, not a regression of this fix.)
- **No `any`, no `!`, no `@ts-ignore` anywhere in `src/`**, with `strict` + `noUncheckedIndexedAccess` +
  `noUnusedLocals` on. The two `eslint-disable` comments are both justified one-liners.
- **The test harness drives the real `@braze/web-sdk` against a real HTTP mock server** rather than mocking the
  SDK module. That is the right shape, and `test-utils.ts`'s comment explaining the server-config-in-first-POST
  requirement is the kind of note that saves the next person a day.
- **`definitions.ts` is a genuinely good API surface to read**: every method has an `@example`, the DTO unions
  are properly discriminated, and the cross-platform notes (epoch-ms rationale, 1-indexed months, BigDecimal on
  Android) are in the contract where consumers see them rather than buried in bridge comments.

---

# Counts by severity

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| MAJOR | 9 | A1-01, A1-02, A1-03, A1-04, A1-05, A1-06, A1-07, A1-08, A1-09 |
| MINOR | 13 | A1-10 … A1-22 |
| NIT | 5 | A1-23, A1-24, A1-25, A1-26, A1-27 |
| **Total** | **27** | |

**Top three to fix before the review:** A1-02 (one-line reordering, restores content-card refresh and
session-start IAMs), A1-03 (the subscription-handle rewrite — it invalidates a documented MDC claim and breaks
both lifecycle paths), A1-01 (init truthfulness, which several other findings cascade from).

**Reviewer-perception note:** A1-04 is the one most likely to damage trust in the whole `findings/` corpus — a
previous audit filed it as a BLOCKER and it was closed by editing the JSDoc to assert the behaviour rather
than by implementing it. Worth fixing *and* annotating in the findings file.
