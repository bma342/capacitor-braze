# Audit archive — 2026-05-22 (`a726357`, version `0.0.12`)

> **This is history, not an open punch list.** It is a point-in-time self-audit of the repo as it
> stood at `0.0.12`, written before `0.1.0` shipped. Its verdict line — *"Tag `0.1.0` today? **NO**"*
> — was accurate on 2026-05-22 and is no longer. **Every BLOCKER and every MAJOR below is closed**,
> in `0.1.0` or in `0.2.0`; the per-finding table records which, and names the one finding that
> `0.1.0` claimed to have fixed but had not.
>
> Kept as provenance: the audit found and drove the fixes for 3 BLOCKERs and ~22 MAJORs, and the
> `0.1.0` CHANGELOG maps individual fixes back to these IDs. The successor audit lives in
> [`../2026-09/`](../2026-09/).

Files here are **unmodified snapshots**. Where they contradict the current code, the code wins.
Statements inside them that are now false include: *"`test/ios/` does not exist. `android/src/test/`
does not exist"* (both exist), *"there are 2 listener events"* (4), *"92/92 in 3.06s"* (154), and
the `SECURITY.md` §2 / §4 **FAIL** marks in `L5-security.md` (both implemented).

## Resolution status by finding

Legend: **0.1.0** = closed in the 0.1.0 release · **0.2.0** = closed in the 0.2.0 release ·
**clean bill** = recorded as verified-correct, no action was required · **open** = still open, with
a pointer to where it is now tracked.

### L1 — Contract integrity

