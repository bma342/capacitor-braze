# capacitor-braze

> Capacitor 6+ plugin wrapping the official Braze SDKs for Android, iOS, and Web. **Pre-release scaffold — not yet published to npm.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Capacitor 6+](https://img.shields.io/badge/Capacitor-6%2B-blue.svg)](https://capacitorjs.com/)

A community-maintained plugin that exposes the Braze customer engagement SDKs to Capacitor apps with a single TypeScript API across iOS, Android, and Web. Not affiliated with or endorsed by Braze, Inc.

## Why this exists

Braze ships first-party SDKs for native Android, iOS, Web, React Native, Flutter, Cordova, Expo, Unity, Xamarin, and Roku — but **not Capacitor**. Today's options for Capacitor teams are: ship the Cordova SDK (broken push handoff in Capacitor 6+), use the Web SDK only (lose native push + IAM), roll a custom bridge (2–3 weeks of native work), or skip Braze. This plugin makes it `npm install` + 10 lines.

See the [demand evidence](./PLAN.md#2-market-validation-already-done) and [strategic plan](./PLAN.md).

## Status

| Phase | Status |
|---|---|
| Strategic documentation | ✅ complete |
| Scaffold (0.0.1) | 🔨 in progress |
| v0.1.0 (15 daily-use methods) | ⏳ target: 3 weeks from scaffold |
| v0.2.0 (feature flags + enrichment) | ⏳ planned |
| v1.0.0 (stable) | ⏳ requires ≥5 production users |

See [`PLAN.md` §7](./PLAN.md#7-phased-roadmap) for the full roadmap.

## Quick start (preview — works once 0.1.0 ships)

```bash
npm install capacitor-braze @braze/web-sdk
npx cap sync
```

```ts
import { Braze } from 'capacitor-braze';

await Braze.initialize({
  apiKey: 'YOUR-SDK-API-KEY',
  endpoint: 'sdk.iad-03.braze.com',
  enableSdkAuthentication: true,
});

await Braze.changeUser({
  userId: 'user_123',
  sdkAuthSignature: '<jwt-from-your-backend>',
});

await Braze.logCustomEvent({ name: 'app_opened' });
```

**Which API key do I use?** SDK key (public, embedded in app), not REST key (secret, server-only). See [`SECURITY.md` §1](./SECURITY.md#1-api-keys--public-sdk-keys-vs-secret-rest-keys).

## API reference

<docgen-index>

* [`echo(...)`](#echo)
* [`initialize(...)`](#initialize)
* [`changeUser(...)`](#changeuser)
* [`getUserId()`](#getuserid)
* [`setSdkAuthenticationSignature(...)`](#setsdkauthenticationsignature)
* [`setEmail(...)`](#setemail)
* [`setPhoneNumber(...)`](#setphonenumber)
* [`setFirstName(...)`](#setfirstname)
* [`setLastName(...)`](#setlastname)
* [`setLanguage(...)`](#setlanguage)
* [`setCountry(...)`](#setcountry)
* [`setCustomUserAttribute(...)`](#setcustomuserattribute)
* [`addToSubscriptionGroup(...)`](#addtosubscriptiongroup)
* [`removeFromSubscriptionGroup(...)`](#removefromsubscriptiongroup)
* [`addAlias(...)`](#addalias)
* [`getDeviceId()`](#getdeviceid)
* [`setDateOfBirth(...)`](#setdateofbirth)
* [`setGender(...)`](#setgender)
* [`setHomeCity(...)`](#sethomecity)
* [`logCustomEvent(...)`](#logcustomevent)
* [`logPurchase(...)`](#logpurchase)
* [`getFeatureFlag(...)`](#getfeatureflag)
* [`getAllFeatureFlags()`](#getallfeatureflags)
* [`refreshFeatureFlags()`](#refreshfeatureflags)
* [`logFeatureFlagImpression(...)`](#logfeatureflagimpression)
* [`getContentCards()`](#getcontentcards)
* [`requestContentCardsRefresh()`](#requestcontentcardsrefresh)
* [`logContentCardClick(...)`](#logcontentcardclick)
* [`logContentCardImpression(...)`](#logcontentcardimpression)
* [`registerPushToken(...)`](#registerpushtoken)
* [`addListener('featureFlagsUpdated', ...)`](#addlistenerfeatureflagsupdated-)
* [`addListener('contentCardsUpdated', ...)`](#addlistenercontentcardsupdated-)
* [`removeAllListeners()`](#removealllisteners)
* [`wipeData()`](#wipedata)
* [`disableSDK()`](#disablesdk)
* [`enableSDK()`](#enablesdk)
* [`isDisabled()`](#isdisabled)
* [`requestImmediateDataFlush()`](#requestimmediatedataflush)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### echo(...)

```typescript
echo(options: BrazeEchoOptions) => Promise<BrazeEchoResult>
```

Round-trips a value through the native bridge. Useful as a sanity check
that the plugin installed correctly on the current platform. Not a Braze
SDK method.

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`options`** | <code><a href="#brazeechooptions">BrazeEchoOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#brazeechoresult">BrazeEchoResult</a>&gt;</code>

--------------------


### initialize(...)

```typescript
initialize(options: BrazeInitializeOptions) => Promise<void>
```

Initialize the Braze SDK. **Must be called before any other Braze method**
except {@link BrazePlugin.echo} and the init-independent privacy/lifecycle
methods ({@link BrazePlugin.wipeData}, {@link BrazePlugin.disableSDK},
{@link BrazePlugin.enableSDK}, {@link BrazePlugin.isDisabled}).

| Param         | Type                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazeinitializeoptions">BrazeInitializeOptions</a></code> |

--------------------


### changeUser(...)

```typescript
changeUser(options: BrazeChangeUserOptions) => Promise<void>
```

Identifies the current user. Pass an `sdkAuthSignature` if SDK
Authentication is enabled (see `SECURITY.md` §2).

| Param         | Type                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazechangeuseroptions">BrazeChangeUserOptions</a></code> |

--------------------


### getUserId()

```typescript
getUserId() => Promise<BrazeGetUserIdResult>
```

Returns the current external user ID, or `null` if the user is anonymous.

**Returns:** <code>Promise&lt;<a href="#brazegetuseridresult">BrazeGetUserIdResult</a>&gt;</code>

--------------------


### setSdkAuthenticationSignature(...)

```typescript
setSdkAuthenticationSignature(options: BrazeSetSdkAuthenticationSignatureOptions) => Promise<void>
```

Rotates the SDK Authentication signature without re-running
`changeUser`. Use after the previous signature expires (typically
every 12-24h depending on your backend's JWT lifetime) or after
receiving an SDK Auth error from the Braze backend.

Calling this without `enableSdkAuthentication: true` at init time
is a no-op in the SDK — the signature is stored but never sent.

| Param         | Type                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetsdkauthenticationsignatureoptions">BrazeSetSdkAuthenticationSignatureOptions</a></code> |

--------------------


### setEmail(...)

```typescript
setEmail(options: BrazeSetEmailOptions) => Promise<void>
```

Sets the current user's email.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetemailoptions">BrazeSetEmailOptions</a></code> |

--------------------


### setPhoneNumber(...)

```typescript
setPhoneNumber(options: BrazeSetPhoneNumberOptions) => Promise<void>
```

Sets the current user's phone number. E.164 format recommended.

| Param         | Type                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetphonenumberoptions">BrazeSetPhoneNumberOptions</a></code> |

--------------------


### setFirstName(...)

```typescript
setFirstName(options: BrazeSetFirstNameOptions) => Promise<void>
```

Sets the current user's first name.

| Param         | Type                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetfirstnameoptions">BrazeSetFirstNameOptions</a></code> |

--------------------


### setLastName(...)

```typescript
setLastName(options: BrazeSetLastNameOptions) => Promise<void>
```

Sets the current user's last name.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetlastnameoptions">BrazeSetLastNameOptions</a></code> |

--------------------


### setLanguage(...)

```typescript
setLanguage(options: BrazeSetLanguageOptions) => Promise<void>
```

Sets the current user's language. Use ISO 639-1 codes.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetlanguageoptions">BrazeSetLanguageOptions</a></code> |

--------------------


### setCountry(...)

```typescript
setCountry(options: BrazeSetCountryOptions) => Promise<void>
```

Sets the current user's country. Use ISO 3166-1 alpha-2 codes.

| Param         | Type                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetcountryoptions">BrazeSetCountryOptions</a></code> |

--------------------


### setCustomUserAttribute(...)

```typescript
setCustomUserAttribute(options: BrazeSetCustomUserAttributeOptions) => Promise<void>
```

Sets a custom user attribute. The native bridge dispatches based on the
inferred type of `value` (string / number / boolean → matching Braze SDK
overload).

| Param         | Type                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetcustomuserattributeoptions">BrazeSetCustomUserAttributeOptions</a></code> |

--------------------


### addToSubscriptionGroup(...)

```typescript
addToSubscriptionGroup(options: BrazeSubscriptionGroupOptions) => Promise<void>
```

Adds the current user to an email or SMS subscription group.

| Param         | Type                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesubscriptiongroupoptions">BrazeSubscriptionGroupOptions</a></code> |

--------------------


### removeFromSubscriptionGroup(...)

```typescript
removeFromSubscriptionGroup(options: BrazeSubscriptionGroupOptions) => Promise<void>
```

Removes the current user from a subscription group.

| Param         | Type                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesubscriptiongroupoptions">BrazeSubscriptionGroupOptions</a></code> |

--------------------


### addAlias(...)

```typescript
addAlias(options: BrazeAddAliasOptions) => Promise<void>
```

Adds an alias for the current user. (alias, label) pairs are unique across
users — if another user already owns the pair, the alias is rejected by
the Braze backend.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazeaddaliasoptions">BrazeAddAliasOptions</a></code> |

--------------------


### getDeviceId()

```typescript
getDeviceId() => Promise<BrazeGetDeviceIdResult>
```

Returns the Braze SDK device identifier for the current install. Useful
for debugging and for sending the device ID to your backend for targeted
server-side messaging.

Init-independent: safe to call before {@link BrazePlugin.initialize}; the
device ID is generated on first SDK use and persists across sessions.

**Returns:** <code>Promise&lt;<a href="#brazegetdeviceidresult">BrazeGetDeviceIdResult</a>&gt;</code>

--------------------


### setDateOfBirth(...)

```typescript
setDateOfBirth(options: BrazeSetDateOfBirthOptions) => Promise<void>
```

Sets the current user's date of birth. `month` is 1-indexed (January = 1)
to match the Web SDK contract and to avoid the Java `Calendar.MONTH`
0-indexed surprise. The Android bridge maps `month` to the Braze
`Month` enum internally.

| Param         | Type                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetdateofbirthoptions">BrazeSetDateOfBirthOptions</a></code> |

--------------------


### setGender(...)

```typescript
setGender(options: BrazeSetGenderOptions) => Promise<void>
```

Sets the current user's gender. Accepts the string values listed in
{@link <a href="#brazegender">BrazeGender</a>}; bridges map them to the matching native enum value.

| Param         | Type                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetgenderoptions">BrazeSetGenderOptions</a></code> |

--------------------


### setHomeCity(...)

```typescript
setHomeCity(options: BrazeSetHomeCityOptions) => Promise<void>
```

Sets the current user's home city. Pass `null` to clear.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesethomecityoptions">BrazeSetHomeCityOptions</a></code> |

--------------------


### logCustomEvent(...)

```typescript
logCustomEvent(options: BrazeLogCustomEventOptions) => Promise<void>
```

Logs a custom event for the current user.

| Param         | Type                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazelogcustomeventoptions">BrazeLogCustomEventOptions</a></code> |

--------------------


### logPurchase(...)

```typescript
logPurchase(options: BrazeLogPurchaseOptions) => Promise<void>
```

Logs a purchase. Required for Braze's revenue analytics. `currency` is
required on this contract even though the Web SDK accepts it optionally,
because revenue rolls up incorrectly when some events lack currency.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazelogpurchaseoptions">BrazeLogPurchaseOptions</a></code> |

--------------------


### getFeatureFlag(...)

```typescript
getFeatureFlag(options: BrazeGetFeatureFlagOptions) => Promise<BrazeGetFeatureFlagResult>
```

Returns a single feature flag by identifier, or `null` if no flag with
that `id` exists for the current user. Reads from the SDK's local
cache; call {@link BrazePlugin.refreshFeatureFlags} to force a fetch.

| Param         | Type                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazegetfeatureflagoptions">BrazeGetFeatureFlagOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#brazegetfeatureflagresult">BrazeGetFeatureFlagResult</a>&gt;</code>

--------------------


### getAllFeatureFlags()

```typescript
getAllFeatureFlags() => Promise<BrazeGetAllFeatureFlagsResult>
```

Returns all feature flags currently cached for the user.

**Returns:** <code>Promise&lt;<a href="#brazegetallfeatureflagsresult">BrazeGetAllFeatureFlagsResult</a>&gt;</code>

--------------------


### refreshFeatureFlags()

```typescript
refreshFeatureFlags() => Promise<void>
```

Requests an immediate refresh of feature flags from the Braze backend.
Fire-and-forget: the returned promise resolves once the refresh has
been dispatched, **not** once new flags arrive. Re-read with
{@link BrazePlugin.getAllFeatureFlags} after a short delay; the
subscribe-to-updates listener API will land in a later version.

--------------------


### logFeatureFlagImpression(...)

```typescript
logFeatureFlagImpression(options: BrazeLogFeatureFlagImpressionOptions) => Promise<void>
```

Logs an impression for a feature flag. Per Braze, limited to one
impression per session per flag id.

| Param         | Type                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazelogfeatureflagimpressionoptions">BrazeLogFeatureFlagImpressionOptions</a></code> |

--------------------


### getContentCards()

```typescript
getContentCards() => Promise<BrazeGetContentCardsResult>
```

Returns all content cards currently cached for the user. Reads from
the SDK's local cache; call {@link BrazePlugin.requestContentCardsRefresh}
to force a fetch.

**Returns:** <code>Promise&lt;<a href="#brazegetcontentcardsresult">BrazeGetContentCardsResult</a>&gt;</code>

--------------------


### requestContentCardsRefresh()

```typescript
requestContentCardsRefresh() => Promise<void>
```

Requests an immediate refresh of content cards from the Braze backend.
Fire-and-forget: the returned promise resolves once the refresh has
been dispatched, **not** once new cards arrive. Use the
`'contentCardsUpdated'` listener to react to fresh cards, or re-read
via {@link BrazePlugin.getContentCards} after a short delay.

--------------------


### logContentCardClick(...)

```typescript
logContentCardClick(options: BrazeLogContentCardClickOptions) => Promise<void>
```

Logs a click event for a content card. Call when the user taps a card
in your UI. Per Braze: only call when bypassing Braze's built-in
display module; the SDK's built-in renderer logs clicks automatically.

| Param         | Type                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazelogcontentcardclickoptions">BrazeLogContentCardClickOptions</a></code> |

--------------------


### logContentCardImpression(...)

```typescript
logContentCardImpression(options: BrazeLogContentCardImpressionOptions) => Promise<void>
```

Logs an impression for a content card. Call when a card scrolls into
view in your UI. Per Braze: only call when bypassing Braze's built-in
display module.

| Param         | Type                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazelogcontentcardimpressionoptions">BrazeLogContentCardImpressionOptions</a></code> |

--------------------


### registerPushToken(...)

```typescript
registerPushToken(options: BrazeRegisterPushTokenOptions) => Promise<void>
```

Hands a push registration token to the Braze SDK so the user can
receive Braze-orchestrated push notifications. **Native-only** —
the canonical wiring is:

  1. Consumer installs `@capacitor/push-notifications` alongside this
     plugin.
  2. Consumer calls `PushNotifications.requestPermissions()` and
     then `PushNotifications.register()`.
  3. In the `registration` listener, consumer forwards the token
     here via `Braze.registerPushToken({ token: event.value })`.

Platform behavior:
  - **iOS:** hex-decodes the APNs token and hands it to
    `braze.notifications.register(deviceToken:)`.
  - **Android:** assigns to `Braze.getInstance(context).registeredPushToken`
    (the SDK's setter for manual FCM token handoff).
  - **Web:** throws — Web Push uses VAPID + Service Worker
    subscriptions, with no token to register manually. See plugin
    MDC C03 for the divergence policy.

| Param         | Type                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazeregisterpushtokenoptions">BrazeRegisterPushTokenOptions</a></code> |

--------------------


### addListener('featureFlagsUpdated', ...)

```typescript
addListener(eventName: 'featureFlagsUpdated', listenerFunc: (event: BrazeFeatureFlagsUpdatedEvent) => void) => Promise<PluginListenerHandle>
```

Subscribes to feature flag updates. Fires whenever the Braze SDK
refreshes its feature flag cache — either automatically on session
open, manually via {@link BrazePlugin.refreshFeatureFlags}, or after
a server-driven sync. Initial state is not replayed when the
listener attaches; if you need the current snapshot, call
{@link BrazePlugin.getAllFeatureFlags} once after `addListener`.

| Param              | Type                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'featureFlagsUpdated'</code>                                                                          |
| **`listenerFunc`** | <code>(event: <a href="#brazefeatureflagsupdatedevent">BrazeFeatureFlagsUpdatedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('contentCardsUpdated', ...)

```typescript
addListener(eventName: 'contentCardsUpdated', listenerFunc: (event: BrazeContentCardsUpdatedEvent) => void) => Promise<PluginListenerHandle>
```

Subscribes to content card updates. Fires whenever the Braze SDK
refreshes its content card cache — either on session open, after
{@link BrazePlugin.requestContentCardsRefresh}, or after a
server-driven sync. Initial state is not replayed when the listener
attaches; call {@link BrazePlugin.getContentCards} once after
`addListener` if you need the current snapshot.

| Param              | Type                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'contentCardsUpdated'</code>                                                                          |
| **`listenerFunc`** | <code>(event: <a href="#brazecontentcardsupdatedevent">BrazeContentCardsUpdatedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

Removes all listeners registered via {@link BrazePlugin.addListener}.
Underlying native subscriptions stay alive (managed by the plugin)
so adding a listener again after `removeAllListeners` works without
an `initialize` cycle.

--------------------


### wipeData()

```typescript
wipeData() => Promise<void>
```

**Destructive.** Removes all locally stored Braze SDK data on the device,
including the device ID and any queued unsent events.

Typical use: GDPR Article 17 right-to-be-forgotten flow, or on user
logout. After wiping, you almost always also want to:
1. Call your backend's Braze REST `/users/delete` to remove server-side
   profile data.
2. Revoke the user's SDK Authentication signature.

See `SECURITY.md` §10 for the complete privacy flow.

Init-independent: safe to call before {@link BrazePlugin.initialize}.

--------------------


### disableSDK()

```typescript
disableSDK() => Promise<void>
```

Halts all data collection by the Braze SDK. No further events or
attributes are sent to Braze until {@link BrazePlugin.enableSDK} is called.

Typical use: user revokes marketing consent under GDPR/CCPA without
fully wiping their data.

Init-independent: safe to call before {@link BrazePlugin.initialize}.

--------------------


### enableSDK()

```typescript
enableSDK() => Promise<void>
```

Re-enables the Braze SDK after a {@link BrazePlugin.disableSDK} call.
No-op if the SDK was not previously disabled.

Init-independent: safe to call before {@link BrazePlugin.initialize}.

--------------------


### isDisabled()

```typescript
isDisabled() => Promise<BrazeIsDisabledResult>
```

Returns whether the SDK is currently disabled.

Init-independent: safe to call before {@link BrazePlugin.initialize}.

**Returns:** <code>Promise&lt;<a href="#brazeisdisabledresult">BrazeIsDisabledResult</a>&gt;</code>

--------------------


### requestImmediateDataFlush()

```typescript
requestImmediateDataFlush() => Promise<void>
```

Forces an immediate flush of any queued events to Braze. Normally Braze
batches network requests; this bypasses batching.

Useful for: (1) Layer 4 smoke testing where you want events to appear in
the dashboard immediately, (2) edge cases where app may be killed before
the next batch.

Requires {@link BrazePlugin.initialize} to have been called.

--------------------


### Interfaces


#### BrazeEchoResult

| Prop        | Type                | Description                                                          |
| ----------- | ------------------- | -------------------------------------------------------------------- |
| **`value`** | <code>string</code> | The same `value` passed in, returned by the native bridge unchanged. |


#### BrazeEchoOptions

| Prop        | Type                | Description                                               |
| ----------- | ------------------- | --------------------------------------------------------- |
| **`value`** | <code>string</code> | Arbitrary string round-tripped through the native bridge. |


#### BrazeInitializeOptions

Options passed to {@link BrazePlugin.initialize}.

`apiKey` is a **public Braze SDK API key** (the kind embedded in your app).
Never pass a REST API key here — they are different things. See `SECURITY.md` §1.

| Prop                          | Type                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apiKey`**                  | <code>string</code>  | Braze SDK API key (public).                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`endpoint`**                | <code>string</code>  | Braze SDK endpoint, e.g. `sdk.iad-03.braze.com`. Must be HTTPS in production. For mock-server testing, set {@link <a href="#brazeinitializeoptions">BrazeInitializeOptions.allowInsecureEndpoint</a>}.                                                                                                                                                                                                                                                                     |
| **`enableLogging`**           | <code>boolean</code> | Enable verbose SDK logging. Defaults to `false`. Never enable in production builds — Braze SDK logs include event payloads which may contain PII. See `SECURITY.md` §8.                                                                                                                                                                                                                                                                                                    |
| **`enableSdkAuthentication`** | <code>boolean</code> | Enable SDK Authentication (signed JWT validation). **Strongly recommended for production.** Without it, anyone with the public SDK API key can spoof events for arbitrary user IDs. See `SECURITY.md` §2 for the full design.                                                                                                                                                                                                                                              |
| **`allowInsecureEndpoint`**   | <code>boolean</code> | Allow non-HTTPS `endpoint`. Defaults to `false` and should remain so in production. Only set `true` for local mock-server testing per `SECURITY.md` §4.                                                                                                                                                                                                                                                                                                                    |
| **`sessionTimeoutInSeconds`** | <code>number</code>  | Session timeout in seconds. After this much inactivity, the SDK opens a new session on the next event. Braze's default across all three SDKs is 30 minutes (1800 seconds); supply a value here to override. Must be a positive integer; values ≤ 0 are rejected. Cross-platform note: Capacitor's plugin layer normalizes seconds across all three SDKs. The Android SDK's underlying setter takes milliseconds and the iOS SDK takes a TimeInterval; the bridges convert. |


#### BrazeChangeUserOptions

Options for {@link BrazePlugin.changeUser}. Identifies the current user to
Braze; subsequent events and attributes are attributed to this user.

| Prop                   | Type                | Description                                                                                                                               |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **`userId`**           | <code>string</code> | Your application's unique identifier for this user. Often an internal user ID; treat as PII even if it isn't directly readable as one.    |
| **`sdkAuthSignature`** | <code>string</code> | JWT signature generated by your backend, signed with your private key. Required when SDK Authentication is enabled. See `SECURITY.md` §2. |


#### BrazeGetUserIdResult

| Prop         | Type                        | Description                                                                                                                       |
| ------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **`userId`** | <code>string \| null</code> | The current external user ID, or `null` if the user is still anonymous (i.e. {@link BrazePlugin.changeUser} has not been called). |


#### BrazeSetSdkAuthenticationSignatureOptions

| Prop            | Type                | Description                                                                                                                                                                                                                                        |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`signature`** | <code>string</code> | New SDK Authentication signature (signed JWT) to push into the SDK. Used to rotate the signature when the previous one expires or when an `sdkAuthError` event has fired indicating the backend rejected the previous token. See `SECURITY.md` §2. |


#### BrazeSetEmailOptions

| Prop        | Type                        | Description                          |
| ----------- | --------------------------- | ------------------------------------ |
| **`email`** | <code>string \| null</code> | Email address. Pass `null` to clear. |


#### BrazeSetPhoneNumberOptions

| Prop              | Type                        | Description                                               |
| ----------------- | --------------------------- | --------------------------------------------------------- |
| **`phoneNumber`** | <code>string \| null</code> | Phone number, ideally E.164 format. Pass `null` to clear. |


#### BrazeSetFirstNameOptions

| Prop            | Type                        | Description                       |
| --------------- | --------------------------- | --------------------------------- |
| **`firstName`** | <code>string \| null</code> | First name. Pass `null` to clear. |


#### BrazeSetLastNameOptions

| Prop           | Type                        | Description                      |
| -------------- | --------------------------- | -------------------------------- |
| **`lastName`** | <code>string \| null</code> | Last name. Pass `null` to clear. |


#### BrazeSetLanguageOptions

| Prop           | Type                        | Description                                                 |
| -------------- | --------------------------- | ----------------------------------------------------------- |
| **`language`** | <code>string \| null</code> | ISO 639-1 language code, e.g. `"en"`. Pass `null` to clear. |


#### BrazeSetCountryOptions

| Prop          | Type                        | Description                                                         |
| ------------- | --------------------------- | ------------------------------------------------------------------- |
| **`country`** | <code>string \| null</code> | ISO 3166-1 alpha-2 country code, e.g. `"US"`. Pass `null` to clear. |


#### BrazeSetCustomUserAttributeOptions

| Prop        | Type                                                                | Description                                                                  |
| ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **`key`**   | <code>string</code>                                                 | Attribute key. Max length / character constraints enforced by Braze backend. |
| **`value`** | <code><a href="#brazeattributevalue">BrazeAttributeValue</a></code> | Attribute value. Use `setCustomUserAttribute` to remove via wipeData.        |


#### BrazeSubscriptionGroupOptions

| Prop          | Type                | Description                                                                                                        |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **`groupId`** | <code>string</code> | The Braze-issued UUID of the subscription group. Find it in the Braze dashboard under Subscription Group → API ID. |


#### BrazeAddAliasOptions

| Prop        | Type                | Description                                                |
| ----------- | ------------------- | ---------------------------------------------------------- |
| **`alias`** | <code>string</code> | Alias value. (alias, label) pairs are unique across users. |
| **`label`** | <code>string</code> | Label / namespace for this alias, e.g. `"internal_id"`.    |


#### BrazeGetDeviceIdResult

| Prop           | Type                | Description                                                       |
| -------------- | ------------------- | ----------------------------------------------------------------- |
| **`deviceId`** | <code>string</code> | The Braze SDK-assigned device identifier for the current install. |


#### BrazeSetDateOfBirthOptions

| Prop        | Type                | Description                  |
| ----------- | ------------------- | ---------------------------- |
| **`year`**  | <code>number</code> | Four-digit year.             |
| **`month`** | <code>number</code> | Month as 1-12 (January = 1). |
| **`day`**   | <code>number</code> | Day of month, 1-31.          |


#### BrazeSetGenderOptions

| Prop         | Type                                                | Description                                                       |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| **`gender`** | <code><a href="#brazegender">BrazeGender</a></code> | Gender value; see {@link <a href="#brazegender">BrazeGender</a>}. |


#### BrazeSetHomeCityOptions

| Prop           | Type                        | Description                      |
| -------------- | --------------------------- | -------------------------------- |
| **`homeCity`** | <code>string \| null</code> | Home city. Pass `null` to clear. |


#### BrazeLogCustomEventOptions

| Prop             | Type                                                                  | Description                                                         |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **`name`**       | <code>string</code>                                                   | Event name. Max length enforced by the Braze backend (~255 chars).  |
| **`properties`** | <code><a href="#brazeeventproperties">BrazeEventProperties</a></code> | Optional event properties. Braze accepts up to ~100 keys per event. |


#### BrazeLogPurchaseOptions

| Prop             | Type                                                                  | Description                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`productId`**  | <code>string</code>                                                   | Product identifier. Max ~255 chars, alphanumeric + punctuation. Cannot begin with `$`. Enforced by the Braze backend.                                                                                         |
| **`currency`**   | <code>string</code>                                                   | ISO 4217 currency code, e.g. `"USD"`. Required by the plugin even where the underlying Web SDK treats it as optional — having currency on every purchase keeps revenue analytics consistent across platforms. |
| **`price`**      | <code>number</code>                                                   | Per-unit price as a non-negative number in the currency's major units (dollars, not cents). The Android bridge wraps to `BigDecimal` internally.                                                              |
| **`quantity`**   | <code>number</code>                                                   | Number of units purchased. Defaults to `1`. Per Braze: integer in 1-100.                                                                                                                                      |
| **`properties`** | <code><a href="#brazeeventproperties">BrazeEventProperties</a></code> | Optional purchase properties (same shape as event properties).                                                                                                                                                |


#### BrazeGetFeatureFlagResult

| Prop       | Type                                                                  | Description                                                  |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| **`flag`** | <code><a href="#brazefeatureflag">BrazeFeatureFlag</a> \| null</code> | The flag, or `null` if no flag with this `id` is configured. |


#### BrazeFeatureFlag

| Prop             | Type                                                                                                                                | Description                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**         | <code>string</code>                                                                                                                 | Feature flag identifier as configured in the Braze dashboard.                                                                                                                                                                                                                                                                                         |
| **`enabled`**    | <code>boolean</code>                                                                                                                | Whether the flag is enabled for the current user.                                                                                                                                                                                                                                                                                                     |
| **`properties`** | <code><a href="#record">Record</a>&lt;string, <a href="#brazefeatureflagpropertyvalue">BrazeFeatureFlagPropertyValue</a>&gt;</code> | Map of property keys to typed property values. Empty for flags with no configured properties. Cross-platform note: on Android and Web the properties are the raw Braze wire format and arrive zero-conversion. On iOS the bridge serializes BrazeKit's typed property enum into the same shape; if you find an iOS-specific gap please file an issue. |


#### BrazeGetFeatureFlagOptions

| Prop     | Type                | Description              |
| -------- | ------------------- | ------------------------ |
| **`id`** | <code>string</code> | Feature flag identifier. |


#### BrazeGetAllFeatureFlagsResult

| Prop        | Type                            | Description                                        |
| ----------- | ------------------------------- | -------------------------------------------------- |
| **`flags`** | <code>BrazeFeatureFlag[]</code> | All feature flags configured for the current user. |


#### BrazeLogFeatureFlagImpressionOptions

| Prop     | Type                | Description                                                |
| -------- | ------------------- | ---------------------------------------------------------- |
| **`id`** | <code>string</code> | Feature flag identifier whose impression should be logged. |


#### BrazeGetContentCardsResult

| Prop              | Type                            | Description                                                        |
| ----------------- | ------------------------------- | ------------------------------------------------------------------ |
| **`cards`**       | <code>BrazeContentCard[]</code> | All cards currently cached for the user. Empty if not yet fetched. |
| **`lastUpdated`** | <code>number \| null</code>     | Last-refresh time as Unix epoch ms; `null` if never fetched.       |


#### BrazeClassicContentCard

Classic content card: title + description + optional image and click URL.
The most common card type.

| Prop               | Type                   | Description                                                    |
| ------------------ | ---------------------- | -------------------------------------------------------------- |
| **`type`**         | <code>'classic'</code> | Discriminator; narrow to a concrete card type with this field. |
| **`title`**        | <code>string</code>    |                                                                |
| **`description`**  | <code>string</code>    |                                                                |
| **`imageUrl`**     | <code>string</code>    |                                                                |
| **`url`**          | <code>string</code>    |                                                                |
| **`linkText`**     | <code>string</code>    |                                                                |
| **`clicked`**      | <code>boolean</code>   |                                                                |
| **`dismissed`**    | <code>boolean</code>   |                                                                |
| **`dismissible`**  | <code>boolean</code>   |                                                                |
| **`language`**     | <code>string</code>    |                                                                |
| **`altImageText`** | <code>string</code>    |                                                                |


#### BrazeCaptionedImageContentCard

Card with a large image, title, and description text.

| Prop               | Type                          | Description                                                    |
| ------------------ | ----------------------------- | -------------------------------------------------------------- |
| **`type`**         | <code>'captionedImage'</code> | Discriminator; narrow to a concrete card type with this field. |
| **`title`**        | <code>string</code>           |                                                                |
| **`description`**  | <code>string</code>           |                                                                |
| **`imageUrl`**     | <code>string</code>           |                                                                |
| **`url`**          | <code>string</code>           |                                                                |
| **`linkText`**     | <code>string</code>           |                                                                |
| **`aspectRatio`**  | <code>number \| null</code>   | Aspect ratio hint for image loading. `null` when not provided. |
| **`clicked`**      | <code>boolean</code>          |                                                                |
| **`dismissed`**    | <code>boolean</code>          |                                                                |
| **`dismissible`**  | <code>boolean</code>          |                                                                |
| **`language`**     | <code>string</code>           |                                                                |
| **`altImageText`** | <code>string</code>           |                                                                |


#### BrazeImageOnlyContentCard

Image-only card; no title or description.

| Prop               | Type                        | Description                                                    |
| ------------------ | --------------------------- | -------------------------------------------------------------- |
| **`type`**         | <code>'imageOnly'</code>    | Discriminator; narrow to a concrete card type with this field. |
| **`imageUrl`**     | <code>string</code>         |                                                                |
| **`url`**          | <code>string</code>         |                                                                |
| **`aspectRatio`**  | <code>number \| null</code> |                                                                |
| **`clicked`**      | <code>boolean</code>        |                                                                |
| **`dismissed`**    | <code>boolean</code>        |                                                                |
| **`dismissible`**  | <code>boolean</code>        |                                                                |
| **`language`**     | <code>string</code>         |                                                                |
| **`altImageText`** | <code>string</code>         |                                                                |


#### BrazeControlContentCard

Control card: represents a user enrolled in the control arm of a
content card multivariate test. Should be impression-logged but not
rendered as visible content.

| Prop       | Type                   | Description                                                    |
| ---------- | ---------------------- | -------------------------------------------------------------- |
| **`type`** | <code>'control'</code> | Discriminator; narrow to a concrete card type with this field. |


#### BrazeLogContentCardClickOptions

| Prop         | Type                | Description                              |
| ------------ | ------------------- | ---------------------------------------- |
| **`cardId`** | <code>string</code> | Identifier of the card the user clicked. |


#### BrazeLogContentCardImpressionOptions

| Prop         | Type                | Description                                        |
| ------------ | ------------------- | -------------------------------------------------- |
| **`cardId`** | <code>string</code> | Identifier of the card that was shown to the user. |


#### BrazeRegisterPushTokenOptions

| Prop        | Type                | Description                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`token`** | <code>string</code> | The platform-specific push token. On iOS this is the hex-encoded APNs device token (the same string that `@capacitor/push-notifications` emits in its `registration` event). On Android this is the FCM registration token. Web does not have a comparable concept (Web Push uses VAPID via the Push API + Service Worker, with no token to register manually); calling on web throws. |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### BrazeFeatureFlagsUpdatedEvent

Payload delivered to `'featureFlagsUpdated'` listeners. The full current
set of feature flags is included on every update; consumers should
treat this as a replacement, not a delta.

| Prop        | Type                            |
| ----------- | ------------------------------- |
| **`flags`** | <code>BrazeFeatureFlag[]</code> |


#### BrazeContentCardsUpdatedEvent

Payload delivered to `'contentCardsUpdated'` listeners. Same shape as
{@link <a href="#brazegetcontentcardsresult">BrazeGetContentCardsResult</a>}; the full current card set is
included on every update, not a delta.

| Prop              | Type                            |
| ----------------- | ------------------------------- |
| **`cards`**       | <code>BrazeContentCard[]</code> |
| **`lastUpdated`** | <code>number \| null</code>     |


#### BrazeIsDisabledResult

| Prop           | Type                 | Description                                                                  |
| -------------- | -------------------- | ---------------------------------------------------------------------------- |
| **`disabled`** | <code>boolean</code> | `true` if {@link BrazePlugin.disableSDK} has been called and not re-enabled. |


### Type Aliases


#### BrazeAttributeValue

Value types accepted by {@link BrazePlugin.setCustomUserAttribute} in v0.1.
Date and array support land in a later version per `SDK_SURFACE.md` §2.

Note: numeric values may surface in the Braze dashboard as floats. To
preserve integer vs. float distinction, send `{ value: 42 }` (no decimal)
for integers and `{ value: 42.0 }` (or any value with decimal) for floats —
the native bridge dispatches each type to the appropriate Braze SDK overload.

<code>string | number | boolean</code>


#### BrazeGender

Gender values mirrored from the Braze SDK enums (Web `User.Genders`,
Android `com.braze.enums.Gender`, iOS `Braze.User.Gender`).

<code>'male' | 'female' | 'other' | 'unknown' | 'not_applicable' | 'prefer_not_to_say'</code>


#### BrazeEventProperties

Map of event property names to primitive values.

<code><a href="#record">Record</a>&lt;string, <a href="#brazeeventpropertyvalue">BrazeEventPropertyValue</a>&gt;</code>


#### Record

Construct a type with a set of properties K of type T

<code>{ [P in K]: T; }</code>


#### BrazeEventPropertyValue

Property value types accepted by Braze custom events. v0.1 supports primitive
scalars (string / number / boolean). Date and array support land in a later
version per `SDK_SURFACE.md` §2.

<code>string | number | boolean</code>


#### BrazeFeatureFlagPropertyValue

Wire-format shape of a single Braze feature flag property. Matches the
Web SDK's `PropertiesJson` entry type so the web path is zero-conversion;
native bridges serialize their typed property values into this shape.

`'image'` is a URL string; `'datetime'` is a Unix timestamp in
milliseconds; `'jsonobject'` is a nested JSON object.

<code>{ type: 'string'; value: string } | { type: 'number'; value: number } | { type: 'boolean'; value: boolean } | { type: 'image'; value: string } | { type: 'datetime'; value: number } | { type: 'jsonobject'; value: <a href="#record">Record</a>&lt;string, unknown&gt; }</code>


#### BrazeContentCard

Tagged union over the four content card variants. Use the `type`
discriminator to narrow.

<code><a href="#brazeclassiccontentcard">BrazeClassicContentCard</a> | <a href="#brazecaptionedimagecontentcard">BrazeCaptionedImageContentCard</a> | <a href="#brazeimageonlycontentcard">BrazeImageOnlyContentCard</a> | <a href="#brazecontrolcontentcard">BrazeControlContentCard</a></code>

</docgen-api>

## Apps in this repo

| Dir | Purpose | Stack |
|---|---|---|
| [`example/`](./example/) | Developer testbed — every plugin method has a button | Vite + vanilla TS |
| [`demo/`](./demo/) | Fork-as-starter Capacitor + Braze reference app (restaurant ordering + e-commerce, mock backend) | Vite 6 + React 19 + Tailwind 4 + TanStack Router + Capacitor 6 |

## Documentation

| Doc | Purpose |
|---|---|
| [`PLAN.md`](./PLAN.md) | Strategy, market validation, phased roadmap, risks |
| [`SDK_SURFACE.md`](./SDK_SURFACE.md) | Complete Braze SDK capability catalog × plugin coverage |
| [`SECURITY.md`](./SECURITY.md) | Threat model + plugin design decisions for every security-sensitive surface |
| [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) | Quality bar + pre-release checklist |
| [`docs/mdcs/`](./docs/mdcs/) | Per-subsystem design contracts (MDCs) |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history |
| [`CLAUDE.md`](./CLAUDE.md) | AI developer guide for this repo |

## Native SDK versions

Pinned exactly per [release pinning policy](./SDK_SURFACE.md#4-native-sdk-pinning--bump-policy):

- `com.braze:android-sdk-ui` **42.2.0**
- `BrazeKit` / `BrazeUI` **14.1.0**
- `@braze/web-sdk` peer dep `^6.0.0`

## Platform setup

Two consumer-side requirements are non-optional because of how the underlying Braze SDKs are packaged. The full reference (rationale, error symptoms, future-bump policy) lives in [MDC C10 — Consumer integration requirements](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md).

### iOS — `ios/App/Podfile`

After `npx cap add ios`, edit the generated Podfile and set:

```ruby
platform :ios, '15.0'
use_frameworks! :linkage => :static
```

- `platform :ios, '15.0'` — BrazeKit 14.x requires iOS 15+; Capacitor's stock `13.0` will fail `pod install`.
- `use_frameworks! :linkage => :static` — BrazeKit ships as a static XCFramework; the stock dynamic-linkage `use_frameworks!` aborts the install with a `[!]` static-binary warning that's actually fatal.

See [`demo/ios/App/Podfile`](./demo/ios/App/Podfile) for the canonical working example.

### Android

No extra config required. Capacitor's stock `cap add android` template satisfies Braze's `minSdkVersion 21` floor automatically.

If you're using push, you'll also need a Firebase project + `google-services.json` — see [C10's Android push section](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md#android-push-setup-only-if-consumers-use-push).

### Web

`@braze/web-sdk` is a peer dependency. Install it alongside the plugin:

```bash
npm install capacitor-braze @braze/web-sdk
```

## Contributing

Issues and PRs welcome. Before opening either:
1. Check if the issue is a [Braze SDK issue](https://github.com/braze-inc/braze-android-sdk/issues) (route there if so).
2. Read [`CLAUDE.md`](./CLAUDE.md) for the project's conventions.
3. New methods require a scope decision in [`SDK_SURFACE.md`](./SDK_SURFACE.md#2-plugin-version-roadmap).

## License

[MIT](./LICENSE) © 2026 Bryce Aspinwall

## Disclaimer

This is a community plugin. It is not officially affiliated with, endorsed by, or supported by Braze, Inc. Braze, BrazeKit, BrazeUI, and related marks are property of Braze, Inc.
