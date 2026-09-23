# C07 — Init-independent methods

**A small, named set of plugin methods must work before `initialize()` has been called. The set is bounded by regulatory necessity, not convenience. Adding a method to it is a deliberate design decision, documented per-method and per-MDC.**

Most plugin methods reject with "Braze.initialize() must be called before any other Braze method." Four don't. This MDC says which four, why, what each one actually does before `initialize` on each platform, and what would justify adding a fifth.

---

## Rule

Init-independent methods skip the [C01](./C01-METHOD-ANATOMY.md#init-guards) init guard (`requireInitialized` / `requireUser`) and invoke class-level SDK statics that operate on global state. The current set:

1. `wipeData()`
2. `disableSDK()`
3. `enableSDK()`
4. `isDisabled()`

A fifth method joins this set only when consumer code may legitimately need to call it before `initialize`, AND the underlying Braze SDK exposes a class-level static that operates without a configured instance, AND the regulatory pathway justifies the exception. See "Rules for adding" below.

### Per-platform behaviour — verified at BrazeKit 18.2.1 / Braze Android 43.2.0 / web-sdk 6.13

An earlier version of this MDC documented an **iOS asymmetry**: `enableSDK` required `initialize`
and `isDisabled` reported `false` after a pre-init `disableSDK()`, because BrazeKit 14.x had no
class-level form of either. **That asymmetry is gone as of 0.2.0, and it is gone by construction.**

The iOS bridge no longer depends on BrazeKit having a class-level enable/disable at all. It keeps
the consent decision in its own `disabledPreInit` state and applies it to the `Braze` instance the
moment `initialize` creates one. Because the correctness now lives in the plugin rather than in the
SDK, it cannot silently regress on a future pin bump — which is exactly what the previous
arrangement did.

| Method | Web | iOS | Android |
|---|---|---|---|
| `wipeData` | init-independent, but **a pre-`initialize` call wipes nothing** — the SDK's storage manager does not exist yet, so it resolves without effect | dual-path: instance `braze.wipeData()` post-init (BrazeKit also flips its persisted `enabled` flag off; the bridge restores the pre-wipe value so a wipe never disables the SDK across launches); class-level `Braze.wipeDataAndDisableForAppRun()` pre-init, which **disables the SDK for the rest of the app run** | init-independent (`Braze.wipeData(context)`) |
| `disableSDK` | init-independent; also clears the plugin's `initialized` flag, because the Web SDK destroys its instance | init-independent: records `disabledPreInit`, and mirrors `braze.enabled = false` when an instance exists | init-independent (`Braze.disableSdk(context)`) |
| `enableSDK` | init-independent; also clears `initialized` for the same reason | **init-independent** — clears `disabledPreInit`, and mirrors onto the instance when one exists | init-independent (`Braze.enableSdk(context)`) |
| `isDisabled` | init-independent | **init-independent** — returns the plugin's tracked state pre-init, `!braze.enabled` post-init | init-independent (`Braze.isDisabled`) |

Two genuine platform differences remain, and both are documented in the method JSDoc, the README and
`SECURITY.md` §10 rather than smoothed over:

1. **iOS pre-`initialize` `wipeData()` disables the SDK for the app run.** A subsequent `initialize`
   no-ops until the app relaunches. `Braze.wipeDataAndDisableForAppRun()` is still the only
   class-level wipe BrazeKit 18.2.1 offers, and every alternative (`sharedInstance()`,
   `unsafeInstance()`, `start(withApiKey:)`) is deprecated too, so there is nothing better to switch
   to. It is the source of the one deliberate deprecation warning in the iOS build.
2. **Web pre-`initialize` `wipeData()` cannot wipe.** There is no SDK storage manager before
   `initialize`, so the call resolves without effect rather than implicitly initializing the SDK
   just to erase it. A consumer whose erasure flow can run pre-init should call `disableSDK()` —
   which *does* work pre-init and persists an opt-out marker across page loads — and call
   `wipeData()` once the SDK is up.

   The opt-out marker has a consequence worth knowing: a browser where `disableSDK()` ran and
   `enableSDK()` did not will refuse to initialize on the next page load, and `initialize` correctly
   rejects. That is the SDK working as designed, not a plugin bug.

`getDeviceId` is **NOT** init-independent — see "Why `getDeviceId` is init-dependent" below. The TS contract once claimed it was; that claim was removed in 0.1.0, but the *web* bridge did not actually acquire its guard until 0.2.0, so for four months the contract and the code disagreed in the other direction. Both now agree.

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

The `initialize` JSDoc in [`src/definitions.ts`](../../src/definitions.ts) declares the set:

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
  // Tear down BEFORE wiping: the SDK's clearData() publishes an empty
  // ContentCards payload synchronously, which a live subscription would
  // forward to consumers as a spurious "you have no cards" event.
  this.teardownSubscriptions(braze);
  braze.wipeData();
  this.initialized = false;
}

