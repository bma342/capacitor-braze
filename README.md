# capacitor-braze

> Capacitor 6/7 plugin wrapping the official Braze SDKs for Android, iOS, and Web. **On npm — `npm install capacitor-braze @braze/web-sdk`.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Capacitor 6 | 7](https://img.shields.io/badge/Capacitor-6%20%7C%207-blue.svg)](https://capacitorjs.com/)
[![npm](https://img.shields.io/npm/v/capacitor-braze.svg)](https://www.npmjs.com/package/capacitor-braze)
[![Unofficial](https://img.shields.io/badge/Unofficial-Personal%20Project-orange.svg)](#disclaimer)

> ### Disclaimer
>
> **This is an independent, personal open-source project by [Bryce Aspinwall](https://github.com/bma342). It is NOT made by, affiliated with, endorsed by, or supported by Braze, Inc.** "Braze" is a trademark of Braze, Inc.; the name appears here only to describe what this plugin wraps. For first-party SDKs and official support, go to [braze.com](https://www.braze.com/) or the [`braze-inc`](https://github.com/braze-inc) GitHub organization.
>
> This plugin is a thin Capacitor bridge layer around Braze's own public SDKs (which do all the real work). It is MIT-licensed, built on the side as a portfolio + personal-use project, and offered as-is. Issues and PRs are welcome but support is best-effort.

A community-maintained Capacitor plugin that exposes the Braze customer engagement SDKs to Capacitor apps with a single TypeScript API across iOS, Android, and Web.

## Why this exists

Braze ships first-party SDKs for native Android, iOS, Web, React Native, Flutter, Cordova, Expo, Unity, Xamarin, and Roku — but **not Capacitor**. Today's options for Capacitor teams are: ship the Cordova SDK via Capacitor's compat layer (broken push handoff in Capacitor 6+, deprecated upgrade path), use only the Web SDK (lose native push and in-app messages), roll a custom bridge (2–3 weeks of native work), or skip Braze. This plugin makes it `npm install` + ~10 lines.

See [`PLAN.md`](./PLAN.md) for the full strategic case, including [why not the Cordova plugin](./PLAN.md#why-not-just-use-braze-cordova-sdk-via-capacitors-cordova-compat-layer).

## Status

Snapshot at **0.2.0** (2026-09-22). This table drifts — `package.json`, `git log` and [`CHANGELOG.md`](./CHANGELOG.md) are the source of truth.

| Surface | State |
|---|---|
| **TypeScript API** | 35 methods + `addListener` / `removeAllListeners` for **5 events** (`featureFlagsUpdated`, `contentCardsUpdated`, `inAppMessageReceived`, `sdkAuthError`, `deepLinkReceived`) |
| **iOS bridge** (`BrazeKit` / `BrazeUI` 18.2.1) | Compiles and runs **35 XCTests** on every PR via the `verify-ios` CI job; `PrivacyInfo.xcprivacy` shipped via podspec `resource_bundles`. **Requires Xcode 26+** |
| **Android bridge** (`com.braze:android-sdk-ui` 43.2.0) | Compiles, runs **91 Robolectric/JUnit tests** and Android Lint on every PR via the `verify-android` CI job |
| **Web bridge** (`@braze/web-sdk` peer `^6.13.0`) | **205 vitest tests across 18 files in ~3.4s** against an in-process Fastify mock Braze server; 35/35 methods and every validation branch covered, with **measured** V8 coverage of `src/web.ts` at 97.38% statements/lines and 90.66% branches, ratcheted in CI — see [`docs/TEST-COVERAGE-AUDIT.md`](./docs/TEST-COVERAGE-AUDIT.md). One method (`registerPushToken`) is platform-divergent and throws on web by design (per [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md)) |
| **Developer testbed** (`example/`) | Every plugin method has a button; clicking invokes + logs |
| **Reference app** (`demo/`) | React 19 + Tailwind 4 + TanStack Router; restaurant ordering + e-commerce flows; iOS + Android Capacitor projects committed |
| **MDC design contracts** | [C01–C11](./docs/mdcs/) codify the patterns; CI gates enforce them |
| **CI** | 9 jobs in [`test.yml`](./.github/workflows/test.yml) plus 2 CodeQL analyses (`javascript-typescript`, `actions`) in [`codeql.yml`](./.github/workflows/codeql.yml); all GitHub Actions pinned to commit SHAs; release publishing gated on the full suite. `build-plugin` enforces a gzipped-ESM bundle budget of 20,480 B (measured 16,180 B at 0.2.0) |
| **Branch protection** | `main` requires the CI checks (strict), signed commits, no force pushes, no deletions. Admin enforcement, a release-tag ruleset and private vulnerability reporting are **maintainer steps not yet performed** — see [CONTRIBUTING → Maintainer pre-tag checklist](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020) |
| **Published to npm** | ✅ [`capacitor-braze`](https://www.npmjs.com/package/capacitor-braze) — `0.1.0` published 2026-05-22 (by hand, no provenance attestation). `0.2.0` is the first release published by the workflow with `--provenance` |
| **Smoke-tested against real Braze** | ❌ **Not yet.** The Layer 4 playbook and capture templates are staged in [`docs/smoke-tests/`](./docs/smoke-tests/) but have never been run — no claim in this repo is backed by a live Braze backend |
| **Capacitor 8** | ❌ Out of range. Peer dep is `^6.0.0 \|\| ^7.0.0` and the podspec is `>= 6.0, < 8.0`. Capacitor 8 needs AGP 8.13 / Gradle 8.14.3 / Kotlin 2.2.20 / compileSdk 36, and its CLI generates SPM iOS projects by default — a tracked follow-up, not a shipped capability |

See [`SDK_SURFACE.md` §2](./SDK_SURFACE.md#2-plugin-version-roadmap) for the version roadmap and what is still unshipped (banners, push-permission helpers, geofences, SPM, Capacitor 8).

### Known gaps in 0.2.0

Stated plainly so a reviewer does not have to find them:

- **No release has been validated against a live Braze backend.** Everything is verified against the in-tree mock server and the real SDKs' compile/runtime surface.
- **A value the Braze SDK rejects resolves rather than throwing.** `setEmail('nonsense')` resolves on every platform. Web and Android now log one non-PII warning — `Braze.<method>: the Braze SDK rejected the value (see SDK logs)`, byte-identical on both — and iOS reports nothing because BrazeKit 18.2.1's setters return `Void`. Turning a rejection into a thrown error is a cross-platform contract change deferred past 0.2.0, since iOS has no signal to reject on.
- **`deepLinkReceived` cannot intercept HTML in-app message iframes on web.** Their renderer never consults the SDK's click-action path. iOS and Android cover that channel; the full per-channel matrix is in [`SECURITY.md` §7](./SECURITY.md#7-deep-link-security). Capacitor's `server.allowNavigation` is the backstop and you should keep it set.
- **`inAppMessageReceived`'s end-to-end delivery test is web-only.** The mock server now returns real trigger envelopes, so the Web SDK's own trigger engine builds the message and the tests assert what a consumer's listener receives. On iOS and Android the DTO is still covered only at the serializer level, against real SDK message classes.
- **No coverage instrumentation on the native bridges.** The web bridge has a measured, ratcheted coverage number; the 91 Android and 35 iOS tests are counts, not coverage. JaCoCo / `-enableCodeCoverage` is a tracked follow-up.
- **CodeQL does not analyse Swift or Kotlin.** `javascript-typescript` and `actions` are analysed on every push and PR to `main` plus weekly; the native languages need a traced compile that would roughly double the `verify-ios` / `verify-android` runtime, so they are a deliberate deferral.

## Quick start

```bash
npm install capacitor-braze @braze/web-sdk
```

Then apply the **platform setup** below — [iOS](#ios--iosapppodfile) needs two Podfile lines and Xcode 26+, and [Android](#android--gradle-config) needs three Gradle bumps beyond Capacitor 6's stock template. Neither is optional; both are what the pinned Braze SDKs force. Full rationale in [MDC C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md).

```bash
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

### `initialize` options at a glance

| Option | Default | Effect |
|---|---|---|
| `apiKey` | — | **Required.** Your public Braze **SDK** key. Never a REST key — see [Security](#security). |
| `endpoint` | — | **Required.** Your Braze cluster host, e.g. `sdk.iad-03.braze.com`. HTTPS is enforced. |
| `enableSdkAuthentication` | `false` | Turns on SDK Authentication. `changeUser` then requires an `sdkAuthSignature`, enforced client-side on all three platforms. |
| `enableLogging` | `false` | `false` puts the Braze SDK at **errors-only**; `true` at verbose/debug. See [Logging](#logging-and-pii). |
| `allowInsecureEndpoint` | `false` | Permits `http://` endpoints. **Local mock-server testing only.** |
| `sessionTimeoutInSeconds` | SDK default | Must be a positive integer; a non-integer is rejected, not coerced. |
| `enableInAppMessageUI` | `true` | `false` keeps `inAppMessageReceived` firing but stops the plugin rendering, so you can present in-app messages yourself. |
| `enablePushAutomation` | `false` | **iOS only** (ignored on Android/Web). `true` hands notification opens, deep links, rich push and background push to BrazeKit, and registers Braze's notification categories. Because `initialize` runs after launch, a push that *launched* the app may not be attributed — initialize as early as you can. |
| `allowUserSuppliedJavascript` | `false` | **Web only** (ignored on iOS/Android — neither SDK has a counterpart). `true` lets Braze dashboard authors run JavaScript in your page **and** is what makes HTML in-app messages render on web. See [`SECURITY.md` §6](./SECURITY.md#6-in-app-message-xss-risk). |
| `deepLinkHandling` | `'sdk'` | `'app'` suppresses the SDK's own URL opening and emits [`deepLinkReceived`](#deep-link-interception) instead, so you vet and route every Braze URL yourself. |

The full reference, with `@example` blocks for every method and option, is in the [API reference](#api-reference) below.

## Security

The full threat model, per-surface design decisions and disclosure policy live in [`SECURITY.md`](./SECURITY.md). The five things a consumer most needs to get right:

### Which API key do I use?

The **SDK key** — the public, app-embedded identifier from your Braze dashboard (Settings → API Keys → *SDK* / *App Identifier*). **Never** a REST API key: those are server-only secrets and the plugin has no use for one. `initialize` makes no request that a REST key would authorize, and the plugin never logs, echoes or puts `apiKey` into an error string. See [`SECURITY.md` §1](./SECURITY.md#1-api-keys--public-sdk-keys-vs-secret-rest-keys).

### Should I enable SDK Authentication?

Yes, if you have a backend. Without it, anyone who extracts your (public) SDK key can write events and attributes against any `userId`. With `enableSdkAuthentication: true`, your server signs a short-lived JWT per user and the plugin refuses to call `changeUser` without one:

```
Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.
```

Signing is **your backend's job** — the plugin never sees a signing key. Braze documents the JWT claims, key generation and rotation in [SDK Authentication](https://www.braze.com/docs/developer_guide/sdk_authentication/). Rotate a signature mid-session with `setSdkAuthenticationSignature`, and subscribe to `addListener('sdkAuthError', …)` to learn when Braze rejected one. See [`SECURITY.md` §2](./SECURITY.md#2-sdk-authentication-signed-jwt).

### Content Security Policy for the Capacitor WebView

HTML in-app messages render inside a WebView with content authored in your Braze dashboard. The plugin's controls here are narrow and worth knowing exactly: `inAppMessageReceived` is observational and cannot block display, and `allowUserSuppliedJavascript` defaults to `false` — which on web means dashboard JavaScript cannot run in your page and HTML in-app messages do not render at all unless you pass `true`. iOS and Android ignore that option because neither SDK has a counterpart; their HTML campaigns render in a WebView the Braze SDK owns. Your real controls are dashboard hygiene and a CSP on the Capacitor WebView. A workable starting point, to be tightened for your app:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self' data: gap: https://ssl.gstatic.com;
           script-src 'self';
           connect-src 'self' https://*.braze.com https://*.braze.eu;
           img-src 'self' data: https:;
           style-src 'self' 'unsafe-inline';" />
```

`@braze/web-sdk` **6.13.0 or newer is the peer floor for a security reason**: 6.12.1 fixed a bug where an in-app message with multiple buttons could display even when one button used a `javascript:` or `data:` URI and `allowUserSuppliedJavascript` was disabled. Do not pin below it. See [`SECURITY.md` §6](./SECURITY.md#6-in-app-message-xss-risk).

### Deep link interception

By default the Braze SDK opens URLs from push, in-app messages and content cards itself. Pass
`deepLinkHandling: 'app'` and it doesn't — the plugin tells the SDK to stand down and hands you the
URL instead, so **nothing navigates unless your code navigates**. Not acting on the event is a
complete "deny"; there is no second call to make.

```ts
await Braze.initialize({ apiKey, endpoint, deepLinkHandling: 'app' });

await Braze.addListener('deepLinkReceived', ({ url, source, useWebView }) => {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.host)) {
    console.warn(`blocked a ${source} deep link`);
    return; // nothing opened it
  }
  if (useWebView) router.push(target.pathname);
  else window.open(url, '_blank');
});
```

`source` is `'inAppMessage' | 'push' | 'contentCard' | 'banner' | 'other'`. The decision is the
init-time mode rather than a per-URL veto because Capacitor listeners are fire-and-forget — a JS
listener has no return channel to native and cannot answer "allow" while the SDK waits.

Three things to know before you opt in, all of them in
[`SECURITY.md` §7](./SECURITY.md#7-deep-link-security) in full:

- **Opting in without a listener breaks every campaign CTA.** That is why the default is `'sdk'`.
- **Coverage is not uniform.** Web cannot intercept links inside an HTML in-app message's iframe,
  and Android content-card clicks are only covered when Braze's own feed UI renders the card.
  Keep Capacitor's `server.allowNavigation` set as the backstop either way.
- **On iOS the plugin takes `braze.delegate`**, which it otherwise leaves free for your app's
  `willPresentModalWithContext` / `noMatchingTriggerForEvent`. `sdkAuthError` is unaffected.

### Right to be forgotten (GDPR / CCPA)

`wipeData`, `disableSDK`, `enableSDK` and `isDisabled` are **init-independent** — they work before `initialize`, because a consent revocation during app launch must not depend on the SDK having booted (see [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md)). A deletion flow is:

```ts
await Braze.wipeData();   // clear local Braze data on this device
await Braze.disableSDK(); // stop all future collection until enableSDK()
```

Then issue a [Braze user-delete REST call](https://www.braze.com/docs/api/endpoints/user_data/post_user_delete/) from your backend for the server-side half. One platform caveat: on iOS, `wipeData()` called *before* `initialize` uses BrazeKit's `wipeDataAndDisableForAppRun()`, which disables the SDK for the rest of the app run — a subsequent `initialize` no-ops until the app relaunches. On web, `wipeData()` before `initialize` has nothing to wipe and returns without effect.

### Privacy declarations you must make

The plugin ships its own `PrivacyInfo.xcprivacy` declaring that **the bridge binary** tracks nothing and accesses no required-reason APIs. That covers the bridge only. Your app still has to declare what Braze collects:

- **App Store privacy label** — identifiers (user ID, device ID) and usage data (product interaction) under *Data Linked to You*; add contact info / sensitive info if you call `setEmail`, `setPhoneNumber` or `setDateOfBirth`.
- **Google Play Data Safety** — the same categories, plus the FCM token if you wire push.
- **iOS ATT / `NSUserTrackingUsageDescription`** — required if *your app* combines Braze data with third-party data for advertising. The plugin's manifest says the plugin doesn't track; that is not the same as your app not tracking.

Check the category list against [Braze's current data-collection disclosure](https://www.braze.com/docs/developer_guide/reference/) before you submit — it is Braze's SDK doing the collecting, and their disclosure is the authority. See [C10 → Privacy declarations](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md#privacy-declarations-you-must-make).

### Logging and PII

The bridge layer itself emits **no** log output containing user data on any platform — there is no plugin-owned log sink for PII to reach, and error strings quote argument *names*, never values. `enableLogging` controls the **Braze SDK's** verbosity:

| `enableLogging` | web | iOS | Android |
|---|---|---|---|
| `false` (default) | Web SDK logging off | BrazeKit log level `.error` | `BrazeLogger.logLevel = Log.ERROR` |
| `true` | Web SDK logging on | `.debug` | `BrazeLogger.VERBOSE` |

Two caveats the plugin cannot close: appending `?brazeLogging=true` to the page URL re-enables Web SDK logging regardless of this option, and an Android device-level system property can raise `BrazeLogger`'s verbosity independently. See [`SECURITY.md` §8](./SECURITY.md#8-logging--production-safe-by-default).

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
* [`addListener('inAppMessageReceived', ...)`](#addlistenerinappmessagereceived-)
* [`addListener('sdkAuthError', ...)`](#addlistenersdkautherror-)
* [`addListener('deepLinkReceived', ...)`](#addlistenerdeeplinkreceived-)
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

Resolving means the native SDK accepted the configuration. On web the
plugin checks the Web SDK's own success flag and rejects with
``Braze.initialize: the Braze Web SDK refused to initialize …`` when it
returns `false` (bad key, bad base URL, previously opted-out user, or a
crawler user-agent — which the SDK ignores by design). Note that
"previously opted out" includes a browser where {@link BrazePlugin.disableSDK}
was called and {@link BrazePlugin.enableSDK} has not been: on web the
opt-out marker persists across page loads, so re-enable before
initializing or the call rejects.

Calling `initialize` a **second time in the same process** behaves
differently per platform, because the underlying SDKs do:
  - **Web:** the plugin tears down and re-wires its event subscriptions
    exactly once, and rebuilds the underlying SDK (`destroy()` then
    initialize) only when an option the Web SDK fixes at construction —
    `apiKey`, `endpoint`, `enableLogging`, `enableSdkAuthentication`,
    `allowUserSuppliedJavascript`, `sessionTimeoutInSeconds` — actually
    changed, so switching workspace / API key at runtime still works.
    Keeping the instance when nothing changed preserves the server
    config the SDK only reads once per instance; rebuilding used to
    discard it mid-flight and silently gate every later
    {@link BrazePlugin.requestContentCardsRefresh} and
    {@link BrazePlugin.refreshFeatureFlags} until the next data round
    trip.
  - **iOS:** the bridge tears down subscriptions, presenters and
    delegates and constructs a fresh `Braze` instance with the new
    configuration.
  - **Android:** the Braze SDK keeps the configuration it was given
    first for the lifetime of the process. The call **resolves** (it is
    not an error — Activity recreation legitimately re-runs your web
    app's `initialize`), plugin-level state such as
    `enableSdkAuthentication` is updated, and the SDK logs a warning
    that the original configuration is retained. Changing API key or
    endpoint on Android requires a process restart.

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

Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetemailoptions">BrazeSetEmailOptions</a></code> |

--------------------


### setPhoneNumber(...)

```typescript
setPhoneNumber(options: BrazeSetPhoneNumberOptions) => Promise<void>
```

Sets the current user's phone number. E.164 format recommended.

Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetphonenumberoptions">BrazeSetPhoneNumberOptions</a></code> |

--------------------


### setFirstName(...)

```typescript
setFirstName(options: BrazeSetFirstNameOptions) => Promise<void>
```

Sets the current user's first name.

Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetfirstnameoptions">BrazeSetFirstNameOptions</a></code> |

--------------------


### setLastName(...)

```typescript
setLastName(options: BrazeSetLastNameOptions) => Promise<void>
```

Sets the current user's last name.

Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetlastnameoptions">BrazeSetLastNameOptions</a></code> |

--------------------


### setLanguage(...)

```typescript
setLanguage(options: BrazeSetLanguageOptions) => Promise<void>
```

Sets the current user's language. Use ISO 639-1 codes.

Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetlanguageoptions">BrazeSetLanguageOptions</a></code> |

--------------------


### setCountry(...)

```typescript
setCountry(options: BrazeSetCountryOptions) => Promise<void>
```

Sets the current user's country. Use ISO 3166-1 alpha-2 codes.

Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetcustomuserattributeoptions">BrazeSetCustomUserAttributeOptions</a></code> |

--------------------


### addToSubscriptionGroup(...)

```typescript
addToSubscriptionGroup(options: BrazeSubscriptionGroupOptions) => Promise<void>
```

Adds the current user to an email or SMS subscription group.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesubscriptiongroupoptions">BrazeSubscriptionGroupOptions</a></code> |

--------------------


### removeFromSubscriptionGroup(...)

```typescript
removeFromSubscriptionGroup(options: BrazeSubscriptionGroupOptions) => Promise<void>
```

Removes the current user from a subscription group.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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

Requires {@link BrazePlugin.initialize} to have been called. The accessor
is instance-bound on iOS (`braze.deviceId`) and Android
(`Braze.getInstance(context).deviceId`); only Web exposes a true static.
To keep the contract uniform across platforms (see C03 / C07) the plugin
gates this method behind the init guard on all three.

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

Unlike the standard string setters, date of birth **cannot be cleared**
in v0.1 — the three components are required. The underlying SDKs accept
a null-out form; exposing it is a deliberate v0.2+ scope decision, not
an oversight.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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

Like {@link BrazePlugin.setDateOfBirth} and unlike the standard string
setters, gender **cannot be cleared** in v0.1 — `null` is not accepted.
Use `'prefer_not_to_say'` or `'unknown'` to express absence.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesetgenderoptions">BrazeSetGenderOptions</a></code> |

--------------------


### setHomeCity(...)

```typescript
setHomeCity(options: BrazeSetHomeCityOptions) => Promise<void>
```

Sets the current user's home city. Pass `null` to clear.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazesethomecityoptions">BrazeSetHomeCityOptions</a></code> |

--------------------


### logCustomEvent(...)

```typescript
logCustomEvent(options: BrazeLogCustomEventOptions) => Promise<void>
```

Logs a custom event for the current user.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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
been dispatched, **not** once new flags arrive. React to fresh flags
with the `'featureFlagsUpdated'` listener, or re-read via
{@link BrazePlugin.getAllFeatureFlags} after a short delay. A refresh
that fails does not reject; the bridge logs a non-PII warning.

--------------------


### logFeatureFlagImpression(...)

```typescript
logFeatureFlagImpression(options: BrazeLogFeatureFlagImpressionOptions) => Promise<void>
```

Logs an impression for a feature flag. Per Braze, limited to one
impression per session per flag id.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

| Param         | Type                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#brazelogfeatureflagimpressionoptions">BrazeLogFeatureFlagImpressionOptions</a></code> |

--------------------


### getContentCards()

```typescript
getContentCards() => Promise<BrazeGetContentCardsResult>
```

Returns the content cards currently cached for the user. Reads from
the SDK's local cache; call {@link BrazePlugin.requestContentCardsRefresh}
to force a fetch. Cards the bridge cannot classify are dropped with a
console warning — see {@link <a href="#brazecontentcard">BrazeContentCard</a>}'s unknown-variant policy.

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
via {@link BrazePlugin.getContentCards} after a short delay. A refresh
that fails does not reject; the bridge logs a non-PII warning.

--------------------


### logContentCardClick(...)

```typescript
logContentCardClick(options: BrazeLogContentCardClickOptions) => Promise<void>
```

Logs a click event for a content card. Call when the user taps a card
in your UI. Per Braze: only call when bypassing Braze's built-in
display module; the SDK's built-in renderer logs clicks automatically.


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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


Resolves once the call has been handed to the Braze SDK — not once the
SDK accepted it. Braze validates server-side rules of its own (RFC-5322
emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
and silently drops what fails them. Where the SDK reports that, the web
and Android bridges emit a single non-PII `Braze.&lt;method&gt;: the Braze SDK
rejected the value (see SDK logs)` warning and still resolve; a rejected
value is logged, not thrown. Enable `enableLogging` at `initialize` to
see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
setters return `Void`.

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


### addListener('inAppMessageReceived', ...)

```typescript
addListener(eventName: 'inAppMessageReceived', listenerFunc: (event: BrazeInAppMessageReceivedEvent) => void) => Promise<PluginListenerHandle>
```

Subscribes to in-app message trigger events. Fires once per IAM
immediately before the SDK's presenter would display it.

**Observational only.** Listeners cannot block, delay, or veto display
— the plugin never withholds the message from the SDK's presenter. Use
the event for analytics, control-variant tracking, or to mirror the
message into your own UI. To take over presentation entirely, pass
`enableInAppMessageUI: false` to {@link BrazePlugin.initialize}; the
event still fires and nothing is drawn by the plugin.

The underlying native subscription is created by `initialize`, so a
listener added before `initialize` is silently inert until then (C05).
Messages the bridge cannot classify are dropped rather than reshaped —
see {@link <a href="#brazeinappmessage">BrazeInAppMessage</a>}'s unknown-variant policy.

| Param              | Type                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'inAppMessageReceived'</code>                                                                           |
| **`listenerFunc`** | <code>(event: <a href="#brazeinappmessagereceivedevent">BrazeInAppMessageReceivedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('sdkAuthError', ...)

```typescript
addListener(eventName: 'sdkAuthError', listenerFunc: (event: BrazeSdkAuthErrorEvent) => void) => Promise<PluginListenerHandle>
```

Subscribes to SDK Authentication error events. Fires when Braze's
backend rejects a request signed with the consumer's
`sdkAuthSignature` (expired JWT, rotated-out signing key, mismatched
user id). The standard response is to fetch a fresh signature from
the consumer's backend and push it back into the SDK via
{@link BrazePlugin.setSdkAuthenticationSignature}.

`userId` is `null` when the rejected request was for an anonymous user.

| Param              | Type                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'sdkAuthError'</code>                                                                   |
| **`listenerFunc`** | <code>(event: <a href="#brazesdkautherrorevent">BrazeSdkAuthErrorEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('deepLinkReceived', ...)

```typescript
addListener(eventName: 'deepLinkReceived', listenerFunc: (event: BrazeDeepLinkReceivedEvent) => void) => Promise<PluginListenerHandle>
```

Subscribes to deep links the Braze SDK was about to open.

**Only fires when `initialize` ran with `deepLinkHandling: 'app'`.** In
that mode the plugin suppresses the SDK's own URL opening first and
emits this event instead, so nothing navigates unless your handler
navigates. In the default `'sdk'` mode this listener never fires — the
SDK opens the URL directly and the plugin is not in the path.

Like every Capacitor listener this one is fire-and-forget: it cannot
return a decision to native. The decision is the init-time mode, and
"deny" is simply not acting on the event. See `SECURITY.md` §7 for the
per-platform, per-channel coverage matrix — notably, HTML in-app
message iframes on web are not covered.

| Param              | Type                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'deepLinkReceived'</code>                                                                       |
| **`listenerFunc`** | <code>(event: <a href="#brazedeeplinkreceivedevent">BrazeDeepLinkReceivedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

Removes all listeners registered via {@link BrazePlugin.addListener}.
The plugin's own SDK subscriptions stay alive, so adding a listener
again afterwards works without an `initialize` cycle.

The SDK subscriptions are torn down only by the lifecycle methods that
invalidate the SDK instance ({@link BrazePlugin.wipeData},
{@link BrazePlugin.disableSDK}, {@link BrazePlugin.enableSDK}); the next
`initialize` re-creates them. `removeAllListeners` is a JS-side
operation and never touches them (C05).

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

Init-independent: safe to call before {@link BrazePlugin.initialize} on
all three platforms — but what a *pre-init* wipe actually does differs,
and both divergences are SDK constraints the plugin cannot paper over:
  - **iOS:** falls back to `Braze.wipeDataAndDisableForAppRun()`, which
    wipes **and disables the SDK for the rest of this app run**. A
    subsequent `initialize` no-ops until the app is relaunched. Call
    `initialize` first if you need the SDK alive afterwards.
  - **Web:** the Braze Web SDK's storage manager does not exist before
    `initialize`, so a pre-init `wipeData()` **wipes nothing**; the SDK
    logs a warning and the promise resolves. Initialize first, then wipe.
  - **Android:** wipes normally; a later `initialize` works as usual.

Post-init on every platform the wipe is complete and the plugin resets
its own state, so the next call to any guarded method rejects with the
standard init-required error until you `initialize` again.

--------------------


### disableSDK()

```typescript
disableSDK() => Promise<void>
```

Halts all data collection by the Braze SDK. No further events or
attributes are sent to Braze until {@link BrazePlugin.enableSDK} is called.

Typical use: user revokes marketing consent under GDPR/CCPA without
fully wiping their data.

Init-independent: safe to call before {@link BrazePlugin.initialize} on
all three platforms.

**Web:** the Braze Web SDK destroys its instance as part of disabling,
so the plugin also drops its event subscriptions and clears its
initialized state. You must call {@link BrazePlugin.initialize} again
after {@link BrazePlugin.enableSDK} before any other method works.

--------------------


### enableSDK()

```typescript
enableSDK() => Promise<void>
```

Re-enables the Braze SDK after a {@link BrazePlugin.disableSDK} call.
No-op on native if the SDK was not previously disabled.

Init-independent on all three platforms. On iOS the plugin tracks a
pre-init disable locally and applies it when the `Braze` instance is
created, so enabling before `initialize` simply clears that flag.

**Web:** never a true no-op — the SDK's `enableSDK` destroys its
instance, so the plugin drops its subscriptions and clears its
initialized state. Call {@link BrazePlugin.initialize} again afterwards
(this is the Braze Web SDK's own documented requirement).
See `docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md`.

--------------------


### isDisabled()

```typescript
isDisabled() => Promise<BrazeIsDisabledResult>
```

Returns whether the SDK is currently disabled.

Init-independent on all three platforms. On iOS, where BrazeKit has no
class-level `isDisabled`, the plugin returns the locally tracked
pre-init flag (`false` unless {@link BrazePlugin.disableSDK} was called)
and reads `!braze.enabled` post-init. Uninitialized != disabled, by
convention. See `docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md`.

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

Platform behavior: on **web** the promise resolves when the SDK reports
the flush completed and **rejects** if the SDK reports it failed (the
queued data is retried on the next successful flush either way). On
**iOS** and **Android** the underlying SDK call is fire-and-forget, so
the promise resolves once the flush has been requested.

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

| Prop                              | Type                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apiKey`**                      | <code>string</code>                                                     | Braze SDK API key (public).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`endpoint`**                    | <code>string</code>                                                     | Braze SDK endpoint, e.g. `sdk.iad-03.braze.com`. Must be HTTPS in production. For mock-server testing, set {@link <a href="#brazeinitializeoptions">BrazeInitializeOptions.allowInsecureEndpoint</a>}.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`enableLogging`**               | <code>boolean</code>                                                    | Enable verbose SDK logging. Defaults to `false`. Never enable in production builds — Braze SDK logs include event payloads which may contain PII. See `SECURITY.md` §8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`enableSdkAuthentication`**     | <code>boolean</code>                                                    | Enable SDK Authentication (signed JWT validation). **Strongly recommended for production.** Without it, anyone with the public SDK API key can spoof events for arbitrary user IDs. See `SECURITY.md` §2 for the full design.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **`allowInsecureEndpoint`**       | <code>boolean</code>                                                    | Allow non-HTTPS `endpoint`. Defaults to `false` and should remain so in production. Only set `true` for local mock-server testing per `SECURITY.md` §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`sessionTimeoutInSeconds`**     | <code>number</code>                                                     | Session timeout in seconds. After this much inactivity, the SDK opens a new session on the next event. Braze's default across all three SDKs is 30 minutes (1800 seconds); supply a value here to override. Must be a positive integer; values ≤ 0 are rejected. Cross-platform note: the plugin contract uses seconds across all three platforms. iOS's underlying setter takes a `TimeInterval` (a `Double` of seconds); the iOS bridge casts. Android and Web take seconds directly with no conversion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`enableInAppMessageUI`**        | <code>boolean</code>                                                    | Whether the plugin installs Braze's own in-app message UI so triggered messages render without any consumer code. Defaults to `true`. Set `false` when your app presents in-app messages itself — the `'inAppMessageReceived'` listener still fires with the full message DTO, but nothing is drawn on screen by the plugin. **Listeners are observational and cannot block or veto display.** With `enableInAppMessageUI: true` the SDK's presenter shows the message regardless of what a listener does; the event is for analytics, control-variant tracking, or mirroring the message into your own UI. Platform behavior: - **iOS:** skips Braze's `BrazeInAppMessageUI` renderer and installs a non-rendering presenter that only emits the listener event. To render the message yourself from native code instead, assign your own presenter to `BrazePlugin.braze?.inAppMessagePresenter` after `initialize` resolves; that replaces the plugin's observer, and `inAppMessageReceived` stops firing (your `present(message:)` is the equivalent hook). - **Android:** skips `BrazeInAppMessageManager` registration, so a host app owns registration for its own Activities. - **Web:** the plugin subscribes but does not call the SDK's `showInAppMessage`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`enablePushAutomation`**        | <code>boolean</code>                                                    | Hands push handling (notification opens, deep links, rich push payloads, and background push) to BrazeKit's push automation. Defaults to `false`. **iOS only.** Android and Web ignore this option: on Android the Braze SDK's manifest-declared receiver already performs the equivalent work, and Web Push has no comparable concept. When `true`, the iOS bridge sets `configuration.push.automation = true` and registers Braze's notification categories with `UNUserNotificationCenter`. When `false` (the default) the plugin never touches the notification center, so an app with its own delegate keeps full control. **Attribution caveat:** `initialize` necessarily runs after app launch, so a push that *launched* the app may already have been delivered to the system before Braze is configured and may not be attributed. Call `initialize` as early as possible in your startup path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`allowUserSuppliedJavascript`** | <code>boolean</code>                                                    | Lets Braze dashboard users supply JavaScript that runs on your page. Defaults to `false`, and you should leave it there unless you have a specific reason not to. See `SECURITY.md` §6. **Web only.** The option maps 1:1 onto the Braze Web SDK's `InitializationOptions.allowUserSuppliedJavascript`, which the SDK documents as: *"By default, the Braze Web SDK does not allow user-supplied Javascript click actions, or enable HTML in-app messages and Banners"*. Turning it on therefore does two things at once: it permits `javascript:` / `data:` click-action URIs authored in the Braze dashboard, **and** it is what makes HTML in-app messages render on web at all (see {@link <a href="#brazehtmlinappmessage">BrazeHtmlInAppMessage</a>}). **iOS and Android ignore it**, and not because the plugin chose to drop it — neither native SDK has an equivalent switch. On iOS, `Braze.Configuration` at BrazeKit 18.2.1 exposes no such property (verified against the shipped `.swiftinterface`); HTML in-app messages are rendered by `BrazeInAppMessageUI` in a native `WKWebView` whose script bridge is BrazeKit's own, not arbitrary dashboard JavaScript injected into your app's WebView. On Android, `BrazeConfig.Builder` at `com.braze:android-sdk-ui` 43.2.0 likewise has no counterpart; HTML messages render in the SDK's own in-app-message HTML view. On both platforms the campaign HTML runs in a WebView the Braze SDK owns rather than in your Capacitor WebView, so the Web SDK's page-scope concern — dashboard JavaScript executing against your application's DOM and origin — has no native analogue to gate. The plugin passes the value straight through on web and never defaults it to `true` on your behalf. |
| **`deepLinkHandling`**            | <code><a href="#brazedeeplinkhandling">BrazeDeepLinkHandling</a></code> | Who opens URLs that Braze content (in-app messages, push, content cards) points at. Defaults to `'sdk'`. - `'sdk'` — today's behaviour and the Braze default: the SDK opens the URL itself, in your WebView or the system browser depending on how the campaign was authored. - `'app'` — the plugin **suppresses** the SDK's own URL opening and emits {@link <a href="#brazedeeplinkreceivedevent">BrazeDeepLinkReceivedEvent</a>} on the `'deepLinkReceived'` listener instead. Nothing navigates until your code navigates, so you can vet the URL against an allow-list and route it through your own router, `@capacitor/browser`, or `@capacitor/app`. This is an **init-time** switch rather than a per-URL veto because Capacitor listeners are fire-and-forget: a JS listener has no return channel back to native, so it cannot answer "allow" or "deny" while the native SDK waits. Choosing the mode up front is the only shape that can actually gate navigation. Per-platform and per-channel coverage differs — see `SECURITY.md` §7 for the full matrix, and {@link <a href="#brazedeeplinksource">BrazeDeepLinkSource</a>} for what `source` can be. In particular, web `'app'` mode covers slideup / modal / full in-app message clicks (message-level and button-level) and **cannot** intercept navigation from inside an HTML in-app message's iframe.                                                                                                                                                                                                                                                                                                                                                                               |


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

| Prop        | Type                                                                | Description                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`key`**   | <code>string</code>                                                 | Attribute key. Max length / character constraints enforced by Braze backend.                                                                                                                                                                                        |
| **`value`** | <code><a href="#brazeattributevalue">BrazeAttributeValue</a></code> | Attribute value. Must be a string, number, or boolean — `null` and `undefined` are rejected on all three platforms. There is no "clear one attribute" call in v0.1; use {@link BrazePlugin.wipeData} (or a server-side profile update) to remove stored attributes. |


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

| Prop               | Type                        | Description                                                                                                                                                                                             |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`type`**         | <code>'classic'</code>      | Discriminator; narrow to a concrete card type with this field.                                                                                                                                          |
| **`title`**        | <code>string</code>         |                                                                                                                                                                                                         |
| **`description`**  | <code>string</code>         |                                                                                                                                                                                                         |
| **`imageUrl`**     | <code>string</code>         |                                                                                                                                                                                                         |
| **`url`**          | <code>string</code>         |                                                                                                                                                                                                         |
| **`linkText`**     | <code>string</code>         |                                                                                                                                                                                                         |
| **`aspectRatio`**  | <code>number \| null</code> | Aspect ratio hint for the card's optional small image. `null` when the backend didn't supply one — which is the common case for classic cards, since the hint only matters before image load completes. |
| **`clicked`**      | <code>boolean</code>        |                                                                                                                                                                                                         |
| **`dismissed`**    | <code>boolean</code>        |                                                                                                                                                                                                         |
| **`dismissible`**  | <code>boolean</code>        |                                                                                                                                                                                                         |
| **`language`**     | <code>string</code>         |                                                                                                                                                                                                         |
| **`altImageText`** | <code>string</code>         |                                                                                                                                                                                                         |


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


#### BrazeInAppMessageReceivedEvent

Payload delivered to `'inAppMessageReceived'` listeners. Fires once
per IAM trigger, immediately before the SDK's presenter would display
the message. Listeners cannot block display — the plugin always
returns `DISPLAY_NOW` to the SDK after notifying — but they can read
the message contents for analytics, conditional UI changes, or
custom presentation overrides.

| Prop          | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`message`** | <code><a href="#brazeinappmessage">BrazeInAppMessage</a></code> |


#### BrazeSlideupInAppMessage

Sliding banner; auto-dismisses by default. No buttons.

| Prop               | Type                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`type`**         | <code>'slideup'</code>         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`message`**      | <code>string</code>            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`imageUrl`**     | <code>string</code>            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`imageAltText`** | <code>string</code>            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`language`**     | <code>string</code>            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`icon`**         | <code>string</code>            | Font Awesome glyph configured on the campaign, as the raw unicode string the Braze dashboard stores (the code point U+F042 for `fa-adjust`, for example — not the `"fa-adjust"` class name). Absent when the campaign has no icon. Braze renders either an image or an icon and prefers the image, so treat `icon` as a fallback for when `imageUrl` is absent. Cross-platform note: all three bridges emit this field when the SDK supplies it. iOS's `Braze.InAppMessage.Slideup` and Android's `IInAppMessage` both expose the same dashboard-configured value. |
| **`slideFrom`**    | <code>'top' \| 'bottom'</code> | Direction the banner slides from.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |


#### BrazeModalInAppMessage

Centered modal. `imageUrl` is optional; when present without `message`
text, treat as an image-only modal.

| Prop               | Type                                   |
| ------------------ | -------------------------------------- |
| **`type`**         | <code>'modal'</code>                   |
| **`header`**       | <code>string</code>                    |
| **`message`**      | <code>string</code>                    |
| **`imageUrl`**     | <code>string</code>                    |
| **`imageAltText`** | <code>string</code>                    |
| **`language`**     | <code>string</code>                    |
| **`buttons`**      | <code>BrazeInAppMessageButton[]</code> |


#### BrazeInAppMessageButton

A single button on a modal / full in-app message. Up to two per message.
Index 0 is conventionally the dismiss button; index 1 is the call-to-
action. Consumers reading the wire format should treat the order as
authoritative — the SDK doesn't expose dedicated `primary` / `secondary`
roles.

| Prop              | Type                                                                                  | Description                                                |
| ----------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **`id`**          | <code>number</code>                                                                   | Stable button identifier the SDK uses for click analytics. |
| **`text`**        | <code>string</code>                                                                   | Display text of the button.                                |
| **`clickAction`** | <code><a href="#brazeinappmessageclickaction">BrazeInAppMessageClickAction</a></code> | Action to perform when the button is tapped.               |


#### BrazeFullInAppMessage

Full-screen message. `imageUrl` is optional; when present without
`message` text, treat as an image-only full-screen.

| Prop               | Type                                   |
| ------------------ | -------------------------------------- |
| **`type`**         | <code>'full'</code>                    |
| **`header`**       | <code>string</code>                    |
| **`message`**      | <code>string</code>                    |
| **`imageUrl`**     | <code>string</code>                    |
| **`imageAltText`** | <code>string</code>                    |
| **`language`**     | <code>string</code>                    |
| **`buttons`**      | <code>BrazeInAppMessageButton[]</code> |


#### BrazeHtmlInAppMessage

Custom HTML rendered inside a WebView. `message` is the raw HTML; the
Braze SDK already sandboxes the WebView (no JS bridge unless the host
app opts in — see SECURITY.md §6).

**Platform note:** on web this variant only occurs when you opted in. The
Braze Web SDK gates HTML in-app messages behind its
`allowUserSuppliedJavascript` initialization option, which also lets Braze
dashboard users execute JavaScript on your page. The plugin exposes that
option as {@link <a href="#brazeinitializeoptions">BrazeInitializeOptions.allowUserSuppliedJavascript</a>} and
defaults it to `false` (C06: secure-by-default), so unless you pass
`allowUserSuppliedJavascript: true` an HTML campaign never renders on web
and never reaches the `'inAppMessageReceived'` listener. iOS and Android
render HTML campaigns unconditionally — neither native SDK has an
equivalent switch. See `SECURITY.md` §6.

**Deep links:** navigation originating *inside* the HTML message's
WebView / iframe is not covered by
{@link <a href="#brazeinitializeoptions">BrazeInitializeOptions.deepLinkHandling</a>} `'app'` mode on web,
because it never passes through the SDK's click-action path. It **is**
covered on iOS and Android, where the SDK routes it through the same
URL-opening hook as every other channel.

| Prop          | Type                |
| ------------- | ------------------- |
| **`type`**    | <code>'html'</code> |
| **`message`** | <code>string</code> |


#### BrazeControlInAppMessage

Control variant of an in-app message A/B test. Should be impression-
logged but not visually displayed (Braze's default presenter handles
this automatically).

| Prop       | Type                   |
| ---------- | ---------------------- |
| **`type`** | <code>'control'</code> |


#### BrazeSdkAuthErrorEvent

Payload delivered to `'sdkAuthError'` listeners. Fires when Braze's
backend rejects an SDK Authentication signature (expired, signed with
a rotated-out key, or signed for a different user). See
[`SECURITY.md` §2](./SECURITY.md) for the full design.

The standard response to an `sdkAuthError` event is for the consumer's
app to fetch a fresh signature from their backend and push it back
to the SDK via {@link BrazePlugin.setSdkAuthenticationSignature}.

| Prop               | Type                        | Description                                                                                                                                                                                                                                             |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`userId`**       | <code>string \| null</code> | External user id the failed request was authenticated for, or `null` when the request was made for an anonymous user (C03 forbids empty-string sentinels; `null` is the canonical "absent").                                                            |
| **`errorCode`**    | <code>number</code>         | Backend-supplied error code (Braze documents the value set).                                                                                                                                                                                            |
| **`errorReason`**  | <code>string</code>         | Human-readable description of why the signature was rejected.                                                                                                                                                                                           |
| **`signature`**    | <code>string \| null</code> | The signature that was rejected (truncate before logging).                                                                                                                                                                                              |
| **`errorEventId`** | <code>string \| null</code> | Reserved for a future support-correlation id. **Currently always `null` on every platform** — none of the three Braze SDKs surfaces such an id on their SDK-authentication error payloads. Declared now so populating it later isn't a breaking change. |


#### BrazeDeepLinkReceivedEvent

Payload delivered to `'deepLinkReceived'` listeners. Fires **only** when
`initialize` ran with `deepLinkHandling: 'app'`; in the default `'sdk'`
mode the SDK opens the URL itself and no event is emitted.

By the time this fires the plugin has already told the SDK not to open the
URL, so nothing will navigate unless your handler navigates. Dropping the
event is a complete, safe "deny" — there is no second call to make.

| Prop             | Type                                                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`url`**        | <code>string</code>                                                 | The URL the Braze SDK would have opened, verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`source`**     | <code><a href="#brazedeeplinksource">BrazeDeepLinkSource</a></code> | Which Braze channel the click came from.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`useWebView`** | <code>boolean</code>                                                | The SDK's in-app-WebView-vs-system-browser hint: `true` for an in-app WebView, `false` for the system browser. Non-nullable because every platform genuinely supplies it — this is not a default the plugin invented. iOS reads `Braze.URLContext.useWebView` (a non-optional `Bool`); Android reads `UriAction.useWebView` (a non-null `Boolean`); web derives it from the message's `openTarget`, which `@braze/web-sdk` 6.13.0 defaults to `'NONE'` in the `InAppMessage` constructor rather than leaving undefined, so `'BLANK'` → `false` and everything else → `true`. The mapping matches {@link <a href="#brazeinappmessageclickaction">BrazeInAppMessageClickAction</a>}'s `useWebView`. |


#### BrazeIsDisabledResult

| Prop           | Type                 | Description                                                                  |
| -------------- | -------------------- | ---------------------------------------------------------------------------- |
| **`disabled`** | <code>boolean</code> | `true` if {@link BrazePlugin.disableSDK} has been called and not re-enabled. |


### Type Aliases


#### BrazeDeepLinkHandling

Who opens Braze-authored URLs: the Braze SDK (`'sdk'`, the default) or
your app via the `'deepLinkReceived'` listener (`'app'`). See
{@link <a href="#brazeinitializeoptions">BrazeInitializeOptions.deepLinkHandling</a>}.

<code>'sdk' | 'app'</code>


#### BrazeAttributeValue

Value types accepted by {@link BrazePlugin.setCustomUserAttribute} in v0.1.
Date and array support land in a later version per `SDK_SURFACE.md` §2.

Note: JavaScript has a single `number` type, so the plugin cannot
distinguish integer-typed `42` from float-typed `42.0` at the bridge
boundary — they JSON-serialize identically. The native bridges
dispatch to whichever SDK overload preserves the value's runtime
shape: a fractional value (e.g. `42.5`) lands on the Double overload,
a whole-number value lands on the Int / Long overload. Braze's
dashboard treats both the same way for analytics aggregation, so
this normally doesn't matter for consumer code.

`null` and `undefined` are not accepted — the plugin rejects them
on all three platforms (use a wipe / clear flow if you need to
remove an attribute).

<code>string | number | boolean</code>


#### BrazeGender

Gender values mirrored from the Braze SDK enums (Web `User.Genders`,
Android `com.braze.enums.Gender`, iOS `Braze.User.Gender`).

<code>'male' | 'female' | 'other' | 'unknown' | 'not_applicable' | 'prefer_not_to_say'</code>


#### BrazeEventProperties

Map of event property names to primitive values.

All three bridges validate every value at the boundary and reject
non-scalars (nested objects, arrays, `null`) with
``Braze.&lt;method&gt;: `properties.&lt;key&gt;` must be string, number, or boolean.``
The check exists because TypeScript's narrowing is erased at runtime: a
property map that came from `JSON.parse` or `any`-typed code would
otherwise reach Braze intact on web/iOS and silently lose the offending
key on Android.

When more than one value is invalid, validation stops at the first one
(C04: one error, one message). *Which* key that is can differ by
platform — web and Android report the first in key order, iOS reports the
first in sorted key order because Swift dictionaries are unordered — so
treat the named key as "an" offender, not necessarily "the first one you
wrote".

<code><a href="#record">Record</a>&lt;string, <a href="#brazeeventpropertyvalue">BrazeEventPropertyValue</a>&gt;</code>


#### Record

Construct a type with a set of properties K of type T

<code>{
 [P in K]: T;
 }</code>


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

**Unknown-variant policy:** a card the bridge cannot classify into one of
these four variants (a card class added by a future Braze SDK, for
instance) is **dropped** rather than coerced into the closest-looking
variant, and the bridge emits a single non-PII
`console.warn('Braze: dropped an unrecognized content card variant')`.
Dropping keeps this union honest — narrowing on `type` never hands you a
fabricated card — at the cost of the card being invisible to the
consumer. The same policy applies to {@link <a href="#brazeinappmessage">BrazeInAppMessage</a>}.

<code><a href="#brazeclassiccontentcard">BrazeClassicContentCard</a> | <a href="#brazecaptionedimagecontentcard">BrazeCaptionedImageContentCard</a> | <a href="#brazeimageonlycontentcard">BrazeImageOnlyContentCard</a> | <a href="#brazecontrolcontentcard">BrazeControlContentCard</a></code>


#### BrazeInAppMessage

Tagged union over the five in-app message variants. Use the `type`
discriminator to narrow.

**Unknown-variant policy:** a message the bridge cannot classify into one
of these five variants is **dropped** — the `'inAppMessageReceived'` event
does not fire for it — and the bridge emits a single non-PII
`console.warn('Braze: dropped an unrecognized in-app message variant')`.
Earlier versions fabricated an empty `slideup`; that made
`message.type === 'slideup'` untrustworthy, so the policy now matches
{@link <a href="#brazecontentcard">BrazeContentCard</a>}. Display is unaffected: the SDK still renders the
message when `enableInAppMessageUI` is on.

<code><a href="#brazeslideupinappmessage">BrazeSlideupInAppMessage</a> | <a href="#brazemodalinappmessage">BrazeModalInAppMessage</a> | <a href="#brazefullinappmessage">BrazeFullInAppMessage</a> | <a href="#brazehtmlinappmessage">BrazeHtmlInAppMessage</a> | <a href="#brazecontrolinappmessage">BrazeControlInAppMessage</a></code>


#### BrazeInAppMessageClickAction

Click action variants for an in-app message or button. A click action of
`none` means no target; `url` means the SDK should open the given URI
(the SDK's `useWebView` hint indicates whether the consumer app's
embedded browser is preferred over the system browser).

<code>{ type: 'none' } | { type: 'url'; uri: string; useWebView: boolean }</code>


#### BrazeDeepLinkSource

Which Braze channel a deep link came from.

The set is the union of the two native SDKs' own channel enums —
BrazeKit's `Braze.Channel` (`notification` / `inAppMessage` /
`contentCard` / `banner`) and Braze Android's `com.braze.enums.Channel`
(`PUSH` / `INAPP_MESSAGE` / `CONTENT_CARD` / `BANNER` / `UNKNOWN`). The
plugin normalizes `notification` and `PUSH` to the same `'push'` value.

`'banner'` is reachable even though the plugin does not expose banners as
a DTO: if a host app renders a Braze banner through the native SDK, its
click still routes through the same URL hook, and reporting the real
channel beats coercing it into a wrong one. `'other'` covers Android's
`UNKNOWN` and any channel a future SDK adds.

<code>'inAppMessage' | 'push' | 'contentCard' | 'banner' | 'other'</code>

</docgen-api>

## Apps in this repo

| Dir | Purpose | Stack |
|---|---|---|
| [`example/`](./example/) | Developer testbed — every plugin method has a button | Vite + vanilla TS |
| [`demo/`](./demo/) | Fork-as-starter Capacitor + Braze reference app (restaurant ordering + e-commerce, mock backend) | Vite 6 + React 19 + Tailwind 4 + TanStack Router + Capacitor 6 |

`example/`'s native projects are **not** committed — generate them with `npx cap add ios|android` when you need them (see [`example/README.md`](./example/README.md)). `demo/`'s iOS and Android projects **are** committed, which is why CI and the local native gates build the demo.

## Local development & testing

Everything below runs on your machine with no Braze trial account required. The trial only matters for the Layer 4 smoke ([`docs/SMOKE-TEST-PLAYBOOK.md`](./docs/SMOKE-TEST-PLAYBOOK.md)), which has not been run.

### One-time setup

This repo does **not** use npm workspaces, so the test projects need their own installs:

```bash
git clone https://github.com/bma342/capacitor-braze
cd capacitor-braze
npm install
npm run build                                          # tsc + rollup + docgen
(cd test/mock-server && npm install)
(cd test/web && npm install)
```

### Fast loops (every PR)

```bash
npm test                              # 205 vitest behavioral tests vs. the Fastify mock
(cd test/web && npm run test:coverage) # same suite + V8 coverage, against ratcheted thresholds
npm run lint                          # eslint (10, flat config) + prettier --check + swiftlint
npm run fmt                           # auto-fix everything lint complains about
npm run typecheck:tests               # tsc --noEmit over test/mock-server + test/web
npm run pack:check                    # assert the npm tarball's contents
npm run build && node .github/scripts/assert-size.mjs   # gzipped ESM bundle budget
```

The vitest suite is the highest-signal local check. It boots a Fastify mock Braze server in-process on an ephemeral port, runs the Web SDK through it under jsdom, and captures every outbound HTTP request to assert wire format. If you change the web bridge, this is the gate.

### Native test tiers

```bash
# Android — 91 Robolectric/JUnit tests. Needs a JDK 21 and ANDROID_HOME.
cd demo/android && ./gradlew :capacitor-braze:testDebugUnitTest --no-daemon

# iOS — 35 XCTests. Needs Xcode 26+, CocoaPods, and the generated test target.
ruby scripts/ios-add-test-target.rb
cd demo/ios/App && pod install
xcodebuild test -workspace App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
  CODE_SIGNING_ALLOWED=NO
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md#running-the-tests) for the full procedure including prerequisites, and [C11](./docs/mdcs/C11-NATIVE-TEST-HARNESSES.md) for the harness design.

### Mock server, standalone

```bash
cd test/mock-server && npm run standalone    # prints the URL it bound to
```

Point `initialize({ endpoint: '<that host>', allowInsecureEndpoint: true })` at it to explore by hand.

### Example app (manual smoke of each method)

```bash
cd example
npm install
npm run dev                           # http://localhost:5173, one button per method
```

Open the page, click any plugin method button, watch the log panel for the result + any captured network call against the in-tree mock server.

### Demo app (realistic flows)

```bash
cd demo
npm install
npm run dev                           # http://localhost:5173, restaurant + e-commerce flows
```

For the native projects:

```bash
cd demo
npm run build && npx cap sync
npx cap open ios                      # Xcode opens; ⌘R to run on simulator
npx cap open android                  # Android Studio opens; Run to launch on emulator
```

### Native compile gates (matches CI)

The plugin's iOS Swift bridge and Android Kotlin bridge are compile-gated against the real Braze SDKs on every PR via the `verify-ios` and `verify-android` jobs in [`.github/workflows/test.yml`](./.github/workflows/test.yml). Both jobs also run that platform's unit tests. To reproduce locally:

```bash
# iOS: requires Xcode 26+ and CocoaPods. Compiles against BrazeKit 18.2.1.
cd demo/ios/App
pod install
xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO build

# Android: requires JDK 21 and Android SDK 35. Compiles against com.braze:android-sdk-ui 43.2.0.
cd demo/android
./gradlew :app:assembleDebug --no-daemon
```

> **Xcode 26 gotcha:** if your Xcode 26 install's iOS *simulator runtime* is older than its iOS SDK, `xcodebuild` reports **no simulator destinations at all** rather than a version error. Fix with `xcodebuild -downloadPlatform iOS`.

### Smoke wrappers (real Braze, manual)

```bash
BRAZE_API_KEY=<trial-key> npm run smoke:web
BRAZE_API_KEY=<trial-key> npm run smoke:ios
BRAZE_API_KEY=<trial-key> npm run smoke:android
```

These build the plugin, then drive the demo app against a real Braze workspace. **They have never been run** — the capture templates in [`docs/smoke-tests/`](./docs/smoke-tests/) are still empty.

### What is NOT yet locally testable

| Surface | Why | When |
|---|---|---|
| Native **integration** behavior (real HTTP wire format from iOS/Android) | The native tiers are unit/contract tests against the SDK's own model objects; the URLProtocol / MockWebServer intercept tier designed in [C11](./docs/mdcs/C11-NATIVE-TEST-HARNESSES.md) is not built | Tracked follow-up |
| Real Braze backend acceptance | Requires a Braze trial account; playbook in [`docs/SMOKE-TEST-PLAYBOOK.md`](./docs/SMOKE-TEST-PLAYBOOK.md) | Gate for the first *validated* release claim; 0.1.0 and 0.2.0 ship on mock-verified wire format only |
| `inAppMessageReceived` delivery path **on iOS / Android** | The web delivery path is covered end to end — the mock server returns real trigger envelopes and the Web SDK's own trigger engine builds the message. Reproducing that on the native tiers needs the C11 HTTP-intercept tier; the DTO itself is covered by serializer tests on all three platforms | Tracked follow-up |
| Coverage instrumentation on the native bridges | The Android and iOS suites report test counts, not coverage — JaCoCo (`testDebugUnitTest` + report task) and `xcodebuild -enableCodeCoverage` are not wired | Tracked follow-up |

## Documentation

| Doc | Purpose |
|---|---|
| [`PLAN.md`](./PLAN.md) | The original 2026-05 strategy document, preserved as history |
| [`SDK_SURFACE.md`](./SDK_SURFACE.md) | Complete Braze SDK capability catalog × plugin coverage |
| [`SECURITY.md`](./SECURITY.md) | Threat model + plugin design decisions for every security-sensitive surface |
| [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) | Quality bar + release checklist, with a dated readiness snapshot |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Dev setup, the method lockstep, release + maintainer checklists |
| [`docs/mdcs/`](./docs/mdcs/) | Per-subsystem design contracts (MDCs) C01–C11 |
| [`docs/audits/`](./docs/audits/) | Point-in-time self-audits (2026-05, 2026-09) with resolution status per finding |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history |
| [`CLAUDE.md`](./CLAUDE.md) | AI developer guide for this repo |

## Native SDK versions

Pinned exactly per the [pinning policy](./docs/mdcs/C08-NATIVE-SDK-PINNING.md):

- `com.braze:android-sdk-ui` **43.2.0**
- `BrazeKit` / `BrazeUI` **18.2.1** — requires **Xcode 26+**
- `@braze/web-sdk` peer dep **`^6.13.0`** (floor is a security floor — see [Security](#content-security-policy-for-the-capacitor-webview))

Distributed as **ESM** (`dist/esm`) and **CJS** (`dist/plugin.cjs.js`). There is no standalone browser bundle: the web bridge loads `@braze/web-sdk` through a dynamic `import()` of a bare specifier, which a `<script>` tag cannot resolve, so the Capacitor template's IIFE/`unpkg` artifact was removed in 0.2.0.

## Platform setup

Some consumer-side configuration is non-optional because of how the underlying Braze SDKs are packaged. The full reference (rationale, error symptoms, bump policy) lives in [MDC C10 — Consumer integration requirements](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md).

### iOS — `ios/App/Podfile`

**Xcode 26 or newer is required.** BrazeKit raised its Xcode floor to 26.0 at 15.0.0; this plugin pins 18.2.1.

After `npx cap add ios`, edit the generated Podfile and set:

```ruby
platform :ios, '15.0'
use_frameworks! :linkage => :static
```

- `platform :ios, '15.0'` — **this plugin's own deployment-target floor** (`CapacitorBraze.podspec` sets it), not BrazeKit's: BrazeKit 18.2.1 itself declares iOS 12. 15.0 is chosen to match Capacitor's modern floor. Capacitor 6's stock template ships `13.0`, which fails `pod install` against this plugin's podspec.
- `use_frameworks! :linkage => :static` — BrazeKit ships as a static XCFramework; the stock dynamic-linkage `use_frameworks!` aborts the install with a `[!]` static-binary message that is actually a fatal validation failure.

See [`demo/ios/App/Podfile`](./demo/ios/App/Podfile) for the canonical working example.

#### iOS push

Enable **Push Notifications** and **Background Modes → Remote notifications** in Xcode's Signing & Capabilities tab, then forward the APNs token from `@capacitor/push-notifications`:

```ts
import { PushNotifications } from '@capacitor/push-notifications';
import { Braze } from 'capacitor-braze';

PushNotifications.addListener('registration', ({ value }) => {
  Braze.registerPushToken({ token: value }); // hex string; the bridge decodes it
});
await PushNotifications.requestPermissions();
await PushNotifications.register();
```

That handles **registration** only — Braze records sends, but not opens. To also let BrazeKit handle notification opens, deep links, rich push and background push, pass `enablePushAutomation: true` to `initialize`. It is iOS-only and off by default, so an app with its own `UNUserNotificationCenter` delegate keeps full control until it opts in. It does **not** request permission for you (that stays with `@capacitor/push-notifications`), and it cannot retroactively attribute a push that launched the app before `initialize` ran.

### Android — Gradle config

Capacitor 6's stock template is **not** sufficient. Three edits are required, all forced by Braze's transitive androidx dependencies (the Braze AARs themselves declare `minCompileSdk=21` / `minAndroidGradlePluginVersion=1.0.0`, so the floor comes from androidx, not from Braze's own metadata):

```groovy
// android/build.gradle — bump AGP from Capacitor's stock 8.2.x
classpath 'com.android.tools.build:gradle:8.6.0'
classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0'
```

```groovy
// android/variables.gradle — bump compileSdk from Capacitor's stock 34
ext {
    minSdkVersion = 22
    compileSdkVersion = 35
    targetSdkVersion = 34
}
```

```properties
# android/gradle/wrapper/gradle-wrapper.properties — AGP 8.6.0 needs Gradle 8.7+
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-all.zip
```

Skipping them produces, respectively:

```
Dependency 'androidx.swiperefreshlayout:swiperefreshlayout:1.2.0' requires Android Gradle plugin 8.6.0 or higher.
Dependency 'androidx.recyclerview:recyclerview:1.4.0' requires libraries and applications that depend on it to compile against version 35 or later of the Android APIs.
```

Kotlin 2.2.0 is needed because Braze 43.x ships Kotlin 2.2.0 metadata that Kotlin 1.9.x cannot read. The plugin's own declared `minSdkVersion` default is **22**; your `variables.gradle` always wins. See [`demo/android/`](./demo/android/) for the canonical working example.

**Sessions are handled for you.** As of 0.2.0 the plugin registers `BrazeActivityLifecycleCallbackListener` on your `Application` once per process during `initialize` and opens a session for the host Activity — do **not** register your own, or sessions will be double-counted.

#### Android push

The plugin declares **no** `FirebaseMessagingService`, no Firebase dependency and no `<application>` entries at all, so it cannot collide with whatever you already have. That also means inbound push is entirely yours to wire. Add a Firebase project and `android/app/google-services.json`, apply the Google Services Gradle plugin, then pick **one** of these two paths.

**Path A — you have no `FirebaseMessagingService` of your own.** Register Braze's directly (this is Braze's documented Step 1):

```xml
<!-- android/app/src/main/AndroidManifest.xml, inside <application> -->
<service
    android:name="com.braze.push.BrazeFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

**Path B — you already have one** (for example because you also use `@capacitor/push-notifications`). Only one service can win the `com.google.firebase.MESSAGING_EVENT` intent filter, so do **not** add Braze's as well. Forward instead:

```kotlin
// android/app/src/main/java/<your-package>/AppFirebaseMessagingService.kt
import com.braze.Braze
import com.braze.push.BrazeFirebaseMessagingService
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AppFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        // Returns true when the message came from Braze and a notification was shown.
        if (!BrazeFirebaseMessagingService.handleBrazeRemoteMessage(this, remoteMessage)) {
            // Not a Braze message — hand it to your own / Capacitor handling.
        }
    }

    override fun onRegistered(installationId: String) {
        super.onRegistered(installationId)
        Braze.getInstance(this).registeredPushToken = installationId
    }
}
```

Braze also supports a **fallback service** instead of forwarding by hand — Braze's service stays registered and delegates non-Braze messages to yours. It needs both keys:

```xml
<bool name="com_braze_fallback_firebase_cloud_messaging_service_enabled">true</bool>
<string name="com_braze_fallback_firebase_cloud_messaging_service_classpath">com.company.OurFirebaseMessagingService</string>
```

**`android/app/src/main/res/values/braze.xml`** — notification presentation is configured here, not through this plugin's API. A small icon is effectively required: without one Braze falls back to your app icon, which usually looks wrong in the status bar.

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <drawable name="com_braze_push_small_notification_icon">@drawable/ic_notification</drawable>
    <drawable name="com_braze_push_large_notification_icon">@drawable/ic_notification_large</drawable>
    <integer name="com_braze_default_notification_accent_color">0xFFf33e3e</integer>
    <string name="com_braze_default_notification_channel_name">Notifications</string>
    <string name="com_braze_default_notification_channel_description">Offers and order updates</string>
</resources>
```

Note the element types: `<drawable>` with an `@drawable/…` reference for the icons, `<integer>` (or `<color>` with a `@color/…` reference) for the accent colour.

> **Braze 43.0.0 registers for FCM by itself** via the Firebase Installation ID when `firebase-messaging` ≥ 25.1.0 is present. That runs alongside the explicit `Braze.registerPushToken({ token })` handoff from `@capacitor/push-notifications` — pick one path rather than both. Braze's 43.0.0 changelog documents the opt-out as `com_appboy_firebase_cloud_messaging_registration_enabled` set to `false` in `appboy.xml` (the legacy resource spelling — Braze has not published a `com_braze_*` equivalent for this particular flag), plus `<meta-data android:name="firebase_messaging_installation_id_enabled" android:value="false" tools:replace="android:value" />` in your manifest. The `tools:replace` is required because Braze's own manifest sets it. Verify against [Braze's current Android push docs](https://www.braze.com/docs/developer_guide/push_notifications?sdktab=android) before relying on it; the plugin reads none of these resources, so nothing here is exercised by this repo's tests.

### Web

`@braze/web-sdk` is a peer dependency. Install it alongside the plugin:

```bash
npm install capacitor-braze @braze/web-sdk
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pod install`: *"required a higher minimum deployment target"* | Podfile still at Capacitor's stock `platform :ios, '13.0'` | Set `platform :ios, '15.0'` |
| `pod install`: `[!] … transitive dependencies that include statically linked binaries` | Dynamic `use_frameworks!` | Use `use_frameworks! :linkage => :static` |
| `xcodebuild`: *"Unable to find a destination matching the provided destination specifier"*, with no simulators listed | Xcode 26's iOS SDK is newer than any installed simulator runtime | `xcodebuild -downloadPlatform iOS` |
| Gradle: *"requires Android Gradle plugin 8.6.0 or higher"* / *"compile against version 35 or later"* | Capacitor's stock AGP 8.2.x / compileSdk 34 | Apply the three [Android edits](#android--gradle-config) |
| Kotlin: *"incompatible version of Kotlin"* while compiling Braze classes | Kotlin plugin < 2.2.0 | `classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0'` |
| `addListener` resolves but the callback never fires | Native subscriptions are created by `initialize`; a listener added earlier is inert, and events are never replayed | Call `initialize` first, then read current state with `getFeatureFlag` / `getContentCards` ([C05](./docs/mdcs/C05-LISTENERS.md)) |
| A second `initialize()` doesn't pick up the new `apiKey`/`endpoint` on Android | The Braze Android SDK keeps its first configuration for the process lifetime; the plugin resolves and logs a warning rather than failing | Restart the process, or configure once at startup |
| iOS: `initialize` appears to do nothing after a `wipeData()` | A pre-`initialize` `wipeData()` on iOS disables the SDK for the rest of the app run | Relaunch the app |
| Push campaigns show sends but no opens on iOS | Only token registration was wired | Pass `enablePushAutomation: true` to `initialize` |
| Android push: two `FirebaseMessagingService`s fighting for the intent filter | Only one service can win `com.google.firebase.MESSAGING_EVENT` | Use the forwarding recipe in [C10 → Android push](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md#android-push-setup-only-if-consumers-use-push) |
| `setEmail('nonsense')` resolves | Known gap: the Web SDK's rejection boolean is discarded (A1-10); iOS/Android log a warning | Validate before calling; see [Known gaps](#known-gaps-in-020) |

## Contributing

Issues and PRs welcome. Before opening either:

1. Check whether it is really a [Braze SDK issue](https://github.com/braze-inc/braze-android-sdk/issues) — the [issue templates](./.github/ISSUE_TEMPLATE/) route those upstream.
2. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev setup, the [method lockstep](./docs/mdcs/C01-METHOD-ANATOMY.md#the-lockstep-checklist), and how to run every test tier.
3. New methods require a scope decision in [`SDK_SURFACE.md`](./SDK_SURFACE.md#2-plugin-version-roadmap).

## License

[MIT](./LICENSE) © 2026 Bryce Aspinwall

## Disclaimer

This is a community plugin. It is not officially affiliated with, endorsed by, or supported by Braze, Inc. Braze, BrazeKit, BrazeUI, and related marks are property of Braze, Inc.
