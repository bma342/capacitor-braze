# Braze SDK Surface — Full Catalog & Plugin Coverage

> Comprehensive map of every Braze SDK capability across Android, iOS, and Web, with the plugin's coverage roadmap. This document is the authoritative inventory; [`PLAN.md`](./PLAN.md) is the strategic plan, [`SECURITY.md`](./SECURITY.md) is the security model.

**Last updated:** 2026-05-19
**Native SDK versions tracked:**
- `com.braze:android-sdk-ui` — **v42.2.0** (released 2026-04-29)
- `BrazeKit` / `BrazeUI` — **v14.1.0**
- `@braze/web-sdk` — **v6.7.x**

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

**Min SDK:** API 21 (officially supported API 25+). Plugin sets `minSdkVersion = 26` to match modern Capacitor norms and avoid the unsupported zone.

**Kotlin / Build deps:** Kotlin 2.2.x, FCM 24.1.x — these are Braze's pins; the plugin inherits.

### iOS — Swift Package Manager / CocoaPods

| Module | Purpose | Plugin pulls? |
|---|---|---|
| `BrazeKit` | Core analytics, push, events | ✅ direct |
| `BrazeUI` | In-app messages, content cards | ✅ direct |
| `BrazeLocation` | Geofences, location analytics | ⏳ v0.5 (opt-in) |
| `BrazeNotificationService` | Rich push (notification service extension) | ⏳ v0.2 (docs only — consumer adds to their NSE target) |
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

Every Braze SDK capability × platform × plugin coverage. The matrix is the source of truth for what we support, what's planned, and what's intentionally excluded.

Legend:
- ✅ = supported natively by the SDK on that platform
- ⚠️ = partial / limited
- ❌ = not supported by the SDK
- **v0.1 / v0.2 / v0.5 / v1.0 / —** = plugin coverage target (— = never)

### Currently shipped (as of 0.0.12)

This is the row-by-row truth that the matrix below references via version targets. Items in **bold below were already targeted to a version are also already shipped**.

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

Listeners:
`addListener` / `removeAllListeners` for the two events above.

### Not yet shipped — planned per their version target

