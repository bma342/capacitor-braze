> **Archived audit report — read the resolution table first.**
> Documentation review of `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated 2026-09-22.
> The findings below were current *then*; this report drove the `0.2.0` documentation pass, so
> almost all of it is closed. Where the report and the current docs disagree, the docs are now
> right. Index of audits: [`../README.md`](../README.md).

## Resolution status

**67 findings. 66 closed, 1 partly closed.** Grouped by file rather than listed one per row, because
this report's findings cluster and were fixed as clusters.

| IDs | File | Status in 0.2.0 |
|---|---|---|
| A6-01, A6-02, A6-07 | README — "not yet published to npm" | **fixed** — the tagline, Status table and Quick start all say the package is on npm and install from the registry. The npm row also records that `0.1.0` was published by hand with no provenance attestation. |
| A6-03 | README — "Android: no extra config required" | **fixed** — the single most consumer-breaking error in the repo. The Android section now carries the three Gradle edits (AGP 8.6.0, compileSdk 35, Gradle 8.7), the Kotlin 2.2.0 plugin bump the audit did not catch, the exact error each omission produces, and a pointer to `demo/android/` as the working example. |
| A6-04, A6-08 | README — three different test counts | **fixed** — one number, **154 across 14 files**, from a live run. The 33-vs-37 contradiction is gone. |
| A6-05 | README — "2 events" | **fixed** — 4, named. |
| A6-06 | README — in-app message listener listed as unshipped | **fixed** — it shipped in `0.1.0`; the unshipped list is now banners, push-permission helpers, geofences, deep-link interception, SPM and Capacitor 8. |
| A6-09 | README — `npm test` fails on a fresh clone | **fixed** — One-time setup now installs `test/mock-server` and `test/web`, and says why (no npm workspaces). CONTRIBUTING has the full procedure for all three tiers. |
| A6-10 | README — Layer 4 framed as a gate before `0.1.0` | **fixed** — stated as never run, for `0.1.0` and `0.2.0` both. |
| A6-11 | README — missing sections the repo's own bar requires | **fixed** — added **Security** (which key, SDK Authentication, CSP, right-to-be-forgotten, privacy declarations, logging/PII), **Troubleshooting** (12 rows), an `initialize` options reference, and a **Known gaps** section. `REVIEW_READINESS.md` §1 now grades all 14 structure items honestly, including the two that remain partial. |
| A6-12 | README badge says "Capacitor 6+" | **fixed** — "Capacitor 6 \| 7", with Capacitor 8 called out as out of range. |
| A6-13 | CHANGELOG — duplicate `## [0.0.12]` heading | **fixed** — the second is now "Pre-0.1.0 staging notes", which no changelog parser reads as a version. |
| A6-14 | CHANGELOG — no link-reference definitions | **fixed** — added for `[Unreleased]`, `[0.2.0]`, `[0.1.0]` and the `0.0.x` series. |
| A6-16, A6-55 | C08 links `BrazePlugin.podspec` | **fixed** — `CapacitorBraze.podspec`. This was the half of finding L9-F2 that `0.1.0`'s CHANGELOG claimed to have closed and had not; a repo-wide relative-link check now covers every `.md`. |
| A6-17, A6-18, A6-19, A6-21 | CLAUDE.md — Jest/Ktor/Maestro, wrong commands, wrong counts | **fixed** — the stack table names vitest, Robolectric, XCTest and Fastify with real counts; every command in the Testing section exists and works; the mock server is described as Fastify on an ephemeral port. |
| A6-20, A6-37 | Five documents describe a daily spec-drift CI job | **fixed** — the claim is removed from `CLAUDE.md`, `SECURITY.md`, `SDK_SURFACE.md` and C08, each of which now states plainly that no workflow is scheduled and none talks to Braze. `PLAN.md`'s copy is inside its history banner. |
| A6-22 | Four incompatible "8-file lockstep" lists | **fixed** — [C01's checklist](../../mdcs/C01-METHOD-ANATOMY.md#the-lockstep-checklist) is the single canonical copy; `CLAUDE.md`, `CONTRIBUTING.md` and the PR template reference it. It is now ten items, **including a test on each platform** — the previous list let a contributor add a method with zero tests while the repo advertised a required test gate. |
| A6-23 | CLAUDE.md — "forward-compat to 7/8 as released" | **fixed** — Capacitor 8 is stated as out of scope with the reason. |
| A6-24, A6-57 | C11 "impl pending" | **fixed** — C11 now opens with an implemented-status banner and a full Status section: 74 Android + 26 iOS, both in CI, with how to add a test on each platform. The integration tier is still design-only and says so. The nonexistent `0.0.13` version is gone. |
| A6-25 | CLAUDE.md status table tense | **fixed** — dated snapshot at `0.2.0`, with ⏳ rows for what is genuinely outstanding. |
| A6-26, A6-27 | SDK_SURFACE — "~15 methods", nine wrong matrix rows | **fixed** — the shipped list is declared authoritative over the matrix, and every Plugin-column cell now reads **✅ shipped** or **⏳ roadmap** rather than a milestone label that could be misread as coverage. `isInitialized` is marked as never having existed. |
| A6-28 | SDK_SURFACE §3 — APIs described in the present tense that do not exist | **fixed** — §3 now lists only divergences that exist, and states that there is no error class hierarchy. The false "seconds → milliseconds on Android" note, which would have led a reader to introduce a 1000× bug, is replaced by an explicit correction. |
| A6-29 | SDK_SURFACE + SECURITY — Dependabot scope | **fixed** — five directories plus `github-actions`, named. |
| A6-30 | SDK_SURFACE — stale date and pins | **fixed** — dated `0.2.0`, pins 18.2.1 / 43.2.0 / `^6.13.0`. The project is no longer behind upstream, so the "disclose the gap" recommendation is moot. |
| A6-31 | SDK_SURFACE — a core/UI Web SDK split that does not exist | **fixed** — replaced with what is true (one dynamic import of the full package) and a note that the IIFE/`unpkg` build was removed in `0.2.0`. |
| A6-32, A6-58 | The iOS 15 rationale and three different minSdk numbers | **fixed** — iOS 15 is documented as **the plugin's own floor**, verified against BrazeKit's podspec at 14.1.0, 15.0.0 and 18.2.1 (all declare iOS 12). minSdk is 22 in `android/build.gradle`, C10 and SDK_SURFACE alike. |
| A6-33 | SECURITY §2 — server-side signing examples "in README" | **fixed** — §2 states that signing is the consumer's responsibility and links Braze's own documentation, rather than promising five language implementations that never existed. `REVIEW_READINESS.md` records this as a deliberate deviation with the reasoning. |
| A6-34 | SECURITY §2 — `BrazeAuthRequiredError` | **fixed** — the actual error string is quoted, and both SECURITY and SDK_SURFACE state that there is no error class hierarchy. |
| A6-35 | SECURITY §12 — Jest / Ktor / Maestro in the dependency inventory | **fixed** |
| A6-36 | SECURITY §13 — "Actions pinned by SHA" | **now true** — every action in both workflows is pinned to a 40-character commit SHA. |
| A6-38, A6-39 | SECURITY §12 — Renovate and GitHub Advanced Security | **fixed** — both claims deleted. §12 now has a table of the scanners that actually run, including the two that are enabled but got no credit (secret scanning, push protection) and the ones that are not (CodeQL, Dependabot security updates, Snyk pending its token). |
| A6-40 | SECURITY §4 — `allowInsecureEndpoint` in future tense | **fixed** |
| A6-41 | SECURITY §4 — cluster warning described as universal | **fixed** — and the underlying gap is closed too: the check now exists on all three platforms, matches by pattern rather than a hardcoded list, and never logs the endpoint. |
| A6-42 | SECURITY §13 — "no `postinstall`" | **fixed** — the `prepare` nuance is stated wherever the claim appears. |
| A6-43 | SECURITY §13 — branch protection claims | **fixed** — §13 describes the real state, says required reviewers are deliberately not enabled on a single-maintainer repo, and names `enforce_admins` as a genuine gap with the command to close it. |
| A6-45 | REVIEW_READINESS — 130+ boxes, zero checked | **fixed** — 41 ticked against evidence, the rest annotated inline with ⚠️ / ○ / ⛔ and a reason. The Layer 4 scenario boxes stay unchecked with a banner explaining that each needs a live dashboard. |
| A6-46 | REVIEW_READINESS — promises and retracts Maestro | **fixed** — struck, with `PLAN.md` §14 recording the decision. |
| A6-47 | REVIEW_READINESS — "Budget violations fail CI" | **fixed** — the table is labelled aspirational with an "Enforced?" column reading ✗ throughout. |
| A6-48 | REVIEW_READINESS — "No manual Podfile edits. No manual `build.gradle` edits." | **fixed** — replaced with the five edits that are actually mandatory, plus Xcode 26, and the reason the plugin cannot apply them. |
| A6-49 | REVIEW_READINESS — `npx cap run ios` in `example/` | **fixed** — `example/`'s native projects are not committed; `demo/` is the app with them. |
| A6-50, A6-70 | REVIEW_READINESS §7 titled "Blockers to tag 0.1.0" | **fixed** — retitled "Remaining work", split into Cleared / Before tagging `0.2.0` / Still open / Deliberately deferred. `docs/REPO-HYGIENE.md`'s anchor was updated in the same pass. |
| A6-51 | REVIEW_READINESS §6 — four pre-release rows | **fixed** — §6 re-verified row by row and re-dated. |
| A6-52 | REVIEW_READINESS — TypeDoc | **fixed** — struck, with the `@capacitor/docgen` decision cited. |
| A6-53 | PLAN.md — stale throughout | **fixed** — a dated "original plan, kept as history" banner with a divergence table, and §14's seven open decisions closed with their actual outcomes (three of which went the opposite way to the defaults). |
| A6-54 | 29 of 29 `file:line` references wrong | **fixed** — every one replaced with a symbol-anchored reference that cannot drift, and `docs/mdcs/README.md` now makes symbol-anchoring the convention. |
| A6-56 | C09 CI job table | **fixed** — all nine jobs, with what each actually runs, plus the SwiftLint-not-on-the-runner correction. |
| A6-59, A6-15, A6-44, A6-65, A6-66, A6-73, A6-74 | *(verified-correct entries)* | No action needed. The docgen block is still in sync — re-verified by rebuild-and-diff after this pass. |
| A6-60 | `findings/` reads as an open indictment | **fixed** — `git mv findings/ docs/audits/2026-05/`, with a README carrying a resolution status for every finding ID, and every inbound link updated. |
| A6-61 | CONTRIBUTING — no way to run the tests | **fixed** — a "Running the tests" section covering all three tiers with prerequisites and the two gotchas, plus tests in the PR checklist. |
| A6-62 | CONTRIBUTING — `UnsupportedOperationError` | **fixed** — describes what the code does, quoting `registerPushToken`'s real message as the template. |
| A6-63 | CONTRIBUTING — npm 2FA in pre-`0.1.0` tense | **fixed** — rewritten around the real mechanics: the automation token bypasses 2FA by design, and Trusted Publishing is the fix. |
| A6-64 | PR template — "four surfaces", nine boxes, no test box | **fixed** — mirrors C01's ten items, references it as canonical, and adds a test box per platform. |
| A6-67 | `test/README.md` — "ships one test" | **fixed** — replaced with the current state, the known gaps, and where the native tiers live. |
| A6-68 | `docs/TEST-COVERAGE-AUDIT.md` header | **fixed** — re-dated, re-counted, and given a banner stating that it is hand-maintained because no coverage instrumentation exists. |
| A6-69 | `docs/SMOKE-TEST-PLAYBOOK.md` — "gate to tagging `0.1.0`" | **fixed** — opens with a "this has never been run" banner. |
| A6-71 | `dependabot.yml` gradle ecosystem for an npm project | **fixed** |
| A6-72 | Forward reference to `BrazePluginBridgeTests.swift` | **partly fixed** — the blocker it described is gone (the XCTest target exists and runs 26 tests in CI), and C11 documents how to add a file. Whether that specific comment still sits in `ios/PluginTests/BrazePluginContractTests.swift` is F2's file, not this pass's; if it does, it is now merely stale rather than describing a real gap. |

### Not closed by this pass

- **A6-72** — see above; source comment, outside the docs pass's ownership.
- **The structural suggestion** at the end of this report — a CI step that verifies `file:line` refs and diffs `dist/docs.json` against the SDK_SURFACE matrix — was **not** implemented. The line-number problem was instead removed at the root by making references symbol-anchored, which needs no CI to stay true. The matrix-drift half remains a real idea and a real gap.

---

# A6 — Documentation accuracy & consumer-facing surface

**Repo:** `/Users/bryceaspinwall/eatsuite/capacitor-braze` @ `0ab8e19` (main, clean)
**Audit date:** 2026-09-22 · **Last repo commit:** 2026-05-22 (4 months stale)
**Method:** every claim below was verified against code, `git log`, a live `npm test` run, `npm run build`, `npm view`, and the GitHub releases API. No repo file was modified (the one `npm run build` left the tree clean — see A6-58).

## Ground truth established

| Fact | Verified value | How |
|---|---|---|
| Public methods in `src/definitions.ts` | **35** non-listener + `addListener` (4 overloads) + `removeAllListeners` = **37** callable surface, **40** docgen entries | grep of method signatures; docgen index |
| Listener events | **4** — `featureFlagsUpdated`, `contentCardsUpdated`, `inAppMessageReceived`, `sdkAuthError` | `src/definitions.ts:1105,1124,1150,1169` |
| Web test suite | **108 tests / 14 files / 2.01s**, **vitest**, jsdom | `cd test/web && npm test` (run 2026-09-22) |
| Mock server | **Fastify 5 / TypeScript**, in-process, `npm run standalone` | `test/mock-server/package.json` |
| Android native tests | **7** Robolectric/JUnit `@Test`s, 1 file, run in CI | `android/src/test/.../BrazePluginContractTest.kt` |
| iOS native tests | **5** XCTest funcs, 1 file, **no Xcode target → never run** | `ios/PluginTests/BrazePluginContractTests.swift` |
| CI jobs in `test.yml` | **8** (lint, build-plugin, build-example, build-demo, test-web, audit, verify-ios, verify-android) | `.github/workflows/test.yml` |
| npm publication | **`capacitor-braze@0.1.0` published 2026-05-22T17:07Z**, `latest` | `npm view capacitor-braze` |
| Pins vs upstream (2026-09-22) | BrazeKit/BrazeUI **14.1.0** vs **18.2.1**; android-sdk-ui **42.2.0** vs **43.2.0**; `@braze/web-sdk` `^6.0.0` (resolves 6.13.0) | podspec, `android/build.gradle`, GitHub releases API, npm |
| Capacitor | peer `^6.0.0 \|\| ^7.0.0`; podspec `>= 6.0, < 8.0`; upstream `@capacitor/core` **8.5.2** | `package.json`, podspec, `npm view` |
| Maestro | **zero** implementation anywhere | grep across repo |
| Daily spec-drift CI | **does not exist** — only `test.yml` + `release.yml` | `.github/workflows/` |

---

# Findings

## README.md — the first thing the reviewer reads

### A6-01 · BLOCKER · README.md:3
> "**0.0.x — not yet published to npm; consume via git for now.**"

**Actually true:** `capacitor-braze@0.1.0` has been on npm since 2026-05-22 (`npm view capacitor-braze version` → `0.1.0`, `time.created` 2026-05-22T17:07:03Z). `package.json` says `"version": "0.1.0"`. The CHANGELOG's own 0.1.0 entry says "The plugin is now consumable from npm as `npm install capacitor-braze`". The tagline on line 3 is the single most-read sentence in the repo and it is false.

**Proposed:** `> Capacitor 6+ plugin wrapping the official Braze SDKs for Android, iOS, and Web. **0.1.0 on npm** — \`npm install capacitor-braze @braze/web-sdk\`.`

**Confidence:** Certain.

### A6-02 · BLOCKER · README.md:37 (and :36)
> `| **Published to npm** | ❌ Not yet waiting on the smoke test |`
> `| **Smoke-tested against real Braze** | ❌ Not yet the next milestone (templates pre-staged in ...) |`

**Actually true:** published (A6-01). The smoke row is still accurate, but its rendering is garbled (a missing em-dash makes "❌ Not yet the next milestone" read as a sentence fragment), and the npm row directly contradicts CHANGELOG.md:14 and REVIEW_READINESS.md:7 in the same repo.

**Proposed:** `| **Published to npm** | ✅ [`0.1.0`](https://www.npmjs.com/package/capacitor-braze) — 2026-05-22 |` and `| **Smoke-tested against real Braze** | ❌ Not yet — the next milestone (templates pre-staged in `docs/smoke-tests/`) |`

**Confidence:** Certain.

### A6-03 · BLOCKER · README.md:1517-1519 (Platform setup → Android)
> "No extra config required. Capacitor's stock `cap add android` template satisfies Braze's `minSdkVersion 21` floor automatically."

**Actually true, three ways:**
1. **Extra config *is* required.** The repo's own demo app had to bump AGP from Capacitor's stock `8.2.1` to `8.6.0` (`demo/android/build.gradle`, with the comment "Bumped from Capacitor 6's stock 8.2.1 because Braze's transitive androidx deps (swiperefreshlayout 1.2.0) require AGP 8.6.0+"), bump `compileSdkVersion` from stock 34 to 35 (`demo/android/variables.gradle`), and bump the Gradle wrapper to 8.7 (`demo/android/gradle/wrapper/gradle-wrapper.properties`). `docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md:140-165` documents all three as consumer-side fixes. README asserts the opposite.
2. `minSdkVersion` is not the operative constraint and the number is inconsistent across three docs: README says Braze's floor is 21, C10:167 says 21, `SDK_SURFACE.md:27` says "API 21 (officially supported API 25+). Plugin sets `minSdkVersion = 26`", and `android/build.gradle` defaults `minSdkVersion 26` while `demo/android/variables.gradle` sets 22.
3. A consumer who follows README verbatim hits `Dependency 'androidx.swiperefreshlayout:swiperefreshlayout:1.2.0' requires Android Gradle plugin 8.6.0 or higher` — the exact error C10 pre-documents. README already handles the symmetric iOS case correctly (two Podfile edits, lines 1503-1515); Android is the asymmetry.

**Proposed:** replace with the three concrete edits (root `build.gradle` AGP → 8.6.0, `variables.gradle` `compileSdkVersion` → 35, wrapper → Gradle 8.7), point at `demo/android/` as the canonical working example the way the iOS section points at `demo/ios/App/Podfile`, and drop the minSdk sentence or state the plugin's own declared floor (26, overridable by the consumer's `variables.gradle`).

