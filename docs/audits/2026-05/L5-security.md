# L5 — Security Posture

## Verdict

- **0.1.0 ready: GAP** — no blockers (no PII leakage, no REST key exposure, no HTTP-by-default), but several aspirational SECURITY.md claims are not enforced in code. Shipable as `0.1.0` only if the README/SECURITY.md is brought in line with the actual posture, or the missing controls are added.
- **Braze-senior review: GAP** — the spoofing defense story (SECURITY.md §2) reads "we throw `BrazeAuthRequiredError` client-side" but the runtime contains no such guard. A reviewer reading §2 then walking the bridges will find the discrepancy in five minutes. Fixable in <50 LoC.

## Summary

The actual security posture is solid where the bridge code lives: defaults are safe (`enableLogging: false`, `allowInsecureEndpoint: false`, strict-equality `=== true` for the safety override on all three platforms), the plugin layer never logs PII (zero `Log.*` / `os_log` / `print(` / `console.log(` calls in any bridge), error messages name fields not values, no postinstall scripts, no committed secrets, npm provenance attestation enabled, runtime-deps minimal (only `@braze/web-sdk`), example uses input fields, demo uses env vars with a `.env.example` template.

The defects are claim/reality drift in SECURITY.md, not actual leaks:

1. **`changeUser` without `sdkAuthSignature` when SDK auth was enabled is NOT rejected client-side.** §2 explicitly promises `BrazeAuthRequiredError`. Bridge state doesn't even track `enableSdkAuthentication` after `initialize` returns.
2. **`enableAutomaticPushHandling` flag described in §5 does not exist** in `BrazeInitializeOptions`. The plugin's design is "consumer always owns the token handoff" — §5 should be rewritten to that, not to a flag that isn't there.
3. **Endpoint validation is `startsWith("http://")`, not URL parsing.** §4 claims "Plugin parses `endpoint` URL client-side… Rejects malformed URLs… warns on unknown clusters." None of that is implemented; the actual check is one-line prefix detection. Acceptable for now (Braze cluster names are bare hosts), but §4 should be downsized to match.
4. **`'sdkAuthError'` event listener is documented in §2 but not wired** in any bridge or the listener overloads in `definitions.ts`. SDK_SURFACE.md defers full SDK auth refresh to v0.2; §2 prose reads as if it's already done.
5. **Signed-commit + Snyk + gitleaks claims are aspirational.** §12/§13 list controls that aren't in CI. The actual CI runs `npm audit --audit-level=high --omit=dev` and that's it on the scanner side.
6. **Native `sessionTimeoutInSeconds <= 0` is silently dropped** on iOS/Android. Web rejects with a clear error. Minor C04 (validation parity) miss.

None of the above lets a consumer leak PII, expose a REST key, or ship HTTP-by-default. Hence no blocker. But each one is a credibility hit if a Braze engineer reads SECURITY.md alongside the code.

## SECURITY.md claims vs. code reality

