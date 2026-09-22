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

References are by **symbol name**, not line number — every line number in this MDC set was wrong by
the time anyone checked (2026-09 audit, A6-54).

| Toggle | Default | What the default actually does | Where |
|---|---|---|---|
| `enableLogging` | `false` | **SDK errors only.** Web: Web SDK logging off. iOS: BrazeKit log level `.error`. Android: `BrazeLogger.logLevel = Log.ERROR`. `true` gives iOS `.debug` / Android `BrazeLogger.VERBOSE`. | `initialize` in [`src/web.ts`](../../src/web.ts), [`BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift), [`BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |
| `allowInsecureEndpoint` | `false` | An `http://` endpoint is **rejected** unless this is strictly `true`. | `validateInitializeOptions` in [`src/web.ts`](../../src/web.ts); the equivalent guard at the top of `initialize` on both natives |
| `enableInAppMessageUI` | `true` | The plugin renders in-app messages out of the box. `false` is an **opt-out**, not a security toggle — it does not suppress messages, it hands rendering to the host app. | `initialize` on all three bridges |
| `enablePushAutomation` | `false` | **iOS only.** The plugin does not touch `UNUserNotificationCenter` and BrazeKit does not take over notification opens or deep links unless the consumer opts in. | `performInitialize` in [`BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift) |
| `enableSdkAuthentication` | `false` | (not security-defaulted; opt-in by consumer) | — |

**The `enableLogging` row is the one this project got wrong twice**, so it is worth stating what
"safer value" means concretely: the option defaulting to `false` is necessary but not sufficient —
the `false` *branch* has to actually set a level. iOS set `.info` (the second-most-verbose) and
Android set nothing at all, leaving the SDK at its INFO default. A boolean that defaults safe and
then does nothing is not a security default.

`enableSdkAuthentication` is the deliberate exception: it defaults to `false` because turning it on
without a backend signing key would break `changeUser`. The
[README](../../README.md#should-i-enable-sdk-authentication) and the JSDoc call it out as strongly
recommended for production. See [`SECURITY.md` §2](../../SECURITY.md#2-sdk-authentication-signed-jwt).

### 2. Insecure transport is loud, not silent

If the endpoint starts with `http://` and `allowInsecureEndpoint` is not explicitly true, reject the call. Worked example (`validateInitializeOptions` in [`src/web.ts`](../../src/web.ts)):

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

iOS and Android duplicate the same check ([C04](./C04-VALIDATION.md)), byte-for-byte. Both natives
lost the second sentence at some point and were silently divergent until 0.2.0 — which is the
argument for the C04 byte-identical rule existing at all.

Separately, all three platforms **warn** (never reject) when the endpoint host does not match
`sdk.<region>-NN.braze.com|eu`, exempting `localhost` / `127.0.0.1` / `*.test` / `*.local`. The
warning **must not interpolate the endpoint** — it logs the expected pattern only. Matching is on
the parsed hostname, so an explicit `:443` does not misfire.

### 3. The PII non-logging rule

**The bridge never writes PII to any log stream at any level — including debug, including when `enableLogging` is true.**

`enableLogging` toggles Braze's *SDK* logger. The plugin's *bridge code* logs only a small fixed set
of non-PII diagnostics: the endpoint cluster-shape warning, "dropped an unrecognized in-app message
/ content card variant", a warning naming the *method* when the Braze SDK rejects an attribute
value, and a warning that the Android SDK kept its first configuration on a second `initialize`.
None of them carries a consumer-supplied value. Verify with a grep over `src/`, `ios/Plugin/` and
`android/src/main/` before adding a log line.

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

Per [C01](./C01-METHOD-ANATOMY.md#error-message-convention) the error format is
`Braze.method: \`field\` is required (type).` — it names the field, never the value. This rule has a
security purpose beyond UX consistency: error messages reach crash reporters, support tickets, and
customer-facing surfaces. A message like `Braze.setEmail: invalid email "alice@example.com"` leaks
PII into every error pipeline downstream.

The C01 format prevents this by construction. Don't reformat error messages to include values for
"easier debugging" — that's a security regression dressed as a developer experience improvement.

#### The closed-enum exemption

One narrow, explicit exemption exists, because C01's own worked examples use it and the two MDCs
otherwise contradict each other (2026-09 audit, A1-26):

> **A value drawn from a closed, documented, non-secret enum may be echoed in the error message.**

The only current instance is `setGender`:

```
Braze.setGender: unknown gender "<value>". Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.
```

The justification is that the value is not user data — it is one of six tokens the consumer copied
out of this plugin's own type definition, and echoing it is the only way to tell them *which* of
their call sites is wrong. It is also bounded: an attacker cannot smuggle PII through it, because
anything unexpected is exactly what gets echoed, and the field carries no PII to begin with.

**The exemption does not generalise.** It does not extend to `setEmail`, `setPhoneNumber`,
`setCustomUserAttribute`, `logCustomEvent` properties, `addAlias`, or any other field carrying
consumer-supplied content. If you want to add a second instance, the value must be constrained to a
fixed set declared in `src/definitions.ts`, and you must note it here.

### 5. REST API keys vs. public SDK keys

Braze has two key types ([`SECURITY.md §1`](../../SECURITY.md)). Public SDK keys belong in the plugin; REST API keys do not. The plugin can't distinguish them at runtime — they're both opaque strings — so the boundary is:

- The TS option is named `apiKey` (not `restApiKey`).
- The JSDoc on `apiKey` says "public" explicitly.
- The [README's Security section](../../README.md#which-api-key-do-i-use) is dedicated to the distinction.
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