**Confidence:** Certain on (1) and (3); high on (2).

### A6-04 · MAJOR · README.md:30 vs README.md:34
> line 30: "75 behavioral + 17 serializer = **92 tests in ~2.4s**; **37/37 surface methods directly covered**"
> line 34: "tracks the 33/37 directly-covered methods + remaining gaps with unblock plans"

**Actually true:** 108 tests across 14 files in 2.01s (live run). And the two rows contradict each other four lines apart — 37/37 vs 33/37. `docs/TEST-COVERAGE-AUDIT.md:5` says 37/37, so line 34 is the wrong one (and its "remaining gaps with unblock plans" describes a document state that no longer exists).

**Proposed:** line 30 → "**108 tests across 14 files in ~2s**; **37/37 surface methods directly covered**". Line 34 → "[`docs/TEST-COVERAGE-AUDIT.md`](../../TEST-COVERAGE-AUDIT.md) — per-method coverage map (37/37 directly covered)."

**Confidence:** Certain.

### A6-05 · MAJOR · README.md:27
> `| **TypeScript API** | 35 methods + `addListener` / `removeAllListeners` for 2 events |`

**Actually true:** 4 events. `inAppMessageReceived` and `sdkAuthError` shipped in 0.1.0 (CHANGELOG.md:24-27) and are in the README's own docgen index 40 lines below (lines 121-122). The 35-method count is correct.

**Proposed:** "35 methods + `addListener` / `removeAllListeners` for 4 events (`featureFlagsUpdated`, `contentCardsUpdated`, `inAppMessageReceived`, `sdkAuthError`)".

**Confidence:** Certain.

### A6-06 · MAJOR · README.md:39
> "See [`SDK_SURFACE.md` §2] for the version roadmap and what's still unshipped (in-app message listener, banners, push permission helpers)."

**Actually true:** the in-app message listener **shipped in 0.1.0** — `addListener('inAppMessageReceived', ...)` exists on all three platforms (`src/definitions.ts:1150`, CHANGELOG.md:24). Banners and push-permission helpers are genuinely unshipped.

**Proposed:** drop "in-app message listener" from the list.

**Confidence:** Certain.

### A6-07 · MAJOR · README.md:44 (quick start)
> "# Until 0.1.0 hits npm, consume via git:" / `npm install bma342/capacitor-braze @braze/web-sdk`

**Actually true:** on npm since 2026-05-22. The git-URL install still works but is the wrong default and undercuts the package the reviewer will `npm view`.

**Proposed:** `npm install capacitor-braze @braze/web-sdk`.

**Confidence:** Certain.

### A6-08 · MAJOR · README.md:1419, 1424
> "`npm test` # 53 vitest behavioral tests vs. Fastify mock; ~2.4s"
> "The 53 vitest tests are the highest-signal local check."

