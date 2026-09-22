# C10 — Consumer integration requirements

**Some consumer-side configuration is non-optional. The plugin can't apply it for the consumer (their Podfile, their `build.gradle`, their `AndroidManifest.xml`), but the plugin's docs MUST tell them exactly what to set. Anything required at install time and not documented here is a bug.**

[C08](./C08-NATIVE-SDK-PINNING.md) covers the *versions* of the native SDKs the plugin pins to. C10 covers the *configuration* those pins force the consumer to apply. Version pins and config requirements move together — bumping an SDK can introduce new requirements, which is why this MDC lives next to C08.

---

## Rule

For every native SDK requirement that the plugin's pinned version forces on the consumer's app, the requirement MUST be:

1. **Documented in this MDC** with a worked example pinned to the demo's current config.
2. **Referenced from the README** in the iOS / Android setup sections, with a link back here.
3. **Updated when the underlying SDK pin changes** ([C08](./C08-NATIVE-SDK-PINNING.md) bump protocol), in the same PR. A pin bump that introduces a new requirement and doesn't update this MDC is incomplete.

The plugin does NOT try to programmatically modify the consumer's `Podfile` / `build.gradle` / `AndroidManifest.xml` via `postinstall` scripts. Consumer config is the consumer's responsibility; our job is to document the requirements clearly so the consumer can apply them in one read.

## Rationale

Why C10 exists as its own MDC (not folded into C08):

1. **C08 is about *which version* we pin to**, and the protocol for changing pins. The pinning policy is mostly a maintainer concern.
2. **C10 is about *what consumers need to do* given those pins.** This is a consumer concern that ships in user-facing docs.
3. The two move together — every C08 pin bump should trigger a C10 audit — but they answer different questions and serve different audiences.

If C10 didn't exist as a discipline, integration requirements would drift into the README + the demo's `Podfile` comments + scattered Stack Overflow answers, with no single source of truth. The first time we forget to update README after an SDK bump, consumers regress.

---

## The support matrix (0.3.0)

`0.3.0` widened the plugin from "Capacitor 6 or 7, CocoaPods only" to **Capacitor 6, 7 or 8, under
either CocoaPods or Swift Package Manager**. The single reason the widening was necessary: since
Capacitor 8, `npx cap add ios` generates an **SPM** project by default, so a CocoaPods-only plugin
does not install into a stock Capacitor 8 app at all — it installs only into an app whose
maintainer deliberately chose the Podfile path.

| Capacitor | npm install | iOS — CocoaPods | iOS — SPM | Android | Web |
|---|---|---|---|---|---|
| **6.x** | ✅ peer `^6.0.0` | ✅ podspec `>= 6.0, < 9.0` | ⚠️ *possible, unverified* — `cap add ios` in Cap 6 has no `--packagemanager SPM` flag, so there is no stock SPM project to test against | ✅ your `variables.gradle` overrides the plugin's Cap-8 defaults | ✅ |
| **7.x** | ✅ peer `^7.0.0` | ✅ | ⚠️ *possible, unverified* — same reason; Capacitor 7 gained SPM as opt-in but the repo has no Cap 7 app | ✅ same | ✅ |
| **8.x** | ✅ peer `^8.0.0` | ✅ **verified** — `demo/ios` | ✅ **verified** — `example/ios` | ✅ **verified** — `demo/android` | ✅ |
| **9.x** | ❌ by design | ❌ podspec `< 9.0` | ❌ `capacitor-swift-pm` range is `..<"9.0.0"` | — | — |

**What "verified" means here** is a CI job, not a claim: `verify-ios` builds `demo/ios` through
`pod install` + `xcodebuild test`, then builds `example/ios` through SPM; `verify-android` builds
`demo/android` on JDK 21 with compileSdk 36. What is **unverified** is Capacitor 6/7 — nothing in
this repo compiles against them any more, because both apps moved to Capacitor 8. The peer dep and
the podspec still *allow* 6 and 7 and the mechanisms are shared (see the registration note below),
but a 6/7 regression would reach a consumer before it reached CI. Say so rather than implying a
matrix that is actually tested.

