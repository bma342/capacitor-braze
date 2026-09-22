> **Archived audit report — read the resolution table first.**
> Point-in-time review of `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated 2026-09-22.
> The findings below were current *then*. The table immediately after this banner records what
> happened to each one in `0.2.0`. Where the report and the current code disagree, the code wins.
> Index of audits: [`../README.md`](../README.md).
>
> The largest single change this report drove: **BrazeKit / BrazeUI 14.1.0 → 18.2.1**, which the
> bridge compiled against with zero source changes before any fix was applied. Everything below was
> then re-verified at the new pin.

## Resolution status

| ID | Status in 0.2.0 | Note |
|---|---|---|
| A2-01 | fixed | `BrazeKitDelegate` (conformed to `BrazeDelegate`, which does not declare the callback) replaced by `BrazeSdkAuthDelegate: BrazeSDKAuthDelegate` on `braze.sdkAuthDelegate`. A test asserts the type relationship in both directions. Renames a public Swift symbol — see the CHANGELOG. |
| A2-02 | fixed | Classification extracted to `classifyAttributeValue` and unit-tested against the exact `NSNumber`s `JSTypes` produces. |
| A2-03 | fixed | New `enablePushAutomation` option (iOS only, default `false`). Manual-mode statics deliberately not exposed. |
| A2-04 | fixed | All plugin state is `@MainActor`; every `@objc func` hops once. The wrong "Capacitor runs on main" comment is gone. |
| A2-05 | fixed | `initialize` and `wipeData` are serialised by the main-actor hop. |
| A2-06 | fixed | `.error` when `enableLogging` is false, `.debug` when true. |
| A2-07 | fixed | `configuration.api.addSDKMetadata([.npm, .cocoapods])`. `sdkFlavor` deliberately unset — BrazeKit 18.2.1 has no Capacitor case and `.cordova` would misattribute the wrapper. |
| A2-08 | mostly fixed | `braze.delegate` is never assigned, and `enableInAppMessageUI: false` opts out of the presenter. **Not done:** a public `inAppMessagePresenter` + display-choice plumbing, which is a contract change. |
| A2-09 | 1 of 2 fixed | The deprecated `Braze.disableSDK()` is gone. `Braze.wipeDataAndDisableForAppRun()` stays: at 18.2.1 it is still the only class-level wipe, and every alternative is deprecated too. It produces the one deliberate deprecation warning in the build. |
| A2-10 | fixed | A `disabledPreInit` flag makes `isDisabled()` correct before `initialize`, and `enableSDK()` now works pre-init. The C07 iOS asymmetry is gone *by construction* and cannot regress on a pin bump. |
| A2-11 | fixed | Both truncated strings restored byte-identically. |
| A2-12 | fixed | Rejected, not coerced, via an `integerValue` helper that also rejects booleans (a JSON `true` bridges to `Int` 1). |
| A2-13 | fixed | `parent_config` pointed at a path that does not exist (`@ionic/swiftlint-config` ships a JS module), so no Ionic rule had ever run. The ruleset is inlined, `ios/PluginTests` is in scope, and CI installs the binary. `swiftlint lint --strict` → 0 violations. |
| A2-14 | partly fixed | Swift 5 mode — what the podspec builds with — is clean. `-strict-concurrency=complete` still warns (~40), all from `CAPPlugin`/`CAPPluginCall` being non-`Sendable` upstream; fixing it inside the plugin would mean `@unchecked Sendable` wrappers around Capacitor's types, trading a real signal for a cosmetic one. Revisit with the Capacitor 8/9 lane. |
| A2-15 | 3 of 4 fixed | Slide-up icon emitted; unclassifiable feature-flag properties warn instead of vanishing; `extras` stringification rewritten to match the other platforms. **Not done:** content-card `useWebView`, which needs `BrazeContentCardBase` widened — a contract change, and a known asymmetry with the IAM click action. |
| A2-16 | fixed | `dataFromHex` strips whitespace and newlines, and rejects zero-byte and over-length tokens. Unit-tested. |
| A2-17 | fixed | Payload assembly moved into a testable function. |
| A2-18 | fixed | Collapsed to one helper; the sentinel rationale is now stated correctly. |
| A2-19 | fixed on web | The iOS check was already correct; the web bridge gained the matching validator. |
| A2-20 | fixed | Corrected in `src/definitions.ts`, including the iOS-specific wording for `enableInAppMessageUI: false` (the plugin installs a non-rendering observer presenter, because BrazeKit routes a message to exactly one presenter and an empty slot would kill the event). |

### Environment change this report forced

**iOS now requires Xcode 26** (BrazeKit ≥ 15). An Xcode 26 install whose iOS simulator *runtime* is
older than its iOS SDK reports *no* simulator destinations at all rather than a version error;
`xcodebuild -downloadPlatform iOS` is the fix. Documented in the README, [C10](../../mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) and the CI job.

---

# A2 — iOS bridge audit (`capacitor-braze` @ 0.1.0, commit `0ab8e19`)

## Method / evidence base

Everything below was verified against primary sources, not docs:

| Source | How obtained |
|---|---|
| **BrazeKit 14.1.0 API** | `BrazeKit.zip` from the 14.1.0 GitHub release → `BrazeKit.xcframework/ios-arm64/.../arm64-apple-ios.swiftinterface` (3 578 lines). |
| **BrazeUI 14.1.0 API** | `BrazeUI.zip` **does not exist** as a release asset (the URL in the task returns `Not Found`; the 14.1.0 assets are `braze-swift-sdk-prebuilt.zip`, `BrazeKit.zip`, `BrazeLocation.zip`, `BrazeNotificationService.zip`, `BrazePushStory.zip`). BrazeUI ships as **source**, so I used the repo tarball at tag `14.1.0` → `Sources/BrazeUI/**`. This is the exact source CocoaPods compiles for `pod 'BrazeUI', '14.1.0'`. |
| **Capacitor iOS runtime semantics** | `node_modules/@capacitor/ios/Capacitor/Capacitor/*` in this repo. |
| **NSNumber bridging behaviour** | Executed Swift snippets on this machine (results quoted inline). |
| **Reference bridge** | `braze-react-native-sdk` `iOS/BrazeReactBridge/BrazeReactBridge/BrazeReactBridge.mm` (fetched via `gh api`; the path in the task prompt, `iOS/BrazeReactBridge.mm`, 404s). |

---

## 1. `@objc func` ↔ TS contract table

35 `@objc func`s in `BrazePlugin.swift`; 35 `CAP_PLUGIN_METHOD` entries in `BrazePlugin.m`. **Exact 1:1, no missing registration, no extras, all `CAPPluginReturnPromise` (correct — no callback/`keepAlive` methods exist).** `addListener` / `removeAllListeners` are inherited from `CAPPlugin` and auto-bridged.

Legend: ✅ = matches `src/definitions.ts` + `src/web.ts`; ⚠️ = divergence (finding id in the last column).

| Method | Params read | Result shape | Error strings vs `web.ts` | Init guard | |
|---|---|---|---|---|---|
| `echo` | `value: String` | `{value}` | web does **no** validation; iOS rejects | none (correct) | ⚠️ A2-19 |
| `initialize` | `apiKey`,`endpoint`,`allowInsecureEndpoint`,`enableLogging`,`enableSdkAuthentication`,`sessionTimeoutInSeconds` | `void` | apiKey ✅, endpoint ✅, malformed ✅, sessionTimeout ✅; **HTTPS msg drops `See SECURITY.md §4.`** | n/a | ⚠️ A2-11, A2-06, A2-12 |
| `changeUser` | `userId`, `sdkAuthSignature?` | `void` | ✅ both | ✅ | |
| `getUserId` | — | `{userId: String?}` → JSON `null` (verified: `String?` → `Any` bridges to `NSNull` through `JSONSerialization`) | ✅ | ✅ | |
| `setSdkAuthenticationSignature` | `signature` | `void` | ✅ | ✅ | |
| `setEmail`/`setPhoneNumber`/`setFirstName`/`setLastName`/`setLanguage`/`setCountry`/`setHomeCity` | optional string (nil clears) | `void` | n/a (no validation either side) | ✅ | |
| `setCustomUserAttribute` | `key`, `value` | `void` | ✅ both strings | ✅ | ⚠️ **A2-02** |
| `addToSubscriptionGroup` / `removeFromSubscriptionGroup` | `groupId` | `void` | ✅ (web interpolates method name, resolves identically) | ✅ | |
| `addAlias` | `alias`,`label` | `void` | ✅ both | ✅ | |
| `getDeviceId` | — | `{deviceId: String}` | web uses a *different* error and does **not** gate on init, contradicting its own JSDoc; iOS matches the JSDoc | ✅ | note only (web-side) |
| `setDateOfBirth` | `year`,`month`,`day` (1-indexed month, UTC Gregorian ✅) | `void` | ✅ all three | ✅ | |
| `setGender` | `gender` | `void` | ✅ — iOS's hard-coded `male, female, other, unknown, not_applicable, prefer_not_to_say` is byte-identical to `Object.keys(WEB_GENDER_MAP).join(', ')` | ✅ | |
| `logCustomEvent` | `name`,`properties?` | `void` | ✅ | ✅ | |
| `logPurchase` | `productId`,`currency`,`price`,`quantity?`,`properties?` | `void` | ✅ all four | ✅ | ⚠️ A2-12 |
| `getFeatureFlag` | `id` | `{flag \| null}` | ✅ | ✅ | |
| `getAllFeatureFlags` | — | `{flags[]}` | n/a | ✅ | |
| `refreshFeatureFlags` | — | `void` | n/a | ✅ | |
| `logFeatureFlagImpression` | `id` | `void` | ✅ | ✅ | |
| `getContentCards` | — | `{cards[], lastUpdated}` | n/a | ✅ | |
| `requestContentCardsRefresh` | — | `void` | n/a | ✅ | |
| `logContentCardClick` / `logContentCardImpression` | `cardId` | `void` | cardId ✅; **not-found msg drops `Call getContentCards() to verify the id, or wait for the next refresh.`** | ✅ | ⚠️ A2-11 |
| `registerPushToken` | `token` (hex) | `void` | iOS-only strings (web throws by design) | ✅ | ⚠️ A2-16 |
| `wipeData` | — | `void` | n/a | none (C07 ✅) | ⚠️ A2-09 |
| `disableSDK` | — | `void` | n/a | none (C07 ✅) | ⚠️ A2-09 |
| `enableSDK` | — | `void` | n/a | **guarded** — documented iOS asymmetry, matches JSDoc + C07 ✅ | |
| `isDisabled` | — | `{disabled}` | n/a | none; returns `false` pre-init — matches JSDoc/C07 text but is wrong after a pre-init `disableSDK()` | ⚠️ A2-10 |
| `requestImmediateDataFlush` | — | `void` | n/a | ✅ | |

---

## 2. BrazeKit / BrazeUI symbol verification @ 14.1.0

Every symbol the bridge touches **exists with the used signature**. Verified line-by-line against the swiftinterface:

* `Braze(configuration:)` (196), `Braze.Configuration(apiKey:endpoint:)` (737), `.logger.level` (697/916), `.api.sdkAuthentication` (760), `.sessionTimeout: TimeInterval` (701)
* `braze.changeUser(userId:sdkAuthSignature:)` (396), `set(sdkAuthenticationSignature:)` (397), `requestImmediateDataFlush()` (398), `wipeData()` (400), `logCustomEvent(name:properties:)` (394), `logPurchase(productId:currency:price:quantity:properties:)` (395), `deviceId` (191), `enabled` (168), `inAppMessagePresenter` (179), `delegate` (183), `user` (175), `notifications` (176)
* `Braze.User`: `set(email:/phoneNumber:/firstName:/lastName:/language:/country:/homeCity:/dateOfBirth:/gender:)`, `add(alias:label:)`, `addToSubscriptionGroup(id:)`, `removeFromSubscriptionGroup(id:)`, `id`, all four `setCustomAttribute(key:value:)` overloads (Bool/Double/Int/String) — all present
* `Braze.User.Gender` cases `male/female/other/unknown/notApplicable/preferNotToSay` (3293-3299) — the bridge's 6-way map is complete and exact
* `featureFlags.featureFlag(id:)` (1675), `.featureFlags` , `requestRefresh(_:=nil)` (1676), `logFeatureFlagImpression(id:)` (1681), `subscribeToUpdates` (1680); `FeatureFlag.properties: [String:Any]` (1631) and the six typed accessors (1637-1642)
* `contentCards.cards` / `.lastUpdate: Date?` (1451/1456), `requestRefresh(_:=nil)` (1462), `subscribeToUpdates` (1466); `ContentCard.logClick(using:)` / `logImpression(using:)` (1189-1191)
* `Braze.ContentCard` 5 cases + per-variant fields; `ContentCard.Data` (`id: String`, `clickAction: ClickAction?`, `viewed/dismissible/removed/pinned/clicked`, `createdAt/expiresAt: TimeInterval`, `extras`)
* `Braze.InAppMessage` 7 cases + `Slideup/Modal/ModalImage/Full/FullImage/Html`, `Button(id: Int, text, clickAction)`, `Graphic.icon/.image`, `SlideFrom.top/.bottom`, `InAppMessage.ClickAction.none/.url`
* `notifications.register(deviceToken:)` (2806)
* BrazeUI: `BrazeInAppMessageUI` is `@objc @MainActor open class` conforming to `BrazeInAppMessagePresenter`; `weak var delegate: BrazeInAppMessageUIDelegate?`; `DisplayChoice.now`; `inAppMessage(_:displayChoiceForMessage:)` is `@MainActor` — all match.

Three verified correctness points worth calling out as *right*:

* **1-indexed month** — `DateComponents(year/month/day)` on a UTC Gregorian calendar is correct for `month: 7 == July`.
* **`timestampProperty(key:)` really is milliseconds.** `braze-swift-sdk` `CHANGELOG.md:492`: *"`Braze.FeatureFlag.timestampProperty(key:)` for accessing `Int` Unix millisecond timestamps."* So passing it through untouched as the `datetime` value is correct.
* **`expiresAt` sentinel.** `ContentCard.Data.init(... expiresAt: TimeInterval = -1 ...)` confirms `-1` is "never expires"; the bridge's `NSNull` mapping matches.

Symbols used that **do not exist on the type the bridge attaches them to** → A2-01. Symbols used that exist but are **deprecated** → A2-09.

---

## Findings

### A2-01 — `sdkAuthError` listener can never fire on iOS (wrong delegate protocol)
**Severity: BLOCKER** · **Confidence: high**
`ios/Plugin/BrazeIAMDelegate.swift:52-70`, `ios/Plugin/BrazePlugin.swift:205-210`

```swift
// BrazeIAMDelegate.swift:52
@MainActor
public final class BrazeKitDelegate: NSObject, BrazeDelegate {
    public weak var plugin: CAPPlugin?
    public func braze(_ braze: Braze, sdkAuthenticationFailedWithError error: Braze.SDKAuthenticationError) {
```
```swift
// BrazePlugin.swift:208
let brazeDelegate = BrazeKitDelegate()
brazeDelegate.plugin = pluginRef
braze.delegate = brazeDelegate
```

BrazeKit 14.1.0 `arm64-apple-ios.swiftinterface`:
```swift
:470  public protocol BrazeDelegate : AnyObject {
:471    func braze(_ braze: Braze, shouldOpenURL context: Braze.URLContext) -> Bool
:472    func braze(_ braze: Braze, willPresentModalWithContext context: Braze.ModalContext)
:473    func braze(_ braze: Braze, noMatchingTriggerForEvent event: Braze.TriggerEvent)
:474  }
:520  @objc public protocol BrazeSDKAuthDelegate {
:521    @objc @MainActor func braze(_ braze: Braze, sdkAuthenticationFailedWithError error: Braze.SDKAuthenticationError)
:522  }
:187  @objc weak final public var sdkAuthDelegate: (any BrazeKit.BrazeSDKAuthDelegate)? { ... }
```

`sdkAuthenticationFailedWithError` is a member of **`BrazeSDKAuthDelegate`**, wired through **`braze.sdkAuthDelegate`**. It is not on `BrazeDelegate`. `BrazeDelegate` supplies default implementations for all three of its real methods (`:475-479`), so `BrazeKitDelegate` conforms vacuously and the extra method is simply an unreferenced class method. **This compiles with zero warnings and never executes.**

Why it matters: `SECURITY.md` §2 and the `sdkAuthError` JSDoc promise consumers a recovery path for an expired SDK-Authentication JWT. On iOS there is none — every Braze request for that user is rejected server-side until the app is relaunched, with no signal to JS. The plugin also *enforces* `sdkAuthSignature` on `changeUser`, so this is the one platform where the enforcement has no escape hatch. This is exactly what `braze-react-native-sdk` does correctly (`BrazeReactBridge.mm:93` `braze.sdkAuthDelegate = self;`).

Fix:
```swift
// BrazeIAMDelegate.swift
@MainActor
public final class BrazeSdkAuthDelegate: NSObject, BrazeSDKAuthDelegate {
    public weak var plugin: CAPPlugin?
    public func braze(_ braze: Braze, sdkAuthenticationFailedWithError error: Braze.SDKAuthenticationError) {
        plugin?.notifyListeners("sdkAuthError", data: [
            "userId": error.userId ?? "",
            "errorCode": error.code,
            "errorReason": error.reason ?? "",
            "signature": (error.signature as Any?) ?? NSNull(),
            "errorEventId": NSNull(),
        ])
    }
}
```
```swift
// BrazePlugin.swift, in the main-actor block
let authDelegate = BrazeSdkAuthDelegate()
authDelegate.plugin = pluginRef
braze.sdkAuthDelegate = authDelegate        // <- not `braze.delegate`
pluginRef.sdkAuthDelegate = authDelegate
```
If `braze.delegate` is genuinely wanted later (e.g. `shouldOpenURL`), it should be a *separate* object — and see A2-08 about taking that slot at all.

---

### A2-02 — `setCustomUserAttribute` turns the numbers `0` and `1` into booleans on iOS
**Severity: BLOCKER** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:347-367`

```swift
if let boolValue = call.getBool("value") {
    braze.user.setCustomAttribute(key: key, value: boolValue)
} else if let stringValue = call.getString("value") {
```

`call.getBool` is `jsObjectRepresentation[key] as? Bool` (`JSTypes.swift:141`), and `JSTypes.coerceToJSValue` keeps every JSON number as an `NSNumber` (`JSTypes.swift:225` matches before the `Bool`/`Int` cases). Swift's `NSNumber → Bool` conditional bridge is *value*-preserving, not *type*-preserving. Executed on this machine against `JSONSerialization`-parsed input:

```
a(=1)     type=__NSCFNumber   asBool=Optional(true)   asInt=Optional(1)
d(=0)     type=__NSCFNumber   asBool=Optional(false)  asInt=Optional(0)
e(=42)    type=__NSCFNumber   asBool=nil              asInt=Optional(42)
c(=42.5)  type=__NSCFNumber   asBool=nil              asDouble=Optional(42.5)
```

So `Braze.setCustomUserAttribute({ key: 'lifetime_orders', value: 1 })` calls `setCustomAttribute(key:value: Bool)` and writes **`true`** to the Braze profile. `value: 0` writes `false`. Every other number is fine. The in-code rationale is inverted — the comment at `:333-339` says `getBool` goes first "so JSON booleans aren't misread as ints", but the actual hazard runs the other way.

This is a silent, permanent, cross-platform data divergence: Android reads the raw `org.json` value and dispatches on the real JSON type (`android/.../BrazePlugin.kt:554-567`, `is Boolean -> … is Int -> …`), and Web passes the JS value straight through. Only iOS corrupts. `0`/`1` are the single most common integer attribute values in a loyalty/ordering app (order counts, tier levels, streaks), and once written the attribute's dashboard type is locked to boolean.

The whole L4-S02 comment block at `:332-339` is also factually wrong about `getInt` ("returns the rounded value for any numeric NSNumber") — `42.5 as? Int` is `nil`. The *code* happens to be correct for the Double/Int split; only the Bool branch is broken.

Fix (verified locally — `CFGetTypeID` cleanly separates `__NSCFBoolean` from `__NSCFNumber`, and `CFNumberIsFloatType` separates `42.5` from `42`):
```swift
guard let raw = call.getValue("value") else {
    call.reject("Braze.setCustomUserAttribute: `value` must be string, number, or boolean.")
    return
}
if let number = raw as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() {
    braze.user.setCustomAttribute(key: key, value: number.boolValue)
} else if let stringValue = raw as? String {
    braze.user.setCustomAttribute(key: key, value: stringValue)
} else if let number = raw as? NSNumber {
    if CFNumberIsFloatType(number as CFNumber) && Double(number.intValue) != number.doubleValue {
        braze.user.setCustomAttribute(key: key, value: number.doubleValue)
    } else {
        braze.user.setCustomAttribute(key: key, value: number.intValue)
    }
} else {
    call.reject("Braze.setCustomUserAttribute: `value` must be string, number, or boolean.")
    return
}
```
A regression test belongs in `ios/PluginTests` and in `test/web/src/` (asserting `1` stays a number cross-platform).

---

### A2-03 — Push is half-wired: opens, deep links, rich push and silent push never reach Braze
**Severity: MAJOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:849-876`, `docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md:97-105`

The bridge's entire push surface is `braze.notifications.register(deviceToken:)`. C10 tells consumers to do exactly three things: enable the Push capability, enable Background Modes, and forward the token.

With BrazeKit 14 that is not enough. The SDK's own reference `AppDelegate` (`Examples/Swift/Sources/PushNotifications-Manual/AppDelegate.swift`) additionally requires:

```swift
center.setNotificationCategories(Braze.Notifications.categories)   // action buttons / push stories
center.delegate = self
// UNUserNotificationCenterDelegate:
braze.notifications.handleUserNotification(response: response, withCompletionHandler: completionHandler)
// UIApplicationDelegate:
braze.notifications.handleBackgroundNotification(userInfo: userInfo, fetchCompletionHandler: completionHandler)
```
…or, as the one-liner alternative (`PushNotifications-Automatic/AppDelegate.swift`):
```swift
configuration.push.automation = true   // verified present at swiftinterface :955
```

Without either path: **push open/click events are never logged** (Braze push campaign analytics show sends but no opens), Braze deep links from a notification do nothing, action buttons and Push Stories don't render, and silent/background push is unsupported.

It is worse than "the consumer can add it themselves": the `Braze` instance is created inside `initialize()`, which JS calls *after* `application(_:didFinishLaunchingWithOptions:)` returns. A consumer's AppDelegate therefore cannot reach `BrazePlugin.braze` during launch, loses the launch-options push payload entirely, and `@capacitor/push-notifications` has meanwhile claimed `UNUserNotificationCenter.current().delegate`. There is currently no documented, working recipe.

Fix, in order of preference:
1. Add an `enablePushAutomation?: boolean` (default `true`, or `false` with loud docs) to `BrazeInitializeOptions` and set `configuration.push.automation = enablePushAutomation` plus `configuration.push.appGroup` when supplied. This is the only option that works given late initialization.
2. Expose `handleUserNotification` / `handleBackgroundNotification` as plugin statics and write the real AppDelegate recipe into C10 + README, including how to coexist with `@capacitor/push-notifications`' delegate.
3. Either way, register `Braze.Notifications.categories`.

---

### A2-04 — Unsynchronised plugin state; the "Capacitor runs on main" comment is wrong
**Severity: MAJOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:61-96`, `:170-238`, `:920-942`

```swift
// :191-196
// `BrazeInAppMessageUI` … require the main actor for construction. Capacitor invokes
// plugin methods on the main thread in practice, but the `@objc func` entry point is
// nonisolated as far as Swift's strict-concurrency checker is concerned …
```

Capacitor iOS does **not** invoke plugin methods on the main thread. `CapacitorBridge.swift:124` declares `open private(set) var dispatchQueue = DispatchQueue(label: "bridge")` and `:489` dispatches every call onto it:

```swift
dispatchQueue.async { [weak self] in
    let pluginCall = CAPPluginCall(...)
    plugin.perform(selector, with: pluginCall)
```

So `initialize` and `wipeData` run on the serial `bridge` queue while the `DispatchQueue.main.async` block at `:198-215` runs on the main queue. Six pieces of shared mutable state are written from both without synchronisation:

| State | Written from bridge queue | Written/read from main queue |
|---|---|---|
| `static var braze` (`:61`) | `initialize:175,178`, `wipeData:939` | read at `:236` inside the content-cards subscription |
| `static var sdkAuthenticationEnabled` (`:96`) | `:179`, `:940` | — (read on bridge queue) |
| `featureFlagsSubscription` (`:67`) | `:170`, `:220`, `:934` | — |
| `contentCardsSubscription` (`:72`) | `:171`, `:226`, `:935` | — |
| `inAppMessagePresenter` (`:79`) | `:172`, `:936` | **`:212`** |
| `iamDelegate` (`:84`) | `:173`, `:937` | **`:213`** |
| `brazeDelegate` (`:89`) | `:174`, `:938` | **`:214`** |

The last three are a textbook cross-thread race on non-atomic Swift class properties (torn ARC retain/release, not just a stale read). TSan will flag it.

Fix: give the plugin one isolation domain. The cheapest correct change is to declare
```swift
override public var dispatchQueue: DispatchQueue { .main }   // see note below
```
— but `CAPPlugin`'s queue is bridge-level, not per-plugin in Capacitor 6, so the practical fix is to confine all six properties behind `MainActor` and hop once per method:
```swift
@objc func initialize(_ call: CAPPluginCall) {
    // …validate on the calling queue (pure), then:
    DispatchQueue.main.async { MainActor.assumeIsolated { self.performInitialize(call, configuration) } }
}
```
with `braze`, the two cancellables, the presenter and both delegates declared `@MainActor static`/`@MainActor` instance properties. `braze-react-native-sdk` solves the same problem by pinning the whole module to the main queue (`- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }`, `+ requiresMainQueueSetup = YES`).

While fixing, correct the comment at `:191-196`.

---

### A2-05 — `wipeData` racing a pending `initialize` resurrects the presenter on a dead SDK instance
**Severity: MAJOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:197-215` vs `:920-942`

`initialize` returns to JS at `:240` while the presenter/delegate wiring is still queued on the main thread. `wipeData` runs on the bridge queue and nils everything at `:934-940`. The two orderings are not serialised, so this JS sequence —
```js
await Braze.initialize({...});
await Braze.wipeData();
```
— can execute as: *bridge*: `initialize` body → `wipeData` body (nils all refs, `BrazePlugin.braze = nil`) → *main*: the queued block from `:198` runs and sets `pluginRef.inAppMessagePresenter`, `.iamDelegate`, `.brazeDelegate` to live objects and assigns `braze.inAppMessagePresenter` / `braze.delegate` on the **wiped** instance. Post-condition: the plugin holds a presenter for an SDK instance that has been disowned, and the `let braze` captured strongly by the closure keeps that wiped instance alive past its intended lifetime. A subsequent `initialize` then nils those references without ever having owned the right objects.

Related, same code path: `initialize` called twice creates a second `Braze(configuration:)` in the same process. BrazeKit explicitly models a single instance per app (`sharedInstance()` deprecation text: *"You are now expected to keep a reference of the Braze instance yourself"*); the first instance stays alive until the queued main block and ARC both release it, during which two instances observe app lifecycle notifications.

Fix: fold both into the single isolation domain from A2-04 (then `initialize` and `wipeData` are strictly ordered), capture `braze` weakly in the queued block, and guard the block with `guard BrazePlugin.braze === braze else { return }` before assigning anything. Consider rejecting a second `initialize` outright, or making it idempotent.

---

### A2-06 — `enableLogging: false` still enables INFO-level Braze logging
**Severity: MAJOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:141`

```swift
configuration.logger.level = enableLogging ? .debug : .info
```

`Braze.Configuration.Logger.Level` is `debug | info | error | disabled` (swiftinterface `:933-937`). `.info` is the second-most-verbose level, not "off": BrazeKit logs session lifecycle, request dispatch and SDK state at info.

This contradicts the plugin's own stated posture:
* `SECURITY.md:251` — *"`enableLogging` in Braze's SDKs is **verbose**. Logs include request payloads (events, attributes, sometimes PII), response bodies, internal SDK state. Useful for development; dangerous in production."*
* `C06:13` — *"Default-deny. Optional security toggles default to the safer value. `enableLogging` defaults to `false`."*

It also diverges from Android, which only ever *raises* the level and never lowers the SDK default (`android/.../BrazePlugin.kt:343-349`: `if (enableLogging) { BrazeLogger.enableVerboseLogging() }`).

Fix:
```swift
configuration.logger.level = enableLogging ? .debug : .disabled
```
(`.error` if you want crash-triage breadcrumbs to survive; either is defensible, `.info` is not.) Update the C06 table row, which currently cites `BrazePlugin.swift:93` — a stale line number.

---

### A2-07 — No SDK flavor / metadata registration
**Severity: MAJOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:140-142`

The bridge never sets `configuration.api.sdkFlavor` or calls `configuration.api.addSDKMetadata(_:)`. Both exist at 14.1.0 (`swiftinterface :764` `sdkFlavor: Braze.Configuration.Api.SDKFlavor`, `:775` `addSDKMetadata(_:)`), and `SDKFlavor` has a `.cordova` case (`:796-801`) with `SDKMetadata` carrying `.cordova`/`.ionic`/`.cocoaPods`/`.npm` values.

Every official Braze wrapper does this — `BrazeReactBridge.mm:47-51`:
```objc
[configuration.api addSDKMetadata:@[BRZSDKMetadata.reactnative]];
configuration.api.sdkFlavor = BRZSDKFlavorReact;
```

Consequence: Braze's backend attributes traffic from this plugin as a vanilla native integration. Braze support cannot identify the wrapper when a customer opens a ticket, and Braze's own SDK-adoption telemetry is wrong. For a plugin whose stated bar is "would pass Braze review" (`REVIEW_READINESS.md`), this is the kind of thing a Braze engineer checks first.

Fix:
```swift
configuration.api.sdkFlavor = .cordova
configuration.api.addSDKMetadata([.cordova, .ionic, .npm])
```
Mirror in the Android bridge (`BrazeConfig.Builder().setSdkFlavor(...)` / `setSdkMetadata(...)`).

---

### A2-08 — The plugin monopolises three delegate slots with no opt-out
**Severity: MAJOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:199-214`

```swift
let presenter = BrazeInAppMessageUI()
…
presenter.delegate = iamDelegate
braze.inAppMessagePresenter = presenter
…
braze.delegate = brazeDelegate
```

All three assignments are unconditional and there is no plugin API to reclaim them. A consumer who needs any of the following is stuck:

* `BrazeInAppMessageUIDelegate.inAppMessage(_:prepareWith:)` — the SDK's designated customization hook (presentation context, theming, `statusBarHideBehavior`)
* `inAppMessage(_:didPresent:)` / `willDismiss:` lifecycle callbacks
* returning `.reenqueue` or `.discard` — the whole reason `displayChoiceForMessage` exists ("during a full screen game or on a loading screen", per the SDK's own doc comment). The bridge hard-codes `.now` at `BrazeIAMDelegate.swift:39`, and the `inAppMessageReceived` JSDoc admits listeners "cannot block display". So the plugin consumes the suppression hook and then doesn't offer suppression.
* `BrazeDelegate.braze(_:shouldOpenURL:)` — universal-link / deep-link interception. This slot is taken (A2-01) purely to host a method that is never called.

`braze-react-native-sdk` handles this explicitly: `BrazeUIHandler canSetDefaultInAppMessagePresenterDelegate:` checks whether a custom delegate is already installed and backs off (`BrazeReactBridge.mm:119-122`, `:935-940`), and exposes `subscribeToInAppMessage(useBrazeUI:)` so JS can choose.

Fix (minimum): add `useBrazeInAppMessageUI?: boolean` to `BrazeInitializeOptions` (default `true`) and skip the presenter/delegate wiring when `false`; expose `BrazePlugin.inAppMessagePresenter` publicly so a host app can attach its own delegate; stop touching `braze.delegate` once A2-01 moves auth errors to `sdkAuthDelegate`. Medium-term, plumb the display choice through the listener (Capacitor supports this via a follow-up `setInAppMessageDisplayChoice` call, which is how RN's `hideCurrentInAppMessage` works).

---

### A2-09 — Privacy/lifecycle path is built on deprecated AppboyKit-compat class methods
**Severity: MAJOR** · **Confidence: medium**
`ios/Plugin/BrazePlugin.swift:932`, `:948`

```swift
Braze.wipeDataAndDisableForAppRun()   // :932
Braze.disableSDK()                    // :948
```

Both exist, but both live in the compatibility extension and are deprecated at 14.1.0:
```swift
:366  @available(*, deprecated, message: "renamed to 'wipeData()' on the Braze instance")
:367  @objc final public class func wipeDataAndDisableForAppRun()
:368  @available(*, deprecated, message: "renamed to the 'enabled' boolean property")
:369  @objc final public class func disableSDK()
```
The same extension is introduced by the `start(withApiKey:…)` deprecation note, which states that initializing via `Braze(configuration:)` — which this plugin does — *"disables most compatibility features."*

Two consequences. (a) Every build emits deprecation warnings, and these are scheduled for removal, so a routine C08 pin bump can break the build or, worse, silently change behaviour. (b) It is not established that a class-level `Braze.disableSDK()` issued **before** `Braze(configuration:)` is honoured by the instance created afterwards — the compat layer's documented purpose is bridging legacy AppboyKit apps. I could not confirm either way from the swiftinterface (implementation is closed-source), hence medium confidence — but `C07`'s GDPR Article 7(3) argument ("if a user revokes during app launch, before `initialize` completed, `disableSDK()` must work then") rests entirely on an unverified compat shim.

Fix: write a Layer-4 smoke case that calls `disableSDK()` pre-init, then `initialize()`, then asserts no network traffic reaches the mock server. If it fails, the honest answer is to persist the consent decision in the plugin and apply `configuration`/`braze.enabled = false` at `initialize` time, and document `disableSDK` as "queued until initialize" on iOS — the same shape as the already-documented `enableSDK` asymmetry. Either way, move `wipeData`'s pre-init branch off `wipeDataAndDisableForAppRun()` if a non-deprecated equivalent exists at the next pin bump.

---

### A2-10 — `isDisabled()` reports `false` right after a successful pre-init `disableSDK()`
**Severity: MINOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:966-972`

```swift
let disabled: Bool = BrazePlugin.braze.map { !$0.enabled } ?? false
```

`disableSDK()` is advertised as init-independent and genuinely does something pre-init (`Braze.disableSDK()` at `:948`), but `isDisabled()` pre-init hard-codes `false`. So:
```js
await Braze.disableSDK();          // resolves
const { disabled } = await Braze.isDisabled();   // => false  ❌
```
`BrazeIsDisabledResult.disabled` is documented as *"`true` if `disableSDK` has been called and not re-enabled."* A consent-gate that reads this before initialize gets the wrong answer, in the unsafe direction.

The `C07`/JSDoc wording ("uninitialized != disabled, by convention") covers the *never-called* case, not the *called-and-ignored* case.

Fix: track the pre-init call in the plugin.
```swift
private static var disabledPreInit = false
@objc func disableSDK(_ call: CAPPluginCall) {
    Braze.disableSDK()
    if let braze = BrazePlugin.braze { braze.enabled = false } else { Self.disabledPreInit = true }
    call.resolve()
}
@objc func enableSDK(_ call: CAPPluginCall) { /* also clear disabledPreInit */ }
@objc func isDisabled(_ call: CAPPluginCall) {
    let disabled = BrazePlugin.braze.map { !$0.enabled } ?? Self.disabledPreInit
    call.resolve(["disabled": disabled])
}
```
(Pairs with A2-09: the same flag is what you'd apply at `initialize` if the compat shim turns out not to work.)

---

### A2-11 — Two error strings are not byte-identical to `web.ts` (C04 violation)
**Severity: MINOR** · **Confidence: high**

| | web | iOS |
|---|---|---|
| HTTPS | `…only for local mock-server testing.`**` See SECURITY.md §4.`** (`web.ts:955-958`) | truncated (`BrazePlugin.swift:122-124`) |
| card not found | `…with id "X".`**` Call getContentCards() to verify the id, or wait for the next refresh.`** (`web.ts:910-913`) | truncated (`BrazePlugin.swift:682`, `:696`) |

`C04` requires the native bridges to duplicate the web check *"with the byte-identical error string"*, and `CLAUDE.md` restates it. Both truncations drop the actionable half of the message. Everything else in the 22-string comparison matches exactly (including the interpolated `setGender` allow-list, which I verified resolves to the same six values in the same order).

Fix: append the missing sentences. Worth a cheap CI guard — extract the strings from `src/web.ts` and grep them out of `BrazePlugin.swift` / `BrazePlugin.kt` in the lint job, so the next one can't drift.

---

### A2-12 — Non-integer `quantity` / `sessionTimeoutInSeconds` are silently coerced instead of rejected
**Severity: MINOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:523-527`, `:143-161`