| ID | Sev | Status | Note |
|---|---|---|---|
| L1-01 | BLOCKER | **0.2.0** | ⚠️ **Falsely closed in 0.1.0.** 0.1.0 removed the "init-independent" JSDoc from `getDeviceId`, but the *web* bridge still had no init guard, so the contract and the code disagreed in the other direction for four months. The 2026-09 audit re-found it as A1-04; `src/web.ts` now calls `requireInitialized()` and a test pins it. |
| L1-02 | MAJOR | **0.2.0** | 0.1.0 documented the iOS `enableSDK` / `isDisabled` asymmetry. 0.2.0 **removed** it: the plugin keeps the consent decision in its own state and applies it when `initialize` creates the instance, so all three platforms now behave identically. |
| L1-03 | MAJOR | **0.1.0** | `inAppMessageReceived` and `sdkAuthError` shipped; 4 listener events. (iOS's `sdkAuthError` was wired to the wrong delegate and only started firing in 0.2.0 — see 2026-09 A2-01.) |
| L1-04 | MINOR | **0.1.0** | Documented in the listener JSDoc and in [C05](../../mdcs/C05-LISTENERS.md): a listener added before `initialize` is silently inert. |
| L1-05, L1-06 | NIT | clean bill | Recorded as correct; no action taken or needed. |

### L2 — Cross-platform translation

| ID | Sev | Status | Note |
|---|---|---|---|
| L2-01 | BLOCKER | **0.1.0** | iOS `serializeFeatureFlag` emits the C02 tagged union. |
| L2-02 | BLOCKER | **0.1.0** | Native `serializeContentCard` emits the 4-string discriminator. |
| L2-03 | MAJOR | **0.1.0** | The "integer vs float" JSDoc claim (impossible in JS) was removed. |
| L2-04 | MAJOR | **0.1.0** | Web `setCustomUserAttribute` validates the value type. |
| L2-05 | MAJOR | **0.1.0** | Web card classification uses `instanceof`, not field presence. |
| L2-06 | MAJOR | **0.1.0** | `null` / `undefined` attribute values rejected on all three platforms. |
| L2-07 | MAJOR | **0.1.0** | Per-field DOB messages byte-identical across platforms. |
| L2-08, L2-09, L2-10 | MINOR | clean bill | Verified-correct observations (gender mapping parity, HTTPS-check parity, an iOS `lastUpdate` capture that the code already comments). The HTTPS *string* later drifted and was re-fixed in 0.2.0 (A4-11). |

### L3 — Validation

| ID | Sev | Status | Note |
|---|---|---|---|
| L3-01 | MAJOR | **0.1.0** | Web validates the custom-attribute value type. |
| L3-02 | MAJOR | **0.1.0** | Per-field DOB messages everywhere (same fix as L2-07). |
| L3-03 | MAJOR | **0.2.0** | Android silently dropped non-scalar event/purchase property values. All three platforms now reject with ``Braze.<method>: `properties.<key>` must be string, number, or boolean.`` |
| L3-04 | MAJOR | **open — deliberate** | Property-key length/emptiness is still left to the Braze backend. Pushing a length ceiling client-side would encode a backend limit the plugin cannot keep in sync; tracked as a contract decision, not a bug. |
| L3-05 | MINOR | **0.2.0** | Native validation is no longer untested: 91 Robolectric tests assert every Android `@PluginMethod` branch byte-exact against `src/web.ts`, and 35 XCTests cover the iOS classifiers and C04 strings. |
| L3-06 | MINOR | **0.1.0** | Subsumed by L3-02 — natives emit the per-field message, so the failing field is named. |
| L3-07 | MINOR | clean bill | The extra iOS "invalid date components" path is unreachable behind the range checks; documented as an accepted platform extra. |
| L3-08, L3-09, L3-10 | NIT | clean bill | No action required. |

### L4 — Native code quality

| ID | Sev | Status | Note |
|---|---|---|---|
| L4-K01, L4-S01, L4-T01 | MAJOR | **0.1.0** | SDK Authentication enforced on all three bridges with byte-identical strings. |
| L4-K02 | MAJOR | **0.1.0** | Android `setCustomUserAttribute` uses the SDK's `Long` overload. |
| L4-S02 | MAJOR | **0.1.0 → re-fixed 0.2.0** | 0.1.0 reordered `getDouble` before `getInt`. 0.2.0 fixed the deeper bug the reorder did not: `getBool` succeeds for *any* `NSNumber` equal to 0 or 1, so `{ value: 1 }` wrote `true`. The bridge now discriminates with `CFGetTypeID`. |
| L4-S03, L4-S04 | MAJOR | **0.1.0** | iOS init re-entrance + closure lifetime. 0.2.0 went further and moved all iOS plugin state into one main-actor isolation domain. |
| L4-S05 | MAJOR | **0.2.0** | Covered by the iOS threading refactor. |
| L4-S11 | MINOR | **0.1.0** | `import BrazeUI` + `BrazeInAppMessageUI` presenter wired, so the ~2 MB BrazeUI dependency is no longer dead weight. |
| L4-T02, L4-P03 | MAJOR/MINOR | **0.1.0** | Capacitor 7 forward-compat range + bounded podspec range. |
| L4-T03 | MINOR | **0.1.0** | `noUncheckedIndexedAccess` enabled. |
| L4-T06 | MINOR | **0.1.0 → superseded 0.2.0** | The boolean subscription flags it fixed were replaced entirely by stored subscription GUIDs with real teardown. |
| L4-T09, L10-01 | NIT/MAJOR | **0.1.0** | ESLint `_options` warning. |
| L4-K04, L5-08 | MINOR/Trivial | **0.1.0** | `Month.entries`; explicit `sessionTimeoutInSeconds <= 0` rejection. 0.2.0 additionally rejects *non-integer* values rather than coercing. |
| L4-K05 | MINOR | **0.1.0** | Legacy appboy Maven URL dropped from `android/build.gradle`. |
| Remaining L4-K / L4-S / L4-T / L4-P / L4-Q MINOR + NIT rows | MINOR/NIT | mixed | Style, comment and structure observations absorbed by the 0.1.0 cleanup phases and the 0.2.0 bridge rewrites. The 2026-09 audit re-examined both bridges line by line and its findings supersede these — see [`../2026-09/A2-ios.md`](../2026-09/A2-ios.md) and [`../2026-09/A3-android.md`](../2026-09/A3-android.md). |

### L5 — Security

| ID | Sev | Status | Note |
|---|---|---|---|
| L5-01 | Medium | **0.1.0** | Signature-less `changeUser` rejected on all three bridges. (The promised `BrazeAuthRequiredError` *class* was never built; 0.2.0's SECURITY.md quotes the real error string instead — see 2026-09 A4 / A6-34.) |
| L5-02 | Low | **0.1.0** | The phantom `enableAutomaticPushHandling` option was removed from SECURITY.md §5. 0.2.0 added a real iOS equivalent, `enablePushAutomation`. |
| L5-03 | Low | **0.1.0 → completed 0.2.0** | 0.1.0 added URL parsing on all three platforms and the cluster warning on web only. 0.2.0 ported the cluster check to iOS and Android and stopped it logging the endpoint value. |
| L5-04 | Low | **0.1.0 → really 0.2.0 on iOS** | The `sdkAuthError` listener shipped in 0.1.0, but on iOS it was attached to `BrazeDelegate`, which does not declare the callback — it never fired until 0.2.0 moved it to `braze.sdkAuthDelegate`. |
| L5-05 | Low | **partly 0.1.0, completed 0.2.0** | gitleaks + Snyk steps and signed commits landed in 0.1.0. The Snyk step could never execute; in 0.2.0 it was first repaired and then **removed** (its token was never provisioned), with CodeQL added in its place. SHA-pinning of Actions landed in 0.2.0. |
| L5-06 | Low | **0.1.0 → corrected 0.2.0** | Dependabot gained `/demo` and `/test/mock-server` in 0.1.0, but the mock-server entry declared `gradle` for an npm project and was inert; fixed in 0.2.0, which also added `/test/web`. |
| L5-07 | Trivial | **0.1.0** | Disclosure placeholder replaced with the GitHub private-advisory pointer. Note that **private vulnerability reporting still has to be switched on by the maintainer** — see [CONTRIBUTING → Maintainer pre-tag checklist](../../../CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020). |
| L5-08 | Trivial | **0.1.0** | See L4-K04. |
| L5-09 | Trivial | **0.2.0** | SECURITY.md §3 now states the actual (stronger) posture — the bridge emits no PII-bearing logs at all — instead of describing a masking scheme that was never implemented. |

### L6 — Test rigor

| ID | Sev | Status | Note |
|---|---|---|---|
| L6-01 | MAJOR | **0.1.0 → completed 0.2.0** | Android Robolectric tests landed in 0.1.0 (7, in CI). The iOS XCTest files landed too but had **no Xcode target and were never compiled**; 0.2.0 added `scripts/ios-add-test-target.rb` and runs 26 tests in CI. Android is now 74. |
| L6-02 | MAJOR | **open** | The Layer 4 real-Braze smoke has still never been run. Templates only, in [`docs/smoke-tests/`](../../smoke-tests/). Neither 0.1.0 nor 0.2.0 is validated against a live Braze backend, and both README and CHANGELOG say so. |
| L6-03 | MINOR | **open — deliberate** | Still no coverage instrumentation; `docs/TEST-COVERAGE-AUDIT.md` remains hand-maintained. Re-raised as 2026-09 A5. |
| L6-04 | MINOR | **partly 0.2.0** | Mock-server teardown now destroys the SDK before stopping the server, roughly halving the stray `ECONNREFUSED` noise. The cross-file hazard is gone; some in-flight-request noise remains. |
| L6-05 | MINOR | **0.2.0** | The docs said Ktor for four months. Every doc now says Fastify. |
| L6-06 | NIT | **0.2.0** | `freshPluginWithConfig` / `teardownPlugin` are documented in `test/README.md` and CONTRIBUTING. |

### L7 — CI / release

| ID | Sev | Status | Note |
|---|---|---|---|
| L7-01 | MAJOR | **0.1.0 → really 0.2.0** | 0.1.0 added a SwiftLint step, but `.swiftlint.yml` pointed `parent_config` at a nonexistent file and `node-swiftlint` exits 0 when the binary is missing — so the gate never ran. 0.2.0 inlines the ruleset, installs the binary in CI, and lints `ios/PluginTests` too. |
| L7-02 | MINOR | **open — deliberate** | No bundle-size budget job. The budgets in `REVIEW_READINESS.md` are now labelled as aspirational rather than CI-enforced. |
| L7-03 | MINOR | **open — deliberate** | No daily spec-drift job, and the five docs that claimed one had it removed in 0.2.0. |
| L7-04 | MINOR | **0.2.0** | `release.yml` now calls `test.yml` as a reusable workflow, so publish waits on the entire suite including both native verify jobs. |
| L7-05 | MINOR | **0.2.0** | Dependabot covers `/test/web` and `/test/mock-server`. |
| L7-06 | MINOR | **0.2.0** | The release workflow greps `CHANGELOG.md` for the version being released and fails without it. |
| L7-07 | NIT | **open — deliberate**, but moot in practice | `npm audit --omit=dev` is still the CI gate. The EOL ESLint 8 chain that motivated the carve-out is gone (ESLint 10 flat config; see 2026-09 A4-21), so a full `npm audit` including dev now reports 0 vulnerabilities anyway. |

### L8 — Consumer surface

| ID | Sev | Status | Note |
|---|---|---|---|
| L8-01 | MAJOR | **0.1.0** | ESLint `_options` warning. |
| L8-02, L8-03, L8-05 | MINOR | clean bill | Spot-checks that came back clean (no secrets in the demo, `.gitignore` effective, `@braze/web-sdk` correctly a direct dep in a forkable starter). |
| L8-04 | MINOR | **0.2.0** | The README's "2 events" count is fixed; the 35-vs-36 discrepancy was a counting artefact (35 methods; `removeAllListeners` is the 36th `Promise`-returning member). |
| L8-06, L8-07 | NIT | **open — cosmetic** | Example-app screenshots in the README, and one awkward sentence. |

### L9 — Documentation (`F1`–`F20` in that file)

| ID | Sev | Status | Note |
|---|---|---|---|
| F1 | MAJOR | **0.1.0** | CLAUDE.md SDK pins corrected. Corrected again in 0.2.0 for the 18.2.1 / 43.2.0 bump. |
| F2 | MAJOR | **0.2.0** | ⚠️ **Partly falsely closed in 0.1.0.** The CHANGELOG claimed `BrazePlugin.podspec` → `CapacitorBraze.podspec` was fixed, but [C08](../../mdcs/C08-NATIVE-SDK-PINNING.md) still carried the dead link. Fixed in 0.2.0 and now covered by a repo-wide relative-link check. |
| F3 | MAJOR | **0.2.0** | `PLAN.md` now opens with a dated "as-planned; superseded by" banner and its §14 open decisions are closed with their actual outcomes. |
| F4 | MAJOR | **0.2.0** | `SDK_SURFACE.md`'s §1 matrix was rebuilt against `src/definitions.ts`; the unshipped rows are back in the roadmap. |
| F5, F6 | MAJOR | **0.1.0** | C02's iOS worked examples and the content-card divergence. |
| F7–F13 | MINOR | **0.2.0** | Every `file:line` reference in C01–C11 was stale; all 29 were re-verified and rewritten to symbol-anchored references that cannot drift. |
| F14 | MINOR | **0.2.0** | C08's dead `CLAUDE.md#release-process` anchor. |
| F15, F16 | MINOR | **0.2.0** | The test-count contradictions (68 / 74 / 92 / 33-of-37) are gone; one number, 154, sourced from a live run. |
| F17 | NIT | **0.2.0** | Internal phase names replaced with version references in C07. |
| F18, F19, F20 | NIT | **0.2.0** | `SDK_SURFACE.md`'s broken legend sentence and stale timestamp; `PLAN.md`'s aspirational lighthouse claim is now inside the history banner. |

### L10 — Pre-publish

| ID | Sev | Status | Note |
|---|---|---|---|
| L10-01 | MAJOR | **0.1.0** | See L8-01. |
| L10-02 | MAJOR | **0.1.0** | 0.1.0 was tagged and published. |
| L10-03 | MINOR | **0.2.0** | SwiftLint is installed and asserted in CI (see L7-01). |
| L10-04 | MINOR | **0.2.0** | The tarball is now asserted by a `pack-check` CI job; `android/proguard-rules.pro` was deleted and its `files` entry with it, and `CHANGELOG.md` + `SECURITY.md` were added. |
| L10-05, L10-06, L10-07 | MINOR/NIT | clean bill | Size observations. Source maps and the `.d.ts` still ship deliberately. |

## Still open after 0.2.0

Only four, and all four are stated in the README's *Known gaps* section:

1. **L6-02** — no Layer 4 capture against a live Braze backend.
2. **L6-03 / L7-02** — no coverage instrumentation, no bundle-size budget in CI.
3. **L7-03** — no spec-drift job (deliberate; the mock server is maintained by hand).
4. **L3-04** — property-key length limits left to the backend.
