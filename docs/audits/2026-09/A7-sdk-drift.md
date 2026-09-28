> **Archived research report — read the resolution table first.**
> Upstream-SDK drift analysis for `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated
> 2026-09-22. This is not a defect list; it is the bump plan that `0.2.0` executed. The table below
> records what shipped and what did not. Index of audits: [`../README.md`](../README.md).

## Resolution status

| Item | Status in 0.2.0 | Note |
|---|---|---|
| §7.1 PR 1 — web security floor | **shipped** | `@braze/web-sdk` peer `^6.0.0` → `^6.13.0` in the plugin, example and demo, with lockfiles regenerated. The driver is §6's finding that 6.12.1 fixed a `javascript:`/`data:` URI bypass of `allowUserSuppliedJavascript`. |
| §7.1 — Android 42.2.0 → 43.2.0 | **shipped** | And **R1 is resolved**: the AARs declare `minCompileSdk=21` / `minAndroidGradlePluginVersion=1.0.0`, so 43.2.0 imposes no AGP or compileSdk floor. Verified two ways — the metadata, and a clean build of the demo at the existing AGP 8.6.0 / Gradle 8.7 / compileSdk 35 toolchain. The 43.1.0 "AGP 9.2.1" changelog line was about how Braze builds the SDK. |
| §7.1 — iOS 14.1.0 → 18.2.1 | **shipped** | The bridge compiled against 18.2.1 with **zero source changes** before any fix was applied, confirming §4.1's symbol-survival analysis by build rather than by reading the interface. `getUserId` / `getDeviceId` then moved to the async accessors added in 17.0. |
| §7.1 PR 4 — Capacitor 8 / AGP 8.13 / Kotlin 2.2.20 / compileSdk 36 | **not shipped** | Deliberately out of scope. Peer stays `^6 \|\| ^7`, podspec `< 8.0`. The README, CHANGELOG and `SDK_SURFACE.md` state this as an open follow-up rather than implying support. |
| §5 — SPM support | **not shipped** | Scoped as its own follow-up, as this report recommends. Capacitor 8's CLI generates SPM iOS projects by default, so this and the Capacitor 8 lane are linked. |
| §7.2 (1) — C08 links `BrazePlugin.podspec` | **fixed** | Corrected to `CapacitorBraze.podspec`. This was the single broken relative link in the tracked tree; a link check now covers every `.md` file. |
| §7.2 (2) — the iOS 15 rationale is false | **fixed** | Verified: BrazeKit's own podspec declares iOS 12 at 14.1.0, 15.0.0 **and** 18.2.1. The iOS 15 floor is **the plugin's own choice**, set in `CapacitorBraze.podspec`. C10, `SDK_SURFACE.md` and the README now say so. The `use_frameworks! :linkage => :static` requirement in the same section is genuinely BrazeKit's and is unchanged. |
| §7.2 (3) — C10's Android numbers are stale | **fixed** | C10 now matches `android/build.gradle`: pin 43.2.0, plugin default `minSdkVersion` 22 (was 26, a fourth number that disagreed with C10, the demo and Capacitor's template), compileSdk/targetSdk 35. |
| §7.2 (4) — README says "not yet published to npm" | **fixed** | Along with the 14.x pin references throughout. |
| §7.3 — C08 step 8 vs the pre-1.0 policy | **resolved** | C08 step 8 said an upstream major forces a plugin **major**, which at 0.1.0 would mean 1.0.0 — a stability commitment this project is not ready to make. [C08](../../mdcs/C08-NATIVE-SDK-PINNING.md) now reads: *major bump post-1.0; pre-1.0, a minor with `BREAKING:` lines.* `0.2.0` ships with an explicit Breaking section. |
| §7.3 — consumer-facing breaking changes | **documented** | All of them are in the CHANGELOG's `### Breaking` section: Xcode 26, the web-sdk floor, iOS `getUserId` after `wipeData`, iOS `contentCardsUpdated` on `changeUser`, immediate content-card state, and Android's automatic FCM Installation-ID registration. |

### Risks this report flagged, and where they stand

| Risk | Status |
|---|---|
| **R1** — Android AGP 9 consumer impact unverified | **Resolved.** See the 43.2.0 row above: metadata read plus a real build. |
| **R2** — the C07 iOS asymmetries are unverified at 18.2.1 | **Made moot.** The plugin no longer depends on BrazeKit's pre-init behaviour: it keeps the consent decision in its own state and applies it when `initialize` creates the instance. BrazeKit's own pre-init behaviour at 18.2.1 was **not** runtime-verified, and no longer needs to be. |
| **R3** — Layer 4 smoke still blocked, and C08 forbids bumping without it | **Accepted, with the constraint acknowledged.** The bumps shipped without a Layer 4 capture, on the strength of real builds and 254 automated tests across three platforms. This is a deliberate maintainer call and both the CHANGELOG and README say the release is not validated against a live Braze backend. |
| **R4** — GHSA/CVE databases not queried directly | **Still true.** The security conclusion rests on the vendors' changelogs. |
| **R5** — the CocoaPods Specs read-only date is second-hand | **Still true.** It is not cited as fact anywhere in the shipped docs. |
| **R6** — `macos-latest` will migrate again | **Mitigated.** `verify-ios` pins `DEVELOPER_DIR` to an Xcode 26.x with a fallback to the newest installed 26.x and a hard error if none exists. |
| **R7** — nothing was built for this report | **Superseded.** Every claim it makes about symbol survival was subsequently confirmed by real iOS and Android builds during the fix wave. |
| **R8** — Web SDK 7 timing unknown | **Still true.** |

---

# A7 — Upstream Braze SDK drift and the bump plan

**Scope:** `capacitor-braze` @ `0.1.0`, commit `0ab8e19`, assessed 2026-09-22.
**Method:** upstream changelogs + manifests fetched live; iOS symbol survival verified against the
real `BrazeKit 18.2.1` `.swiftinterface` extracted from the published xcframework; Android symbol
survival verified against the open `android-sdk-ui` source at tag `v43.2.0`; plugin symbol inventory
grepped from the four bridge files. Facts below are marked **[V]** verified from a primary source or
**[I]** inference/judgment.

---

## 0. Current state vs. upstream

