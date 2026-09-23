# C03 — Cross-platform translation conventions

**Where the three Braze SDKs disagree on a value's shape, the plugin picks one canonical shape on the public TS contract and translates per-platform on the way in/out. Each translation rule lives here, with a worked example.**

The principle: consumers see one consistent contract. The asymmetric work is borne inside the bridges, not pushed onto every app that uses the plugin.

---

## Rule

When two or three of the underlying SDKs disagree on:

- value indexing (0-based vs 1-based),
- type representation (string union vs enum vs single-letter constant),
- numeric storage precision (Double vs BigDecimal),
- timezone or locale semantics,
- "missing" sentinels (null vs undefined vs empty string),

the plugin's TS interface picks ONE canonical shape and the bridges translate. The canonical shape choice is documented here, with rationale.

## Rationale

Hiding cross-SDK divergence from consumers is the single most valuable thing a Capacitor plugin does. If the consumer has to remember "month is 1-12 on Web and iOS but 0-11 on Android," the plugin failed at its job. Picking one shape per translation case and writing the conversion ONCE in each bridge is cheaper than picking a different shape per method and asking consumers to remember the per-method variation.

---

## Translation table

| Convention | Canonical (TS) | Web | iOS | Android |
|---|---|---|---|---|
| **DOB month** | 1-12 (January = 1) | passthrough | Calendar+DateComponents (UTC) | `Month.values()[month - 1]` |
| **DOB timezone** | unspecified; date is a calendar date | passthrough | Gregorian calendar pinned to UTC | enum has no timezone |
| **Gender** | string union: `'male' \| 'female' \| 'other' \| 'unknown' \| 'not_applicable' \| 'prefer_not_to_say'` | `WEB_GENDER_MAP` → `'m'\|'f'\|'o'\|'u'\|'n'\|'p'` | `Braze.User.Gender` enum cases | `com.braze.enums.Gender` enum cases |
| **Currency on purchase** | required string | passthrough (SDK accepts optional, plugin rejects empty) | passthrough (SDK requires) | passthrough (SDK requires) |
| **Purchase price** | non-negative finite `number` | passthrough as `number` | passthrough as `Double` | `BigDecimal.valueOf(double)` |
| **Anonymous user ID** | `null` | `getUser().getUserId() ?? null` | `braze.user.id` (Swift `String?` → JSON `null`) | empty string `""` → `JSObject.NULL` |
| **Subscription group ID** | string | passthrough | passthrough | passthrough |
| **Feature flag missing** | `null` | passthrough | passthrough (BrazeKit returns `nil`) | passthrough (`getFeatureFlag` returns `FeatureFlag?`) |
| **Push registration token** | required string | **throws** (Web Push has no token) | hex string → `Data` via `dataFromHex` helper | FCM string passthrough to `registeredPushToken` setter |

---

## Worked examples

### DOB month indexing — 1-based on the contract, 0-based on Android enum

**Why 1-based:** the Web SDK accepts 1-12 (`braze.getUser().setDateOfBirth(year, month, day)` with `month: 1-12`, see `setDateOfBirth` in `node_modules/@braze/web-sdk/index.d.ts`). Java's `Calendar.MONTH` is 0-11, which is the most common source of off-by-one bugs in Android code. Surfacing the Java quirk to JS consumers would be the worst of both worlds.

**Android bridge** (`setDateOfBirth` in [`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)):

```kotlin
val monthEnum = Month.values()[month - 1]
user.setDateOfBirth(year, monthEnum, day)
```

The enum is ordered `JANUARY..DECEMBER`; `values()[month - 1]` is the unambiguous 1-indexed lookup.

**iOS bridge** (`setDateOfBirth` in [`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift)): same 1-indexed convention, fed into `DateComponents` which is itself 1-indexed.

### DOB timezone pinning — UTC on iOS

`Date` on Swift is timezone-sensitive; the same `(year, month, day)` triple constructed against the device's local calendar can become a different absolute Date than the same triple constructed against UTC. If a user in Tokyo enters their birthday and the SDK ships the local-time Date to Braze, the dashboard may store a date one day off.

