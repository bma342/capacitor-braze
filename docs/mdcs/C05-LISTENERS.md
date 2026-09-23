# C05 — Event listener lifecycle

**One native subscription per event, created eagerly in `initialize`, torn down deterministically on every path that invalidates the SDK instance. All JS listeners share the single native subscription via Capacitor's `notifyListeners`. Initial state is not replayed on `addListener` — the consumer reads current state explicitly after attaching.**

This MDC is the load-bearing decision behind every `addListener('eventName', ...)` surface. Five
events ship today:

| Event | Payload | Native source | Notes |
|---|---|---|---|
| `featureFlagsUpdated` | `{ flags }` | `subscribeToFeatureFlagsUpdates` / `featureFlags.subscribeToUpdates` | The worked example below |
| `contentCardsUpdated` | `{ cards, lastUpdated }` | `subscribeToContentCardsUpdates` / `contentCards.subscribeToUpdates` | Full card set on every update, not a delta |
| `inAppMessageReceived` | `{ message }` | IAM presenter / manager listener | Observational; cannot block display |
| `sdkAuthError` | `{ userId, errorCode, errorReason, signature, errorEventId }` | `sdkAuthDelegate` / `BrazeSdkAuthenticationErrorEvent` | Not `BrazeDelegate` — see the note below |
| `deepLinkReceived` | `{ url, source, useWebView }` | `BrazeDelegate.shouldOpenURL` / `IBrazeDeeplinkHandler.gotoUri` / per-message `clickAction` rewrite | **Conditional**: only wired when `initialize` ran with `deepLinkHandling: 'app'` — see below |

---

## Rule

For every event-emitting Braze SDK surface (`subscribeToFeatureFlagsUpdates`, `subscribeToInAppMessage`, `subscribeToContentCardsUpdates`, push handler hooks, SDK auth error handlers):

1. **Subscribe once at `initialize` time**, after the native Braze instance is configured. Not lazily on first `addListener`.
2. **Retain a handle** to the native subscription on the plugin instance so it can be torn down deterministically.
3. **All JS listeners share the one native subscription.** The native callback's only job is to translate the event payload into the wire-format DTO ([C02](./C02-DTO-SHAPES.md)) and call `notifyListeners(eventName, payload)`. Capacitor fans out to every registered JS handler.
4. **Tear down the native subscription on every path that invalidates the configured Braze instance.** That is more than `wipeData`: it is `wipeData`, `disableSDK`, `enableSDK`, the re-init path inside `initialize`, and — on Android — `handleOnDestroy`. The next `initialize` creates a fresh subscription. Eager subscribe is only half the lifecycle; the teardown half is where the bugs were.
5. **Initial state is NOT replayed** when a JS listener attaches. Document this in the JSDoc on `addListener`. Consumers who want the current snapshot call the matching read method (`getAllFeatureFlags`, `getInAppMessages`, etc.) once after `addListener`.

`addListener` and `removeAllListeners` themselves are provided by Capacitor's base classes (`WebPlugin`, `CAPPlugin`, `Plugin`). Don't reimplement them. Declare the typed overload in `src/definitions.ts` and let the base classes do the rest.

## Rationale

### Why eager-on-initialize, not lazy-on-first-addListener

A lazy native subscription means the first JS `addListener` triggers a native subscribe, which races against the SDK's startup and against the first event arriving. Eager subscription removes the race: by the time any JS code runs, the native side is already listening.

Capacitor's `addListener` is itself synchronous from the consumer's POV (returns `Promise<PluginListenerHandle>`); a lazy native-side wire-up would have to be carefully serialized to avoid duplicate subscriptions on parallel `addListener` calls.

### Why one native subscription shared across all JS listeners

Two natives per Capacitor plugin per event would each call `notifyListeners`, doubling the JS fan-out. Capacitor already de-duplicates JS listeners by handle, so the one-native-many-JS pattern is the simplest correct shape.

### Why teardown is a first-class half of this contract

`wipeData` invalidates the configured Braze SDK instance on iOS and Android, and on web both
`disableSDK` and `enableSDK` end in the SDK's own `destroy()`. A subscription against an invalid
instance is a memory leak at best (a retained dead closure) and a stale-fan-out bug at worst. Three
concrete failures this project shipped before 0.2.0, all of them teardown failures rather than
subscribe failures:

- **Web used booleans instead of handles.** `wipeData()` then `initialize()` stacked a second
  subscription, so every subsequent event fired `notifyListeners` twice; and `disableSDK()` →
  `enableSDK()` → `initialize()` left every listener permanently dead, because the boolean still
  said "subscribed" while the SDK instance behind it had been destroyed.
