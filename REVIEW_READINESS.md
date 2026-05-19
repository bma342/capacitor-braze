# Review Readiness — Quality Bar & Pre-Release Checklist

> The standard the plugin must clear to (a) be genuinely easy for any Capacitor team to adopt, (b) be feature-complete enough to ship to production, and (c) survive a tough review from a senior Braze SDK engineer. Companion to [`PLAN.md`](./PLAN.md), [`SDK_SURFACE.md`](./SDK_SURFACE.md), [`SECURITY.md`](./SECURITY.md).

**Last updated:** 2026-05-19

---

## 0. Operating philosophy

Three lenses, applied to every PR and every release:

1. **Adoption lens** — would a developer who has never heard of us ship this in their app in under 30 minutes?
2. **Completeness lens** — does the plugin cover the surface a real production Braze app actually needs, or is it a toy demo?
3. **Braze-engineer lens** — if a senior engineer from `braze-inc` reviewed this code looking for reasons to deny official endorsement, what would they find?

The third lens is the strictest. Pass it and the other two follow.

---

## 1. Adoption lens — DX standards

### Quick-start must be ≤5 lines

```ts
import { Braze } from 'capacitor-braze';

await Braze.initialize({ apiKey: 'YOUR-SDK-KEY', endpoint: 'sdk.iad-03.braze.com' });
await Braze.changeUser({ userId: 'user_123' });
await Braze.logCustomEvent({ name: 'app_opened' });
```

If a quick-start needs more, the API surface is wrong.

### One-command install

```bash
npm install capacitor-braze && npx cap sync
```

The Capacitor sync step auto-installs the CocoaPod (iOS) and Gradle dep (Android). No manual Podfile edits. No manual `build.gradle` edits. If a step beyond `cap sync` is required, document it loudly in the install section and explain why.

### Type-driven discovery

- Every method, parameter, and return type has JSDoc.
- IDE autocomplete (VS Code, JetBrains) shows method signatures + examples on hover.
- TypeDoc HTML reference auto-generated, hosted via GitHub Pages.
- No `any` types — discriminated unions for cross-platform divergent returns.

### Error messages that name the fix

Bad:
```
Error: Invalid parameter
```

Good:
```
BrazeInitializationError: `endpoint` is required and must start with 'https://'.
Got: 'sdk.iad-03.braze.com'. Try: 'https://sdk.iad-03.braze.com'.
Docs: https://github.com/bma342/capacitor-braze#initialization
```

Every plugin error class has: error code, what went wrong, what to try, link to relevant doc section.

### Example app that just works

`example/` directory in the repo contains a working Capacitor app demonstrating every plugin method. `cd example && npm install && npx cap run ios` works on a fresh clone. README links to it as the "show me, don't tell me" path.

### README structure (mirrors Braze's own docs)

1. What this is + comparison to alternatives (Cordova SDK, web-only, custom bridge)
2. Install + quick-start
3. Initialization options reference
4. **Which key do I use?** (SDK vs. REST)
5. **Should I enable SDK Authentication?** (decision tree)
6. **Push notifications setup** (decision tree for `enableAutomaticPushHandling`)
7. **In-app messages** (defaults + customization)
8. Content cards / feature flags / etc.
9. Privacy & GDPR / CCPA flows
10. Platform parity matrix (honest table)
11. Troubleshooting (top 10 issues + fixes)
12. Migration guides (per major version)
13. Contributing
14. License + maintainer

---

## 2. Completeness lens — production readiness

### Required behaviors at v0.1

- [ ] App initializes Braze, identifies user, logs an event → event appears in Braze dashboard.
- [ ] App handles push permission request → granted state matches OS.
- [ ] App receives a push notification → opens app, deep link routes correctly.
- [ ] App receives an in-app message → renders, click logs back to Braze.
- [ ] App fetches content cards → renders, impression + click log back.
- [ ] User logs out → `wipeData()` + `disableSDK()` → no further events sent.
- [ ] App background → foreground → session continues correctly.
- [ ] App killed → relaunched → user identity preserved.
- [ ] OS revokes push permission → SDK gracefully handles, doesn't crash.
- [ ] Network unavailable → events queued, sent when connectivity returns.
- [ ] SDK Authentication enabled → invalid JWT → consumer's error handler fires.
- [ ] SDK Authentication enabled → JWT expires mid-session → re-auth flow works.

