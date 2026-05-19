# Changelog

All notable changes to `capacitor-braze` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0: minor versions may include breaking changes (documented loudly here). Post-1.0: strict semver.

## [Unreleased]

### Pinned native SDK versions
- `com.braze:android-sdk-ui` — **42.2.0**
- `BrazeKit` / `BrazeUI` — **14.1.0**
- `@braze/web-sdk` — peer dep `^6.0.0`

## [0.0.11] — 2026-05-19

### Added — `registerPushToken` (Phase M)

`Braze.registerPushToken({ token })` on iOS + Android. The plugin's
first method that diverges by absence on one platform — web throws.

Recommended consumer wiring:

```ts
import { PushNotifications } from '@capacitor/push-notifications';
import { Braze } from 'capacitor-braze';

PushNotifications.addListener('registration', async ({ value }) => {
  await Braze.registerPushToken({ token: value });
});
```

Per-platform behavior:

- **iOS:** hex-decodes the APNs token string with a local `dataFromHex`
  helper (tolerates whitespace and the `<...>` debug-print wrapper) and
  hands the `Data` to BrazeKit's `notifications.register(deviceToken:)`.
- **Android:** assigns the FCM token string to
  `Braze.getInstance(context).registeredPushToken`. No decoding step
  — FCM tokens are already strings.
- **Web:** throws `Error` with the C03-prescribed shape: what failed,
  why (Web Push uses VAPID + Service Worker subscriptions), what to do
  instead (`Capacitor.getPlatform()` branch).

[C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) gains a new
section "When a method legitimately doesn't exist on one platform"
codifying the pattern. Future divergent methods (banners, geofences,
Push Stories) follow the same shape.

Surface: **34 callable methods** + `addListener` / `removeAllListeners`
for two events.

### Changed — podspec renamed to `CapacitorBraze.podspec`

Capacitor's plugin convention is that the Pod name matches the PascalCase
of the npm package name: `@capacitor/preferences` → `CapacitorPreferences`,
`capacitor-braze` → `CapacitorBraze`. Renaming our podspec to match means
`cap sync` in consumer apps resolves the plugin automatically without any
Podfile customization.

`BrazePlugin.podspec` → `CapacitorBraze.podspec`. `s.name = 'BrazePlugin'`
→ `s.name = 'CapacitorBraze'`. The npm package itself stays
`capacitor-braze`. No Swift class name change — the bridge class is still
`@objc(BrazePlugin)` on the Obj-C runtime side, and the JS plugin name
`Braze` is unchanged.

Pre-1.0 breaking change: any external Podfile that hardcoded
`pod 'BrazePlugin'` will need to update to `pod 'CapacitorBraze'`.
No npm consumers are affected because the plugin hasn't been published
to npm yet.

### Changed — plugin re-exports `PluginListenerHandle`

`PluginListenerHandle` (from `@capacitor/core`) is now re-exported from
`capacitor-braze` so consumers writing typed listener handlers can rely
on a single import line:

```ts
import { Braze, type PluginListenerHandle } from 'capacitor-braze';
```

No behavior change — it's literally the same type from `@capacitor/core`.
The re-export removes a paper cut that surfaced when wiring the demo's
content-cards listener.

### Added — iOS + Android Capacitor platforms in `demo/`

`demo/` now ships with both native projects added via `npx cap add ios`
and `npx cap add android`. A consumer cloning this repo can open the
Xcode workspace or Android Studio project directly — no separate
bootstrap step beyond `npm install && npx cap sync`.

iOS Podfile pins:

  platform :ios, '15.0'
  use_frameworks! :linkage => :static

`platform 15.0` because BrazeKit 14.x requires iOS 15+. Capacitor's
default `13.0` is below BrazeKit's floor and would fail `pod install`.