```swift
let quantity = call.getInt("quantity") ?? 1
guard quantity >= 1, quantity <= 100 else { … }
```

`getInt` is `as? Int` on the NSNumber, which returns `nil` for any non-integral value (verified: `42.5 as? Int == nil`). So `logPurchase({ …, quantity: 2.5 })` silently becomes `quantity: 1` on iOS, where web throws ``Braze.logPurchase: `quantity` must be an integer between 1 and 100.`` (`web.ts:932-935`). Identically, `initialize({ sessionTimeoutInSeconds: 90.5 })` silently falls through to the SDK default instead of rejecting (`web.ts:994-997`).

The comment at `:145-152` reasons about absent vs. null keys and concludes the collapse "matches the contract" — true for those two cases, but it also swallows the malformed-value case, which the contract does not permit.

Fix: distinguish "absent" from "present but not an integer".
```swift
if let rawQuantity = call.getValue("quantity") {
    guard let quantity = rawQuantity as? Int, quantity >= 1, quantity <= 100 else {
        call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
        return
    }
    …
}
```
Same shape for `sessionTimeoutInSeconds` (`… must be a positive integer.`). Note `NSNull` arrives as a present value, so treat `rawQuantity is NSNull` as absent if you want to keep web's `undefined`-tolerance.

---