Each gets a Maestro e2e test before v0.1 ships.

### Edge cases covered in tests

- Init called twice → second call is no-op (or replaces config, documented).
- `changeUser` to same userId → no-op (no spurious profile churn).
- `logCustomEvent` with `null` property values → handled cleanly.
- Custom attribute with array > 100 items → clear error, references Braze limit.
- Push token received before init complete → queued and registered on init.
- App version update → device ID preserved unless `wipeData` called.

### Performance budgets (per [SDK_SURFACE.md §5](./SDK_SURFACE.md#5-bundle-size--performance))

| Metric | Budget | How measured |
|---|---|---|
| Plugin .aar size (Android) | <50 KB | `apk-analyzer` in CI |
| Plugin .framework size (iOS) | <100 KB | `du -sh` of build artifact |
| Web fallback gzipped | <5 KB plugin-only | `size-limit` CI check |
| Init time (cold start) | <100 ms native, <50 ms web | benchmark in CI |
| Bridge round-trip (`logCustomEvent`) | <5 ms | benchmark in CI |

Budget violations fail CI.

---

## 3. Braze-engineer lens — what a senior reviewer would check

Concrete things a senior Braze SDK engineer would look for when deciding whether to (a) link from Braze docs, (b) absorb officially, or (c) actively deny.

### Native code quality

**Android Kotlin (`BrazePlugin.kt`):**
- [ ] Uses `@CapacitorPlugin` annotation per Capacitor's official pattern.
- [ ] Calls Braze SDK only through public `Braze.getInstance(context)` API — no reflection, no private API access.
- [ ] No `!!`, no `Any`, no `@Suppress` without documented reason.
- [ ] Coroutine-correct: no `runBlocking`, no UI thread blocking.
- [ ] ProGuard rules in `consumer-rules.pro` so minified consumer apps don't strip Braze SDK classes.
- [ ] Matches the code style of Braze's own Android RN bridge (`braze-react-native-sdk/android/src/main/java/com/braze/...`) — reference: their actual repo.
- [ ] Lint clean: `./gradlew lint` passes with zero warnings.
- [ ] No version range pins; everything exact.

**iOS Swift (`BrazePlugin.swift`):**
- [ ] Uses `CAPPlugin` + `CAPPluginCall` per Capacitor's pattern.
- [ ] Calls `BrazeKit` via official public API — no `@objc` private hooks.
- [ ] No force unwraps (`!`), proper `guard let` / `if let`.
- [ ] `[weak self]` in all closures retaining the plugin.
- [ ] UI-affecting calls dispatched to main thread explicitly.
- [ ] `PrivacyInfo.xcprivacy` manifest included (Apple App Store requirement).
- [ ] Both SwiftPM and CocoaPods install paths tested.
- [ ] Matches the code style of Braze's own Swift RN bridge — reference: `braze-react-native-sdk/iosApp/`.
- [ ] SwiftLint clean.

**TypeScript (`src/`):**
- [ ] `strict: true` in tsconfig.
- [ ] No `any`, no `unknown` returned to consumers (always typed).
- [ ] Discriminated unions for cross-platform divergent results.
- [ ] Every public method has a JSDoc comment with `@example`.
- [ ] Tree-shakeable (no top-level side effects in `index.ts`).
- [ ] No runtime dependencies beyond `@capacitor/core` peer.

### Security posture