iOS pins the calendar to UTC (`setDateOfBirth` in [`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift)) so the stored DOB matches what the Android and Web bridges send. The fallback to `.current` only triggers if iOS can't construct the `TimeZone` (effectively never).

### Gender — string union on the contract, enum on each SDK

**Why a string union, not an enum on the TS contract:** strings are stable wire-format identifiers, immune to TS enum-numbering changes; they're also self-documenting in JSON logs and dashboards. The string union enumerates the six SDK-supported values verbatim.

**Web** (`WEB_GENDER_MAP` in [`src/web.ts`](../../src/web.ts)): `WEB_GENDER_MAP` maps each public string to the Web SDK's single-letter constant (`'m' | 'f' | 'o' | 'u' | 'n' | 'p'`). Centralized so we change it once if Braze adds a value.

**iOS / Android**: per-case `switch` from public string to `Braze.User.Gender` / `com.braze.enums.Gender`. Both bridges reject unknown strings with the same error message format ([C01](./C01-METHOD-ANATOMY.md)).

### Purchase price — Double on TS, BigDecimal on Android

**Why BigDecimal on Android specifically:** the Android SDK stores `price` as a `BigDecimal` and persists it exactly. `new BigDecimal(14.99)` does NOT yield `"14.99"` — the `BigDecimal(double)` constructor preserves the exact IEEE 754 bits, which for `14.99` are `14.9900000000000002131628...`. That value lands in the Braze dashboard verbatim.

`BigDecimal.valueOf(double)` routes through `Double.toString`, which uses the human-readable shortest-round-trip representation. `BigDecimal.valueOf(14.99)` yields exactly `"14.99"`.

[`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt):

```kotlin
val bigPrice = BigDecimal.valueOf(price)
```

iOS and Web take `Double` / `number` directly because their SDKs handle precision internally. The Android-specific gotcha lives in the Android bridge, where it belongs.

### Currency on purchase — required by the plugin even where the SDK allows optional

Web SDK signature (`logPurchase` in `node_modules/@braze/web-sdk/index.d.ts`):

```ts
export function logPurchase(productId, price, currencyCode?, quantity?, purchaseProperties?): boolean;
```

`currencyCode` is optional. iOS and Android require it. If the plugin allowed optional currency to match Web, consumers could ship a purchase event with no currency to half their userbase (the browser-Capacitor split) and revenue analytics would silently roll up incorrectly. The plugin closes the gap by requiring currency on the TS interface and validating non-empty in each bridge.

This is a case where the canonical shape is stricter than the loosest underlying SDK. That's fine — the plugin's job is to surface a contract that doesn't have footguns.

### Anonymous user ID — `null` on the contract, divergent sentinels in the SDKs

Three SDKs, three "no user yet" signals:

- **Web**: `braze.getUser().getUserId()` returns `string | null | undefined`.
- **iOS**: `braze.user.id` returns `String?` (nil when anonymous).
- **Android**: `currentUser.userId` returns the empty string `""` when anonymous, not null.

The plugin's contract is `string | null`. Each bridge coalesces:

- Web: `?? null` ([`src/web.ts`](../../src/web.ts) `getUserId`).
- iOS: `braze.user.id as Any` — `nil` becomes JSON `null` via Capacitor's bridging.
- Android: empty-string check + `JSObject.NULL` ([`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)).

This is the canonical case for "SDK sentinel translation": the bridge handles three separate
sentinels so consumers see one.

**Empty string is never a contract sentinel.** Two places had leaked one and both were fixed in
0.2.0: `sdkAuthError.userId` emitted `''` for an anonymous user on web, iOS and Android (now `null`),
and Android's in-app message `id` read back as `''` rather than `null` when a campaign has no
trigger id (now normalised). If an SDK hands you `''` to mean "absent", coalesce it at the bridge.

One deliberate exception: `BrazeContentCardBase.id` keeps `''` rather than becoming nullable, because
a nullable id would break `logContentCardClick({ cardId: card.id })` for every consumer, and `''`
trips the existing required-field guard — which is the right outcome for a card that cannot be
logged. The rationale is in its JSDoc.

### `getUserId` after `wipeData` — a divergence that closed

iOS used to return the previous id after `wipeData`; as of BrazeKit 17.0 it returns `null`, matching
Android and web. Nothing in the bridge changed — this row simply stopped being a divergence when the
pin moved to 18.2.1, which is worth recording so nobody re-adds a workaround for it.

### `language` on in-app messages — Android-only absence

`BrazeInAppMessage` carries no `language` field, because Braze's Android in-app message models have
no accessor for it at 43.2.0 while iOS and web do. Rather than emit a field that is always `null` on
one platform, the contract omits it everywhere. This is the C03 rule working as intended: the
contract is the intersection unless there is a reason to widen it.

---

### When a method legitimately doesn't exist on one platform — `registerPushToken`

Phase M shipped the plugin's first method that diverges by *absence* on one of the three platforms. iOS BrazeKit takes an APNs token (`Data`), Android takes an FCM token string, and Web Push uses VAPID + Service Worker subscriptions — there is no token shape on web that a consumer could hand us.

The plugin's policy for this case (per [SDK_SURFACE.md §3](../../SDK_SURFACE.md)):

1. **The TS contract still declares the method** — `registerPushToken(options): Promise<void>` is on the plugin interface for all platforms. Consumers don't conditionally type-check.
2. **The unsupported platform throws** with a clear runtime error pointing at the docs and at the recommended branching pattern (`Capacitor.getPlatform()`).
3. **The JSDoc on the method explicitly enumerates per-platform behavior** so the consumer sees the divergence at the documentation surface, not just at runtime.
4. **The native bridges handle their own translation** (iOS: hex string → `Data`; Android: string passthrough; Web: throw).

Worked example, web bridge ([`src/web.ts`](../../src/web.ts)):

```ts
async registerPushToken(_options: BrazeRegisterPushTokenOptions): Promise<void> {
  throw new Error(
    'Braze.registerPushToken is not supported on web. ' +
      'Web Push uses VAPID + Service Worker subscriptions, not push tokens. ' +
      'Branch on Capacitor.getPlatform() and call this only on iOS / Android. ' +
      'See docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md.',
  );
}
```

The error message does three jobs:

- Tells the consumer *what* failed (`Braze.registerPushToken … not supported on web`).
- Tells them *why* in one sentence (Web Push uses a different mechanism).
- Tells them *what to do instead* (branch on `Capacitor.getPlatform()`).

This is the template every future divergent method follows. Banners (web-only), geofences
(native-only) and Push Stories (iOS-only) would all use the same shape — none of them is shipped;
see [`SDK_SURFACE.md`](../../SDK_SURFACE.md) for what is actually on the roadmap.

**Note what the divergence is *not*.** It throws a plain `Error` with a prose message. There is no
`UnsupportedOperationError`, no `BrazeUnsupportedError`, no error class and no `platform` field —
several docs described one for months and a consumer who wrote `catch (e) { if (e instanceof
BrazeUnsupportedError) … }` would have got a `ReferenceError`. Match on the message prefix, which
the C01 format makes stable. If a typed error hierarchy is ever wanted, it is a contract change with
a `SDK_SURFACE.md` entry, not something to assume exists.

## Rules for extending

When you add a method whose argument or return type behaves differently across the three SDKs:

1. Decide the canonical TS shape. Default: pick whichever shape is simplest for consumers, even if it's stricter than the loosest underlying SDK.
2. Add a row to the translation table at the top of this file.
3. Implement the translation in each bridge. Keep it as a small private helper (`WEB_GENDER_MAP`, `serializeFeatureFlag`, `BigDecimal.valueOf(double)`) so the conversion is one obvious thing.
4. If the translation is non-obvious, leave a one-line code comment with the rationale, and reference this MDC.
5. The error message for invalid input must match [C01's format](./C01-METHOD-ANATOMY.md#error-message-convention), including the allowed-values list for enums.

## Forbidden

- **Exposing SDK-specific shapes through the TS contract.** No `'m'|'f'` short codes, no `Calendar.MONTH` 0-indexed values, no `BigDecimal` strings, no empty-string sentinels.
- **Per-method conventions when a global one exists.** If month is 1-indexed in `setDateOfBirth`, it's 1-indexed everywhere. Don't ship `setDateOfBirth({ month: 1-12 })` and then `setRenewalMonth({ month: 0-11 })` — pick one and stick to it.
- **Silently widening on the canonical shape.** If the canonical contract is "non-negative finite number" and the SDK accepts zero, the plugin must validate non-negative AND finite. Don't relax the contract to match SDK looseness.
- **Per-platform JSDoc lies.** If iOS does something different from Web (e.g. UTC date pinning), document it in the central JSDoc on the TS method, not as a comment on the iOS bridge only.