### A2-13 — The SwiftLint gate does not actually gate
**Severity: MINOR** · **Confidence: high**
`.swiftlint.yml:8`, `.github/workflows/test.yml:258-263`, `ios/Plugin/BrazePlugin.swift:253`

```yaml
parent_config: node_modules/@ionic/swiftlint-config/.swiftlint.yml
```
That file does not exist. `@ionic/swiftlint-config@2.0.0` ships `README.md`, `index.js`, `package.json` — the config is a **JS module** (`module.exports = { excluded, opt_in_rules: [force_unwrapping, implicitly_unwrapped_optional, …], line_length: { warning: 150, … } }`), consumed by `node-swiftlint` via cosmiconfig, not a YAML file. SwiftLint warns about the unreadable parent and falls back to its built-in defaults, so none of the Ionic opt-in rules (`force_unwrapping`, `implicitly_unwrapped_optional`, `unowned_variable_capture`, `unused_import`) are enforced, and `line_length` sits at the default 120-warning instead of Ionic's 150.

Direct evidence the job is inert: `BrazePlugin.swift:253` is **141 characters** —
```swift
            call.reject("Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.")
```
— which exceeds SwiftLint's default 120 warning, and CI runs `npm run swiftlint -- lint --strict` (warnings→errors). That step is green today, which is only possible if SwiftLint is not on the runner: `node_modules/swiftlint/bin.js` prints `!!! WARN: SwiftLint not found in PATH` and **exits 0** when the binary is missing (GitHub removed SwiftLint from the macOS runner images).