**Actually true:** 108. (Note the same README says 92 at line 30 — three different numbers in one file, none correct.)

**Proposed:** 108 in both places, or better, drop the number from the prose at 1424 so it can't drift again.

**Confidence:** Certain.

### A6-09 · MAJOR · README.md:1407-1421 (Local development & testing)
> "### One-time setup … `npm install` … `npm run build`" then "### Fast loops (every PR) … `npm test`"

**Actually true:** `npm test` maps to `cd test/web && npm test` (`package.json:53`). The root package has **no npm workspaces**, so a fresh clone's `npm install` does not install `test/web/node_modules` or `test/mock-server/node_modules`. CI installs all three explicitly (`test.yml` test-web job: `npm ci`, then `npm install` in `test/mock-server`, then in `test/web`). A reviewer who follows README's one-time setup and runs `npm test` gets a module-resolution failure, not 108 passing tests. `test/README.md:70-78` has the correct procedure; the root README doesn't reference it.

**Proposed:** add to One-time setup: `(cd test/mock-server && npm install) && (cd test/web && npm install)`, or add npm workspaces so root `npm install` covers it.

**Confidence:** Certain (verified `package.json` has no `workspaces` key and CI installs each separately).

### A6-10 · MAJOR · README.md:1477
> `| Real Braze backend acceptance | … | One-time gate before tagging 0.1.0 |`

**Actually true:** `v0.1.0` was tagged 2026-05-22 and published without the Layer 4 smoke (`docs/smoke-tests/` contains only `_template-*.md`; no dated capture files). The "When" column describes a gate that was passed over.

**Proposed:** "Post-0.1.0; gate for the first capture set — see `docs/smoke-tests/`."

**Confidence:** Certain.

### A6-11 · MINOR · README.md (whole file)
**Missing sections the repo's own quality bar requires.** `REVIEW_READINESS.md:72-89` specifies a 14-item README structure "mirroring Braze's own docs". The actual README has none of: **Troubleshooting** (§11 of the spec — "top 10 issues + fixes"), **Platform parity matrix** (§10), **Privacy / GDPR / CCPA flows** (§9), **Push notifications setup decision tree** (§6), **"Should I enable SDK Authentication?" decision tree** (§5), **Initialization options reference** (§3), **Migration guides** (§12). Verified by heading grep — the README goes Status → Quick start → docgen API → Apps in this repo → Local development → Documentation → Native SDK versions → Platform setup → Contributing → License → Disclaimer.

This is a gap rather than a false sentence, but it becomes a *contradiction* because REVIEW_READINESS asserts the structure as the standard and §6 grades docs as ✓. Given the plugin's own framing ("Consumer-facing errors are README issues, not code issues" — CLAUDE.md:410), a Troubleshooting section covering the two Podfile edits, the AGP bump, the "addListener silently inert before initialize" behavior, and iOS `wipeData()` disabling the SDK for the app run is the highest-value addition.

**Confidence:** Certain the sections are absent.

### A6-12 · NIT · README.md:5-7 (badges)
Badge says `Capacitor 6+` while the peer dep is `^6.0.0 || ^7.0.0` and the podspec is `>= 6.0, < 8.0`. "6+" reads as open-ended; Capacitor 8 is explicitly out of range (`.github/dependabot.yml` comment). Consider `Capacitor 6 | 7`.

**Confidence:** High.

---

## CHANGELOG.md

### A6-13 · MINOR · CHANGELOG.md:77 (and duplicate at :445)
> `## [0.0.12] earlier `[Unreleased]` items, now rolled into `0.1.0``

Two `## [0.0.12]` headings exist (lines 77 and 445). The line-77 heading is also ungrammatical and breaks the Keep-a-Changelog `## [version] — date` form the file's own preamble commits to ("Format follows Keep a Changelog"). Any changelog parser sees a duplicate version.

**Proposed:** `## [0.1.0-rc] — items previously staged under [Unreleased], shipped in 0.1.0` — or fold the content into the 0.1.0 section and delete the heading.

**Confidence:** Certain.

### A6-14 · NIT · CHANGELOG.md (end of file)
No link-reference definitions (`[Unreleased]: .../compare/v0.1.0...HEAD`, `[0.1.0]: .../releases/tag/v0.1.0`). Keep a Changelog 1.1.0 — which the preamble cites — specifies these. Every `## [x.y.z]` bracket in the file is therefore an unresolved reference.

**Confidence:** Certain.

### A6-15 · (verified correct — no finding)
`[Unreleased]` was checked against `git log v0.1.0..main --oneline`. All three claims are accurate: `actions/setup-java@4 → @5` (commit `1c223c2`, confirmed live in `test.yml`), `android-actions/setup-android@3 → @4` (`f48d3c3`, confirmed), example dev-dep refresh (`8a0d9b1`), tsconfig `moduleResolution: bundler` + `rootDir` and the dependabot `@capacitor/*` major ignore (`530809f`, confirmed in `.github/dependabot.yml`). Nothing merged is missing; nothing listed is unmerged. **This section is clean.**

### A6-16 · MINOR · CHANGELOG.md:73 (0.1.0 "Fixed")
> "**L9-MAJOR-1: stale CLAUDE.md SDK pins + wrong podspec filename.**"

