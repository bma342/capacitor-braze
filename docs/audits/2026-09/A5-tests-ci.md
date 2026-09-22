> **Archived audit report — read the resolution table first.**
> Point-in-time review of `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated 2026-09-22.
> The findings below were current *then*. The table immediately after this banner records what
> happened to each one in `0.2.0`. Where the report and the current code disagree, the code wins.
> Index of audits: [`../README.md`](../README.md).
>
> Headline numbers after the fixes: **154** web tests (14 files), **74** Android Robolectric tests,
> **26** iOS XCTests — all three run in CI. Layer 4 against a real Braze backend has **still never
> been run**.

## Resolution status

| ID | Status in 0.2.0 | Note |
|---|---|---|
| A5-01 | fixed | `scripts/ios-add-test-target.rb` generates a `CapacitorBrazeTests` bundle in the demo's Xcode project (idempotent, with a committed shared scheme), CI runs `xcodebuild test`, and the suite grew 5 → **26**. It had never been compiled before. |
| A5-02 | fixed | 7 → **74** Android tests. `initialize` runs end-to-end under Robolectric, so post-init branches are reachable; every `@PluginMethod` validation branch and every serializer is covered against real Braze model objects. The vacuous `setDateOfBirth` test and the false class docstring are gone. |
| A5-03 | fixed | `release.yml` now gates on the full `test.yml` suite, checks the CHANGELOG for the version, refuses to publish a version already on the registry, dry-runs first, and verifies the attestation afterwards. `0.1.0`'s out-of-band publish is disclosed rather than hidden. |
| A5-04 | fixed | Every attribute setter asserts its Braze wire key, so swapping `setFirstName`/`setLastName` (or country/language/homeCity) now fails. |
| A5-05 | fixed | Subscription-group tests assert `"status":"subscribed"` / `"unsubscribed"`. |
| A5-06 | fixed | An `it.each` over all six genders asserts the wire value, plus the new required-field rejection. |
| A5-07 | fixed | CI installs SwiftLint explicitly and asserts the binary answers before `--strict` runs. See [A2-13](./A2-ios.md). |
| A5-08 | fixed | The `gradle`-ecosystem entry for an npm project is now `npm`; `/test/web` added. |
| A5-09 | **open** | Layer 4 has still never been executed. The wrappers now build the plugin first and run from any cwd, but `docs/smoke-tests/` contains only templates. Stated in the README, the CHANGELOG and `REVIEW_READINESS.md`. |
| A5-10 | partly fixed | `sdkAuthError` now has end-to-end coverage on web (the mock returns a scripted `auth_error` body) and payload-shape coverage on iOS and Android. `inAppMessageReceived` is covered at the **serializer** level against real SDK message classes on all three platforms; the **delivery path** is not, because it means reproducing Braze's trigger-delivery envelope. Stated in the test file's header rather than left implied. The example app gained the two missing listener buttons (A5-24). |
| A5-11 | fixed | See [A4-17](./A4-security.md). |
| A5-12 | fixed | One build, one exit code; the `\| xcpretty \|\| true` pass is gone (xcpretty is not on the macOS 26 image either), and `DEVELOPER_DIR` pins an Xcode 26.x with a fallback and a hard error. |
| A5-13 | fixed | See [A4-15](./A4-security.md). |
| A5-14 | fixed | `test-web` type-checks `test/mock-server` and `test/web` with their own strict tsconfigs; `npm run typecheck:tests` mirrors it locally. |
| A5-15 | **open — deliberate** | Still no coverage instrumentation; `docs/TEST-COVERAGE-AUDIT.md` remains a hand-maintained table and now says so. |
| A5-16 | partly fixed | `teardownPlugin` destroys the SDK (the only thing that clears its flush-retry timer) before stopping the mock, which removed the cross-file zombie-SDK hazard — the part that could actually flake. Some in-flight-request noise remains in the per-test-lifecycle files. |
| A5-17 | fixed | JDK 21, and `:capacitor-braze:lintDebug` with `abortOnError true`. See [A3-16](./A3-android.md). |
| A5-18 | **open — deliberate** | The mock server was not changed; no new response shapes were needed, and the scripted `auth_error` body went through its existing `respondTo` hook. Deeper endpoint modelling remains a follow-up. |
| A5-19 | fixed | The test that made a live outbound call to Braze production (and left the SDK singleton pointed there) is gone; cluster-warning behaviour is now driven through the synchronous validator. |
| A5-20 | partly fixed | The `pack-check` tarball job was added. Bundle-size budgets and a scheduled spec-drift job were **not** added — both are new capabilities, and the docs that claimed a spec-drift job existed were corrected instead. |
| A5-21 | **maintainer action — not done** | See [A4-22](./A4-security.md); triage in CONTRIBUTING. |
| A5-22 | fixed | The click/impression wire assertions are separate `it()` blocks behind a shared fixture. |
| A5-23 | fixed | `"q":3` and `"pr"` are asserted, plus a non-integer-quantity rejection. |
| A5-24 | fixed | The example app has buttons for all four listener events. |
| A5-25 | fixed | Every row in that stale-claims table was corrected. The Jest / Ktor / Maestro fiction is gone from `CLAUDE.md`, `SECURITY.md` and `PLAN.md`; the test counts agree everywhere; the `test/README.md` "ships one test" line is gone; the deferral headers in the web test files were removed as the deferrals were closed. |

---

# A5 — Test Rigor & CI

**Audit date:** 2026-09-22 · **Commit:** `0ab8e19` (main, clean) · **Version:** `0.1.0`

**Verified locally:** `npm test` → **14 files / 108 tests, all pass, 2.06s**. `npm run lint` → passes (ESLint + Prettier clean; SwiftLint *silently skipped*, see A5-07). Mock-server wire format captured via an out-of-repo probe harness (scratchpad only; repo untouched).

## Verdict

| Lens | Result |
|---|---|
| Web test layer | **PASS with real gaps** — genuinely good harness, but several assertions are field-name-agnostic and would not catch a swapped-argument bug |
| Native test layer | **GAP** — Android covers 3 of 35 methods; iOS tests are **never compiled or run anywhere** |
| CI workflow | **PASS with gaps** — 8 well-scoped jobs, but no `permissions:`, `npm install` over `npm ci`, a silent-pass SwiftLint gate |
| Release pipeline | **GAP** — the release workflow has **never succeeded**; the one run (v0.1.0) failed at publish |
| Layer 4 (real Braze) | **NOT DONE** — only unfilled templates; L6-02 remains fully open |

May-2026 audit items **still open** after the 0.1.0 "closure" pass: L6-01 (partial — iOS side not closed), L6-02, L6-03, L6-04, L6-05, L7-02, L7-03, L7-04, L7-05, L7-06, L7-07. Only L6-06 and L7-01 (the latter with a caveat — see A5-07) are genuinely closed.

---

## Findings

### A5-01 — iOS XCTest suite is never compiled, never linted, never run — anywhere
**Severity: MAJOR** · **Confidence: certain**

`ios/PluginTests/BrazePluginContractTests.swift` (123 lines, 5 `func test…`).

Evidence:
- `.swiftlint.yml:1-2` — `included: [ios/Plugin]`. `ios/PluginTests` is outside the lint scope.
- `package.json:12-19` (`files`) ships `ios/Plugin/` only — the test dir is not in the tarball.
- `CapacitorBraze.podspec` declares no test spec.
- `.github/workflows/test.yml` `verify-ios` (lines 233-295) builds `demo/ios/App` — it never references `ios/PluginTests` and never runs `xcodebuild test`.
- No `.xcodeproj` / `Package.swift` anywhere references the directory. The file's own header (lines 21-30) admits the Xcode target is a manual "maintainer wires it up" step.

So these 5 tests have **never been type-checked against BrazeKit 14.1.0**. They call `Braze.InAppMessage.Slideup(data:graphic:imageAltText:language:message:slideFrom:)` and `Braze.InAppMessage.Modal(data:graphic:…headerTextAlignment:…)` with full memberwise initialisers — exactly the API surface most likely to have drifted. They may not even compile.

Why it matters: `CHANGELOG.md:37` says "iOS XCTest contract tests under `ios/PluginTests/`. **Closes L6-01.**" A reviewer who greps for how those tests run will find nothing and conclude the changelog overstates. Uncompiled test code is worse than no test code — it reads as coverage that doesn't exist.

Fix: either (a) commit a `Package.swift` test target or an `ios/PluginTests/PluginTests.xcodeproj` and add an `xcodebuild test` step to `verify-ios`, or (b) if that's post-review work, add `ios/PluginTests` to `.swiftlint.yml:included` at minimum, and restate the CHANGELOG/CLAUDE.md line as "scaffolded, not yet executed."

---

### A5-02 — Android Robolectric suite covers 3 of 35 methods, one test is vacuous, and its own header overstates its coverage
**Severity: MAJOR** · **Confidence: certain**

`android/src/test/java/com/bma342/braze/BrazePluginContractTest.kt` — 7 tests total:

| Test | Method | Meaningful? |
|---|---|---|
| `echo rejects when value is missing` (47) | `echo` | yes — byte-exact C01 string |
| `echo resolves when value is present` (59) | `echo` | yes |
| `initialize rejects empty apiKey…` (70) | `initialize` | yes — byte-exact |
| `initialize rejects http endpoint…` (84) | `initialize` | yes — substring |
| `initialize rejects malformed endpoint…` (98) | `initialize` | yes — substring |
| `initialize rejects sessionTimeoutInSeconds of zero` (116) | `initialize` | yes — byte-exact |
| `setDateOfBirth emits per-field year error` (133) | `setDateOfBirth` | **vacuous** |

Two concrete problems:

1. **The `setDateOfBirth` test is vacuous and misnamed.** Line 151 asserts only `captor.value.startsWith("Braze.")`. Lines 146-150 admit in a comment that *"the pre-init guard fires first"* — so the test named "emits per-field year error" never reaches year validation. It would pass if `setDateOfBirth` were deleted and replaced with `call.reject("Braze.")`. This is the single most likely thing a reviewer will pull on.

2. **The file header claims coverage it does not have.** Lines 23-25: *"This file covers the audit-fix contract surface: validation strings, **SDK Auth enforcement**, and the **pure-function serializers**."* Neither SDK Auth enforcement nor any serializer is tested (`grep -c "sdkAuth\|serialize"` → 0). Lines 43-45 also claim setUp "assigns it a mocked bridge"; it does not (`plugin = BrazePlugin()`, no bridge).

Coverage denominator: 32 of 35 methods and 4 of 4 listener events have **zero** Android test. The Kotlin bridge ships on "it compiles" for everything except `echo` and `initialize`.

Fix: delete or rename+repair the `setDateOfBirth` test (gate the init guard so per-field validation is actually reached); correct the header comment; extend to the C04 validation strings for the remaining ~20 validating methods — that's mechanical and high-yield, since the C04 contract is "byte-identical error strings across bridges" and nothing currently enforces it on Android.

---

### A5-03 — The release workflow has never succeeded; v0.1.0 was published out-of-band
**Severity: MAJOR** · **Confidence: certain**

`gh api repos/bma342/capacitor-braze/actions/runs/26314173939/jobs`:

```
"Publish to npm + create GitHub Release": conclusion=failure
  ... "Verify package.json version matches tag"  success
      "Publish to npm with provenance"           FAILURE
      "Create GitHub Release"                    skipped