async disableSDK(): Promise<void> {
  const braze = await this.loadSdk();
  this.teardownSubscriptions(braze);
  braze.disableSDK();
  this.initialized = false;   // disableSDK() ends in the SDK's own destroy()
}
```

Two rules the web bridge learned the hard way and that any new init-independent method must follow:

- **Tear down subscriptions before the destructive call**, in that order ([C05](./C05-LISTENERS.md)).
- **Reset `initialized` whenever the SDK destroys its instance.** `disableSDK` and `enableSDK` both
  end in the Web SDK's `destroy()`. Leaving the flag set meant a later guarded call sailed past
  `requireInitialized` and failed deep inside the SDK with an unrelated "getUser() returned null".

The `loadSdk()` helper handles the `@braze/web-sdk` peer-dep dynamic import. A consumer calling
these without the SDK installed gets the underlying import error, with a peer-dep hint — not a bare
TypeError.

### iOS bridge

[`ios/Sources/BrazePlugin/BrazePlugin.swift`](../../ios/Sources/BrazePlugin/BrazePlugin.swift) — calls static methods on the `Braze` type, not instance methods on `BrazePlugin.braze`:

```swift
@objc func wipeData(_ call: CAPPluginCall) {
    Self.onMain {
        if let braze = BrazePlugin.braze {
            braze.wipeData()                       // post-init: instance method
        } else {
            Braze.wipeDataAndDisableForAppRun()    // pre-init: the only class-level wipe
        }
        BrazePlugin.teardownSubscriptions()
        BrazePlugin.braze = nil
        call.resolve()
    }
}

@objc func disableSDK(_ call: CAPPluginCall) {
    Self.onMain {
        BrazePlugin.disabledPreInit = true         // remembered even with no instance
        BrazePlugin.braze?.enabled = false         // mirrored when one exists
        call.resolve()
    }
}
```

Three things to copy from this shape. **The whole body runs on the main actor** (`Self.onMain`),
which is what serialises `wipeData` against a concurrent `initialize` — an earlier version could
attach a presenter to an instance a racing `wipeData` had already disowned. **The deprecated
`Braze.disableSDK()` static is not used**; the plugin owns the state instead. And after `wipeData`,
the bridge drops every subscription and the instance reference so the next `initialize` rebuilds
both ([C05](./C05-LISTENERS.md)).

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

`requestPushPermission` **does not exist in this plugin** and is a roadmap item in
[`SDK_SURFACE.md`](../../SDK_SURFACE.md); it is used here purely as a worked counter-example. If it
is ever built, it would be tempting to make it init-independent, because a consumer may want to ask
for push permission during onboarding, before they are ready to initialize Braze.

**Don't.** Reasoning:

- Cross-platform agreement fails: on Android, the permission grant flow ties into `BrazeFirebaseMessagingService` registration, which requires the configured singleton. On iOS, the APNs token handoff requires the configured `braze` instance to forward the token.
- State coupling fails: a granted permission with no token handoff target is a wasted prompt — Braze never receives the registration.
- Regulatory pathway is weak: permission prompts are governed by platform store policies, not GDPR / CCPA. Convenience, not necessity.

Conclusion: `requestPushPermission` keeps the init guard. The README documents the recommended flow: `initialize` → `requestPushPermission` → `changeUser`.

## Forbidden

- **Skipping the init guard "for convenience."** Convenience is not in the regulatory column.
- **Adding a method to the set without updating this MDC and the `initialize` JSDoc.** A consumer reading either source should find the complete list.
- **Per-platform init-independence.** If you have to write "init-independent on Web only" you have a [C03](./C03-CROSS-PLATFORM-TRANSLATION.md) violation, not an init-independent method. Where the *effect* genuinely differs — iOS's app-run disable, web's no-op wipe — the method is still init-independent everywhere, and the difference is documented in the JSDoc, not hidden.
- **Leaning on an SDK class-level static to make a method init-independent when the plugin could own the state itself.** The iOS `enableSDK` / `isDisabled` asymmetry existed for exactly that reason and was removed by tracking a flag in the plugin. A behaviour that depends on an SDK's pre-init semantics silently regresses on the next pin bump.
- **Subscribing to events from an init-independent method.** Subscriptions tie to the configured instance and are governed by [C05](./C05-LISTENERS.md). The quartet calls SDK statics that don't subscribe.
