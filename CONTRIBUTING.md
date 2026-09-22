# Contributing to capacitor-braze

Thanks for your interest. This is a community plugin maintained on a best-effort
basis; PRs are welcome and reviewed actively.

## Before you start

1. **Read the source-of-truth docs**:
   - [`PLAN.md`](./PLAN.md) — strategy, roadmap, scope discipline
   - [`SDK_SURFACE.md`](./SDK_SURFACE.md) — which methods are planned, in which version
   - [`SECURITY.md`](./SECURITY.md) — security model and design constraints
   - [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) — quality bar
   - [`CLAUDE.md`](./CLAUDE.md) — internal dev guide (also useful for humans)
   - [`docs/mdcs/`](./docs/mdcs/) — per-subsystem design contracts. Read the index, then the MDC matching your change.
2. **Confirm scope.** New methods must align with [SDK_SURFACE.md §2](./SDK_SURFACE.md#2-plugin-version-roadmap). If your feature isn't on the roadmap, open an issue first to discuss.
3. **Confirm it's a plugin issue, not a Braze SDK issue.** If `@braze/web-sdk` (or the native SDK) fails the same way without this plugin, file with Braze instead.

## Dev setup

```bash
git clone https://github.com/bma342/capacitor-braze.git
cd capacitor-braze
npm install
npm run build        # tsc + rollup + docgen

# This repo has NO npm workspaces, so the test projects need their own installs:
(cd test/mock-server && npm install)
(cd test/web && npm install)

# Run the example app (developer testbed, one button per method)
cd example && npm install && npm run dev      # → http://localhost:5173
```

Iterating? After plugin changes, rebuild and re-install in the consuming app:

```bash
npm run build              # in the repo root
(cd example && npm install)   # picks up the rebuilt artifacts via the file:.. link
```

## Running the tests

Three tiers run locally and in CI. A fourth, against a real Braze account, has never been run.

```bash
# Web — 154 vitest tests across 14 files, ~3s, against an in-process Fastify mock.
# The mock is started by the tests themselves; nothing to launch first.
npm test

# Android — 74 Robolectric/JUnit tests. Needs JDK 21 and an Android SDK with
# platforms;android-35 + build-tools;35.0.0. Export ANDROID_HOME if the Gradle
# build can't find it, e.g.:
#   export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
cd demo/android && ./gradlew :capacitor-braze:testDebugUnitTest --no-daemon

# iOS — 26 XCTests. Needs Xcode 26+ (BrazeKit 18.x) and CocoaPods.
# The test target is generated into the demo's Xcode project; the script is
# idempotent and its output is committed, so CI re-runs it as a staleness check.
ruby scripts/ios-add-test-target.rb
cd demo/ios/App && pod install
xcodebuild test -workspace App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
  CODE_SIGNING_ALLOWED=NO

# Supporting gates
npm run lint              # eslint + prettier --check + swiftlint
npm run typecheck:tests   # vitest never type-checks; this does
npm run pack:check        # assert the npm tarball's contents
```

Two gotchas worth knowing before you file a bug against the tooling:

- **`xcodebuild` reporting "Unable to find a destination matching the provided destination specifier"** with no simulators listed means your Xcode 26's iOS *simulator runtime* is older than its iOS SDK. Fix: `xcodebuild -downloadPlatform iOS` (~8.5 GB).
- **The mock server binds an ephemeral port**, not 8080. To explore it by hand: `cd test/mock-server && npm run standalone` — it prints the URL it bound to.

Adding a test file on iOS means re-running `ruby scripts/ios-add-test-target.rb` and committing the
regenerated `project.pbxproj`; adding a test *method* to an existing file does not.

## Adding a new plugin method

**Walk [C01's lockstep checklist](./docs/mdcs/C01-METHOD-ANATOMY.md#the-lockstep-checklist).**
That section is the single canonical copy of the list — this file, `CLAUDE.md` and the PR template
all point at it rather than restating it, because four divergent copies is a bug this repo has
already shipped once (2026-09 audit, A6-22). C01 also covers the init-guard helpers and the error
message format.

The ten artifacts, in one line so you know the shape: the TS contract, the web impl, the Swift
bridge, its `.m` registration, the Kotlin bridge, **a test on each of the three platforms**, the
example app, and the CHANGELOG.

Skip any one and you get drift. Note in particular that **nothing in CI fails when a method ships
with no native implementation or no tests** — the checklist is the control, not the pipeline.

Depending on what your method does, also read:

- [C02](./docs/mdcs/C02-DTO-SHAPES.md) if it returns a Braze model object.
- [C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) if its argument or return shape behaves differently across the three SDKs.
- [C04](./docs/mdcs/C04-VALIDATION.md) if it takes user-provided input.
- [C05](./docs/mdcs/C05-LISTENERS.md) if it's a new `addListener('eventName', ...)` surface.

### Bridge style

Match existing patterns exactly (see [C01](./docs/mdcs/C01-METHOD-ANATOMY.md) for the full reference):

- **TS:** strict mode, no `any`, JSDoc with `@example` on every public method
- **Swift:** `@objc func name(_ call: CAPPluginCall)`, guard required inputs, dispatch to `Braze` SDK static or `braze.user.set(...)` instance methods, resolve/reject via the call
- **Kotlin:** `@PluginMethod fun name(call: PluginCall)`, use the `requireInitialized` or `requireUser` helpers, dispatch to `Braze.getInstance(context)` or `currentUser` setters
- **`MARK:` / KDoc category comments** matching the existing structure

If a method needs the init guard, use the helper — don't reimplement.

### Cross-platform divergence

When a Braze capability genuinely doesn't exist on a platform:

- On the unsupported platform, throw a **plain `Error`** whose message names what failed, why in
  one sentence, and what to do instead. **There is no error class hierarchy** — no
  `UnsupportedOperationError`, no `BrazeUnsupportedError`. Several docs claimed one for months;
  a consumer writing `e instanceof BrazeUnsupportedError` would get a `ReferenceError`. Consumers
  match on the `Braze.<method>: ` prefix, which the C01 format makes stable.
- Copy the shape of the one real instance, `registerPushToken` on web (see `src/web.ts`):

  ```
  Braze.registerPushToken is not supported on web. Web Push uses VAPID + Service Worker
  subscriptions, not push tokens. Branch on Capacitor.getPlatform() and call this only on
  iOS / Android. See docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md.
  ```

- Document it in [SDK_SURFACE.md §3](./SDK_SURFACE.md#3-cross-platform-divergence-notes) **and** in
  the method's JSDoc, so it appears in the generated API reference.

## PR checklist

The PR template has the full list. Highlights:

- [ ] `npm run build` clean in repo root + `example/`
- [ ] **Tests added** for the new behaviour, on every platform it runs on — asserting the wire output or the exact error string, not just that the call resolved
- [ ] `npm test` passes, and the native suites if you touched a native bridge
- [ ] CI green
- [ ] No plugin log line carries a consumer-supplied value
- [ ] No `any` types, no Swift force-unwraps, no `TODO`
- [ ] `enableLogging` default still `false`, and the `false` branch still silences the SDK
- [ ] Error strings byte-identical across platforms, or added to [C04's sanctioned-divergence list](./docs/mdcs/C04-VALIDATION.md)
- [ ] CHANGELOG entry added
- [ ] Tested against real Braze — **or noted explicitly in the PR that you couldn't**, which is currently the normal case (see the Layer 4 gap in `REVIEW_READINESS.md` §7)

## Maintainer setup (one-time, per [`SECURITY.md`](./SECURITY.md) §13)

> Some of what follows is **already in force**; the pre-tag checklist further down lists what is
> **not**. Neither list is aspirational — each item says which it is.

The supply-chain hygiene SECURITY.md promises has a handful of bits that
sit at the GitHub / npm account level and can't be configured from a PR.
The maintainer (Bryce, currently) does these once:

### Signed-commit branch protection on `main`

```bash
# Enable required signed commits on main (POST is correct; the GitHub
# API uses POST for this resource even though it reads as "PUT-y").
gh api -X POST "repos/bma342/capacitor-braze/branches/main/protection/required_signatures"
```

The `audit` job's gitleaks step + this requirement together close
SECURITY.md §13's supply-chain attestation list. Commits coming from
PR merges via GitHub's web UI (squash / rebase / merge) are signed by
GitHub's own GPG key automatically — no GPG setup needed on local
machines unless you're committing directly to a non-PR branch.

If a contributor doesn't have GPG / SSH signing set up locally, GitHub's
"Sign commits via web editor" + the PR squash-merge flow remain a
working path. For the local-signing flow, see
<https://docs.github.com/en/authentication/managing-commit-signature-verification>.

### Security scanning — what runs, and why there is no Snyk

**No setup required.** Every scanner below is wired and runs on its own; none
needs a token, and `SNYK_TOKEN` is no longer referenced anywhere.

| Scanner | Runs where | Blocks a merge? |
|---|---|---|
| `npm audit --audit-level=high --omit=dev` | `audit` job | **Yes**, on a high/critical advisory in the runtime tree |
| **gitleaks** (full history, `fetch-depth: 0`) | `audit` job | **Yes**, on a committed secret |
| **CodeQL** — `javascript-typescript` + `actions` | `codeql.yml`: push + PR to `main`, and Mondays 05:27 UTC | Findings appear in the Security tab; wire it as a required check once you have seen a clean baseline |
| **Tarball manifest** (`npm run pack:check`) | `pack-check` job | **Yes** |
| **Bundle-size budget** (`node .github/scripts/assert-size.mjs`) | `build-plugin` job | **Yes**, above 16,384 B gzipped ESM |
| **Dependabot version updates** | six ecosystems, weekly | Opens PRs |
| **Dependabot security updates** | repository setting — **still to enable**, item 4 in the pre-tag checklist below | — |

**Snyk was removed in this wave.** It was added gated on
`if: env.SNYK_TOKEN != ''`, the token was never provisioned, and a step that
always skips is worse than no step at all: it reads as coverage in the job list
while delivering none. Its unique yield over `npm audit` + Dependabot + CodeQL
would in any case have been small on a repo whose entire runtime dependency
tree is three Braze SDKs. If you ever do want it, re-add it as an unconditional
step with the token provisioned — not as a conditional that silently no-ops.

**Swift and Kotlin are not analysed by CodeQL.** Both require a full native
compile inside the CodeQL tracer, which means duplicating the CocoaPods and
Gradle setup from `verify-ios` / `verify-android` and roughly doubling their
already 8–15-minute runtime. The reasoning and the shape of the follow-up are
in the header of `.github/workflows/codeql.yml`.

**Raising the bundle-size budget.** `assert-size.mjs` fails above 16,384 B
gzipped for `dist/esm/**/*.js`; the measured total at `0.2.0` is 13,511 B. If a
deliberate addition pushes past the budget, re-measure with
`npm run build && node .github/scripts/assert-size.mjs`, raise
`ESM_GZIP_BUDGET_BYTES` **in the same commit as the code**, and update the
recorded measurement in the script header and in `REVIEW_READINESS.md` §2.
Never raise it on its own to turn a red build green.

### npm publishing — token today, Trusted Publishing intended

`release.yml` publishes with `npm publish --provenance --access public`, gated on the full CI
suite, from a GitHub environment called `npm-publish`.

**Be precise about 2FA.** The workflow authenticates with an **npm automation token**, which
**bypasses 2FA by design** — that is what automation tokens are for. Enabling 2FA on the account
does not change what CI can do with that token, so "npm publish requires 2FA" was never a true
statement about this pipeline, and `SECURITY.md` §13 no longer claims it.

The actual fix is **npm Trusted Publishing** (OIDC): npm trusts a specific repo + workflow +
environment, and no long-lived token exists to steal. It is on the pre-tag checklist below. Enable
2FA (`npm profile enable-2fa auth-and-writes`) regardless — it protects interactive account
actions — but treat Trusted Publishing as the control that matters here.

---

## Release process

1. Branch from `main`; make changes; CI green.
2. Bump `version` in `package.json`. **Pre-1.0, breaking changes ship in a minor** with explicit
   `BREAKING:` lines in the CHANGELOG — not a major. See [C08 step 8](./docs/mdcs/C08-NATIVE-SDK-PINNING.md).
3. Write the `CHANGELOG.md` section for that version, for humans, with `Security` / `Breaking` /
   `Added` / `Changed` / `Removed` / `Fixed` groupings. **The release workflow greps for
   `## [<version>]` and refuses to publish without it.**
4. Walk the [pre-release checklist](./REVIEW_READINESS.md#5-pre-release-checklist-literal--walk-through-before-each-0x-release).
5. PR → review → squash merge.
6. Work through the maintainer pre-tag checklist below.
7. Tag `vX.Y.Z` on `main` (signed) and push it. `release.yml` runs the full CI suite as its gate,
   verifies the version is not already on the registry, dry-runs, publishes with `--provenance`,
   checks the attestation landed, and creates the GitHub Release.
8. Verify the published package by installing it into a fresh project.

## Maintainer pre-tag checklist for `0.2.0`

**None of these is done.** They are GitHub and npm account settings, so no code change can perform
them, and the docs that depend on them (`SECURITY.md` §13 and §14, `REVIEW_READINESS.md` §7) say so
explicitly rather than implying they are in place. Run them before tagging `v0.2.0`.

```bash
# 1. Enable private vulnerability reporting — SECURITY.md §14 documents this channel,
#    and it is currently switched off, so a non-collaborator cannot file through it.
gh api -X PUT repos/bma342/capacitor-braze/private-vulnerability-reporting
gh api repos/bma342/capacitor-braze/private-vulnerability-reporting      # expect {"enabled":true}

# 2. Make the required status checks bind the admin too.
gh api -X POST repos/bma342/capacitor-braze/branches/main/protection/enforce_admins
gh api repos/bma342/capacitor-braze/branches/main/protection --jq '.enforce_admins'

# 3. Require linear history (you already squash-merge).
gh api -X PATCH repos/bma342/capacitor-braze/branches/main/protection/required_linear_history \
  -f enabled=true
# If that endpoint 404s on your plan, PUT the whole protection object instead.

# 4. Enable Dependabot SECURITY updates — distinct from the version updates
#    already configured in .github/dependabot.yml.
gh api -X PATCH repos/bma342/capacitor-braze \
  -f 'security_and_analysis[dependabot_security_updates][status]=enabled'
gh api repos/bma342/capacitor-braze --jq '.security_and_analysis'

# 5. Restrict who may create release tags.
cat > /tmp/tag-ruleset.json <<'JSON'
{
  "name": "Protect release tags",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_signatures" }
  ]
}
JSON
gh api -X POST repos/bma342/capacitor-braze/rulesets --input /tmp/tag-ruleset.json
gh api repos/bma342/capacitor-braze/rulesets     # was [] at audit time
# actor_id 5 is the "admin" repository role; adjust the bypass actor to taste.

# 6. Create the npm-publish environment release.yml already references,
#    with a required reviewer and a v* tag policy.
#    Get your user id with: gh api users/bma342 --jq .id
gh api -X PUT repos/bma342/capacitor-braze/environments/npm-publish \
  -F 'reviewers[][type]=User' -F 'reviewers[][id]=<YOUR_USER_ID>' \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/bma342/capacitor-braze/environments/npm-publish/deployment-branch-policies \
  -f name='v*' -f type='tag'
```

**7. npm Trusted Publishing — web UI only, no API equivalent.**
npmjs.com → `capacitor-braze` → Settings → Trusted publisher → GitHub Actions, repository
`bma342/capacitor-braze`, workflow `release.yml`, environment `npm-publish`. After the first
successful publish through it, delete the `NODE_AUTH_TOKEN` lines from `release.yml` and revoke
`NPM_TOKEN`.

**8. Add `Analyze (javascript-typescript)` and `Analyze (actions)` to the required status checks**
once the first CodeQL run on `main` is green, so a new finding blocks a merge rather than only
appearing in the Security tab. (Nothing to provision — CodeQL needs no token on a public repo, and
`SNYK_TOKEN` is no longer referenced by any workflow.)

### Dependabot PR triage before tagging

Six PRs are open, the oldest ~4 months. After `0.2.0`'s SHA pins:

| PR | What | Action |
|---|---|---|
| #18 | `gitleaks/gitleaks-action` 2 → 3 | **Close** — superseded; v3.0.0's SHA is pinned. (v3 is a runtime-only bump, node20 → node24; no `GITLEAKS_LICENSE` is required for public repos.) |
| #24 | `actions/checkout` 4 → 7 | **Close** — superseded; v7.0.1's SHA is pinned, which also clears the Node-20 runner deprecation |
| #25 | `actions/setup-node` 4 → 7 | **Close** — superseded; v7.0.0's SHA is pinned |
| #19 | example-deps group | **Rebase** (`@dependabot rebase`) — `example/package-lock.json` was regenerated for the `@braze/web-sdk ^6.13.0` bump, so it will conflict |
| #26 | demo-deps group (11 updates) | **Rebase** — same conflict on `demo/package-lock.json`. Largest PR; worth a manual demo smoke afterwards |
| #22 | dev-deps group (7 updates) | **Rebase**, then `npm run fmt` — it carries Prettier 3.8 → 3.9, which reformats and currently fails lint. It also carries `@ionic/eslint-config` 0.5.0, the likely unblocker for the ESLint 9/10 migration |

### Verifying the release afterwards

1. Confirm the provenance attestation is visible on npmjs.com (the workflow polls for it and warns, but does not fail, if it is missing).
2. `npm install capacitor-braze@latest` in a fresh Capacitor project, apply the README's Podfile and Gradle edits, and run the quick-start.
3. Update the README Status table and `REVIEW_READINESS.md`'s Review snapshot.

## Code of conduct

Be respectful. Assume good faith. No harassment, discrimination, or personal
attacks. Report concerns to bryce.aspinwall@gmail.com.

## License

By contributing, you agree your contributions are licensed under the MIT
license (same as the rest of the project).