```

That is the **only** run of `.github/workflows/release.yml` ever (`gh run list --workflow=Release`). Yet `gh release list` shows `v0.1.0` exists and the package is on npm. Both were therefore created outside the workflow — meaning the npm artifact has **no provenance attestation**, despite `release.yml:56` and `REVIEW_READINESS.md:380` claiming provenance publish from CI, and `CLAUDE.md:105` marking "`0.1.0` to npm ✅".

Compounding gaps in the same file (all still-open L7 items):
- `release.yml:39-56` — **no test, lint, or audit gate before publish** (L7-04). A `git tag && git push --tags` publishes whatever is at that commit.
- No CHANGELOG entry assertion for the released version (L7-06).
- No `npm publish --dry-run` / `npm pack` verification step.
- `release.yml:61` — `softprops/action-gh-release@v2` is a floating major tag, contradicting `.github/dependabot.yml:74`'s stated "SHA-pinned via Dependabot" policy (every action in both workflows is `@v4`/`@v5`, none SHA-pinned).

Fix: add `npm run lint && npm test` + a CHANGELOG-section grep before `npm publish`; re-run the release path on a `v0.1.1` (or `npm publish --provenance` from a re-tagged workflow run) so the published artifact actually carries attestation; SHA-pin the actions or drop the claim.

---

### A5-04 — Attribute-setter tests are field-name-agnostic: swapping `setFirstName`/`setLastName` (or country/language/homeCity) would still pass
**Severity: MAJOR** · **Confidence: certain (empirically verified)**

`test/web/src/attributes.test.ts:52-127`. Every setter test is of the form:

```ts
const firstName = 'PluginTestFirstNameD9F1';
await plugin.setFirstName({ firstName });
await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(firstName));
```

The file states the choice explicitly at lines 12-15: *"We don't assert Braze's exact payload field names."* But the real wire body **does** carry them. Captured from the actual `@braze/web-sdk` 6.7.1 → mock path:

```json
"attributes":[{"user_id":"probe_user","first_name":"FIRSTNAME_X","last_name":"LASTNAME_Y",
               "country":"COUNTRY_Z","language":"LANG_Q","home_city":"CITY_W","gender":"f"}]