### One plugin-registration mechanism for all three majors

`ios/Plugin/BrazePlugin.m` and its 35 `CAP_PLUGIN_METHOD` macros are **gone** as of 0.3.0. An SPM
target cannot mix Swift and Objective-C sources, so the registration moved into
`BrazePlugin.swift` as `CAPBridgedPlugin` conformance (`identifier`, `jsName`, `pluginMethods`).

This is safe across 6/7/8 for two verified reasons, not one:

1. `Capacitor/CAPBridgedPlugin.h` is **byte-identical** in `@capacitor/ios` 6.2.2, 7.6.9 and 8.5.2,
   and `CapacitorBridge.registerPlugins()` in all three tests `plugin as? (CAPPlugin &
   CAPBridgedPlugin).Type` — it never cared whether the conformance came from an Obj-C category or
   from Swift.
2. `@capacitor/cli`'s `findPluginClasses` (`dist/util/iosplugin.js`) is also identical across 6.x
   and 8.x, and matches `@objc\(([A-Za-z0-9_-]+)\)` in every `.swift` under the plugin's `ios/`
   directory. `@objc(BrazePlugin)` is still there, so `capacitor.config.json`'s `packageClassList`
   still resolves to `["BrazePlugin"]` with no `.m` present. Confirmed by inspecting the file
   `cap sync ios` wrote into `demo/ios/App/App/`.

### Source layout

Also moved in 0.3.0, to the layout Capacitor's own plugins use so SPM's default target discovery
works without `exclude:` gymnastics:

| Was | Is |
|---|---|
| `ios/Plugin/*.swift` | `ios/Sources/BrazePlugin/*.swift` |
| `ios/Plugin/PrivacyInfo.xcprivacy` | `ios/Sources/BrazePlugin/PrivacyInfo.xcprivacy` |
| `ios/Plugin/BrazePlugin.m` | *(deleted)* |
| `ios/PluginTests/*.swift` | `ios/Tests/BrazePluginTests/*.swift` |

**This only affects people who referenced the paths** (forks, patches, a `patch-package` diff, or a
Podfile pointing at `:path`). Consumers installing from npm see no difference: the podspec's
`source_files` and the package's `files` list were updated in the same commit.

---

## iOS — install path A: Swift Package Manager (Capacitor 8 default)

Nothing to configure. `Package.swift` at the repo root declares the library `CapacitorBraze`, and
`npx cap sync ios` writes the wiring into your app's `ios/App/CapApp-SPM/Package.swift` for you:

```swift
// ios/App/CapApp-SPM/Package.swift — DO NOT MODIFY, generated by the Capacitor CLI
dependencies: [
    .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
    .package(name: "CapacitorBraze", path: "../../../../node_modules/capacitor-braze")
],
```

Xcode then resolves `braze-swift-sdk` **18.2.1 exactly** transitively through the plugin's own
manifest. You do not add a Braze package reference yourself, and you must not — a second, differently
versioned reference is how you get two BrazeKits in one binary.

Things worth knowing:

- **`BrazeKit` is a `binaryTarget`.** The first resolve downloads `BrazeKit.zip` from GitHub
  Releases, which is slow (tens of seconds to minutes) and needs network access. A CI cache of
  `~/Library/Caches/org.swift.swiftpm` or `DerivedData/SourcePackages` pays for itself.
- **`BrazeUI` is a source target**, so it compiles in your build rather than arriving prebuilt.
- **iOS 15 floor.** `Package.swift` declares `platforms: [.iOS(.v15)]`, matching the podspec.
- **`swift build` from the command line does not work** for this package, and that is expected, not
  a bug: `capacitor-swift-pm` ships iOS-only xcframeworks, so a host-platform (macOS) build cannot
  resolve them. Build through Xcode / `xcodebuild` with an iOS destination, which is what
  `verify-ios` does.
