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

The consumer's `ios/App/Podfile` MUST set both of the following:

```ruby
platform :ios, '15.0'
use_frameworks! :linkage => :static
```

Both are non-optional. Capacitor's stock `cap add ios` template ships with `platform :ios, '13.0'` and `use_frameworks!` (dynamic) — those defaults will fail `pod install` against this plugin.

### Why `platform :ios, '15.0'`

BrazeKit 14.x sets `s.ios.deployment_target = '15.0'` in its podspec. CocoaPods aborts the install with `"required a higher minimum deployment target"` if the consumer's Podfile sets a lower floor.

This is BrazeKit's choice, not ours. The plugin's own podspec also pins `s.ios.deployment_target = '15.0'`; consumers can set their Podfile *higher* (e.g. iOS 16 or 17 to drop older devices) but not lower.

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
3. Forward the APNs device token from `@capacitor/push-notifications`' `registration` event to `Braze.registerPushToken({ token })` per the [JSDoc](../../src/definitions.ts) on `registerPushToken`.

The plugin does not require these for non-push consumers (a consumer who only uses events + content cards needs neither).

---

## Android — required config

The consumer's `android/variables.gradle` and `android/build.gradle` need three adjustments beyond Capacitor 6's stock template. All three are forced by `com.braze:android-sdk-ui 42.2.0`'s transitive dependencies and were discovered during the Phase O Gradle-build verification.

### `android/variables.gradle` — bump `compileSdkVersion` to 35

Capacitor 6's stock template ships `compileSdkVersion = 34`. Braze SDK 42.x pulls in `androidx.recyclerview 1.4.0` and `androidx.swiperefreshlayout 1.2.0`, both of which require `compileSdk >= 35` and fail the build with:

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

Capacitor 6's stock template ships AGP 8.2.1. The transitive `androidx.swiperefreshlayout 1.2.0` requires AGP 8.6.0+ and fails with:

```
Dependency 'androidx.swiperefreshlayout:swiperefreshlayout:1.2.0' requires
Android Gradle plugin 8.6.0 or higher.
```

Fix:

```groovy
buildscript {
    dependencies {
        classpath 'com.android.tools.build:gradle:8.6.0'  // bumped from 8.2.1
        // ...
    }
}
```

### `android/gradle/wrapper/gradle-wrapper.properties` — bump Gradle to 8.7

AGP 8.6.0 requires Gradle 8.7+. The stock wrapper ships Gradle 8.2.1.

Fix:

```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-all.zip
```

### Min SDK and runtime requirements

- **`minSdkVersion`**: 21 (Braze Android SDK 42.x floor). Capacitor's stock template sets `minSdkVersion 22`, which satisfies this — no consumer action needed.
- **`targetSdkVersion`**: ≥ 34 (per current Google Play submission requirements as of 2026).

### Android push setup (only if consumers use push)

For Braze-orchestrated push via FCM, consumers must additionally:

1. Add a Firebase project, download `google-services.json`, drop it into `android/app/`.
2. Apply the Google Services Gradle plugin in `android/app/build.gradle`.
3. Forward the FCM token from `@capacitor/push-notifications`' `registration` event to `Braze.registerPushToken({ token })`.

The plugin doesn't bundle Firebase config because the consumer's Firebase project is the consumer's account. The demo's `android/app/google-services.json` is intentionally absent — consumers add their own.

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
2. Call `Braze.requestPushPermission()` — **not yet implemented in this plugin** (planned for v0.2). For now, consumers call `braze.requestPushPermission()` directly on the Web SDK after `Braze.initialize`.

Note that Web push has no token concept; [`Braze.registerPushToken`](../../src/definitions.ts) **throws** on web (per [C03](./C03-CROSS-PLATFORM-TRANSLATION.md)).

---

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