```

Consequence: if `setLastName` were re-pointed at `getUser().setFirstName(...)` — the classic copy-paste bridge bug, and precisely what C01's 8-file lockstep is meant to catch — the unique sentinel still lands in the body and **all six tests stay green**. The same holds for `setCountry` ↔ `setLanguage` ↔ `setHomeCity`, and for `setEmail` ↔ `setPhoneNumber`.

The suite already proves the stricter assertion is achievable: `attributes.test.ts:137` asserts `'"dob":"1987-7-14"'`, and `content-cards-populated.test.ts:172` asserts `'"name":"ccc"'`.

Fix: change the predicates to key-scoped matches, e.g. `body.includes('"first_name":"PluginTestFirstNameD9F1"')`. Six one-line edits; turns six near-tautologies into real regression tests.

---

### A5-05 — Subscription-group tests never assert `status`, so add/remove are indistinguishable
**Severity: MAJOR** · **Confidence: certain (empirically verified)**

`test/web/src/subscription-groups.test.ts:33-51`. Both tests assert only that the `groupId` string appears in the body. The wire distinguishes them:

```json
{"name":"sgu","data":{"group_id":"GROUP_ADD","status":"subscribed"}}
{"name":"sgu","data":{"group_id":"GROUP_REM","status":"unsubscribed"}}
```

If `removeFromSubscriptionGroup` called `addToSubscriptionGroup`'s SDK path, both tests pass. That is a compliance-relevant bug class (a user who unsubscribes stays subscribed) with zero test pressure on it.

Fix: assert `'"group_id":"…","status":"subscribed"'` / `"unsubscribed"` respectively.

---

### A5-06 — `setGender` has no wire assertion at all, leaving the C03 gender mapping untested
**Severity: MAJOR** · **Confidence: certain (empirically verified)**

`test/web/src/attributes.test.ts:142-152` loops all six `BrazeGender` values and asserts only `.resolves.not.toThrow()`. The comment at 144-147 concedes: *"We don't assert HTTP traffic here."*

`src/web.ts:51-58` maps `male→'m', female→'f', other→'o', unknown→'u', not_applicable→'n', prefer_not_to_say→'p'` — a six-way single-letter mapping that is *exactly* the kind of per-platform translation C03 exists to govern, and that must match the iOS/Android maps byte-for-byte. Probe confirms it reaches the wire as `"gender":"f"`. Today, transposing `'m'` and `'f'` in `WEB_GENDER_MAP` breaks no test on any platform.

Only the negative case (`rejects an unknown value`, line 154) is meaningfully asserted.

Fix: one test that sets each gender + flushes and asserts the `"gender":"<code>"` pair — six assertions in a single `it.each`.

---

### A5-07 — `npm run swiftlint` exits 0 when SwiftLint is absent, so the `--strict` CI gate can silently no-op
**Severity: MAJOR** · **Confidence: certain (verified)**

Verified locally:

```
$ npm run swiftlint -- lint --strict >/dev/null 2>&1; echo $?
0
```

Output was `!!! WARN: SwiftLint not found in PATH` — a warning, exit status 0. The `node-swiftlint` wrapper does not fail when the binary is missing.

`.github/workflows/test.yml:259-263` is the only Swift style gate in CI, and `L7-01` was declared closed by adding it. It works today only because `macos-latest` happens to preinstall SwiftLint. When GitHub rotates that image (they periodically drop preinstalled tooling), the step turns into a green no-op and nobody is notified. Same hazard applies to `xcpretty` at line 286, which is also never installed.

Fix: add `command -v swiftlint || { echo "::error::swiftlint missing"; exit 1; }` before the step, or install it explicitly (`brew install swiftlint`) so the dependency is declared rather than assumed.

---

### A5-08 — Dependabot's `gradle` ecosystem points at a directory that has no Gradle project; the job has failed weekly for months
**Severity: MAJOR** · **Confidence: certain**

`.github/dependabot.yml:66-72` declares `package-ecosystem: 'gradle'` for `/test/mock-server`. That directory is a **Fastify/npm** project (`test/mock-server/package.json`, `"dependencies": {"fastify": "^5.0.0"}`) — the Ktor plan was never built.

Dependabot log (run `32058650430`, 2026-08-17):
```
ERROR <job_1529568938> Error during file fetching; aborting: No files found in /test/mock-server
| dependency_file_not_found | { "message": "No files found in /test/mock-server" }
```
This job is red on **every weekly run** going back through 2026-07-27, 2026-08-03, 2026-08-10, 2026-08-17 in `gh run list`. A permanently red recurring job on a public repo is a bad first impression and trains the maintainer to ignore Dependabot failures.

Secondary: L7-05 remains open — `/test/web` and `/test/mock-server` npm deps (vitest, jsdom, fastify, `@braze/web-sdk`) are under **no** Dependabot coverage.

Fix: replace the gradle entry with two `npm` entries for `/test/web` and `/test/mock-server`.

---

### A5-09 — Layer 4 (real-Braze smoke) has never been executed or recorded
**Severity: MAJOR** · **Confidence: certain**

`docs/smoke-tests/` contains exactly `README.md`, `_template-android.md`, `_template-ios.md`, `_template-web.md` — **no `<platform>-YYYY-MM-DD.md` capture exists**, four months after `0.1.0`. `docs/smoke-tests/README.md:11` defines the naming convention that nothing follows.

The scripts (`scripts/smoke-{web,ios,android}.sh`) are correct as far as they go: `set -euo pipefail`, they require `BRAZE_API_KEY` and exit 1 with a playbook pointer if absent, they export `VITE_BRAZE_API_KEY`/`VITE_BRAZE_ENDPOINT` before `npm run build` (so Vite bakes them in — verified `demo/src/braze/client.ts:17-18` reads exactly those), and they run `cap sync` before opening the IDE. Two caveats worth knowing:
- `smoke-ios.sh:34-35` and `smoke-android.sh:33-35` acknowledge the *native* SDK key lives in `AppDelegate.swift` / `braze.xml` and is **not** set by the script — so `BRAZE_API_KEY` only configures the webview layer on those two platforms. A maintainer following the script without reading the echo will smoke the wrong layer.
- `BRAZE_ENDPOINT` defaults to `sdk.iad-03.braze.com`, but the usage comment in each file's header shows `sdk.us-01.braze.com`. Mismatched example vs default.

Why it matters: this is the *only* evidence that the bridge works against real Braze rather than a `{message:"success"}` catch-all. `REVIEW_READINESS.md:437` still lists it as the #1 pending item. A senior reviewer will ask "has this ever touched real Braze?" and the honest answer is no.

Fix: run one web pass (~30 min, no Xcode needed) and commit `docs/smoke-tests/web-2026-09-DD.md`. A single filled template converts this from a credibility problem into a documented, dated gap on two platforms.

---

### A5-10 — `inAppMessageReceived` and `sdkAuthError` have zero automated coverage on any platform, and are absent from the example app
**Severity: MAJOR** · **Confidence: certain**

```
$ grep -rn "inAppMessageReceived\|sdkAuthError" test/web/src/ android/src/test/
(no matches)
```

Both events are implemented and dispatched — `src/web.ts:166` (`notifyListeners('inAppMessageReceived', …)`) and `src/web.ts:182` (`notifyListeners('sdkAuthError', …)`), plus the iOS `BrazeIAMDelegate.swift` presenter and the Android IAM lifecycle. `test/web/src/listeners.test.ts` covers only `featureFlagsUpdated` and `contentCardsUpdated`.

`example/src/main.ts:190,197` wires buttons for those same two events only — the C01 8-file lockstep step 7 ("add a button so the testbed exercises the full surface") was not applied to the other two.

This directly contradicts `CLAUDE.md:97` — "`inAppMessageReceived` + `sdkAuthError` listener events | ✅ (all 3 platforms)" — which a reviewer will read as "covered."

`sdkAuthError` is the higher-value gap: it's the SDK-Authentication recovery path, is security-relevant, and is straightforward to drive (the mock can return a 401 on `/api/v3/data/` and the test asserts the listener fires with the right `userId`). `inAppMessageReceived` is harder on web but the iOS serializer for it is exactly what A5-01's dead XCTest file was meant to cover.

Fix: at minimum add the two missing example-app buttons and an `sdkAuthError` web test; note the `inAppMessageReceived` gap explicitly in the coverage audit rather than leaving it implied-covered.

---

### A5-11 — `test.yml` has no `permissions:` block
**Severity: MINOR** · **Confidence: certain**

`.github/workflows/test.yml` — no `permissions:` anywhere (compare `release.yml:21-23`, which scopes correctly). Every job therefore inherits the repo-default `GITHUB_TOKEN` scope. The `audit` job passes that token to two third-party actions: `gitleaks/gitleaks-action@v2` (line 201-203) and `snyk/actions/node@master` (line 213 — a **floating `@master` ref**, the worst supply-chain pin in the repo).

Fix: add `permissions: contents: read` at workflow level; pin `snyk/actions/node` to a tag or SHA.

---

### A5-12 — `verify-ios` builds twice, with the first build's failures deliberately swallowed
**Severity: MINOR** · **Confidence: certain**

`.github/workflows/test.yml:278-295`:
```yaml
set -o pipefail
xcodebuild build … | xcpretty || true     # pipefail defeated by `|| true`
# Re-run without xcpretty to get the actual exit code …
xcodebuild build …                        # the real gate
```
`set -o pipefail` at 278 is immediately neutralised by `|| true` at 286. `xcpretty` is never installed by the workflow, so on an image without it the first invocation fails at the pipe and is swallowed anyway. Net: the first build produces prettified logs at the cost of a full cold compile on the most expensive runner class, and contributes nothing to correctness. The second (incremental) build is the actual gate.

Fix: drop the first invocation and keep a single `set -o pipefail; xcodebuild … | tee build.log`, or install `xcpretty` and rely on `pipefail` alone.

---

### A5-13 — `npm install` instead of `npm ci` in five CI steps
**Severity: MINOR** · **Confidence: certain**

`.github/workflows/test.yml` lines **101** (example), **132** (demo), **162** (test/mock-server), **166** (test/web), **268** (demo, verify-ios), **331** (demo, verify-android). All six directories have committed `package-lock.json` files, and the `cache-dependency-path:` blocks (89-92, 119-122, 149-152) already reference them — so the cache is keyed on a lockfile the install step is free to ignore.

Why it matters: CI can install different transitive versions than the lockfile pins, so a green PR does not prove the locked tree builds. It also makes the "mock-server / example deps drifted" class of failure non-reproducible locally.

Fix: swap all six to `npm ci`.

---

### A5-14 — Test-directory TypeScript is never type-checked in CI
**Severity: MINOR** · **Confidence: certain**

- `test/web/tsconfig.json` exists (strict + `noUncheckedIndexedAccess`) but `test/web/package.json:7-10` has only `test` / `test:watch`. Vitest transpiles via esbuild and **does not type-check**, so those compiler options are inert.
- `test/mock-server/package.json:9` defines `"build": "tsc --noEmit"` — nothing in CI or in the root `package.json` ever invokes it.

By contrast `example` (`tsc --noEmit && vite build`) and `demo` (`tsc -b && vite build`) *are* type-checked, because CI runs their build scripts. The test layer is the only TS in the repo with no type gate.

Fix: add `"typecheck": "tsc --noEmit"` to `test/web` and run both it and the mock-server's `build` in the `test-web` job.

---

### A5-15 — No coverage tooling at all; the "37/37 methods covered" claim is a hand-maintained markdown table
**Severity: MINOR** · **Confidence: certain** (L6-03, still open)

`test/web/package.json` has no `@vitest/coverage-v8`, no `--coverage`, no threshold. The coverage claim in `README.md:30`, `REVIEW_READINESS.md:341/348`, and `docs/TEST-COVERAGE-AUDIT.md:6` traces back to `docs/TEST-COVERAGE-AUDIT.md`, which is manually written and already stale (A5-25).

My own method→test cross-reference (table below) confirms the *breadth* claim is true — all 35 methods plus `addListener`/`removeAllListeners` have at least one test — but breadth is what the manual table measures, and A5-04/05/06 show breadth ≠ depth. A branch-coverage number would have surfaced, e.g., that `WEB_GENDER_MAP`'s six entries are only ever read, never asserted.

Fix: `@vitest/coverage-v8` + `--coverage` in the `test-web` job, no threshold at first — just publish the number.

---

### A5-16 — `ECONNREFUSED` teardown race floods stderr and is a latent cross-file flake
**Severity: MINOR** · **Confidence: high** (L6-04, still open)

Reproduced on every local run. ~20 stack traces like:
```
stderr | src/listeners.test.ts > removeAllListeners stops subsequent callback invocations
Error: Error: connect ECONNREFUSED 127.0.0.1:55986
    at Object.dispatchError (jsdom/living/xhr/xhr-utils.js:63:19)
