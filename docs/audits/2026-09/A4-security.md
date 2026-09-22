> **Archived audit report — read the resolution table first.**
> Point-in-time review of `capacitor-braze` at commit `0ab8e19` / version `0.1.0`, dated 2026-09-22.
> The findings below were current *then*. The table immediately after this banner records what
> happened to each one in `0.2.0`. Where the report and the current code disagree, the code wins.
> Index of audits: [`../README.md`](../README.md).
>
> **Several items here are GitHub / npm account settings, which code changes cannot close.** Those
> are marked *maintainer action* and the exact commands live in
> [CONTRIBUTING → Maintainer pre-tag checklist](../../../CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020).
> They are **not** done. Do not read this table as claiming otherwise.

## Resolution status

| ID | Status in 0.2.0 | Note |
|---|---|---|
| A4-01 | partly fixed + disclosed | `0.1.0` was published by hand and has **no provenance attestation**; nothing can retroactively change that, and the CHANGELOG, README and `SECURITY.md` now say so. `0.2.0` is the first release published by the workflow, with `--provenance`, a not-already-published guard, a `--dry-run` first, and a post-publish attestation check. npm Trusted Publishing is the intended end state and is a maintainer action. |
| A4-02 | **maintainer action — not done** | Private vulnerability reporting is still switched off, so `SECURITY.md` §14's documented channel does not exist yet. §14 now says so explicitly and links the enabling command. |
| A4-03 | fixed (documentation) | `SECURITY.md` §6 rewritten. The plugin's role for HTML in-app messages is **disclosure only**: `inAppMessageReceived` is observational and cannot return `'discard'` (Capacitor listeners have no return channel), and `allowUserSuppliedJavascript` is not exposed. The real controls named are the consumer's WebView CSP, Braze dashboard hygiene, and the `@braze/web-sdk` ≥ 6.13.0 floor. |
| A4-04 | fixed (documentation) | `SECURITY.md` §7 rewritten: the plugin does not intercept deep links; Capacitor's `server.allowNavigation` is the control, and it is Capacitor's, not this plugin's. `deepLinkReceived` moved to the `SDK_SURFACE.md` roadmap. |
| A4-05 | fixed | Every `uses:` in both workflows is pinned to a 40-character commit SHA with a version comment; all seven were re-resolved from their tags and matched. `snyk/actions/node@master` — a moving branch — is now a tagged release SHA. |
| A4-06 | fixed in CI; **two maintainer actions remain** | `release.yml` calls `test.yml` as a reusable workflow, so publish waits on the whole suite; permissions are per-job least privilege; the publish job runs in an `npm-publish` environment. **Not done:** creating that environment with a required reviewer, the `v*` tag ruleset, and migrating from the 2FA-bypassing automation token to npm Trusted Publishing. |
| A4-07 | **maintainer action — not done** | `enforce_admins` and linear history are still off. `SECURITY.md` §13 no longer claims a required-reviewer rule: on a single-maintainer repo it would be a rule with a standing bypass, which is not a control. The honest state is now described, and the commands are in CONTRIBUTING. |
| A4-08 | fixed | See [A2-06](./A2-ios.md). |
| A4-09 | fixed | See [A3-09](./A3-android.md). |
| A4-10 | fixed | `SNYK_TOKEN` moved to the job's `env:`, so `if: env.SNYK_TOKEN != ''` can evaluate. The step still needs the secret to be provisioned — a maintainer action — and `CONTRIBUTING.md` says so. |
| A4-11 | fixed | See [A1-11](./A1-ts-web.md) / [A3-11](./A3-android.md). |
| A4-12 | fixed | The cluster check now exists on all three platforms and logs the *shape*, never the endpoint. |
| A4-13 | fixed (documentation) | §3 now states the actual, stronger posture — the bridge emits no log output containing user data on any platform, so there is nothing to mask — instead of describing a masking scheme that was never built. §8's `NODE_ENV` gate claim is deleted: the endpoint warning is deliberately always-on, because a misconfigured endpoint in production is worth a console line. |
| A4-14 | partly fixed | The Renovate sentence (no such config) and the GitHub Advanced Security claim (no CodeQL workflow) are deleted; §12 now lists the four scanners that actually run and credits secret scanning + push protection, which are enabled and previously got no mention. **Not done:** adding CodeQL (a scope decision), and enabling Dependabot *security* updates (maintainer action). |
| A4-15 | fixed | All six `npm install` invocations in CI are `npm ci`. The example and demo lockfiles were regenerated for the `@braze/web-sdk ^6.13.0` bump so `npm ci` is clean. |
| A4-16 | fixed | The `/test/mock-server` Dependabot entry is `npm`, not `gradle`; `/test/web` added. |
| A4-17 | fixed | `permissions: contents: read` at workflow level in `test.yml`; per-job grants in `release.yml`. |
| A4-18 | fixed | The README has a `## Security` section covering which key to use, whether to enable SDK Authentication, a starting CSP for the Capacitor WebView, the right-to-be-forgotten flow, privacy declarations, and logging/PII. `SECURITY.md`'s cross-references point at it. |
| A4-19 | fixed | "Privacy declarations you must make" in the README and [C10](../../mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md), covering the App Store label, Play Data Safety and ATT, with the caveat that Braze's own disclosure is the authority on categories. |
| A4-20 | fixed | `CHANGELOG.md` and `SECURITY.md` ship in the tarball; the dangling `android/proguard-rules.pro` entry was removed with the file; a `pack-check` CI job asserts both halves (required artifacts present, repo-internal paths absent). |
| A4-21 | **open — deliberate** | The two high advisories are in an EOL ESLint 8 chain in the dev tree only. CI gates on `--omit=dev`, which is correct. Blocked on `@ionic/eslint-config` 0.5.0 for the ESLint 9/10 migration. |
| A4-22 | **maintainer action — not done** | Three of the six Dependabot PRs are superseded by the SHA pins and should be closed; three need a rebase against this branch. The triage is written out in CONTRIBUTING; no PR was merged or closed by the fix wave. The `gitleaks-action` v3 licensing question is resolved: v3.0.0 is a runtime-only bump and needs no `GITLEAKS_LICENSE` for public repos. |
| A4-23 | fixed (documentation) | Both caveats are in `SECURITY.md` §8 and the README: an Android device-level system property can raise `BrazeLogger` verbosity independently of `enableLogging`, and the README no longer recommends a git-URL install (which runs `prepare`, and bypasses the registry tarball's integrity path). |

### The promise → implementation table in this report

Every **FAIL** row in that table was either implemented or the promise was removed. The rows that
remain honestly negative — no CodeQL, no required reviewers, 0.1.0 without provenance, private
vulnerability reporting off, admins not enforced — are now *stated* in `SECURITY.md` rather than
contradicted by it.

---

# A4 — Security model, supply chain, release hygiene

**Repo:** `/Users/bryceaspinwall/eatsuite/capacitor-braze` @ `0ab8e19` (main, clean tree)
**Audited:** 2026-09-22 · read-only (no repo files modified; `git status` clean before and after)
**Scope:** SECURITY.md promise→code verification across all three bridges, logging/PII paths, API-key and
endpoint handling, SDK Authentication, CI/release supply chain, tarball, secrets, branch protection,
dependency health, privacy-manifest honesty.

**Verification method:** every finding below was confirmed against code, the GitHub API, or the npm
registry — not against the project's own docs. Where I could not reach ground truth (BrazeKit's
default logger level; GitHub's step-`env`-in-`if` evaluation) I say so and give a fix that is correct
either way.

---

## Findings

### A4-01 · BLOCKER · The published 0.1.0 artifact has no provenance attestation, and was published by hand

**Where:** npm registry packument for `capacitor-braze@0.1.0`; `.github/workflows/release.yml:55-58`;
`SECURITY.md:364-368`; `REVIEW_READINESS.md:380`; `findings/L10-pre-publish.md:40`.

**Evidence:**

```
$ curl -s https://registry.npmjs.org/capacitor-braze | jq '.versions["0.1.0"].dist | keys'
["integrity","shasum","tarball","fileCount","unpackedSize","signatures"]   # no "attestations"
$ ... .time["0.1.0"]  → 2026-05-22T17:07:03.564Z     # npm publish
$ gh run list --workflow=release.yml
completed  failure  Release  v0.1.0  push  26314173939  28s  2026-05-22T22:03:33Z
$ gh api .../actions/runs/26314173939/jobs
"Publish to npm with provenance" → failure ; "Create GitHub Release" → skipped
$ gh release list →  v0.1.0 … 2026-05-22T22:03:31Z   (exists, but the workflow step that creates it was skipped)
```

The package was on npm **five hours before** the tag was pushed. The tag-triggered Release run then
failed at the publish step (almost certainly `EPUBLISHCONFLICT` — the version already existed), and the
GitHub Release was created by hand. `dist.signatures` present in the packument is the npm **registry's**
own signing key, not provenance; provenance would appear as `dist.attestations`.

**Why it matters:** SECURITY.md §13 states "Provenance enabled (`npm publish --provenance`) — signed
release attestation visible on npm" and "No manual `npm publish` from local machines." Both are false
for the only artifact that exists. A reviewer runs `npm audit signatures` or opens the npm page, sees no
provenance badge, and every other supply-chain claim in the document loses credibility. The release
pipeline has also never been proven end-to-end — the one time it ran, it failed.

**Fix:**
1. Publish `0.1.1` through the workflow so provenance is actually attached, then verify with
   `npm view capacitor-braze@0.1.1 dist.attestations` (should be non-null) and `npm audit signatures`.
2. Move to npm **Trusted Publishing** (OIDC) and delete `NPM_TOKEN` entirely — it removes the
   stolen-token attack surface described in A4-06 and makes provenance mandatory rather than a flag.
3. Add a `--dry-run` publish job on tag-candidates, or guard the real step with
   `npm view capacitor-braze@$VERSION > /dev/null 2>&1 && exit 1` so an accidental manual publish makes
   the workflow fail loudly instead of silently masking a bypass.
4. Correct SECURITY.md §13 / REVIEW_READINESS.md:380 once the first CI publish lands.

**Confidence:** High (registry + Actions API, both quoted).

---

### A4-02 · MAJOR · The documented vulnerability-disclosure channel is switched off

**Where:** `SECURITY.md:383-387` (§14).

**Evidence:**

```
$ gh api repos/bma342/capacitor-braze/private-vulnerability-reporting
{"enabled":false}
```

SECURITY.md §14 says: "open a private security advisory at
`https://github.com/bma342/capacitor-braze/security/advisories/new`. GitHub's private vulnerability
reporting is enabled on the repository, so the maintainer is notified without any public disclosure."
With PVR disabled, only repo collaborators can reach that form; an outside reporter gets a 404/redirect.

**Why it matters:** §14 also says "**Do not** open a public issue." A researcher who follows the
instruction, hits a dead form, and then has nowhere private to go will either drop the report or
disclose publicly. This is the one security control in the whole document that costs a single click and
it is the one that is off. It is also the first thing many security reviewers check.

**Fix:** Repo → Settings → Advanced Security → enable **Private vulnerability reporting**. One command:
`gh api -X PUT repos/bma342/capacitor-braze/private-vulnerability-reporting`. Re-verify with the GET.

**Confidence:** High.

---

### A4-03 · MAJOR · SECURITY.md §6's XSS mitigations for HTML in-app messages do not exist

**Where:** `SECURITY.md:210-211` vs. `src/definitions.ts:591-596`,
`ios/Plugin/BrazeIAMDelegate.swift:33-40`, `android/.../BrazePlugin.kt:168-176`, `src/web.ts:160-177`.

**Evidence:** §6 claims two plugin-layer mitigations:

> "Braze's `allowUserSuppliedJavascript` config flag is off by default. **Plugin's `initialize` exposes
> it explicitly**" — it does not. `grep -rn allowUserSuppliedJavascript src ios android` returns exactly
> one hit: a JSDoc comment at `src/definitions.ts:558`. There is no such field on
> `BrazeInitializeOptions` and no bridge reads it. `SDK_SURFACE.md:152` defers it to v0.2.

> "Plugin's `addListener('inAppMessageReceived')` fires **before** Braze renders, letting consumer
> inspect message content and **return `'discard'` if suspicious**" — impossible as built.
> `BrazeIAMDelegate.swift:39` hardcodes `return .now`; `BrazePlugin.kt:174` hardcodes
> `return InAppMessageOperation.DISPLAY_NOW`; `web.ts:176` calls `braze.showInAppMessage(message)`
> unconditionally in the same tick as `notifyListeners`. The plugin's own contract says so plainly at
> `definitions.ts:593`: *"Listeners cannot block display — the plugin always returns `DISPLAY_NOW`."*
> Capacitor listeners are fire-and-forget; they have no return channel to native.

**Why it matters:** §0's threat table rates "XSS via HTML in-app messages" as **Medium** and points at §6
for the mitigation. A consumer doing a security review of their own app will read §6, conclude they have
an inspect-and-discard hook, and design their compensating controls around a hook that cannot exist. The
`definitions.ts` JSDoc and SECURITY.md say opposite things about the same listener.

**Fix:** Rewrite §6 to match reality: the plugin's role for HTML IAMs is **disclosure only** in 0.1.x —
`inAppMessageReceived` is observational, `allowUserSuppliedJavascript` is not yet exposed (Braze's own
default of `false` applies), and the real control is the consumer's WebView CSP plus Braze dashboard
account hygiene. If a discard hook is genuinely wanted, it needs a different shape — e.g. an
`initialize({ inAppMessagePolicy: 'default' | 'suppress' })` option, or a `setInAppMessageDisplayPolicy`
method the delegate consults synchronously — and belongs in SDK_SURFACE.md as a v0.2 item, not in
SECURITY.md as present tense.

**Confidence:** High.

---

### A4-04 · MAJOR · SECURITY.md §7 (Deep link security) describes an API that was never built

**Where:** `SECURITY.md:225-245` — entire section.

**Evidence:** §7 describes `Braze.addListener('deepLinkReceived', listener)`, a
`{ allow: boolean, replaceWith?: string }` return contract, and a documented consumer allow-list
pattern. `grep -rn "deepLink" src/ ios/ android/src/main/` returns **zero** hits. The event is not in
the `addListener` overload set in `definitions.ts`, not in `SDK_SURFACE.md`, and not in any bridge.
Deep-link handling is entirely Braze's SDK default.

**Why it matters:** §0 rates "Deep link redirection (open arbitrary URLs)" as **Medium — addressed via
Capacitor URL allow-list**, and §7 is where that "addressed" is cashed out. Two of the three claims in
§7 are about plugin behavior that does not exist; only the third (Capacitor's `server.allowNavigation`
governs navigation) is true, and it is true because of Capacitor, not because of this plugin. The same
drift was flagged in the project's own prior audit (`findings/L5-security.md:43`, rated "Low") and was
not fixed in the 0.1.0 doc sync (`0ab8e19`).

**Fix:** Replace §7 with what is actually true today: "The plugin does not intercept deep links in
0.1.x. URLs from push/IAM are handled by the Braze SDK and, for in-WebView navigation, by Capacitor's
`server.allowNavigation` allow-list, which the consumer configures. A `deepLinkReceived` interception
listener is roadmapped for vX.Y." Then add it to SDK_SURFACE.md §2 if it is really planned.

**Confidence:** High.

---

### A4-05 · MAJOR · GitHub Actions are not SHA-pinned (and one is pinned to a moving branch), contradicting the stated policy

**Where:** `.github/workflows/test.yml:19,22,201,213,238,242,302,306,314,320`;
`.github/workflows/release.yml:30,33,61`; `.github/dependabot.yml:6,74`; `SECURITY.md:378`.

**Evidence:** Every action is a floating major tag — `actions/checkout@v4`, `actions/setup-node@v4`,
`actions/setup-java@v5`, `android-actions/setup-android@v4`, `gitleaks/gitleaks-action@v2`,
`softprops/action-gh-release@v2` — and `test.yml:213` uses `snyk/actions/node@master`, a **moving
branch**, which is the weakest possible reference. Meanwhile:

- `SECURITY.md:378`: "`.github/dependabot.yml` watches GitHub Actions versions too (**pinned by SHA, not
  tag**)."