| Claim (section) | Code state | Pass? |
|---|---|---|
| §1 "Plugin accepts ONLY SDK API keys… can't distinguish at runtime" | TS `apiKey: string`, no validation. JSDoc + README warn. Consistent with C06 #5 ("indistinguishable shapes"). | PASS |
| §2 "`changeUser` without signature when SDK Auth enabled → plugin throws `BrazeAuthRequiredError` client-side before bridging" | Bridges do not track `enableSdkAuthentication`. `changeUser` validates only `userId`. Web `web.ts:145-151`, iOS `BrazePlugin.swift:140-148`, Android `BrazePlugin.kt:194-208`. | **FAIL** |
| §2 `setSdkAuthenticationSignature` exists and is wired | Wired in all three bridges. Validates non-empty signature. `web.ts:161`, `BrazePlugin.swift:163`, `BrazePlugin.kt:236`. | PASS |
| §2 `addListener('sdkAuthError', listener)` is exposed | Not in `definitions.ts` listener overloads, not wired in any bridge. Only mentioned in setSdkAuthenticationSignature JSDoc as "after… `sdkAuthError` event has fired". | **FAIL** (or doc reads as if v0.1, code says v0.2+) |
| §3 PII never logged at any level | Zero `Log.*` / `os_log` / `NSLog` / `print(` / `console.log` statements in `BrazePlugin.kt`, `BrazePlugin.swift`, `web.ts`. Error messages name fields, never values (C01 format). | PASS |
| §3 No PII in error messages | Field-name-only format upheld throughout. | PASS |
| §3 `wipeData()` exposed clearly | Exposed, JSDoc'd with right-to-be-forgotten flow, `web.ts:397`, `BrazePlugin.swift:660`, `BrazePlugin.kt:723`. | PASS |
| §4 TLS 1.2+ default | Delegated to Braze SDKs. Plugin doesn't override. | PASS |
| §4 `allowInsecureEndpoint: false` default | `web.ts:757` strict-equality `=== true`, `BrazePlugin.swift:95` `getBool("allowInsecureEndpoint", false)`, `BrazePlugin.kt:127` `getBoolean("allowInsecureEndpoint", false)`. | PASS |
| §4 "Plugin parses `endpoint` URL client-side… rejects malformed URLs" | Only `startsWith("http://")` check. No `new URL(...)` parse, no malformed-URL rejection. `web.ts:756`, `BrazePlugin.swift:96`, `BrazePlugin.kt:128`. | **FAIL** (aspirational only) |
| §4 "warns on endpoints not in Braze's known cluster list" | Not implemented anywhere. | **FAIL** (aspirational only) |
| §4 v0.5 cert pinning planned | Roadmap, not a current claim. | n/a |
| §5 `enableAutomaticPushHandling` flag enforces single-owner | Flag does not exist in `BrazeInitializeOptions`. `registerPushToken` exists, but there's no plugin-side mode switch. Web throws on `registerPushToken`. | **FAIL** (flag not implemented) |
| §5 Web throws on `registerPushToken` | `web.ts:437-444` throws with clear message + branch-guidance. | PASS |
| §5 Plugin doesn't log push tokens | No log statements anywhere. | PASS |
| §6 IAM XSS — `allowUserSuppliedJavascript` flag exposed | Not exposed in `BrazeInitializeOptions`. SDK_SURFACE.md defers IAM listeners (`inAppMessageReceived`) to v0.2; §6 reads as v0.1. | **FAIL** (v0.1 doesn't surface this yet) |
| §7 Deep link `deepLinkReceived` listener | Not exposed in `definitions.ts`. SDK_SURFACE.md defers to v0.2. | **FAIL** (same drift as §6) |
| §8 `enableLogging` default `false` | TS `web.ts:114` ` ?? false`, iOS `BrazePlugin.swift:102` `getBool("enableLogging", false)`, Android `BrazePlugin.kt:136` `getBoolean("enableLogging", false) ?: false`. Definitions doc this. | PASS |
| §8 Plugin's own log lines only in dev mode | Plugin emits ZERO log lines from its own code (better than the claim — no dev/prod gating needed). | PASS |
| §10 `wipeData` / `disableSDK` / `enableSDK` / subscription groups in v0.1 | All in `definitions.ts` and all three bridges. | PASS |
| §11 No data sent before `initialize()` | Init guard enforced (`requireInitialized` / `requireUser`) on all post-init methods. C07 quartet bypasses correctly. | PASS |
| §11 No third-party SDKs loaded | Runtime deps: `@braze/web-sdk` only. `npm ls --omit=dev` confirms. | PASS |
| §12 Dependabot on example + mock server | `.github/dependabot.yml` covers `/` and `/example` only. `/demo` and `/test/mock-server` are not configured. | **PARTIAL FAIL** |
| §12 "Snyk free tier as backup scanner" | Not in `.github/workflows/`. | **FAIL** (aspirational) |
| §12 npm audit on every build, high/critical fail | `test.yml:172-190` runs `npm audit --audit-level=high --omit=dev`. | PASS |
| §13 No real API keys committed | `git grep` for UUID patterns in source returns clean. `demo/.env.example` is empty template. README/example use placeholders (`YOUR-SDK-API-KEY`). | PASS |
| §13 No `postinstall` script | Plugin, example, demo `package.json`: no `postinstall` / `preinstall` / `prepare`. Only `prepublishOnly: npm run build`. | PASS |
| §13 `npm publish --provenance` enabled | `.github/workflows/release.yml:56` — `npm publish --provenance --access public`. `id-token: write` permission set. | PASS |
| §13 npm 2FA required | Cannot verify from repo; account-level. CHANGELOG / contributing don't reference. | UNKNOWN |
| §13 Signed commits required on `main` | `git log --format="%G?"` shows `N` (none) for the last 10+ commits. Branch protection setting also unverifiable from repo. | **FAIL** (not enforced today) |
| §13 dependabot pins Actions by SHA | `dependabot.yml` configures the ecosystem but doesn't enforce SHA pins; `.github/workflows/*.yml` use tag-form like `actions/checkout@v4`, not SHAs. | **FAIL** (aspirational) |
| §14 Disclosure policy with email | `SECURITY.md:389` lists `security@<future-domain>` (placeholder) + GitHub Security Advisories fallback. Acceptable for pre-1.0 but the placeholder should be a sentence ("Until a dedicated email is set up, …") not a literal angle-bracket token. | **PARTIAL FAIL** (cosmetic) |
| §15 Threats out of scope documented | Section present and concrete. | PASS |

## Findings

| ID | Severity | File:Line | Issue | Fix |
|---|---|---|---|---|
| L5-01 | **Medium** | `src/web.ts:145-151`, `ios/Plugin/BrazePlugin.swift:140-148`, `android/.../BrazePlugin.kt:194-208` | `changeUser` does not validate that `sdkAuthSignature` is present when `enableSdkAuthentication: true` was passed at init. SECURITY.md §2 explicitly promises `BrazeAuthRequiredError`. Without this, the runtime story for the §2 user-spoofing defense is "Braze rejects unsigned requests server-side eventually" — which is true but loses the client-side defense-in-depth the doc claims. | Track `enableSdkAuthentication` as plugin state set in `initialize`. In `changeUser`, if true and `sdkAuthSignature` is empty/missing, `call.reject("Braze.changeUser: \`sdkAuthSignature\` is required when SDK Authentication is enabled.")` before bridging. Web: throw the same error. ~30 LoC across three files + a test in `test/web/src/identity.test.ts`. |
| L5-02 | **Low** | `SECURITY.md:184-201` vs. `src/definitions.ts:22-59` | `enableAutomaticPushHandling` flag described as a plugin option does not exist. Misleads consumers into expecting a knob that's not there. | Rewrite §5 to match reality: plugin design is "consumer always owns token handoff; `registerPushToken` is the single entry point; web throws because Web Push has no token to hand off." Drop the table that pretends there's a flag. Keep the "no logging push tokens" guarantee — that one is real and verified. |
| L5-03 | **Low** | `SECURITY.md:164-173` vs. `src/web.ts:756`, `ios/Plugin/BrazePlugin.swift:96`, `android/.../BrazePlugin.kt:128` | §4 claims "parses `endpoint` URL client-side… rejects malformed URLs… warns on unknown clusters". Actual check is `startsWith("http://")` only. | Either implement (`new URL(maybeHttps)`, catch, reject malformed; maintain a small `KNOWN_CLUSTERS` set and `console.warn` on mismatch in web/native) OR downgrade §4 to "rejects explicit `http://` schemes unless `allowInsecureEndpoint: true`. URL parsing and cluster-list warnings are planned for a later version." The latter is the smaller, more honest change. |
| L5-04 | **Low** | `SECURITY.md:96-99, 161-167` vs. `src/definitions.ts` listener overloads | `addListener('sdkAuthError', ...)` is documented as if implemented but is not in the listener overload set. SDK_SURFACE.md defers SDK auth refresh listener to v0.2. | Mark §2's `'sdkAuthError'` bullet as "v0.2+". Keep `setSdkAuthenticationSignature` (which IS implemented). Same for §6 `inAppMessageReceived` and §7 `deepLinkReceived` — gate per-version in the doc. |
| L5-05 | **Low** | `SECURITY.md:340-352, 360-378` vs. `.github/workflows/`, `.github/dependabot.yml` | Snyk, gitleaks, signed-commits enforcement, SHA-pinned Actions — all listed as current, none implemented in CI. | Either implement (signed-commits branch protection on `main`, `crazy-max/ghaction-import-gpg`-style commit signing for bot PRs, replace `@v4` with SHA pins in workflows) OR downgrade SECURITY.md prose to "planned for 1.0". For 0.1.0, npm-audit + dependabot + manual review is a reasonable bar — just document that bar honestly. |
| L5-06 | **Low** | `.github/dependabot.yml` | Doesn't watch `/demo` (newer than the file) or `/test/mock-server`. SECURITY.md §12 claims both are watched. | Add two more `updates:` blocks for `/demo` and `/test/mock-server`. 5-line change. |
| L5-07 | **Trivial** | `SECURITY.md:386-396` | Disclosure section uses literal `security@<future-domain>` and `PGP key: <fingerprint>` — looks like an unfilled template. | Replace with a one-sentence note: "Until a dedicated security email is set up, report via GitHub Security Advisories (private vulnerability reporting is enabled on the repo): https://github.com/bma342/capacitor-braze/security/advisories/new". |
| L5-08 | **Trivial** | `ios/Plugin/BrazePlugin.swift:108-113`, `android/.../BrazePlugin.kt:152-158` | `sessionTimeoutInSeconds <= 0` is silently ignored on native (clauses guard `> 0`). Web rejects. Inconsistent per C04. | On iOS and Android, change the `> 0` guard to an explicit rejection when `sessionTimeoutInSeconds` is present but `<= 0`. ~4 LoC each. |
| L5-09 | **Trivial** | `SECURITY.md` introduction | First non-affirmative claim that might wrong-foot a reviewer: "PII leakage via debug logs / crash reports" is rated Medium, "addressed via prod-safe defaults". The plugin layer is actually stronger than that — it doesn't log PII at all, regardless of the consumer's debug setting. Sell the win. | Tighten the §0 table cell to "addressed by zero plugin-level PII logging plus prod-safe Braze SDK logging defaults". |

## What's good

- **Zero PII log surface in plugin code.** I grep'd every native log family (`Log.*`, `os_log`, `NSLog`, `print(`, `console.log`, `System.out`, `println`) across `ios/Plugin/`, `android/.../braze/`, `src/`. Plugin layer emits no log lines except `console.warn` once in the demo (correctly gated on missing env vars, not PII). Better than the §3 claim — there's nothing to mask because nothing logs.
- **Default-deny is real.** All three platforms use strict-equality `=== true` / `getBool(..., false)` / `getBoolean(..., false)` for the security toggles. `'true'` / `1` / `'yes'` won't disable HTTPS enforcement. Matches C06 §6.
- **No `postinstall` or `prepare` scripts** in plugin, example, or demo. Only `prepublishOnly: npm run build`. The most common supply-chain attack vector is closed.
- **Provenance attestation enabled.** `npm publish --provenance --access public` plus `id-token: write` in `release.yml`. The npm package will ship signed attestation visible on registry.
- **Runtime deps minimal.** `npm ls --omit=dev`: only `@braze/web-sdk`. No surprise tracking SDK, no telemetry, no analytics shim.
- **Test coverage on the security defaults.** `test/web/src/validation.test.ts:31` explicitly tests `http://` rejection without `allowInsecureEndpoint`. The default-deny path is pinned.
- **Privacy/lifecycle quartet is genuinely init-independent on Web + Android** per C07, with iOS asymmetry properly documented in C07's BrazeKit 14.x section and reflected in `BrazePlugin.swift:660-708`. The platform divergence is handled with care, not silently.
- **`.env.example` is empty + git-ignored variants** (`.env`, `.env.local`, `.env.*.local`). Demo's `client.ts` reads `import.meta.env.VITE_BRAZE_API_KEY` with a no-op fallback for missing config. Example app uses an input field, not a hardcoded value.
- **CapacitorBraze.podspec pins BrazeKit + BrazeUI to exact `14.1.0`.** Android pins `com.braze:android-sdk-ui:42.2.0`. Web is peer-dep range. Lockfile is committed. Native SDK supply chain has no float.
- **`PrivacyInfo.xcprivacy` is honest.** Doesn't duplicate BrazeKit's declarations, correctly states the plugin binary doesn't track/transmit, leaves consumer-app declarations to the consumer.

## What's risky

- **SECURITY.md is the front door for a Braze-senior security review.** Anything in it that doesn't reflect code is now a credibility hit, not a planning aid. The §2 `BrazeAuthRequiredError` claim, the §5 `enableAutomaticPushHandling` flag, the §4 URL parsing — these read as "we built this" but the bridges don't show it. Pre-0.1.0, either ship the controls or tighten the doc. Pick one.
- **L5-01 (the only Medium) is the most credibility-load-bearing one.** A reviewer looking for the spoofing defense will land on §2, then walk to `changeUser` in any of the three bridges, and discover the rejection isn't there. This is the kind of finding that turns a friendly review into a "did you actually build what you said you built" review. ~30 LoC closes it.
- **Push token handoff lifecycle is not stress-tested.** §5 promises "no logging push tokens, no persistence outside Braze SDK storage" — true by inspection (no log lines), but `registerPushToken` accepts any string and hands it to the SDK. Worth a smoke test that calls `registerPushToken` with a non-token string (e.g., a JWT-looking value) and confirms the bridge doesn't echo it anywhere. C11 native test harnesses planned per the MDC index.
- **Signed-commits + branch-protection claims are aspirational.** A consumer or auditor verifying §13 via `git log --show-signature` will find zero signed commits. Pre-1.0 this is fine; the SECURITY.md prose just needs to admit it.
- **The aspirational/done line in SECURITY.md is invisible.** A reader has no way to tell which controls are live, which are pre-1.0, which are post-1.0. Adding a status column (`live` / `v0.2` / `v1.0`) to each subsection's claims table would close the gap with one structural change instead of fixing every paragraph individually.