```
Origin: the per-test lifecycle files (`listeners.test.ts:39-47`, `feature-flags-populated.test.ts`, `content-cards-populated.test.ts`) call `mock.stop()` in `afterEach` while the Braze SDK's flush/retry timers are still live in the same jsdom realm. Nothing cancels them — `wipeData()` doesn't stop the SDK's in-flight XHR retry loop.

Two costs:
1. **Signal loss.** A run that passes looks like a run that failed. A reviewer skimming CI logs cannot distinguish expected noise from a real error.
2. **Latent flake.** `vitest` runs test *files* in parallel forks; ephemeral ports are allocated OS-wide. A zombie SDK from file A retrying against a freed port can land on file B's freshly-bound mock and append a spurious entry to `mock.captured`. Low probability, but the substring-matching predicates (A5-04) are exactly the kind that a stray body could satisfy. CI is slower and more contended than a laptop, which widens the window.

Fix: `await new Promise(r => setTimeout(r, 0))` plus `plugin.disableSDK()` before `mock.stop()`, or scope a `vi.spyOn(console, 'error')` suppression to the known-noisy teardowns.

---

### A5-17 — Android lint never runs; `abortOnError` is disabled in the library module
**Severity: MINOR** · **Confidence: certain** (L7-02-adjacent; `REVIEW_READINESS.md:394` already admits it)

`verify-android` (test.yml:339-349) runs `:app:assembleDebug` and `:capacitor-braze:testDebugUnitTest` — no `lint`. Separately `android/build.gradle:44-46` sets `lintOptions { abortOnError false }`, so even a manual `./gradlew lint` is non-failing. Android Lint is the only tool that would catch, e.g., a missing `@RequiresApi` or an API-level regression against the `minSdk 26` floor.

`demo/package.json` also defines its own `lint` script (`eslint . --ext ts,tsx --max-warnings 0`) that CI never invokes.

Fix: add `./gradlew :capacitor-braze:lint` to `verify-android` and flip `abortOnError` to `true`.

---

### A5-18 — Mock-server fidelity: catch-all with no request validation, no endpoint modelling, and no error-path coverage
**Severity: MINOR** · **Confidence: certain**

`test/mock-server/src/index.ts:131-158` is a single `fastify.all('/*')` that records the request and returns `{ message: 'success' }` (or a scripted body). What it does and doesn't do:

| Aspect | Reality |
|---|---|
| Endpoints emulated | **None individually.** One catch-all. Observed real traffic hits `/api/v3/data/`, `/feature_flags/sync`, `/content_cards/sync`. |
| Response realism | `{message:"success"}` ack is correct (matches Braze). `respondTo()` bodies for FF/CC sync are hand-built from real SDK field names (`tp`/`tt`/`ds`/`i`/`u`/`ca`/`ea`/`p`/`db` — verified plausible against `@braze/web-sdk` 6.7.1 behaviour, since the SDK parses them into the right `Card` subclasses). The server-config envelope in `test-utils.ts:56-65` is likewise real. |
| Request-shape validation | **None.** The mock never checks `api_key`, never rejects a malformed body, never enforces method/content-type. A bridge that posted `{}` would be indistinguishable from a correct one. |
| SDK-auth endpoint | N/A on web (signature travels in the body), so its absence is correct — but nothing asserts the signature *is* in the body either. |
| Error / non-2xx paths | **Zero coverage.** `grep -n "status:" test/web/src/*.test.ts` → no matches. `ScriptedResponse.status` exists (index.ts:53) and is never used by any test. No test covers a 401, a 429, a 500, or a dropped connection. |
| `/__test/requests` introspection | Not implemented (`PLAN.md:245` specifies it). |

Against `PLAN.md:242-249`, which specifies a ~150 LOC server implementing 7 named endpoints with responses reverse-engineered from Braze's Postman collection, the delivered mock is a capture proxy. That's a defensible simplification — the tests assert what the bridge *emits*, which is the higher-value half — but the gap should be stated rather than left for a reviewer to discover, and the untouched error paths are a genuine hole (how does the bridge behave when Braze 401s an SDK-auth'd request? Nothing answers that).

Fix: state the scope narrowing in `test/README.md`; add two or three tests using the already-built `status` field (401 → `sdkAuthError` fires, see A5-10; 500 → the SDK retries and the bridge doesn't reject).

---

### A5-19 — One test makes a live outbound call to Braze production and leaves the SDK singleton pointed there
**Severity: MINOR** · **Confidence: high**

`test/web/src/validation.test.ts:60-66`:
```ts
it('accepts a bare-host endpoint (no scheme)', async () => {
  await expect(plugin.initialize({ apiKey: 'k', endpoint: 'sdk.us-01.braze.com' })).resolves.not.toThrow();
});
```
This is the only *resolving* `initialize` in the file, so the Web SDK actually opens a session and POSTs `/api/v3/data/` to **real Braze US-01** with `api_key: 'k'`. Two consequences:
- `REVIEW_READINESS.md:418` and `CLAUDE.md`'s closing reminder ("Don't add CI checks that depend on real Braze for every PR") are violated on every `npm test`. It doesn't *fail* offline (the POST is fire-and-forget after `initialize` resolves), but it is an unnecessary egress from CI and sends junk to a third party.
- Because `@braze/web-sdk` is a module singleton and later `initialize` calls are no-ops on endpoint (the pattern `attributes.test.ts:20-25` documents), the singleton stays pointed at production for the rest of the file. The `setDateOfBirth` and empty-arg blocks (lines 69-165) believe they re-initialised to `http://127.0.0.1:1`; they did not. Those tests pass only because validation precedes dispatch — a correct outcome reached by accident.

Fix: assert the URL-normalisation behaviour against a mock host that matches the cluster pattern, or spy on the SDK's initialize rather than letting it open a real session.

---

### A5-20 — Missing CI jobs a reviewer will expect
**Severity: MINOR** · **Confidence: certain**

Present and good: lint, build-plugin (+ dist-artifact and docgen-marker assertions), build-example, build-demo, test-web, audit (npm audit + gitleaks + optional Snyk), verify-ios (+ SwiftLint), verify-android (+ Robolectric). Concurrency cancellation is wired (`test.yml:10-12`). `needs: build-plugin` fans out correctly.

Absent:
- **`npm pack` tarball verification.** Nothing asserts the published tarball contains `dist/`, `ios/Plugin/`, `android/src/main/`, the podspec — i.e. nothing would catch a `files` regression in `package.json` before it reaches npm consumers. Cheapest high-value addition here.
- **Bundle-size budget.** `REVIEW_READINESS.md:123-129` publishes concrete budgets (<50 KB .aar, <100 KB .framework, <5 KB web gzipped) and states "**Budget violations fail CI**". Nothing enforces any of them (L7-02).
- **Release dry-run on PR** (`npm publish --dry-run`) — would have caught A5-03 before the tag.
- **Scheduled spec-drift job** — `PLAN.md:288-297` calls it "the unsung hero"; not wired (L7-03).
- **Dev-dep audit.** `--omit=dev` (line 194) means dev-dep CVEs never surface (L7-07).
- **iOS unit tests** — see A5-01.

---

### A5-21 — Six Dependabot PRs open, oldest ~4 months; one is red on lint
**Severity: MINOR** · **Confidence: certain**

`gh pr list --state open`: #18 and #19 (2026-06-03), #22 (2026-06-15), #24 (2026-06-22), #25 (2026-07-20), #26 (2026-08-03). `gh pr checks`:
- #18, #19, #24, #25, #26 — all 8 checks green, simply unmerged.
- **#22** (`dev-deps` group, 7 updates) — `Lint (ESLint + Prettier)` **fail**; other 7 pass. Run logs expired (HTTP 410), but the failing job is lint-only, so it is almost certainly a Prettier 3.x formatting-default change in the bumped `prettier` dev dep — a `npm run fmt` away from green.

Also note `.github/dependabot.yml:26-27,42-43,58-59` ignores `@capacitor/*` majors with a well-argued rationale — but `example/package.json:20` already pins `"@capacitor/cli": "^8.3.4"` while `@capacitor/core` is `^6.0.0`, so the example is already straddling majors the policy says to avoid.

Why it matters: a reviewer browsing the repo sees a red PR and a stale queue on a package that advertises itself as maintained.

Fix: merge #18/#19/#24/#25/#26; run `npm run fmt` on #22.

---

### A5-22 — `content-cards-populated.test.ts` is one `it()` with ~15 assertions; an early failure hides the wire-level ones
**Severity: NIT** · **Confidence: certain**

`test/web/src/content-cards-populated.test.ts:66-196` — a single test does: refresh, three DTO-shape assertions, then the `logContentCardClick`/`logContentCardImpression` wire-level `ccc`/`cci` assertions (lines 165-195). Those last assertions are the **best in the suite** (they pin the actual Braze event codes with a diagnostic failure message), and they're unreachable if any of the earlier `toMatchObject` calls fail. `feature-flags-populated.test.ts:52-146` has the same fat-test shape. The files' own comments call them "fat tests" and explain the singleton constraint that motivates it.

Fix: split the click/impression half into a second `it()` sharing the `beforeEach` fixture — the singleton constraint is per-file, not per-test, so this is safe.

---

### A5-23 — `logPurchase` quantity and properties are never asserted on the wire
**Severity: NIT** · **Confidence: certain (empirically verified)**

`test/web/src/events.test.ts:72-84` asserts `productId`, `'USD'`, `'14.99'` appear in the body, with `quantity: 1` passed. The real payload is `{"name":"p","data":{"pid":"SKU_P","c":"USD","p":"14.99","q":3,"pr":{}}}` — `q` (quantity) and `pr` (properties) are both on the wire and both unasserted. Dropping `quantity` entirely from the bridge, or hard-coding it to 1, breaks nothing. The three `logPurchase` *validation* tests (86-101) are good.

Fix: pass `quantity: 3` and assert `'"q":3'`; add a `properties` round-trip assertion mirroring the `logCustomEvent` one at line 56.

---

### A5-24 — Example app is missing buttons for two of four listener events
**Severity: NIT** · **Confidence: certain**

`example/index.html` has 38 `data-method` buttons, all 38 resolving to handlers in `example/src/main.ts` (verified by `comm` on the two sorted lists — zero orphans; good hygiene). But only `subscribeFeatureFlagsUpdated` (190) and `subscribeContentCardsUpdated` (197) exist; `inAppMessageReceived` and `sdkAuthError` have no button. See A5-10.

---

### A5-25 — Stale / contradictory test-and-CI claims across the docs (list only, per brief)
**Severity: MINOR** · **Confidence: certain**

Ground truth as of `0ab8e19`: **108 tests, 14 files, ~2.1s**, vitest (not Jest), Fastify mock server (not Ktor), Android Robolectric wired in CI, iOS XCTest not wired anywhere.

| File:line | Claim | Reality |
|---|---|---|
| `CLAUDE.md:73` | Tests = "Jest (TS) … Maestro (e2e), **Ktor** (mock server)" | vitest; no Maestro; Fastify |
| `CLAUDE.md:89` | "Mock Braze server (**Ktor**, in `test/mock-server`) ✅" | Fastify/TypeScript |
| `CLAUDE.md:90` | "108/108 ✅" | **correct** |
| `CLAUDE.md:97` | "`inAppMessageReceived` + `sdkAuthError` ✅ (all 3 platforms)" | shipped, but zero tests anywhere (A5-10) |
| `CLAUDE.md:105` | "`0.1.0` to npm ✅" | published, but the release **workflow failed** (A5-03) |
| `CLAUDE.md:157` | "`mock-server/` # **Ktor** mock Braze backend (port 8080)" | Fastify, ephemeral port |
| `CLAUDE.md:158` | "vitest behavioral tests (**94** as of 0.0.12)" | 108 |
| `CLAUDE.md:240` | "Layer 1: TS contract tests (**Jest**, <1 min)" | vitest |
| `CLAUDE.md:244/247/250` | `cd example && npm run test:android` / `test:ios` / `test:web` | **none of these scripts exist** in `example/package.json` |
| `CLAUDE.md:253` | `cd test/mock-server && ./gradlew run` | no gradlew; it's `npm run standalone` |
| `CLAUDE.md:258` | `cd example && … npm run smoke` | no such script; smoke lives at repo root (`npm run smoke:web` etc.) and targets `demo/`, not `example/` |
| `CLAUDE.md:91` | "Web behavioral tests … — 108/108" vs `README.md:30` "**92 tests**" | mutually inconsistent |
| `README.md:27` | "35 methods + `addListener`/`removeAllListeners` for **2 events**" | 4 events are declared in `definitions.ts` |
| `README.md:30` | "75 behavioral + 17 serializer = **92 tests in ~2.4s**; **37/37**" | 108 tests |
| `README.md:34` | "tracks the **33/37** directly-covered methods" | contradicts line 30 four lines above (already logged as L9-F16, still unfixed) |
| `REVIEW_READINESS.md:7` | smoke + native harness "landed as scaffolding … not gates" | contradicts line 345 below |
| `REVIEW_READINESS.md:341` | "**74** behavioral + 17 serializer across **13 files** in ~2.4s" | 108 across 14 |
| `REVIEW_READINESS.md:345` | Layer 4 smoke "is **the gate to 0.1.0**" | 0.1.0 shipped without it; contradicts line 7 |
| `REVIEW_READINESS.md:348` | "74 web behavioral + 17 serializer" | 108 |
| `REVIEW_READINESS.md:378` | "Git tag created ◌ — First tag will be `v0.1.0` **after smoke**" | tag exists; smoke never ran |
| `REVIEW_READINESS.md:380` | "`npm publish --provenance` from CI" ✓ | the CI publish **failed**; artifact has no attestation (A5-03) |
| `REVIEW_READINESS.md:414` | "Layer 3 (mock server) ✓ for web (**68 tests**)" | 108; also contradicts line 341's 74+17 |
| `docs/TEST-COVERAGE-AUDIT.md:4` | "**92 tests** = 75 behavioral + 17 serializer across 14 files" | 108 |
| `docs/TEST-COVERAGE-AUDIT.md:89` | "The **74** behavioral + 17 serializer tests" | contradicts line 4 of the same file |
| `docs/TEST-COVERAGE-AUDIT.md:30-33` | `refreshFeatureFlags` / `logFeatureFlagImpression` = "does not throw"; FF/CC = "empty-cache" | understates — `*-populated.test.ts` files now cover these properly |
| `docs/mdcs/C09-…:102-108` | CI job table lists 7 jobs | missing `test-web` and the Robolectric step; `verify-ios` listed at "~8-12 min", actual ~3 min |
| `test/README.md:90` | "This **Phase P.1 commit ships one test** (`logCustomEvent`)" | 108 tests |
| `test/README.md:92` | "**CI integration**: a `test-web` job … so every PR runs these" — listed under "Future expansions" | shipped months ago (test.yml:137) |
| `test/web/src/feature-flags.test.ts:18-25,84-93` | "What this file does NOT cover yet … populated-cache tests are **deferred**" | `feature-flags-populated.test.ts` closed this |
| `test/web/src/content-cards.test.ts:22-27` | same deferral language | `content-cards-populated.test.ts` closed this |
| `test/web/src/serializers.test.ts:25-32` | "The mock currently returns the canonical `{message:'success'}` envelope, **not** Braze's flag/card sync shape" | `respondTo()` does exactly that now |
| `android/…/BrazePluginContractTest.kt:23-25` | "covers … **SDK Auth enforcement**, and the **pure-function serializers**" | neither is tested (A5-02) |
| `android/…/BrazePluginContractTest.kt:43-45` | "setUp … assigns it a **mocked bridge**" | it does not |
| `SECURITY.md:340` | "Dev deps: … TS, Rollup, **Jest**, plus **Ktor** for the mock server, **Maestro** for e2e" | vitest / Fastify / no Maestro |
| `PLAN.md:227,242,299,420,423` | Jest + Ktor mock server + `test/ts/` layout | vitest + Fastify + `test/web/` |
| `CHANGELOG.md:37` | Native harnesses "… iOS XCTest contract tests under `ios/PluginTests/`. **Closes L6-01**" | iOS tests never run (A5-01) |
| `.github/dependabot.yml:6,74` | "GitHub Actions: weekly, **pinned by SHA where possible**" | every action is `@v4`/`@v5`; `snyk/actions/node@master` |
| `findings/L6-test-rigor.md:8,22` / `findings/SUMMARY.md:96` | "92/92 in 3.06s", "37 surface methods" | 108; 35 methods + 2 listener APIs |

---

## Coverage table — 35 public methods (+ listener APIs)

`impl-break-detecting` = would the test fail if the implementation were subtly wrong (wrong field, swapped arg, dropped param), as opposed to only if it threw?

| # | Method | Web test file(s) | Assertion strength | Android | iOS | example |
|---|---|---|---|---|---|---|
| 1 | `echo` | privacy-lifecycle:77 | **strong** — asserts `{value}` round-trip | ✅ ×2 byte-exact | ✗ | ✅ |
| 2 | `initialize` | validation:19-66 + every file's `beforeAll` | **strong** — 6 validation branches, distinct messages | ✅ ×4 | ✗ | ✅ |
| 3 | `changeUser` | identity:38, 131-188; validation:154 | **strong** — userId on wire + 5 SDK-auth enforcement cases | ✗ | ✗ | ✅ |
| 4 | `getUserId` | identity:48 | **strong** — exact return value | ✗ | ✗ | ✅ |
| 5 | `setSdkAuthenticationSignature` | identity:79, 87 | **weak** — `resolves.not.toThrow()` + empty-reject; no wire/header assertion | ✗ | ✗ | ✅ |
| 6 | `setEmail` | attributes:52 | **weak** — value substring, no `"email"` key (A5-04) | ✗ | ✗ | ✅ |
| 7 | `setPhoneNumber` | attributes:62 | **weak** — same | ✗ | ✗ | ✅ |
| 8 | `setFirstName` | attributes:75 | **weak** — swap with `setLastName` still passes (A5-04) | ✗ | ✗ | ✅ |
| 9 | `setLastName` | attributes:82 | **weak** — same | ✗ | ✗ | ✅ |
| 10 | `setLanguage` | attributes:89 | **weak** — same | ✗ | ✗ | ✅ |
| 11 | `setCountry` | attributes:99 | **weak** — same | ✗ | ✗ | ✅ |
| 12 | `setCustomUserAttribute` | attributes:107, 164-189; validation:150 | **strong** — key+value on wire, 4 type rejections, 3 accepts | ✗ | ✗ | ✅ |
| 13 | `addToSubscriptionGroup` | subscription-groups:33, 53 | **weak** — no `status` assertion (A5-05) | ✗ | ✗ | ✅ |
| 14 | `removeFromSubscriptionGroup` | subscription-groups:43, 57 | **weak** — indistinguishable from add (A5-05) | ✗ | ✗ | ✅ |
| 15 | `addAlias` | identity:55, 71, 75 | **medium** — both values on wire; no key assertion | ✗ | ✗ | ✅ |
| 16 | `getDeviceId` | identity:91 | **weak** — only "non-empty string" | ✗ | ✗ | ✅ |
| 17 | `setDateOfBirth` | attributes:129; validation:105-127 | **strong** — exact `"dob":"1987-7-14"` + 9 range branches | ⚠️ vacuous (A5-02) | ✗ | ✅ |
| 18 | `setGender` | attributes:142, 154 | **weak** — no wire assertion at all (A5-06) | ✗ | ✗ | ✅ |
| 19 | `setHomeCity` | attributes:122 | **weak** — value substring only (A5-04) | ✗ | ✗ | ✅ |
| 20 | `logCustomEvent` | events:40, 56; validation:146 | **medium** — name + prop key + prop value on wire | ✗ | ✗ | ✅ |
| 21 | `logPurchase` | events:72, 86, 92, 98 | **medium** — pid/currency/price; `q`+`pr` unasserted (A5-23) | ✗ | ✗ | ✅ |
| 22 | `getFeatureFlag` | feature-flags:56, 61; ff-populated:147 | **strong** — populated + miss + empty-id | ✗ | ✗ | ✅ |
| 23 | `getAllFeatureFlags` | feature-flags:65; ff-populated:52 | **strong** — all 5 property types round-trip | ✗ | ✗ | ✅ |
| 24 | `refreshFeatureFlags` | feature-flags:52; ff-populated:52; listeners:95 | **strong** via populated path (`feature-flags:52` alone is vacuous) | ✗ | ✗ | ✅ |
| 25 | `logFeatureFlagImpression` | feature-flags:70, 80 | **weak** — "does not throw" + empty-id; file admits the wire assertion is deferred | ✗ | ✗ | ✅ |
| 26 | `getContentCards` | content-cards:58; cc-populated:121 | **strong** — 3 card variants, full DTO shape | ✗ | ✗ | ✅ |
| 27 | `requestContentCardsRefresh` | content-cards:54; cc-populated:118; listeners:96 | **strong** via populated path | ✗ | ✗ | ✅ |
| 28 | `logContentCardClick` | content-cards:63; cc-populated:165; validation:158 | **strongest in suite** — asserts `"name":"ccc"` + card id | ✗ | ✗ | ✅ |
| 29 | `logContentCardImpression` | content-cards:69; cc-populated:179; validation:162 | **strongest in suite** — asserts `"name":"cci"` + card id | ✗ | ✗ | ✅ |
| 30 | `registerPushToken` | push:39, 43, 49 | **strong** — 3-part error contract pinned | ✗ | ✗ | ✅ |
| 31 | `addListener('featureFlagsUpdated')` | listeners:49 | **strong** — DTO shape in callback payload | ✗ | ✗ | ✅ |
| 31 | `addListener('contentCardsUpdated')` | listeners:49 | **strong** — DTO shape in callback payload | ✗ | ✗ | ✅ |
| 31 | `addListener('inAppMessageReceived')` | **none** | — (A5-10) | ✗ | ✗ (A5-01) | ✗ |
| 31 | `addListener('sdkAuthError')` | **none** | — (A5-10) | ✗ | ✗ | ✗ |
| 32 | `removeAllListeners` | listeners:130 | **strong** — call-count before/after | ✗ | ✗ | ✅ |
| 33 | `wipeData` | privacy-lifecycle:54, 59; identity:173 | **strong** — pre-init OK, resets init flag, resets SDK-auth flag | ✗ | ✗ | ✅ |
| 34 | `disableSDK` | lifecycle:52 | **medium** — state transition only | ✗ | ✗ | ✅ |
| 34 | `enableSDK` | lifecycle:58 | **medium** — state transition only | ✗ | ✗ | ✅ |
| 34 | `isDisabled` | lifecycle:47, 52, 58 | **medium** | ✗ | ✗ | ✅ |
| 35 | `requestImmediateDataFlush` | lifecycle:65 + 7 files implicitly | **medium** — direct test is vacuous, but every wire test depends on it | ✗ | ✗ | ✅ |

**Breadth:** 35/35 methods + `removeAllListeners` have ≥1 web test; 2/4 listener events do. **Depth:** ~11 methods have assertions that would survive a subtle implementation break only by luck (rows marked *weak*).

Plus `serializers.test.ts` — 17 pure-function tests over `serializeFeatureFlag`, `serializeContentCards`, `serializeContentCard`, `classifyContentCard`, including real `@braze/web-sdk` `ClassicCard`/`CaptionedImage`/`ImageOnly`/`ControlCard` instances. These are strong and correctly target the `instanceof` discrimination C02 depends on.

### Tests that would still pass if the implementation were broken

1. `attributes.test.ts:75/82` — `setFirstName` ↔ `setLastName` swapped.
2. `attributes.test.ts:89/99/122` — `setLanguage` / `setCountry` / `setHomeCity` cross-wired.
3. `attributes.test.ts:52/62` — `setEmail` ↔ `setPhoneNumber` swapped.
4. `subscription-groups.test.ts:33/43` — `removeFromSubscriptionGroup` subscribing instead of unsubscribing.
5. `attributes.test.ts:142` — any `WEB_GENDER_MAP` value mis-mapped.
6. `events.test.ts:72` — `quantity` dropped or hard-coded.
7. `identity.test.ts:79` — `setSdkAuthenticationSignature` forwarding nothing to the SDK.
8. `identity.test.ts:91` — `getDeviceId` returning a hardcoded constant.
9. `feature-flags.test.ts:52/70`, `content-cards.test.ts:54`, `lifecycle.test.ts:65` — bodies replaced with `return;` (the populated-cache files cover the first three; `requestImmediateDataFlush` is covered transitively).
10. `android/…:133` — `setDateOfBirth` replaced by `call.reject("Braze.")`.

### Example-app method coverage

38 `data-method` buttons; every one resolves to a handler in `example/src/main.ts` (cross-checked, zero orphans). **All 35 methods present.** Missing: `addListener('inAppMessageReceived')`, `addListener('sdkAuthError')`. `example/` builds in CI (`Build example app` green on all 6 open PRs) and its `build` script runs `tsc --noEmit`, so it is type-checked.

---

## What is genuinely good

- **The wire-capture primitive is the right architecture.** Testing `BrazeWeb → @braze/web-sdk → HTTP` and asserting the captured POST body is strictly better than mocking the SDK. When the assertions are specific (`"dob":"1987-7-14"`, `"name":"ccc"`, `"name":"cci"`) they are excellent — they pin Braze's internal event codes, which is exactly the drift a version bump would introduce. The weakness in A5-04/05/06 is a predicate-specificity problem, not an architectural one, and is a few dozen lines from being fixed.
- **`freshPluginWithConfig()` is a real piece of engineering.** `test-utils.ts:17-76` reverse-engineers the Web SDK's server-config gate (config must arrive in the response to the *first* `/api/v3/data/` POST, `time > 0`, `refresh_rate_limit: 0`) to make feature-flag and content-card refreshes testable at all. That unblocked `feature-flags-populated` and `content-cards-populated`, which are the two highest-value test files in the repo. The comment explaining *why* is exemplary.
- **`waitForCaptured`'s failure output** (`test-utils.ts:105-112`) dumps every captured request with truncated bodies. Debugging a failure takes seconds, not a bisect.
- **Validation coverage is genuinely thorough on web.** 30+ dedicated rejection tests pinning per-field error strings, including the `it.each` range matrices for `setDateOfBirth` and the four-way type-rejection matrix for `setCustomUserAttribute`. This is the C04 contract enforced, not just documented.
- **CI job graph is well-shaped.** `needs: build-plugin` fan-out, concurrency cancellation, node-version consistency, per-directory `cache-dependency-path`, dist-artifact assertions, and the docgen-marker check (`test.yml:66-75`) that catches an un-regenerated README — a thoughtful gate most plugins don't have.
- **`verify-ios` / `verify-android` compile the demo against the real pinned SDKs on every PR.** For a bridge library this is the single highest-value CI job, and it is present and green.
- **`release.yml`'s tag/version guard** (lines 45-53) prevents the classic tag↔package.json mismatch.
- **Repo hygiene around CI:** gitleaks with `fetch-depth: 0`, npm audit at `--audit-level=high`, branch protection with 8 required checks, issue + PR templates. The security-scanning layer is above the bar for a community plugin.
- **Tests are fast** — 108 in 2.06s. Fast tests get run; slow tests get skipped.
- **Test files mirror module boundaries** and carry substantial explanatory headers. Finding the test for a method takes one guess.

---

## Count by severity

| Severity | Count | IDs |
|---|---|---|
| BLOCKER | 0 | — |
| **MAJOR** | **10** | A5-01, A5-02, A5-03, A5-04, A5-05, A5-06, A5-07, A5-08, A5-09, A5-10 |
| **MINOR** | **12** | A5-11, A5-12, A5-13, A5-14, A5-15, A5-16, A5-17, A5-18, A5-19, A5-20, A5-21, A5-25 |
| **NIT** | **3** | A5-22, A5-23, A5-24 |
| **Total** | **25** | |

### Highest-leverage fixes before review

1. **A5-04 / A5-05 / A5-06** — ~15 lines of predicate edits convert the weakest third of the suite into real regression tests. Cheapest credibility win in the report.
2. **A5-03** — re-run the release path so the npm artifact actually carries provenance, and add a test gate. A reviewer checking `gh run list --workflow=Release` sees one red run.
3. **A5-09** — one web smoke capture (~30 min) removes "has this ever touched real Braze?" from the review.
4. **A5-08** — one-line dependabot fix ends a months-long weekly red job.
5. **A5-01 / A5-02** — if wiring the Xcode target is out of scope, at minimum correct the CHANGELOG/CLAUDE.md claims and repair the vacuous `setDateOfBirth` test. Overstated coverage reads worse than acknowledged gaps.