Fix: (a) drop `parent_config` and inline the Ionic ruleset in `.swiftlint.yml`, or point cosmiconfig at it by renaming to `swiftlint.config.js` / `.swiftlintrc.js`; (b) install SwiftLint explicitly in CI (`brew install swiftlint`) so the `--strict` run can fail; (c) fix `:253` (and re-run — the opt-in rules will likely surface more).

---

### A2-14 — Not Swift 6 / strict-concurrency ready
**Severity: MINOR** · **Confidence: high**

Independent of the runtime race in A2-04, the file will not compile in Swift 6 language mode or under `-strict-concurrency=complete`:

* `BrazePlugin.swift:61` `public private(set) static var braze: Braze?` and `:96` `private static var sdkAuthenticationEnabled` — non-isolated mutable global state ⇒ hard error in Swift 6.
* `:199-203` constructs `BrazeInAppMessageUI()` (an `@MainActor open class`) and touches `presenter.delegate` from a plain `DispatchQueue.main.async` closure, which is `@Sendable` and **nonisolated** — the compiler cannot see the main-thread guarantee. Use `MainActor.assumeIsolated { … }` (or `Task { @MainActor in … }`, accepting the extra hop).
* `:220`/`:226` pass non-isolated closures capturing `self` (a non-`Sendable` `CAPPlugin`) into `subscribeToUpdates(_:)`, whose parameter is `@escaping @MainActor ([T]) -> Void` (swiftinterface `:1466`, `:1680`).
* `BrazeIAMDelegate.swift:31`/`:55` `weak var plugin: CAPPlugin?` on `@MainActor` classes, assigned from a non-isolated closure.