- **The privacy manifest ships as an SPM resource** (`resources: [.copy("PrivacyInfo.xcprivacy")]`),
  so both install paths give Xcode the same manifest to aggregate.

## iOS — install path B: CocoaPods

Still fully supported, and still what `demo/ios` uses. Two Podfile lines are **non-optional**, and
Capacitor's stock Podfile template has neither.

### Required `Podfile` config

**Xcode 26 or newer is required.** BrazeKit raised its Xcode floor to 26.0 at 15.0.0 and the plugin
pins 18.2.1. Capacitor 8 wants Xcode 26 as well, so the two floors coincide.

One failure mode is worth naming because it does not look like a version error: an
Xcode 26 install whose **iOS simulator runtime** is older than its iOS SDK reports *no* iOS
Simulator destinations at all —

```
[MT] IDERunDestination: Supported platforms for the buildables in the current scheme is empty.
xcodebuild: error: Unable to find a destination matching the provided destination specifier
```

with the real cause only visible from a direct target build (`No simulator runtime version from
[...] available to use with iphonesimulator SDK version ...`). Fix: `xcodebuild -downloadPlatform iOS`.
This applies to CI images as well as developer machines.

The consumer's `ios/App/Podfile` MUST set both of the following:

```ruby
platform :ios, '15.0'
use_frameworks! :linkage => :static
```

Both are non-optional. Capacitor's stock `cap add ios` template ships with `platform :ios, '13.0'` and `use_frameworks!` (dynamic) — those defaults will fail `pod install` against this plugin.

### Why `platform :ios, '15.0'`

**This is the plugin's own floor, not BrazeKit's.** `CapacitorBraze.podspec` sets
`s.ios.deployment_target = '15.0'`, and CocoaPods aborts with `"required a higher minimum deployment
target"` when the consumer's Podfile sets a lower one. Capacitor's stock template ships `13.0`.

An earlier version of this MDC — and the README — said BrazeKit required iOS 15. **That is false,
and verifiably so:** `BrazeKit.podspec` declares `12.0` at tag 14.1.0, at 15.0.0 and at 18.2.1, and
`Package.swift` declares `.iOS(.v12)` throughout. Getting the *reason* wrong matters because a
consumer who checks upstream and finds iOS 12 reasonably concludes the requirement is spurious and
removes the line.

The real reason to keep 15.0: it matches Capacitor's modern floor (Capacitor 8 requires iOS 15), so
it costs nothing a Capacitor consumer is not already paying, and it avoids a per-release argument
about which BrazeKit APIs are available. Consumers may set their Podfile *higher* (iOS 16, 17) but
not lower.

### Why `use_frameworks! :linkage => :static`

BrazeKit ships as a **static** `.xcframework`. CocoaPods' default `use_frameworks!` is dynamic linkage. When CocoaPods sees a static framework inside a dynamic-linkage target's transitive dependency graph, it aborts with:

```
[!] The 'Pods-App' target has transitive dependencies that include statically
    linked binaries: (.../Pods/BrazeKit/BrazeKit.xcframework)
```

The `[!]` looks like a warning but is in fact a hard validation step (`verify_no_static_framework_transitive_dependencies` in CocoaPods 1.16+). `pod install` exits non-zero and no `Podfile.lock` is generated.

Three resolutions exist in theory; only one is correct for this plugin:

| Option | Verdict |
|---|---|
| `use_frameworks! :linkage => :static` | ✅ Correct. Forces every Pod in the consumer's target to link statically, which is what BrazeKit requires. |
| `use_modular_headers!` instead of `use_frameworks!` | ❌ Capacitor's own Pods (`Capacitor`, `CapacitorCordova`) assume framework linkage. Switching breaks Capacitor's bootstrap. |
| Suppress the validation with `install! 'cocoapods', :warn_for_unused_master_specs_repo => false` style flags | ❌ Suppresses the symptom, leaves the runtime mixing of static + dynamic linkage which can cause duplicate-symbol crashes at app launch. |