`use_frameworks! :linkage => :static` because BrazeKit ships as a
static XCFramework. Capacitor's default `use_frameworks!` (dynamic) is
incompatible — CocoaPods refuses to mix static dependencies into a
dynamic-linkage target and aborts with a not-quite-warning. Per Braze
iOS install docs, static linkage across the whole app target is the
recommended setup when BrazeKit is in the dependency graph.

Both platforms' `.gitignore` files keep Pods, build artifacts, and
local Xcode user data out of the repo. Total committed footprint for
both platforms is ~700K + 70 files.

### Added — `demo/` Capacitor reference app (not published, dev artifact)

A second app alongside `example/`, purpose-built as a fork-as-starter
reference. Different audience from `example/`:

- `example/` is the developer testbed (every plugin method = a button +
  log line). For maintainers verifying changes.
- `demo/` is a production-feeling Capacitor app with realistic flows
  across two verticals (restaurant ordering + e-commerce). For
  consumers evaluating the plugin or starting a real integration.

L.1 ships the scaffold: Vite 6 + React 19 + Tailwind 4 (CSS-first
config) + TanStack Router + Zustand 5 + Capacitor 6. Mock auth via
Zustand persist. Bottom nav, top bar with cart badge, login page,
home page wired to `Braze.changeUser` + `Braze.logCustomEvent`. The
other tabs (`/restaurants`, `/shop`, `/cart`, `/checkout`,
`/promotions`, `/profile`, `/settings`) are routed but contain
placeholders — phased rollout per `demo/README.md`.

Not Aromo-derived. The demo is a standalone reference; no Aromo
backend, branding, or code is involved.

CI gains a `build-demo` job that builds the demo against the freshly
built plugin (mirrors `build-example`).

## [0.0.10] — 2026-05-19

### Added — Content cards read API + `contentCardsUpdated` listener (Phase K)

The first phase to apply the MDC set end-to-end. Four read-side
methods plus a listener event. The DTO is a discriminated union
matching the Web SDK's `Card` class hierarchy per [C02](./docs/mdcs/C02-DTO-SHAPES.md);
the listener wiring follows the eager-on-init pattern per [C05](./docs/mdcs/C05-LISTENERS.md).

- `Braze.getContentCards()` → `{ cards: BrazeContentCard[]; lastUpdated: number | null }`.
  Reads from the SDK's local cache. `lastUpdated` is Unix epoch ms
  (`null` if never fetched).
- `Braze.requestContentCardsRefresh()` — fire-and-forget; resolves
  once the refresh has been dispatched. Use the listener for the
  fresh card payload, or re-read after a short delay.
- `Braze.logContentCardClick({ cardId })` — call when the user
  taps a card. Only needed when bypassing Braze's built-in display.
- `Braze.logContentCardImpression({ cardId })` — call when a card
  scrolls into view.
- `Braze.addListener('contentCardsUpdated', cb)` — fires on every
  card refresh. Payload matches `getContentCards` shape; no initial
  state replay (consumer reads via `getContentCards` once after
  `addListener` to seed UI).

### `BrazeContentCard` DTO

Tagged union over four card variants:

- `'classic'` — title + description + optional image + optional URL
- `'captionedImage'` — title + description + required image
- `'imageOnly'` — required image, no title
- `'control'` — multivariate-test control arm; impression-logged
  but not rendered

`type` is the discriminator; narrow with
`if (card.type === 'classic') { ... }`. The shape mirrors the
Web SDK's `Card` class hierarchy verbatim; iOS maps from
`Braze.ContentCard` enum cases (`.classic`, `.captionedImage`,
`.imageOnly`, `.control`); Android maps from the SDK subclass
hierarchy (`ShortNewsCard`, `CaptionedImageCard`, `BannerImageCard`,
`TextAnnouncementCard`, `ControlCard`).

### Cross-platform translation notes

- **Android `TextAnnouncementCard`** folds into the `'classic'` type
  (title + description, no image). The Android SDK distinguishes
  short-news from text-announcement based on whether an image is
  configured; the plugin contract treats both as classic since the
  visible shape is identical.
