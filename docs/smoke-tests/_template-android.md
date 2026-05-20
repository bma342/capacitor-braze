# Android smoke pass — YYYY-MM-DD

> Copy this template to `android-YYYY-MM-DD.md`, then walk [`SMOKE-TEST-PLAYBOOK.md §5`](../SMOKE-TEST-PLAYBOOK.md#5-android-smoke-30-45-min). Fill in as you go.

## Setup

- **Trial workspace URL:** https://dashboard-XX.braze.com/...
- **Android SDK API key (prefix only):** `abc123-...`
- **Endpoint:** `sdk.iad-03.braze.com`
- **Plugin version:** `0.0.X`
- **`com.braze:android-sdk-ui` version:** `42.X.X` (from Gradle)
- **Capacitor version:** `6.X`
- **Android Studio version:** `__.X`
- **Emulator used:** Pixel __ + API level __ (Google Play Services or AOSP)
- **FCM credentials in app:** ☐ google-services.json wired / ☐ N/A (testing without push)

## Pre-flight

- [ ] `demo/android/variables.gradle` shows `compileSdk = 35` and `minSdk = 22+`
- [ ] `demo/android/app/src/main/AndroidManifest.xml` + `braze.xml` carry the Android API key + endpoint
- [ ] `cd demo/android && ./gradlew assembleDebug` ran cleanly (Kotlin 2.2.0 + AGP 8.6.0 + Gradle 8.7)
- [ ] Emulator booted, Charles Proxy or network inspector configured for HTTPS interception (if you want raw wire format)
- [ ] Dashboard open in a browser

## Steps executed

- [ ] 1. Sign in: `android-trial-<date>@example.com`, name "Alex"
- [ ] 2. Eat → "Olive & Vine" → "Lamb gyro plate" → Add to cart
- [ ] 3. Shop → "Linen field tote" → Add to cart
- [ ] 4. Cart → Checkout → Place order
- [ ] 5. Profile → set email + first name + DOB + custom attribute
- [ ] 6. Settings → add subscription group ID (real Braze-issued one)
- [ ] 7. Settings → look up a feature flag
- [ ] 8. Settings → Pause tracking
- [ ] 9. Settings → Resume tracking
- [ ] 10. Settings → Delete my data
- [ ] 11. Wire `@capacitor/push-notifications`, request permission, capture FCM token. The bridge accepts the token string verbatim per C03
- [ ] 12. Trigger an FCM push from dashboard at the test userId → push arrives on emulator → tap opens app → deep link handled if configured

## Captures (highest-leverage data)

**`logCustomEvent` wire body** (Charles or `adb logcat -s Braze:V` filtered):

```json
PASTE HERE
```

**`setDateOfBirth` wire body** (after Step 5):

```json
PASTE HERE
```

> **Web emits `"dob":"1987-7-14"` (no zero-padding).** Document what Android emits here. Cross-check against iOS once both passes are complete.

**`FeatureFlag` DTO returned** (one flag per type configured in dashboard):

```json
PASTE HERE
```

**`ContentCard` DTO returned** (one card per type):

```json
PASTE HERE
```

> Android `card.forJsonPut()` is the source serializer. Cross-check against iOS `card.json()` + Web canonical shape.

## Cross-platform drift to flag

(Fill in only if drift discovered. Empty section = no drift.)

| Field | Web | iOS | Android | Action |
|---|---|---|---|---|
| DOB padding | `1987-7-14` | ??? | ??? | ??? |
| FeatureFlag.properties shape | ??? | ??? | ??? | ??? |
| ContentCard.type values | ??? | ??? | ??? | ??? |

## Screenshots

- [ ] Dashboard user profile with custom attributes
- [ ] One push notification received on emulator
- [ ] One error/warning from `logcat` (if any)

## Issues filed

- (link issues)

## Verdict

- [ ] All 12 steps passed cleanly. Wire format matches web where it should. Safe to proceed.
- [ ] N issues filed; gate to 0.1.0 once they close: #__, #__, #__
- [ ] Drift discovered, captured in table above. Reconciliation plan: __________