**Actually true:** the podspec-filename half was not fully fixed. `docs/mdcs/C08-NATIVE-SDK-PINNING.md:15` still reads ``| iOS | `BrazePlugin.podspec` | …`` *(the dead link this finding is about)* — a broken relative link to a file that does not exist (the file is `CapacitorBraze.podspec`). C08 is *the* pinning MDC, so it is the first place a reviewer checking pin policy lands. (`findings/L9-documentation.md:15` carries the same stale path, but that's an audit record.)

**Proposed:** fix `docs/mdcs/C08-NATIVE-SDK-PINNING.md:15` to `CapacitorBraze.podspec`; re-verify before re-claiming the fix.

**Confidence:** Certain — verified by a repo-wide relative-link resolver (this is the only broken link outside `findings/` and gitignored `.claude/`).

---

## CLAUDE.md — checked in, and a reviewer will read it as the project's self-description

### A6-17 · MAJOR · CLAUDE.md:73
> `| **Tests** | Jest (TS), instrumented (Android), XCTest (iOS), Maestro (e2e), Ktor (mock server) | — |`

**Actually true:** **vitest** (not Jest — `test/web/package.json` devDeps: `vitest: ^2.1.0`, no jest anywhere); **Robolectric/JUnit JVM unit tests** (not instrumented — `androidTestImplementation` deps exist but there is no `androidTest` source dir and no instrumented job in CI); XCTest exists but is **never run** (no Xcode target — see A6-30); **Maestro: zero implementation** (grep across the whole repo returns only aspirational prose in 4 markdown files); **Fastify/TypeScript mock server** (not Ktor — `test/mock-server/package.json` depends on `fastify: ^5.0.0`).

Four of five cells are wrong in the stack table of the file that is supposed to be the authoritative dev guide.

**Proposed:** `| **Tests** | vitest (web, 108 tests), Robolectric/JUnit (Android, 7), XCTest (iOS, scaffolded — no target yet), Fastify mock server (TS) | — |`

**Confidence:** Certain.

### A6-18 · MAJOR · CLAUDE.md:89, :157
> `| Mock Braze server (Ktor, in `test/mock-server`) | ✅ |`
> `    ├── mock-server/    # Ktor mock Braze backend (port 8080)`

**Actually true:** Fastify/TypeScript, and it binds an **ephemeral random port** per test (`freshMockServer()` in `test/web/src/test-utils.ts`; the observed run used port 56215), not a fixed 8080. The standalone runner prints its own URL (`test/README.md:75-78`).

**Confidence:** Certain.

### A6-19 · MAJOR · CLAUDE.md:235-259 (Testing — the four-layer pyramid)
Every command in this block is wrong:
```
npm test                                  # "Layer 1: TS contract tests (Jest, <1 min)"   → vitest, and it is Layer 3 not Layer 1
cd example && npm run test:android        → script does not exist
cd example && npm run test:ios            → script does not exist
cd example && npm run test:web            → script does not exist
cd test/mock-server && ./gradlew run      → no Gradle project; correct is `npm run standalone`
cd example && BRAZE_API_KEY=... npm run smoke  → script does not exist
```
**Verified:** `example/package.json` scripts are exactly `dev`, `build`, `preview`, `cap:sync`, `cap:ios`, `cap:android`. The real smoke wrappers are at the **repo root**: `npm run smoke:web` / `smoke:ios` / `smoke:android` → `scripts/smoke-*.sh` (which do exist). CLAUDE.md never mentions them, even though CHANGELOG.md:38 announces them.

**Proposed:** replace the block with `npm test` (root, 108 vitest tests), `cd demo/android && ./gradlew :capacitor-braze:testDebugUnitTest` (7 Robolectric tests), `cd test/mock-server && npm run standalone`, and `npm run smoke:{web,ios,android}`.

**Confidence:** Certain.

### A6-20 · MAJOR · CLAUDE.md:280, :419
> "Daily spec-drift CI catches Braze REST changes; you catch SDK changes by subscribing to Braze SDK release notes."
> "Only the daily spec-drift job hits real Braze; PR CI is fully self-contained."

**Actually true:** there is no spec-drift job. `.github/workflows/` contains exactly `test.yml` and `release.yml`; neither is scheduled (`on: push`/`pull_request` and `on: push: tags`). No real-Braze credential is referenced by any workflow. The same phantom job is asserted in `SDK_SURFACE.md:323`, `SECURITY.md:361`, `PLAN.md:282,287,431,469` — five documents describing CI that does not exist. `REVIEW_READINESS.md:454` is the only place that correctly records it as deliberately deferred.

**Proposed:** delete the claims, or point at `REVIEW_READINESS.md:454`'s deferral rationale.

**Confidence:** Certain.

### A6-21 · MAJOR · CLAUDE.md:158
> `└── web/src/    # vitest behavioral tests (94 as of 0.0.12)`

**Actually true:** 108, and the version is 0.1.0. Note CLAUDE.md:97 in the same file correctly says "Web behavioral tests (vitest + mock) — 108/108 ✅" — the file contradicts itself.

**Confidence:** Certain.

### A6-22 · MAJOR · CLAUDE.md:160-168 vs C01 / CONTRIBUTING / PR template — four incompatible "8-file lockstep" lists
The repo names an "8-file lockstep" as its central convention and then defines it four different ways:

| Source | Files listed | Includes a test file? | Includes SDK_SURFACE? |
|---|---|---|---|
| `docs/mdcs/C01-METHOD-ANATOMY.md:9-16` (self-declared authoritative) | definitions, web, swift, .m, kotlin, example/index.html, example/main.ts, CHANGELOG | ❌ | ❌ |
| `CONTRIBUTING.md:52-61` | identical to C01 | ❌ | ❌ |
| `.github/PULL_REQUEST_TEMPLATE.md:25-34` | the above **+ SDK_SURFACE.md** = **9 boxes**, under a heading that says "all **four** bridge surfaces" | ❌ | ✅ |
| `CLAUDE.md:160-168` | definitions, web, swift, .m, kotlin, **test/web/src/\<area\>.test.ts**, example (×2 as one), CHANGELOG | ✅ | ❌ |

Plus `CLAUDE.md:170` prose: "you touch four files in lockstep … **plus four test files** (web + native harness × 2 when C11 lands)" — which is 8+ files and contradicts CLAUDE.md's own numbered list three lines earlier.

**Consequence:** with 108 tests in the repo and a `test-web` CI job that is a required status check, the authoritative checklist (C01) and the enforcing artifact (PR template) both let a contributor add a method with **zero tests**. That is a process gap a senior reviewer will name.

**Proposed:** pick one list — C01 as the single source, amended to 9 items including `test/web/src/<area>.test.ts` — and make CONTRIBUTING, the PR template and CLAUDE.md verbatim copies. Fix the PR template's "four bridge surfaces" wording.

**Confidence:** Certain.

### A6-23 · MINOR · CLAUDE.md:68
> `| **Capacitor** | `@capacitor/core` ^6.0 (forward-compat to 7/8 as released) | peer dep |`

**Actually true:** the peer dep is `^6.0.0 || ^7.0.0` and the podspec is bounded `>= 6.0, < 8.0`. Capacitor 8 is *released* (8.5.2) and is deliberately **out of range** — `.github/dependabot.yml` ignores `@capacitor/*` majors and CHANGELOG.md:11 explains why (Capacitor 8 raises the AGP/JDK minimum to 21; CI runs JDK 17). "forward-compat to 7/8 as released" reads as a promise the project has explicitly declined.

**Proposed:** `` `@capacitor/core` `^6.0.0 || ^7.0.0` (Capacitor 8 out of scope — needs JDK 21; see CHANGELOG) ``

**Confidence:** Certain.

### A6-24 · MINOR · CLAUDE.md:23, :39
> C11 "— (impl pending)" / "(impl pending)"

**Actually true:** partially implemented. Android Robolectric tests exist (7 tests) and **run in CI** on every PR (`test.yml` verify-android → `./gradlew :capacitor-braze:testDebugUnitTest`). CLAUDE.md's own status table at line 101 says "C11 native test harnesses — first batch ✅ Android (Robolectric, 7 tests); iOS scaffolded" — correct, and contradicts lines 23/39 in the same file. `docs/mdcs/README.md:17` repeats "Implementation pending". See also A6-29.

**Proposed:** "(Android impl landed; iOS scaffolded, integration tier pending)".

**Confidence:** Certain.

### A6-25 · MINOR · CLAUDE.md:52-53 (status table)
> `| Web behavioral tests (vitest + mock) — 108/108 | ✅ |` is correct, but the table's own preamble ("Snapshot at `0.1.0`") sits above rows written in pre-release tense elsewhere in the file. Low-cost fix: add "Verified 2026-05-22" and a one-line "this table drifts — see `git log`" pointer (which line 108 already has, so this is a consistency nit only).

**Confidence:** High.

---

## SDK_SURFACE.md

### A6-26 · MAJOR · SDK_SURFACE.md:232
> "The minimum coherent plugin: … **~15 public methods.**"

**Actually true:** v0.1 shipped **35** methods + 4 listener events. `PLAN.md:155` and `PLAN.md:297,305,306` repeat "~15 methods" / "all 15 method signatures", and `REVIEW_READINESS.md:461` repeats "A plugin with 15 methods". The roadmap document under-describes the shipped surface by 2.3×, which makes every downstream version-target flag in §1 suspect.

**Proposed:** "35 public methods + 4 listener events (grew from the ~15 originally scoped; see CHANGELOG 0.0.1–0.1.0)".

**Confidence:** Certain.

### A6-27 · MAJOR · SDK_SURFACE.md §1 matrix — version flags contradict shipped reality
The matrix is the document's self-declared "source of truth for what we support". Spot-checked rows that are wrong:

| Line | Claim | Reality |
|---|---|---|
| 95 | "Listeners: `addListener` / `removeAllListeners` for **the two events above**." | 4 events (`inAppMessageReceived`, `sdkAuthError` shipped in 0.1.0) |
| 99 | "Not yet shipped — planned per their version target: **In-app messages (all of v0.1's IAM row)** …" | `inAppMessageReceived` + iOS `BrazeInAppMessageUI` + Android `BrazeInAppMessageManager` all shipped in 0.1.0 (CHANGELOG:24-31) |
| 99 + 128 | "push permission request" listed as *not shipped*, while the Push table row "Request push permission" is flagged **v0.1** | both can't be true; no `requestPushPermission` exists in `definitions.ts` |
| 216 | `getDeviceId()` → **v0.2** | shipped (`definitions.ts:883`) |
| 218 | `isDisabled()` → **v0.2** | shipped (`definitions.ts:1256`) |
| 217 | `isInitialized()` → **v0.1** | does not exist anywhere in the codebase |
| 208 | "Refresh signature mid-session" → **v0.2** | `setSdkAuthenticationSignature` shipped (`definitions.ts:762`) |
| 150 | IAM "Log impression / click / button click" → **v0.1** | no IAM impression/click methods exist |
| 72 | heading "### Currently shipped (as of 0.0.12)" | version is 0.1.0 |
| 74 | "Items in **bold below were already targeted to a version are also already shipped**." | ungrammatical — unparseable legend for the whole matrix |

**Proposed:** regenerate the matrix against `definitions.ts` mechanically (a 40-line script could diff docgen's `dist/docs.json` method list against the matrix rows and fail CI on drift — the strongest fix, given this table will drift again).

**Confidence:** Certain on each row (each verified against `src/definitions.ts`).

### A6-28 · MAJOR · SDK_SURFACE.md:294-303 (§3 Cross-platform divergence notes)
Written in present indicative about APIs that do not exist:
> ":294 `requestPushPermission` returns `{ granted, mechanism: 'web-push' | 'apns' | 'fcm' }`"
> ":295 `addGeofence` on web throws `UnsupportedOperationError` with message pointing to docs."
> ":296 `getBanner` on native throws `UnsupportedOperationError`."
> ":303 throw a typed `BrazeUnsupportedError` with a `platform` field and a doc link."

**Actually true:** none of `requestPushPermission`, `addGeofence`, `getBanner`, `UnsupportedOperationError`, or `BrazeUnsupportedError` exist (grep across `src/`, `ios/`, `android/`). The one real divergence — `registerPushToken` on web — throws a **plain `Error`** with a prose message (`registerPushToken` in `src/web.ts`), no error class, no `platform` field. A reviewer who greps for `BrazeUnsupportedError` after reading §3 finds nothing.

Additionally **:298**: "Session timeout config option is in milliseconds (Android) vs. seconds (iOS) … **Plugin accepts seconds in TS API, converts to ms internally on Android.**" — false. `android/.../BrazePlugin.kt:369` calls `builder.setSessionTimeout(sessionTimeoutInSeconds)` with **no conversion** (Braze Android's API takes seconds). If a reader trusts this note they will "fix" a non-bug into a 1000× error.

**Proposed:** rewrite §3 to describe only the one divergence that exists today (`registerPushToken` on web), in past/present tense, with the actual error text; move the rest to §2's roadmap as future design intent, clearly marked.

**Confidence:** Certain.

### A6-29 · MINOR · SDK_SURFACE.md:322
> "Dependabot configured for the example app (not the plugin itself — those are pinned)."

**Actually true:** `.github/dependabot.yml` has five entries including `directory: '/'` (the plugin's own dev deps), plus `/example`, `/demo`, `/test/mock-server`, and `github-actions`. The parenthetical is also confused: the Braze *SDK* pins aren't auto-bumped, but the plugin's npm dev deps are (that's what PR #14 and the "dev-deps" group are). SECURITY.md:341 repeats the same wrong claim.

**Confidence:** Certain.

### A6-30 · MINOR · SDK_SURFACE.md:11, :5-11 header
> "**Last updated:** 2026-05-20" / "`@braze/web-sdk` — **v6.7.x**"

**Actually true:** the file's last content edit was 2026-05-22 (commit `0ab8e19` "post-0.1.0 status sync across … SDK_SURFACE"), so the header date is wrong even by its own history. The tracked web-sdk version is 6.7.x; upstream is **6.13.0**. Native pins are 14.1.0 / 42.2.0 against upstream **18.2.1** (2026-09-08) and **43.2.0** (2026-09-21) — 4 major versions behind on iOS.

**No doc falsely claims the pins are "current" or "latest"** — C08's table column header "Current pin" correctly means "the pin currently in effect", and C08's bump protocol is sound. So this is a staleness/disclosure issue, not a false claim. But a reviewer *will* check upstream, and the repo says nothing about being 4 majors behind.

**Proposed:** add a one-line "Pin status as of \<date\>: BrazeKit 14.1.0 (upstream 18.2.1) — bump deferred pending Layer 4 smoke; see C08" to SDK_SURFACE §4 and the README's "Native SDK versions" section. Being explicit about a known gap reads far better than silence.

**Confidence:** Certain on the version numbers.

### A6-31 · MINOR · SDK_SURFACE.md:348
> "The plugin's `web.ts` imports the **core** variant by default (`@braze/web-sdk` tree-shaken without UI), and lazily imports the UI variant only when consumer calls `automaticallyShowInAppMessages` or `showContentCards`."

**Actually true:** `src/web.ts:566` does `await import('@braze/web-sdk')` — the full package, one dynamic import, no core/UI split. Neither `automaticallyShowInAppMessages` nor `showContentCards` is a plugin method. The "~50 KB gzipped saved" claim has no mechanism behind it.

**Confidence:** Certain.

### A6-32 · MINOR · SDK_SURFACE.md:41
> "**Min iOS:** 12.0+. Plugin sets `s.ios.deployment_target = '15.0'` **to match Capacitor 6+ defaults.**"

**Actually true:** Capacitor 6's default is **iOS 13.0** — README.md:49 says so explicitly ("`platform :ios, '15.0'` # was '13.0' in the Capacitor default") and C10 gives the same rationale. The 15.0 target exists because **BrazeKit 14.x requires it**, which is the whole reason for the mandatory consumer Podfile edit. This sentence removes the causal link that makes the Podfile requirement make sense.

**Proposed:** "…`'15.0'` because BrazeKit 14.x requires iOS 15+; this is what forces the consumer-side Podfile edit (see C10)."

**Confidence:** Certain.

---

## SECURITY.md

### A6-33 · MAJOR · SECURITY.md:105
> "### Server-side guidance in README … Reference implementations for Node.js, Python, Ruby, Go, and Kotlin/Ktor (since Aromo uses Ktor)."

**Actually true:** the README contains **no** SDK-Authentication server-side section at all — no JWT signing examples in any language, no claims structure, no key-generation or rotation guidance. (Verified by heading grep and full-text search for "JWT", "RS256", "sign".) The README's only SDK Auth content is one `sdkAuthSignature: '<jwt-from-your-backend>'` placeholder in the quick-start.

This is the single most load-bearing doc promise in SECURITY.md — SDK Auth is unusable without server-side signing, and §2 tells the reader the README has it.

**Proposed:** either write the README section (Node + one other language is enough for 0.1.x) or rewrite §2's "Server-side guidance in README" to "Server-side signing is the consumer's responsibility; see [Braze's SDK Authentication docs](https://www.braze.com/docs/developer_guide/sdk_authentication/). A worked Node example is planned for 0.2."

**Confidence:** Certain.

### A6-34 · MAJOR · SECURITY.md:117
> `| `enableSdkAuthentication: true` but `changeUser` called without signature | Plugin throws **`BrazeAuthRequiredError`** client-side before bridging. |`

**Actually true:** the enforcement now exists (good — it was audit finding L5-01 and shipped in 0.1.0), but there is **no `BrazeAuthRequiredError` class**. All three bridges emit a plain error with the byte-identical C01-format string:
``Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.``
(`src/web.ts:205`, `ios/Plugin/BrazePlugin.swift:253`, `android/.../BrazePlugin.kt:436`.) A consumer writing `catch (e) { if (e instanceof BrazeAuthRequiredError) ... }` per this doc gets a `ReferenceError`.

**Proposed:** quote the actual error string. (`REVIEW_READINESS.md:52-66` has the same problem — its "Good" error example shows a fictional `BrazeInitializationError` class with an error code and a doc link, and asserts "Every plugin error class has: error code, what went wrong, what to try, link to relevant doc section." There are no plugin error classes and no error codes.)

**Confidence:** Certain.

### A6-35 · MAJOR · SECURITY.md:340
> "**Dev deps:** Capacitor's standard scaffold (TS, Rollup, **Jest**), plus **Ktor** for the mock server, **Maestro** for e2e. All from reputable maintainers."

**Actually true:** vitest, Fastify, no Maestro. In a *dependency-security* section this is worse than elsewhere: the stated dependency inventory doesn't match `package.json` / `test/*/package.json`, which is exactly what a security reviewer cross-checks first.

**Confidence:** Certain.

### A6-36 · MAJOR · SECURITY.md:378
> "`.github/dependabot.yml` watches GitHub Actions versions too (**pinned by SHA, not tag**)."

**Actually true:** every action in both workflows is tag-pinned, not SHA-pinned: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-java@v5`, `android-actions/setup-android@v4`, `gitleaks/gitleaks-action@v2`, `softprops/action-gh-release@v2`, and **`snyk/actions/node@master`** — a mutable branch reference, which is the exact supply-chain pattern the sentence claims to have eliminated. `dependabot.yml`'s own comment hedges ("pinned by SHA where possible"); SECURITY.md states it flatly.

**Proposed:** either SHA-pin the actions (and pin `snyk/actions/node` off `@master` regardless) or downgrade the sentence to "tag-pinned, bumped weekly by Dependabot; SHA pinning planned."

**Confidence:** Certain.

### A6-37 · MINOR · SECURITY.md:361
> "CI uses GitHub Actions encrypted secrets for: npm publish token, **daily-spec-drift Braze trial key**."

No spec-drift job and no such secret. Only `NPM_TOKEN` and the optional `SNYK_TOKEN` are referenced by any workflow. (See A6-20.)

**Confidence:** Certain.

### A6-38 · MINOR · SECURITY.md:352
> "**Renovate bot** configured for grouped weekly dep updates on the example app."

No `renovate.json` / `.renovaterc` exists. The grouped weekly updates come from **Dependabot** — which line 341, eleven lines earlier, correctly names. Two bots claimed, one exists.

**Confidence:** Certain.

### A6-39 · MINOR · SECURITY.md:345
> "GitHub Advanced Security (free for public repos) runs on every PR."

No CodeQL workflow or `.github/workflows/codeql.yml` exists in the repo. Dependabot alerts + gitleaks + `npm audit` + optional Snyk are what actually run. GHAS code scanning requires an explicit workflow; nothing enables it.

**Proposed:** replace with the four scanners that do run, or add a CodeQL workflow.

**Confidence:** High (certain that no CodeQL workflow is committed; GHAS default-setup could in principle be enabled repo-side, which is not visible from the tree — worth confirming before rewording).

### A6-40 · MINOR · SECURITY.md:156
> "**v0.5 adds a config gate:** `allowInsecureEndpoint: false` (default), preventing accidental `http://` in production builds."

**Actually true:** `allowInsecureEndpoint` shipped in v0.1 and is enforced on all three platforms today (`definitions.ts:25`; strict `=== true` / `getBool(...,false)` checks). Future tense for a shipped feature, three sections above §4's own "Endpoint validation" bullet that describes it as current.

**Confidence:** Certain.

### A6-41 · MINOR · SECURITY.md:164-175 (§4 Endpoint validation)
> "Plugin parses `endpoint` URL client-side at `initialize` time. Rejects: … Malformed URLs. Endpoints not in Braze's known cluster list (**warning, not error**)."

**Actually true:** URL parsing + malformed rejection did ship on all three platforms in 0.1.0 (good). But the **cluster warning is web-only** — `src/web.ts:973-991` has the cluster sanity check; grep for `cluster` in `BrazePlugin.swift` and `BrazePlugin.kt` returns nothing. CHANGELOG.md:32 is accurate about this ("web *additionally* warns on unknown cluster patterns"); SECURITY.md §4 states it unqualified. Also, §4's hardcoded cluster list (line 173) is a maintenance liability that the implementation deliberately avoided (it pattern-matches `sdk.<region>-NN.braze.{com,eu}` instead) — the doc and the code use different strategies.

**Proposed:** "Unknown-cluster warning: **web only**, and by pattern (`sdk.<region>-NN.braze.com|eu`) rather than a fixed list."

**Confidence:** Certain.

### A6-42 · MINOR · SECURITY.md:379 + PR template + REVIEW_READINESS.md:177
> "No `postinstall` scripts in plugin's `package.json` (common supply-chain attack vector)."

**Literally true, materially misleading.** `package.json:57` has `"prepare": "npm run build"`, added in 0.1.0 specifically so git-URL installs build on the consumer side (CHANGELOG.md:36). `prepare` executes on `npm install` from a git URL — the same arbitrary-code-on-install surface the sentence claims to have avoided. It is correctly *skipped* for registry-tarball installs (CLAUDE.md:298 explains this well), so the risk is narrow — but the security claim as phrased doesn't survive a reviewer running `npm pkg get scripts`.

**Proposed:** "No `postinstall` script. A `prepare` script runs the build — it executes only on git-URL / local installs, never on installs from the npm registry tarball."

**Confidence:** Certain.

### A6-43 · MINOR · SECURITY.md:372-374 (§13 Source verification)
> "All commits to `main` require PR review." / "`main` branch protected: no force-push, no direct push, **required reviewers ≥1**."

Not corroborated and partly contradicted: the repo's own enumerated protection list (`CHANGELOG.md` 0.0.12 block, `docs/REPO-HYGIENE.md`, `REVIEW_READINESS.md:443-446`) records 8 required checks, no force-push, no deletions, conversation resolution, signed commits, and **`enforce_admins: false` (solo-project hotfix path)** — no required-reviewer rule is listed anywhere, and on a solo project a ≥1-reviewer rule with admin bypass is not a meaningful control. I can't inspect branch settings from the tree, so this is flagged as *unsupported*, not proven false.

**Proposed:** make §13 cite `docs/REPO-HYGIENE.md`'s enumerated list rather than restating it differently.

**Confidence:** Medium (contradiction with the repo's own list is certain; the live GitHub setting is unverifiable here).

### A6-44 · (verified correct — no finding)
**§14 Vulnerability disclosure is good.** Points at GitHub private security advisories with a working URL, explicitly forbids public issues, gives response targets (72h ack / 7d triage / 14d patch), and is honest that `security@` + PGP are post-1.0. `SECURITY.md:8` links §14 from the top. This is better than most community plugins.

---

## REVIEW_READINESS.md — the doc most damaged by 0.1.0 shipping

### A6-45 · MAJOR · REVIEW_READINESS.md — 130+ checkboxes, **zero** are checked
Every `- [ ]` in §2, §3 and §5 is unchecked (verified: `grep -c '^- \[x\]'` → 0). Many are demonstrably done:
`ProGuard rules in consumer-rules.pro` (:144 — the file exists and is wired via `consumerProguardFiles`), `PrivacyInfo.xcprivacy included` (:155 — ships via podspec `resource_bundles`), `SwiftLint clean` (:158 — `--strict` in `verify-ios`), `strict: true in tsconfig` (:161), `enableLogging defaults to false` (:171), `Threat model published in SECURITY.md` (:175), `Vulnerability disclosure policy` (:176), `Real LICENSE file (MIT)` (:215), `CONTRIBUTING.md` (:216), `Issue templates that route correctly` (:217 — `.github/ISSUE_TEMPLATE/` has bug/feature/config with correct upstream routing), `Git tags per release` (:205 — `v0.1.0` exists), `CHANGELOG entry per release` (:204), `Provenance attestation` (:207 — `npm publish --provenance` in `release.yml`), `npm test passes` (:285), `Maintainer named` (:212).

§6 ("Current readiness snapshot") *does* grade many of these ✓ with evidence — but §6 is 200 lines below §5, and a reviewer scanning "Pre-release checklist" sees an all-empty checklist and concludes nothing shipped. This is the most damaging *presentational* problem in the repo.

**Proposed:** tick the boxes that §6 already evidences, or replace §5's raw checkboxes with a pointer to §6 and keep §5 as prose criteria only.

**Confidence:** Certain.

### A6-46 · MAJOR · REVIEW_READINESS.md:108
> "Each gets a Maestro e2e test before v0.1 ships."

**Actually true:** 0.1.0 shipped 2026-05-22; **no Maestro test exists** (zero YAML flows, no `.maestro/` dir, no dependency, nothing in CI). And the same document at **:454** lists "Maestro E2E tests in CI" under "Items deliberately deferred past 0.1.0 (documented exclusions)" with the rationale "the vitest harness covers the equivalent ground". The doc promises and retracts the same thing 346 lines apart, and the promise comes first.

**Proposed:** delete :108 or rewrite as "Each is covered by the Layer 4 smoke playbook; Maestro e2e is deferred — see §7."

**Confidence:** Certain.

### A6-47 · MAJOR · REVIEW_READINESS.md:119-129 (Performance budgets)
> table with "`apk-analyzer` in CI", "`size-limit` CI check", "benchmark in CI" … followed by: "**Budget violations fail CI.**"

**Actually true:** none of these exist in `test.yml`. No `size-limit` config, no `apk-analyzer` step, no benchmark job. And the same document at **:349-350** admits it: "Code coverage targets met | ○ | No numeric coverage targets enforced" and "Bundle size budgets met | ○ | Budgets aren't enforced (no `size-limit` config)". A flat "Budget violations fail CI" is the kind of sentence a reviewer tests in 30 seconds.

**Proposed:** "Budgets are aspirational targets; none are CI-enforced today (see §6 and §7 deferrals)."

**Confidence:** Certain.

### A6-48 · MAJOR · REVIEW_READINESS.md:37-43 (One-command install)
> "`npm install capacitor-braze && npx cap sync` … The Capacitor sync step auto-installs the CocoaPod (iOS) and Gradle dep (Android). **No manual Podfile edits. No manual `build.gradle` edits.**"

**Actually true:** both manual edits are mandatory. iOS needs `platform :ios, '15.0'` + `use_frameworks! :linkage => :static` (README:47-51, C10, validated on a fresh `cap init` 2026-05-20 per CHANGELOG). Android needs the AGP 8.6.0 + compileSdk 35 + Gradle 8.7 bumps (A6-03). The paragraph's escape hatch ("If a step beyond `cap sync` is required, document it loudly…") is the right instinct but arrives after two flat declaratives that a skimming reviewer reads as fact.

**Proposed:** rewrite as the actual state: "`npm install` + two Podfile lines + three Android Gradle bumps, all documented in the README install section and C10. Target for 0.2: shrink this to `cap sync` alone if BrazeKit's packaging allows."

**Confidence:** Certain.

### A6-49 · MAJOR · REVIEW_READINESS.md:70
> "`example/` directory … **`cd example && npm install && npx cap run ios` works on a fresh clone.**"

**Actually true:** `example/` has **no `ios/` and no `android/` directory** (verified — they are not committed, and `example/README.md:64-74` says so explicitly: "The native platform projects are generated locally — they're not committed"). `npx cap run ios` on a fresh clone fails with no iOS platform. `example/package.json` also has no `cap run` script. The demo app is the one with committed native projects.

**Proposed:** "`cd example && npm install && npm run dev` works on a fresh clone; native platforms are generated on demand with `npx cap add ios|android` (see `example/README.md`)."

**Confidence:** Certain.

### A6-50 · MAJOR · REVIEW_READINESS.md:433-447 (§7 "Blockers to tag 0.1.0")
> "Items that **MUST** clear before `v0.1.0` ships to npm: 1. **Layer 4 manual smoke against the Braze trial** … ☐ Pending trial run."

**Actually true:** `v0.1.0` shipped without it. The document's own header at **:7** (updated post-release) says the opposite: "the maintainer-driven trial captures + Xcode target are post-`0.1.0` polish items, **not gates**." §7 was never updated to match. Same for item 5's "☐ Signed commits … npm 2FA" still framed as a 0.1.0 blocker.

**Proposed:** retitle §7 to "Blockers to tag 0.2.0 / remaining post-0.1.0 work" and move the ✅ items into a "cleared" list.

**Confidence:** Certain.

### A6-51 · MINOR · REVIEW_READINESS.md:341, :345, :360, :377-379 (§6 snapshot rows)
§6 is itself pre-release in four rows:
- :341 "74 behavioral + 17 serializer tests across **13 files**" → 108 across 14.
- :345 "Layer 4 manual smoke … ◌ | … smoke pass is **the gate to 0.1.0**" → 0.1.0 shipped.
- :360 "enumerates the **36** method names exactly" → 35 (and README says 35, TEST-COVERAGE-AUDIT says 37 counting listeners; three numbers for one surface).
- :377 "Version bumped per semver | ✓ | **At 0.0.12**"; :378 "Git tag created | ◌ | First tag will be `v0.1.0` after smoke" → `v0.1.0` exists; :379 "GitHub Release drafted | ◌" → `release.yml` creates one on tag push.

Commit `0ab8e19` updated the header paragraph but not the tables underneath.

**Confidence:** Certain.

### A6-52 · MINOR · REVIEW_READINESS.md:49
> "TypeDoc HTML reference auto-generated, hosted via GitHub Pages."

No TypeDoc, no GitHub Pages. The project deliberately uses `@capacitor/docgen` into README instead — which the same doc correctly records at **:356** ("**TypeDoc not used** per C09") and **:452** (deferred). Third instance of the same promise/retraction pattern.

**Confidence:** Certain.

---

## PLAN.md

### A6-53 · MINOR · PLAN.md — stale throughout; needs an "as-planned, superseded by" banner
PLAN.md is honestly dated ("Last updated: 2026-05-20") and is legitimately a *planning* artifact. But CONTRIBUTING.md:8 and the README both send readers to it as a **source-of-truth doc**, so its stale contents read as current claims:

| Line | Says | Reality |
|---|---|---|
| 155, 297, 305, 306 | "~15 methods" / "all 15 method signatures" | 35 |
| 227 | "Layer 1 — **Tool:** Jest, runs in Node." | vitest, jsdom |
| 242 | "Build a small **Ktor** server (~150 LOC)" | Fastify/TS |
| 249 | "drives interactions via **Detox or Maestro**" | neither exists |
| 268-287, 431 | CI block with a `mock-server-spec-drift` daily job + `.github/workflows/spec-drift.yml` | does not exist |
| 305 | `com.braze:android-sdk-ui:34.x` | 42.2.0 — and `34.x` is a *range*, which C08 forbids |
| 306 | `BrazeKit + BrazeUI ~> 12.x` | 14.1.0 exact |
| 316 | "CONTRIBUTING.md + **CODE_OF_CONDUCT.md**" (also :392 in the repo-structure tree) | no `CODE_OF_CONDUCT.md` file; the CoC is a 3-line section inside CONTRIBUTING |
| 318, 125, 394, 409, 455 | package name `@bma342/capacitor-braze` | unscoped `capacitor-braze` — PLAN.md:480 itself records the decision to go unscoped, but five other lines were never updated |
| 295-318 | ~20 unchecked `- [ ]` boxes for work that is complete (MIT license, README, CHANGELOG, CONTRIBUTING, definitions.ts, web.ts, publish 0.1.0) | done |
| 420, 423, 424 | repo tree shows `test/ts/` (Jest), `test/e2e/` (Detox/Maestro), `test/mock-server/` (Ktor) | actual: `test/web/` (vitest), `test/mock-server/` (Fastify) |
| 481-482 | "**Default: Ktor** for first build" / "**Default: Maestro**" under "§14 Open decisions" | both decided otherwise; §14 never closed |

**Proposed:** add a dated banner at the top — "This is the **original 2026-05 plan**, preserved for provenance. Where it disagrees with the shipped code, the code wins; see CHANGELOG + SDK_SURFACE §2." — and close §14's open decisions with the actual outcomes (Fastify over Ktor, vitest over Jest, no e2e runner, unscoped name). A one-paragraph banner converts the whole file from "stale claims" to "honest history", which is much cheaper than rewriting it.

**Confidence:** Certain on each row.

---

## docs/mdcs/ (C01–C11 + README)

### A6-54 · MAJOR · docs/mdcs/ — **every `file:line` worked-example reference is wrong (29/29)**
`docs/mdcs/README.md:57` states the contract: "**Each MDC** states a rule, the rationale, a worked example pinned to current code (`file:line` refs)"; :60 tells the reader "Don't read an MDC and assume it's still accurate — **verify against the worked example's `file:line` reference first**."

I did exactly that for all 29 refs. **None resolves to the cited construct.** Sample:

| Doc | Cited | What is actually at that line | Where it really is |
|---|---|---|---|
| C01:37 | `src/web.ts:388` — `requireInitialized()` | `const raw = braze.getFeatureFlag(options.id);` | `src/web.ts:533` |
| C01:38 | `src/web.ts:404` — `requireUser()` | `const braze = this.requireInitialized();` | `src/web.ts:547` |
| C01:39 | `BrazePlugin.swift:524` — `requireInitialized` | `guard quantity >= 1, quantity <= 100 else {` | `swift:988` |
| C01:40 | `BrazePlugin.kt:637` — `requireInitialized` | a KDoc line inside `getDeviceId` | `kt:1025` |
| C01:41 | `BrazePlugin.kt:651` — `requireUser` | `}` | `kt:1039` |
| C02:31 | `definitions.ts:252` — the FeatureFlag DTO | `export type BrazeEventPropertyValue = …` | — |
| C02:59 | `swift:436` — `serializeFeatureFlag` | `return` | — |
| C03:70 | `web.ts:40` — `WEB_GENDER_MAP` | `BrazeSetLastNameOptions,` (an import) | — |
| C05:95 | `swift:62` — listener wiring | blank line | — |
| C06:37 | `web.ts:98` — `enableLogging` default | blank line | — |
| C07:64 | `definitions.ts:371` — init-independent set in `initialize` JSDoc | `type: 'classic';` | — |

(Full list verified programmatically; the table is representative, not exhaustive.)

**Why this matters more than the usual line-drift nit:** the MDC index makes line-accuracy a stated guarantee and instructs readers to rely on it. A reviewer who spot-checks one ref and lands on a blank line will stop trusting the MDC set entirely — which is a shame, because the *prose* in the MDCs is the strongest documentation in the repo.

**Proposed:** two options, both cheap. (a) Strip the `:NNN` and link to the file with a symbol name — `` [`requireInitialized` in `src/web.ts`](<relative path to src/web.ts>) `` — which never drifts. (b) Keep line numbers but add a CI step that parses `file:line` refs out of `docs/**/*.md` and asserts the named symbol appears within ±5 lines. Given the repo's ratchet-test culture, (b) fits; (a) ships today.

**Confidence:** Certain (all 29 checked mechanically).

### A6-55 · MINOR · docs/mdcs/C08-NATIVE-SDK-PINNING.md:15
> ``| iOS | `BrazePlugin.podspec` | `s.dependency 'BrazeKit', '14.1.0'` (exact) | **14.1.0** |``

Wrong filename and the only broken relative link in the tracked tree. File is `CapacitorBraze.podspec`. CHANGELOG.md:73 claims this class of bug was fixed in 0.1.0 (see A6-16).

**Confidence:** Certain.

### A6-56 · MINOR · docs/mdcs/C09-TOOLING-QUALITY-GATES.md:100-108 (CI job table)
The table lists **7** jobs and omits **`test-web`** — the job that runs the 108 behavioral tests, and a required status check per `docs/REPO-HYGIENE.md`. C09 is the MDC about quality gates; omitting the test gate from the gate table is conspicuous. The `verify-android` row is also incomplete: it now also runs `./gradlew :capacitor-braze:testDebugUnitTest` (the 7 Robolectric tests), added in 0.1.0.

Related count drift: README:35 says "8 required CI checks" (correct — matches `REPO-HYGIENE.md`'s enumerated 8 and the 8 jobs in `test.yml`), while `findings/SUMMARY.md` says "9 jobs". C09 says 7.

**Proposed:** add the `test-web` row; amend `verify-android`'s description; state the count once (8) and cross-reference.

**Confidence:** Certain.

### A6-57 · MINOR · docs/mdcs/C11-NATIVE-TEST-HARNESSES.md:5, :270 + docs/mdcs/README.md:17
> C11:5 "The web bridge currently runs against a Fastify mock under jsdom (**53 vitest tests**, ~2.4s)" → 108.
> C11:270 "## Status (as of **`0.0.13`**)" → no `0.0.13` ever existed; versions went 0.0.12 → 0.1.0 (confirmed against CHANGELOG headings and the single `v0.1.0` tag).
> C11:3 "documents the design … so the implementation, **when it lands**" and `docs/mdcs/README.md:17` "**Implementation pending**" → the Android tier landed and runs in CI; C11's own §Status (line 272) says "Implementation kickoff complete."

**Is "impl pending" still the right status?** No — it should be **"Android implemented (7 Robolectric contract tests, in CI); iOS scaffolded but not wired (no Xcode target); integration tier (URLProtocol / MockWebServer) still design-only."** That's a materially better story than "pending" and the repo is under-selling itself.

**Confidence:** Certain.

### A6-58 · MINOR · docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md:167 + README:1519 + SDK_SURFACE:27 — three minSdk numbers
C10:167 "**`minSdkVersion`**: 21 (Braze Android SDK 42.x floor). Capacitor's stock template sets `minSdkVersion 22`, which satisfies this — no consumer action needed."
vs `SDK_SURFACE.md:27` "Min SDK: API 21 (officially supported API 25+). **Plugin sets `minSdkVersion = 26`**"
vs `android/build.gradle` default `minSdkVersion 26`
vs `demo/android/variables.gradle` `minSdkVersion = 22` (which overrides the plugin's default, since the consumer's `rootProject.ext` wins).

Three documents, three numbers, and the plugin's own declared default (26) is silently overridden to 22 by the demo. Whatever the true Braze 42.x floor is, the docs should state one number and the plugin should declare it consistently.

**Proposed:** verify Braze 42.2.0's actual `minSdk` from the AAR manifest, state it once in C10, and make `android/build.gradle`'s default match.

**Confidence:** Certain about the inconsistency; the correct floor needs an AAR check I did not perform.

### A6-59 · (verified correct — no finding)
**C10's iOS section is excellent and matches reality exactly.** `demo/ios/App/Podfile` has `platform :ios, '15.0'` and `use_frameworks! :linkage => :static` with an explanatory comment and a link to Braze's install docs; C10's error-symptom text matches what CocoaPods actually emits; README's quick-start inlines it. This is the model the Android section should follow.

---

## findings/ — the May 2026 audit

### A6-60 · BLOCKER · findings/SUMMARY.md (whole file) — reads as an open indictment of code that has since been fixed
`CHANGELOG.md:16` sends the reviewer straight here: "This is the first release **the project's own audit ([`findings/SUMMARY.md`](../2026-05/SUMMARY.md) *(now archived at that path)*) judges credible to publish**." The reviewer clicks and reads:

> ":26 ### Tag `0.1.0` today? **NO**"
> ":28 …would land in any honest changelog as 'shipped with a known correctness bug'…"
> ":32 **L4-S11** — iOS pulls in BrazeUI (~2MB of binary) but never `import BrazeUI`, so in-app messages don't render on iOS."
> ":51 **SDK Auth not enforced** … this exact bypass exists today."
> ":53 **Zero native tests** + zero recorded real-Braze smoke."
> ":15 CLAUDE.md ships SDK pins that are 8 major versions stale"

**Every one of those is closed.** iOS `import BrazeUI` + `BrazeInAppMessageUI` presenter shipped (CHANGELOG:28); SDK Auth is enforced on all three bridges (verified at `web.ts:205`, `swift:253`, `kt:436`); Android native tests exist and run in CI; the CLAUDE.md pins are correct. The file is a frozen snapshot of `a726357`/`0.0.12` with no marker saying so beyond a `**Date:** 2026-05-22` line, and its verdict header is the loudest text on the page.

Other now-misleading statements throughout `findings/`: `L9-documentation.md:49` "`test/ios/` does not exist. `android/src/test/` does not exist" (both exist); `L1-contract-integrity.md:46` "there are 2 listener events" (4); `L3-validation.md:59` "C11's 'impl pending' status is the gating dependency"; `SUMMARY.md` "92/92 in 3.06s" (108); `L5-security.md:28,36` marking §2 and §4 promises **FAIL** (both now implemented).

**Recommendation — archive with a resolution header, do not delete.** Deleting loses genuinely impressive provenance (a self-audit that found and fixed 3 BLOCKERs + 22 MAJORs is a *credibility asset*). Concretely:
1. `git mv findings/ docs/audits/2026-05/`.
2. Add `docs/audits/2026-05/README.md`: "Point-in-time audit of `a726357` / `0.0.12`, 2026-05-22. **All BLOCKER and MAJOR findings were closed in 0.1.0** — see the CHANGELOG 0.1.0 entry, which maps each fix to its finding ID. Retained as provenance; read it as history, not as an open punch list."
3. Prepend a one-line `> **RESOLVED in 0.1.0**` / `> **OPEN**` banner to each `L*.md`, or at minimum to `SUMMARY.md` directly under the `# Audit Summary` heading and above the "Tag 0.1.0 today? NO" verdict.
4. Update the four inbound links (`CHANGELOG.md:16`, `CLAUDE.md:147,340`, `REVIEW_READINESS.md:7`) to the new path.

**Confidence:** Certain that the content is stale; the archive-vs-keep call is a judgment recommendation.

---

## CONTRIBUTING.md / LICENSE / package.json / templates

### A6-61 · MAJOR · CONTRIBUTING.md:24-48 (Dev setup) — no way to run the tests
The Dev setup section covers clone → `npm install` → `npm run build` → run the example app, and the PR checklist (:102-109) asks for "`npm run build` clean" and "CI green". **`npm test` is never mentioned anywhere in CONTRIBUTING**, nor is `test/web`, `test/mock-server`, the Robolectric tier, or the `smoke:*` wrappers. A contributor following CONTRIBUTING literally cannot discover that 108 tests exist, and the PR-checklist has no "tests added / tests pass" box.

**Proposed:** add a "Running the tests" block:
```bash
(cd test/mock-server && npm install) && (cd test/web && npm install)
npm test                                                  # 108 vitest tests
cd demo/android && ./gradlew :capacitor-braze:testDebugUnitTest   # 7 Robolectric tests
```
plus a `- [ ] Tests added for the new behavior` box in the PR checklist and PR template.

**Confidence:** Certain.

### A6-62 · MINOR · CONTRIBUTING.md:96-100 (Cross-platform divergence)
> "On the unsupported platform, throw a clear `UnsupportedOperationError`-shaped error pointing at the docs."

Same phantom error type as A6-28/A6-34. The one real instance (`registerPushToken` on web, `src/web.ts:437`) throws a plain `Error`. Contributors told to follow a convention that the codebase doesn't implement will either invent a class or copy the plain-`Error` pattern and be "wrong" per the doc.

**Proposed:** describe what the code does — a plain `Error` whose message states the platform, the reason, the branch-on-`Capacitor.getPlatform()` remedy, and the MDC link — and quote `registerPushToken`'s actual text as the template.

**Confidence:** Certain.

### A6-63 · MINOR · CONTRIBUTING.md:171-181 (npm 2FA)
> "**Before the first `0.1.0` publish**, enable two-factor authentication on the npm account…"

0.1.0 published 2026-05-22. Stale tense in a maintainer-setup section, sitting next to `REVIEW_READINESS.md:447`'s still-open "☐ … npm 2FA" — so the reader can't tell whether 2FA is on.

**Proposed:** "Required on the maintainer npm account (`auth-and-writes`). Status: [confirm]."

**Confidence:** Certain about the tense.

### A6-64 · MINOR · .github/PULL_REQUEST_TEMPLATE.md:22-34
> "When adding a new plugin method, all **four** bridge surfaces must be touched in this PR." followed by **nine** checkboxes.

Also inconsistent with C01/CONTRIBUTING's eight (see A6-22), and has no test-file box (A6-61). The Security-review box "No `postinstall` scripts added to `package.json`" inherits A6-42's imprecision.

**Confidence:** Certain.

### A6-65 · (verified correct — no finding)
**`package.json` metadata is clean and consistent.** `description` carries the disclaimer verbatim ("Unofficial, community-maintained … Not affiliated with or endorsed by Braze, Inc."), `author`/`repository`/`bugs`/`homepage` all point at `bma342/capacitor-braze` consistently, `license: MIT` matches `LICENSE` (MIT, © 2026 Bryce Aspinwall, matching the README footer), keywords are sensible (11, including `appboy` for discoverability), and the `files` allowlist is tight. Podspec derives `summary`/`license`/`author`/`version` from `package.json`, so they can't drift. **Only stale bit:** `devDependencies` still pins `@capacitor/{core,ios,android}: ^6.0.0` while the peer allows `^6 || ^7` — so CI only ever builds against Capacitor 6. Not a doc finding, but worth passing to the CI/build reviewer.

### A6-66 · (verified correct — no finding)
**`.github/ISSUE_TEMPLATE/config.yml` is well done.** `blank_issues_enabled: false` plus five contact links routing Braze Android / Swift / Web SDK bugs, Capacitor bugs, and Braze account questions upstream — exactly what `REVIEW_READINESS.md:217` asks for and exactly what keeps a wrapper plugin's issue tracker sane.

---

## docs/ (non-MDC) and test/

### A6-67 · MAJOR · test/README.md:88-92 ("Future expansions")
> ":90 **Per-method tests for the remaining 35 methods.** This **Phase P.1 commit ships one test (`logCustomEvent`)** proving the harness works. Subsequent phases add per-method coverage."
> ":92 **CI integration**: a `test-web` job in `.github/workflows/test.yml` so every PR runs these."

**Actually true:** 108 tests across 14 files covering 37/37 methods, and the `test-web` job has existed since before 0.1.0. A reviewer who opens `test/` — a natural second stop after README — is told the suite has *one* test. This single sentence undersells the repo's strongest artifact by two orders of magnitude.

**Proposed:** delete both bullets; replace with "108 tests / 14 files / ~2s, 37/37 methods covered — see `docs/TEST-COVERAGE-AUDIT.md`. Remaining: native behavioral tiers per C11."

**Confidence:** Certain.

### A6-68 · MINOR · docs/TEST-COVERAGE-AUDIT.md:3-5
> "**Audited:** 2026-05-20 … **Test count:** **92 tests** = 75 behavioral + 17 serializer across 14 files. ~2.4s total."

→ 108. (Method counts 37/37 and the per-method table are still correct, so this doc only needs the header refreshed.) Note the README cites this file as tracking "33/37" (A6-04) — a third number.

**Confidence:** Certain.

### A6-69 · MINOR · docs/SMOKE-TEST-PLAYBOOK.md:5
> "**This is the gate to tagging `0.1.0`.** The web bridge has **53 vitest-mock tests** proving its wire output…"

0.1.0 was tagged and published without this playbook being run (`docs/smoke-tests/` contains only `_template-*.md`, no dated captures). And 53 → 108.

**Proposed:** "This is the gate to the first *validated* release claim and to tagging `0.2.0`. 0.1.0 shipped on mock-verified wire format only — see README Status."

**Confidence:** Certain.

### A6-70 · NIT · docs/REPO-HYGIENE.md:3
> "Sister to `REVIEW_READINESS.md §7` *(the anchor this finding is about; §7 is now "Remaining work")* item 5."

The anchor currently resolves (§7 still exists), but it is pinned to a heading that A6-50 recommends renaming. Flagging so the two fixes move together.

**Confidence:** Certain.

### A6-71 · MINOR · .github/dependabot.yml:70-75
```yaml
  # Mock-server Gradle deps (Ktor, JUnit)
  - package-ecosystem: 'gradle'
    directory: '/test/mock-server'
```
`test/mock-server` is a **Fastify npm project** with no Gradle build. This ecosystem entry is a permanent no-op, and its comment is the last live artifact of the Ktor-era design — which is exactly the drift CLAUDE.md, SECURITY.md and PLAN.md still describe (A6-17, A6-35, A6-53). Fixing it to `package-ecosystem: 'npm'` both restores the dependency coverage SECURITY.md §12 claims and removes the misleading comment.

**Confidence:** Certain.

---

## Source-level (CLAUDE.md forbids `TODO`; scanned for the full family)

### A6-72 · MINOR · ios/PluginTests/BrazePluginContractTests.swift:15
> "Tests requiring an initialized `Braze` instance + Capacitor bridge live in **`BrazePluginBridgeTests.swift` (added in a follow-up PR** once an iOS app target is set up…)"

`ios/PluginTests/` contains exactly one file; `BrazePluginBridgeTests.swift` does not exist. This is a forward-reference to a file that isn't there — functionally a TODO, which `CLAUDE.md:368` and `C01:95` both forbid ("file a GitHub issue instead"). The surrounding comment block is otherwise excellent (it documents the exact 4-step Xcode wire-up procedure).

**Proposed:** drop the filename, keep the rationale, and link a tracking issue: "Bridge-coupled tests are blocked on an XCTest host target — see issue #NN."

**Confidence:** Certain.

### A6-73 · (verified correct — no finding)
**Zero `TODO` / `FIXME` / `XXX` in any shipped source** (`src/`, `ios/Plugin/`, `android/src/main/`, `test/`, `scripts/`) — verified by grep. `REVIEW_READINESS.md:346`'s claim ("Verified: 0 TODOs, 0 `@Suppress`, no force-unwraps in Swift, no `any` types") holds. The only `TODO` strings in the repo are the rules forbidding them. The remaining "pending"-family phrases are all legitimate status language (C11's "impl pending" — stale per A6-57 — and C10:198's honest "not yet implemented in this plugin (planned for v0.2)" for `requestPushPermission`, which is the *correct* way to phrase an unshipped method and which SDK_SURFACE:128 contradicts by flagging it v0.1).

### A6-74 · (verified correct — no finding) · Docgen sync
Ran `npm run build` (clean, exit 0) and then `git status --porcelain` / `git diff --stat README.md`: **no diff**. The `<docgen-api>` block between README.md:132 and :1394 is byte-identical to what `@capacitor/docgen` regenerates from `src/definitions.ts`. The `build-plugin` CI job additionally asserts the block is populated. **The generated 92% of the README is accurate and in sync — every error in this report is in the hand-written 8%.**

---

# What is genuinely good

Worth stating plainly, because the finding count above under-represents the repo's actual quality:

1. **The docgen'd API reference (README:132-1394, ~1,260 lines) is fully in sync and genuinely excellent.** Every one of the 35 methods + 4 listener overloads carries JSDoc with an `@example`; all option/result interfaces and type aliases are rendered. Verified by rebuild-and-diff. For a consumer, this is the part that matters most and it is correct.
2. **The disclaimer discipline is exemplary and consistent.** "Not affiliated with or endorsed by Braze, Inc." appears in the README header blockquote *and* footer, an "Unofficial" badge, `package.json` `description`, `PLAN.md`, `SDK_SURFACE.md:5`, `SECURITY.md:5`, `example/README.md`, and `demo/README.md`. Trademark attribution is correct. Zero drift across eight surfaces — rare.
3. **The MDC set is the best writing in the repo.** C01's error-message convention, C03's month-indexing / epoch-ms / sentinel rules, C05's eager-subscribe-no-replay listener model, C07's five criteria for init-independence and its candid documentation of the BrazeKit 14.x asymmetry, C10's iOS Podfile section — these explain *why*, not just *what*, and they'd survive a Braze engineer's read. The line-number rot (A6-54) is a mechanical problem sitting on top of genuinely good content.
4. **`SECURITY.md` §14 disclosure policy** is concrete and correct: GitHub private advisories, explicit "don't open a public issue", 72h/7d/14d response targets, honest about `security@`+PGP being post-1.0.
5. **Issue-template routing** (`config.yml`) sends Braze-SDK bugs upstream to three separate Braze repos and Capacitor bugs to Ionic — precisely the hygiene a wrapper plugin needs, and `blank_issues_enabled: false` enforces it.
6. **The CHANGELOG is the most accurate document in the repo.** `[Unreleased]` matches `git log v0.1.0..main` exactly (A6-15). The 0.1.0 entry maps each fix to its audit finding ID (L1-01, L2-01, L4-S02…), gives rationale rather than commit messages, explicitly enumerates the pinned SDK versions and the Capacitor compat range, and has a candid "Deferred (post-0.1.0)" section. Two entries even carry "Verified on a fresh `cap-init` install 2026-05-20" provenance.
7. **The 0.1.0 release is substantively real.** Cross-checked the code: `import BrazeUI` + `BrazeInAppMessageUI` presenter wired on iOS; `BrazeInAppMessageManager` register/unregister on Android `handleOnResume`/`handleOnPause`; SDK-Auth enforcement present in all three bridges with **byte-identical** error strings; C02 tagged-union DTOs on native; URL parse + cluster check at `initialize`. The audit's BLOCKERs are genuinely closed — the docs just don't say so.
8. **Honest "what this does NOT prove" sections** in `test/README.md` and the README's "What is NOT yet locally testable" table. Explicitly naming coverage limits is a trust signal most plugins skip.
9. **Release engineering is solid**: `release.yml` verifies `package.json` version matches the tag before publishing, publishes with `--provenance`, and creates the GitHub Release — no local publishes.
10. **`demo/` and `example/` are a genuinely good pair**, and both READMEs are accurate about their own scope (including `example/README.md` correctly stating that native projects aren't committed — the fact `REVIEW_READINESS.md:70` gets wrong).

---

# Count by severity

| Severity | Count | IDs |
|---|---|---|
| **BLOCKER** | 4 | A6-01, A6-02, A6-03, A6-60 |
| **MAJOR** | 29 | A6-04, A6-05, A6-06, A6-07, A6-08, A6-09, A6-10, A6-17, A6-18, A6-19, A6-20, A6-21, A6-22, A6-26, A6-27, A6-28, A6-33, A6-34, A6-35, A6-36, A6-45, A6-46, A6-47, A6-48, A6-49, A6-50, A6-54, A6-61, A6-67 |
| **MINOR** | 31 | A6-11, A6-13, A6-16, A6-23, A6-24, A6-25, A6-29, A6-30, A6-31, A6-32, A6-37, A6-38, A6-39, A6-40, A6-41, A6-42, A6-43, A6-51, A6-52, A6-53, A6-55, A6-56, A6-57, A6-58, A6-62, A6-63, A6-64, A6-68, A6-69, A6-71, A6-72 |
| **NIT** | 3 | A6-12, A6-14, A6-70 |
| **Verified correct (no finding)** | 7 | A6-15, A6-44, A6-59, A6-65, A6-66, A6-73, A6-74 |

**Total: 67 real findings** (4 + 29 + 31 + 3) across 74 numbered entries; the remaining 7 are explicit clean-bills recorded so the next reviewer doesn't re-check them.

**Findings by file (real findings only):** README.md 11 · CLAUDE.md 8 · REVIEW_READINESS.md 8 · SECURITY.md 10 · SDK_SURFACE.md 7 · docs/mdcs/ 5 · CONTRIBUTING.md 3 · CHANGELOG.md 3 · findings/ 1 · PLAN.md 1 (multi-part) · test/ + docs/ misc 4 · .github/ 2 · source 1.

## The three fixes with the highest credibility-per-minute

1. **README.md lines 3, 27, 30, 34, 37, 39, 44, 1419, 1424, 1477 (~20 minutes).** The plugin is on npm and has 108 tests; the README says it's unpublished with 53–92 tests and 2 listener events. Nothing else in this report costs a reviewer more trust per word.
2. **Add a resolution banner to `findings/SUMMARY.md` and archive the directory (~15 minutes).** The CHANGELOG links a reviewer to a document whose loudest line is "Tag `0.1.0` today? **NO**" about bugs fixed four months ago. One header turns a liability into the repo's best provenance artifact.
3. **README Android platform-setup section (~15 minutes).** "No extra config required" is the one documentation error that will actively break a consumer's build — and the repo's own `demo/android/` already contains the exact three edits the section should list.

One structural suggestion, given this repo's ratchet-test culture: a small CI step that (a) parses `file:line` refs out of `docs/**/*.md` and asserts the named symbol is within ±5 lines, and (b) diffs the method list in `dist/docs.json` against SDK_SURFACE §1's matrix rows, would mechanically prevent A6-27 and A6-54 from ever recurring. Both classes of drift are the direct cause of ~35% of the findings above.