Worked example — the demo's Podfile (verified working against Capacitor 8.5.2 at 0.3.0):

```ruby
require_relative '../../node_modules/@capacitor/ios/scripts/pods_helpers'

platform :ios, '15.0'
# Static linkage is required because BrazeKit ships as a static XCFramework.
# Capacitor's default `use_frameworks!` (dynamic) refuses to mix the two.
# Per Braze iOS install docs: https://www.braze.com/docs/developer_guide/platforms/swift/initial_sdk_setup/overview/
use_frameworks! :linkage => :static

install! 'cocoapods', :disable_input_output_paths => true

def capacitor_pods
  pod 'Capacitor', :path => '../../node_modules/@capacitor/ios'
  pod 'CapacitorCordova', :path => '../../node_modules/@capacitor/ios'
  pod 'CapacitorBraze', :path => '../../..'
end

target 'App' do
  capacitor_pods
end

post_install do |installer|
  assertDeploymentTarget(installer)
end
```

Both customizations (deployment target + linkage) are above `def capacitor_pods` and apply globally to the target. See [`demo/ios/App/Podfile`](../../demo/ios/App/Podfile) for the canonical reference.

### iOS push entitlements (only if consumers use push)

If the consumer plans to use Braze-orchestrated push notifications, they must additionally:

1. Enable the **Push Notifications** capability in Xcode (Signing & Capabilities tab).
2. Enable **Background Modes → Remote notifications** in Xcode.
3. Forward the APNs device token from `@capacitor/push-notifications`' `registration` event to
   `Braze.registerPushToken({ token })`. The token arrives as a hex string; the bridge decodes it,
   and rejects whitespace-only or zero-byte tokens rather than registering an empty one.

```ts
import { PushNotifications } from '@capacitor/push-notifications';
import { Braze } from 'capacitor-braze';

PushNotifications.addListener('registration', ({ value }) => {
  Braze.registerPushToken({ token: value });
});
await PushNotifications.requestPermissions();
await PushNotifications.register();
```

**That covers registration only — Braze will record sends but no opens.** To hand notification
opens, deep links, rich push payloads and background push to BrazeKit, pass
`enablePushAutomation: true` to `initialize`:

- It is **iOS-only**; Android and Web ignore it (Android's manifest-declared receiver already does
  the equivalent, and Web Push has no comparable concept).
- It is **off by default**, so an app with its own `UNUserNotificationCenter` delegate keeps full
  control until it opts in. With the flag off, the plugin never touches the notification centre.
- When on, the bridge sets `configuration.push.automation = true` and registers Braze's notification
  categories with `UNUserNotificationCenter.current().setNotificationCategories(...)`.
- **It does not request permission for you.** That stays with `@capacitor/push-notifications`.
- **Attribution caveat:** `initialize` necessarily runs after app launch, so a push that *launched*
  the app may already have been delivered before Braze is configured, and may not be attributed.
  Initialize as early in your startup path as you can.

The plugin requires none of this for non-push consumers (events + content cards need neither).

---

## Android — required config

Two independent floors stack here, and the higher one wins:

