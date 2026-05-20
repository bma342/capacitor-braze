# iOS smoke pass — YYYY-MM-DD

> Copy this template to `ios-YYYY-MM-DD.md`, then walk [`SMOKE-TEST-PLAYBOOK.md §4`](../SMOKE-TEST-PLAYBOOK.md#4-ios-smoke-30-45-min). Fill in as you go.

## Setup

- **Trial workspace URL:** https://dashboard-XX.braze.com/...
- **iOS SDK API key (prefix only):** `abc123-...`
- **Endpoint:** `sdk.iad-03.braze.com`
- **Plugin version:** `0.0.X`
- **BrazeKit/BrazeUI version (from `Podfile.lock`):** `14.X.X`
- **Capacitor version:** `6.X`
- **Xcode version:** `__.X`
- **Simulator used:** iPhone __ + iOS __
- **APNs sandbox provisioning profile installed:** ☐ Yes / ☐ N/A (testing without push)

## Pre-flight

- [ ] `demo/ios/App/Podfile` reflects `platform :ios, '15.0'` + `use_frameworks! :linkage => :static`
- [ ] `cd demo/ios/App && pod install` ran cleanly (BrazeKit 14.1.0 + BrazeUI 14.1.0 + CapacitorBraze 0.0.X installed)
- [ ] `demo/ios/App/App/AppDelegate.swift` initializes Braze with the iOS API key per Braze's iOS install guide
- [ ] `xcrun simctl list` shows the chosen simulator booted
- [ ] Charles Proxy or Network Conditioner running to capture simulator HTTPS (if you want raw wire format)
- [ ] Dashboard open in a browser

## Steps executed

- [ ] 1. Sign in: `ios-trial-<date>@example.com`, name "Alex"
- [ ] 2. Eat → "Olive & Vine" → "Lamb gyro plate" → Add to cart
- [ ] 3. Shop → "Linen field tote" → Add to cart
- [ ] 4. Cart → Checkout → Place order
- [ ] 5. Profile → set email + first name + DOB + custom attribute
- [ ] 6. Settings → add subscription group ID (real Braze-issued one)
- [ ] 7. Settings → look up a feature flag
- [ ] 8. Settings → Pause tracking
- [ ] 9. Settings → Resume tracking
- [ ] 10. Settings → Delete my data
- [ ] 11. Wire `@capacitor/push-notifications`, request permission, capture APNs token → hex format expected by `registerPushToken({token})`. Verify token POSTs correctly to device profile in dashboard
- [ ] 12. Trigger an APNs push from dashboard at the test userId → push arrives on simulator → tap opens app → deep link handled if configured

## Captures (highest-leverage data)

**`logCustomEvent` wire body** (intercepted via Charles or simulator network log):

```json
PASTE HERE
```

**`setDateOfBirth` wire body** (after Step 5):

```json
PASTE HERE
```

> **Web emits `"dob":"1987-7-14"` (no zero-padding).** Document what iOS emits here. Any difference is the kind of cross-platform DTO drift this smoke is supposed to find.

**`FeatureFlag` DTO returned** (configure flag with each type in dashboard: string, number, boolean, image, datetime, jsonobject):

```json
PASTE HERE
```

**`ContentCard` DTO returned** (one card per type if possible: captionedImage, textAnnouncement, shortNews, controlCard, classicImage):

```json
PASTE HERE
```

> Cross-check the iOS `card.json()` output against the canonical Web SDK `Card` shape. C02 claims the Web shape is canonical; this smoke validates that claim on iOS in practice.

## Cross-platform drift to flag

(Fill in only if drift discovered. Empty section = no drift.)

| Field | Web | iOS | Action |
|---|---|---|---|
| DOB padding | `1987-7-14` | ??? | ??? |
| FeatureFlag.properties shape | ??? | ??? | ??? |
| ContentCard.type values | ??? | ??? | ??? |

## Screenshots

- [ ] Dashboard user profile with custom attributes
- [ ] One push notification received on simulator
- [ ] One error/warning from Xcode console (if any)

## Issues filed

- (link issues)

## Verdict

- [ ] All 12 steps passed cleanly. Wire format matches web where it should. Safe to proceed.
- [ ] N issues filed; gate to 0.1.0 once they close: #__, #__, #__
- [ ] Drift discovered, captured in table above. Reconciliation plan: __________