In-app messages (all of v0.1's IAM row), push permission request, push action buttons, foreground display, deep link routing, banners (web-only), geofences, custom IAM view factory, content card filtering, session open/close explicit, custom log handler, CSP nonce, push primer prompts, push stories, Email/SMS notification subscription type, user attribute array operations, custom HTTP client, `isInitialized`, explicit `optOut`.


### User identity

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `changeUser(userId)` | ✅ | ✅ | ✅ | **v0.1** |
| `changeUser(userId, sdkAuthSignature)` (JWT) | ✅ | ✅ | ✅ | **v0.1** |
| `getUserId()` | ✅ | ✅ | ✅ | **v0.1** |
| Add user alias (`addAlias`) | ✅ | ✅ | ✅ | **v0.2** |
| Set custom attribute (string/number/bool/array) | ✅ | ✅ | ✅ | **v0.1** |
| `setEmail`, `setPhoneNumber`, `setFirstName`, `setLastName` | ✅ | ✅ | ✅ | **v0.1** |
| `setCountry`, `setHomeCity`, `setLanguage`, `setGender`, `setDateOfBirth` | ✅ | ✅ | ✅ | **v0.2** |
| Subscription group: `addToSubscriptionGroup` / `removeFromSubscriptionGroup` | ✅ | ✅ | ✅ | **v0.2** |
| Email/push subscription state (`setEmailNotificationSubscriptionType`) | ✅ | ✅ | ✅ | **v0.2** |
| User attributes array operations (add/remove) | ✅ | ✅ | ✅ | **v0.5** |

### Events & analytics

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `logCustomEvent(name, properties?)` | ✅ | ✅ | ✅ | **v0.1** |
| `logPurchase(productId, currency, price, quantity?, properties?)` | ✅ | ✅ | ✅ | **v0.1** |
| `requestImmediateDataFlush()` | ✅ | ✅ | ✅ | **v0.1** |
| Session open/close explicit | ✅ | ✅ | ✅ | **v0.5** |
| Session timeout config | ✅ | ✅ | ✅ | **v0.2** (via init options) |

### Push notifications

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Request push permission | ✅ | ✅ | ✅ | **v0.1** |
| Auto push registration | ✅ (FCM) | ✅ (APNs) | ✅ (Web Push) | **v0.1** (`enableAutomaticPushHandling` flag) |
| Manual token registration | ✅ | ✅ | N/A | **v0.1** (`registerPushToken`) |
| Deep link from push | ✅ | ✅ | ✅ | **v0.1** (default routing) |
| Rich push (images, video) | ✅ | ✅ (via NSE) | ⚠️ (image only) | **v0.2** (docs for NSE setup) |
| Push action buttons | ✅ | ✅ | ⚠️ | **v0.2** |
| Custom notification factory (Android) / handler (iOS) | ✅ | ✅ | N/A | **v0.5** |
| Push Stories | ⚠️ | ✅ (extension) | ❌ | v1.0+ |
| Push primer prompt UI | ⚠️ | ✅ | ⚠️ | **v0.5** |
| Foreground push display | ✅ | ✅ | ✅ | **v0.2** |
| `unregisterPush` / token cleanup | ✅ | ✅ | ✅ | **v0.2** |

### In-app messages (IAM)

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Auto-display | ✅ | ✅ | ✅ | **v0.1** (default on) |
| Subscribe to IAM events (`addListener`) | ✅ | ✅ | ✅ | **v0.1** |
| Return discard / reenqueue / display from listener | ✅ | ✅ | ✅ | **v0.1** |
| Log impression / click / button click | ✅ | ✅ | ✅ | **v0.1** |
| Modal, full-screen, slideup native templates | ✅ | ✅ | ✅ | **v0.1** (rendered by Braze) |
| HTML IAM (rendered in WebView) | ✅ | ✅ | ✅ | **v0.2** (requires `allowUserSuppliedJavascript`) |
| Custom IAM view factory | ✅ | ✅ | ⚠️ | v1.0+ |
| Programmatic show / dismiss | ✅ | ✅ | ✅ | **v0.5** |

### Content Cards

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Fetch / refresh | ✅ | ✅ | ✅ | **v0.1** (`getContentCards`) |
| Subscribe to updates | ✅ | ✅ | ✅ | **v0.1** |
| Log impression / click / dismissal | ✅ | ✅ | ✅ | **v0.1** |
| Native UI rendering | ✅ | ✅ | ✅ | **v0.5** (most consumers render their own) |
| Filter by tag / type | ✅ | ✅ | ✅ | **v0.5** |
| Pinned cards | ✅ | ✅ | ✅ | **v0.5** |

### Feature flags

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `getFeatureFlag(flagId)` | ✅ | ✅ | ✅ | **v0.2** |
| Typed property accessors (bool/number/string/json) | ✅ | ✅ | ✅ | **v0.2** |
| Subscribe to updates | ✅ | ✅ | ✅ | **v0.2** |
| Refresh on demand | ✅ | ✅ | ✅ | **v0.2** |
| Log impression | ✅ | ✅ | ✅ | **v0.2** |

### Banners (web SDK only)

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `getBanner(placementId)` | ❌ | ❌ | ✅ | **v0.5** (web-only on plugin too) |
| `insertBanner` | ❌ | ❌ | ✅ | **v0.5** |
| Subscribe to banner updates | ❌ | ❌ | ✅ | **v0.5** |

### Geofences & location

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Geofence monitoring | ✅ (location module) | ✅ (BrazeLocation) | ❌ | **v0.5** (opt-in, separate sub-module) |
| Location analytics | ✅ | ✅ | ❌ | **v0.5** |

### SDK Authentication (signed JWT)

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| Enable in config | ✅ | ✅ | ✅ | **v0.1** |
| Pass JWT signature on `changeUser` | ✅ | ✅ | ✅ | **v0.1** |
| Subscribe to auth failures | ✅ | ✅ | ✅ | **v0.1** |
| Refresh signature mid-session | ✅ | ✅ | ✅ | **v0.2** |

See [`SECURITY.md` §2](./SECURITY.md) for the full security model.

### Data privacy & lifecycle

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `wipeData()` | ✅ | ✅ | ✅ | **v0.1** |
| `enableSDK()` / `disableSDK()` | ✅ | ✅ | ✅ | **v0.1** |
| `getDeviceId()` | ✅ | ✅ | ✅ | **v0.2** |
| `isInitialized()` | ✅ | ✅ | ✅ | **v0.1** |
| `isDisabled()` | ✅ | ✅ | ✅ | **v0.2** |
| Explicit `optOut` | ⚠️ (via disableSDK) | ⚠️ | ⚠️ | **v0.2** (alias for clarity) |

### Logging & configuration

| Capability | Android | iOS | Web | Plugin |
|---|---|---|---|---|
| `enableLogging` (verbose) | ✅ | ✅ | ✅ | **v0.1** (default `false`) |
| Custom log handler | ✅ | ✅ | ✅ | **v0.5** |
| Custom endpoint / `baseUrl` | ✅ | ✅ | ✅ | **v0.1** (required for tests) |
| Custom HTTP client (Android) | ✅ | ❌ | N/A | v1.0+ |
| Content Security Policy nonce (web) | ❌ | ❌ | ✅ | **v0.2** (web only) |

---

## 2. Plugin version roadmap

The capability matrix above is summarized into ship-train milestones.

### v0.1 — Daily-use surface (target: 3 weeks from scaffold)

The minimum coherent plugin: lets a consumer initialize Braze, identify users (with SDK Auth), log events and purchases, handle push, receive in-app messages, and read content cards. ~15 public methods.

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
- `isDisabled()`, `getDeviceId()`, explicit `optOut` alias

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

| Divergence | How plugin handles |
|---|---|
| Web has no native push — only Web Push API | `requestPushPermission` returns `{ granted, mechanism: 'web-push' \| 'apns' \| 'fcm' }`; consumer can branch. |
| Web has no geofences | `addGeofence` on web throws `UnsupportedOperationError` with message pointing to docs. |
| Banners are web-only | `getBanner` on native throws `UnsupportedOperationError`. |
| IAM rendering — native uses `UIView` / `Activity`; web uses DOM modal | Plugin's `addListener('inAppMessageReceived')` returns identical shape on all platforms so consumer code is portable. |
| Session timeout config option is in milliseconds (Android) vs. seconds (iOS) vs. seconds (web) | Plugin accepts seconds in TS API, converts to ms internally on Android. |
| Custom attribute array max length differs by platform | Plugin documents the lowest common denominator (Braze docs: 100 items). |
| `wipeData()` on web also clears the device cookie; on native, clears keychain/keystore | Documented; consumer should call after logout flow. |
| Push Stories — iOS only (notification content extension) | iOS-only API; not in TS interface at all. |

**Principle:** prefer TS-side type narrowing over runtime errors where possible. Where runtime divergence is unavoidable, throw a typed `BrazeUnsupportedError` with a `platform` field and a doc link.

---

## 4. Native SDK pinning & bump policy

| Layer | Pin style | Rationale |
|---|---|---|
| `com.braze:android-sdk-ui` | Exact version (`42.2.0`, not `[42.0,43.0)`) | Reproducible CI; avoid surprise breakages from transitive minor bumps. |
| `BrazeKit` / `BrazeUI` (Podfile / Podspec) | Exact version | Same reasoning. |
| `@braze/web-sdk` (peer dep) | Caret range (`^6.0.0`) | Consumers bring their own; we declare compatibility window. |

**Bump cadence:**
- Patch Braze SDK release → plugin patch bump (`0.x.y+1`), same day if smoke tests pass.
- Minor Braze SDK release → plugin minor bump, after 1-week soak in beta tag.
- Major Braze SDK release → plugin major bump (pre-1.0: minor bump documented loudly).

**Tracking:**
- Subscribe to Braze SDK release notes per platform.
- Dependabot configured for the example app (not the plugin itself — those are pinned).
- Daily spec-drift CI catches REST contract changes; does NOT catch native API changes (those come from release notes).

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

The plugin's `web.ts` imports the **core** variant by default (`@braze/web-sdk` tree-shaken without UI), and lazily imports the UI variant only when consumer calls `automaticallyShowInAppMessages` or `showContentCards`. Saves ~50 KB gzipped for consumers who render their own UI.

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