- `dependabot.yml:6`: "GitHub Actions: weekly, **pinned by SHA where possible** (supply-chain hygiene)."
- `dependabot.yml:74`: "per SECURITY.md §13: **SHA-pinned** via Dependabot"

None of the three is true of the files they annotate.

**Why it matters:** A tag is mutable. If `softprops/action-gh-release@v2` or `snyk/actions@master` is
compromised (both are third-party; the Snyk one runs inside the `audit` job), the attacker's code runs
in CI on the next push with whatever token that job holds. `release.yml` grants `contents: write` +
`id-token: write` workflow-wide, so a compromised `softprops/action-gh-release@v2` sits next to the npm
OIDC identity. The practical risk here is mostly on `release.yml`, which is exactly the job you cannot
afford to lose.

**Fix:** Pin every `uses:` to a full 40-char commit SHA with a trailing `# vX.Y.Z` comment; Dependabot
updates SHA pins natively and will keep the comment in sync. Prioritize `release.yml` (3 actions) and
`snyk/actions/node@master` → a tagged release SHA. Then either delete the three "SHA-pinned" claims or
let them become true.

**Confidence:** High.

---

### A4-06 · MAJOR · The release path publishes without tests, without a tag/environment gate, and with a 2FA-bypassing token

**Where:** `.github/workflows/release.yml:16-19,21-24,39-58`; `CONTRIBUTING.md:147-158`;
`SECURITY.md:366`; `gh api .../rulesets → []`.

