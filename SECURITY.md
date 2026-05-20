# Security Model — capacitor-braze

> The plugin's complete security posture. Read alongside [`PLAN.md`](./PLAN.md) (strategy) and [`SDK_SURFACE.md`](./SDK_SURFACE.md) (capability catalog). Every plugin design decision with security implications is documented here.
>
> **Unofficial plugin.** This is an independent, community-maintained Capacitor wrapper. NOT affiliated with or endorsed by Braze, Inc. For Braze's own security disclosures and SDK-level guarantees, see [braze.com/security](https://www.braze.com/security). This document covers only the plugin-layer security posture; the underlying Braze SDKs are responsible for everything they document themselves.

**Last updated:** 2026-05-20
**Disclosure:** see [§14](#14-vulnerability-disclosure-policy) below.

---

## 0. Threat model summary

The plugin sits between consumer Capacitor app code and Braze's native SDKs. The realistic threats:

| Threat | Surface | Severity |
|---|---|---|
| User identity spoofing (one user claims another's ID) | Identity layer | **High** — addressed via SDK Authentication |
| API key extraction from app bundle | Distribution | **Low** — Braze SDK keys are public-by-design |
| PII leakage via debug logs / crash reports | Plugin logging | **Medium** — addressed via prod-safe defaults |
| Push token leaking to wrong endpoint | Push handoff | **Medium** — addressed via single-owner design |
| XSS via HTML in-app messages | IAM rendering | **Medium** — inherited from Braze; documented |
| Deep link redirection (open arbitrary URLs) | Push / IAM handlers | **Medium** — addressed via Capacitor URL allow-list |
| Man-in-the-middle on SDK traffic | Network | **Low** — TLS-only; pinning optional |
| Background location abuse | Geofence module | **Medium** — opt-in only, not in v0.1 |
| Supply-chain attack on the plugin itself | npm publish | **High** — addressed via npm 2FA + signed releases |
| Insecure consumer integration patterns | Documentation | **High** (in aggregate) — addressed via README + this doc |

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
- README has a "**Which key do I use?**" section at the top, with a clear visual: SDK key → plugin; REST key → server.

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

- **`Braze.initialize({ apiKey, endpoint, enableSdkAuthentication: true })`** — turns on signature requirement on the SDK side. Defaults to `false` in v0.1 (matches Braze's default) but README **strongly recommends** enabling for any production app with real users.
- **`Braze.changeUser({ userId, sdkAuthSignature })`** — both params required when auth is enabled. Plugin validates `sdkAuthSignature` is non-empty string client-side before bridging.
- **`Braze.addListener('sdkAuthError', listener)`** — fires when Braze rejects a signature (expired, malformed, etc.). Consumer should refresh the JWT via their backend and call `Braze.setSdkAuthenticationSignature({ signature })`.
- **`Braze.setSdkAuthenticationSignature({ signature })`** — for in-session signature refresh (v0.2).

### Server-side guidance in README

The plugin can't sign JWTs — that requires the consumer's private key. README provides:

- Reference implementations for Node.js, Python, Ruby, Go, and Kotlin/Ktor (since Aromo uses Ktor).
- JWT claims structure: `{ sub: userId, exp: <now + 1h>, iss: "your-app" }`.
- Key generation steps (RS256 keypair, upload public to Braze dashboard).
- Key rotation guidance (Braze supports multiple active keys; rotate without downtime).
- Token refresh pattern (refresh before expiry, not on failure).

### Failure modes

| Failure | What the plugin does |
|---|---|
| JWT expired | SDK enqueues retry, fires `sdkAuthError` event. Consumer refreshes. |
| JWT signature invalid (key rotated, wrong key) | SDK rejects request, fires `sdkAuthError`. Consumer must regenerate. |
| `enableSdkAuthentication: true` but `changeUser` called without signature | Plugin throws `BrazeAuthRequiredError` client-side before bridging. |
| Network failure during auth | SDK retries with cached signature. |

---

## 3. PII handling

### What counts as PII in Braze context

- Email, phone number, full name, date of birth, address fields.
- User ID (often itself PII when it's an email or stable identifier).
- Custom attributes containing PII (e.g., `last_4_credit_card`, `loyalty_member_id`).
- Custom event properties containing PII.

### Plugin rules

1. **Never log PII at any log level**, even with `enableLogging: true`. Plugin's own log lines mask:
   - Email → `j***@e***.com`
   - Phone → `***-***-1234`
   - User ID → first 4 chars + `***`
   - Custom attributes → redact value, log key + type
2. **Don't include PII in error messages** that may surface to consumer's error tracking (Sentry, etc.). Errors quote argument names, not values.
3. **Don't echo PII back from native to JS** in resolved promise values. If the native SDK returns PII (e.g., `getUserId()`), pass it through as opaque string — but plugin must not transform, log, or persist it.
4. **`wipeData()` is destructive and must be exposed clearly** — README's privacy section explicitly covers the right-to-be-forgotten use case.

### What the plugin does NOT do

- Encrypt PII at the plugin layer. Braze SDKs handle their own storage encryption (Android Keystore / iOS Keychain). Adding plugin-side encryption would be redundant and likely insecure.
- Hash PII before passing to Braze. Braze expects raw email/phone for matching; hashing client-side defeats Braze's segmentation.
- Collect or transmit PII beyond what the consumer explicitly passes.

---

## 4. Network security

### TLS

- Braze SDKs default to TLS 1.2+ for all network traffic. Plugin does not change this.
- Custom `endpoint` config accepts any URL — including `http://` — but only because that's required for mock-server testing. README explicitly warns: **never use `http://` in production**.
- v0.5 adds a config gate: `allowInsecureEndpoint: false` (default), preventing accidental `http://` in production builds.

### Certificate pinning

- Braze Android SDK supports certificate pinning natively via OkHttp config. Braze Swift SDK does not directly; pinning would be done at the URLSession level.
- Plugin does NOT enable pinning by default. Pinning has real maintenance costs (Braze rotates certs) and benefits mostly enterprise threat models.
- v1.0 adds optional `certificatePins: string[]` init option for consumers who need it; documentation explains the rotation risk.

### Endpoint validation

- Plugin parses `endpoint` URL client-side at `initialize` time. Rejects:
  - Non-HTTPS in production builds (when `allowInsecureEndpoint: false`).
  - Malformed URLs.
  - Endpoints not in Braze's known cluster list (warning, not error — Braze adds clusters over time).

### Known cluster endpoints (for validation warnings)

`sdk.iad-01.braze.com`, `sdk.iad-02.braze.com`, `sdk.iad-03.braze.com`, `sdk.iad-04.braze.com`, `sdk.iad-05.braze.com`, `sdk.iad-06.braze.com`, `sdk.iad-07.braze.com`, `sdk.iad-08.braze.com`, `sdk.fra-01.braze.eu`, `sdk.fra-02.braze.eu`, `sdk.us-08.braze.com`, plus any Braze publishes in the future.

---

## 5. Push token security

Push tokens (APNs, FCM) are **not secret** but routing them to the wrong endpoint can:
- Send Braze-targeted pushes via a non-Braze provider (no-op, but confuses analytics).
- Leak the device's token to an analytics destination it shouldn't reach.
- Cause duplicate notifications (Braze and another provider both send).

### Plugin design: single-owner push

Only one system can own push registration at a time. Plugin enforces this via the `enableAutomaticPushHandling` flag:

| Mode | Who owns registration | When to use |
|---|---|---|
| `enableAutomaticPushHandling: true` (default) | Braze SDK | Greenfield apps; Braze is the only push provider. |
| `enableAutomaticPushHandling: false` | Consumer (typically `@capacitor/push-notifications`) | Apps with existing push pipeline, or routing tokens to multiple destinations. |

In `false` mode, consumer calls `Braze.registerPushToken({ token })` manually after receiving the token from their primary push pipeline. The plugin does not retain or re-emit the token.

### What the plugin does NOT do

- Log push tokens at any level.
- Persist push tokens outside the Braze SDK's own storage.
- Bridge tokens back to JS unless consumer explicitly calls `getPushToken()` (v0.5+).

---

## 6. In-app message XSS risk

Braze supports **HTML In-App Messages** rendered inside a WebView. The HTML content comes from the Braze dashboard, where customer marketing teams author it. If a marketing user (or compromised dashboard account) injects malicious HTML/JS, it executes in the consumer app's WebView context.

### Mitigation (mostly inherited from Braze)

- Braze's `allowUserSuppliedJavascript` config flag is **off by default**. Plugin's `initialize` exposes it explicitly; README warns about the threat model before enabling.
- Plugin's `addListener('inAppMessageReceived')` fires **before** Braze renders, letting consumer inspect message content and return `'discard'` if suspicious (e.g., contains unexpected `<script>` tags).
- README documents recommended Content Security Policy for the Capacitor WebView (`script-src 'self'` plus Braze's expected origins).

### What the plugin does NOT do

- Sanitize IAM HTML — that would break legitimate Braze templates with intentional inline styles, scripts, etc.
- Block all HTML IAMs by default — that would break a core Braze feature.

The plugin's role is **disclosure + opt-out hooks**, not preventive sanitization.

---

## 7. Deep link security

Push notifications and in-app messages can contain URLs that, when tapped, open in the app. Without controls, this is an open redirect into the WebView.

### Plugin design

- Plugin exposes `Braze.addListener('deepLinkReceived', listener)` that fires before the URL is opened.
- Default behavior (no listener): plugin asks Capacitor to handle the URL via its standard router, which respects the app's allowed scheme list (`capacitor.config.ts → server.allowNavigation`).
- Custom listener: consumer returns `{ allow: true | false, replaceWith?: string }`. Allows validation against an app-specific allow-list before opening.
- Plugin **never** opens external URLs (`https://malicious.example`) without going through Capacitor's URL handler.

### Recommended consumer pattern (documented)

```ts
Braze.addListener('deepLinkReceived', ({ url }) => {
  const parsed = new URL(url);
  // Only allow same-origin or known partner domains
  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return { allow: false };
  }
  return { allow: true };
});
```

---

## 8. Logging — production-safe by default

`enableLogging` in Braze's SDKs is **verbose**. Logs include request payloads (events, attributes, sometimes PII), response bodies, internal SDK state. Useful for development; dangerous in production.

### Plugin policy

- `initialize({ enableLogging })` defaults to `false`.
- README's quick-start example uses `false` and explicitly notes "do not enable in production builds."
- Plugin's own log lines (separate from Braze's) only fire in development mode (`process.env.NODE_ENV !== 'production'` for web; build-flavor check for native).
- v0.5 adds custom log handler (`setLogger`) so consumers can route logs to their own observability stack without enabling Braze's verbose console output.

---

## 9. Geofence & location permissions

The `BrazeLocation` / `android-sdk-location` modules require background location permission, which:
- iOS: requires "Always Allow" location, which App Store reviewers scrutinize.
- Android: requires `ACCESS_BACKGROUND_LOCATION`, with stricter Play Store policy each year.
- Both: privacy-sensitive; should not be requested for apps that don't actually need geofence-driven messaging.

### Plugin policy

- Geofence support is **NOT in v0.1**. Deferred to v0.5 and gated behind opt-in install.
- Consumer must explicitly install `capacitor-braze-location` (a separate sub-package, v0.5+) to pull the geofence module. Base plugin does not transitively depend on it.
- README has a dedicated "Should I enable geofences?" section with the App Store / Play Store implications spelled out.

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

- All four exposed in **v0.1** (`wipeData`, `disableSDK`, `enableSDK`) and **v0.2** (subscription groups).
- README has a "**Right to be forgotten flow**" section showing the complete delete pattern:
  1. `Braze.wipeData()` — removes local data
  2. Consumer's backend calls Braze REST `/users/delete` — removes server data
  3. Consumer's backend revokes SDK Authentication keys for that user
- README documents what `wipeData()` does NOT delete: behavioral events (custom events, sessions, campaigns, purchases) on the Braze server side are retained per Braze policy. Customer's backend must call REST API to fully purge.

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

- **Direct deps:** Braze SDKs only (per platform). No additional runtime npm/Maven/CocoaPods packages.
- **Dev deps:** Capacitor's standard scaffold (TS, Rollup, Jest), plus Ktor for the mock server, Maestro for e2e. All from reputable maintainers.
- **Dependabot** enabled on the example app + mock server; not on the plugin's pinned Braze SDK versions (those bump manually per §4 of [SDK_SURFACE.md](./SDK_SURFACE.md)).

### Software Composition Analysis (SCA)

- GitHub Advanced Security (free for public repos) runs on every PR.
- `npm audit` on every CI build; high/critical fail the build.
- Snyk free tier as backup scanner.

### Lockfile discipline

- `package-lock.json` committed and reviewed in PRs.
- Renovate bot configured for grouped weekly dep updates on the example app.

---

## 13. CI / release security

### Secret management

- No real Braze API keys in any committed file (including `.env.example`).
- CI uses GitHub Actions encrypted secrets for: npm publish token, daily-spec-drift Braze trial key.
- Trial Braze key has scope limited to a sandbox workspace; rotated quarterly.

### Publishing

- `npm publish` requires **2FA** on the npm account.
- Provenance enabled (`npm publish --provenance`) — signed release attestation visible on npm.
- Release process: PR → CI green → tag → GitHub Action publishes. No manual `npm publish` from local machines.

### Source verification

- All commits to `main` require PR review.
- Signed commits required (`git commit -S`).
- `main` branch protected: no force-push, no direct push, required reviewers ≥1.

### Supply-chain hardening

- `.github/dependabot.yml` watches GitHub Actions versions too (pinned by SHA, not tag).
- No `postinstall` scripts in plugin's `package.json` (common supply-chain attack vector).

---

## 14. Vulnerability disclosure policy

Plugin's `SECURITY.md` file (in the public repo) contains:

```
## Reporting a vulnerability

Email: security@<future-domain>
PGP key: <fingerprint>

We respond within 72 hours, fix critical issues within 7 days,
and publish CVEs for confirmed vulnerabilities.

Please do not open public GitHub issues for security reports.
```

For pre-1.0, until a dedicated email is set up: report via GitHub Security Advisories (private vulnerability reporting enabled on the repo).

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