| Source | AGP | Gradle | Kotlin | compileSdk | minSdk | JDK |
|---|---|---|---|---|---|---|
| Braze `com.braze:android-sdk-ui:43.2.0`, via its transitive androidx deps | 8.6.0 | 8.7 | 2.2.0 | 35 | (21) | — |
| Capacitor 8 (`@capacitor/android` 8.5.2 + its project template) | 8.13.0 | 8.14.3 | — | 36 | 24 | 21 |
| **Plugin defaults in `android/build.gradle`** | **8.13.0** | *(consumer's wrapper)* | **2.2.20** | **36** | **24** | **21** |

Nothing in Braze's own AAR metadata forces any of the Braze column: `com.braze:android-sdk-ui:43.2.0`
declares `minCompileSdk=21` and `minAndroidGradlePluginVersion=1.0.0` in its
`aar-metadata.properties`. The numbers come from `androidx.recyclerview 1.4.0` (compileSdk 35) and
`androidx.swiperefreshlayout 1.2.0` (AGP 8.6.0). Worth stating because Braze 43.1.0's changelog
mentions AGP 9.2.1, which describes how Braze *builds* the SDK and is not a consumer requirement.

**A Capacitor 8 consumer therefore has nothing to configure on Android.** The stock Capacitor 8
template already exceeds every Braze floor. This is new in 0.3.0 — through 0.2.0 the README listed
three mandatory Gradle edits, and all three are now the template's own defaults.

**A Capacitor 6 or 7 consumer still needs the three edits**, because Capacitor 6/7's templates ship
AGP 8.2.x / Gradle 8.2.1 / Kotlin 1.9.x / compileSdk 34:

```groovy
// android/build.gradle
buildscript {
    dependencies {
        classpath 'com.android.tools.build:gradle:8.6.0'              // from 8.2.x
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0'   // from 1.9.x
    }
}
```

```groovy
// android/variables.gradle
ext {
    compileSdkVersion = 35   // from 34
}
```

```
# android/gradle/wrapper/gradle-wrapper.properties — AGP 8.6.0 needs Gradle 8.7+
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-all.zip
```

Skipping them produces, respectively:

```
Dependency 'androidx.swiperefreshlayout:swiperefreshlayout:1.2.0' requires
Android Gradle plugin 8.6.0 or higher.

Dependency 'androidx.recyclerview:recyclerview:1.4.0' requires libraries and
applications that depend on it to compile against version 35 or later of
the Android APIs.
```

**The Kotlin plugin bump is not optional.** Braze 43.x ships Kotlin **2.2.0** metadata; Kotlin 1.9.x
reads up to 2.0.0 and aborts the compile with "incompatible version of Kotlin" errors against every
Braze class.

### Why the plugin's raised defaults do not break Capacitor 6/7

Every value in the plugin's `android {}` block is read from `rootProject.ext` **first**:

```groovy
compileSdk project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 36
minSdkVersion project.hasProperty('minSdkVersion') ? rootProject.ext.minSdkVersion : 24
targetSdkVersion project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 36
```

A Capacitor 6 app's `variables.gradle` sets all three, so it gets its own numbers and the plugin's
defaults never apply. The defaults matter only when the module is built standalone, with no host
app — which is why they track the newest Capacitor major rather than the oldest.

### Bytecode level — deliberately still 17

The library emits **JVM 17** bytecode (`compileOptions` + the `kotlin { compilerOptions { jvmTarget } }`
block), while Capacitor 8's `:capacitor-android` is compiled at Java 21 and the CLI writes
`JavaVersion.VERSION_21` into your app's generated `capacitor.build.gradle`.

That mix is fine, and it was **checked rather than assumed**: `demo/android`'s
`:app:assembleDebug` links the JVM-17 plugin AAR against the Java-21 `:capacitor-android` and
succeeds. Staying at 17 keeps the plugin loadable from a Capacitor 6/7 app whose own modules are
still at Java 17 — raising it would be a consumer-facing break for no gain.

**JDK 21 is required to build** either way (AGP 8.13 needs it), even though the output is 17.

### Sessions are handled by the plugin

As of 0.2.0 the plugin registers `BrazeActivityLifecycleCallbackListener(sessionHandlingEnabled = true,
registerInAppMessageManager = false)` on the `Application` **once per process** during `initialize`,
and immediately opens a session for the host Activity. Before that, no session was ever opened and
every event was logged outside one, which silently broke DAU/MAU, session length, sessions-per-user,
session-start triggers and flush-on-background.

**Consumers must not register their own** `BrazeActivityLifecycleCallbackListener`, or sessions are
double-counted. In-app message manager registration stays with the plugin's
`handleOnResume`/`handleOnPause` (gated by `enableInAppMessageUI`), which is why the listener above
is constructed with `registerInAppMessageManager = false`.

### Android push setup (only if consumers use push)

**The plugin declares nothing here.** `android/src/main/AndroidManifest.xml` is empty — no
`<application>`, no service, no receiver — and the bridge has zero Firebase references. So the
plugin cannot collide with `@capacitor/push-notifications`, and equally it cannot wire inbound push
for you. Everything below is consumer-side.

Common to both paths:

1. Add a Firebase project, download `google-services.json`, drop it into `android/app/`.
2. Apply the Google Services Gradle plugin in `android/app/build.gradle`.
3. Forward the FCM token from `@capacitor/push-notifications`' `registration` event to
   `Braze.registerPushToken({ token })` — unless you use Braze's automatic registration (below).

The demo's `android/app/google-services.json` is intentionally absent; the consumer's Firebase
project is the consumer's account.

#### Path A — you have no `FirebaseMessagingService` of your own

Register Braze's directly. This is Braze's documented step 1 and it is **required** for Braze's open
and click-action tracking to work:

```xml
<!-- android/app/src/main/AndroidManifest.xml, inside <application> -->
<service
    android:name="com.braze.push.BrazeFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

#### Path B — you already have one

Only one service can win the `com.google.firebase.MESSAGING_EVENT` intent filter, so a consumer who
also uses `@capacitor/push-notifications` must **not** register Braze's as well. Forward instead —
this is the shape Braze documents:

```kotlin
// android/app/src/main/java/<your-package>/AppFirebaseMessagingService.kt
import com.braze.Braze
import com.braze.push.BrazeFirebaseMessagingService
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AppFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        // Returns true when the message came from Braze and a notification was displayed.
        if (!BrazeFirebaseMessagingService.handleBrazeRemoteMessage(this, remoteMessage)) {
            // Not a Braze message — pass it to your own / Capacitor handling.
        }
    }

    override fun onRegistered(installationId: String) {
        super.onRegistered(installationId)
        Braze.getInstance(this).registeredPushToken = installationId
    }
}
```

```xml
<service android:name=".AppFirebaseMessagingService" android:exported="false">
    <intent-filter android:priority="-1">
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

