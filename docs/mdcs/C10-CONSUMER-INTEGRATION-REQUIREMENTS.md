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

## iOS — required `Podfile` config

**Xcode 26 or newer is required.** BrazeKit raised its Xcode floor to 26.0 at 15.0.0 and the plugin
pins 18.2.1. One failure mode is worth naming because it does not look like a version error: an
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

Worked example — the demo's Podfile (verified working as of 0.0.11):

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

The consumer's `android/variables.gradle` and `android/build.gradle` need adjustments beyond
Capacitor 6's stock template. **They are forced by Braze's transitive androidx dependencies, not by
Braze's own AAR metadata** — `com.braze:android-sdk-ui:43.2.0` declares `minCompileSdk=21` and
`minAndroidGradlePluginVersion=1.0.0` in its `aar-metadata.properties`, so the SDK itself imposes
nothing here. Worth stating because Braze 43.1.0's changelog mentions AGP 9.2.1, which describes how
Braze builds the SDK and is not a consumer requirement; 43.1.1 fixed the one metadata constraint
that had leaked.

### `android/variables.gradle` — bump `compileSdkVersion` to 35

Capacitor 6's stock template ships `compileSdkVersion = 34`. Braze pulls in `androidx.recyclerview 1.4.0` and `androidx.swiperefreshlayout 1.2.0`, both of which require `compileSdk >= 35` and fail the build with:

```
Dependency 'androidx.recyclerview:recyclerview:1.4.0' requires libraries and
applications that depend on it to compile against version 35 or later of
the Android APIs.
```

Fix:

```groovy
ext {
    minSdkVersion = 22
    compileSdkVersion = 35   // bumped from Capacitor stock 34
    targetSdkVersion = 34
    // ...
}
```

`targetSdkVersion` can stay at 34 (it controls runtime opt-in, not compile-time API access).

### `android/build.gradle` — bump AGP to 8.6.0

Capacitor 6's stock template ships AGP 8.2.x. The transitive `androidx.swiperefreshlayout 1.2.0` requires AGP 8.6.0+ and fails with:

```
Dependency 'androidx.swiperefreshlayout:swiperefreshlayout:1.2.0' requires
Android Gradle plugin 8.6.0 or higher.
```

Fix:

```groovy
buildscript {
    dependencies {
        classpath 'com.android.tools.build:gradle:8.6.0'                  // bumped from 8.2.x
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0'       // bumped from 1.9.x
        // ...
    }
}
```

**The Kotlin plugin bump is not optional.** Braze 43.x ships Kotlin **2.2.0** metadata; Kotlin 1.9.x
reads up to 2.0.0 and aborts the compile with "incompatible version of Kotlin" errors against every
Braze class. Capacitor 6's stock template ships 1.9.x.

### `android/gradle/wrapper/gradle-wrapper.properties` — bump Gradle to 8.7

AGP 8.6.0 requires Gradle 8.7+. The stock wrapper ships Gradle 8.2.1.

Fix:

```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-all.zip
```

### Min SDK and runtime requirements

- **`minSdkVersion`**: the plugin's own `android/build.gradle` defaults to **22**, matching
  Capacitor 6's stock template and `demo/android/variables.gradle`. A consumer's
  `rootProject.ext.minSdkVersion` always wins. Braze's AAR metadata declares `minCompileSdk=21`.
  (This number said 21 here, 26 in `android/build.gradle` and 22 in the demo until 0.2.0 — three
  numbers for one floor. If you change it, change all three.)
- **`compileSdkVersion` / `targetSdkVersion`**: the plugin defaults to **35** for both; the demo uses
  compileSdk 35 / targetSdk 34. `targetSdk` controls runtime opt-in, `compileSdk` controls API
  availability, so they legitimately differ.
- **JDK**: 21 for the toolchain; the library emits JVM 17 bytecode.

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

## Privacy declarations you must make

The plugin ships `ios/Plugin/PrivacyInfo.xcprivacy` via the podspec's `resource_bundles`. It
declares that **the bridge binary** tracks nothing (`NSPrivacyTracking: false`) and calls no
required-reason APIs — verified: no `UserDefaults`, file-timestamp, boot-time, disk-space or
keyboard API calls anywhere in `ios/Plugin/`. BrazeKit ships its own manifest declaring
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
4. Run `npx cap sync` on the demo against the new pin and verify the bundled config still works. The demo's `Podfile` / `build.gradle` are the canonical worked example — keep them in sync with C10.

When you add a new plugin method that has its own consumer-side requirement (e.g. a new permission, a new entitlement):

1. Add a subsection here under the appropriate platform.
2. Cross-reference from the method's JSDoc in `src/definitions.ts`.
3. Add a note in README.md's setup section if it's broadly applicable.

## Forbidden

- **Programmatically modifying the consumer's Podfile / build.gradle / Info.plist via a `postinstall` script.** Consumer config is the consumer's repo. We document; we don't mutate. (This is also Capacitor's official position for plugins.)
- **Documenting an integration requirement in the README without updating this MDC.** README drift is the failure mode this MDC exists to prevent.
- **Skipping C10 updates when bumping native SDK versions.** A pin bump that introduces a new requirement and doesn't update C10 is incomplete. Future contributors will rediscover the requirement the hard way.
- **Inferring requirements from "what worked in the demo" without verifying they're actually documented by the upstream SDK.** The demo can drift; upstream SDK docs are the authority on what's required.