- **Date fields** are Unix epoch milliseconds across all three
  platforms. Web converts via `Date.getTime()`; iOS via
  `timeIntervalSince1970 * 1000`; Android via the SDK's
  seconds-from-epoch fields multiplied by 1000.
- **Web `logContentCardClick` takes a `Card` instance** (not an id).
  The web bridge looks up the cached card by id before forwarding;
  cache-miss is a reject pointing the consumer at `getContentCards`.

### Improved

- C02 (DTO shapes) and C05 (listeners) MDCs gain content-card worked
  examples.
- Plugin surface: **33 callable methods** + `addListener` /
  `removeAllListeners` for two events.

### Improved — Capacitor official toolchain alignment

Adopts the dev-tooling stack that Capacitor's own first-party plugins use
(ESLint + Prettier + SwiftLint + `@capacitor/docgen`) with the matching
`@ionic/*` config presets. No source-code logic change; the same plugin
surface ships, now under the conventions a Capacitor plugin author
expects to find.

- Dev deps added: `eslint`, `prettier`, `swiftlint`, `@capacitor/docgen`,
  `@ionic/eslint-config`, `@ionic/prettier-config`, `@ionic/swiftlint-config`.
- Scripts added: `lint`, `fmt`, `eslint`, `prettier`, `swiftlint`,
  `docgen`, `verify`, `verify:web`.
- `npm run build` now also runs `docgen`, regenerating the API reference
  section of `README.md` from `definitions.ts` JSDoc on every build.
- CI gains a `lint` job (ESLint + Prettier --check). The `build-plugin`
  job additionally asserts the README's docgen markers are populated.
- One-time source edits to match the rule set: type import order fix in
  `src/web.ts`, Prettier reformat of `src/definitions.ts`, `src/web.ts`,
  `example/index.html`, `example/src/main.ts`, `example/src/style.css`.

## [0.0.9] — 2026-05-19

### Added — Listener infrastructure + feature flag update events (Phase H)

First event-based surface in the plugin. Same pattern will host in-app
message and content card update events in later versions; this commit
establishes the cross-platform shape so those land as additions, not
infrastructure work.

- `Braze.addListener('featureFlagsUpdated', cb)` →
  `Promise<PluginListenerHandle>`. The callback receives
  `{ flags: BrazeFeatureFlag[] }` — the full current set, not a delta.
- `Braze.removeAllListeners()`.

### Implementation notes

The native subscription is created once per `initialize` and torn down
in `wipeData`, so listener registration on the JS side is cheap (no
extra native traffic per addListener call). All registered JS listeners
share the same native subscription.

- **iOS:** `braze.featureFlags.subscribeToUpdates { flags in ... }`
  returns a `Braze.Cancellable`; retained on the plugin instance, set
  to `nil` in `wipeData`.
- **Android:** `Braze.getInstance(context).subscribeToFeatureFlagsUpdates(
  IEventSubscriber<FeatureFlagsUpdatedEvent>)`. The same subscriber
  instance is passed to `removeSingleSubscription` during teardown —
  the Android SDK identifies subscriptions by listener identity, not by
  a returned handle.
- **Web:** `braze.subscribeToFeatureFlagsUpdates(cb)`. The Web SDK has
  no unsubscribe handle, so the bridge uses a one-shot subscribe guard
  and lets the subscription live for the page lifetime.

Initial state is not replayed on `addListener` — Capacitor adds
listeners on the JS side without triggering the native callback. If
the consumer needs the current snapshot, they call
`Braze.getAllFeatureFlags()` once after `addListener`. This is
documented in the JSDoc.

### Improved

- Plugin surface: 29 callable methods + `addListener` /
  `removeAllListeners` (Capacitor-native bridge methods).

## [0.0.8] — 2026-05-19

### Added — Feature flags read API (Phase G)