Since Capacitor 7 targets Swift 5.9+ and Capacitor 8 will land on Swift 6 toolchains, this is a near-term maintenance cliff rather than a today-bug. Adopting the single-`MainActor` design from A2-04 fixes all four at once.

---

### A2-15 — Silent provider-data drops in serialization
**Severity: MINOR** · **Confidence: high**

Four places where SDK data is discarded without a warning:

1. `BrazeIAMDelegate.swift:93-95` — slide-up `graphic` is matched only for `.image`; `Graphic.icon(String)` (swiftinterface `:2666`) is dropped entirely. The Web SDK exposes `icon` on slide-ups, so an icon slide-up serializes identically to a bare one. Either add `icon?: string` to `BrazeSlideupInAppMessage` or document the drop.
2. `BrazePlugin.swift:763` — content-card `ClickAction.url(URL, useWebView:)` drops `useWebView`. The comment at `:736-739` calls this intentional "because the contract has no shape for it" — but the *in-app-message* contract does carry `useWebView` (`definitions.ts:477`, `BrazeIAMDelegate.swift:173`). The asymmetry is arbitrary; widen `BrazeContentCardBase` to match.
3. `BrazePlugin.swift:629-631` — feature-flag properties whose type none of the six accessors claims are dropped. Reasonable, but a future SDK property type vanishes with no diagnostic; the web path at least filters against an explicit allow-list it can log.
4. `BrazePlugin.swift:821-831` / `BrazeIAMDelegate.swift:185-195` — `coerceExtras` stringifies non-strings with `String(describing:)`, so `NSNumber(true)` becomes `"1"` and a nested dict becomes a Swift debug description. Prefer `JSONSerialization` for container values and `NSNumber.stringValue` (or the CFBoolean check from A2-02) for scalars, so iOS and Web agree.