**Evidence:** Four separate weaknesses on one path.

1. **No tests before publish.** The job runs `npm ci` → `npm run build` → version check → `npm publish`.
   It never runs `npm test` (the 108 web behavioral tests), lint, or the native verify jobs. `test.yml`
   only triggers on `push: branches: [main]` and `pull_request`, never on tags — so a tag pointing at a
   commit that never landed on main publishes with zero test coverage.
2. **No tag protection.** `gh api repos/bma342/capacitor-braze/rulesets` → `[]`. Branch protection on
   `main` does not cover tags. Anyone with write access can push `v9.9.9` and trigger a publish.
3. **No environment gate.** The publish job has no `environment:` with required reviewers, so there is no
   human checkpoint between "tag pushed" and "package on npm."
4. **`NPM_TOKEN` defeats the 2FA claim.** `SECURITY.md:366` says "`npm publish` requires **2FA** on the
   npm account" and `CONTRIBUTING.md:147-152` says enabling `auth-and-writes` 2FA "blocks token-theft
   attacks from publishing malicious versions." npm **automation** tokens are specifically designed to
   bypass 2FA for CI; a stolen `NPM_TOKEN` publishes a malicious version regardless of the account's 2FA
   setting. (`CONTRIBUTING.md:162` also misstates verification — provenance is checked with
   `npm audit signatures` / the npm web UI, not `npm install --foreground-scripts`.)

**Why it matters:** These compound. The single highest-severity row in the project's own threat model
(§0: "Supply-chain attack on the plugin itself — **High** — addressed via npm 2FA + signed releases") is
mitigated by neither 2FA (bypassed by the token) nor signed releases (A4-01: no attestation shipped).

**Fix:**
- Add `needs:`-style gating: either call `test.yml` via `workflow_call` from `release.yml`, or add
  `on: push: tags: ['v*']` to `test.yml` and make the publish job `needs: [lint, test-web, build-plugin,
  verify-ios, verify-android]`.
- Create a tag ruleset restricting `v*` creation to the maintainer, and put the publish job behind an
  `environment: npm-publish` with a required reviewer.
- Replace `NPM_TOKEN` with npm Trusted Publishing (OIDC) — this closes #4 and #1's provenance gap in one
  move. Then fix the 2FA prose in SECURITY.md §13 and CONTRIBUTING.md.
- Scope `permissions:` per-job rather than workflow-wide, so the publish job holds `id-token: write` and
  only the release-creation job holds `contents: write`.

**Confidence:** High.

---

### A4-07 · MAJOR · Branch protection does not match SECURITY.md §13 (no review requirement, admins exempt)

**Where:** `SECURITY.md:370-374`; `gh api repos/bma342/capacitor-braze/branches/main/protection`.

**Evidence:**

```json
{"required_status_checks":{"strict":true,"contexts":[8 checks]},
 "required_signatures":{"enabled":true},
 "enforce_admins":{"enabled":false},
 "required_linear_history":{"enabled":false},
 "allow_force_pushes":{"enabled":false},
 "allow_deletions":{"enabled":false},
 "required_conversation_resolution":{"enabled":true}}
```

There is **no `required_pull_request_reviews` key at all** — no review requirement, no
"dismiss stale reviews," nothing. And `enforce_admins: false` means the sole maintainer (who is an admin)
can push directly to `main`, bypassing all 8 required checks.

SECURITY.md §13 claims: "All commits to `main` require PR review" and "`main` branch protected: no
force-push, no direct push, **required reviewers ≥1**." The force-push and signed-commit claims are
**true and verified**. The review claims are not.

**Why it matters:** This is the difference between "protected" and "protected against someone else."
The honest position for a single-maintainer OSS project is that required reviewers are impractical —
**a reviewer will not hold that against you, but they will hold the inaccurate claim against you.**
`enforce_admins: false` is the substantive part: it means the 8 required checks (including the two
native verify jobs and the security audit) are advisory for the only person who can push.

**Fix:**
1. `gh api -X POST repos/bma342/capacitor-braze/branches/main/protection/enforce_admins` — turn on admin
   enforcement. Costs nothing on a PR-based workflow and makes the required checks real.
2. Consider `required_linear_history: true` (you already squash-merge).
3. Rewrite §13's "Source verification" bullets to: required status checks (list them), required signed
   commits, no force-push, no deletions, conversation resolution required, admin enforcement on — and
   state plainly that required reviewers are not enabled because the project has one maintainer.

**Confidence:** High.

---

### A4-08 · MAJOR · iOS: `enableLogging: false` sets the SDK logger to `.info`, not off

**Where:** `ios/Plugin/BrazePlugin.swift:141`.

```swift
configuration.logger.level = enableLogging ? .debug : .info
```

**Evidence:** BrazeKit 14.1.0's `Braze.Configuration.Logger.Level` enum
(`Pods/BrazeKit/.../arm64-apple-ios.swiftinterface:933-938`) is
`case debug / info / error / disabled = 255`. Braze documents the shipped default as `.error`. The
plugin therefore *raises* verbosity above the SDK default when the consumer has explicitly asked for
logging **off**.

Compare the other two platforms: web passes `enableLogging: false` straight into
`braze.initialize()` (`web.ts:136`), which suppresses the Web SDK's console output entirely; Android
leaves the SDK default alone when false (`BrazePlugin.kt:347-349`).

**Why it matters:** `SECURITY.md:249-257` (§8) is titled "Logging — production-safe by default" and
opens with "`enableLogging` in Braze's SDKs is **verbose**. Logs include request payloads (events,
attributes, sometimes PII)… dangerous in production." `C06-SECURITY-DEFAULTS.md` §1 makes
`enableLogging: false` a SemVer-protected security default. On iOS that default currently means
"informational SDK logging on," which on a release build writes Braze session/request lifecycle lines to
the device console — readable by anyone with the device attached or a sysdiagnose. The fix is one word.