`BrazeFirebaseMessagingService` also exposes `handleOnNewToken(Context, String)` and
`isBrazePushNotification(RemoteMessage)`; both exist at 43.2.0, but Braze's *documented* recipe for
FCM uses `onRegistered` + `registeredPushToken`, so prefer the shape above.

#### Path B′ — Braze's fallback service

Instead of forwarding by hand, Braze's service can stay registered and delegate non-Braze messages
to yours. **Both** keys are required, in `android/app/src/main/res/values/braze.xml`:

```xml
<bool name="com_braze_fallback_firebase_cloud_messaging_service_enabled">true</bool>
<string name="com_braze_fallback_firebase_cloud_messaging_service_classpath">com.company.OurFirebaseMessagingService</string>
```

(Runtime equivalents exist on `BrazeConfig.Builder`. The plugin does not expose either as an
`initialize` option today — that is a tracked contract change.)

#### `braze.xml` — notification presentation

Notification appearance is configured through Android resources, not through this plugin's API. A
small icon is effectively required: without one Braze falls back to your app icon, which usually
looks wrong in the status bar.

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <drawable name="com_braze_push_small_notification_icon">@drawable/ic_notification</drawable>
    <drawable name="com_braze_push_large_notification_icon">@drawable/ic_notification_large</drawable>
    <integer name="com_braze_default_notification_accent_color">0xFFf33e3e</integer>
    <string name="com_braze_default_notification_channel_name">Notifications</string>
    <string name="com_braze_default_notification_channel_description">Offers and order updates</string>