| Platform | Plugin pin | Upstream latest | Drift | Source |
|---|---|---|---|---|
| iOS | `BrazeKit` + `BrazeUI` **14.1.0** (`CapacitorBraze.podspec`) | **18.2.1** | **4 majors** | [swift CHANGELOG](https://github.com/braze-inc/braze-swift-sdk/blob/main/CHANGELOG.md) **[V]** |
| Android | `com.braze:android-sdk-ui` **42.2.0** (`android/build.gradle`) | **43.2.0** | 1 major + 3 minors | [android CHANGELOG](https://github.com/braze-inc/braze-android-sdk/blob/master/CHANGELOG.md) **[V]** |
| Web | `@braze/web-sdk` **`^6.0.0`** peer (`package.json`) | **6.13.0** (`latest`) | 13 minors inside the caret | `npm view @braze/web-sdk dist-tags` **[V]** |
| Capacitor | peer `^6.0.0 \|\| ^7.0.0`; podspec `Capacitor >= 6.0, < 8.0` | `@capacitor/core` **8.5.2**; `9.0.0-alpha.7` on `next` | **excludes current stable** | `npm view @capacitor/core dist-tags` **[V]** |

For calibration, Braze's own wrappers today **[V]**:

| Wrapper | iOS pin | Android pin | Android build env |
|---|---|---|---|
| `@braze/react-native-sdk` 23.0.0 | `BrazeKit ~> 18.2.0` | `android-sdk-ui 43.1.1` | compileSdk 36, minSdk 21 |
| `braze_plugin` (Flutter) 22.1.0 | `BrazeKit ~> 18.2.1` | `android-sdk-ui 43.1.1` | AGP 8.13.2, Kotlin 2.4.10, compileSdk 36 |
| `cordova-plugin-braze` 17.0.0 | `BrazeKit/BrazeUI/BrazeLocation ~> 18.2.0` | — | — |

So "current" in the Braze wrapper ecosystem is **18.2.x / 43.1.1+**. This plugin is the outlier, and
it is the outlier on the platform (iOS) where the gap is four majors wide.

---

## 1. Executive summary

**Recommendation: bump before the review, and lead the review with the bump.**

The bump is *low-risk and high-signal*, which is an unusual combination and is the whole argument:

1. **Nothing the plugin actually calls is broken at head.** Every BrazeKit / BrazeUI symbol in
   `BrazePlugin.swift` + `BrazeIAMDelegate.swift` still exists at 18.2.1 **[V]** (§4.1), and every
   `com.braze.*` symbol in `BrazePlugin.kt` still exists at 43.2.0 **[V]** (§4.2). The four iOS
   majors removed exactly two things — `Braze.Configuration.preventInAppMessageDisplayForDifferentUser`
   (15.0.0) and the deprecated Live Activities push-to-start token API (17.0.0) — and the plugin
   uses neither. Android 43.0.0's single breaking rename (`ProductViewedEvent.typeIdentifiers` → `type`)
   is in the eCommerce surface, which the plugin does not expose at all. **This is a near-zero-code
   bump.** The cost is almost entirely consumer-facing environment requirements, not plugin code.
2. **Staying put is a self-inflicted policy violation, and the repo's own doc says so.**
   [`C08` Forbidden](../../mdcs/C08-NATIVE-SDK-PINNING.md) lists *"Letting the pin drift behind
   the upstream LTS line for more than two minor versions"*. The plugin is four **majors** behind on
   iOS. A reviewer who reads C08 — and C08 is presented as a headline artifact of the project — will
   find the project in breach of its own written rule on the very first check. That is a worse look
   than being behind, because it converts "stale" into "the process docs are decorative."
3. **There is one real security item, and it is on the surface the plugin cannot pin.**
   `@braze/web-sdk` **6.12.1** fixed a genuine bypass: *"an in-app message with multiple buttons could
   be displayed even when one of its buttons used a `javascript:` or `data:` URI and the
   `allowUserSuppliedJavascript` initialization option was disabled"* ([web
   CHANGELOG](https://github.com/braze-inc/braze-web-sdk/blob/master/CHANGELOG.md)) **[V]**. The
   plugin's peer range `^6.0.0` is satisfied by 6.0.0–6.12.0, all of which carry the bug. A
   consumer with a lockfile from May 2026 is pinned to a vulnerable web SDK and the plugin says
   nothing. Given `SECURITY.md` is one of the four headline docs, this is the finding most likely to
   sting. **This one is not optional — raise the floor to `^6.13.0`.**
4. **The Capacitor range is the sharper reviewer question, not the Braze pins.** Capacitor 8 has
   been stable for a while (8.5.2, with 9.0.0-alpha on `next`) **[V]**, and the plugin's peer range
   `^6 || ^7` plus podspec `Capacitor < 8.0` means `npm install capacitor-braze` on a *current*
   Capacitor project produces a peer-dep conflict. A plugin whose README headline is "Braze ships no
   Capacitor SDK — this plugin makes it `npm install` + ~10 lines" that does not install on current
   Capacitor undercuts its own pitch. See §5.

**What is genuinely defensible about the current state:** the exact-pin policy itself (C08's
reasoning is sound and better-argued than most plugins'), and the fact that the drift is *documented*
— `CHANGELOG.md [Unreleased]` already states the Capacitor 8 deferral and its reason (AGP/JDK vs. CI
JDK 17) **[V]**. A maintainer who can say "I know exactly how far behind I am, here is the digest,
here is the branch" is in a strong position. A maintainer who has the digest but not the branch is in
a weak one. **[I]**

### Target pin set

| Artifact | From | To | Rationale |
|---|---|---|---|
| `CapacitorBraze.podspec` `BrazeKit`/`BrazeUI` | `14.1.0` | **`18.2.1`** | Matches Flutter's pin; 18.2.1 is a pure bugfix over 18.2.0 |
| `android/build.gradle` `com.braze:android-sdk-ui` | `42.2.0` | **`43.2.0`** | Latest; fixes edge-to-edge Content Cards on API 35+ targets |
| `package.json` peer `@braze/web-sdk` | `^6.0.0` | **`^6.13.0`** | Security floor (6.12.1 IAM URI-scheme bypass) |
| `package.json` peer `@capacitor/core` | `^6 \|\| ^7` | **`^6 \|\| ^7 \|\| ^8`** | Install on current Capacitor |
| `CapacitorBraze.podspec` `Capacitor` | `>= 6.0, < 8.0` | **`>= 6.0, < 9.0`** | Same, on the Pod side |

Ship as **`0.2.0`** with `BREAKING:` lines in the CHANGELOG — see §7.3 for why this collides with
C08 step 8 and how to resolve it.

---

## 2. iOS — breaking-change digest, 14.1.0 → 18.2.1

Source: <https://github.com/braze-inc/braze-swift-sdk/blob/main/CHANGELOG.md> **[V]**

### 2.1 Consumer environment (the real cost of this bump)

| Requirement | 14.1.0 | 18.2.1 | Evidence |
|---|---|---|---|
| **Xcode** | 16.x | **26.0 (17A324)** | 15.0.0: *"Raises the Xcode version to 26.0 (17A324)."* **[V]** Corroborated by the shipped `.swiftinterface` header: 14.1.0 is `Apple Swift version 6.0 (swiftlang-6.0.0.9.10)`, 18.2.1 is `Apple Swift version 6.2 (swiftlang-6.2.0.19.9)` **[V]** |
| **iOS deployment target** | 12.0 | **12.0 — unchanged** | `BrazeKit.podspec` at both tags sets `s.ios.deployment_target = '12.0'`; `Package.swift` declares `.iOS(.v12)` at both **[V]** |
| **Mac Catalyst** | iOS 13 / macOS 10.15 | **iOS 16 / macOS 13** | 15.0.0 **[V]** — irrelevant to this plugin (no Catalyst target) |
| **Swift** | `swift_version 5.0` | `swift_version 5.0` — unchanged | both podspecs **[V]** |
| **Privacy manifest** | ships its own | ships its own, no change noted in range | **[V]** (no changelog entry) |

> **The single hard consumer gate is Xcode 26.** This is the one thing a consumer cannot shrug off,
> and it must be the headline of the CHANGELOG entry and a new C10 subsection. **[I]**

### 2.2 Breaking changes, by release

**15.0.0** — <https://github.com/braze-inc/braze-swift-sdk/releases/tag/15.0.0>
- Xcode floor → 26.0; Mac Catalyst floor → iOS 16.
- **Removes `Braze.Configuration.preventInAppMessageDisplayForDifferentUser`.** SDK now always
  behaves as if it were `true`. → *Plugin does not set it.* No code change.
- `Braze.WebViewBridge.ScriptMessageHandler` / `SchemeHandler` init take a non-optional `channel`.
  → *Plugin does not use WebViewBridge.* No change.
- Banners `onDismiss` now receives `BannerDismissalEvent`. → *Plugin exposes no banner surface.*
- Added: eCommerce recommended events + `Braze.logEcommerceEvent(_:)` — new surface, out of scope
  per `SDK_SURFACE.md`.
- Added: config-validation logging when `devicePropertyAllowList` omits `pushEnabled` /
  `pushAuthStatus`. → *Plugin never sets `devicePropertyAllowList`, so defaults apply; this is a
  log-noise item only.* **[I]**

**15.0.1 / 15.1.0 / 15.2.0** — no breaks. 15.1.0 adds the async Content Cards getters
(`getCachedContentCards(_:)`, `getUnviewedCards(_:)`, `getLastUpdate(_:)`) that become the
*recommended* path at 17.0.0 (§2.3).

**16.0.0**
- **Content Cards behavior:** `braze.contentCards.cards` is now updated *immediately* after a card is
  viewed / dismissed / clicked via its `context`, instead of only after the next server sync.
- Disabling Content Cards via configuration now immediately clears `cards` and notifies subscribers
  with an empty list.
- → *Plugin impact:* `getContentCards` will return post-mutation state where it previously returned
  pre-sync state. **No compile break; a behavioral contract change** that any Layer-3/4 test
  asserting "card still shows `viewed: false` right after `logContentCardImpression`" will catch. **[I]**

**17.0.0 — the consequential one for this plugin**
- **`Braze.init` and `changeUser(userId:)` no longer block the calling thread.**
- **These properties now block until the SDK settles:** `braze.user.id`, `braze.deviceId`,
  `braze.contentCards.cards`, `.unviewedCards`, `.lastUpdate`, `braze.featureFlags.featureFlags`,
  `braze.featureFlags.featureFlag(id:)`. Braze explicitly says: *"For UI and other latency-sensitive
  code paths, prefer the asynchronous getters."*
- **`braze.user.id` now returns `nil` after `wipeData()`** (previously returned the last user id).
  Braze frames this as Android parity.
- **`changeUser` now notifies `Braze.ContentCards.subscribeToUpdates(_:)` subscribers** (Android parity).
- Removes the deprecated `Braze.LiveActivities.PushToStartTokenUpdate` enum and
  `pushToStartTokenUpdatesStream`. → *Not used.*
- Added: `Braze.User.getId(_:)` / `getId() async`, `Braze.getDeviceId(_:)` / `getDeviceId() async`.
- Added: `sdkDisabled` error on `requestRefresh` methods.
- → **Plugin impact (three items, all real):**
  1. `getUserId` (`BrazePlugin.swift:265`) and `getDeviceId` (`:416`) read the now-blocking
     synchronous properties. They should migrate to `braze.user.getId(_:)` / `braze.getDeviceId(_:)`.
     Both exist in the 18.2.1 interface **[V]** (`getId(_ completion: @escaping @MainActor (String?) -> Void)`,
     `getDeviceId(_ completion: @escaping @MainActor (String) -> Void)`). ~15 lines.
  2. **The `getUserId`-after-`wipeData` contract changes on iOS.** `braze.user.id` is already
     `String?` in the interface **[V]**, so nothing fails to compile — but the *documented behavior*
     and any test asserting the old value now differ, and iOS/Android/Web finally agree. This is a
     C03 cross-platform-translation note and a JSDoc edit.
  3. **`contentCardsUpdated` will now fire on `changeUser` on iOS**, where it previously did not.
     That is a listener-contract change (C05) that closes an undocumented iOS/Android divergence —
     worth a CHANGELOG `Fixed` line, not just a `Changed`.

**18.0.0**
- Renames `Braze.Ecommerce.ProductViewedEvent.typeIdentifiers` → `type`. → *Not used.*
- Renames two Live Activities push-to-start update event cases. → *Not used.*
- Fixes IAM close-button touch target to Apple HIG minimum (cosmetic, affects screenshots).
- Adds `braze.notifications.unregisterPush(completion:)` and `braze.logout(completion:)`.
  → **New surface worth a roadmap note:** `logout` has now landed on all three platforms
  (iOS 18.0.0, Android 43.0.0, Web 6.10.0) **[V]**. A cross-platform `Braze.logout()` is the single
  most obvious v0.3 addition and a reviewer may well ask why it is absent. **[I]**

**18.1.0** — no breaks. Deprecates `Braze.Configuration.useUUIDAsDeviceId` and
`Braze.Configuration.DeviceProperty.resolution`, both slated for removal in **20.0.0**. Plugin uses
neither **[V]**. Adds `@MainActor` to the `Braze.Notifications.subscribeToUpdates(_:)` closure for
Swift 6 strict concurrency.

**18.2.0** — no breaks. **Deprecates all public symbols in `BrazeKitCompat` / `BrazeUICompat`.**
Plugin imports neither **[V]** — it is already on the correct side of this.

**18.2.1** — fixes only, including an HTML-IAM close-button error modal regression introduced in
15.2.0. Relevant: it means **do not pin 15.2.0–18.2.0 for HTML IAMs**; go to 18.2.1. **[I]**

---

## 3. Android — breaking-change digest, 42.2.0 → 43.2.0

Source: <https://github.com/braze-inc/braze-android-sdk/blob/master/CHANGELOG.md> **[V]**

### 3.1 Build environment

| Requirement | Evidence |
|---|---|
| **compileSdk**: no new floor at 43.2.0. 43.1.0 shipped AAR metadata demanding **API 37**; **43.1.1 reverted it** — *"Fixed published AAR metadata requiring consuming apps to compile against API 37. Consuming projects may use compileSdk 21 or later."* **[V]** → **do not pin 43.1.0.** |
| **AGP**: 43.1.0 *"Updated the Android Gradle Plugin from 8.12.3 to 9.2.1"* and *"Migrated to AGP 9 built-in Kotlin"* — this is how Braze **builds** the SDK, not a stated consumer floor **[V]**. Whether AGP 9 metadata forces a consumer AGP bump is **unverified** — see §8 Risk R1. **[I]** |
| **minSdk**: unchanged. Braze's own RN + Flutter wrappers still default `minSdkVersion 21` against `43.1.1` **[V]**. |
| **Kotlin**: Flutter wrapper uses Kotlin 2.4.10 against 43.1.1 **[V]**; plugin currently uses 2.2.0. Not a stated floor. |

### 3.2 Breaking / behavioral, by release

**42.3.0** — *Breaking:* `BannerDismissSnapshot` fields passed to `onDismissCallback` are now
non-null. → *Plugin exposes no banner surface.* Adds `Braze.dismissBanner` and eCommerce logging.

**43.0.0** — *Breaking:*
- `ProductViewedEvent.typeIdentifiers` → `type`. → *Not used.*
- **FCM registration via Firebase Installation ID** (with `firebase-messaging` ≥ 25.1.0). The SDK
  **auto-enables** FCM auto-init via the Installation ID. Opt-out is
  `com_appboy_firebase_cloud_messaging_registration_enabled=false` in `appboy.xml`, plus
  `firebase_messaging_installation_id_enabled=false` in the manifest. Consumers with a custom
  `FirebaseMessagingService` must override `onRegistered` and assign
  `Braze.getInstance(context).registeredPushToken = installationId`.
  → **This is the plugin's one genuinely consumer-facing Android item.** The plugin's whole documented
  push story is "forward the token from `@capacitor/push-notifications` to
  `Braze.registerPushToken({ token })`" (README + C10). Braze 43.0.0 introduces a *second,
  automatic* registration path that can race or conflict with the documented handoff. **C10 and the
  README push sections must be revisited as part of the bump** — this is exactly the "a pin bump that
  introduces a new requirement and doesn't update C10 is incomplete" case C10 warns about. **[I]**
- Added: `Braze.unregisterPush` and `Braze.logout` (suspending + callback variants).
- Fixed: HTML-IAM / Banner JS-bridge `setCustomUserAttribute` with an array of JSON objects now
  stores structured objects, matching iOS. Fixed potential ANR in `Card.logImpression()` /
  `Card.logClick()` (both now async via `BrazeCoroutineScope`) — **the plugin calls both** via
  `logContentCardImpression` / `logContentCardClick`, so this is a free latency win. **[V]/[I]**

**43.1.0 / 43.1.1** — fixes only, but several land directly under the plugin's feet **[V]**:
- Content Cards full sync containing only malformed cards no longer clears the local cache.
- SSE connections no longer reconnect with an expired auth token (relevant to the plugin's
  `sdkAuthError` listener path).
- `Braze.unregisterPush` hang under local rate-limiting fixed.
- IAM Back-callback leak after transitioning through a blocklisted Activity fixed — **the plugin
  registers/unregisters `BrazeInAppMessageManager` on the Capacitor host Activity in
  `handleOnResume`/`handleOnPause`** (`BrazePlugin.kt:139`, `:158`) **[V]**, which is precisely the
  lifecycle shape this bug affected. **[I]**

**43.2.0** — *Fixed:*
- `wipeData()` / `disableSdk()` / `logout()` called while the SDK is still initializing could crash
  the host app with an uncaught `CancellationException`. → **The plugin's C07 quartet
  (`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`) is explicitly permitted to run pre-`initialize`
  per [C07](../../mdcs/C07-INIT-INDEPENDENT-METHODS.md)** — i.e. the plugin's own design
  deliberately steers consumers into the exact call pattern that crashes on 42.2.0. **This is the
  strongest single technical argument for bumping Android** and it should be stated that way in the
  PR. **[I]**
- Content Cards feed rendered under the status/nav bar on `targetSdk ≥ 35` (edge-to-edge). Now
  applies system-bar insets; new `ContentCardsFragment.isWindowInsetsHandlingEnabled` escape hatch.
  → *The plugin does not host `ContentCardsFragment`* (it returns card DTOs and lets the consumer
  render), so low direct impact — but it is a C10-documentable note for consumers who do use the
  Braze feed. **[I]**
- *Changed:* `Braze.unregisterPush` no longer throws when no cached token exists;
  `refreshFeatureFlags()` no longer applies a client-side cooldown (refresh volume now governed by
  rate limits). → *The plugin calls `refreshFeatureFlags()`* (`BrazePlugin.kt:846`) **[V]**; a
  consumer looping it will now hit server rate limits rather than a silent client-side no-op. Worth
  a JSDoc note. **[I]**

---

## 4. Symbol cross-reference

### 4.1 iOS — verified against the real `18.2.1` interface

Method: `curl` the published `BrazeKit.zip` for 18.2.1, `unzip`, grep
`BrazeKit.xcframework/ios-arm64/.../arm64-apple-ios.swiftinterface`. BrazeUI symbols checked against
`Sources/BrazeUI/**` at tag `18.2.1`. **[V]**

| Plugin symbol | File:line | Present at 18.2.1? | Change needed | Effort |
|---|---|---|---|---|
| `Braze.Configuration(apiKey:endpoint:)` | `BrazePlugin.swift:140` | ✅ `class Configuration` + `init(configuration:` | none | — |
| `configuration.logger.level` | `:141` | ✅ `var logger` | none | — |
| `configuration.api.sdkAuthentication` | `:142` | ✅ | none | — |
| `configuration.sessionTimeout` | `:160` | ✅ `var sessionTimeout: TimeInterval` | none | — |
| `Braze(configuration:)` | `:177` | ✅ | none | — |
| `BrazeInAppMessageUI()` + `.delegate` | `:199`, `:202` | ✅ `open class BrazeInAppMessageUI`, `public weak var delegate` | none | — |
| `braze.inAppMessagePresenter` | `:203` | ✅ | none | — |
| `braze.delegate` (`BrazeDelegate`) | `:210` | ✅ | none | — |
| `braze.featureFlags.subscribeToUpdates` | `:220` | ✅ | none | — |
| `braze.contentCards.subscribeToUpdates` | `:226` | ✅ | ⚠️ **now also fires on `changeUser`** (17.0.0) — C05/test update | S |
| `braze.changeUser(userId:sdkAuthSignature:)` | `:256` | ✅ | ⚠️ **no longer blocks** (17.0.0) — review init/changeUser sequencing | S |
| `braze.user.id` | `:265` | ✅ `var id: String?` | ⚠️ **blocks until settled; `nil` after `wipeData`** (17.0.0) → migrate to `getId(_:)`; JSDoc + C03 | M |
| `braze.set(sdkAuthenticationSignature:)` | `:278` | ✅ | none | — |
| `braze.user.set(email:/phoneNumber:/firstName:/lastName:/language:/country:/homeCity:/dateOfBirth:/gender:)` | `:291`–`:486` | ✅ all | none | — |
| `braze.user.setCustomAttribute(key:value:)` | `:348`–`:362` | ✅ (all overloads) | none | — |
| `braze.user.addToSubscriptionGroup(id:)` / `removeFromSubscriptionGroup(id:)` | `:379`, `:389` | ✅ | none | — |
| `braze.user.add(alias:label:)` | `:405` | ✅ | none | — |
| `braze.deviceId` | `:416` | ✅ `var deviceId: String` | ⚠️ **blocks until settled** (17.0.0) → migrate to `getDeviceId(_:)` | S |
| `Braze.User.Gender` (`.male`/`.female`/`.other`/…) | `:466`–`:479` | ✅ | none | — |
| `braze.logCustomEvent(name:properties:)` | `:499` | ✅ | none | — |
| `braze.logPurchase(...)` | `:529` | ✅ | none | — |
| `braze.featureFlags.featureFlag(id:)` / `.featureFlags` | `:560`, `:570` | ✅ | ⚠️ **now block until settled** (17.0.0); async `getAllFeatureFlags(_:)` added in 16.0.0 | S |
| `braze.featureFlags.requestRefresh()` / `.logFeatureFlagImpression(id:)` | `:580`, `:590` | ✅ | `sdkDisabled` completion error added (17.0.0) — optional to surface | S |
| `Braze.FeatureFlag` typed accessors (`image/string/timestamp/bool/number/jsonProperty(key:)`) | `:617`–`:626` | ✅ all six | none — **the C02 tagged-union serializer survives intact** | — |
| `braze.contentCards.cards` / `.lastUpdate` | `:664`–`:665`, `:708` | ✅ | ⚠️ **block until settled** (17.0.0) + **immediate post-mutation state** (16.0.0) — test expectations | M |
| `braze.contentCards.requestRefresh()` | `:671` | ✅ | `sdkDisabled` error added | S |
| `card.logClick(using:)` / `card.logImpression(using:)` | `:685`, `:700` | ✅ | none | — |
| `Braze.ContentCard` cases `.control/.classic/.classicImage/.imageOnly/.captionedImage` | `:769`–`:800` | ✅ all | none | — |
| `braze.notifications.register(deviceToken:)` | `:874` | ✅ | none (`unregisterPush` is *new*, not a replacement) | — |
| `braze.wipeData()` | `:926` | ✅ | ⚠️ **now clears `user.id`** (17.0.0) | S |
| `Braze.wipeDataAndDisableForAppRun()` | `:932` | ✅ `class func` | none | — |
| `braze.enabled` (get + set) | `:952`, `:962`, `:970` | ✅ `var enabled: Bool { get set }` | none — the documented C07 iOS asymmetry still holds | — |
| `braze.requestImmediateDataFlush()` | `:976` | ✅ | none | — |
| `BrazeInAppMessageUIDelegate.inAppMessage(_:displayChoiceForMessage:)` | `BrazeIAMDelegate.swift:34` | ✅ (verified in `InAppMessageUIDelegate.swift` @ 18.2.1) | none | — |
| `BrazeInAppMessageUI.DisplayChoice` | `:36` | ✅ | none | — |
| `BrazeDelegate.braze(_:sdkAuthenticationFailedWithError:)` + `Braze.SDKAuthenticationError` | `:57` | ✅ | none | — |
| `Braze.InAppMessage` cases `.slideup/.modal/.modalImage/.full/.fullImage/.html/.control` | `:90`–`:162` | ✅ **all seven** | none — the 7→5 collapse in `C02` still maps 1:1 | — |
| `Braze.InAppMessage.ClickAction` / `.Button` | `:168`, `:177` | ✅ | none | — |

**Net iOS verdict: zero compile breaks; four behavioral deltas (17.0.0 ×3, 16.0.0 ×1); one
recommended refactor (sync → async id accessors, ~15 lines).** **[V] + [I]**

### 4.2 Android — verified against open source at `v43.2.0` / changelog

| Plugin symbol | Present at 43.2.0? | Change needed | Effort |
|---|---|---|---|
| `com.braze.Braze` + `Braze.getInstance(context)` | ✅ | none | — |
| `BrazeConfig.Builder().setApiKey/.setCustomEndpoint/.setIsSdkAuthenticationEnabled/.setSessionTimeout` + `Braze.configure` | ✅ (no changelog entry in range) | none | — |
| `BrazeLogger.enableVerboseLogging()` | ✅ | none | — |
| `BrazeInAppMessageManager.getInstance()` / `registerInAppMessageManager` / `unregisterInAppMessageManager` | ✅ **verified in source at `v43.2.0`** | none — 43.1.0 *fixes* a Back-callback leak on this exact lifecycle | — |
| `setCustomInAppMessageManagerListener` / `setCustomControlInAppMessageManagerListener` | ✅ | none | — |
| `IInAppMessageManagerListener`, `InAppMessageOperation`, `IInAppMessage(+Immersive/WithImage)`, `MessageButton`, `MessageType`, `ClickAction` | ✅ | none | — |
| `changeUser(userId[, sdkAuthSignature])`, `setSdkAuthenticationSignature` | ✅ | none | — |
| `currentUser.set*` / `setCustomUserAttribute` overloads / subscription groups / `addAlias` | ✅ | none | — |
| `logCustomEvent`, `logPurchase(..., BigDecimal, ...)` | ✅ | none | — |
| `getFeatureFlag(id)`, `getAllFeatureFlags()`, `logFeatureFlagImpression(id)` | ✅ | none | — |
| `refreshFeatureFlags()` | ✅ | ⚠️ **client-side cooldown removed in 43.2.0** — JSDoc note on rate limiting | S |
| `getCachedContentCards()`, `requestContentCardsRefresh()`, `getContentCardsLastUpdatedInSecondsFromEpoch()` | ✅ | none | — |
| `Card` / `CaptionedImageCard` / `ImageOnlyCard` / `ShortNewsCard` / `TextAnnouncementCard`; `Card.logImpression()` / `logClick()` | ✅ | none — both now async internally (43.0.0), a free ANR fix | — |
| `registeredPushToken = token` | ✅ | ⚠️ **43.0.0 adds an automatic FCM-Installation-ID registration path** that can coexist/conflict — C10 + README push section update | **M** |
| `Braze.wipeData(context)` / `disableSdk(context)` / `enableSdk(context)` / `Braze.isDisabled` | ✅ | none — 43.2.0 *fixes* the pre-init crash the plugin's C07 design invites | — |
| `requestImmediateDataFlush()` | ✅ | none | — |
| `subscribeToFeatureFlagsUpdates` / `subscribeToContentCardsUpdates` / `subscribeToSdkAuthenticationFailures`; `IEventSubscriber`, `*UpdatedEvent`, `BrazeSdkAuthenticationErrorEvent` | ✅ | none | — |

**Net Android verdict: zero compile breaks; one documentation obligation (FCM Installation ID push
path); two minor JSDoc notes.** **[V] + [I]**

### 4.3 Web — `src/web.ts` against 6.13.0

All 35 `braze.*` call sites grepped from `src/web.ts` **[V]**. The only removals in the 6.x line
happened at **6.0.0** (legacy News Feed, `Banner.html`, `logBannerClick`, `logBannerImpressions`,
`created`/`categories`/`linkText` card fields) — the plugin is already above that boundary, and the
symbols it uses (`initialize`, `openSession`, `changeUser`, `getUser`, `logCustomEvent`,
`logPurchase`, `getFeatureFlag`, `getAllFeatureFlags`, `refreshFeatureFlags`,
`logFeatureFlagImpression`, `getCachedContentCards`, `requestContentCardsRefresh`,
`logContentCardClick`, `logContentCardImpressions`, `showInAppMessage`, `subscribeToInAppMessage`,
`subscribeToContentCardsUpdates`, `subscribeToFeatureFlagsUpdates`,
`subscribeToSdkAuthenticationFailures`, `setSdkAuthenticationSignature`, `wipeData`, `disableSDK`,
`enableSDK`, `isDisabled`, `getDeviceId`, `requestImmediateDataFlush`, plus the `instanceof` classes
`ClassicCard`/`CaptionedImage`/`ImageOnly`/`ControlCard` and the IAM classes) are **all still
present at 6.13.0** — nothing in 6.1→6.13 deprecates or removes any of them. **[V]**

Two web items nonetheless:

1. **Security floor (§1.3).** Raise `^6.0.0` → `^6.13.0`. Note C08's own rule for this move:
   *"Bump the floor … when the plugin starts using a method the older range didn't include. This is a
   plugin minor bump."* A **security**-motivated floor bump is not a case C08 currently covers —
   worth adding a clause. **[I]**
2. **`requestPushPermission` gap is now worse.** C10 §Web says `Braze.requestPushPermission()` is
   "not yet implemented in this plugin (planned for v0.2)". Since then 6.11.0 added
   **`braze.registerPush()`** — same registration steps, never prompts **[V]** — which is arguably the
   better primitive for a Capacitor plugin where permission prompting belongs to
   `@capacitor/push-notifications`. Revisit that C10 note in the same PR. **[I]**
3. **No web-sdk 7 on the horizon.** `npm view @braze/web-sdk versions` shows 6.13.0 as the highest
   published; `dist-tags` has only `latest: 6.13.0` — no `next`, no prerelease **[V]**. The caret
   range's forward risk is low today.

---

## 5. Capacitor — the range is a live reviewer concern

**[V]** `@capacitor/core` dist-tags: `latest: 8.5.2`, `latest-7: 7.6.9`, `latest-6: 6.2.2`,
`next: 9.0.0-alpha.7`.

**Yes, `^6 || ^7` + podspec `< 8.0` is a reviewer concern**, on three counts **[I]**:

1. A consumer on a current Capacitor project hits a peer-dep conflict on `npm install`. For a plugin
   selling itself on `npm install` + 10 lines, that is the pitch failing at step one.
2. The repo is already internally inconsistent about it: `example/package.json` carries
   `@capacitor/cli: ^8.3.4` in devDeps while its runtime `@capacitor/{core,android,ios}` are
   `^6.0.0` **[V]** — a Capacitor 8 CLI syncing a Capacitor 6 project. This looks like a stray
   Dependabot bump that landed before the ignore rule in `[Unreleased]`, and a reviewer grepping
   `package.json` files will find it.
3. `demo/` is entirely Capacitor 6 **[V]**, so the "fork-as-starter" reference app starts consumers
   two majors behind.

### What a Capacitor 8 forward-compat PR needs

From the [official upgrade guide](https://capacitorjs.com/docs/updating/8-0) **[V]** and the
[Capawesome plugin-author guide](https://capawesome.io/blog/how-to-upgrade-your-capacitor-plugin-to-capacitor-8/) **[V]**:

| Requirement | Capacitor 8 | Plugin today | Gap |
|---|---|---|---|
| Node | **22+** | CI uses 22 **[V]** | ✅ none |
| Xcode | **26.0+** | CI `macos-latest` = macOS 26 arm64, default **Xcode 26.6** **[V]** | ✅ none — *and this is the same Xcode floor BrazeKit 15+ needs, so the two bumps share a gate* |
| iOS deployment target | **15.0** | podspec already `15.0` **[V]** | ✅ none |
| AGP | **8.13.0** | `8.6.0` **[V]** | bump |
| Gradle wrapper | **8.14.3** | demo at 8.7 **[V]** | bump |
| Kotlin | **2.2.20** | `2.2.0` **[V]** | bump |
| compileSdk / targetSdk | **36 / 36** | `35 / 35` **[V]** | bump |
| minSdk | **24** | plugin default `26` **[V]** | ✅ already above |
| JDK | 21 (AGP 8.13 / Kotlin 2.2.20 era) **[I]** | CI Android job pins `java-version: '17'` **[V]**; runner default is **JDK 21** **[V]** | one-line CI change |
| Gradle DSL | `compileSdk = 36` assignment syntax; `kotlinOptions{}` → `compilerOptions{}` | space syntax + `kotlinOptions{}` **[V]** | mechanical |
| `CAPPlugin` / `CAP_PLUGIN_METHOD` | **Still works.** The plugin-author guide explicitly says *"Updating your `.podspec` deployment target and dependencies keeps a CocoaPods-only plugin working"*; SPM/`CAPBridgedPlugin` is **optional** **[V]** | `BrazePlugin.m` macros retained | ✅ no change required |

**The SPM question is separate and more strategic.** Capacitor 8's CLI *creates iOS SPM projects by
default* **[V]**, and CocoaPods' Specs repo is reported to go read-only in December 2026 **[I,
second-hand — verify before citing]**. A CocoaPods-only plugin still installs into a Podfile-based
Cap 8 app, but it does **not** install into a default-generated Cap 8 app. Adding SPM support means a
`Package.swift`, `CAPBridgedPlugin` conformance (`identifier`, `jsName`, `pluginMethods`), and — the
part that needs actual verification — resolving `BrazeKit`/`BrazeUI` through SPM. Braze does ship a
`Package.swift` with `BrazeKit`, `BrazeUI`, `BrazeLocation`, `BrazeNotificationService` products
**[V]**, so the pieces exist. **Recommend scoping SPM as its own tracked issue, not folded into the
bump PR** — and having the issue *open* is itself a good review answer. **[I]**

---

## 6. Security advisories

| Platform | Finding | Verdict |
|---|---|---|
| iOS 14.1.0→18.2.1 | Grepped the full range for `securit`/`vulnerab`/`CVE`/`exploit`/`injection`. **Zero matches.** One stability item: 15.0.1 *"resolving a crash that would occur under low memory conditions"* **[V]** | No security driver |
| Android 42.2.0→43.2.0 | Same grep. **Zero matches.** One stability item: 43.2.0 pre-init `CancellationException` crash on `wipeData`/`disableSdk`/`logout` — an availability bug the plugin's C07 design actively invites **[V]** | No CVE, but the C07 crash is a strong practical driver |
| **Web 6.0→6.13** | **6.12.1: *"an in-app message with multiple buttons could be displayed even when one of its buttons used a `javascript:` or `data:` URI and the `allowUserSuppliedJavascript` initialization option was disabled."*** **[V]** | **Security fix. Bypass of an explicit safety toggle. Raise the peer floor.** |
| Web 6.9.0 / 6.3.0 | "Improved crawler bot detection" (×2) — anti-abuse hardening, not a vuln **[V]** | Nice-to-have |

No GitHub Security Advisories or CVEs were found attached to any of the three SDKs in the assessed
ranges **[V — absence of evidence in the changelogs; I have not queried the GHSA database directly,
see Risk R4]**.

**Net: this is not a "drop everything" security bump, but it is no longer purely hygiene.** The web
floor bump is mandatory; the iOS/Android bumps are strongly motivated by the C07 crash + the policy
breach rather than by a CVE. **[I]**

---

## 7. The bump plan

### 7.1 Sequencing

C08 step 3 permits one platform per branch. Recommended order — **cheapest-to-riskiest, each
independently shippable**, so a stall on one does not block the others **[I]**:

**PR 1 — Web security floor (hours).**
- `package.json`: peer `@braze/web-sdk` `^6.0.0` → `^6.13.0`.
- `example/package.json`, `demo/package.json`: same.
- `test/web/` — re-run the 108 behavioral tests against 6.13.0.
- `C08`: add a "security-motivated floor bump" clause to *Bumping the Web SDK peer dep range*.
- `C10 §Web`: revisit the `requestPushPermission` note in light of 6.11.0's `registerPush()`.
- `CHANGELOG`: `### Security` section — this is the first entry that has earned one.

**PR 2 — Android 42.2.0 → 43.2.0 (1–2 days).**
- `android/build.gradle`: pin → `43.2.0`.
- CI `verify-android`: `java-version: '17'` → `'21'` (runner default is already 21 **[V]**).
- `C10 §Android`: (a) correct the stale `minSdkVersion 21/22` + `targetSdkVersion 34` text against
  the actual `android/build.gradle` defaults (`minSdk 26`, `compileSdk 35`, `targetSdk 35`) **[V —
  this is existing drift, not caused by the bump]**; (b) **new subsection on the 43.0.0 FCM
  Installation-ID registration path** and how it interacts with the plugin's documented
  `registerPushToken` handoff.
- `README` push section: same FCM note.
- JSDoc: `refreshFeatureFlags` rate-limit note.
- Layer 4 Android smoke.

**PR 3 — iOS 14.1.0 → 18.2.1 (2–4 days; the substantive one).**
- `CapacitorBraze.podspec`: `BrazeKit`/`BrazeUI` → `18.2.1`.
- `BrazePlugin.swift`: migrate `getUserId` → `braze.user.getId(_:)`, `getDeviceId` →
  `braze.getDeviceId(_:)` (~15 lines, both verified present **[V]**).
- `definitions.ts` JSDoc: `getUserId` returns `null` after `wipeData` on iOS **and now matches
  Android/Web**; `contentCardsUpdated` now fires on `changeUser` on all three platforms.
- `C03`: update the cross-platform translation notes for both, and **delete the now-obsolete
  divergence entries** — this bump *closes* two documented iOS-only quirks, which is a selling point,
  not a cost.
- `C05`: `contentCardsUpdated` fires on user switch.
- `C07`: re-verify the documented iOS asymmetries (`enableSDK` requires init; `isDisabled` false
  pre-init) still hold at 18.2.1 — **unverified, see Risk R2**.
- `C10 §iOS`: **new hard requirement — Xcode 26+**; and **fix the false rationale** (see §7.2).
- `C08`: update the pin table; **fix the two dead links to `BrazePlugin.podspec`** (§7.2).
- `test/web` + Android Robolectric suites are unaffected; iOS XCTest contract tests need a pass.
- CI `verify-ios`: add an explicit `xcode-select` / `DEVELOPER_DIR` pin to Xcode 26.x rather than
  relying on the runner default drifting **[I — the runner default is 26.6 today, but pinning is the
  point of C08's philosophy]**.
- Layer 4 iOS smoke — **the step C08 calls non-negotiable and the one currently blocked on a trial
  account** (see Risk R3).

**PR 4 — Capacitor 8 forward-compat (separate lane, 1–2 days).**
- `package.json` peer: `^6.0.0 || ^7.0.0 || ^8.0.0`; podspec `Capacitor '>= 6.0', '< 9.0'`.
- `android/build.gradle`: AGP `8.6.0` → `8.13.0`, Kotlin `2.2.0` → `2.2.20`, compileSdk/targetSdk →
  36, assignment syntax, `kotlinOptions{}` → `compilerOptions{}`.
- `demo/` + `example/`: Capacitor 6 → 8 across `@capacitor/{core,cli,android,ios}`; Gradle wrapper →
  8.14.3; `variables.gradle` → compileSdk/targetSdk 36, minSdk 24.
- Fix the `example/` Cap-8-CLI-on-a-Cap-6-project inconsistency **[V]**.
- Revisit the Dependabot `@capacitor/*` major ignore now that the blocker is cleared.
- **Open a tracking issue for SPM / `CAPBridgedPlugin`; do not fold it in.**

### 7.2 Documentation drift found while researching (fix in the same PRs)

These are pre-existing and independently review-visible **[V]**:

1. **`C08` links a file that does not exist.** Two references to `BrazePlugin.podspec`
   (`../../BrazePlugin.podspec`); the actual file is **`CapacitorBraze.podspec`**. Dead links in the
   MDC that governs pinning.
2. **`C10 §"Why `platform :ios, '15.0'`"` states a false fact.** It claims *"BrazeKit 14.x sets
   `s.ios.deployment_target = '15.0'` in its podspec."* **Verified false** — `BrazeKit.podspec` at
   tag `14.1.0` sets `12.0`, as does `15.0.0`, as does `18.2.1`; `Package.swift` declares `.iOS(.v12)`
   throughout. `README.md:1512` repeats the claim (*"BrazeKit 14.x requires iOS 15+"*), as does
   `README.md:81`. **The iOS 15 floor is the plugin's own choice** (its podspec sets it), which is a
   perfectly good choice — it matches Capacitor 8's requirement — but the stated *reason* is wrong,
   and a reviewer who checks one upstream podspec finds it. Rewrite the rationale as "the plugin's
   own floor, aligned with Capacitor 8." *(Caveat: the `use_frameworks! :linkage => :static`
   requirement in the same section **is** correct — `BrazeUI.podspec` sets `s.static_framework = true`
   **[V]**.)*
3. **`C10 §Android` numbers are stale** vs. `android/build.gradle`: doc says minSdk 21/22,
   targetSdk 34, AGP 8.6.0/Gradle 8.7; the plugin's gradle defaults are minSdk **26**, compileSdk 35,
   targetSdk **35**.
4. **`README.md:3` still says "0.0.x — not yet published to npm; consume via git for now"** while
   `package.json` is `0.1.0` and `CLAUDE.md` marks the npm publish ✅. `README:1497`/`:1512` also
   still carry the 14.x pins.

### 7.3 Version number — and a policy conflict to resolve first

`C08` step 8 says: *"If the upstream bump is a major (breaking changes): **plugin major bump
always**."* `CHANGELOG.md` says: *"Pre-1.0: minor versions may include breaking changes (documented
loudly here)."* At `0.1.0`, "plugin major bump" means `1.0.0`, which signals a stability commitment
this project is not ready to make (C11 integration tier ⏳, Layer 4 smoke ⏳, SPM ⏳).

**Recommendation: ship `0.2.0` with explicit `BREAKING:` lines, and amend C08 step 8 to read "major
bump post-1.0; pre-1.0, a minor with `BREAKING:` lines."** Doing this *in the bump PR* turns a
latent contradiction into evidence that the maintainer reads their own docs. Leaving it is a free
reviewer catch. **[I]**

**Consumer-facing breaking changes to document loudly:**

| Change | Who it breaks |
|---|---|
| **Xcode 26.0+ required** (BrazeKit 15.0.0) | every iOS consumer on Xcode 16/25 — **the big one** |
| Mac Catalyst floor → iOS 16 / macOS 13 | Catalyst consumers only |
| `getUserId` returns `null` after `wipeData` on iOS | anyone relying on the old iOS-only behavior |
| `contentCardsUpdated` now fires on `changeUser` on iOS | listener consumers who deduplicate by assuming it didn't |
| Content Cards reflect view/dismiss/click immediately (iOS 16.0.0) | anyone asserting pre-sync state |
| Android: automatic FCM Installation-ID registration (43.0.0) | Android push consumers with a custom `FirebaseMessagingService` |
| `@braze/web-sdk` floor → `^6.13.0` | web consumers with an older lockfile — **but this is the security fix** |
| *(if PR 4 ships together)* AGP 8.13.0 / Gradle 8.14.3 / Kotlin 2.2.20 / compileSdk 36 / minSdk 24 | every Android consumer |

---

## 8. Risks and unknowns (explicit)

**R1 — Android AGP 9 consumer impact is unverified.** Braze 43.1.0 *"Updated the Android Gradle
Plugin from 8.12.3 to 9.2.1"* and *"Migrated to AGP 9 built-in Kotlin"*. That describes how Braze
builds the SDK. Whether the published AAR's metadata imposes an AGP floor on consumers is **not
stated**, and 43.1.1's fix to *"published AAR metadata requiring consuming apps to compile against
API 37"* proves this release train has already shipped one unintended consumer-facing metadata
constraint. **Mitigation: a real Gradle resolve against 43.2.0 from the plugin's current AGP 8.6.0 is
the only way to know. Do this first in PR 2 — it can flip the Android bump from "1–2 days" to
"blocked on the Capacitor 8 AGP bump."** Counter-evidence that it is probably fine: Braze's own RN
wrapper ships `43.1.1` with `minSdkVersion 21` defaults **[V]**.

**R2 — The C07 iOS asymmetries are unverified at 18.2.1.** `C07` and `definitions.ts` document that
on BrazeKit 14.x, `enableSDK` requires init while `isDisabled` returns `false` pre-init. `var enabled
{ get set }` and `wipeDataAndDisableForAppRun()` all still exist at 18.2.1 **[V]**, but symbol
survival says nothing about the pre-init *behavior*, and 17.0.0's non-blocking-init rework is exactly
the kind of change that could shift it. **This is testable only at runtime, i.e. Layer 4.**

**R3 — Layer 4 smoke is still blocked, and C08 forbids bumping without it.** `C08` Forbidden:
*"Bumping a pin without running Layer 4 smoke. CI green isn't enough."* `CLAUDE.md` marks Layer 4 as
⏳ *"wrappers staged, captures pending maintainer trial."* **The bump cannot be completed to the
repo's own standard until a Braze trial account exists.** This is the one dependency that could make
"bump before the review" infeasible on a short timeline — and if so, the honest review answer is a
*branch with the digest and the code change, CI-green, explicitly marked "pending Layer 4,"* which is
far stronger than an unexamined stale pin. **[I]**

**R4 — I did not query the GHSA/CVE databases directly.** The security conclusion in §6 rests on
grepping the three upstream changelogs. Braze SDKs are commercially licensed with no public advisory
feed I located. A pre-review `gh api /advisories` sweep for `braze` is cheap insurance.

**R5 — CocoaPods Specs read-only date is second-hand.** The December 2026 date came from a
third-party blog, not from CocoaPods. It materially affects SPM urgency; verify before putting it in
a plan doc.

**R6 — `macos-latest` will migrate again.** It is macOS 26 arm64 / Xcode 26.6 default **today**
**[V]**. GitHub migrates `-latest` gradually. Since BrazeKit ≥15 hard-requires Xcode 26, the
`verify-ios` job should pin `DEVELOPER_DIR` explicitly rather than inherit a moving default — the
same argument C08 makes for SDK pins, applied to the toolchain.

**R7 — I did not build anything.** Every "no change needed" in §4 is a *symbol-existence* claim from
the shipped `.swiftinterface` / published source, not a compile. Signature-compatible behavioral
changes (the 16.0.0 and 17.0.0 items) are called out from the changelog, but only a real
`xcodebuild` / `gradle` run against the new pins proves the bridges compile.

**R8 — Web SDK 7 timing is unknown.** No `next` tag, no prerelease, no public roadmap found **[V]**.
If 7.0 lands soon after a `^6.13.0` floor bump, the peer range needs another visit.

---

## 9. Sources

- [braze-swift-sdk CHANGELOG](https://github.com/braze-inc/braze-swift-sdk/blob/main/CHANGELOG.md) · [releases](https://github.com/braze-inc/braze-swift-sdk/releases)
- `BrazeKit.podspec` / `BrazeUI.podspec` / `Package.swift` at tags `14.1.0`, `15.0.0`, `18.2.1` (raw.githubusercontent.com)
- `BrazeKit.xcframework` 18.2.1 + 14.1.0 `arm64-apple-ios.swiftinterface` (extracted from the published release zips)
- `Sources/BrazeUI/InAppMessageUI/*` @ `18.2.1`
- [braze-android-sdk CHANGELOG](https://github.com/braze-inc/braze-android-sdk/blob/master/CHANGELOG.md) · `BrazeInAppMessageManager.kt` @ `v43.2.0`
- [braze-web-sdk CHANGELOG](https://github.com/braze-inc/braze-web-sdk/blob/master/CHANGELOG.md) · `npm view @braze/web-sdk versions|dist-tags`
- [braze-react-native-sdk](https://github.com/braze-inc/braze-react-native-sdk) `package.json` / `.podspec` / `android/build.gradle` @ `master`
- [braze-flutter-sdk](https://github.com/braze-inc/braze-flutter-sdk) `pubspec.yaml` / `ios/braze_plugin.podspec` / `android/braze-android-sdk.gradle` @ `master`
- [braze-cordova-sdk](https://github.com/braze-inc/braze-cordova-sdk) `plugin.xml` @ `master`
- [Capacitor 8 upgrade guide](https://capacitorjs.com/docs/updating/8-0) · [Capawesome: upgrading a plugin to Capacitor 8](https://capawesome.io/blog/how-to-upgrade-your-capacitor-plugin-to-capacitor-8/) · [Capacitor SPM docs](https://capacitorjs.com/docs/ios/spm) · `npm view @capacitor/core dist-tags`
- [actions/runner-images](https://github.com/actions/runner-images) — `macos-latest` mapping + `macos-26-arm64` image manifest
- [Braze SDK version management](https://www.braze.com/docs/developer_guide/sdk_integration/version_management) — no published support window
- Repo (read-only): `CapacitorBraze.podspec`, `android/build.gradle`, `package.json`, `src/web.ts`, `ios/Plugin/BrazePlugin.swift`, `ios/Plugin/BrazeIAMDelegate.swift`, `android/src/main/java/com/bma342/braze/BrazePlugin.kt`, `docs/mdcs/C08`, `docs/mdcs/C10`, `.github/workflows/test.yml`, `README.md`, `CHANGELOG.md`, `example/package.json`, `demo/package.json`, `demo/android/variables.gradle`, `demo/ios/App/Podfile`