- **Android never tore down at all on Activity destruction**, leaking the Activity and the WebView
  on every rotation.
- **iOS could attach a presenter to an instance a concurrent `wipeData` had already disowned**,
  which the main-actor refactor fixed by serialising the two.

### Android: teardown ordering during Activity recreation

`handleOnDestroy` must remove this instance's subscriptions, but **Android resumes the replacement
Activity before destroying the outgoing one.** An unconditional
`setCustomInAppMessageManagerListener(null)` in `handleOnDestroy` therefore wipes the *new*
instance's wiring and silently kills `inAppMessageReceived` after the first rotation. The teardown
is identity-checked against the manager's current listener for exactly this reason, and there is a
regression test that fails when the guard is removed.

Event subscriptions do not have this problem — they are removed by subscriber identity, so removing
the old instance's subscriber cannot affect the new one's.

### Why initial state isn't replayed

Capacitor adds listeners on the JS side without triggering the native callback. Replaying would require either:

- caching the latest payload in the plugin instance and re-firing it on `addListener` (state coupling between two unrelated methods),
- or asking the SDK to re-fire (BrazeKit's `subscribeToUpdates` does fire-on-subscribe but only when a fresh native subscription is created, which we explicitly avoid per the eager-on-init rule).

Either path adds plugin-state-machinery that consumers don't need. The documented "call `getAllFeatureFlags` once after `addListener`" pattern is two lines of consumer code and zero state in the plugin.

---

## Worked example — `featureFlagsUpdated`

### TS contract

[`src/definitions.ts`](../../src/definitions.ts):

```ts
addListener(
  eventName: 'featureFlagsUpdated',
  listenerFunc: (event: BrazeFeatureFlagsUpdatedEvent) => void,
): Promise<PluginListenerHandle>;

removeAllListeners(): Promise<void>;
```

Plus the payload type:

```ts
export interface BrazeFeatureFlagsUpdatedEvent {
  flags: BrazeFeatureFlag[];
}
```

### Web bridge — guard-once-per-page-lifetime

**The Web SDK does return an unsubscribe handle** — every `subscribeTo*` returns a subscription
GUID that `braze.removeSubscription(guid)` cancels. An earlier version of this MDC claimed it did
not, which is why the bridge used boolean guards and shipped the two bugs above. Retain the GUID:

```ts
/** Subscription GUID for the feature-flag update subscription, or `null` when not subscribed. */
private featureFlagsSubscription: string | null = null;
```

`initialize` subscribes and stores the GUID, after tearing down any prior subscriptions:

```ts
this.featureFlagsSubscription = braze.subscribeToFeatureFlagsUpdates((flags) => {
  const serialized = flags.map((flag) => this.serializeFeatureFlag(flag));
  this.notifyListeners('featureFlagsUpdated', { flags: serialized });
});
```

`teardownSubscriptions(braze)` passes each stored GUID to `braze.removeSubscription` and nulls the
field. It is called from the re-init path inside `initialize`, and from `wipeData`, `disableSDK` and
`enableSDK`. **Order matters in `wipeData`:** tear down *before* `braze.wipeData()`, because the
SDK's internal `clearData()` publishes an empty ContentCards payload synchronously, which a live
subscription would forward to consumers as a spurious "you have no cards" event.

See `featureFlagsSubscription` and `teardownSubscriptions` in [`src/web.ts`](../../src/web.ts).

### iOS bridge — retain the Braze.Cancellable

`featureFlagsSubscription` in [`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift) — note that all plugin state is `@MainActor`-isolated:

```swift
private var featureFlagsSubscription: Braze.Cancellable?
```

Subscribe at the end of `initialize` (`performInitialize` in the same file):

```swift
featureFlagsSubscription = braze.featureFlags.subscribeToUpdates { [weak self] flags in
    guard let self = self else { return }
    let payload: [[String: Any]] = flags.map { Self.serializeFeatureFlag($0) }
    self.notifyListeners("featureFlagsUpdated", data: ["flags": payload])
}
```

The `[weak self]` capture is required — without it, the closure retains the plugin instance, the plugin retains the cancellable, the cancellable retains the closure, and we have a cycle.

Teardown in `wipeData` (and in the re-init path):

```swift
featureFlagsSubscription = nil
```

Releasing the `Cancellable` reference is what cancels the subscription. BrazeKit's `Cancellable` is RAII-style.

### Android bridge — retain the IEventSubscriber, remove by identity

`featureFlagsSubscriber` in [`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt):

```kotlin
private var featureFlagsSubscriber: IEventSubscriber<FeatureFlagsUpdatedEvent>? = null
```

Subscribe at the end of `initialize`:

```kotlin
teardownFeatureFlagsSubscription()  // defensive: drop any prior subscriber
val subscriber = IEventSubscriber<FeatureFlagsUpdatedEvent> { event ->
    val flags = JSArray()
    for (flag in event.featureFlags) {
        flags.put(serializeFeatureFlag(flag))
    }
    val payload = JSObject()
    payload.put("flags", flags)
    notifyListeners("featureFlagsUpdated", payload)
}
Braze.getInstance(context).subscribeToFeatureFlagsUpdates(subscriber)
featureFlagsSubscriber = subscriber
```

The defensive `teardownFeatureFlagsSubscription()` at the top of the block matters: re-init without it would stack subscribers, so each event would fire `notifyListeners` N times where N = number of `initialize` calls.

Teardown (`teardownFeatureFlagsSubscription`, called from `wipeData` **and** `handleOnDestroy`):

```kotlin
private fun teardownFeatureFlagsSubscription() {
    featureFlagsSubscriber?.let { subscriber ->
        Braze.getInstance(context).removeSingleSubscription(
            subscriber,
            FeatureFlagsUpdatedEvent::class.java,
        )
    }
    featureFlagsSubscriber = null
}
```

The Android SDK identifies subscriptions by listener identity — the same `IEventSubscriber`
instance must be passed to `removeSingleSubscription`. That's why we retain the instance, not a
handle.

`handleOnDestroy` calls all three teardown helpers plus the identity-checked in-app-message listener
teardown, and resets plugin state. Without it the plugin leaked the Activity and the WebView on
every Activity recreation.

**All four `notifyListeners` calls on Android route through `bridge.executeOnMainThread`.** Braze
delivers events on its own dispatcher thread, and a `notifyListeners` posted from there was
swallowed silently rather than reaching the WebView.

---

## Second worked example — `contentCardsUpdated`

Phase K added a second listener event using the same pattern. The deltas
worth noting:

- **Each event has its own retained handle.** iOS has `featureFlagsSubscription` AND
  `contentCardsSubscription`, both `Braze.Cancellable?`. Android has `featureFlagsSubscriber` AND
  `contentCardsSubscriber`, both `IEventSubscriber<...>?`. Web has one GUID string per event,
  four in total.
- **All subscriptions wired in the same `initialize` block.** Both
  feature flags and content cards subscribe before `initialize`
  returns; consumers don't have to call a separate "enable listeners"
  method.
- **All teardown happens in one place** (`wipeData` on iOS, `wipeData`
  + `teardownXxxSubscription` helpers on Android). The pattern scales
  cleanly to N events — adding a third (e.g. `sdkAuthenticationError`)
  is one more retained field plus one more teardown call.
- **The `addListener` overload set is a union** in `src/definitions.ts`:

  ```ts
  addListener(eventName: 'featureFlagsUpdated', cb: (e: BrazeFeatureFlagsUpdatedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'contentCardsUpdated', cb: (e: BrazeContentCardsUpdatedEvent) => void): Promise<PluginListenerHandle>;
  ```

  TypeScript narrows the callback parameter based on the string literal
  `eventName`. Future events extend the overload set; the consumer
  reads strongly-typed payloads regardless of how many events ship.

See [`src/web.ts`](../../src/web.ts) for the Web wiring,
[`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift)
for iOS (`contentCardsSubscription`), and
[`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)
for Android (`contentCardsSubscriber` and `teardownContentCardsSubscription`).

## Third worked example — `deepLinkReceived`, the one conditional listener

`deepLinkReceived` breaks two of this MDC's defaults on purpose, and both exceptions are narrow
enough to state precisely.

**1. It is wired conditionally, not eagerly-always.** Every other event subscribes at `initialize`
unconditionally. This one only wires when `initialize` ran with `deepLinkHandling: 'app'`, because
wiring it *is* the behaviour change: the native hooks it installs are suppression hooks, not
observation hooks. Subscribing "just in case" would stop URLs opening for a consumer who never
asked. The eager-on-init rule still holds within the mode — when `'app'` is set, the wiring happens
during `initialize` and not on first `addListener`.

**2. Its native hook has a return value that matters.** iOS's
`BrazeDelegate.braze(_:shouldOpenURL:)` returns `false`; Android's
`IBrazeDeeplinkHandler.gotoUri` simply does not execute the `UriAction`; web rewrites the message's
and each button's `clickAction` from `URI` to `NONE` before `showInAppMessage`. The listener itself
is still fire-and-forget — the consumer cannot answer back — which is exactly why the decision is
the init-time mode rather than a per-URL veto. Capacitor has no return channel, and pretending
otherwise is the bug `SECURITY.md` §7 used to ship.

**Teardown is per-platform, and Android's is the interesting one.** iOS releases
`deepLinkDelegate` in `teardownSdkArtifacts()` alongside the other delegates; web resets
`deepLinkHandling` to `'sdk'` on `wipeData` / `disableSDK` / `enableSDK`. Android's
`BrazeDeeplinkHandler.setBrazeDeeplinkHandler` is a **process-global static with no un-set**, so
the plugin captures the handler it replaced and restores that, from `handleOnDestroy`, `wipeData`
and a re-`initialize` that drops the option. The restore is identity-checked against the live
handler for the same reason the in-app message listener teardown is: on a configuration change the
replacement Activity has already installed its own, and an unconditional restore would kill
`deepLinkReceived` after the first rotation. A re-`initialize` in `'app'` mode restores before
installing, so wrappers replace rather than stack — a stacked wrapper would fan out N
`deepLinkReceived` events per click, this MDC's Forbidden entry in deep-link clothing.

See `BrazeDeepLinkDelegate` in
[`ios/Plugin/BrazeIAMDelegate.swift`](../../ios/Plugin/BrazeIAMDelegate.swift),
`InterceptingDeeplinkHandler` / `installDeepLinkHandler` / `teardownDeepLinkHandler` in
[`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt), and
`interceptDeepLinks` in [`src/web.ts`](../../src/web.ts). Per-channel coverage — including the two
real gaps — is [`SECURITY.md` §7](../../SECURITY.md#7-deep-link-security).

## Rules for adding a new event

When you add a new `addListener('newEventName', ...)` surface:

1. Add the event payload type to `src/definitions.ts` (e.g. `BrazeContentCardsUpdatedEvent`).
2. Overload `addListener` with the new event name + listener signature. Capacitor's typed overload pattern supports multiple events on one method:

   ```ts
   addListener(eventName: 'featureFlagsUpdated', cb: (e: BrazeFeatureFlagsUpdatedEvent) => void): Promise<PluginListenerHandle>;
   addListener(eventName: 'contentCardsUpdated', cb: (e: BrazeContentCardsUpdatedEvent) => void): Promise<PluginListenerHandle>;
   ```

3. Each bridge: add a retained handle field next to `featureFlagsSubscription` /
   `featureFlagsSubscriber`. Subscribe at the end of `initialize`. Add a teardown path, and wire it
   into **every** invalidation path — `wipeData`, the re-init branch, `disableSDK`/`enableSDK` on
   web, and `handleOnDestroy` on Android.
4. Write the test. A listener event with no test is how `sdkAuthError` shipped dead on iOS for four
   months: it was wired to a protocol that does not declare the callback, the conformance compiled,
   and nothing ever fired.
5. Update C05's "Worked example" section with a one-paragraph note pointing at the new bridge code.

## Forbidden

- **Reimplementing `addListener` or `removeAllListeners`.** Capacitor's base classes implement them; we just declare the typed overload.
- **Lazy native subscription** — racy and stateful for no gain.
- **More than one native subscription per event** on the same plugin instance. If you find yourself creating two, the second is wrong.
- **Replaying initial state** by caching the last payload in the plugin instance. Document the "call `getAllFeatureFlags` once after `addListener`" pattern instead.
- **Forgetting `[weak self]` on iOS closures.** Will retain-cycle the plugin and leak.
- **Forgetting `teardownXxx` calls** in `wipeData`, the re-init path, `disableSDK`/`enableSDK` (web) or `handleOnDestroy` (Android). Stacked subscribers fan out `notifyListeners` N times per event; missing teardown leaks the Activity and WebView on Android.
- **Tearing down Android's in-app message listener unconditionally in `handleOnDestroy`.** Check identity first — the replacement Activity has already resumed and installed its own.
- **Calling `notifyListeners` from a Braze dispatcher thread on Android.** Route through `bridge.executeOnMainThread`.
- **Assuming the Web SDK gives you no unsubscribe handle.** It does; retain the GUID.
- **Using `removeAllListeners` to mean "tear down the native side."** It clears the JS-side handler list. Native cleanup is `wipeData`-driven.