</resources>
```

Note the element types — `<drawable>` with an `@drawable/…` reference for icons (the bare
`drawable/…` form is wrong), and `<integer>` (or `<color>` with a `@color/…` reference) for the
accent colour.

#### Braze 43.0.0's automatic FCM registration

43.0.0 added registration via the **Firebase Installation ID** when `firebase-messaging` ≥ 25.1.0 is
present. That path runs alongside the explicit `Braze.registerPushToken({ token })` handoff — pick
one, not both. Braze's 43.0.0 changelog documents the opt-out as:

- `com_appboy_firebase_cloud_messaging_registration_enabled` set to `false` in `appboy.xml` — note
  the **legacy** `com_appboy_*` / `appboy.xml` spelling; Braze has not published a `com_braze_*`
  equivalent for this particular flag, and the `com_braze_firebase_cloud_messaging_registration_enabled`
  key is documented only with value `true`, for *enabling* automatic registration;
- plus `<meta-data android:name="firebase_messaging_installation_id_enabled" android:value="false"
  tools:replace="android:value" />` in the manifest. The `tools:replace` is needed because Braze's
  own manifest sets it; the flag itself is Firebase's, not Braze's.

**Verify these against [Braze's current Android push docs](https://www.braze.com/docs/developer_guide/push_notifications?sdktab=android)
before relying on them.** The plugin reads none of these resources, so nothing in this repo's tests
exercises them.

---

## Web — required config

The consumer's `package.json` MUST include `@braze/web-sdk` as a dependency. The plugin declares it as a peer dep (per [C08](./C08-NATIVE-SDK-PINNING.md)) but does not install it transitively.

```bash
npm install capacitor-braze @braze/web-sdk
```

Beyond the peer dep, no additional consumer config is required. The Web SDK does its own runtime setup when `Braze.initialize` is called.

### Web push setup (only if consumers want browser push)

The Web SDK uses VAPID via the Push API + a Service Worker. Setup:

1. Host a Service Worker file at a known path (the SDK's default is `/service-worker.js`).
2. Call `braze.requestPushPermission()` **directly on the Web SDK** after `Braze.initialize`. The
   plugin does not expose a `requestPushPermission` method on any platform; it is a roadmap item in
   [`SDK_SURFACE.md`](../../SDK_SURFACE.md) and [C07](./C07-INIT-INDEPENDENT-METHODS.md) uses it as
   a worked counter-example.

Note that Web push has no token concept; [`Braze.registerPushToken`](../../src/definitions.ts) **throws** on web (per [C03](./C03-CROSS-PLATFORM-TRANSLATION.md)).

---

## Deep-link handling — what opting in costs you

`initialize({ deepLinkHandling: 'app' })` is the only option in the plugin that takes something
away from the host app, so the trade is stated here rather than discovered:

- **You must register a `deepLinkReceived` listener.** In `'app'` mode the plugin tells the SDK not
  to open the URL *before* emitting the event. A consumer who opts in and writes no listener gets
  an app where every Braze campaign CTA does nothing. That is why the default is `'sdk'`.
- **iOS: the plugin takes `braze.delegate`.** In the default mode that slot is deliberately left
  free so a host app can claim it for `braze(_:willPresentModalWithContext:)` or
  `braze(_:noMatchingTriggerForEvent:)`. Opting into `'app'` mode means giving that up; there is no
  way to have both, because `Braze` holds one delegate. `sdkAuthError` is unaffected — it lives on
  the separate `sdkAuthDelegate`.
- **iOS: push opens are only covered when `enablePushAutomation: true`.** With automation off (the
  default) your own `UNUserNotificationCenter` delegate owns the notification tap and BrazeKit is
  not in the path, so neither is the plugin.
- **Android: the plugin replaces the process-global `BrazeDeeplinkHandler`.** It captures whatever
  was installed and restores it on `wipeData`, Activity destruction and a re-`initialize` that
  drops the option — but if your app installs its own custom `IBrazeDeeplinkHandler`, install it
  **before** `Braze.initialize` runs so the plugin wraps yours rather than the SDK default.
- **Keep `server.allowNavigation` set either way.** It is Capacitor's control, it applies to the
  channels the plugin cannot intercept (notably HTML in-app message iframes on web), and
  `deepLinkHandling: 'app'` does not replace it.

Per-channel coverage is [`SECURITY.md` §7](../../SECURITY.md#7-deep-link-security); the listener
lifecycle is [C05](./C05-LISTENERS.md).

---

## Privacy declarations you must make

The plugin ships `ios/Sources/BrazePlugin/PrivacyInfo.xcprivacy` on **both** install paths — via
the podspec's `resource_bundles` under CocoaPods, and via `resources: [.copy(...)]` on the SPM
target — so neither path silently drops it. It declares that **the bridge binary** tracks nothing
(`NSPrivacyTracking: false`) and calls no required-reason APIs — verified: no `UserDefaults`,
file-timestamp, boot-time, disk-space or keyboard API calls anywhere in `ios/Sources/BrazePlugin/`. BrazeKit ships its own manifest declaring
UserDefaults (CA92.1), FileTimestamp (C617.1) and the UserID / DeviceID / ProductInteraction data
types, which Xcode aggregates.

**That covers the plugin only. The app's own declarations are the consumer's, and this is a common
cause of store rejections**, which is exactly the class of consumer obligation C10 exists to
enumerate:

- **App Store privacy nutrition label** — identifiers (user ID, device ID) and usage data (product
  interaction) under *Data Linked to You*. Add contact info / sensitive info if the app calls
  `setEmail`, `setPhoneNumber` or `setDateOfBirth`.
- **Google Play Data Safety** — the same categories, plus the FCM token if push is wired.
- **iOS ATT / `NSUserTrackingUsageDescription`** — required if *the app* combines Braze data with
  third-party data for advertising. The plugin's manifest says the *plugin* does not track; that is
  not the same claim as the *app* not tracking.

Check the category list against [Braze's own data-collection disclosure](https://www.braze.com/docs/developer_guide/reference/)
before submitting — Braze's SDK is what collects, and their disclosure is the authority. The
README's Security section carries a short version of this list and links here.

## Rules for extending

When you bump a native SDK pin (per [C08](./C08-NATIVE-SDK-PINNING.md) bump protocol):

1. Read the upstream changelog for any new setup requirements (new manifest entries, new permission declarations, deployment-target bumps, linkage changes).
2. If new requirements were introduced, update this MDC in the same PR as the version bump.
3. Update README.md's setup sections if the new requirement changes the consumer-facing onboarding.
4. Run `npx cap sync` on **both** apps against the new pin and verify the bundled config still works — `demo/` is the CocoaPods + Android worked example, `example/` is the SPM one. Keep both in sync with C10; a pin that only ever gets a Pods build is half-verified.

When you add a new plugin method that has its own consumer-side requirement (e.g. a new permission, a new entitlement):

1. Add a subsection here under the appropriate platform.
2. Cross-reference from the method's JSDoc in `src/definitions.ts`.
3. Add a note in README.md's setup section if it's broadly applicable.

## Forbidden

- **Programmatically modifying the consumer's Podfile / build.gradle / Info.plist via a `postinstall` script.** Consumer config is the consumer's repo. We document; we don't mutate. (This is also Capacitor's official position for plugins.)
- **Documenting an integration requirement in the README without updating this MDC.** README drift is the failure mode this MDC exists to prevent.
- **Skipping C10 updates when bumping native SDK versions.** A pin bump that introduces a new requirement and doesn't update C10 is incomplete. Future contributors will rediscover the requirement the hard way.
- **Inferring requirements from "what worked in the demo" without verifying they're actually documented by the upstream SDK.** The demo can drift; upstream SDK docs are the authority on what's required.
