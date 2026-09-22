# Braze SDK Surface — Full Catalog & Plugin Coverage

> Comprehensive map of every Braze SDK capability across Android, iOS, and Web, with this plugin's coverage roadmap. This document is the authoritative inventory; [`PLAN.md`](./PLAN.md) is the strategic plan, [`SECURITY.md`](./SECURITY.md) is the security model.
>
> **Unofficial plugin.** This is an independent, community-maintained Capacitor wrapper around Braze's first-party SDKs. NOT affiliated with or endorsed by Braze, Inc. See the [README disclaimer](./README.md#disclaimer).

**Last updated:** 2026-09-22 (plugin `0.2.0`)
**Native SDK versions pinned:**
- `com.braze:android-sdk-ui` — **43.2.0** (exact)
- `BrazeKit` / `BrazeUI` — **18.2.1** (exact) — **requires Xcode 26+**
- `@braze/web-sdk` — peer dep **`^6.13.0`** (floor is a security floor; see [`SECURITY.md` §6](./SECURITY.md#6-in-app-message-xss-risk))

Pin policy and bump protocol: [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md). Consumer-side
requirements those pins force: [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md).

---

## 0. Native SDK module map

Braze SDKs are not monolithic — each platform has multiple sub-modules. The plugin pulls only what it needs.

### Android — Maven coordinates

| Module | Purpose | Plugin pulls? |
|---|---|---|
| `com.braze:android-sdk-base` | Core analytics | ✅ (transitive) |
| `com.braze:android-sdk-ui` | In-app messages, push, content cards, banners | ✅ direct |
| `com.braze:android-sdk-location` | Geofences, location | ⏳ v0.5 (opt-in) |
| `com.braze:android-sdk-jetpack-compose` | Compose integration | ❌ N/A (Capacitor is WebView-based) |
| `com.braze:android-sdk-unity` | Unity engine | ❌ N/A |

**Min SDK:** the plugin's `android/build.gradle` defaults to `minSdkVersion 22`, matching Capacitor 6's stock template and [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md); a consumer's `rootProject.ext.minSdkVersion` always wins. Braze's AAR metadata declares `minCompileSdk=21`. (This number disagreed across three documents until 0.2.0 — if you change it, change `android/build.gradle`, C10 and here together.)

**Kotlin / Build deps:** Kotlin 2.2.x, FCM 24.1.x — these are Braze's pins; the plugin inherits.

### iOS — Swift Package Manager / CocoaPods

| Module | Purpose | Plugin pulls? |
|---|---|---|
| `BrazeKit` | Core analytics, push, events | ✅ direct |
| `BrazeUI` | In-app messages, content cards | ✅ direct |
| `BrazeLocation` | Geofences, location analytics | ⏳ v0.5 (opt-in) |
| `BrazeNotificationService` | Rich push (notification service extension) | ❌ not pulled by the plugin — consumer adds it to their own NSE target. ⏳ undocumented here |
| `BrazePushStory` | Push Stories (content extension) | ❌ v1.0+ (niche) |

**Min iOS:** 12.0+. Plugin sets `s.ios.deployment_target = '15.0'` to match Capacitor 6+ defaults.

**Other Apple platforms:** Swift SDK supports macCatalyst, tvOS, visionOS — Capacitor itself doesn't, so out of scope.

### Web — npm

Single package: `@braze/web-sdk` v6.x.

| Bundle variant | Use case |
|---|---|
| `@braze/web-sdk` (npm) | Standard import; tree-shakeable | ← plugin web fallback uses this |
| `braze.min.js` (CDN) | Full SDK script tag | N/A |
| `braze.core.min.js` (CDN) | Core API, no UI | Optional optimization for non-IAM consumers |
| `braze.no-amd.min.js` (CDN) | No AMD module support | N/A |

**Companion package:** `@braze/service-worker` — required for web push delivery. Plugin docs reference but do not bundle; consumer wires it.

---

## 1. Full capability matrix

Every Braze SDK capability × platform × plugin coverage.

> **Read the "Currently shipped" list below before the matrix.** The matrix is an inventory of what
> *Braze* offers; the **Plugin** column is a coverage *intent*, historically recorded as a ship-train
> milestone. Those milestone labels drifted badly — the 2026-09 audit found nine rows flagged as
> shipped that do not exist, and shipped methods flagged as future work. Rows now carry an explicit
> marker so the two cannot be confused again.

Legend:
- ✅ = supported natively by the Braze SDK on that platform
- ⚠️ = partial / limited
- ❌ = not supported by the Braze SDK
- **Plugin column:** **✅ shipped** = in `src/definitions.ts` today · **⏳ roadmap** = not built, see the roadmap table above · **— ** = never planned. A bare `vN.N` is a historical milestone label with no coverage claim attached.

### Currently shipped (as of `0.2.0`)

**35 public methods + 4 listener events.** This list is the row-by-row truth; where the capability
matrix below disagrees with it, this list wins, and the matrix row is a bug. (The matrix's version
flags were wrong in nine places at the 2026-09 audit — flagging shipped methods as future work and
future work as shipped — so treat a version flag as an intent, not as a coverage claim.)

Identity & attributes:
`echo`, `initialize` (with `sessionTimeoutInSeconds`), `changeUser` (with `sdkAuthSignature`), `getUserId`, `setSdkAuthenticationSignature`, `addAlias`, `setEmail`, `setPhoneNumber`, `setFirstName`, `setLastName`, `setLanguage`, `setCountry`, `setCustomUserAttribute`, `setDateOfBirth`, `setGender`, `setHomeCity`, `getDeviceId`, `addToSubscriptionGroup`, `removeFromSubscriptionGroup`.

Events:
`logCustomEvent`, `logPurchase`, `requestImmediateDataFlush`.

Feature flags (full v0.2 surface):
`getFeatureFlag`, `getAllFeatureFlags`, `refreshFeatureFlags`, `logFeatureFlagImpression`, `addListener('featureFlagsUpdated', ...)`.

Content cards (full v0.1 surface):
`getContentCards`, `requestContentCardsRefresh`, `logContentCardClick`, `logContentCardImpression`, `addListener('contentCardsUpdated', ...)`.

Push:
`registerPushToken` (iOS + Android; throws on web by design per [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md)).

Privacy / lifecycle:
`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`.

In-app messages:
`addListener('inAppMessageReceived', ...)` — a 5-variant tagged union (`slideup` / `modal` / `full` /
`html` / `control`) with buttons, click actions and extras. Rendering is on by default on every
platform; `initialize({ enableInAppMessageUI: false })` keeps the event firing and hands rendering to
the host app.

SDK Authentication:
`addListener('sdkAuthError', ...)`, plus client-side enforcement of `sdkAuthSignature` on
`changeUser` when `enableSdkAuthentication: true`.

`initialize` options:
`apiKey`, `endpoint`, `enableLogging`, `allowInsecureEndpoint`, `sessionTimeoutInSeconds`,
`enableSdkAuthentication`, **`enableInAppMessageUI`** (default `true`), **`enablePushAutomation`**
(default `false`, iOS only).

Listeners (4):
`addListener` / `removeAllListeners` for `featureFlagsUpdated`, `contentCardsUpdated`,
`inAppMessageReceived`, `sdkAuthError`.

Sessions:
Handled automatically on Android as of 0.2.0 (`BrazeActivityLifecycleCallbackListener` registered
once per process during `initialize`). No explicit session methods are exposed on any platform.

### Roadmap — not shipped

Nothing below exists in `src/definitions.ts` today. Grepping for any of these names returns nothing;
several were described in the present tense in earlier revisions of this document.

**Next up, in rough priority order:**

| Item | Why it matters | Notes |
|---|---|---|
| **Capacitor 8 support** | Capacitor 8 is current (8.5.x); the peer dep is `^6 \|\| ^7` and the podspec `< 8.0`, so `npm install` conflicts on a current project | Needs AGP 8.13.0, Gradle 8.14.3, Kotlin 2.2.20, compileSdk 36. Xcode 26 and iOS 15 are already satisfied |
| **SPM support** | Capacitor 8's CLI generates SPM iOS projects by default; a CocoaPods-only plugin does not install into one | Needs `Package.swift` + `CAPBridgedPlugin` conformance. Braze ships a `Package.swift`, so the pieces exist. Track separately from Capacitor 8 |
| `requestPushPermission` | Currently consumers use `@capacitor/push-notifications` for the prompt | See [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md)'s worked counter-example — it would keep the init guard |
| `deepLinkReceived` listener | Would let a consumer vet URLs from push / in-app messages before they open | Today, Capacitor's `server.allowNavigation` is the only control ([`SECURITY.md` §7](./SECURITY.md#7-deep-link-security)) |
| `allowUserSuppliedJavascript` at `initialize` | Braze's default of `false` currently applies and cannot be changed through the plugin | If shipped it defaults `false` and carries the §6 threat model in its JSDoc |
| Android `initialize` options for push presentation | `notificationChannelName`, `notificationChannelDescription`, `smallNotificationIcon`, `fallbackFirebaseMessagingServiceClasspath` — all four setters exist on `BrazeConfig.Builder`; today consumers use `braze.xml` (see C10) | Contract change |
| Content-card `useWebView` | Known asymmetry: the in-app message click action carries it, content cards don't | Needs `BrazeContentCardBase` widened |
| `setInAppMessageDisplayChoice` or similar | `enableInAppMessageUI: false` is all-or-nothing; there is no per-message veto, and Capacitor listeners cannot provide one | Would need a synchronous native hook, not a listener |

**Further out:** banners (web-only), geofences (a separate `capacitor-braze-location` package,
native-only), push action buttons, foreground display control, custom in-app message view factory,
content-card filtering, custom log handler, CSP nonce, push primer prompts, push stories (iOS-only),
Email/SMS subscription types, user-attribute array operations, custom HTTP client, explicit
`optOut`.

**Deliberately not planned:** `isInitialized`. Earlier revisions flagged it as shipped in v0.1; it
has never existed. Every guarded method already rejects with a clear message before `initialize`,
so the consumer's own promise-resolution state is the better signal.

### Known gaps in the shipped surface

Not roadmap items — things that are shipped but imperfect, stated so a reviewer does not have to
find them:

- **Setter return values are discarded.** `setEmail('nonsense')` resolves on every platform even
  when the Braze SDK rejects the value. iOS and Android log a non-PII warning; the Web SDK exposes
  no equivalent signal for most setters, so rejecting would break parity. Tracked as audit finding
  A1-10 and deferred as a contract change.
- **No release has been validated against a live Braze backend.** Everything is verified against the
  in-tree Fastify mock and the real SDKs' compile/runtime surface.
- **`inAppMessageReceived` has no delivery-path test** on any platform; the DTO is covered at the
  serializer level.


### User identity

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `changeUser(userId)` | ✅ | ✅ | ✅ | ✅ shipped |
| `changeUser(userId, sdkAuthSignature)` (JWT) | ✅ | ✅ | ✅ | ✅ shipped |
| `getUserId()` | ✅ | ✅ | ✅ | ✅ shipped |
| Add user alias (`addAlias`) | ✅ | ✅ | ✅ | ✅ shipped |
| Set custom attribute (string/number/bool) | ✅ | ✅ | ✅ | ✅ shipped — array operations are ⏳ roadmap |
| `setEmail`, `setPhoneNumber`, `setFirstName`, `setLastName` | ✅ | ✅ | ✅ | ✅ shipped |
| `setCountry`, `setHomeCity`, `setLanguage`, `setGender`, `setDateOfBirth` | ✅ | ✅ | ✅ | ✅ shipped |
| Subscription group: `addToSubscriptionGroup` / `removeFromSubscriptionGroup` | ✅ | ✅ | ✅ | ✅ shipped |
| Email/push subscription state (`setEmailNotificationSubscriptionType`) | ✅ | ✅ | ✅ | ⏳ roadmap — subscription **groups** are shipped; the notification *type* setters are not |
| User attributes array operations (add/remove) | ✅ | ✅ | ✅ | ⏳ roadmap |

### Events & analytics

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `logCustomEvent(name, properties?)` | ✅ | ✅ | ✅ | ✅ shipped |
| `logPurchase(productId, currency, price, quantity?, properties?)` | ✅ | ✅ | ✅ | ✅ shipped |
| `requestImmediateDataFlush()` | ✅ | ✅ | ✅ | ✅ shipped |
| Session open/close explicit | ✅ | ✅ | ✅ | ⏳ roadmap |
| Session timeout config | ✅ | ✅ | ✅ | ✅ shipped (`sessionTimeoutInSeconds` init option) |

### Push notifications

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Request push permission | ✅ | ✅ | ✅ | ⏳ roadmap — **no `requestPushPermission` exists.** Use `@capacitor/push-notifications` for the prompt |
| Auto push registration | ✅ (FCM) | ✅ (APNs) | ✅ (Web Push) | ⚠️ partial — **there is no `enableAutomaticPushHandling` option.** iOS has `enablePushAutomation` (✅ shipped, default `false`); Android's automatic FCM Installation-ID registration is Braze's own (43.0.0+) and is configured in `braze.xml`, not here (see [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md)) |
| Manual token registration | ✅ | ✅ | N/A | ✅ shipped (`registerPushToken`; throws on web by design) |
| Deep link from push | ✅ | ✅ | ✅ | ⚠️ the SDK's own default routing applies. The plugin does **not** intercept deep links; a `deepLinkReceived` listener is ⏳ roadmap. On iOS, BrazeKit only handles opens/deep links when `enablePushAutomation: true` |
| Rich push (images, video) | ✅ | ✅ (via NSE) | ⚠️ (image only) | ⚠️ on iOS, handled by BrazeKit when `enablePushAutomation: true`; the Notification Service Extension is consumer-side and ⏳ undocumented here |
| Push action buttons | ✅ | ✅ | ⚠️ | ⏳ roadmap |
| Custom notification factory (Android) / handler (iOS) | ✅ | ✅ | N/A | ⏳ roadmap |
| Push Stories | ⚠️ | ✅ (extension) | ❌ | ⏳ roadmap |
| Push primer prompt UI | ⚠️ | ✅ | ⚠️ | ⏳ roadmap |
| Foreground push display | ✅ | ✅ | ✅ | ⏳ roadmap |
| `unregisterPush` / token cleanup | ✅ | ✅ | ✅ | ⏳ roadmap |

### In-app messages (IAM)

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Auto-display | ✅ | ✅ | ✅ | ✅ shipped — on by default; `initialize({ enableInAppMessageUI: false })` opts out |
| Subscribe to IAM events (`addListener`) | ✅ | ✅ | ✅ | ✅ shipped (`inAppMessageReceived`) |
| Return discard / reenqueue / display from listener | ✅ | ✅ | ✅ | ❌ **not possible through a Capacitor listener** — they are fire-and-forget with no return channel to native. The plugin always returns display-now. `enableInAppMessageUI: false` is the all-or-nothing alternative; a per-message veto is ⏳ roadmap and would need a different shape ([`SECURITY.md` §6](./SECURITY.md#6-in-app-message-xss-risk)) |
| Log impression / click / button click (in-app messages) | ✅ | ✅ | ✅ | ⏳ roadmap — **no IAM impression/click methods exist.** The SDK logs these itself when it renders. (The *content card* equivalents **are** shipped — see below) |
| Modal, full-screen, slideup native templates | ✅ | ✅ | ✅ | ✅ shipped (rendered by Braze) |
| HTML in-app message (rendered in WebView) | ✅ | ✅ | ✅ | ✅ shipped as a DTO variant (`html`), which occurs on iOS and Android only. `allowUserSuppliedJavascript` is **not** exposed by the plugin; Braze's default of `false` applies ([`SECURITY.md` §6](./SECURITY.md#6-in-app-message-xss-risk)) |
| Custom IAM view factory | ✅ | ✅ | ⚠️ | ⏳ roadmap |
| Programmatic show / dismiss | ✅ | ✅ | ✅ | ⏳ roadmap |

### Content Cards

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Fetch / refresh | ✅ | ✅ | ✅ | ✅ shipped (`getContentCards`) |
| Subscribe to updates | ✅ | ✅ | ✅ | ✅ shipped |
| Log impression / click / dismissal | ✅ | ✅ | ✅ | ✅ shipped: `logContentCardImpression`, `logContentCardClick`. Dismissal is ⏳ roadmap |
| Native UI rendering | ✅ | ✅ | ✅ | ⏳ roadmap (most consumers render their own) |
| Filter by tag / type | ✅ | ✅ | ✅ | ⏳ roadmap |
| Pinned cards | ✅ | ✅ | ✅ | ⏳ roadmap |

### Feature flags

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `getFeatureFlag(flagId)` | ✅ | ✅ | ✅ | ✅ shipped |
| Typed property accessors (string/number/boolean/image/datetime/jsonobject) | ✅ | ✅ | ✅ | ✅ shipped (per-platform-native dispatch, C02 tagged-union DTO) |
| Subscribe to updates (`featureFlagsUpdated` listener) | ✅ | ✅ | ✅ | ✅ shipped |
| Refresh on demand (`refreshFeatureFlags`) | ✅ | ✅ | ✅ | ✅ shipped |
| Log impression (`logFeatureFlagImpression`) | ✅ | ✅ | ✅ | ✅ shipped |

### Banners (web SDK only)

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `getBanner(placementId)` | ❌ | ❌ | ✅ | ⏳ roadmap (would be web-only) |
| `insertBanner` | ❌ | ❌ | ✅ | ⏳ roadmap |
| Subscribe to banner updates | ❌ | ❌ | ✅ | ⏳ roadmap |

### Geofences & location

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Geofence monitoring | ✅ (location module) | ✅ (BrazeLocation) | ❌ | ⏳ roadmap — would be a separate opt-in `capacitor-braze-location` package; the base plugin pulls no location module |
| Location analytics | ✅ | ✅ | ❌ | ⏳ roadmap |

### SDK Authentication (signed JWT)

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Enable in config | ✅ | ✅ | ✅ | ✅ shipped (`enableSdkAuthentication`) |
| Pass JWT signature on `changeUser` | ✅ | ✅ | ✅ | ✅ shipped — and **enforced client-side** on all three bridges when SDK Auth is on |
| Subscribe to auth failures | ✅ | ✅ | ✅ | ✅ shipped (`sdkAuthError`). On iOS it was wired to the wrong delegate protocol and never fired until 0.2.0 |
| Refresh signature mid-session | ✅ | ✅ | ✅ | ✅ shipped (`setSdkAuthenticationSignature`) |

See [`SECURITY.md` §2](./SECURITY.md) for the full security model.

### Data privacy & lifecycle

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `wipeData()` | ✅ | ✅ | ✅ | ✅ shipped, init-independent ([C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md)); see that MDC for the two pre-init platform caveats |
| `enableSDK()` / `disableSDK()` | ✅ | ✅ | ✅ | ✅ shipped, init-independent on all three platforms as of 0.2.0 |
| `getDeviceId()` | ✅ | ✅ | ✅ | ✅ shipped — **init-dependent** on all three platforms by design ([C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md)) |
| `isInitialized()` | ✅ | ✅ | ✅ | — not planned. **Never existed in this plugin**, despite an earlier `v0.1` flag here. Every guarded method rejects clearly before `initialize` |
| `isDisabled()` | ✅ | ✅ | ✅ | ✅ shipped, init-independent |
| Explicit `optOut` | ⚠️ (via disableSDK) | ⚠️ | ⚠️ | — not planned; `disableSDK()` is the method, and a second name for it would be worse |

### Logging & configuration

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `enableLogging` (verbose) | ✅ | ✅ | ✅ | ✅ shipped (default `false`) |
| Custom log handler | ✅ | ✅ | ✅ | ⏳ roadmap |
| Custom endpoint / `baseUrl` | ✅ | ✅ | ✅ | ✅ shipped (required for tests) |
| Custom HTTP client (Android) | ✅ | ❌ | N/A | ⏳ roadmap |
| Content Security Policy nonce (web) | ❌ | ❌ | ✅ | ⏳ roadmap (web only) |

---

## 2. Plugin version roadmap

The capability matrix above is summarized into ship-train milestones.

### v0.1 — Daily-use surface (target: 3 weeks from scaffold)

The minimum coherent plugin: lets a consumer initialize Braze, identify users (with SDK Auth), log events and purchases, handle push, receive in-app messages, and read content cards. Scoped at roughly 15 public methods; **what actually shipped by `0.1.0` was 35 methods + 4 listener events**, because feature flags, content cards and the privacy quartet all landed early. The milestone names below are historical ship-train labels, not a description of the current surface — see "Currently shipped" above for that.

Method list: [`PLAN.md §4`](./PLAN.md).

### v0.2 — Enrichment (target: +4 weeks after v0.1)

Adds the next tier of commonly-needed features without doubling the surface area.

- Feature flags (full surface — 5 methods)
- Subscription groups + notification preferences (3 methods)
- Standard demographic attributes (gender, DOB, country, etc.) — extends `setCustomAttribute`
- Push enrichment: action buttons, foreground display, unregister, rich push docs
- Session timeout in init config
- CSP nonce (web-only init option)
- SDK Auth signature refresh
- `isDisabled()`, `getDeviceId()` — both shipped early, in `0.1.0`

### v0.5 — Power features (target: +8 weeks after v0.2)

Features that real Braze power users need but most consumers don't.

- Geofences + location (opt-in via separate sub-module install)
- Custom notification factory (Android) / push handler (iOS)
- Programmatic IAM show/dismiss
- Content Cards filtering, pinned cards
- Banners (web-only)
- Custom log handler
- Session open/close explicit
- User array attribute operations (add/remove)
- Push primer prompt UI helper

### v1.0 — Comprehensive (target: ≥6 months after 0.1, gated on ≥5 production users)

Final 10% of niche features. Plugin is declared stable and follows strict semver post-1.0.

- Custom IAM view factory
- Push Stories (iOS extension docs)
- Custom HTTP client (Android)
- Any new Braze SDK surface introduced 0.1 → 1.0

### Permanently out of scope

The plugin will never wrap these:

| Capability | Why excluded |
|---|---|
| Compose-specific Braze module | Capacitor consumers don't write Compose UI |
| Unity engine module | Capacitor isn't Unity |
| macCatalyst / tvOS / visionOS / watchOS | Capacitor doesn't target these |
| Braze REST API (server endpoints like `/users/track`) | Wrong layer — that's a server SDK, separate project |
| Custom data ingestion / CDP-style routing | Out of scope; consumers can chain in user code |

The exclusion list is part of scope discipline — it's how the plugin stays maintainable.

---

## 3. Cross-platform divergence notes

Where the SDKs genuinely differ, the plugin must handle gracefully:

| Divergence | How the plugin handles it |
|---|---|
| Web has no push tokens — Web Push uses VAPID + Service Worker subscriptions | `registerPushToken` **throws a plain `Error`** on web whose message names the platform, the reason, and the `Capacitor.getPlatform()` branching remedy. This is the plugin's only implemented divergence-by-absence, and the template [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) prescribes for future ones. |
| In-app message rendering — native uses `UIView` / `Activity`, web uses a DOM modal | `addListener('inAppMessageReceived')` emits the identical 5-variant tagged union on all three platforms, so consumer code is portable. The `html` variant only ever occurs on iOS and Android. |
| In-app message `language` | Braze's Android in-app message models have no accessor for it at 43.2.0, so the field is omitted from the contract on **every** platform rather than being always-`null` on one. |
| Anonymous user id sentinels — web `null \| undefined`, iOS `nil`, Android `""` | All coalesced to `null` at the bridge. Empty string is never a contract sentinel. |
| `wipeData()` before `initialize` | iOS disables the SDK for the rest of the app run (BrazeKit constraint); web has no storage manager yet and resolves without effect; Android wipes normally. Documented in the JSDoc, [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md) and the README. |
| `wipeData()` scope — web also clears the device cookie, native clears keychain / keystore | Documented; local only. Server-side deletion is a REST call from the consumer's backend. |
| Custom attribute array max length differs by platform | Documented as the lowest common denominator (Braze docs: 100 items); not enforced client-side. |
| Push Stories — iOS only (notification content extension) | Not in the TS interface at all. |

**Session timeout takes seconds on every platform.** An earlier revision of this section claimed the
plugin converted seconds to milliseconds for Android; it does not, and Braze's Android API takes
seconds — a reader who trusted that note would have "fixed" a non-bug into a 1000× error.

**Principle:** prefer TS-side type narrowing over runtime errors where possible. Where runtime
divergence is unavoidable, throw a plain `Error` whose message names the platform, the reason and
the remedy, following the C01 format so consumers can match on the `Braze.<method>: ` prefix.

**There is no error class hierarchy.** `BrazeUnsupportedError`, `UnsupportedOperationError` and
`BrazeAuthRequiredError` were all described in the present tense across this document,
`SECURITY.md`, `CONTRIBUTING.md` and `REVIEW_READINESS.md`; none has ever existed. A consumer
writing `catch (e) { if (e instanceof BrazeUnsupportedError) … }` gets a `ReferenceError`.
Introducing one is a contract change that needs a roadmap entry here first.

---

## 4. Native SDK pinning & bump policy

| Layer | Pin style | Rationale |
|---|---|---|
| `com.braze:android-sdk-ui` | Exact version (`43.2.0`, not `[43.0,44.0)`) | Reproducible CI; avoid surprise breakages from transitive minor bumps. |
| `BrazeKit` / `BrazeUI` (Podspec) | Exact version (`18.2.1`) | Same reasoning. Carries an **Xcode 26+** floor. |
| `@braze/web-sdk` (peer dep) | Caret range (`^6.13.0`) | Consumers bring their own; we declare a compatibility window. The floor is a **security** floor — 6.12.1 fixed an in-app message `javascript:`/`data:` URI bypass of `allowUserSuppliedJavascript`. |

**Bump cadence:**
- Patch Braze SDK release → plugin patch bump (`0.x.y+1`), same day if smoke tests pass.
- Minor Braze SDK release → plugin minor bump, after 1-week soak in beta tag.
- Major Braze SDK release → **post-1.0: plugin major bump. Pre-1.0: a plugin minor with explicit `BREAKING:` lines in the CHANGELOG.** See [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) step 8; this rule was contradictory until 0.2.0.

**Tracking:**
- Subscribe to Braze SDK release notes per platform. This is the only mechanism — **there is no spec-drift job and no scheduled workflow of any kind**; nothing in CI talks to Braze.
- Dependabot watches five directories: the plugin's own dev deps (`/`), `/example`, `/demo`, `/test/web`, `/test/mock-server`, plus `github-actions`. It does **not** bump the pinned Braze SDK versions, and `@capacitor/*` majors are ignored.
- CI compiles both native bridges against the pinned SDKs on every PR, which catches a symbol that moved — not a behaviour that changed.

---

## 5. Bundle size & performance

### Bundle size targets

| Platform | Native SDK overhead | Plugin overhead | Total target |
|---|---|---|---|
| Android (release APK) | ~600 KB (Braze SDK) | <50 KB (plugin .aar) | < 700 KB added |
| iOS (release IPA) | ~3–5 MB (BrazeKit + BrazeUI) | <100 KB (plugin .framework) | < 5 MB added |
| Web (gzipped) | ~80 KB (`@braze/web-sdk` full) or ~30 KB (core only) | < 5 KB (plugin TS) | < 90 KB added |

### Performance principles

1. **Lazy native init** — Braze SDKs are heavy. Don't load until `initialize()` is called. Capacitor's plugin registration is lazy by default; preserve this.
2. **Avoid bridge round-trips on hot paths** — event logging is async and fire-and-forget. Never `await` on `logCustomEvent` in tight loops; document the perf pattern.
3. **Listener efficiency** — IAM / Content Cards / Feature Flags subscriptions cross the bridge per event. Use Capacitor's batched event system; don't reinvent.
4. **No JS-thread blocking from native** — all native bridge methods resolve via Capacitor's async dispatch; never use sync calls.
5. **Memory: avoid retaining JS callbacks in native** — store handle IDs, look up callbacks JS-side. Standard Capacitor pattern.
6. **Tree-shaking** — TS API is structured so unused methods (`logPurchase` if consumer never calls it) can be eliminated by bundler.

### Web SDK variant selection

**There is no core/UI variant split.** `src/web.ts` does a single `await import('@braze/web-sdk')` —
the full package, one dynamic import. Neither `automaticallyShowInAppMessages` nor
`showContentCards` is a plugin method. An earlier revision claimed a ~50 KB saving from a mechanism
that does not exist.

What *is* true: the import is dynamic, so the Web SDK is not pulled into the initial chunk and is
only fetched when a plugin method runs. Consumers who never touch Braze on a given route do not pay
for it.

Note also that the plugin ships **ESM and CJS only** as of 0.2.0. The Capacitor template's
IIFE/`unpkg` artifact was removed: it contained `await import('@braze/web-sdk')`, a bare specifier no
browser resolves from a `<script>` tag, so it could never have worked standalone.

The bundle-size targets in the table above are **aspirational** — nothing in CI enforces them and
there is no `size-limit` configuration.

---

## 6. SSR / framework caveats (web fallback)

The web fallback inherits all of `@braze/web-sdk`'s framework gotchas. Plugin docs must cover:

| Framework | Issue | Fix |
|---|---|---|
| **Next.js** (App Router) | Direct import in server components throws | Use dynamic import in client component: `const { Braze } = await import('capacitor-braze')` |
| **Vite** | `@braze/web-sdk` breaks dep pre-bundling | Add to `optimizeDeps.exclude` in `vite.config.ts` |
| **Webpack** | Magic comments needed for SSR | Document in README |
| **Jest** | `@braze` not transformed by default | Add `transformIgnorePatterns: ['node_modules/(?!@braze)']` |
| **Electron** | No web push support | Document; consumer must use native push channel instead |

These are not plugin bugs — they're inherited from `@braze/web-sdk` — but the README must surface them so consumers don't blame us.

---

## 7. References

- [Braze Android SDK GitHub](https://github.com/braze-inc/braze-android-sdk) ([KDoc](https://braze-inc.github.io/braze-android-sdk/kdoc/))
- [Braze Swift SDK GitHub](https://github.com/braze-inc/braze-swift-sdk)
- [Braze Web SDK GitHub](https://github.com/braze-inc/braze-web-sdk)
- [Braze SDK Integration docs](https://www.braze.com/docs/developer_guide/sdk_integration)
- [Braze API endpoints reference](https://www.braze.com/docs/api/basics)
- Plugin docs: [`PLAN.md`](./PLAN.md) | [`SECURITY.md`](./SECURITY.md) | [`CLAUDE.md`](./CLAUDE.md)
