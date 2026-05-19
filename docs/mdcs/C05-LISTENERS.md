# C05 — Event listener lifecycle

**One native subscription per event, created eagerly in `initialize`, torn down in `wipeData`. All JS listeners share the single native subscription via Capacitor's `notifyListeners`. Initial state is not replayed on `addListener` — the consumer reads current state explicitly after attaching.**

This MDC is the load-bearing decision behind every `addListener('eventName', ...)` surface the plugin exposes. Today: `featureFlagsUpdated`. Tomorrow: in-app message events, content card updates, push events, SDK auth errors.

---

## Rule

For every event-emitting Braze SDK surface (`subscribeToFeatureFlagsUpdates`, `subscribeToInAppMessage`, `subscribeToContentCardsUpdates`, push handler hooks, SDK auth error handlers):

1. **Subscribe once at `initialize` time**, after the native Braze instance is configured. Not lazily on first `addListener`.
2. **Retain a handle** to the native subscription on the plugin instance so it can be torn down deterministically.
3. **All JS listeners share the one native subscription.** The native callback's only job is to translate the event payload into the wire-format DTO ([C02](./C02-DTO-SHAPES.md)) and call `notifyListeners(eventName, payload)`. Capacitor fans out to every registered JS handler.
4. **Tear down the native subscription in `wipeData`** and any other lifecycle path that invalidates the configured Braze instance. The next `initialize` creates a fresh subscription.
5. **Initial state is NOT replayed** when a JS listener attaches. Document this in the JSDoc on `addListener`. Consumers who want the current snapshot call the matching read method (`getAllFeatureFlags`, `getInAppMessages`, etc.) once after `addListener`.

`addListener` and `removeAllListeners` themselves are provided by Capacitor's base classes (`WebPlugin`, `CAPPlugin`, `Plugin`). Don't reimplement them. Declare the typed overload in `src/definitions.ts` and let the base classes do the rest.

## Rationale

### Why eager-on-initialize, not lazy-on-first-addListener

A lazy native subscription means the first JS `addListener` triggers a native subscribe, which races against the SDK's startup and against the first event arriving. Eager subscription removes the race: by the time any JS code runs, the native side is already listening.

Capacitor's `addListener` is itself synchronous from the consumer's POV (returns `Promise<PluginListenerHandle>`); a lazy native-side wire-up would have to be carefully serialized to avoid duplicate subscriptions on parallel `addListener` calls.

### Why one native subscription shared across all JS listeners

Two natives per Capacitor plugin per event would each call `notifyListeners`, doubling the JS fan-out. Capacitor already de-duplicates JS listeners by handle, so the one-native-many-JS pattern is the simplest correct shape.

### Why tear down on wipeData

`wipeData` invalidates the configured Braze SDK instance on iOS and Android. A subscription against an invalid instance is either a memory leak (Cancellable retains a dead closure) or a latent crash (Android `IEventSubscriber` against a wiped Braze singleton). Drop it explicitly so re-init creates a fresh subscription.

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

[`src/web.ts:78`](../../src/web.ts) declares the guard:

```ts
private featureFlagsSubscribed = false;
```

[`src/web.ts:107`](../../src/web.ts) subscribes once and notifies:

```ts
if (!this.featureFlagsSubscribed) {
  braze.subscribeToFeatureFlagsUpdates((flags) => {
    const serialized = flags.map((flag) => this.serializeFeatureFlag(flag));
    this.notifyListeners('featureFlagsUpdated', { flags: serialized });
  });
  this.featureFlagsSubscribed = true;
}
```

The Web SDK doesn't return an unsubscribe handle, so the bridge uses a boolean guard instead of retaining a cancellable. Re-init doesn't re-subscribe.

### iOS bridge — retain the Braze.Cancellable

[`ios/Plugin/BrazePlugin.swift:62`](../../ios/Plugin/BrazePlugin.swift):

```swift
private var featureFlagsSubscription: Braze.Cancellable?
```

[`ios/Plugin/BrazePlugin.swift:106`](../../ios/Plugin/BrazePlugin.swift) — subscribe at the end of `initialize`:

```swift
featureFlagsSubscription = braze.featureFlags.subscribeToUpdates { [weak self] flags in
    guard let self = self else { return }
    let payload: [[String: Any]] = flags.map { Self.serializeFeatureFlag($0) }
    self.notifyListeners("featureFlagsUpdated", data: ["flags": payload])
}
```

The `[weak self]` capture is required — without it, the closure retains the plugin instance, the plugin retains the cancellable, the cancellable retains the closure, and we have a cycle.

Teardown in `wipeData` ([`ios/Plugin/BrazePlugin.swift:491`](../../ios/Plugin/BrazePlugin.swift)):

```swift
featureFlagsSubscription = nil
```

Releasing the `Cancellable` reference is what cancels the subscription. BrazeKit's `Cancellable` is RAII-style.

### Android bridge — retain the IEventSubscriber, remove by identity

[`android/.../BrazePlugin.kt:80`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt):

```kotlin
private var featureFlagsSubscriber: IEventSubscriber<FeatureFlagsUpdatedEvent>? = null
```

Subscribe at the end of `initialize` ([`android/.../BrazePlugin.kt:142`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)):

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

Teardown ([`android/.../BrazePlugin.kt:670`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)):

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

The Android SDK identifies subscriptions by listener identity — the same `IEventSubscriber` instance must be passed to `removeSingleSubscription`. That's why we retain the instance, not a handle.

---

## Rules for adding a new event

When you add a new `addListener('newEventName', ...)` surface:

1. Add the event payload type to `src/definitions.ts` (e.g. `BrazeContentCardsUpdatedEvent`).
2. Overload `addListener` with the new event name + listener signature. Capacitor's typed overload pattern supports multiple events on one method:

   ```ts
   addListener(eventName: 'featureFlagsUpdated', cb: (e: BrazeFeatureFlagsUpdatedEvent) => void): Promise<PluginListenerHandle>;
   addListener(eventName: 'contentCardsUpdated', cb: (e: BrazeContentCardsUpdatedEvent) => void): Promise<PluginListenerHandle>;
   ```

3. Each native bridge: add a retained handle field next to `featureFlagsSubscription` / `featureFlagsSubscriber`. Subscribe at the end of `initialize`. Add a `teardownXxxSubscription` helper. Call all teardown helpers in `wipeData`.
4. Update C05's "Worked example" section with a one-paragraph note pointing at the new bridge code.

## Forbidden

- **Reimplementing `addListener` or `removeAllListeners`.** Capacitor's base classes implement them; we just declare the typed overload.
- **Lazy native subscription** — racy and stateful for no gain.
- **More than one native subscription per event** on the same plugin instance. If you find yourself creating two, the second is wrong.
- **Replaying initial state** by caching the last payload in the plugin instance. Document the "call `getAllFeatureFlags` once after `addListener`" pattern instead.
- **Forgetting `[weak self]` on iOS closures.** Will retain-cycle the plugin and leak.
- **Forgetting `teardownXxx` calls in `wipeData`** or in re-init paths. Stacked subscribers will fan out `notifyListeners` N times per event.
- **Using `removeAllListeners` to mean "tear down the native side."** It clears the JS-side handler list. Native cleanup is `wipeData`-driven.