Four methods that cover the read-side of Braze's feature flag system.
All three platforms; eight-file lockstep. The `subscribeToFeatureFlagsUpdates`
listener is deferred — it lands together with the in-app message and
content cards listeners in a dedicated listener-infrastructure phase.

- `Braze.getFeatureFlag({ id })` → `{ flag: BrazeFeatureFlag | null }`.
  Reads from the SDK's local cache; returns `null` when no flag with
  the given id exists for the current user.
- `Braze.getAllFeatureFlags()` → `{ flags: BrazeFeatureFlag[] }`.
- `Braze.refreshFeatureFlags()` — fire-and-forget. The returned promise
  resolves once the refresh has been dispatched, not when new flags
  arrive. Re-read after a short delay; full completion semantics will
  ride alongside the forthcoming subscribe-to-updates listener.
- `Braze.logFeatureFlagImpression({ id })` — limited by Braze to one
  impression per session per flag id.

### Added — `BrazeFeatureFlag` DTO

Portable wire-format shape: `{ id, enabled, properties }`. The
`properties` map mirrors the Web SDK `PropertiesJson` exactly so the
web path is zero-conversion; the Android bridge round-trips the SDK's
underlying `JSONObject` (already in the same shape); the iOS bridge
maps each `Braze.FeatureFlag.Property` enum case into the same wire
record. Property value types: `'string' | 'number' | 'boolean' |
'image' | 'datetime' | 'jsonobject'` (matches Braze's wire format).

### Improved

- Plugin surface: **29 methods** across all three platforms.

## [0.0.7] — 2026-05-19

### Added — `getUserId` + `logPurchase` (Phase F)

Closes the last two v0.1-roadmap methods that don't need listener
plumbing. All three platforms; eight-file lockstep.

- `Braze.getUserId()` → `{ userId: string | null }`. Returns the current
  external user ID, or `null` for anonymous users. iOS reads
  `braze.user.id` (sync property since BrazeKit 14.x); Android reads
  `currentUser.userId` and coerces the SDK's empty-string anonymous
  sentinel to `null`; Web reads `getUser().getUserId()` and coalesces
  `undefined` to `null`.
- `Braze.logPurchase({ productId, currency, price, quantity?, properties? })`.
  Required currency on the public contract even though the Web SDK
  treats it as optional — revenue analytics roll up incorrectly when
  some events lack currency. Android wraps `price` via
  `BigDecimal.valueOf(double)` so the stored value is the exact
  decimal a human typed (`14.99`), not a float-precision artifact.
  Quantity defaults to `1`, validated to integer in 1-100 per Braze.

### Improved

- Example app: shared `parseJsonProperties(id)` helper used for both
  event and purchase property inputs; replaces the per-input helper.
- Plugin surface: **25 methods** across all three platforms.

## [0.0.6] — 2026-05-19

### Added — Subscription groups, aliases, demographics, device ID (Phase E)

Pull-forward of seven v0.2-roadmap methods that consumers reach for almost
immediately after the basic identify/event surface lands. All seven on all
three platforms.

- `Braze.addToSubscriptionGroup({ groupId })` — adds the current user to a
  Braze email/SMS subscription group.
- `Braze.removeFromSubscriptionGroup({ groupId })` — counterpart.
- `Braze.addAlias({ alias, label })` — non-primary identifier; `(alias,
  label)` pairs are unique across users.
- `Braze.getDeviceId()` → `{ deviceId: string }` — Braze SDK device id,
  for backend-side targeted messaging or debugging.
- `Braze.setDateOfBirth({ year, month, day })` — `month` is 1-12 (matches
  Web SDK contract; the Android bridge maps to `com.braze.enums.Month`).
- `Braze.setGender({ gender })` — string union `'male' | 'female' | 'other' |
  'unknown' | 'not_applicable' | 'prefer_not_to_say'`. Bridges map to the
  matching native enum case so consumers never see the SDK's
  single-letter / enum-case shorthand.
- `Braze.setHomeCity({ homeCity })` — string or `null` to clear.

### Added — `example/` Capacitor app (not published, dev tool only)

Minimal Capacitor app under `example/` that exercises every plugin method
end-to-end. Originally committed under Unreleased; ships in 0.0.6 alongside
the Phase E methods.

- Vite + vanilla TypeScript (no framework coupling).
- Single page with UI for every method, grouped by category.
- Live log panel shows each call's result or error.
- Runs in browser today via `@braze/web-sdk`; iOS/Android added via
  `npx cap add` per the example README.

### Improved

- TS types: new `BrazeGender` union and per-method option types
  (`BrazeSubscriptionGroupOptions`, `BrazeAddAliasOptions`,
  `BrazeSetDateOfBirthOptions`, etc.) exported so consumers can write
  helper functions with full type safety.
- iOS bridge: dates are constructed against a UTC Gregorian calendar so a
  stored DOB doesn't drift by a day based on device timezone, matching the
  Android and Web semantics.
- Web bridge: `WEB_GENDER_MAP` centralizes the public string → SDK
  single-letter constant mapping in one place.
- Plugin now exposes **23 methods** across all three platforms.

## [0.0.5] — 2026-05-19

### Added — User attributes (standard + custom)

All work against the current user (anonymous or identified). Pass `null` to
clear a standard attribute. Email/phone are treated as PII per SECURITY.md §3;
the bridge never logs attribute values at any level.

- `Braze.setEmail({ email })` — string | null
- `Braze.setPhoneNumber({ phoneNumber })` — E.164 recommended
- `Braze.setFirstName({ firstName })`
- `Braze.setLastName({ lastName })`
- `Braze.setLanguage({ language })` — ISO 639-1
- `Braze.setCountry({ country })` — ISO 3166-1 alpha-2
- `Braze.setCustomUserAttribute({ key, value })` — value is `string | number |
  boolean`; native bridges dispatch on the inferred type to the matching Braze
  SDK overload.

### Improved

- Android: new `requireUser(call)` helper that combines init guard +
  `currentUser` null check, returning the user object or rejecting cleanly.
- iOS: `setCustomAttribute` dispatch order is `getBool` → `getString` →
  `getInt` → `getDouble`. Booleans-first prevents JSON `true`/`false` from
  being misread as integer 1/0.
- Android: `setCustomUserAttribute` reads from `call.data.opt("value")` (raw
  JSONObject) to preserve the original value type before Capacitor's getter
  coercion gets a chance to confuse it.
- TS: explicit `BrazeAttributeValue` and `BrazeAttributeValueType` types
  exported so consumers can write helper functions that produce attribute
  payloads with full type safety.

### Notes
- v0.0.5 is the first cut where a consumer can deliver a complete Braze
  customer profile: identify a user (`changeUser`), set their standard
  attributes (email, name, etc.), tag them with custom attributes, log
  events, and respect privacy methods. This is the minimum viable profile
  surface — push, content cards, IAM, feature flags still pending.
- Plugin currently exposes **16 methods** across all three platforms.

## [0.0.4] — 2026-05-19

### Added — Privacy & lifecycle methods

The minimum production-safety surface per SECURITY.md §10. All five are
init-independent except `requestImmediateDataFlush` (which needs a configured
Braze instance to flush from).

- `Braze.wipeData()` — destructive local data removal; for GDPR Article 17
  flows. Drops the plugin's init state so subsequent post-init calls fail
  cleanly until `initialize` is called again.
- `Braze.disableSDK()` — halts all data collection.
- `Braze.enableSDK()` — re-enables after `disableSDK`.
- `Braze.isDisabled()` — returns `{ disabled: boolean }`.
- `Braze.requestImmediateDataFlush()` — bypasses Braze's network batching.
  Useful for Layer 4 smoke testing and edge cases where the app may be killed
  before the next batch.

### Improved

- Exhaustive JSDoc on every method in `definitions.ts` with `@example` blocks,
  cross-references to SECURITY.md sections, and clear notes on which methods
  are init-independent.
- iOS: `MARK:` section comments grouping bridge methods by category.
- Android: KDoc on helpers explaining narrow-to-primitive contract for
  `jsObjectToBrazeProperties`.
- `BrazePlugin.m`: ordered CAP_PLUGIN_METHOD registrations by category to
  match the Swift file structure (review-friendly).
- Web: `loadSdk()` helper centralizes the dynamic `@braze/web-sdk` import with
  a friendly error message if the peer dep isn't installed.

## [0.0.3] — 2026-05-19

### Added
- `Braze.changeUser({ userId, sdkAuthSignature? })` — identifies the current
  user. Required JWT signature parameter (optional in TS, validated server-side
  by Braze when SDK Authentication is enabled). All three platforms.
- `Braze.logCustomEvent({ name, properties? })` — logs a custom event with
  optional string / number / boolean properties. All three platforms.
- TS types: `BrazeChangeUserOptions`, `BrazeLogCustomEventOptions`,
  `BrazeEventProperties`, `BrazeEventPropertyValue`.
- Init guard on all platforms — any plugin method other than `initialize` /
  `echo` rejects with a clear error if `initialize` wasn't called first.
- Android: `jsObjectToBrazeProperties` helper that narrows JSObject to
  `BrazeProperties` while only accepting primitive values per the TS
  interface contract.

### Notes
- This is the first commit where the plugin actually pushes data into Braze.
  A consumer can call `initialize` → `changeUser` → `logCustomEvent` against
  a real Braze account and see the user profile + event appear in the
  dashboard within ~30 seconds.
- Date / array property values not yet supported (TS interface excludes them);
  lands in a later 0.0.x patch.

## [0.0.2] — 2026-05-19

### Changed
- `Braze.initialize()` now performs real native SDK initialization on iOS and Android (web was already wired in 0.0.1):
  - **iOS:** constructs `Braze.Configuration(apiKey:endpoint:)`, sets `configuration.logger.level` (`.debug` if `enableLogging`, else `.info`), toggles `configuration.api.sdkAuthentication`, instantiates `Braze` and retains as `BrazePlugin.braze` static for future push delegate hooks.
  - **Android:** builds `BrazeConfig` via builder pattern (`setApiKey`, `setCustomEndpoint`, `setIsSdkAuthenticationEnabled`, optional `setLoggerLevel(Log.VERBOSE)`), calls `Braze.configure(context, config)`.

### Notes
- `initialize` is now sufficient to integrate the Braze SDK end-to-end. Consumer apps can call it and see device profiles created in their Braze dashboard, even though no `changeUser` / `logCustomEvent` methods exist yet — Braze tracks anonymous sessions automatically.
- Next: 0.1.0-alpha with `changeUser` + `logCustomEvent` per [`PLAN.md` §7](./PLAN.md#7-phased-roadmap).

## [0.0.1] — 2026-05-19

Initial scaffold. Not published to npm yet.

### Added
- Plugin scaffolding for Capacitor 6+ (iOS, Android, Web).
- `echo({ value })` method working end-to-end on all three platforms (bridge sanity check).
- TypeScript interface for `initialize({ apiKey, endpoint, ... })` — bridges defined; web impl wraps `@braze/web-sdk`; native impls store config (real Braze SDK init wiring lands in 0.0.2).
- Strategic documentation: `PLAN.md`, `SDK_SURFACE.md`, `SECURITY.md`, `REVIEW_READINESS.md`, `CLAUDE.md`.
- MIT license.
- Braze SDK dependencies declared in `android/build.gradle` and `BrazePlugin.podspec`.

### Notes
- This is a scaffolding release. Functional Braze methods (`changeUser`, `logCustomEvent`, etc.) ship in 0.1.0 per [`PLAN.md` §7](./PLAN.md#7-phased-roadmap).