`CLAUDE.md`'s "Forbidden" list names *silent provider-data drops in readers / apply handlers* explicitly; the same principle applies here.

---

### A2-16 — `registerPushToken` accepts a token that hex-decodes to zero bytes
**Severity: MINOR** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:864-897`

`dataFromHex` strips spaces, `<` and `>`, then requires an even character count. `"<>"` and `"  "` both survive the `!token.isEmpty` guard, reduce to `""`, pass `count % 2 == 0`, and produce `Data()` — which is then handed to `braze.notifications.register(deviceToken: Data())`. Registering an empty APNs token is a silent push outage. Tabs and newlines are also not stripped, so a token copy-pasted with a trailing `\n` is rejected as "not valid hex" with a confusing message.

Fix:
```swift
let cleaned = hex.components(separatedBy: .whitespacesAndNewlines).joined()
    .replacingOccurrences(of: "<", with: "").replacingOccurrences(of: ">", with: "")
guard !cleaned.isEmpty, cleaned.count % 2 == 0, cleaned.count <= 200 else { return nil }
```
APNs tokens are 32 bytes (64 hex chars) today and 100 bytes max; a length sanity check is cheap and catches paste errors.

---

### A2-17 — Dead statement + compiler warning in the SDK-auth payload
**Severity: NIT** · **Confidence: high**
`ios/Plugin/BrazeIAMDelegate.swift:58-69`

```swift
var payload: [String: Any] = [ … ]
// Defensive: BrazeKit currently doesn't expose an errorEventId …
_ = payload
plugin?.notifyListeners("sdkAuthError", data: payload)
```

`_ = payload` is a no-op, and because it isn't a mutation the compiler emits *"variable 'payload' was never mutated; consider changing to 'let'"*. Change to `let` and delete the `_ =` line (keep the comment, which is accurate — `Braze.SDKAuthenticationError` at swiftinterface `:2931-2937` has `code / reason / userId / signature / optional` and no event id).

---

### A2-18 — Timestamp sentinel helpers
**Severity: NIT** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:836-847`

