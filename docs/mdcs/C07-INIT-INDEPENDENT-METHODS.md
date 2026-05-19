# C07 — Init-independent methods

**A small, named set of plugin methods must work before `initialize()` has been called. The set is bounded by regulatory necessity, not convenience. Adding a method to it is a deliberate design decision, documented per-method and per-MDC.**

Most plugin methods reject with "Braze.initialize() must be called before any other Braze method." Four don't. This MDC says which four, why, and what would justify adding a fifth.

---

## Rule

Init-independent methods skip the [C01](./C01-METHOD-ANATOMY.md#init-guards) init guard (`requireInitialized` / `requireUser`) and invoke class-level SDK statics that operate on global state. The current set:

1. `wipeData()`
2. `disableSDK()`
3. `enableSDK()`
4. `isDisabled()`

A fifth method joins this set only when consumer code may legitimately need to call it before `initialize`, AND the underlying Braze SDK exposes a class-level static that operates without a configured instance, AND the regulatory pathway justifies the exception. See "Rules for adding" below.

`getDeviceId` is **NOT** init-independent today even though the TS contract suggested it could be — see "Why getDeviceId is init-dependent" below.

## Rationale

The init guard is the plugin's primary safety net against a class of bugs where a consumer calls Braze methods in the wrong order — e.g. logging an event before configuring the SDK, which silently drops the event. Removing the guard from a method is removing a safety net. The reason to do so must be more important than the protection it provides.

For the privacy/lifecycle quartet, the reason is regulatory:

- **GDPR Article 17 (right to erasure)** can fire on any user action, including before the consumer's app has finished bootstrapping Braze. `wipeData()` must work then.
- **CCPA Section 1798.105** and similar state laws have the same shape.
- **GDPR Article 7(3) (consent withdrawal)** requires that revoking consent be at least as easy as giving it. If a user revokes during app launch, before `initialize` completed, `disableSDK()` must work then.
- **`enableSDK()`** is the inverse of `disableSDK()` and inherits the same lifecycle.
- **`isDisabled()`** is a read of global state used by consumer code to gate other calls; making it require initialize would create the chicken-and-egg problem of needing to initialize the SDK to find out if you should initialize the SDK.

For any other method, the regulatory pathway is absent and the guard wins.

---

## Worked example — the quartet

### TS contract

[`src/definitions.ts:371`](../../src/definitions.ts) declares the set in the `initialize` JSDoc:

```ts
/**
 * Initialize the Braze SDK. **Must be called before any other Braze method**
 * except {@link BrazePlugin.echo} and the init-independent privacy/lifecycle
 * methods ({@link BrazePlugin.wipeData}, {@link BrazePlugin.disableSDK},
 * {@link BrazePlugin.enableSDK}, {@link BrazePlugin.isDisabled}).
 */
initialize(options: BrazeInitializeOptions): Promise<void>;
```

Each of the four methods carries its own JSDoc tag `Init-independent: safe to call before {@link BrazePlugin.initialize}.` This is the contract surface.

### Web bridge

[`src/web.ts`](../../src/web.ts) — each method dynamic-imports the SDK on first use, calls the class-level static, and intentionally does NOT call `requireInitialized`:

```ts
async wipeData(): Promise<void> {
  const braze = await this.loadSdk();
  braze.wipeData();
  this.initialized = false;
}

async disableSDK(): Promise<void> {
  const braze = await this.loadSdk();
  braze.disableSDK();
}

async enableSDK(): Promise<void> {
  const braze = await this.loadSdk();
  braze.enableSDK();
}

async isDisabled(): Promise<BrazeIsDisabledResult> {
  const braze = await this.loadSdk();
  return { disabled: braze.isDisabled() };
}
```

The `loadSdk()` helper handles the `@braze/web-sdk` peer-dep dynamic import. A consumer calling these without having imported the SDK at all gets a clear error pointing at the missing peer dep, not a TypeError.

### iOS bridge

[`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift) — calls static methods on the `Braze` type, not instance methods on `BrazePlugin.braze`:

```swift
@objc func wipeData(_ call: CAPPluginCall) {
    Braze.wipeData()
    BrazePlugin.braze = nil
    featureFlagsSubscription = nil
    call.resolve()
}

@objc func disableSDK(_ call: CAPPluginCall) {
    Braze.disableSDK()
    call.resolve()
}
```

`Braze.wipeData()` is a class function in BrazeKit; calling it before `Braze(configuration: ...)` is valid. After `wipeData`, the bridge nils out the instance reference and the feature-flag subscription so the next `initialize` rebuilds both ([C05](./C05-LISTENERS.md)).

### Android bridge

[`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) — calls static methods on the `Braze` class:

```kotlin
@PluginMethod
fun wipeData(call: PluginCall) {
    Braze.wipeData(context)
    teardownFeatureFlagsSubscription()
    initialized = false
    call.resolve()
}

@PluginMethod
fun disableSDK(call: PluginCall) {
    Braze.disableSdk(context)
    call.resolve()
}
```

Same pattern as iOS: class-level statics, plus cleanup of the instance subscription state on `wipeData`.

---

## Why `getDeviceId` is init-dependent

A first-pass implementation might assume `getDeviceId` is init-independent because the Braze SDKs persist device identifiers across sessions and a value exists from the first SDK install onward. But the *accessor* depends on a configured SDK instance on iOS (`braze.deviceId`) and Android (`Braze.getInstance(context).deviceId`). Only on Web is the accessor a true class-level static (`braze.getDeviceId()`).

Rather than ship a method whose init dependency differs per platform — which is the exact cross-platform footgun [C03](./C03-CROSS-PLATFORM-TRANSLATION.md) exists to prevent — `getDeviceId` is gated by the init guard on all three platforms. The contract is uniform, even though Web could technically run it earlier.

This is the principle: **if any one of the three SDKs requires a configured instance, the plugin method requires `initialize`**. Init-independence is a property of the *least restrictive* platform binding only when all three platforms agree.

---

## Rules for adding a method to the init-independent set

A new method joins the set only when ALL of the following are true:

1. **Regulatory pathway:** the method serves a GDPR, CCPA, or similar privacy / consent flow that may run before `initialize` completes. "Convenient" is not a regulatory pathway. "Saves a line of consumer code" is not a regulatory pathway.
2. **Cross-platform agreement:** all three SDKs expose a class-level static that operates on global state for this method. If any one requires a configured instance, the method is init-dependent ([C03](./C03-CROSS-PLATFORM-TRANSLATION.md) discipline).
3. **No state coupling:** the method does not depend on a previously-set value that only the configured instance could have provided. (e.g. you cannot "log a custom event before initialize" because the event has nowhere to go until the SDK has an endpoint.)
4. **Documented per-method:** the JSDoc on the method explicitly contains the phrase `Init-independent: safe to call before {@link BrazePlugin.initialize}.` Consumers learn this from the contract, not the bridge code.
5. **Documented in this MDC:** the method is added to the canonical list at the top of this file, with a one-paragraph regulatory rationale.

If a candidate method fails any of these, leave the init guard in.

## Worked counter-example — `requestPushPermission`

A future v0.x will add `requestPushPermission`. Tempting to make init-independent because the consumer may want to ask for push permission during onboarding, before they're ready to initialize Braze.

**Don't.** Reasoning:

- Cross-platform agreement fails: on Android, the permission grant flow ties into `BrazeFirebaseMessagingService` registration, which requires the configured singleton. On iOS, the APNs token handoff requires the configured `braze` instance to forward the token.
- State coupling fails: a granted permission with no token handoff target is a wasted prompt — Braze never receives the registration.
- Regulatory pathway is weak: permission prompts are governed by platform store policies, not GDPR / CCPA. Convenience, not necessity.

Conclusion: `requestPushPermission` keeps the init guard. The README documents the recommended flow: `initialize` → `requestPushPermission` → `changeUser`.

## Forbidden

- **Skipping the init guard "for convenience."** Convenience is not in the regulatory column.
- **Adding a method to the set without updating this MDC and the `initialize` JSDoc.** A consumer reading either source should find the complete list.
- **Per-platform init-independence.** If you have to write "init-independent on Web only" you have a [C03](./C03-CROSS-PLATFORM-TRANSLATION.md) violation, not an init-independent method.
- **Subscribing to events from an init-independent method.** Subscriptions tie to the configured instance and are governed by [C05](./C05-LISTENERS.md). The quartet calls SDK statics that don't subscribe.
