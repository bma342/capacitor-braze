# Security Model — capacitor-braze

> The plugin's complete security posture. Read alongside [`PLAN.md`](./PLAN.md) (strategy) and [`SDK_SURFACE.md`](./SDK_SURFACE.md) (capability catalog). Every plugin design decision with security implications is documented here.
>
> **Unofficial plugin.** This is an independent, community-maintained Capacitor wrapper. NOT affiliated with or endorsed by Braze, Inc. For Braze's own security disclosures and SDK-level guarantees, see [braze.com/security](https://www.braze.com/security). This document covers only the plugin-layer security posture; the underlying Braze SDKs are responsible for everything they document themselves.

**Last updated:** 2026-09-22 (reconciled against the `0.2.0` implementation end to end — see [`docs/audits/2026-09/A4-security.md`](./docs/audits/2026-09/A4-security.md) for what changed and why).
**Disclosure:** see [§14](#14-vulnerability-disclosure-policy) below.

---

## 0. Threat model summary

The plugin sits between consumer Capacitor app code and Braze's native SDKs. The realistic threats:

| Threat | Surface | Severity |
|---|---|---|
| User identity spoofing (one user claims another's ID) | Identity layer | **High** — addressed via SDK Authentication |
| API key extraction from app bundle | Distribution | **Low** — Braze SDK keys are public-by-design |
| PII leakage via debug logs / crash reports | Plugin logging | **Medium** — the bridge emits no log line containing user data at all (§3), and `enableLogging: false` puts the Braze SDK at errors-only on every platform (§8) |
| Push token leaking to wrong endpoint | Push handoff | **Medium** — addressed via single-owner design |
| XSS via HTML in-app messages | IAM rendering | **Medium** — inherited from Braze. The plugin's role is **disclosure only**; your WebView CSP and Braze dashboard hygiene are the controls (§6) |
| Deep link redirection (open arbitrary URLs) | Push / IAM handlers | **Medium** — addressed via **Capacitor's** `server.allowNavigation` allow-list, which is Capacitor's control, not this plugin's. The plugin does not intercept deep links (§7) |
| Man-in-the-middle on SDK traffic | Network | **Low** — TLS-only; pinning optional |
| Background location abuse | Geofence module | **Medium** — opt-in only, not in v0.1 |
| Supply-chain attack on the plugin itself | npm publish | **High** — CI-gated publish, SHA-pinned Actions, provenance attestation, tarball manifest gate (§13). Note that the npm automation token bypasses 2FA by design; Trusted Publishing is the intended end state and is not yet configured |
| Insecure consumer integration patterns | Documentation | **High** (in aggregate) — addressed via the [README's Security section](./README.md#security) + this doc |

**Out of scope:** Braze backend security (SOC 2 etc.), the consumer app's own auth system, network attacks against Braze's infra, jailbroken/rooted device defense beyond standard SDK behavior.

---

## 1. API keys — public SDK keys vs. secret REST keys

This distinction is load-bearing. Get it wrong and you ship a credential leak.

### Braze has two kinds of keys

| Key type | Purpose | Sensitivity | Where it lives |
|---|---|---|---|
| **SDK API key** | Identifies the app to the SDK; sent with every client request | **Public** — Braze designs them to be visible in client apps | Mobile app bundle, web JS, config files |
| **REST API key** | Authorizes server-to-server calls (`/users/track`, `/campaigns/trigger`, etc.) | **Secret** — equivalent to a service account password | Server env vars only; **never** in client code |

### Plugin policy

- **The plugin accepts ONLY SDK API keys** in `initialize({ apiKey })`. SDK keys are designed to be embedded in client apps; this is normal Braze usage.
- **The plugin must NEVER expose, accept, or transport REST API keys.** If a consumer somehow passes a REST key, it doesn't change behavior (the SDK won't validate it) but they've now leaked a secret. Documentation explicitly warns against this and provides server-side guidance.
- The README's [Which API key do I use?](./README.md#which-api-key-do-i-use) section states this for consumers, and `src/definitions.ts`'s JSDoc on `apiKey` repeats it so it also lands in the generated API reference.

### What if SDK keys are extracted?

They will be. That's expected. A malicious user can pull the SDK key from any production app (mobile binary inspection, web JS view-source). What this enables:

- Logging fake events / attributes as **any user_id they know**.
- Subscribing to that app's push topic.

What it does NOT enable:

- Reading other users' data.
- Sending campaigns.
- Modifying the dashboard.
- Accessing REST API endpoints.

**Mitigation for the "fake events for any user_id" risk is SDK Authentication.** See §2.

---

## 2. SDK Authentication (signed JWT)

The primary defense against user-identity spoofing. Without it, anyone with the public SDK key can call `changeUser('victim@example.com')` and pollute that user's profile.

### How it works

```
┌──────────────┐                              ┌──────────────┐
│ Consumer's   │  1. login(creds)             │ Consumer's   │
│ Capacitor    │  ────────────────────────▶   │ backend      │
│ app          │                              │              │
│              │  2. { userId, jwt }          │ Signs JWT    │
│              │  ◀────────────────────────   │ with private │
│              │                              │ key          │
│              │                              └──────────────┘
│ Braze.change │
│ User({       │  3. POST /data/track         ┌──────────────┐
│   userId,    │     X-Braze-Auth: <jwt>      │ Braze        │
│   sdk Auth   │  ────────────────────────▶   │ backend      │
│   Signature  │                              │              │
│ })           │  4. Validate JWT signature   │ Public key   │
└──────────────┘     against public key       │ from         │
                                              │ dashboard    │
                                              └──────────────┘
```

### Plugin design

- **`Braze.initialize({ apiKey, endpoint, enableSdkAuthentication: true })`** — turns on signature requirement on the SDK side. Defaults to `false` (matching Braze's own default). The [README's Security section](./README.md#should-i-enable-sdk-authentication) recommends enabling it for any production app with real users.
- **`Braze.changeUser({ userId, sdkAuthSignature })`** — both params required when auth is enabled. Plugin validates `sdkAuthSignature` is non-empty string client-side before bridging.
- **`Braze.addListener('sdkAuthError', listener)`** — fires when Braze rejects a signature (expired, malformed, etc.). Consumer should refresh the JWT via their backend and call `Braze.setSdkAuthenticationSignature({ signature })`. (Live in v0.1.)
- **`Braze.setSdkAuthenticationSignature({ signature })`** — for in-session signature refresh. (Live in v0.1.)

### Server-side signing is the consumer's responsibility

The plugin cannot sign JWTs — that needs the consumer's private key, which must never be in an app
bundle. The plugin therefore has no signing code, no key handling, and no opinion about your
backend.

Braze documents the JWT claim structure, RS256 key generation, uploading the public key to the
dashboard, and rotating keys without downtime in
[SDK Authentication](https://www.braze.com/docs/developer_guide/sdk_authentication/). That is the
authority; this repo deliberately does not maintain a second copy of it that can drift.

What this repo does provide: the [README's Security section](./README.md#should-i-enable-sdk-authentication)
explains when to enable it, what the plugin enforces client-side, and how to recover from an
expired signature (`sdkAuthError` → fetch a new JWT → `setSdkAuthenticationSignature`).

### Failure modes

| Failure | What the plugin does |
|---|---|
| JWT expired | SDK enqueues retry, fires `sdkAuthError` event. Consumer refreshes. |
| JWT signature invalid (key rotated, wrong key) | SDK rejects request, fires `sdkAuthError`. Consumer must regenerate. |
| `enableSdkAuthentication: true` but `changeUser` called without signature | Rejected client-side before bridging, on all three platforms, with the byte-identical message ``Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.`` There is no plugin-specific error *class* — the plugin rejects with a plain `Error` carrying a C01-format message. Match on the message, not on a type. |
| Network failure during auth | SDK retries with cached signature. |

---

## 3. PII handling

### What counts as PII in Braze context

- Email, phone number, full name, date of birth, address fields.
- User ID (often itself PII when it's an email or stable identifier).
- Custom attributes containing PII (e.g., `last_4_credit_card`, `loyalty_member_id`).
- Custom event properties containing PII.

### Plugin rules

1. **The bridge layer emits no log output containing user data, on any platform.** This is stronger
   than masking and easier to verify: there is no plugin-owned sink for PII to reach. The handful of
   diagnostics the bridges do emit are a fixed set of non-PII strings — the endpoint cluster-shape
   warning (which logs the *pattern*, never the endpoint), "dropped an unrecognized in-app message /
   content card variant", a warning naming the *method* when the Braze SDK rejects an attribute
   value, and a warning that the Android SDK kept its first configuration on a second `initialize`.
   Masking helpers would be added alongside the first plugin-owned log line that could carry user
   data; today there is none. Verified by grep over `src/`, `ios/Sources/BrazePlugin/` and `android/src/main/`.
2. **Errors quote argument names, not values.** `` Braze.setEmail: `email` is required (string). ``
   — never the address. Enforced by the C01 message format and checked by the byte-exact
   error-string tests on all three platforms.
   *One deliberate exception:* a value drawn from a **closed, non-secret enum** may be echoed, because
   naming the rejected value is the only way to make the error actionable — `` Braze.setGender:
   unknown gender "<value>". `` The value is one of a fixed set the consumer chose from a documented
   list; it is not user data. See [C06](./docs/mdcs/C06-SECURITY-DEFAULTS.md) §4.
3. **Don't echo PII back from native to JS** beyond what the SDK returns. `getUserId()` passes the
   SDK's string through unchanged; the plugin does not transform, log, or persist it.
4. **`wipeData()` is destructive and is documented as such** — see the README's
   [right-to-be-forgotten flow](./README.md#right-to-be-forgotten-gdpr--ccpa) and §10 below.

### What the plugin does NOT do

- Encrypt PII at the plugin layer. Braze SDKs handle their own storage encryption (Android Keystore / iOS Keychain). Adding plugin-side encryption would be redundant and likely insecure.
- Hash PII before passing to Braze. Braze expects raw email/phone for matching; hashing client-side defeats Braze's segmentation.
- Collect or transmit PII beyond what the consumer explicitly passes.

---

## 4. Network security

### TLS

- Braze SDKs default to TLS 1.2+ for all network traffic. Plugin does not change this.
- The `endpoint` option accepts `http://` **only** when `allowInsecureEndpoint: true` is also passed, which exists for mock-server testing. The rejection message says so in as many words: ``Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` only for local mock-server testing. See SECURITY.md §4.`` **Never ship `allowInsecureEndpoint: true`.**
- `allowInsecureEndpoint` (default `false`) is the config gate, enforced on all three platforms with a strict `=== true` check. An `http://` endpoint is rejected at `initialize` unless it is explicitly set. Shipped in 0.1.0.

### Certificate pinning

- Braze Android SDK supports certificate pinning natively via OkHttp config. Braze Swift SDK does not directly; pinning would be done at the URLSession level.
- Plugin does NOT enable pinning by default. Pinning has real maintenance costs (Braze rotates certs) and benefits mostly enterprise threat models.
- v1.0 adds optional `certificatePins: string[]` init option for consumers who need it; documentation explains the rotation risk.

### Endpoint validation

The plugin parses the `endpoint` URL client-side at `initialize` on all three platforms and
**rejects**:

- a non-HTTPS endpoint, unless `allowInsecureEndpoint: true` was passed;
- a malformed URL. (Swift's `URL(string:)` and Java's `java.net.URI` are laxer than the WHATWG
  `URL` the web bridge uses, so native accepts a few strings web rejects. Cosmetic, not a
  security difference.)

It additionally **warns** — never errors — when the host does not look like a Braze cluster. As of
0.2.0 this runs on all three platforms (web `console.warn`, iOS `os.Logger`, Android
`BrazeLogger.w`), and it **does not log the endpoint value**, only the pattern it expected.

Matching is by **pattern**, not by a hardcoded list: `sdk.<region>-NN.braze.com` or `.braze.eu`,
with `localhost`, `127.0.0.1`, `*.test` and `*.local` exempt so mock-server testing is silent. A
fixed cluster list would need updating every time Braze adds a cluster and would produce false
warnings in the meantime; a pattern does not.

---

## 5. Push token security

Push tokens (APNs, FCM) are **not secret** but routing them to the wrong endpoint can:
- Send Braze-targeted pushes via a non-Braze provider (no-op, but confuses analytics).
- Leak the device's token to an analytics destination it shouldn't reach.
- Cause duplicate notifications (Braze and another provider both send).

### Plugin design: consumer always owns the token handoff

The plugin does NOT register for push notifications on the consumer's behalf. The consumer's app is expected to use a push-pipeline plugin it already owns — typically `@capacitor/push-notifications` — to request permission, receive the platform push token, and forward it to Braze via `Braze.registerPushToken({ token })`.

| Platform | Plugin behavior |
|---|---|
| iOS | `registerPushToken(token)` hex-decodes the APNs string to `Data` and hands it to `braze.notifications.register(deviceToken:)`. |
| Android | `registerPushToken(token)` assigns the FCM string to `Braze.getInstance(context).registeredPushToken`. |
| Web | `registerPushToken` rejects — Web Push has no token to register. |

There is no `enableAutomaticPushHandling` flag — the plugin is intentionally always in "consumer owns it" mode, because the auto-handoff path requires platform-specific manifest entries and delegate methods that a Capacitor host app already wires up via its primary push plugin.

### What the plugin does NOT do

- Log push tokens at any level.
- Persist push tokens outside the Braze SDK's own storage.
- Bridge tokens back to JS unless consumer explicitly calls `getPushToken()` (v0.5+).

---

## 6. In-app message XSS risk

Braze supports **HTML In-App Messages** rendered inside a WebView. The HTML content comes from the Braze dashboard, where customer marketing teams author it. If a marketing user (or compromised dashboard account) injects malicious HTML/JS, it executes in the consumer app's WebView context.

### What actually mitigates this

**The plugin's role here is disclosure only.** Be precise about what that means, because an earlier
version of this document claimed two controls the plugin does not have.

1. **`allowUserSuppliedJavascript` is exposed at `initialize` and defaults to `false`.** As of
   0.2.0 the plugin forwards the Web SDK's own flag, pinned to `false` unless you pass `true` —
   the plugin writes the `false` explicitly rather than omitting the key, so a future change to
   the SDK's default cannot silently enable dashboard JavaScript in an app that never asked for
   it. Enabling it does two things at once, and you are opting into both: it permits
   `javascript:` / `data:` click-action URIs authored in the Braze dashboard, **and** it is what
   makes HTML in-app messages render on web at all. Only turn it on if your Braze workspace has
   SSO plus campaign approval — the threat actor here is whoever can log into that workspace.

   **This flag is web-only, and that is an SDK fact rather than a plugin choice.** Neither
   `Braze.Configuration` at BrazeKit 18.2.1 nor `BrazeConfig.Builder` at
   `com.braze:android-sdk-ui` 43.2.0 has a counterpart (verified against the shipped
   `.swiftinterface` and the published AAR). On both native platforms an HTML campaign renders in
   a WebView the Braze SDK owns, not in your Capacitor WebView, so the Web SDK's page-scope
   concern — dashboard JavaScript executing against your application's DOM and origin — has no
   native analogue to gate. iOS and Android therefore ignore the option and render HTML campaigns
   unconditionally; the mitigations that matter there are items 3 and 4 below.
2. **`@braze/web-sdk` is floored at `^6.13.0`, and that is a security floor.** Web SDK 6.12.1 fixed
   a bug where an in-app message with multiple buttons could be displayed even when one of its
   buttons used a `javascript:` or `data:` URI and `allowUserSuppliedJavascript` was disabled — a
   bypass of exactly the toggle this section relies on. Do not pin below 6.13.0.
3. **Your WebView's Content Security Policy** is the real preventive control, and it is yours to
   set. A starting point is in the [README's Security section](./README.md#content-security-policy-for-the-capacitor-webview).
4. **Braze dashboard account hygiene** — HTML in-app message content is authored by whoever can log
   into your Braze workspace. SSO, least-privilege roles and campaign approval are the controls that
   address the actual threat actor in this section's threat model.

### What the plugin does NOT do

- **`addListener('inAppMessageReceived')` cannot block display.** It is observational. Capacitor
  listeners are fire-and-forget and have no return channel to native, so there is no way for a JS
  listener to answer "discard". All three bridges hand the message straight to the SDK's presenter
  (`.now` / `DISPLAY_NOW`) after notifying. `src/definitions.ts` says this on the listener itself.
  If you need to present in-app messages yourself, pass `enableInAppMessageUI: false` to
  `initialize` — the event still fires and the plugin draws nothing, so *you* decide what renders.
  That is the closest thing to a discard hook the plugin offers, and it is an all-or-nothing switch,
  not a per-message veto.
- **Sanitize in-app message HTML** — that would break legitimate Braze templates.
- **Block HTML in-app messages by default** — that would break a core Braze feature.

---

## 7. Deep link security

Push notifications, in-app messages and content cards can contain URLs that open when tapped.
Without controls, that is an open redirect into the WebView.

### What the plugin does

**`initialize({ deepLinkHandling: 'app' })` suppresses the SDK's own URL opening and hands you the
URL instead.** That is new in 0.2.0. The default is `'sdk'` — the SDK opens the URL itself, exactly
as before — so nothing changes unless you opt in.

In `'app'` mode the plugin tells the SDK not to open the URL *first*, then emits
`deepLinkReceived` with `{ url, source, useWebView }`. Nothing navigates unless your listener
navigates, so **not acting on the event is a complete "deny"**; there is no second call to make.

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

**The decision is the init-time mode, not a per-URL veto.** Capacitor listeners are fire-and-forget
and have no return channel to native, so a JS listener cannot answer "allow" or "deny" while the
native SDK waits on it. An earlier version of this section described exactly such a hook — an
`{ allow, replaceWith }` return contract — which was never built and could not have been. Choosing
the mode up front is the only shape that actually gates navigation.

### Per-platform, per-channel coverage

| Channel | iOS | Android | Web |
|---|---|---|---|
| In-app message body / button click | ✅ intercepted | ✅ intercepted | ✅ intercepted |
| HTML in-app message, link inside the campaign's own markup | ✅ intercepted | ✅ intercepted | ❌ **not intercepted** |
| Push notification open | ✅ intercepted (when BrazeKit routes the open — see below) | ✅ intercepted | n/a (no push on the web bridge) |
| Content card click | ✅ intercepted | ⚠️ only when Braze's own feed UI renders the card | ⚠️ consumer-rendered; you own the click |
| Banner click | ✅ intercepted | ✅ intercepted | n/a (banners are not in the plugin surface) |

The mechanism differs per platform, which is where the gaps come from:

- **iOS** installs a `BrazeDelegate` whose `braze(_:shouldOpenURL:)` returns `false`. That is
  BrazeKit's single URL-opening hook: every channel's `processClickAction` routes through it, so
  coverage is uniform. **Cost:** the plugin takes `braze.delegate`, which it deliberately leaves
  free in `'sdk'` mode so a host app can claim it for `willPresentModalWithContext` /
  `noMatchingTriggerForEvent` (2026-09 audit, A2-08). Opting into `'app'` mode is opting out of
  that slot. `sdkAuthError` is unaffected — it lives on the separate `sdkAuthDelegate`.
  **Push caveat:** BrazeKit only routes notification opens when `enablePushAutomation: true`. With
  it off (the default) your own `UNUserNotificationCenter` delegate owns the tap, and the plugin is
  not in that path at all — which is its own, stronger form of control.
- **Android** installs a custom `IBrazeDeeplinkHandler` via
  `BrazeDeeplinkHandler.setBrazeDeeplinkHandler` that does not execute the `UriAction`. `gotoUri`
  is the funnel every channel uses, verified at `com.braze:android-sdk-ui` 43.2.0 by the classes
  that call it: `BrazeNotificationUtils` (push opens), `DefaultInAppMessageViewLifecycleListener`
  and `DefaultInAppMessageWebViewClientListener` (in-app message body, button and HTML-iframe
  clicks), `BaseCardView` / `BrazeContentCardUtils` (content-card clicks),
  `DefaultBannerWebViewClientListener` (banners), and the Braze Actions steps
  `OpenLinkInWebViewStep` / `OpenLinkExternallyStep`. **Content-card caveat:** those two card
  classes are Braze's *own* feed UI. A Capacitor app that renders cards itself from
  `getContentCards()` never goes through them — you navigate, so you gate.
  The handler is process-global, so the plugin captures the handler it replaced and restores it on
  `wipeData`, on Activity destruction, and on a re-`initialize` that drops the option.
- **Web** rewrites the message's and each button's `clickAction` from `URI` to `NONE` before the
  SDK presents it, and emits the event from the SDK's own clicked-event subscribers. That covers
  slideup, modal and full-screen messages. **It does not cover HTML in-app messages:** their
  renderer (`html-message-to-html.js`) never consults `clickAction`, and navigation from inside the
  iframe goes through Braze's `brazeBridge`, which the plugin is not in the path of. HTML campaigns
  are also off by default on web — they require `allowUserSuppliedJavascript: true` (§6). Content
  cards on web are consumer-rendered and push does not exist on the web bridge, so neither is a
  gap so much as "not the plugin's to intercept".

### What still controls this regardless of mode

- **Capacitor's `server.allowNavigation`** allow-list in `capacitor.config.ts` governs which hosts
  the WebView may navigate to. This is Capacitor's control, not this plugin's, and it applies
  whether or not Braze is involved — including to the gaps in the table above. **Set it.** It is
  the backstop, and `deepLinkHandling: 'app'` does not replace it.
- **`enablePushAutomation` (iOS) is off by default**, as described above.
- **Braze dashboard hygiene** — the URL in a campaign is authored by whoever can log into your
  workspace, the same threat actor as §6.

---

## 8. Logging — production-safe by default

Braze's SDKs are verbose when logging is on: request payloads (events, attributes, sometimes PII),
response bodies, internal SDK state. Useful in development; dangerous in production.

### Plugin policy

`initialize({ enableLogging })` defaults to `false`, and as of 0.2.0 `false` genuinely means
errors-only on every platform. It previously did not on either native platform: iOS set BrazeKit's
`.info` level (the second-most-verbose) and Android only ever set the *verbose* branch, leaving the
SDK at its INFO default.

| `enableLogging` | web | iOS | Android |
|---|---|---|---|
| `false` (default) | Web SDK logging off | BrazeKit log level `.error` | `BrazeLogger.logLevel = Log.ERROR` |
| `true` | Web SDK logging on | `.debug` | `BrazeLogger.VERBOSE` |

Android sets the level in **both** branches, so the setting is reversible across a
re-initialization; the older `enableVerboseLogging()` call it replaced was one-way for the process.

### The plugin's own diagnostics

The bridge emits a small fixed set of non-PII warnings (see §3). They are **not** gated on a build
flavour or `NODE_ENV`: the endpoint cluster-shape warning in particular fires in production
deliberately, because a misconfigured endpoint in a shipped app is worth one console line, and the
line contains the expected *pattern*, never the endpoint the consumer typed.

### Two caveats the plugin cannot close

1. **Web: `?brazeLogging=true` in the page URL re-enables Web SDK logging** regardless of
   `enableLogging: false`. This is a Braze Web SDK feature and the plugin has no hook to suppress
   it. `braze.setLogger()` exists as a mitigation the plugin does not currently wire; if that
   matters to your threat model, call it on the SDK directly after `initialize`.
2. **Android: a device-level system property can raise `BrazeLogger`'s verbosity** independently of
   this option (`BrazeLogger` reads a log-level system property, and exposes
   `checkForSystemLogLevelProperty`). Relevant on rooted or developer devices and in MDM fleets.
   "Production-safe by default" means *by default on a normal device*, not *unbypassable*.

---

## 9. Geofence & location permissions

The `BrazeLocation` / `android-sdk-location` modules require background location permission, which:
- iOS: requires "Always Allow" location, which App Store reviewers scrutinize.
- Android: requires `ACCESS_BACKGROUND_LOCATION`, with stricter Play Store policy each year.
- Both: privacy-sensitive; should not be requested for apps that don't actually need geofence-driven messaging.

### Plugin policy

- Geofence support is **NOT in v0.1**. Deferred to v0.5 and gated behind opt-in install.
- Consumer must explicitly install `capacitor-braze-location` (a separate sub-package, v0.5+) to pull the geofence module. Base plugin does not transitively depend on it.
- Geofences are **not shipped** in any version of this plugin, so there is no consumer-facing decision to document yet. If `capacitor-braze-location` is ever built, the README gains that section in the same release. The `android-sdk-ui` artifact this plugin depends on does not pull Braze's location module.

This is intentional friction. Most consumers don't need geofences; defaulting to opt-in keeps everyone else free of the permission overhead.

---

## 10. Data privacy methods — exposing GDPR / CCPA tools

Braze's SDKs provide three methods that map to legal privacy rights:

| Method | Purpose | Legal mapping |
|---|---|---|
| `wipeData()` | Deletes all local Braze data on the device | GDPR Article 17 (Right to Erasure) — partial; consumer also calls REST API to delete from Braze backend |
| `disableSDK()` | Halts all data collection | GDPR right to object; CCPA opt-out |
| `enableSDK()` | Re-enables after `disableSDK` | Re-opt-in flow |
| `addToSubscriptionGroup()` / `removeFromSubscriptionGroup()` | Granular consent per channel/group | GDPR consent under Article 7; CCPA granular opt-out |

### Plugin policy

- All of them shipped in **0.1.0**. `wipeData`, `disableSDK`, `enableSDK` and `isDisabled` are
  **init-independent** per [C07](./docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md): a consent revocation
  during app launch must not depend on the SDK having booted.
- The README's [Right to be forgotten](./README.md#right-to-be-forgotten-gdpr--ccpa) section shows
  the complete pattern: `wipeData()` locally, then the consumer's backend calling Braze's
  `/users/delete` REST endpoint, then revoking that user's SDK Authentication signature.
- **`wipeData()` is local only.** Behavioral events already delivered to Braze — custom events,
  sessions, campaign interactions, purchases — are retained server-side per Braze's policy. The REST
  delete is what purges them. Both the README and the `wipeData` JSDoc say so.
- **Two platform caveats**, both documented in the `wipeData` JSDoc and C07: on iOS a `wipeData()`
  called *before* `initialize` uses BrazeKit's `wipeDataAndDisableForAppRun()`, which disables the
  SDK for the rest of the app run (a later `initialize` no-ops until relaunch); on web a pre-`initialize`
  `wipeData()` has no storage manager to act on and returns without effect.

---

## 11. Consent / regulatory pathways

The plugin is a **data conduit**, not a consent manager. Consent collection, withdrawal tracking, regional compliance logic, and audit trails are the consumer's responsibility.

### What the plugin guarantees

- **No data is sent to Braze before `initialize()` is called.** Consumer can defer init until consent is granted.
- **`disableSDK()` immediately halts outbound network traffic.** No events queued before the call are sent after.
- **`wipeData()` removes all local SDK storage.** Including device ID, attribute cache, event queue.
- **No third-party SDKs are loaded.** Plugin pulls only Braze SDKs; no analytics, no advertising, no telemetry.

### What the plugin does NOT do

- Detect user's region for GDPR / CCPA scoping.
- Manage consent state — that's the consumer's CMP (Consent Management Platform).
- Distinguish between consent types (functional vs. marketing vs. analytics).

### Recommended consumer pattern (documented)

```ts
// Wait for consent before initializing Braze
const consent = await getMyCmpConsent();
if (consent.marketing) {
  await Braze.initialize({ apiKey, endpoint, enableSdkAuthentication: true });
  await Braze.changeUser({ userId, sdkAuthSignature });
}

// Later, if user revokes consent
await Braze.disableSDK();
await Braze.wipeData();
```

---

## 12. Dependency security

### Plugin's own dependencies

- **Direct runtime deps:** Braze SDKs only, one per platform — `@braze/web-sdk` (peer, `^6.13.0`),
  `com.braze:android-sdk-ui` (43.2.0, exact), `BrazeKit` + `BrazeUI` (18.2.1, exact). No other
  runtime npm, Maven or CocoaPods package. `npm audit --omit=dev` is clean.
- **Dev deps:** Capacitor's standard plugin scaffold — TypeScript, Rollup, ESLint, Prettier,
  `@capacitor/docgen`, SwiftLint — plus **vitest** for the web behavioral tests and **Fastify** for
  the in-process mock Braze server. There is no Jest, no Ktor and no Maestro anywhere in this repo,
  despite what earlier versions of this document said.
- **Dependabot** watches five directories on a weekly schedule: the plugin's own dev deps (`/`),
  `/example`, `/demo`, `/test/web`, `/test/mock-server`, plus `github-actions`. It does **not**
  bump the pinned Braze SDK versions — those move by hand under the
  [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) bump protocol — and `@capacitor/*` majors are
  ignored, because a Capacitor major is a deliberate migration.

### What actually scans this repo

| Scanner | Where | Status |
|---|---|---|
| `npm audit --audit-level=high --omit=dev` | `audit` job, every push and PR | **Runs, and fails the build** on a high/critical advisory in the runtime tree |
| **gitleaks** | `audit` job, full history (`fetch-depth: 0`) | **Runs.** Catches a committed Braze key before it reaches `main` |
| **CodeQL (SAST)** — `javascript-typescript` | `codeql.yml`, every push + PR to `main`, plus Mondays 05:27 UTC | **Runs**, `build-mode: none`. Results land in the Security tab |
| **CodeQL (SAST)** — `actions` | same workflow | **Runs.** Analyses these workflow files for injection into `run:` blocks and over-broad permissions |
| **GitHub secret scanning + push protection** | Repository setting | **Enabled** |
| **Dependabot version updates** | `.github/dependabot.yml` | **Enabled**, six ecosystems (`/`, `/example`, `/demo`, `/test/web`, `/test/mock-server`, `github-actions`) |
| **Tarball manifest gate** | `pack-check` job, `.github/scripts/assert-pack.mjs` | **Runs.** Asserts every consumer-required artifact is published and no repo-internal tree leaks into the package |
| **Bundle-size budget** | `build-plugin` job, `.github/scripts/assert-size.mjs` | **Runs, and fails the build** above 20,480 B gzipped for the ESM tree. Mostly a supply-chain canary: a dependency inlined into the bundle shows up as a size jump |
| **Dependabot security updates** | Repository setting | **Not enabled** — a maintainer action, see [CONTRIBUTING](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020) |
| **CodeQL for Swift / Kotlin** | — | **Not analysed.** Both need a full native compile inside the CodeQL tracer, which would duplicate `verify-ios` / `verify-android` and roughly double their runtime. The reasoning is in the header of `codeql.yml`; it is a tracked follow-up |

Snyk was wired into the `audit` job in 0.2.0 behind `if: env.SNYK_TOKEN != ''` and **has been
removed**. Provisioning the token was never done, a step that always skips is worse than no step
(it reads as coverage in the job list and delivers none), and the overlap with `npm audit` +
Dependabot + CodeQL left it with little unique yield on a repo whose runtime dependency tree is
three Braze SDKs. There is likewise no Renovate configuration; the grouped weekly updates come from
Dependabot.

### Lockfile discipline

- `package-lock.json` is committed at the root and in `example/`, `demo/`, `test/web/` and
  `test/mock-server/`, and reviewed in PRs.
- Every CI install is `npm ci`, not `npm install`, so each job builds the tree the committed
  lockfiles describe rather than whatever resolves in range that day.

---

## 13. CI / release security

### Secret management

- No real Braze API key is in any committed file, including `demo/.env.example`; gitleaks scans the
  full history on every run to keep it that way.
- **`NPM_TOKEN` is the only repository secret any workflow references**, and only the `publish` job
  in `release.yml` reads it. Nothing in `test.yml` or `codeql.yml` reads a secret other than the
  automatically-provided `GITHUB_TOKEN`; the CI suite is therefore called from `release.yml`
  **without `secrets: inherit`**, so the publish token is never present in the nine CI jobs — two of
  which run third-party toolchains (CocoaPods, Gradle) over a dependency graph this repo does not
  own. There is no Braze credential in CI, because no CI job talks to Braze.

### Publishing

- **`0.2.0` is the first release published by the workflow.** `0.1.0` was published **by hand** on
  2026-05-22 and therefore carries **no provenance attestation** on npm. That is a fact about the
  published artifact and cannot be changed retroactively; it is recorded here and in the CHANGELOG
  rather than left for a reviewer to discover.
- `release.yml` calls the full CI workflow as its gate, so `npm publish` waits on lint, build,
  tarball verification, the web behavioral tests, the audit job, and both native verify jobs.
- Before publishing it checks that `CHANGELOG.md` has a section for the version, that the version is
  **not already on the registry**, and runs `npm publish --dry-run`. It publishes with
  `--provenance` and then polls for the attestation.
- The publish job runs in a GitHub `npm-publish` environment with `id-token: write` and no
  `contents: write`; the GitHub Release is created by a separate job.
- **The npm token is an automation token, which bypasses 2FA by design.** This is the standard
  trade-off for CI publishing, not a 2FA claim. The intended end state is
  [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no long-lived token),
  which is configured in npm's web UI; once the first publish succeeds through it, the token is
  deleted and revoked. **Not yet done.**

### Source verification

The authoritative enumeration of branch protection lives in
[`docs/REPO-HYGIENE.md`](./docs/REPO-HYGIENE.md). In force on `main` today:

- required status checks (strict), signed commits, no force-push, no branch deletion,
  conversation resolution required.

Honestly **not** in force, and deliberately so or pending:

- **Required reviewers ≥ 1** — not enabled. On a single-maintainer repository a review requirement
  with a standing self-bypass is theatre, not a control. If a second maintainer joins, enable it.
- **`enforce_admins`** — not enabled, so the required checks do not currently bind the admin.
  This one *is* worth turning on, and the command is in
  [CONTRIBUTING](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020).
- **A ruleset restricting who may create `v*` tags** — not created yet; same checklist.

### Supply-chain hardening

- **Every GitHub Action is pinned to a full 40-character commit SHA**, with the version in a
  trailing comment, across all three workflows. Each pin was re-resolved from its tag through the
  GitHub API and matched (annotated tags dereferenced to the commit they point at).
  `snyk/actions/node@master` — a mutable branch reference, and the worst offender — is gone with
  the Snyk step itself. `.github/dependabot.yml` bumps the pins weekly.
- **No `postinstall` script.** `package.json` has `prepare` and `prepublishOnly`, both of which run
  the build. `prepare` executes on a **git-URL or local** install — the same arbitrary-code-on-install
  surface — but is skipped for installs from the npm registry tarball, which is how the README now
  tells consumers to install.
- **A `pack-check` CI job asserts the tarball's contents**: every artifact a consumer's build needs
  is present, and nothing from `test/`, `example/`, `demo/`, `docs/` or `.claude/` leaks in.
- **A bundle-size gate** (`.github/scripts/assert-size.mjs`, run in `build-plugin`) fails the build
  if the gzipped ESM output crosses 20,480 B. Its security value is as a canary: code that should
  never be in the published bundle — an inlined dependency, a vendored copy of something — is
  visible as a size jump even when it compiles and every test still passes.
- **The reusable CI call in `release.yml` passes no secrets** (see *Secret management* above), and
  the `github-release` job — the only one holding `contents: write` — checks out with
  `persist-credentials: false`, so no write-scoped token is left behind for a later step to reach.

---

## 14. Vulnerability disclosure policy

**Reporting a vulnerability:** open a private security advisory at
<https://github.com/bma342/capacitor-braze/security/advisories/new>.

> ⚠️ **Status check before you rely on this.** GitHub's private vulnerability reporting must be
> switched on per repository, and **as of this writing it has not been** — the enabling command is
> in [CONTRIBUTING](./CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020) and is on the pre-tag
> checklist for `0.2.0`. Until that lands, the advisory form above will not accept a report from a
> non-collaborator. If it refuses you, email the maintainer address in `package.json` with
> `[SECURITY]` in the subject and **do not** open a public issue. This paragraph is removed once
> the setting is verified enabled.

**Do not** open a public issue or pull request for security findings — those are visible to the world the moment they land. The advisory channel keeps the disclosure private until a patch ships, with the option to publish a CVE alongside the fix when the advisory is closed.

**Response targets** (pre-1.0, best-effort):
- Acknowledge within 72 hours.
- Triage and assess severity within 7 days.
- Patch confirmed critical vulnerabilities within 14 days of triage.
- Publish a CVE for any fix that affects consumer apps via the GitHub Security Advisory.

A dedicated `security@` email and PGP key are planned post-1.0 once the project earns the maintenance bandwidth.

Bug bounty: not offered pre-1.0. Considered for 1.0 if the plugin's adoption justifies it.

---

## 15. Threats explicitly out of scope

The plugin does NOT attempt to defend against:

- **Compromised consumer app** — if attacker controls the JS context, all bets are off.
- **Jailbroken / rooted devices** — Braze SDKs do their own runtime checks; plugin doesn't add more.
- **Network attacks against Braze infrastructure** — Braze's problem.
- **Dashboard account compromise** — if attacker controls Braze dashboard, they can push malicious IAMs / campaigns. Mitigation = Braze's account security (SSO, 2FA, audit logs).
- **Server-side JWT signing key compromise** — if consumer leaks their private key, SDK Authentication is bypassed for any user. Mitigation = key rotation + Braze's `PUT /sdk_authentication/primary_key` endpoint.
- **Native SDK vulnerabilities** — disclosed and patched by Braze. Plugin bumps the pin and ships a patch within 24h of disclosure (per §4 of [SDK_SURFACE.md](./SDK_SURFACE.md)).

---

## References

- [Braze SDK Authentication setup](https://www.braze.com/docs/developer_guide/sdk_integration/authentication)
- [Braze data privacy SDK methods](https://www.braze.com/docs/developer_guide/analytics/managing_data_collection)
- [Braze GDPR FAQ](https://www.braze.com/company/legal/gdpr-faq)
- [Braze API and SDK endpoints](https://www.braze.com/docs/user_guide/administer/personal/sdk_endpoints)
- [Capacitor `server.allowNavigation`](https://capacitorjs.com/docs/config) — URL allow-listing
- Plugin docs: [`PLAN.md`](./PLAN.md) | [`SDK_SURFACE.md`](./SDK_SURFACE.md) | [`CLAUDE.md`](./CLAUDE.md)