* `expiresAtEpochMillis`: `if seconds < 0 || seconds == 0` is just `seconds <= 0` — i.e. identical to `epochMillis(fromSeconds:)`. The two helpers and their divergent doc comments exist for no behavioural reason; collapse them.
* `epochMillis(fromSeconds:)` maps `createdAt == 0` to JSON `null`. `ContentCard.Data.init` defaults `createdAt` to `0` (swiftinterface), so that's the right sentinel — but a card genuinely created at the Unix epoch, or a mock-server fixture using `0`, also reports `null`. Harmless in practice; worth a one-line comment saying `0` is the SDK's unset default rather than "never modified".

---

### A2-19 — `echo` validation exists only on iOS/Android
**Severity: NIT** · **Confidence: high**
`ios/Plugin/BrazePlugin.swift:100-106` vs `src/web.ts:124-126`

iOS rejects with ``Braze.echo: `value` is required (string).``; web returns `{ value: undefined }`. C04 asks for symmetric validation at both boundaries. Either add the web check or note the exemption in C04 (echo is a bridge probe, not a Braze call).

---

### A2-20 — `inAppMessageReceived` JSDoc contradicts iOS behaviour
**Severity: NIT** · **Confidence: high**
`src/definitions.ts:1135-1138`

> *"Listener registration after `initialize` is required; listeners added before initialize is called are silently inert until the underlying native subscription is set up."*