- [ ] SDK Authentication first-class in v0.1, not bolted on later.
- [ ] `enableLogging` defaults to `false`.
- [ ] HTTPS enforced by default (`allowInsecureEndpoint: false`).
- [ ] PII never logged, even at debug level (per [`SECURITY.md §3`](./SECURITY.md#3-pii-handling)).
- [ ] Push token single-owner enforced.
- [ ] Threat model published in `SECURITY.md`.
- [ ] Vulnerability disclosure policy in `SECURITY.md`.
- [ ] No `postinstall` scripts in `package.json`.
- [ ] npm publish requires 2FA + provenance signing.

### Testing rigor

- [ ] Four-layer test pyramid (TS contract, native bridge, mock-server integration, real-Braze smoke) — per [`PLAN.md §5`](./PLAN.md).
- [ ] CI runs Layer 1–3 on every PR across iOS sim + Android emulator + headless Chrome.
- [ ] Daily spec-drift job hits real Braze trial, diffs against mock fixtures.
- [ ] Code coverage >80% on TS, >70% on native bridges.
- [ ] No tests that depend on real Braze for every PR.

### Documentation completeness

- [ ] README answers "should I use this?" in the first paragraph.
- [ ] Quick-start works copy-paste.
- [ ] Every public method documented with type + JSDoc + example.
- [ ] Platform parity matrix is honest (lists ❌ where applicable).
- [ ] Push notification setup has its own dedicated section with decision tree.
- [ ] SDK Authentication has its own section with server-side examples in 5+ languages.
- [ ] Privacy / GDPR / CCPA flows have a dedicated section.
- [ ] Migration guide format established (even if first version doesn't need one).
- [ ] CHANGELOG written for humans, not commit messages.

### Release hygiene

- [ ] Strict semver from day 1 (pre-1.0 allows minor breaking; documented).
- [ ] Native SDK versions pinned exactly, bumped per published policy.
- [ ] CHANGELOG entry per release.
- [ ] Git tags per release.
- [ ] GitHub Releases page populated.
- [ ] Provenance attestation on npm publishes.

### Adoption / trust signals

- [ ] Lighthouse production user cited (Aromo).
- [ ] Maintainer named (not anonymous).
- [ ] Active git history (commits over time, not single dump).
- [ ] Issues responded to within 7 days.
- [ ] Real LICENSE file (MIT).
- [ ] CONTRIBUTING.md with clear PR guidance.
- [ ] Issue templates that route correctly (bug / Braze SDK bug / feature / docs).

### What would specifically annoy a Braze senior

These get flagged in any honest review. Avoid all of them:

1. **Re-implementing Braze functionality** because "the SDK doesn't quite do what I want." → File upstream issue; don't work around.
2. **Vendoring Braze SDK code** instead of pinning the official package. → Always pull from Maven/CocoaPods/npm.
3. **Logging or echoing PII** that the Braze SDK itself doesn't log. → Match or exceed their PII discipline, never weaken it.
4. **Weakening security defaults** vs. native SDK (e.g., disabling JWT validation, sending over HTTP). → Defaults must match or exceed native.
5. **Bridge that violates threading assumptions** (calling SDK methods on wrong thread, blocking UI). → Test on real devices, not just emulators.
6. **Breaking ProGuard / R8 minification** by missing keep rules. → Include `consumer-rules.pro`.
7. **Missing `PrivacyInfo.xcprivacy`** on iOS → App Store rejection cascades onto Braze (since Braze SDK is what triggers the requirement).
8. **Forking the README copy** from Braze docs without attribution. → Link, don't copy.
9. **Implying official Braze endorsement** when there isn't one. → "Community plugin, not affiliated with Braze, Inc." in the header until/unless that changes.
10. **Abandoned-looking repo** (no commits for 3 months, unanswered issues). → Active maintenance is the price of credibility.

---

## 4. Engaging Braze proactively

The plugin's adoption trajectory accelerates dramatically with Braze devrel's awareness. Recommended sequence:

### Pre-launch (before 0.1.0)

1. Sign up for Braze free trial (validates Layer 4 smoke tests).
2. **Email `developers@braze.com`** with:
   - One-paragraph description.
   - Link to the GitHub repo (private until ready, then public).
   - "We're building this because [issue #49 + Hathway abandonment + your customers asking]. We follow your SDK conventions, pin to official Braze SDK versions, and would value any review or guidance."
   - Don't ask for endorsement; ask for technical review.
3. Apply to **Braze Alloys** partner program (linked from Braze website). Approval gives you a sandbox workspace + sometimes co-marketing on launch.

### At launch (0.1.0 ships)

4. Post in Braze's community forum (`braze.com/braze-community`) under Developer / SDK Discussion.
5. Post in Ionic Discord `#plugins` and `#showcase`.
6. Show HN: "Capacitor plugin for Braze (the customer-engagement platform)."
7. Tag relevant Braze devrel folks on LinkedIn/X with the announcement (don't be spammy — one tagged post).

### Post-launch (months 1–6)

8. Respond to GitHub issues within 7 days.
9. Ship Braze SDK version bumps within 1 week of upstream release.
10. Track adoption (npm downloads, GitHub stars, issues, who's using it).
11. If a Braze customer publicly says they use it, ask for permission to cite in README.
12. **At ~100 weekly downloads or first production user other than Aromo:** reach back out to Braze devrel with traction data + ask about being linked from Braze docs.

### What success with Braze looks like

| Stage | Sign |
|---|---|
| Friendly awareness | They reply to your initial email within a week. |
| Active collaboration | A Braze engineer reviews a PR or files an issue. |
| Doc endorsement | Braze docs link to the plugin in their Capacitor section. |
| Official adoption | Braze offers to transfer the repo to `braze-inc/` or co-maintain. |

Each stage is a real outcome. None depend on the next. Even friendly awareness is a meaningful resume signal.

---

## 5. Pre-release checklist (literal — walk through before each 0.x release)

Use this verbatim before publishing any version to npm.

### Code

- [ ] All TS types pass `tsc --strict --noEmit`
- [ ] `npm test` (Layer 1) passes
- [ ] Android Layer 2 + 3 passes in CI
- [ ] iOS Layer 2 + 3 passes in CI
- [ ] Web Layer 3 passes in CI
- [ ] Layer 4 manual smoke test against real Braze trial passes for every public method
- [ ] No `any`, no `!!`, no `TODO`, no `@Suppress` (without docs)
- [ ] Lint clean: ESLint, ktlint, SwiftLint
- [ ] Code coverage targets met
- [ ] Bundle size budgets met

### Docs

- [ ] README quick-start works on a fresh `cap init` project
- [ ] Every new public method has JSDoc + TypeDoc render
- [ ] Platform parity matrix updated
- [ ] CHANGELOG entry written (human-readable, not git log)
- [ ] Migration notes if any breaking changes (pre-1.0)
- [ ] All `SDK_SURFACE.md` coverage flags updated

### Security

- [ ] `npm audit` clean (high/critical fail the release)
- [ ] No real API keys in any commit (`gitleaks` scan)
- [ ] `SECURITY.md` reflects any new attack surface
- [ ] `enableLogging` still defaults to `false`
- [ ] `allowInsecureEndpoint` still defaults to `false`
- [ ] PII masking rules still applied (audit log lines)

### Release mechanics

- [ ] Version bumped in `package.json` per semver
- [ ] Git tag created (`v0.x.y`)
- [ ] GitHub Release drafted with changelog excerpt
- [ ] `npm publish --provenance` from CI (not local)
- [ ] npm 2FA verified
- [ ] Repo settings: signed commits required, force-push disabled on main
- [ ] Dependabot still enabled on example app

### Post-release

- [ ] Smoke-test the published package: `npm install capacitor-braze@latest` in a fresh project, run quick-start, verify works
- [ ] Tweet / post / update Aromo to consume the new version (if Aromo is the lighthouse)
- [ ] If shipping to 0.1.0: email Braze devrel with the launch link
- [ ] Update [`PLAN.md` Status](./PLAN.md#0-quick-facts) table

---

## 6. The single most important thing

**Boring excellence beats clever surface.** A plugin with 15 methods that all work flawlessly, ship security defaults correctly, document edge cases honestly, and follow Braze's own conventions will earn endorsement faster than a 200-method kitchen sink that's 95% correct.

Discipline = trust. Trust = adoption. Adoption = the resume signal.

---

## References

- [`PLAN.md`](./PLAN.md) — strategy and roadmap
- [`SDK_SURFACE.md`](./SDK_SURFACE.md) — what to build (capability catalog)
- [`SECURITY.md`](./SECURITY.md) — how to build it safely
- [Braze React Native SDK](https://github.com/braze-inc/braze-react-native-sdk) — reference for native bridge style
- [Capacitor Plugin Creation Guide](https://capacitorjs.com/docs/plugins/creating-plugins)
- [Capacitor Plugin Best Practices](https://capacitorjs.com/docs/plugins/tutorial/packaging)