**Fix:** `configuration.logger.level = enableLogging ? .debug : .disabled` (or `.error` if you want
genuine errors to remain visible — argue it either way, but `.info` is not "off"). Add a web test-parity
note in C06's default table, and add the iOS case to the C11 harness once it lands.

**Confidence:** High on the code and the enum; Medium on BrazeKit's shipped default being `.error` (the
`.swiftinterface` does not expose default property values). The finding holds either way — `.info` is
not what `enableLogging: false` promises.

---

### A4-09 · MAJOR · Android: verbose logging is a sticky process-global with no off switch

**Where:** `android/.../BrazePlugin.kt:344-349`.

```kotlin
if (enableLogging) {
    BrazeLogger.enableVerboseLogging()
}
```

**Evidence:** `enableVerboseLogging()` sets a **static** log level on `BrazeLogger` for the whole
process. The plugin never sets it in the `else` branch and never restores it. So:

- `initialize({ enableLogging: true })` (dev/QA path, consent-gated re-init, a debug build's first init)
  → later `initialize({ enableLogging: false })` → **verbose Braze logging stays on for the rest of the
  process**, including every subsequent `logCustomEvent` / `setEmail` / `setCustomUserAttribute` payload
  the SDK logs.
- The same applies across `wipeData()` → re-init, which is precisely the consent-revocation flow §10/§11
  are built around.

Verified from the shipped AAR that an off switch exists
(`javap com/braze/support/BrazeLogger.class`, `com.braze:android-sdk-base` 42.2.0):

```
public static final int SUPPRESS;
public static final int VERBOSE;
public static final int getLogLevel();
public static final void setLogLevel(int);
public static final void enableVerboseLogging();
```

**Why it matters:** This is the exact PII-in-logs failure mode SECURITY.md §8 and C06 §3 exist to
prevent, and it fails open — once on, always on — on the platform where log capture is easiest
(`adb logcat`, and on-device log readers). The plugin's own contract says the toggle is per-`initialize`.

**Fix:** Set the level in **both** branches so the toggle is symmetric and idempotent:

```kotlin
BrazeLogger.logLevel = if (enableLogging) BrazeLogger.VERBOSE else BrazeLogger.SUPPRESS
```

(`Log.INFO` is the other defensible "off" value — pick one, document it in C06's default table, and make
web/iOS/Android say the same thing.) Add a Robolectric assertion in the C11 Android harness that
`initialize(enableLogging = false)` after `initialize(enableLogging = true)` leaves
`BrazeLogger.logLevel` non-verbose — this is the kind of regression that is invisible without a test.

**Confidence:** High (both the sticky-global behavior and the available setter are verified against the
shipped AAR).

---

### A4-10 · MINOR · The Snyk CI step can never run, and the docs tell maintainers it will

**Where:** `.github/workflows/test.yml:211-218`; `CONTRIBUTING.md:128-145`; `SECURITY.md:347`.

**Evidence:**

```yaml
- name: Snyk vulnerability scan
  if: env.SNYK_TOKEN != ''
  uses: snyk/actions/node@master
  continue-on-error: true
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

The `if:` reads the `env` context, which is populated from workflow- and job-level `env` — not from the
step's own `env:` block, which is bound after the conditional is evaluated. Empirically, on the most
recent CI run the step is skipped:

```
$ gh api .../actions/runs/30840560858/jobs   # job "Security audit (plugin only)"
"Scan for committed secrets (gitleaks)" → success
"Snyk vulnerability scan"               → skipped
```

(It is skipped today anyway because no token is provisioned — but it would remain skipped after
provisioning, which is the part CONTRIBUTING.md:136-141 promises will "pick up the secret and run the
scan.")

**Why it matters:** Low direct risk (`continue-on-error: true` makes it advisory), but it is a scanner
the docs count as present — `SECURITY.md:347` "Snyk free tier as backup scanner" — that will silently
never execute. The maintainer would provision the token, see green CI, and believe the scan ran.

**Fix:** Hoist the secret to job level so the conditional can see it:

```yaml
audit:
  runs-on: ubuntu-latest
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  steps:
    ...
    - name: Snyk vulnerability scan
      if: env.SNYK_TOKEN != ''
      uses: snyk/actions/node@<sha>   # see A4-05
```

Also note the job pulls the `snyk/snyk:node` container image on every run even when the step is skipped
(visible as the "Pull snyk/snyk:node" step) — moving Snyk to its own job would stop paying that cost.

**Confidence:** High that it is skipped today (observed); Medium on the precise mechanism (GitHub's
step-`env`-in-`if` semantics are under-documented). The proposed fix is correct under either reading.

---

### A4-11 · MINOR · The HTTPS-rejection error string drifts between web and native, against C04 and C06's explicit claim

**Where:** `src/web.ts:955-958` vs. `ios/Plugin/BrazePlugin.swift:122-123` and
`android/.../BrazePlugin.kt:316-320`; `docs/mdcs/C06-SECURITY-DEFAULTS.md` §2.

**Evidence:**

| Platform | String |
|---|---|
| web | ``Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` only for local mock-server testing. **See SECURITY.md §4.**`` |
| iOS | ``Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` only for local mock-server testing.`` |
| Android | (same as iOS) |

C04 requires byte-identical validation strings across bridges. C06 §2 states outright: "iOS and Android
duplicate the same check (C04). **All three messages reference `SECURITY.md §4`.**" They do not.

**Why it matters:** Small, but it is on the one security-relevant validation message in the plugin, and
C06 asserts the opposite in a doc a reviewer will open specifically to check security defaults. The
whole point of the pointer is that the developer who trips the guard learns *why* HTTPS is required —
native consumers don't get that.

**Fix:** Append `" See SECURITY.md §4."` to both native strings. While there: `C06-SECURITY-DEFAULTS.md`
§1's worked-example line references are all stale (`src/web.ts:98` / `:542` / `:543`,
`BrazePlugin.swift:86` / `:93`, `BrazePlugin.kt:115` / `:124`); actual locations are `web.ts:136` /
`:952-958`, `BrazePlugin.swift:119` / `:141`, `BrazePlugin.kt:313` / `:333`.

**Confidence:** High.

---

### A4-12 · MINOR · The Braze-cluster sanity check exists only on web

**Where:** `src/web.ts:978-995`; no counterpart in `BrazePlugin.swift:118-131` or
`BrazePlugin.kt:319-331`; `SECURITY.md:164-173` (§4).

**Evidence:** §4 lists three things "Plugin parses `endpoint` URL client-side at `initialize` time.
Rejects: … **Endpoints not in Braze's known cluster list (warning, not error)**" and then enumerates the
cluster hosts. Only the web impl implements it (`isKnownBraze` regex + `console.warn`). Both native
bridges do the HTTPS check and the parse check, then stop — a typo'd or attacker-suggested host on iOS
and Android produces no signal at all.

Two smaller issues in the web check itself: the regex `^sdk\.[a-z]+-\d+\.braze\.(com|eu)$` is tested
against a host string that still carries an explicit port, so `https://sdk.us-01.braze.com:443` warns
spuriously; and it covers only `.com`/`.eu`, so any future Braze TLD warns until the regex is updated
(warn-only, so the failure mode is noise, not breakage).

**Why it matters:** Low direct security impact — it is a warning, and the SDK key is public — but it is
the difference between "a typo'd endpoint silently sends your users' events to a host you don't control"
and "the console tells you." Cross-platform asymmetry in a documented security control is the kind of
thing the C04 discipline exists to prevent, and a reviewer who reads §4 then greps the natives will find
the gap in 30 seconds.

**Fix:** Either (a) port the regex + a `Logger`-free warning to both natives — on iOS a
`call.resolve()`-side warning is awkward, so consider returning a `warnings: string[]` array from
`initialize` on all three platforms, which also gives the web path a non-`console` channel (see A4-13);
or (b) scope §4's bullet to web and say so. Option (a) is the better long-term shape because it gives
every future soft-validation a home. Also strip the port before testing the host, and keep the cluster
list in one shared constant rather than a regex duplicated three ways.

**Confidence:** High.

---

### A4-13 · MINOR · SECURITY.md §3's PII-masking scheme is not implemented (the plugin achieves the outcome a different way), and §8's NODE_ENV gate does not exist

**Where:** `SECURITY.md:133-137` (§3), `SECURITY.md:257` (§8) vs. the whole plugin source.

**Evidence:** §3 rule 1 says: "Plugin's own log lines mask: Email → `j***@e***.com`; Phone →
`***-***-1234`; User ID → first 4 chars + `***`; Custom attributes → redact value, log key + type."

No such masking code exists on any platform. `grep -rn "console\.|print(|NSLog|os_log|Log\.[diwe]" src/
ios/Plugin/ android/src/main/` finds exactly **one** log call in the entire plugin:
`src/web.ts:987`, the cluster warning — which interpolates `options.endpoint` (config, not PII) and
never touches `apiKey`.

So the **outcome** §3 wants is fully achieved, and achieved *better* than described: the bridges log
nothing, so there is nothing to mask. But the document describes an implementation that a reviewer will
go looking for and not find.

§8 has a related, sharper inaccuracy: "Plugin's own log lines (separate from Braze's) only fire in
development mode (`process.env.NODE_ENV !== 'production'` for web; build-flavor check for native)." The
one web log line at `web.ts:987` is **ungated** — it fires in production bundles.

**Why it matters:** §3 is the PII section; an auditor reads it, greps for the masker, finds nothing, and
now has to work out whether the masker is missing or the logging is missing. Over-claiming a control you
don't need makes the controls you *do* have harder to verify. The §8 NODE_ENV claim is a concrete factual
error about a line of code that exists.

**Fix:** Rewrite §3 rule 1 to state the actual (stronger) posture: "The bridge layer emits no log output
at all on any platform — verified by the C06 grep gate — so PII cannot reach a plugin-owned log sink.
Masking helpers would be added alongside the first plugin-owned log line." Add that grep as a CI check
so the claim stays true. For §8, either gate `web.ts:987` on `process.env.NODE_ENV !== 'production'` (and
keep the claim) or delete the claim and note the single warning is intentionally always-on. I'd keep the
warning always-on — a misconfigured endpoint in production is worth a console line — and fix the doc.

**Confidence:** High.

---

### A4-14 · MINOR · §12's scanner claims overstate what runs (no CodeQL, no Renovate, Dependabot security updates disabled)

**Where:** `SECURITY.md:335-352` (§12) vs. `.github/workflows/`, repo settings.

**Evidence:**

| §12 claim | Reality |
|---|---|
| "GitHub Advanced Security (free for public repos) runs on every PR" | No CodeQL workflow in `.github/workflows/`. `gh api .../code-scanning/alerts` → `"no analysis found"` (404). |
| "`npm audit` on every CI build; high/critical fail the build" | **True** — `test.yml:193-194`, `npm audit --audit-level=high --omit=dev`, and it is a required check. |
| "Snyk free tier as backup scanner" | Present but never executes — see A4-10. |
| "Renovate bot configured for grouped weekly dep updates on the example app" | No `renovate.json` / `.github/renovate.json`. Dependabot does grouped weekly updates instead. |
| "Dependabot enabled on the example app + mock server" | Enabled on `/`, `/example`, `/demo`, `/test/mock-server` (but see A4-16 for the wrong ecosystem). **Dependabot *security* updates are `disabled`** — `gh api repos/... → security_and_analysis.dependabot_security_updates.status: "disabled"`. |

**Why it matters:** "GitHub Advanced Security runs on every PR" is the single strongest scanner claim in
the document and it is the one with no corresponding workflow file. Enabling Dependabot **security**
updates (distinct from the version updates already configured) is a one-click change that would actually
deliver part of what §12 promises.

**Fix:** Add `github/codeql-action` with the `javascript-typescript` pack (the TS surface is small; it
will run in under two minutes) — or drop the GHAS claim. Enable Dependabot security updates in repo
settings. Delete the Renovate sentence. Note that secret scanning **and push protection are both
enabled** (verified) — §12 should say so, because that is a real control it currently gets no credit for.

**Confidence:** High.

---

### A4-15 · MINOR · CI builds with `npm install`, not `npm ci`, in all four sub-projects that have lockfiles

**Where:** `test.yml:99-101, 131-133, 160-166, 266-268, 330-332`.

**Evidence:** The plugin root correctly uses `npm ci` everywhere. But `example/`, `demo/`,
`test/mock-server/`, and `test/web/` are all installed with `npm install`, and all four have committed
lockfiles:

```
$ ls example/package-lock.json demo/package-lock.json test/web/package-lock.json test/mock-server/package-lock.json
(all four present)
```

The workflows even declare these lockfiles in `cache-dependency-path` — so they are trusted enough to
key the cache but not to pin the install.

**Why it matters:** `npm install` will silently resolve newer in-range transitive versions than the
lockfile records, so CI is not building what was reviewed, and a compromised patch release of any
transitive dep lands in the demo/iOS/Android verify jobs without a lockfile diff. It also undercuts
Dependabot: PR #26 bumps demo lockfile entries that CI then ignores. `SECURITY.md:349-352` claims
"Lockfile discipline — `package-lock.json` committed and reviewed in PRs," which is only half-true if CI
doesn't honor them.

**Fix:** Replace all five `npm install` invocations with `npm ci`. Where a sub-project links the plugin
via `file:..` and `npm ci` complains about the local tarball, `npm ci --install-links` or a
`npm ci && npm install ../ --no-save` two-step keeps the lockfile authoritative for everything else.

**Confidence:** High.

---

### A4-16 · MINOR · Dependabot watches `/test/mock-server` with the wrong ecosystem — its deps are unmonitored

**Where:** `.github/dependabot.yml:66-72`.

```yaml
# Mock-server Gradle deps (Ktor, JUnit)
- package-ecosystem: 'gradle'
  directory: '/test/mock-server'
```

**Evidence:** `test/mock-server/` is a **Fastify/TypeScript npm project**, not Gradle/Ktor:

```json
{ "name": "capacitor-braze-mock-server", "type": "module",
  "dependencies": { "fastify": "^5.0.0" },
  "devDependencies": { "@types/node": "^22.0.0", "tsx": "^4.7.0", "typescript": "~5.6.0" } }
```

There is no `build.gradle` anywhere under `test/`. Dependabot finds no Gradle manifest, so this entry is
inert — and the mock server's actual npm dependencies (fastify, tsx) are never checked.

**Why it matters:** Small blast radius (test-only, never shipped — correctly excluded from the tarball),
but it is a config entry that looks like coverage and provides none. It also signals a stale migration:
`CLAUDE.md` (stack table: "Ktor (mock server)"), `SECURITY.md:340` ("plus Ktor for the mock server"), and
`PLAN.md`'s testing section all still describe a Ktor mock server that was replaced by Fastify.

**Fix:** Change the entry to `package-ecosystem: 'npm'`, add a `mock-server-deps` group to match the
other three, and sweep the Ktor references out of CLAUDE.md / SECURITY.md §12 / PLAN.md.

**Confidence:** High.

---

### A4-17 · MINOR · `test.yml` declares no `permissions:` block

**Where:** `.github/workflows/test.yml` (whole file — no `permissions:` key at any level).

**Evidence:** The repo's org/repo default is currently benign —
`gh api repos/.../actions/permissions/workflow` → `{"default_workflow_permissions":"read",
"can_approve_pull_request_reviews":false}` — so today's `GITHUB_TOKEN` is read-only. But the workflow
relies on that setting rather than declaring it, and the `audit` job passes `GITHUB_TOKEN` into a
third-party action (`gitleaks/gitleaks-action@v2`, itself an unpinned tag — A4-05).

`release.yml` does this correctly (`permissions:` at lines 21-24), though workflow-wide rather than
per-job.

**Why it matters:** Least-privilege should be declared in the file, not inherited from a setting a
future maintainer (or an org policy change) can flip to `write` without touching the repo. This is a
standard checklist item — an external reviewer will look for it and note the absence.

**Fix:** Add `permissions: contents: read` at the top of `test.yml` (all eight jobs only need to read the
repo). In `release.yml`, move the grants to the job level so `id-token: write` and `contents: write` are
scoped to the steps that need them.

**Confidence:** High.

---

### A4-18 · MINOR · README ships zero security content, though SECURITY.md cites six README sections as mitigations

**Where:** `README.md` (all 123 headings) vs. `SECURITY.md` §§1, 2, 3, 4, 6, 9, 10.

**Evidence:** The README's non-API headings are: Why this exists / Status / Quick start / API reference /
Apps in this repo / Local development & testing / Documentation. Everything between `## API reference`
and `## Apps in this repo` is docgen output. SECURITY.md cites README sections that do not exist:

| SECURITY.md | Cited README content | In README? |
|---|---|---|
| §1 (:48) | "**Which key do I use?**" section at the top, SDK key → plugin, REST key → server | No |
| §2 (:101-109) | SDK Auth server reference impls for Node/Python/Ruby/Go/Kotlin-Ktor, JWT claims, key rotation | No |
| §3 (:140) | Privacy section covering right-to-be-forgotten | No |
| §4 (:155) | "never use `http://` in production" warning | No |
| §6 (:212) | Recommended Content Security Policy for the Capacitor WebView | No |
| §9 (:273) | "Should I enable geofences?" section | No (geofences are out of scope in 0.1 — this one is fine to just delete) |
| §10 (:293-297) | "Right to be forgotten flow" 3-step section | No |

The `definitions.ts` JSDoc does carry the key guidance (`:19-20` — "public Braze SDK API key… Never pass
a REST API key here") and it propagates into the docgen block, so the *information* exists inside the
API reference. It is just not where a consumer (or reviewer) looks for it.

**Why it matters:** §0 rates "Insecure consumer integration patterns — **High** (in aggregate) —
addressed via README + this doc." That mitigation is half-absent. The CSP guidance (§6) is the most
consequential gap: it is the *real* defense against the HTML-IAM XSS threat now that the discard hook
turns out not to exist (A4-03), and the plugin is the only party that knows which origins Braze's
WebView needs.

**Fix:** Add a `## Security` section between Quick start and API reference (outside the
`<docgen-api>` markers so docgen won't clobber it) with four short subsections: **Which key do I use?**,
**Enable SDK Authentication** (link to SECURITY.md §2 + one Node signing snippet), **CSP for the
Capacitor WebView**, **Right to be forgotten**. Then make SECURITY.md's cross-references point at real
anchors. ~80 lines of README buys back three SECURITY.md sections.

**Confidence:** High.

---

### A4-19 · MINOR · Play Data Safety / App Store privacy guidance is missing for consumers

**Where:** `ios/Plugin/PrivacyInfo.xcprivacy`; no Android or consumer-facing counterpart.

**Evidence:** The iOS privacy manifest is **genuinely good** — correctly scoped to the plugin binary,
`NSPrivacyTracking: false` with empty collected-data and accessed-API arrays, and a header comment
explaining that BrazeKit ships its own manifest declaring UserDefaults (CA92.1), FileTimestamp (C617.1),
and the UserID/DeviceID/ProductInteraction data types, which Xcode aggregates. I verified the plugin
binary claim: no `UserDefaults`, file-timestamp, boot-time, disk-space, or keyboard API calls anywhere in
`ios/Plugin/`. The manifest is honest.

What is missing is the **consumer-facing** half. A consumer shipping this plugin must declare, in their
own submissions:

- **App Store** privacy nutrition label: identifiers (user ID, device ID), usage data (product
  interaction), and — if they call `setEmail` / `setPhoneNumber` / `setDateOfBirth` — contact info and
  sensitive info, all under "Data Linked to You."
- **Play Data Safety**: the same categories, plus the Braze Android SDK's data collection and (if they
  wire push) the FCM token.
- iOS **ATT / `NSUserTrackingUsageDescription`** if they combine Braze data with third-party data for
  advertising — the plugin's manifest correctly says the *plugin* doesn't track, which is not the same
  as the *app* not tracking.

Nothing in README, SECURITY.md, or `C10-CONSUMER-INTEGRATION-REQUIREMENTS.md` tells them this.

**Why it matters:** App Store / Play rejections over privacy declarations are one of the most common
real-world costs of adding an engagement SDK, and C10 exists precisely to enumerate consumer-side
obligations the plugin's choices create. This is a docs gap with a concrete failure mode.

**Fix:** Add a "Privacy declarations you must make" subsection to C10 and a short pointer from the
README's new Security section (A4-18), enumerating the three lists above with a link to Braze's own
data-collection docs. Keep it factual — "Braze collects X; declare Y" — and make clear the plugin's own
manifest covers only the bridge binary.

**Confidence:** High on the gap; the specific category lists should be checked against Braze's current
published data-collection disclosure before shipping the text.

---

### A4-20 · NIT · Tarball is clean; CHANGELOG and SECURITY.md are not shipped

**Where:** `package.json:9-17` (`files`); `npm pack --dry-run --json`.

**Evidence:** 27 entries, 156 KB packed / 700 KB unpacked. Nothing that shouldn't ship — no `test/`, no
`findings/`, no `docs/`, no `.claude/`, no `example/` or `demo/`, no `android/src/test/`. Everything the
consumer's build needs is present: `CapacitorBraze.podspec`, `ios/Plugin/*.swift` + `.m` +
`PrivacyInfo.xcprivacy` (matching the podspec's `resource_bundles`), `android/build.gradle` +
`consumer-rules.pro` + `proguard-rules.pro` + `AndroidManifest.xml` + the Kotlin source (matching
`consumerProguardFiles`), `dist/` (esm + cjs + iife + maps + `docs.json`), `LICENSE`, `README.md`,
`package.json`. The `files` allowlist and the two native manifests agree.

Missing, worth adding: `CHANGELOG.md` (~50 KB) and `SECURITY.md` (~23 KB). Both are conventional to ship
and give an offline consumer the disclosure policy and the upgrade history without a network round trip.

**Fix:** Add `"CHANGELOG.md"` and `"SECURITY.md"` to `files`. (`npm pack` also runs `prepare`, which
regenerates `README.md` via docgen — verified reproducible here: `git status` stayed clean.)

**Confidence:** High.

---

### A4-21 · NIT · `npm audit` (including dev) reports 2 high advisories via an EOL ESLint 8 chain

**Where:** `package.json:70` (`eslint: ^8.57.1`); `npm audit`.

**Evidence:** `npm audit --omit=dev` → **0 vulnerabilities** (this is what CI gates on, and it passes
legitimately — the plugin's only runtime peer is `@braze/web-sdk`). Full `npm audit` → 2 high, all
`js-yaml` 4.0.0–4.3.1 DoS advisories (GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj,
GHSA-2883-xcg3-v3hh) reached through ESLint 8's config loader.

`npm outdated` also shows ESLint pinned at 8.57.1 (latest 10.x) — ESLint 8 is end-of-life and will keep
accreting advisories. `@braze/web-sdk` is 6.7.1 installed vs 6.13.0 available (peer range `^6.0.0`, so
consumers get the newer one; this is dev-tree only).

**Why it matters:** No shipped risk — dev-only, and these are CPU-DoS advisories in a linter. But
`npm audit` printing "2 high severity vulnerabilities" is the first command a reviewer runs, and the
explanation ("dev-only, ESLint 8") should not have to be given verbally.

**Fix:** Migrate to ESLint 9/10 flat config (note `package.json:46` currently forces
`ESLINT_USE_FLAT_CONFIG=false`, so this is a real piece of work — `@ionic/eslint-config` 0.5.0 in PR #22
may be the unblocker). Interim: leave it, but add one line to SECURITY.md §12 noting the dev-tree
advisories and that the gate is `--omit=dev` by design.

**Confidence:** High.

---

### A4-22 · NIT · Six stale Dependabot PRs, including the two that fix an already-past runner deprecation

**Where:** `gh pr list`; Release run 26314173939 annotations.

**Evidence:**

| PR | Change | CI | Note |
|---|---|---|---|
| #24 | `actions/checkout` v4 → v7 | 8/8 pass | **Fixes Node-20 deprecation** |
| #25 | `actions/setup-node` v4 → v7 | 8/8 pass | **Fixes Node-20 deprecation** |
| #18 | `gitleaks/gitleaks-action` v2 → v3 | 8/8 pass | Check v3 changelog for the `GITLEAKS_LICENSE` requirement before merging |
| #19 | example-deps group (3) | 8/8 pass | Safe |
| #26 | demo-deps group (11) | 8/8 pass | Largest; worth a manual demo smoke |
| #22 | dev-deps group (7) | **Lint fails** | Prettier 3.8→3.9 reformat; needs `npm run fmt` + commit |

The failed Release run carries this annotation: *"Node.js 20 actions are deprecated… Node.js 20 will be
removed from the runner on **September 16th, 2026**."* Today is 2026-09-22 — that date has passed, and
#24/#25 are exactly the fix. CI is currently green, so the runners are evidently still tolerating it,
but this is live risk sitting behind two PRs that have been green for three months.

**Why it matters:** An external reviewer reads six stale Dependabot PRs as "the maintenance loop isn't
running," which colors how they read every other supply-chain claim. Five of six are one-click merges.

**Fix:** Merge #24, #25, #19, #26 now; check the gitleaks v3 license note then merge #18; run
`npm run fmt` on #22's branch and merge. Do this **as part of** the SHA-pinning work in A4-05 so the
actions land pinned rather than on `@v7`.

**Confidence:** High.

---

### A4-23 · NIT · Two Android/web logging caveats worth one line each in §8

**Where:** `SECURITY.md:249-258` (§8); `com.braze.support.BrazeLogger` (42.2.0);
`README.md:44-50` (Quick start).

**Evidence:**

1. **Android system-property override.** `BrazeLogger` exposes
   `checkForSystemLogLevelProperty(boolean)` and holds `LOG_LEVEL_PROPERTY_NAME_BRAZE` /
   `LOG_LEVEL_PROPERTY_NAME_APPBOY` constants (verified via `javap` on the shipped AAR). A device-level
   system property can therefore raise Braze log verbosity independently of the plugin's
   `enableLogging: false` — relevant on rooted/dev devices and in enterprise MDM fleets. §8 is framed as
   "production-safe **by default**," which this qualifies.
2. **README still recommends installing from git.** Quick start says "Until 0.1.0 hits npm, consume via
   git" — stale since 2026-05-22. A git install runs `prepare` (a full local build — arbitrary code) and
   bypasses the registry tarball's integrity/signature path entirely. Worth fixing for correctness and
   because it is the opposite of the supply-chain posture §13 argues for.

**Fix:** Add both as caveats in §8 and update the README Quick start to `npm install capacitor-braze`
(the note about `prepare` running on git installs is already correctly documented in
`CLAUDE.md`'s "Things that look like bugs but aren't" — it just needs to stop being the recommended
path).

**Confidence:** High on (2); Medium-high on (1) — the constants confirm the mechanism exists; the exact
property name and precedence vs. an explicit `setLogLevel` call (`hasLogLevelBeenSetForAppRun` suggests
first-write-wins) should be confirmed against Braze's docs before writing the sentence.

---

## SECURITY.md promise → implementation table

Verified against code on all three platforms, the GitHub API, and the npm registry. "Partial" means the
promise holds on some platforms or in some respects.

| § | Promise | web | iOS | Android | Verdict |
|---|---|---|---|---|---|
| 1 | Accepts only public SDK keys; never transports REST keys | n/a | n/a | n/a | **PASS** — plugin makes no request that could use a REST key; `definitions.ts:19-20` JSDoc is explicit |
| 1 | Key never logged / echoed / put in an error string | ✅ | ✅ | ✅ | **PASS** — `apiKey` appears in no log, no reject string, no resolved value |
| 1 | README "Which key do I use?" section at top | — | — | — | **FAIL** — no such section (A4-18); guidance exists only in JSDoc |
| 2 | `enableSdkAuthentication` option, default `false` | `web.ts:139` | `swift:140` | `kt:334` | **PASS** |
| 2 | `changeUser` rejects without signature when auth enabled | `web.ts:203-207` | `swift:252-255` | `kt:434-439` | **PASS** — identical byte-for-byte strings across all three; no bypass path found |
| 2 | `setSdkAuthenticationSignature` for in-session refresh | ✅ | `swift:272-276` | ✅ | **PASS** |
| 2 | `sdkAuthError` listener | `web.ts:180-190` | `BrazeKitDelegate` | `kt:395-411` | **PASS** — wired on all three |
| 2 | README server-side signing impls (5 languages) | — | — | — | **FAIL** — not in README (A4-18) |
| 3 | Never log PII at any level | ✅ | ✅ | ✅ | **PASS (outcome)** — zero log calls in bridge code |
| 3 | Plugin log lines mask email/phone/userId/attrs | — | — | — | **FAIL (as written)** — no masking code exists; moot because nothing is logged (A4-13) |
| 3 | Errors quote argument names, not values | ✅ | ✅ | ✅ | **PASS** — C01 format holds throughout; spot-checked every `reject`/`throw` |
| 3 | PII passed through opaque, not transformed/persisted | ✅ | ✅ | ✅ | **PASS** |
| 4 | HTTPS required unless `allowInsecureEndpoint === true` | `web.ts:952-960` | `swift:119-125` | `kt:313-321` | **PASS** — strict `=== true` / `getBool(...,false)` on all three |
| 4 | Malformed URLs rejected client-side | `new URL` | `URL(string:)` | `java.net.URI` | **PASS** (Swift/Java parsers are laxer than WHATWG `URL`, so native accepts a few strings web rejects — cosmetic) |
| 4 | Unknown-cluster warning | `web.ts:978-995` | ✗ | ✗ | **PARTIAL** — web only (A4-12) |
| 4 | Certificate pinning not enabled by default | ✅ | ✅ | ✅ | **PASS** (v1.0 item, correctly marked future) |
| 5 | Consumer owns push-token handoff; no auto-registration | ✅ | `swift:864-876` | ✅ | **PASS** |
| 5 | Web `registerPushToken` rejects | `web.ts:515-523` | n/a | n/a | **PASS** |
| 5 | Push tokens never logged / persisted outside SDK | ✅ | ✅ | ✅ | **PASS** |
| 6 | `allowUserSuppliedJavascript` exposed at `initialize` | ✗ | ✗ | ✗ | **FAIL** — not exposed anywhere (A4-03) |
| 6 | IAM listener can return `'discard'` | ✗ | ✗ | ✗ | **FAIL** — hardcoded display; `definitions.ts:593` says the opposite (A4-03) |
| 6 | README documents recommended CSP | — | — | — | **FAIL** (A4-18) |
| 7 | `deepLinkReceived` listener with allow/replaceWith | ✗ | ✗ | ✗ | **FAIL** — does not exist (A4-04) |
| 8 | `enableLogging` defaults to `false` | ✅ | ✅ | ✅ | **PASS** (at the option level) |
| 8 | That default is production-safe | ✅ | ⚠️ `.info` | ⚠️ sticky | **PARTIAL** — A4-08, A4-09 |
| 8 | Plugin log lines gated on NODE_ENV / build flavor | ✗ | n/a | n/a | **FAIL** — `web.ts:987` is ungated (A4-13) |
| 9 | Geofences not in v0.1, opt-in later | ✅ | ✅ | ✅ | **PASS** — no location module pulled; `android-sdk-ui` only |
| 10 | `wipeData` / `disableSDK` / `enableSDK` exposed | ✅ | `swift:920-960` | `kt:974-998` | **PASS** — init-independent per C07 |
| 10 | Subscription group methods exposed | ✅ | ✅ | ✅ | **PASS** |
| 10 | README right-to-be-forgotten flow | — | — | — | **FAIL** — in `definitions.ts:1194` JSDoc, not README (A4-18) |
| 11 | No data sent before `initialize()` | ✅ | ✅ | ✅ | **PASS** — SDK not configured until then |
| 11 | No third-party SDKs loaded | ✅ | ✅ | ✅ | **PASS** — only Braze; runtime deps are `@braze/web-sdk` (peer), `com.braze:android-sdk-ui`, `BrazeKit`/`BrazeUI` |
| 12 | `npm audit` every CI build; high/critical fail | — | — | — | **PASS** — `test.yml:193-194`, required check |
| 12 | GitHub Advanced Security on every PR | — | — | — | **FAIL** — no CodeQL (A4-14) |
| 12 | Snyk as backup scanner | — | — | — | **FAIL** — step never executes (A4-10) |
| 12 | Renovate configured | — | — | — | **FAIL** — no config; Dependabot does this (A4-14) |
| 12 | Lockfile discipline | — | — | — | **PARTIAL** — committed, but CI installs with `npm install` (A4-15) |
| 13 | No real Braze keys committed | — | — | — | **PASS** — history scan clean; `demo/.env.example` empty; `example` uses an input field |
| 13 | npm publish requires 2FA | — | — | — | **FAIL** — automation token bypasses 2FA by design (A4-06) |
| 13 | Provenance enabled, attestation visible on npm | — | — | — | **FAIL** — no `dist.attestations` on 0.1.0 (A4-01) |
| 13 | No manual publish from local machines | — | — | — | **FAIL** — 0.1.0 was published manually (A4-01) |
| 13 | All commits to main require PR review; reviewers ≥1 | — | — | — | **FAIL** — no `required_pull_request_reviews` (A4-07) |
| 13 | Signed commits required | — | — | — | **PASS** — `required_signatures.enabled: true` |
| 13 | No force-push to main | — | — | — | **PASS** — `allow_force_pushes: false`, `allow_deletions: false` |
| 13 | Actions pinned by SHA | — | — | — | **FAIL** — all floating tags; one floating branch (A4-05) |
| 13 | No `postinstall` scripts | — | — | — | **PASS** — `package.json` has `prepare`/`prepublishOnly` only, both skipped on registry installs |
| 14 | Private vulnerability reporting enabled | — | — | — | **FAIL** — `{"enabled": false}` (A4-02) |

---

## What is genuinely good

Not filler — these are the things I tried to break and couldn't.

- **SDK Authentication enforcement is correct on all three platforms.** `changeUser` without a signature
  is rejected when `enableSdkAuthentication: true`, with a **byte-identical** error string across web,
  Swift, and Kotlin, and the state is stored plugin-side because neither SDK exposes the config
  post-init. I looked specifically for bypasses — re-init resetting the flag, plugin recreation on
  Android dropping `sdkAuthenticationEnabled` while the process-global SDK stays configured, `wipeData`
  leaving stale state — and each one resets `initialized` and `sdkAuthenticationEnabled` **together**
  (`swift:934-940`, `kt:980-984`), so the failure mode is "rejects with initialize-first," never "lets a
  signature-less identity change through." That is careful work.
- **Zero logging in the bridge layer, on every platform.** One `console.warn` in 3,300 lines of bridge
  code, and it logs an endpoint, not PII. This is a stronger posture than the masking scheme SECURITY.md
  describes, and it makes the PII promise trivially auditable with one grep — which is exactly how a
  security control should be built.
- **Error messages name fields, never values.** The C01 format is applied without exception across every
  `reject` / `throw` I read. This is the design decision that makes the no-PII-in-logs property hold
  downstream, in the consumer's Sentry, where the plugin has no control.
- **`allowInsecureEndpoint` uses strict `=== true` / `getBool(..., false)`** on all three platforms, so a
  truthy-but-not-true value (`1`, `'true'`, `'yes'`) cannot disable the HTTPS guard. That is the correct
  paranoid reading of a security toggle crossing a JS bridge, and the reasoning is written down in C06.
- **The privacy manifest is honest.** Empty arrays, scoped explicitly to the plugin binary, with a
  comment explaining that BrazeKit declares its own and Xcode aggregates them. I verified the underlying
  claim — no required-reason API calls in `ios/Plugin/`. Plenty of plugins copy a neighbor's manifest;
  this one was reasoned about.
- **Secret scanning and push protection are enabled**, history is clean of credential-shaped strings
  (`git log --all -p` scan for UUID patterns → nothing), gitleaks runs on every PR with
  `fetch-depth: 0` so it actually sees history, and both sample apps take keys from env/input rather
  than literals. The `.gitignore` covers `.env*` and `.claude/`.
- **The `files` allowlist is disciplined.** 27 entries, nothing internal leaks, and it is consistent with
  what the podspec's `resource_bundles` and gradle's `consumerProguardFiles` need at consumer install
  time — a pairing that is easy to get subtly wrong.
- **Branch protection requires signed commits and 8 status checks including both native compile gates.**
  Requiring `verify-ios` and `verify-android` on every PR is more rigor than most community Capacitor
  plugins apply, and `required_conversation_resolution` is on.
- **The runtime dependency surface is genuinely minimal** — `npm audit --omit=dev` → 0 vulnerabilities,
  and the only runtime dependencies on any platform are Braze's own SDKs. The "wrap, don't reimplement"
  rule in CLAUDE.md is actually being followed, and it pays off here.

The pattern across this audit: **the code is in better shape than the document describing it.** Almost
every FAIL in the table above is SECURITY.md claiming a control that the code either doesn't need
(masking) or hasn't built yet (deep links, IAM discard), plus a cluster of real repo-settings and
release-pipeline gaps. Fixing the doc is a day; fixing A4-01/02/07 is an afternoon.

---

## Count by severity

| Severity | Count | IDs |
|---|---|---|
| **BLOCKER** | 1 | A4-01 |
| **MAJOR** | 8 | A4-02, A4-03, A4-04, A4-05, A4-06, A4-07, A4-08, A4-09 |
| **MINOR** | 10 | A4-10 … A4-19 |
| **NIT** | 4 | A4-20, A4-21, A4-22, A4-23 |
| **Total** | **23** | |

**Suggested order of attack before the external review:**

1. **Repo settings, ~15 minutes, no code** — A4-02 (enable private vulnerability reporting), A4-07
   (`enforce_admins`), A4-14 (Dependabot security updates). Three API calls, three FAILs removed.
2. **Two-line native fixes** — A4-08 (`.info` → `.disabled`), A4-09 (`BrazeLogger.logLevel` in both
   branches), A4-11 (error-string parity). These are the only findings where shipped behavior differs
   from the documented security contract.
3. **Release pipeline** — A4-01 + A4-06 together: move to npm Trusted Publishing, gate the publish job on
   the test jobs, add a tag ruleset, then ship `0.1.1` through CI and verify the attestation lands.
4. **Supply chain hygiene** — A4-05 (SHA-pin, starting with `release.yml` and `snyk@master`), A4-22
   (merge the five green Dependabot PRs), A4-15 (`npm ci`), A4-16 (dependabot ecosystem), A4-17
   (`permissions:`).
5. **Documentation truth pass** — A4-03, A4-04, A4-13, A4-14, A4-18, A4-19. Rewrite SECURITY.md §§3, 6,
   7, 8, 12, 13, 14 to describe what exists; add the README Security section. This is the largest single
   win for review credibility, because it converts ten FAILs into accurate PASSes without touching code.