On iOS the Capacitor listener registry (`CAPPlugin.m` `eventListeners`) is entirely independent of the BrazeUI delegate. A listener added *before* `initialize` is stored and does receive events once the presenter is wired. The claim is also inconsistent with the other three listeners' JSDoc, which correctly describe the behaviour (no replay, but registration order doesn't matter). Reword to match C05.

---

## What is genuinely good

Real strengths, not consolation prizes:

* **`BrazePlugin.m` is exactly right.** 35/35 methods registered, no drift, no stale entries, correct `CAPPluginReturnPromise` on every line, and grouped to mirror the Swift file. This is the single most commonly broken file in a Capacitor plugin and it's clean.
* **Content-card variant discrimination is done properly.** Pattern-matching BrazeKit's `ContentCard` enum (rather than sniffing fields) and collapsing `classicImage → classic` with an optional `imageUrl` is the correct reading of both SDKs' models, and the per-variant field sets match the swiftinterface precisely — including *not* emitting `altImageText` on `.classic`, which genuinely has no `imageAltText` (`ClassicImage` does).
* **Timestamp and sentinel handling is correct and non-obvious.** `TimeInterval` seconds → epoch-ms, `expiresAt == -1` → `null`, and passing `timestampProperty` through untouched because it is *already* milliseconds — the last one is easy to get wrong in both directions and the bridge gets it right.
* **The 7-case → 5-variant IAM mapping is a good judgement call**, correctly implemented (`modalImage`/`fullImage` collapse with empty `header`/`message` + populated `imageUrl`), matches the Web SDK class hierarchy, and is the one part of the iOS bridge with real unit tests.
* **The delegate-retention reasoning is right.** `BrazeInAppMessageUI.delegate` and `Braze.delegate` are both `weak` (confirmed in source), and the plugin correctly retains both plus the `Cancellable`s; the weak `plugin` back-reference avoids the cycle. Most bridges get this wrong and ship a presenter that stops firing after the first autorelease pool drain.
* **Numeric Double/Int narrowing** in `setCustomUserAttribute` (`Double(intValue) == doubleValue`) is correct and cross-platform-aware, even though the comment explaining it is wrong and the Bool branch above it isn't (A2-02).
* **Endpoint validation, HTTPS default-deny, and `changeUser` SDK-auth enforcement** are implemented, not just documented — including the bare-hostname shorthand, which is a nice ergonomic detail.
* **The privacy manifest is honest and correct.** `plutil -lint` passes; the plugin binary really does call no required-reason API (no `UserDefaults`, no file timestamps in `ios/Plugin/`); it doesn't duplicate BrazeKit's declarations; and the `resource_bundles` form is the CocoaPods-sanctioned way to ship `PrivacyInfo.xcprivacy` from a pod — correct for the static-framework linkage C10 mandates.
* **Podspec hygiene**: exact SDK pins per C08, bounded `Capacitor '>= 6.0', '< 8.0'`, deployment target 15.0 comfortably above BrazeKit's 12.0 floor, `swift_version 5.9` matching the toolchain BrazeKit needs, and a `source_files` glob scoped to `ios/Plugin/**` that correctly does **not** sweep in `ios/PluginTests/`.
* **Zero `!`, `try!`, `as!`, `fatalError`, `print`, or `NSLog` in `ios/Plugin/`** — verified by grep. The PII-non-logging promise in `SECURITY.md` §3 / C06 is kept literally: the bridge logs nothing at all.
* **C07's iOS asymmetry table is accurate.** The `enableSDK` / `isDisabled` BrazeKit-14 divergence is correctly discovered, correctly implemented, and correctly documented in three places (code comment, MDC, JSDoc). That's better documentation discipline than most commercial SDKs.

---

## Count by severity

| Severity | Count | IDs |
|---|---|---|
| **BLOCKER** | 2 | A2-01, A2-02 |
| **MAJOR** | 7 | A2-03, A2-04, A2-05, A2-06, A2-07, A2-08, A2-09 |
| **MINOR** | 7 | A2-10, A2-11, A2-12, A2-13, A2-14, A2-15, A2-16 |
| **NIT** | 4 | A2-17, A2-18, A2-19, A2-20 |
| **Total** | **20** | |

Ship-blocking for an external review: **A2-01** (advertised security feature is dead code), **A2-02** (silent data corruption, iOS-only), **A2-03** (push analytics don't work), and **A2-06** (security default doesn't do what SECURITY.md says). A2-04/05 are the correctness foundation those fixes should be built on.
