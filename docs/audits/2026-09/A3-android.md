> **Archived audit report — read the resolution table first.**
> Point-in-time review of `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated 2026-09-22.
> The findings below were current *then*. The table immediately after this banner records what
> happened to each one in `0.2.0`. Where the report and the current code disagree, the code wins.
> Index of audits: [`../README.md`](../README.md).
>
> `com.braze:android-sdk-ui` was bumped **42.2.0 → 43.2.0** in the same pass. That bump imposes no
> AGP or compileSdk floor (`minCompileSdk=21`, `minAndroidGradlePluginVersion=1.0.0` in the AAR
> metadata); the AGP 8.6.0 / compileSdk 35 requirement comes from Braze's transitive androidx deps
> and is unchanged.

## Resolution status

| ID | Status in 0.2.0 | Note |
|---|---|---|
| A3-01 | fixed | `BrazeActivityLifecycleCallbackListener(sessionHandlingEnabled = true, registerInAppMessageManager = false)` is registered on the `Application` once per process during `initialize`, plus an explicit `openSession` for the already-started Activity. Sessions now exist on Android for the first time. |
| A3-02 | fixed by documentation | The bridge declares no `FirebaseMessagingService` and no Firebase dependency, so it cannot collide with `@capacitor/push-notifications`; the missing piece was the consumer recipe. Both paths (Braze's service registered directly, or forwarding from your own) plus the `braze.xml` presentation keys are now in the README and [C10](../../mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md), verified against Braze's published Android docs. Exposing the channel/icon/fallback settings as `initialize` options remains a contract-change follow-up. |
| A3-03 | fixed, per FIX_DECISIONS | `Braze.configure()`'s `false` return is read. The call still **resolves** (Activity recreation legitimately re-runs `initialize`), plugin state follows the new options, and a warning states that the SDK keeps its first configuration for the process lifetime. Residual, and named in that warning: the plugin's `sdkAuthenticationEnabled` flag follows the second call while the SDK keeps the first's. |
| A3-04 | fixed | `id` reads `InAppMessageBase.getTriggerId()`, normalised to JSON `null` when blank (it reads back `""`, not `null`, for a campaign with no trigger id — caught by a serializer test). |
| A3-05 | fixed | Real `slideFrom` from `InAppMessageSlideup.getSlideFrom()`. |
| A3-06 | fixed | `clicked` reads `Card.isClicked()`. |
| A3-07 | fixed | `imageAltText` emitted on every non-control variant. |
| A3-08 | fixed | The feature-flag DTO is built field-by-field and is exactly `{ id, enabled, properties }`. A test asserts `dto.keys()` and that `forJsonPut()`'s `fts` token appears nowhere in the output. |
| A3-09 | fixed | `BrazeLogger.logLevel` set in both branches, reversible across re-init; asserted end-to-end under Robolectric. |
| A3-10 | fixed | `handleOnDestroy` tears down all three subscriptions. The in-app-message listener teardown is **identity-checked**, because Android resumes the replacement Activity before destroying the old one — an unconditional clear would silently kill the new instance's wiring after the first rotation. There is a regression test, and it fails when the guard is removed. |
| A3-11 | fixed | Both strings byte-identical to `src/web.ts`; the cluster check ported to `BrazeLogger.w`. The `requireUser` `currentUser` wording is retained as a sanctioned C04 exception, now documented there. |
| A3-12 | fixed | Absent vs present-but-invalid are distinguished via `call.data.has()/isNull()`; a fractional `quantity` is rejected. |
| A3-13 | fixed | All four `notifyListeners` calls routed through `bridge.executeOnMainThread`. |
| A3-14 | fixed | 7 tests → **74**. `initialize` now runs end-to-end under Robolectric, which is what made the post-init branches reachable. The vacuous `setDateOfBirth` assertion is replaced by byte-exact per-field checks, and the false class docstring is rewritten. |
| A3-15 | fixed | `consumer-rules.pro` narrowed to the plugin's own namespace with a comment that Braze's AARs ship their own deliberately-`-keepnames` rules; the dead `com.appboy.**` rules and the inert `proguard-rules.pro` are gone. |
| A3-16 | fixed | `lint { abortOnError true }` and `:capacitor-braze:lintDebug` in CI. Verified non-vacuous: a probe file calling an API-26 method failed the build with `[NewApi]`, which also confirms the new `minSdkVersion 22` default is live. ktlint/detekt deliberately not added. |
| A3-17 | fixed | All 13 setter call sites plus `logClick`/`logImpression` route through a helper that warns on rejection, logging the **method name only** per `SECURITY.md` §3. The call still resolves — see [A1-10](./A1-ts-web.md). |
| A3-18 | fixed | Non-scalar property values reject with the shared message instead of being dropped. |
| A3-19 | mostly fixed — **one sub-finding was wrong** | `fileTree(libs)`, the unused espresso / androidx.junit deps, the inert `proguardFiles` and the `minSdk 26` default were all removed or corrected. But `androidx.appcompat` is **not** unused: `Bridge.getActivity()` is typed `AppCompatActivity` and `:capacitor-android` declares appcompat with `implementation`, so it is not exported. Removing it breaks the Kotlin compile at every `bridge.activity` site. Restored with a comment explaining why. |

### Not changed, deliberately

- `Braze.closeSession` is not called from `handleOnPause` — `BrazeActivityLifecycleCallbackListener` owns it, and calling both would double-count.
- `getCurrentUser(IValueCallback)`: the blocking `currentUser` accessor still occupies Capacitor's shared plugin task thread (A3-13's sibling). Real, but changing the threading model of every user method with no measured problem behind it was out of scope.

---

# A3 — Android bridge audit

**Scope:** `android/` in `bma342/capacitor-braze` @ `0ab8e19` (package `0.1.0`).
**SDK ground truth:** `com.braze:android-sdk-base:42.2.0` + `com.braze:android-sdk-ui:42.2.0` AARs pulled from Maven Central and disassembled with `javap` (classes, signatures and bytecode) — not from docs. Capacitor ground truth: `demo/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/*.java`.
**Method:** every Braze symbol the bridge references was checked for existence + signature at 42.2.0; every `@PluginMethod` was diffed against `src/definitions.ts` (contract) and `src/web.ts` (reference impl).

---

## 1. Contract / error-string parity table

`✓` = Android matches `src/web.ts` byte-for-byte. Findings are cross-referenced.

| Method | Params read | Init guard | Return shape | Error strings vs web |
|---|---|---|---|---|
| `echo` | `value` | none (OK, matches web) | `{value}` ✓ | ✓ |
| `initialize` | `apiKey`, `endpoint`, `allowInsecureEndpoint`, `enableLogging`, `enableSdkAuthentication`, `sessionTimeoutInSeconds` | n/a | `void` ✓ | **drift** — HTTPS error drops `" See SECURITY.md §4."` (A3-09); cluster sanity check absent entirely (A3-10) |
| `changeUser` | `userId`, `sdkAuthSignature` | ✓ | `void` ✓ | ✓ (incl. SDK-Auth enforcement string) |
| `getUserId` | — | ✓ via `requireUser` | `{userId: string\|null}` ✓ | see A3-09 (`currentUser` vs `getUser()` wording) |
| `setSdkAuthenticationSignature` | `signature` | ✓ | `void` ✓ | ✓ |
| `setEmail`/`setPhoneNumber`/`setFirstName`/`setLastName`/`setLanguage`/`setCountry`/`setHomeCity` | single nullable string | ✓ | `void` ✓ | ✓ (no per-field errors on either side) |
| `setCustomUserAttribute` | `key`, `value` (raw via `call.data.opt`) | ✓ | `void` ✓ | ✓ |
| `addToSubscriptionGroup` / `removeFromSubscriptionGroup` | `groupId` | ✓ | `void` ✓ | ✓ |
| `addAlias` | `alias`, `label` | ✓ | `void` ✓ | ✓ |
| `getDeviceId` | — | ✓ | `{deviceId}` ✓ | **drift** — truncated message (A3-09) |
| `setDateOfBirth` | `year`, `month`, `day` | ✓ | `void` ✓ | ✓ (per-field, 1-indexed month → `Month.entries[m-1]` correct) |
| `setGender` | `gender` | ✓ | `void` ✓ | ✓ (all 6 enum cases exist at 42.2.0) |
| `logCustomEvent` | `name`, `properties` | ✓ | `void` ✓ | ✓ |
| `logPurchase` | `productId`, `currency`, `price`, `quantity`, `properties` | ✓ | `void` ✓ | **drift** — fractional `quantity` silently becomes `1` instead of rejecting (A3-11) |
| `getFeatureFlag` / `getAllFeatureFlags` | `id` / — | ✓ | `{flag}` / `{flags}` | **drift** — extra `fts` key on every flag (A3-08) |
| `refreshFeatureFlags` / `logFeatureFlagImpression` | — / `id` | ✓ | `void` ✓ | ✓ |
| `getContentCards` | — | ✓ | `{cards, lastUpdated}` | **drift** — `clicked` hardcoded `false` (A3-06) |
| `requestContentCardsRefresh` | — | ✓ | `void` ✓ | ✓ |
| `logContentCardClick` / `logContentCardImpression` | `cardId` | ✓ | `void` ✓ | ✓ |
| `registerPushToken` | `token` | ✓ | `void` ✓ | ✓ (throws on web by design) |
| `wipeData` / `disableSDK` / `enableSDK` / `isDisabled` | — | **intentionally none** (C07 quartet) ✓ | `void` / `{disabled}` ✓ | ✓ |
| `requestImmediateDataFlush` | — | ✓ | `void` ✓ | ✓ |
| listener `featureFlagsUpdated` | — | wired at `initialize` ✓ | `{flags}` | see A3-08 |
| listener `contentCardsUpdated` | — | wired at `initialize` ✓ | `{cards, lastUpdated}` | see A3-06 |
| listener `inAppMessageReceived` | — | wired at `handleOnResume` | `{message}` | **drift** — `id`, `slideFrom`, `imageAltText` (A3-04, A3-05, A3-07) |
| listener `sdkAuthError` | — | wired at `initialize` ✓ | `{userId, errorCode, errorReason, signature, errorEventId}` ✓ | ✓ |

**Init-guard audit (C07):** every method except `echo` and the quartet `wipeData` / `disableSDK` / `enableSDK` / `isDisabled` goes through `requireInitialized` or `requireUser`. Verified line-by-line. No violations.

**SDK symbol audit:** every Braze symbol the bridge calls exists at 42.2.0 with the signature used — `Braze.getInstance(Context)`, `Braze.configure(Context, BrazeConfig): boolean`, `Braze.wipeData/disableSdk/enableSdk(Context)`, `Braze.isDisabled`, `BrazeConfig.Builder.setApiKey/setCustomEndpoint/setIsSdkAuthenticationEnabled/setSessionTimeout(int)`, `BrazeLogger.enableVerboseLogging()`, `BrazeUser.setCustomUserAttribute(String, long)` (the Long overload the L4-K02 comment claims — confirmed present), `setDateOfBirth(int, Month, int)`, `addToSubscriptionGroup`, `getFeatureFlag/getAllFeatureFlags/refreshFeatureFlags/logFeatureFlagImpression`, `getCachedContentCards()` (nullable — correctly `?: emptyList()`), `getContentCardsLastUpdatedInSecondsFromEpoch()`, `requestContentCardsRefresh()`, `setRegisteredPushToken`, `setSdkAuthenticationSignature`, `subscribeToSdkAuthenticationFailures`, `removeSingleSubscription`, `BrazeInAppMessageManager.getInstance()/registerInAppMessageManager/unregisterInAppMessageManager`, `setCustomInAppMessageManagerListener` + `setCustomControlInAppMessageManagerListener` (both on `InAppMessageManagerBase`). **No deprecated or missing API is referenced.** The four content-card classes named in the `when` all exist, plus `ControlCard` (handled via `isControl`, which is `cardType == CardType.CONTROL` — correct).

---

## 2. Findings

### A3-01 — No Braze session is ever opened; `BrazeActivityLifecycleCallbackListener` is neither registered nor documented
**Severity: BLOCKER**
**Files:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:137-159`; `docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md:110-180`; `README.md:1519`; `demo/android/app/src/main/AndroidManifest.xml`

The plugin's only lifecycle wiring is the in-app-message manager:

```kotlin
override fun handleOnResume() {
    super.handleOnResume()
    val manager = BrazeInAppMessageManager.getInstance()
    manager.registerInAppMessageManager(bridge.activity)
    ...
}

override fun handleOnPause() {
    super.handleOnPause()
    BrazeInAppMessageManager.getInstance().unregisterInAppMessageManager(bridge.activity)
}
```

`Braze.openSession(Activity)` / `closeSession(Activity)` are never called, and nothing registers `BrazeActivityLifecycleCallbackListener`. I scanned every class in both AARs for callers of `registerActivityLifecycleCallbacks` and `Braze.openSession`: the only two are `com.braze.BrazeActivityLifecycleCallbackListener` and `com.braze.ui.activities.BrazeBaseFragmentActivity`. Neither AAR manifest declares a `ContentProvider` or `androidx.startup` `Initializer`, so **there is no auto-init path**. Capacitor's `BridgeActivity` extends `AppCompatActivity`, not `BrazeBaseFragmentActivity`.

Neither `C10` nor the README mentions `BrazeActivityLifecycleCallbackListener` anywhere (grepped), and the demo app — the "fork-as-starter reference" — has no `Application` subclass at all.

**Why it matters.** Without sessions: no `session_id` on any logged event, so Braze's session-scoped analytics (DAU/MAU, session-length, sessions-per-user) are empty; session-start in-app-message and Content Card triggers never fire; `closeSession` never runs so there is no flush-on-background. A consumer following the documented integration gets a Braze dashboard that looks broken and has no way to find out why. This is the single thing a Braze Android engineer checks first in any wrapper review.

**Fix.** Either register it from the plugin (simplest for consumers, matches what the plugin already does for the IAM manager):

```kotlin
override fun load() {
    super.load()
    BrazeActivityLifecycleCallbackListener(
        sessionHandlingEnabled = true,
        registerInAppMessageManager = false, // this plugin owns IAM registration
    ).registerOnApplication(context)
}
```

(`registerOnApplication(Context)` and the `(boolean, boolean)` constructor both exist at 42.2.0 — verified.) Note that doing this also removes the need for the manual `handleOnResume`/`handleOnPause` IAM wiring; pick one owner, not both. Otherwise, document the `Application.onCreate()` snippet prominently in C10 + README and add it to `demo/`. Either way the demo must demonstrate it.

**Confidence: high.**

---

### A3-02 — Inbound Braze push cannot be delivered: no `FirebaseMessagingService` path, and the documented setup collides with `@capacitor/push-notifications`
**Severity: BLOCKER**
**Files:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:938-963`; `android/src/main/AndroidManifest.xml` (empty); `docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md:180-192`

`registerPushToken` itself is correct — `Braze.getInstance(context).registeredPushToken = token` maps to the real `setRegisteredPushToken(String)`. But that is only the *outbound* half (telling Braze where to send). The *inbound* half — receiving the FCM `RemoteMessage` and handing it to Braze so a notification is built and impression/open analytics are logged — requires either `com.braze.push.BrazeFirebaseMessagingService` declared in the consumer manifest, or a forward from the consumer's own service via `BrazeFirebaseMessagingService.handleBrazeRemoteMessage(context, remoteMessage)` (both confirmed present at 42.2.0; the static also exposes `isBrazePushNotification` and `handleOnNewToken`).

C10's Android push section lists only three steps: add `google-services.json`, apply the Google Services plugin, forward the token. Follow them exactly and **zero notifications are ever displayed.**

It is worse than an omission. C10 tells consumers to get the token from `@capacitor/push-notifications`, which declares its own `FirebaseMessagingService` in *its* manifest. Android allows only one `FirebaseMessagingService` to win the `com.google.firebase.MESSAGING_EVENT` intent filter, so adding Braze's service breaks Capacitor's push plugin and vice versa. The coexistence pattern is exactly the `handleBrazeRemoteMessage` forward — which the plugin neither performs nor documents. Braze's own SDK even ships `setFallbackFirebaseMessagingServiceEnabled` / `setFallbackFirebaseMessagingServiceClasspath` on `BrazeConfig.Builder` for this case; the plugin exposes neither.

Also unexposed and consequential for push: `setDefaultNotificationChannelName` / `setDefaultNotificationChannelDescription` / `setSmallNotificationIcon` on `BrazeConfig.Builder` — on API 26+ (the plugin's own `minSdk` default) a badly-named default channel is user-visible.

**Fix.** Minimum viable: add a documented consumer snippet forwarding from their `FirebaseMessagingService`:

```kotlin
class AppFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        if (BrazeFirebaseMessagingService.handleBrazeRemoteMessage(this, remoteMessage)) return
        // ...your own / Capacitor push handling
    }
    override fun onNewToken(token: String) {
        BrazeFirebaseMessagingService.handleOnNewToken(this, token)
    }
}
```

Better: widen `BrazeInitializeOptions` with `notificationChannelName`, `notificationChannelDescription`, `smallNotificationIcon`, and `fallbackFirebaseMessagingServiceClasspath`, wire them onto the builder, and exercise the whole path in `demo/`. Until then the README/status table should not present Android push as working.

**Confidence: high.**

---

### A3-03 — `Braze.configure()` returns `false` when already configured; the bridge ignores it and reports success
**Severity: MAJOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:372-374`

```kotlin
Braze.configure(context, builder.build())
initialized = true
sdkAuthenticationEnabled = enableSdkAuthentication
```

Disassembling `Braze$Companion.configure` at 42.2.0:

```
44: invokestatic  access$getInstance$cp   // instance != null?
53: invokestatic  access$isInstanceStopped$p
61: getstatic     java/lang/Boolean.TRUE
66: invokevirtual isApiKeyPresent$android_sdk_base_release
...
104: iconst_0
105: ireturn        // returns FALSE
```

i.e. if a live, non-stopped instance with an API key already exists, `configure` **logs a warning, changes nothing, and returns false**. The plugin discards that and sets `initialized = true`.

**Why it matters.** The Braze singleton is process-wide; `initialized` is a plugin-instance field. On Activity recreation (or any second `initialize` call with different options), the consumer's `initialize({apiKey: B, endpoint: Y, enableSdkAuthentication: true})` resolves successfully while the SDK keeps key A / endpoint X / SDK-Auth off. The security consequence is concrete: `sdkAuthenticationEnabled` is set to `true` on the plugin (so `changeUser` starts *demanding* a signature), while `BrazeConfig.isSdkAuthEnabled` on the SDK is still `false` — the signature is accepted by the bridge and then never actually enforced on the wire. The plugin's own comment at :117-121 acknowledges the config is unreadable post-`configure`, which is exactly why the return value is the only signal available.

**Fix.**

```kotlin
val configured = Braze.configure(context, builder.build())
if (!configured) {
    call.reject(
        "Braze.initialize: the Braze SDK is already configured in this process and " +
            "cannot be reconfigured. Call wipeData() first, or restart the app.",
    )
    return
}
```

If silently-succeed-on-repeat-init is the desired ergonomic, then guard on the plugin's own state first (`if (initialized) { call.resolve(); return }`) and only treat an unexpected `false` as an error — but do not claim success for options that were dropped.

**Confidence: high.**

---

### A3-04 — In-app message `id` is hardcoded `null`; `InAppMessageBase.getTriggerId()` exists at 42.2.0
**Severity: MAJOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:188-193`

```kotlin
// Android's IInAppMessage doesn't expose a trigger / analytics id
// the way iOS BrazeKit and Web do; ...
dto.put("id", JSObject.NULL)
```

The comment is false. `javap com.braze.models.inappmessage.InAppMessageBase`:

```
public static final java.lang.String TRIGGER_ID;
public final java.lang.String getTriggerId();
```

`InAppMessageBase` is the superclass of `InAppMessageSlideup`, `InAppMessageModal`, `InAppMessageFull`, `InAppMessageHtml*` and `InAppMessageControl` — i.e. every message the listener will ever see. The web bridge emits `message.triggerId ?? null` (`src/web.ts:807`), so consumers who key analytics off `message.id` get a value on web and iOS and permanent `null` on Android. This is a silent provider-data drop on the plugin's own terms.

**Fix.**

```kotlin
dto.put("id", (message as? InAppMessageBase)?.triggerId ?: JSObject.NULL)
```

(plus `import com.braze.models.inappmessage.InAppMessageBase`). Correct the comment in the same commit.

**Confidence: high.**

---

### A3-05 — Slide-up `slideFrom` is hardcoded `"bottom"`; `InAppMessageSlideup.getSlideFrom()` exists
**Severity: MAJOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:209-217`

```kotlin
MessageType.SLIDEUP -> {
    dto.put("type", "slideup")
    ...
    // slideFrom is fixed by SDK (no enum exposed at plugin layer).
    dto.put("slideFrom", "bottom")
}
```

Also false. At 42.2.0:

```
public final class com.braze.models.inappmessage.InAppMessageSlideup extends InAppMessageWithImageBase {
  public final com.braze.enums.inappmessage.SlideFrom getSlideFrom();
}
public final class com.braze.enums.inappmessage.SlideFrom { TOP; BOTTOM; }
```

A campaign configured to slide from the top reports `"bottom"` to JS. The contract declares `slideFrom: 'top' | 'bottom'` (`definitions.ts:524`) and web maps it faithfully (`slideup.slideFrom === 'TOP' ? 'top' : 'bottom'`). Any consumer using `slideFrom` to position a custom presenter renders the banner in the wrong place.

**Fix.**

```kotlin
val slideFrom = (message as? InAppMessageSlideup)?.slideFrom
dto.put("slideFrom", if (slideFrom == SlideFrom.TOP) "top" else "bottom")
```

**Confidence: high.**

---

### A3-06 — Content card `clicked` is hardcoded `false`; `Card.isClicked()` exists at 42.2.0
**Severity: MAJOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:1180-1183, 1203`

```kotlin
 *   - `clicked`   ← always `false` (the Android SDK does not
 *      expose a card-level "clicked" boolean; iOS does. This is
 *      a documented cross-platform asymmetry; ...)
...
dto.put("clicked", false)
```

`javap com.braze.models.cards.Card` at 42.2.0:

```
public final boolean isClicked();
```

`clicked` is a **required** (non-optional) field on `BrazeClassicContentCard` / `BrazeCaptionedImageContentCard` / `BrazeImageOnlyContentCard` (`definitions.ts:378, 399, 415`), and web emits `c.clicked ?? false`. A consumer filtering a Content Card feed on `!card.clicked` shows every card forever on Android. This is a hardcoded default overriding real SDK data, documented as an SDK gap that does not exist.

**Fix.** `dto.put("clicked", card.isClicked)` and delete the "documented asymmetry" paragraph.

**Confidence: high.**

---

### A3-07 — `imageAltText` is never emitted for in-app messages; `IInAppMessage.getAltImageText()` exists
**Severity: MINOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:212-215, 218-233`

```kotlin
// Android's SLIDEUP doesn't carry imageAltText/language on
// the base IInAppMessage; immersive-only fields stay absent.
```

`IInAppMessage` at 42.2.0 declares `getAltImageText()` / `setAltImageText(String)` on the **base** interface, and `InAppMessageBase` even has the `IMAGE_ALT` JSON key constant. The contract has `imageAltText?: string` on slideup/modal/full and web emits it when present. Android drops it on all three.

(The same comment's claim about `language` *is* correct — there is no language accessor on Android's IAM models. Worth stating explicitly rather than bundling it with a false claim.)

Severity is MINOR only because the field is optional; it is an accessibility signal, so it is the kind of drop a reviewer will notice.

**Fix.** In the shared part of `serializeInAppMessage`, before the `when`:

```kotlin
message.altImageText?.takeIf { it.isNotBlank() }?.let { dto.put("imageAltText", it) }
```

**Confidence: high.**

---

### A3-08 — Feature-flag DTO leaks Braze's internal `fts` tracking token and violates the declared shape
**Severity: MINOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:871-877`

```kotlin
private fun serializeFeatureFlag(flag: FeatureFlag): JSObject {
    return JSObject(flag.forJsonPut().toString())
}
```

Disassembling `FeatureFlag.forJsonPut()` at 42.2.0 shows it writes four keys, not three:

```
17: ldc "id"          →  this.id
29: ldc "enabled"     →  this.enabled
41: ldc "properties"  →  getProperties()
53: ldc "fts"         →  this.trackingString     ← extra
```

`trackingString` is `internal` on the Kotlin side (`getTrackingString$android_sdk_base_release`) — Braze's impression-attribution token, deliberately not part of the public model. `BrazeFeatureFlag` (`definitions.ts:284-299`) declares exactly `{id, enabled, properties}`, and web's `serializeFeatureFlag` builds that object field-by-field and even filters unknown property types. So Android ships a fourth key that the TypeScript type says does not exist, containing an SDK-internal token that will now show up in consumer logs and analytics payloads.

**Fix.** Build the DTO explicitly instead of round-tripping the SDK's own encoder:

```kotlin
private fun serializeFeatureFlag(flag: FeatureFlag): JSObject {
    val dto = JSObject()
    dto.put("id", flag.id)
    dto.put("enabled", flag.enabled)
    dto.put("properties", JSObject(flag.properties.toString()))
    return dto
}
```

(`FeatureFlag.getProperties(): JSONObject` is public and is already the `{key: {type, value}}` wire shape the contract wants.) The same commit should fix the method's doc comment, which asserts `forJsonPut` "returns Braze's canonical wire format" matching the contract.

**Confidence: high.**

---

### A3-09 — `enableLogging: false` does not silence the Braze SDK on Android, and `enableVerboseLogging()` is a sticky process-global
**Severity: MAJOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:335, 343-349`

```kotlin
val enableLogging = call.getBoolean("enableLogging", false) ?: false
...
if (enableLogging) {
    BrazeLogger.enableVerboseLogging()
}
```

Two problems, both verified in bytecode:

1. `BrazeLogger`'s static initialiser is `iconst_4; putstatic logLevel` — the default log level is **4 (`Log.INFO`)**, not `SUPPRESS`. So with `enableLogging: false` the Braze SDK still writes INFO/WARN/ERROR to logcat in release builds. `definitions.ts:28-33` tells consumers "Never enable in production builds — Braze SDK logs include event payloads which may contain PII", and `C06` / `SECURITY.md §8` present `enableLogging: false` as the secure default. On Android that default does nothing. The `BrazeLogger.SUPPRESS` constant exists precisely for this.
2. `enableVerboseLogging()` is `iconst_2; invokestatic setLogLevel` — a one-way process-global. The `else` branch is missing entirely, so `initialize({enableLogging: true})` followed by `wipeData()` + `initialize({enableLogging: false})` leaves the SDK at VERBOSE for the rest of the process. The in-code comment ("fine for the plugin since logging is consumer-opt-in") only holds if opt-out also works.

**Fix.**

```kotlin
BrazeLogger.logLevel = if (enableLogging) BrazeLogger.VERBOSE else BrazeLogger.SUPPRESS
```

`BrazeLogger.VERBOSE` and `BrazeLogger.SUPPRESS` are both public constants at 42.2.0, and `setLogLevel(int)` is public.

**Confidence: high.**

---

### A3-10 — Braze event subscriptions are never torn down on plugin destroy: leaked Activity + WebView across Activity recreation
**Severity: MAJOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:376-417, 1058-1094` (no `handleOnDestroy` override anywhere in the file)

`initialize` registers three subscribers on the **process-wide** Braze singleton:

```kotlin
Braze.getInstance(context).subscribeToFeatureFlagsUpdates(subscriber)
Braze.getInstance(context).subscribeToContentCardsUpdates(ccSubscriber)
Braze.getInstance(context).subscribeToSdkAuthenticationFailures(authSubscriber)
```

Each lambda calls `notifyListeners(...)`, an instance method, so each captures `this@BrazePlugin` → which holds `bridge` → which holds the `AppCompatActivity` and the `WebView`.

The only teardown paths are `teardown*Subscription()`, called from `initialize` and `wipeData` — and both act on `this` instance's fields. When the Activity is destroyed and recreated (low-memory kill, "Don't keep activities", any config change not in the `configChanges` list, multi-window resize), Capacitor builds a **new** `Bridge` and **new** plugin instances. The new instance's fields are null, so `teardownFeatureFlagsSubscription()` is a no-op, and the *old* instance stays strongly referenced by the Braze singleton's event messenger forever — along with the dead Activity and WebView. Repeat the cycle N times and you hold N Activities.

Capacitor's `Plugin` exposes `handleOnDestroy()` (verified in `Plugin.java:996`); the bridge does not override it. The same applies to the IAM listener slot (`setCustomInAppMessageManagerListener` at :147/:153), though that one is bounded because the next instance's `handleOnResume` overwrites it.

**Fix.**

```kotlin
override fun handleOnDestroy() {
    teardownFeatureFlagsSubscription()
    teardownContentCardsSubscription()
    teardownSdkAuthErrorSubscription()
    val manager = BrazeInAppMessageManager.getInstance()
    manager.setCustomInAppMessageManagerListener(null)
    manager.setCustomControlInAppMessageManagerListener(null)
    initialized = false
    super.handleOnDestroy()
}
```

This is also worth an entry in `C05` (listener lifecycle), which today only covers eager-subscribe-at-init and says nothing about teardown.

**Confidence: high.** (The `WeakReference` that `registerInAppMessageManager` holds on the Activity — confirmed in bytecode — means the IAM manager itself is not the leak; the event subscribers are.)

---

### A3-11 — Two error strings are not byte-identical to `src/web.ts`, and the cluster sanity check is Android-absent
**Severity: MINOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:316-320, 644-646`; vs `src/web.ts:951-958, 322-329, 977-991`

C04 requires byte-identical strings across bridges. Three divergences:

| | web.ts | BrazePlugin.kt |
|---|---|---|
| HTTPS | `…only for local mock-server testing. See SECURITY.md §4.` | `…only for local mock-server testing.` |
| `getDeviceId` | `…device ID yet. Call \`initialize\` first or wait until the SDK has finished bootstrapping.` | `…device ID yet.` |
| `requireUser` | ``Braze: `getUser()` returned null.…`` | ``Braze: `currentUser` returned null.…`` |

The third is arguably deliberate (different SDK API names), but it should be stated in C04 as a sanctioned exception rather than left as undocumented drift — right now a reviewer cannot tell which of the three are intentional.

Separately, `src/web.ts:977-991` implements a cluster sanity check (regex against `sdk.<region>-NN.braze.{com,eu}` with a localhost/`.test`/`.local` allowance, `console.warn` on miss). `CLAUDE.md`'s status table lists "URL parsing + cluster sanity check at `initialize` ✅" without platform qualification. Android does the URL parse (`java.net.URI`, :327-333) but has no cluster check at all — a typo'd endpoint gets a warning on web and silence on Android.

**Fix.** Copy the two strings verbatim; port the cluster regex into a `BrazeLogger.w(...)` (not `android.util.Log`, and not gated on `enableLogging` since it carries no PII — just the host the consumer typed); note the `currentUser`/`getUser()` divergence in C04.

**Confidence: high.**

---

### A3-12 — `logPurchase` silently rewrites a fractional `quantity` to `1` instead of rejecting
**Severity: MINOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:781-785`

```kotlin
val quantity = call.getInt("quantity") ?: 1
if (quantity < 1 || quantity > 100) { … reject … }
```

Capacitor's `PluginCall.getInt` (verified in `PluginCall.java:224-235`) is strict — it returns the default for **any** non-`Integer` JSON value, including `Double`:

```java
if (value instanceof Integer) { return (Integer) value; }
return defaultValue;
```

So `logPurchase({quantity: 2.5})` yields `null` → `?: 1` → a purchase is logged with quantity **1**. The web bridge rejects with ``Braze.logPurchase: `quantity` must be an integer between 1 and 100.`` (`src/web.ts:933-935`). Revenue data diverges between platforms for the same call, with no error surfaced.

The same `getInt` behaviour applies to `sessionTimeoutInSeconds` (:351): `initialize({sessionTimeoutInSeconds: 1800.5})` is silently treated as absent (default 30 min) on Android and rejected on web. Lower impact, same shape.

**Fix.** Distinguish absent from invalid:

```kotlin
val hasQuantity = call.data.has("quantity") && !call.data.isNull("quantity")
val quantity = call.getInt("quantity")
if (hasQuantity && quantity == null) {
    call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
    return
}
val qty = quantity ?: 1
if (qty < 1 || qty > 100) { … }
```

Apply the same pattern to `sessionTimeoutInSeconds`.

**Confidence: high.**

---

### A3-13 — Event callbacks are pushed into the WebView from Braze's background dispatcher with no main-thread hop
**Severity: MINOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:173, 387, 394, 413`

All four `notifyListeners(...)` calls run on whatever thread Braze dispatches the event on. Braze's `IEventSubscriber` callbacks fire from its own coroutine scope, not the main thread — Braze's own `ContentCardsFragment` wraps its subscriber body in `Dispatchers.Main` (three `Dispatchers.getMain()` call sites in its bytecode), which is a strong signal about the contract.

Capacitor's `notifyListeners` → `PluginCall.resolve` → `MessageHandler.sendResponseMessage`, which on Capacitor 6's default path calls `javaScriptReplyProxy.postMessage(...)` **directly on the calling thread** (only the `legacySendResponseMessage` fallback uses `webView.post(...)`). `sendResponseMessage` then wraps everything in `catch (Exception ex) { Logger.error(...) }` — so if the WebView rejects a cross-thread call, the event is dropped silently with a logcat line the consumer will never see.

`@PluginMethod` bodies are fine — Capacitor runs those on its own `taskHandler` background thread (`Bridge.java:834`), so the blocking `Braze.getInstance(ctx).currentUser` (which is a `runBlocking` under the hood — confirmed: `getCurrentUser()` → `runGuardedForResult` → `BuildersKt.runBlocking`) never touches the main thread. Worth noting that it does occupy Capacitor's single shared plugin task thread, so a slow Braze user-dependency wait stalls every other plugin's calls; `getCurrentUser(IValueCallback)` exists at 42.2.0 if that ever shows up in profiling.

**Fix.** Cheap and unambiguous:

```kotlin
private fun notifyOnMain(event: String, payload: JSObject) {
    bridge.executeOnMainThread { notifyListeners(event, payload) }
}
```

and route all four call sites through it.

**Confidence: medium** — I could not conclusively establish that `JavaScriptReplyProxy.postMessage` throws off the UI thread at the androidx.webkit version in play; the recommendation is cheap insurance either way, and matches what Braze's own UI code does.

---

### A3-14 — The Robolectric harness does not exercise the plugin; the one non-trivial test is vacuous and its name is wrong
**Severity: MAJOR**
**File:** `android/src/test/java/com/bma342/braze/BrazePluginContractTest.kt` (186 lines, 7 tests)

The suite *does* run in CI (`.github/workflows/test.yml`, `verify-android` → `./gradlew :capacitor-braze:testDebugUnitTest`, and `:capacitor-braze` resolves via `demo/android/capacitor.settings.gradle`). That part is real. What it covers is not.

- **Every test stops before the SDK is touched.** All seven assert a `call.reject(...)` string on a pre-SDK validation branch. Not one test reaches `Braze.configure`, `Braze.getInstance`, a subscriber, or a serializer. The initialize *happy path* — including the `configure` call that A3-03 is about — has zero coverage.
- **The docstring is false on two counts.** It claims `setUp` "assigns it a mocked bridge so Capacitor's lifecycle hooks resolve" — `setUp` is `plugin = BrazePlugin()` and nothing else. It claims coverage of "the pure-function serializers" — `serializeContentCard`, `serializeInAppMessage`, `serializeFeatureFlag`, `serializeClickAction`, `serializeButtons`, `epochSecondsToMillis`, `aspectRatioOrNull` and `jsObjectToBrazeProperties` are all untested. These are precisely the functions carrying findings A3-04 through A3-08.
- **`setDateOfBirth emits per-field year error` tests nothing.** It asserts `captor.value.startsWith("Braze.")` and its own comment concedes "The pre-init guard fires first" — so it is asserting the *init-guard* string while claiming to verify per-field year validation. Every reject in the codebase passes it.
- **`mockPluginCall` has no `getDouble`/`getLong`/`getObject` stubs**, so `logPurchase`, `logCustomEvent` and `setCustomUserAttribute` are untestable with the current helper.

For a repo whose quality bar is "would pass Braze review", 7 tests / 0 SDK interactions against a 1316-line bridge with 37 methods is the gap a reviewer will lead with — especially since the iOS harness is only "scaffolded".

**Fix.** Three concrete steps, in order of value:
1. Make the serializers testable and test them. They are already pure w.r.t. Braze models; construct real `CaptionedImageCard(JSONObject(...))` etc. (the single-`JSONObject` constructors are public at 42.2.0 — verified) and assert the exact DTO. That alone would have caught A3-04/05/06/08.
2. Rename or delete the `setDateOfBirth` test; if the intent is per-field validation, drive it through an initialized plugin with a mocked/robolectric-shadowed `Braze`, otherwise name it `setDateOfBirth rejects before init`.
3. Fix the two false claims in the class docstring.

**Confidence: high.**

---

### A3-15 — `consumer-rules.pro` is broader than Braze's own consumer rules and keeps a namespace that no longer exists
**Severity: MINOR**
**File:** `android/consumer-rules.pro`

```
-keep class com.braze.** { *; }
-keep class com.appboy.** { *; }
-keep class com.bma342.braze.** { *; }
-dontwarn com.braze.**
-dontwarn com.appboy.**
```

Both Braze AARs ship their own `proguard.txt` that the consumer inherits automatically:

```
# android-sdk-ui/proguard.txt
-keepnames class com.braze.ui.** { *; }
-keepnames class com.braze.** { *; }
-keepnames class bo.app.** { *; }
-dontwarn com.braze.ui.**
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
```

Braze deliberately uses `-keepnames` (preserve names, still allow shrinking of unused members). The plugin escalates to `-keep … { *; }`, which pins **every member of every class in `com.braze.**`** — ~910 classes across the two AARs — against R8 shrinking in every consumer app. That is dead weight in the APK with no stated justification, and it overrides an explicit upstream decision.

`com.appboy.**` matches nothing: I searched both extracted AARs (`find base/cls ui/cls -path '*appboy*'`) — zero classes. Braze retired that namespace long before 42.x. Both `com.appboy` lines are dead.

`-keep class com.bma342.braze.** { *; }` is the one rule that is genuinely needed (Capacitor resolves `@CapacitorPlugin` classes reflectively), though `@capacitor/android`'s own consumer rules may already cover it.

**Fix.**

```
# Capacitor resolves plugin classes reflectively.
-keep class com.bma342.braze.** { *; }
# Braze's own AARs ship consumer rules; do not duplicate or widen them.
```

**Confidence: high.**

---

### A3-16 — Android is the only platform with no linter, and `abortOnError false` would hide one if there were
**Severity: MINOR**
**Files:** `android/build.gradle:47-49`; `.github/workflows/test.yml`

```groovy
lintOptions {
    abortOnError false
}
```

CI runs ESLint + Prettier for TypeScript and SwiftLint `--strict` for Swift. For Kotlin it runs `assembleDebug` and the unit tests — no ktlint, no detekt, and Android Lint is both never invoked and pre-emptively defanged. `C09` ("Capacitor's official toolchain, locked-in") lists eslint/prettier/swiftlint/docgen and simply has no Kotlin row. For a plugin whose Android bridge is the largest single source file in the repo, that is an asymmetric quality gate.

Two adjacent deprecations in the same block: `lintOptions { }` is replaced by `lint { }` in AGP 8.x, and `kotlinOptions { jvmTarget = '17' }` (:53-55) is deprecated in favour of `kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_17 } }` as of Kotlin 2.x. Both currently emit deprecation warnings and are scheduled for removal.

**Fix.**

```groovy
lint {
    abortOnError true
    warningsAsErrors false
}
kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
}
```

plus a `ktlint` or `detekt` step in `verify-android`, and a Kotlin row in C09.

**Confidence: high.**

---

### A3-17 — Every `BrazeUser` setter returns a validation boolean; all 13 call sites discard it
**Severity: MINOR**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:496, 503, 510, 517, 524, 531, 555-567, 594, 606, 627, 685, 717, 724`

At 42.2.0 every relevant `BrazeUser` method returns `boolean`:

```
public final boolean setEmail(java.lang.String);
public final boolean setCustomUserAttribute(java.lang.String, long);
public final boolean addAlias(java.lang.String, java.lang.String);
public final boolean addToSubscriptionGroup(java.lang.String);
public final boolean setDateOfBirth(int, com.braze.enums.Month, int);
...
```

`false` means Braze rejected the value (malformed email, invalid custom-attribute key, empty subscription group id, …) and logged a warning. The bridge calls `call.resolve()` unconditionally, so `await Braze.setEmail({email: 'not-an-email'})` resolves as success on Android while the attribute was never set. `Card.logClick()` / `Card.logImpression()` (:926, :934) have the same shape.

I am not proposing that a `false` should reject — that would be a contract change across three platforms and the Web SDK offers no equivalent signal. But discarding it *silently* is a choice that should be either acted on or written down.

**Fix (pick one):** log at warn through `BrazeLogger` (never the value, per SECURITY.md §3 — key/method name only), or add a one-line comment per group stating the return is intentionally ignored and why, and note the asymmetry in C03.

**Confidence: high.**

---

### A3-18 — Non-scalar event/purchase property values are silently dropped
**Severity: NIT**
**File:** `android/src/main/java/com/bma342/braze/BrazePlugin.kt:1297-1315`

```kotlin
when (val value = jsObject.get(key)) {
    is String  -> props.addProperty(key, value)
    is Int     -> props.addProperty(key, value)
    is Long    -> props.addProperty(key, value)
    is Double  -> props.addProperty(key, value)
    is Float   -> props.addProperty(key, value.toDouble())
    is Boolean -> props.addProperty(key, value)
}
```

No `else`. A `JSONObject.NULL`, array or nested object (reachable from any `any`-typed consumer code) vanishes without a trace — whereas `setCustomUserAttribute` in the same file handles exactly this case with an explicit `call.reject` and a C04 comment justifying it (:569-577). Same input class, two different policies, ten lines apart.

`BrazeProperties.addProperty(String, Object)` is the only overload at 42.2.0 (all the typed branches box to it), so the `when` could collapse to a type check plus a reject.

**Fix.** Add the `else ->` branch and surface it the way `setCustomUserAttribute` does — either a reject or, at minimum, a comment stating the drop is deliberate.

**Confidence: high.**

---

### A3-19 — `build.gradle` dependency and default-value nits
**Severity: NIT**
**File:** `android/build.gradle`

- `minSdkVersion … : 26` (:29) — the standalone default is higher than Braze's floor (the base AAR manifest declares `<uses-sdk android:minSdkVersion="21" />`), higher than Capacitor 6's stock 22, and higher than the 22 that `C10:127` and `demo/android/variables.gradle` actually use. It never bites in practice because the consumer's `rootProject.ext` always wins, but it is a fourth number in a place where three already disagree.
- `implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"` (:76) — nothing in `BrazePlugin.kt` imports `androidx.appcompat`; `:capacitor-android` already brings it transitively.
- `implementation fileTree(include: ['*.jar'], dir: 'libs')` (:75) — there is no `libs/` directory.
- `androidTestImplementation` espresso + androidx.junit (:87-88) with zero `src/androidTest` sources.
- `proguard-rules.pro` is wired via `proguardFiles` on a `release` block with `minifyEnabled false` — inert. Its contents also duplicate `consumer-rules.pro` (see A3-15).
- The `buildscript { classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0' }` (:19) is necessary (Capacitor's Java app template has no Kotlin plugin), but it is worth a C10 note: a consumer whose own app applies a *different* Kotlin version will see Gradle's "Kotlin Gradle plugin was loaded multiple times in different subprojects" warning, and the resolution is version-dependent. The demo doesn't exercise this because its root buildscript declares no Kotlin at all.

**Confidence: high.**

---

## 3. What is genuinely good

Not padding — these are the things I actively tried to break and could not.

- **Zero non-existent or deprecated SDK symbols.** I checked all ~40 Braze references against the 42.2.0 bytecode. Every one exists with the signature used. Given how much of `android-sdk-base` is obfuscated and how recently Braze reshuffled `BrazeLogger`, that is not automatic — the `enableVerboseLogging()` comment at :344-347 correctly documents the log-level move off `BrazeConfig.Builder`, and the `setCustomUserAttribute(String, Long)` overload the L4-K02 comment depends on is really there.
- **The Long-precision fix is correct and matters.** `is Long -> user.setCustomUserAttribute(key, value)` (:566) uses a real overload and avoids the 32-bit truncation the comment describes. The reasoning in the comment is accurate.
- **Month indexing is right.** `Month.entries[month - 1]` against a verified `JANUARY…DECEMBER` declaration order, with the 1-12 range checked first so the index can't throw. This is the single most commonly botched thing in Braze wrappers.
- **`BigDecimal.valueOf(price)` is the right factory.** The comment explaining `valueOf(double)` routing through `Double.toString` (vs `new BigDecimal(double)`) is correct and is the kind of detail that only shows up after someone has been burned by `14.99000000000000056843`.
- **Control-card and control-IAM handling is correct and early.** `card.isControl` compiles to `cardType == CardType.CONTROL`, which is exactly the right discriminator, and checking it *before* the subclass `when` means `ControlCard` never falls through to the `else -> return null`. Same pattern for `message.isControl` ahead of the `MessageType` dispatch.
- **`getCachedContentCards()` really can return null** (bytecode: `aconst_null; areturn` when the cached event is absent), and the bridge's `?: emptyList()` at :910 and :1111 handles it. Likewise the `-1` / `0` timestamp sentinels are mapped to JSON `null` per contract.
- **`JSObject.NULL` is used correctly throughout.** Passing a Kotlin `null` to `JSONObject.put(String, Object)` *removes* the key; `JSObject.NULL` stores a JSON null. The bridge never confuses the two, which is why `updated`, `expiresAt`, `linkText`, `altImageText`, `url` and `signature` all serialize as real nulls rather than missing keys.
- **The C07 quartet is implemented exactly as specified,** with no extra methods sneaking past the guard, and `requireUser` correctly chains through `requireInitialized` so there is one enforcement point rather than two.
- **Subscriber identity is handled correctly.** The Android SDK removes subscriptions by listener identity, and the three `teardown*` helpers retain and pass the exact `IEventSubscriber` instance. `initialize` tears down before re-subscribing, which prevents the stacked-subscription double-fire *within* an instance (A3-10 is about the cross-instance case).
- **No `!!`, no `@Suppress`, no `TODO`, no `android.util.Log`, no PII in any string.** The `Any` returns on `epochSecondsToMillis` / `aspectRatioOrNull` are forced by `JSObject.NULL` and are the least-bad option. `SECURITY.md §3` is honoured: not one attribute value, token, email or user id is interpolated into a log or an error message (the `cardId` in the content-card miss message is a Braze-issued opaque id, which is fine).
- **`setCustomUserAttribute` reads through `call.data.opt("value")`** rather than a typed accessor, which is the only way to preserve the original JSON type through Capacitor's coercion. That is a deliberate, correct, non-obvious choice.
- **CI actually builds and tests the Android module** against the real SDK (`assembleDebug` on the demo + `:capacitor-braze:testDebugUnitTest`). The class of bug the `verify-android` job's comment describes — "bridge code that references SDK APIs that don't exist" — is genuinely caught by it, and the results above confirm it is working.

---

## 4. Count by severity

| Severity | Count | IDs |
|---|---|---|
| **BLOCKER** | 2 | A3-01, A3-02 |
| **MAJOR** | 7 | A3-03, A3-04, A3-05, A3-06, A3-09, A3-10, A3-14 |
| **MINOR** | 8 | A3-07, A3-08, A3-11, A3-12, A3-13, A3-15, A3-16, A3-17 |
| **NIT** | 2 | A3-18, A3-19 |
| **Total** | **19** | |

**The through-line.** The bridge's *translation* layer is strong — types, sentinels, precision, enum mapping, null discipline are all handled by someone who understands both SDKs. What is missing is the *integration* layer: sessions (A3-01), push routing (A3-02), instance lifecycle (A3-03, A3-10). Those are the parts a native Android SDK normally gets from the host `Application`, and a Capacitor plugin has to either own them or document them; this one does neither. Separately, five findings (A3-04, A3-05, A3-06, A3-07, and the doc half of A3-08) share one root cause: **code comments asserting an SDK limitation that does not exist at 42.2.0**, each producing a hardcoded value where real data was available. A serializer test tier (A3-14) would have caught all five.
