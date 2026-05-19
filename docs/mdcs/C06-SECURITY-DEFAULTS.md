# C06 — Security defaults & PII discipline

**Security is a property of the defaults, not of the docs. Defaults must be safe even for a consumer who never reads `SECURITY.md`. The plugin's job is to make the secure path the cheap path and the insecure path the noisy path.**

[`SECURITY.md`](../../SECURITY.md) is the long-form authoritative reference — 15 sections covering keys, PII, network, push, IAM XSS, deep links, logging, geofences, privacy, consent, and CI. This MDC is the **operational** layer: when you add a method, which of those rules apply, and how they show up in the bridge code.

---

## Rule

Every new plugin method that touches user data, configuration, or the network MUST:

1. **Default-deny.** Optional security toggles default to the safer value. `enableLogging` defaults to `false`. `allowInsecureEndpoint` defaults to `false`. Any future "skip cert validation," "disable SDK auth signing," "raw passthrough" toggle defaults to false.
2. **Validate endpoint security at the bridge.** No HTTPS check at the bridge boundary = transport-security defect, regardless of whether the SDK happens to validate downstream.
3. **Never log attribute values.** Email, phone, user ID, custom attribute values, event property values — all PII or potentially-PII. The bridge does not write them to any log stream at any level.
4. **Treat the public SDK key as low-trust input.** The TS interface accepts an `apiKey: string` because the consumer has to pass *something*; the plugin does not validate it but also does not log it.
5. **Refuse to accept REST API keys.** Documented in `SECURITY.md §1`; no bridge code distinguishes them at runtime (they're indistinguishable shapes), but the JSDoc, README, and onboarding docs must make the public-SDK-key requirement explicit.

## Rationale

The plugin's threat model ([`SECURITY.md §0`](../../SECURITY.md)) treats the consumer's developer as a partner, but the consumer's *runtime* is hostile: the public SDK key is extractable from any installed app, the device is rooted by 0.1% of users in some markets, and TLS-stripped network proxies are normal in enterprise environments.

The defaults are the only security boundary the plugin owns end-to-end. Documentation can be ignored; defaults cannot. Every default in this MDC has shipped because changing it later is a SemVer-breaking change in security posture.

---

## The operational checklist

When you add a method, run this checklist:

### 1. Configuration toggles default to the safer value

If your method takes a boolean option that changes security or observability behavior, the default MUST be the safer value:

| Toggle | Default | Worked example |
|---|---|---|
| `enableLogging` | `false` | [`src/web.ts:98`](../../src/web.ts), [`ios/Plugin/BrazePlugin.swift:93`](../../ios/Plugin/BrazePlugin.swift), [`android/.../BrazePlugin.kt:124`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |
| `allowInsecureEndpoint` | `false` | [`src/web.ts:543`](../../src/web.ts), [`ios/Plugin/BrazePlugin.swift:86`](../../ios/Plugin/BrazePlugin.swift), [`android/.../BrazePlugin.kt:115`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |
| `enableSdkAuthentication` | `false` | (not currently security-defaulted; opt-in by consumer) |

`enableSdkAuthentication` is the deliberate exception: it defaults to false because turning it on without a backend signing key would break `changeUser`. But the **README and JSDoc** call it out as strongly recommended for production. See `SECURITY.md §2`.

### 2. Insecure transport is loud, not silent

If the endpoint starts with `http://` and `allowInsecureEndpoint` is not explicitly true, reject the call. Worked example ([`src/web.ts:542`](../../src/web.ts)):

```ts
const isInsecure = options.endpoint.startsWith('http://');
const allowInsecure = options.allowInsecureEndpoint === true;
if (isInsecure && !allowInsecure) {
  throw new Error(
    'Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` ' +
      'only for local mock-server testing. See SECURITY.md §4.',
  );
}
```

Two design points worth noting:

- The check is `options.allowInsecureEndpoint === true`, not `!!options.allowInsecureEndpoint`. Strict equality means truthy-but-not-true values (a stray `1`, `'true'`, `'yes'`) don't disable the safety check.
- The error message points at `SECURITY.md §4` so a developer who hits it learns *why* HTTPS is required, not just *that* it's required.

iOS and Android duplicate the same check ([C04](./C04-VALIDATION.md)). All three messages reference `SECURITY.md §4`.

### 3. The PII non-logging rule

**The bridge never writes PII to any log stream at any level — including debug, including when `enableLogging` is true.**

`enableLogging` toggles Braze's *SDK* logger, which the consumer's developer can scrub or pipe to a controlled sink. The plugin's *bridge code* never independently logs.

What counts as PII in this plugin's surface (from `SECURITY.md §3`):

- Email address (`setEmail`)
- Phone number (`setPhoneNumber`)
- First name / last name (`setFirstName`, `setLastName`)
- External user ID (`changeUser`, `getUserId`)
- Custom attribute values (`setCustomUserAttribute`)
- Event properties (`logCustomEvent`)
- Purchase properties (`logPurchase`)
- Alias values (`addAlias`)
- Date of birth, gender, home city (`setDateOfBirth`, `setGender`, `setHomeCity`)
- Subscription group IDs (`addToSubscriptionGroup`) — group IDs are not strictly PII but reveal consent state, which is regulated alongside PII

What's safe to log:

- Method names (without arguments)
- SDK initialization milestones (without `apiKey`, without `endpoint`)
- Error messages emitted by `call.reject(...)` (these are deliberate developer-facing diagnostics that name the field but not the value)
- Internal state transitions ("subscription registered," "wipeData invoked") — without payload

If you find yourself adding a log line that interpolates a value, stop and pick a different signal. Log the *shape* of the call (`"setEmail invoked with non-null email"`), not the content.

### 4. Error messages name fields, not values

Per [C01](./C01-METHOD-ANATOMY.md#error-message-convention) the error format is `Braze.method: \`field\` is required (type).` — it names the field, never the value. This rule has a security purpose beyond UX consistency: error messages reach crash reporters, support tickets, and customer-facing surfaces. A message like `Braze.setEmail: invalid email "alice@example.com"` leaks PII into every error pipeline downstream.

The C01 format prevents this by construction. Don't reformat error messages to include values for "easier debugging" — that's a security regression dressed as a developer experience improvement.

### 5. REST API keys vs. public SDK keys

Braze has two key types ([`SECURITY.md §1`](../../SECURITY.md)). Public SDK keys belong in the plugin; REST API keys do not. The plugin can't distinguish them at runtime — they're both opaque strings — so the boundary is:

- The TS option is named `apiKey` (not `restApiKey`).
- The JSDoc on `apiKey` says "public" explicitly.
- The README has a section dedicated to the distinction.
- The plugin never makes an HTTP request that would *use* a REST API key (we have no such request shape).

If you add a future method that needs a server-side credential (e.g. a backend-signed SDK Auth signature), document it as "this signature is produced by your backend; do not call this method with a REST API key" in the JSDoc. The plugin does not accept REST keys as a feature.

### 6. Security-sensitive defaults are SemVer-breaking to change

`enableLogging: false` and `allowInsecureEndpoint: false` cannot become `true` defaults in a patch or minor release. Flipping either default would silently re-enable a behavior consumers expect off. Changing these to default-true requires:

- a major version bump,
- a `BREAKING:` line in the CHANGELOG,
- a migration paragraph in the README.

If you add a new security-sensitive default and later want to relax it, run the same protocol.

---

## When you don't know if something is security-sensitive

Default to assuming yes. Open `SECURITY.md` and re-read the section closest to your change. If still unclear, the table of contents for `SECURITY.md`:

| Section | Topic |
|---|---|
| §1 | API keys: public SDK vs. REST |
| §2 | SDK Authentication (signed JWT) |
| §3 | PII handling |
| §4 | Network security (TLS, cert pinning, endpoint validation) |
| §5 | Push token security (single-owner principle) |
| §6 | In-app message XSS risk |
| §7 | Deep link security |
| §8 | Logging — production-safe by default |
| §9 | Geofence & location permissions |
| §10 | Data privacy methods (GDPR / CCPA) |
| §11 | Consent / regulatory pathways |
| §12 | Dependency security |
| §13 | CI / release security |
| §14 | Vulnerability disclosure policy |
| §15 | Out-of-scope threats |

The bridge code references back to these section numbers in error messages and code comments. That bidirectional linking is intentional — it survives renames and refactors better than "see the security docs."

## Forbidden

- **Flipping a security default to `true` because it's "more convenient."** Convenience is the consumer's problem to opt into, not a default we ship.
- **Logging values for debugging purposes.** Use shape, never content.
- **Including values in error messages.** Field name only.
- **Accepting `'true'` / `1` / `'yes'` as truthy for security toggles.** Strict equality with `true` only.
- **Adding a security toggle without an MDC update + a JSDoc cross-reference to `SECURITY.md`.**
- **Removing or weakening an endpoint-protocol check.** HTTPS is required unless explicitly waived per-call.
- **Skipping the PII rule for "internal" fields.** External user IDs are PII per Braze's published guidance even when they aren't human-readable.
