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
# Clone + install plugin deps
git clone https://github.com/bma342/capacitor-braze.git
cd capacitor-braze
npm install

# Build the plugin
npm run build

# Run the example app
cd example
npm install
npm run dev          # → http://localhost:5173
```

Iterating? After plugin changes, rebuild and re-run npm install in example/:

```bash
# In repo root
npm run build

# In example/
npm install   # picks up the rebuilt artifacts via file:.. link
```

## Adding a new plugin method

Read [`docs/mdcs/C01-METHOD-ANATOMY.md`](./docs/mdcs/C01-METHOD-ANATOMY.md) first — it
covers the eight-file lockstep, init-guard helpers, and the error message
format. Below is the short-form checklist; C01 is the authoritative version.

Every new method touches **eight files in lockstep** (the PR template
enforces this checklist):

1. `src/definitions.ts` — type signature with JSDoc + `@example`
2. `src/web.ts` — web implementation
3. `ios/Plugin/BrazePlugin.swift` — iOS bridge
4. `ios/Plugin/BrazePlugin.m` — `CAP_PLUGIN_METHOD` registration
5. `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — Android bridge
6. `example/index.html` — UI input + button
7. `example/src/main.ts` — handler in `runMethods` map
8. `CHANGELOG.md` — entry under `[Unreleased]`

Skip any one of these and you'll get drift between the platforms.

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

- On the unsupported platform, throw a clear `UnsupportedOperationError`-shaped
  error pointing at the docs.
- Document in [SDK_SURFACE.md §3](./SDK_SURFACE.md#3-cross-platform-divergence-notes).

## PR checklist

The PR template has the full list. Highlights:

- [ ] `npm run build` clean in repo root + `example/`
- [ ] CI green
- [ ] No PII logged
- [ ] No `any` types
- [ ] `enableLogging` default still `false`
- [ ] CHANGELOG entry added
- [ ] Tested against real Braze (or noted explicitly in the PR if you couldn't)

## Maintainer setup (one-time, per [`SECURITY.md`](./SECURITY.md) §13)

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

### Snyk integration (optional but documented in CI)

The `Snyk vulnerability scan` step in `.github/workflows/test.yml` is
gated on `env.SNYK_TOKEN != ''`. To enable it:

1. Create a free Snyk account: <https://snyk.io/login> (the free tier
   covers open-source projects with no monitoring cap).
2. Get the auth token: Account Settings → API Token → copy.
3. Provision it as a repo secret:
   ```bash
   gh secret set SNYK_TOKEN --body "<paste-token>"
   ```
4. Push any change. The next CI run picks up the secret and runs the
   scan with `--severity-threshold=high --all-projects`.

`continue-on-error: true` on the step means a positive Snyk finding
warns but doesn't block the merge (npm-audit + dependabot remain the
hard gate for high/critical CVEs).

### npm 2FA on the maintainer account

Before the first `0.1.0` publish, enable two-factor authentication on
the npm account with the "Authorization and writes" level (not just
"Authorization only"). This blocks token-theft attacks from publishing
malicious versions of the package.

```bash
# Verify your 2FA level by inspecting the publish-time prompt — the
# correct level prompts for an OTP on every `npm publish`.
npm profile enable-2fa auth-and-writes
```

`npm publish --provenance --access public` (already wired in
`.github/workflows/release.yml`) ships the npm provenance attestation
that consumers can verify with `npm install --foreground-scripts`.

## Code of conduct

Be respectful. Assume good faith. No harassment, discrimination, or personal
attacks. Report concerns to bryce.aspinwall@gmail.com.

## License

By contributing, you agree your contributions are licensed under the MIT
license (same as the rest of the project).
