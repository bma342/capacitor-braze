# Audit Summary — capacitor-braze

**Date:** 2026-05-22
**Branch / version at time of audit:** `main` @ `a726357` / package.json `0.0.12`
**Scope:** Full layer-by-layer audit per the plan laid out at the top of this session.
**Layers covered:** 10/10. Findings live in `findings/L1-*.md` … `findings/L10-*.md`.

---

## Three-lens grades

| Lens | Grade | What's blocking a higher grade |
|---|---|---|
| **Completeness** (does this cover a real Braze app?) | **B+ / GAP** | Native bridges ship the wrong DTO shape for ContentCard + FeatureFlag (L2-01, L2-02). iOS BrazeUI is pinned + linked but never imported, so IAM won't render out-of-box (L4-S11). Capacitor 7 forward-compat is claimed but only `^6` is in peer deps (L4-T02). |
| **Production-readiness** | **B / GAP** | Native bridges have ZERO automated tests (L6-01). No real-Braze smoke pass has been recorded yet (L6-02). iOS init re-entrance can fire stale callbacks (L4-S03). iOS `setCustomUserAttribute` silently truncates fractional doubles (L4-S02) — cross-platform divergence on the most-called SDK method. |
| **Senior-dev / Braze-engineer deep review** | **B− / GAP** | SDK Authentication is documented in SECURITY.md §2 + listed as a forbidden bypass in REVIEW_READINESS §3, but no bridge actually enforces it client-side (L4-K01 / L4-S01 / L4-T01 / L5-01). MDC C02 includes a fabricated iOS worked example that contradicts what the code does (L9-MAJOR). CLAUDE.md ships SDK pins that are 8 major versions stale (`34.x.x` / `12.x.x` vs. actual `42.2.0` / `14.1.0`). |

**None of the three lenses fail catastrophically.** The repo is much closer to ship-ready than the existing CLAUDE.md status table suggests. The grades all land at "good community plugin that needs ~3–7 days of targeted fixes" — not "rewrite required."

---

## Go / no-go calls

### Tag `0.1.0` today? **NO**
Three findings would land in any honest changelog as "shipped with a known correctness bug" — they cross the line from acceptable-pre-1.0-trade-off into "consumer files an issue on day 2." Block on:

1. **L2-01 + L2-02** — Native FF and CC DTOs are shaped differently from what `definitions.ts` promises. A consumer who writes `if (card.type === 'classic') {...}` works on web, breaks on iOS + Android. This is a TypeScript-lies-to-you bug, and it's exactly what discriminated unions are supposed to prevent.
2. **L4-K01 / L4-S01 / L4-T01 (= L5-01)** — `enableSdkAuthentication: true` doesn't reject signature-less `changeUser` calls anywhere. SECURITY.md §2 explicitly promises `BrazeAuthRequiredError` before the bridge dispatches. Right now the docs lie.
3. **L4-S11** — iOS pulls in BrazeUI (~2MB of binary) but never `import BrazeUI`, so in-app messages don't render on iOS. Either wire it or drop the dep.

Fix budget for these three: ~2–3 focused days. Add L4-S02 (iOS double truncation) and L1-01 (`getDeviceId` JSDoc lie) to that PR — they're 30-line fixes each.

### Tag `0.1.0` next week (after the above)? **YES, with a known-gap CHANGELOG entry**
After the four MAJOR fixes above, the remaining MAJOR findings are honest pre-1.0 omissions that a candid CHANGELOG entry can ship around:

- L6-01 — no native test harness yet (C11 already says "impl pending")
- L6-02 — no Layer 4 smoke yet (already ❌ in README status table)
- L4-T02 — Capacitor 7 compat (drop the claim from CLAUDE.md OR widen peer dep to `^6.0.0 || ^7.0.0` if it actually works)
- L9-MAJOR-1 — fix CLAUDE.md SDK pin numbers (15-min cleanup)
- L9-MAJOR-4 — fix C02's fabricated iOS example (write what the code actually does)

### Would a senior Braze SDK engineer endorse this? **Not yet, but close**
The strict lens fails on three specific things that would draw red ink in any honest PR review:

- **SDK Auth not enforced** (REVIEW_READINESS §3 explicitly lists "Bypassing SDK Authentication when `enableSdkAuthentication: true`" as forbidden — this exact bypass exists today).
- **Zero native tests** + zero recorded real-Braze smoke. A Braze SDK engineer's first question is "show me the iOS tests." There aren't any.
- **DTO contract violation on native** (L2-01/L2-02) is the kind of bug their own React Native bridge would never have, because their RN team writes the DTO translators by hand. Today this plugin doesn't.

After fixing those three classes — SDK Auth enforcement + native test harness (C11 Phase 1) + native DTO translation — this plugin clears the "Braze-endorsable" bar that REVIEW_READINESS §3 sets. Total budget: ~1–2 focused weeks.

---

## Findings counted across all layers

| Severity | Count | Notes |
|---|---|---|
| **BLOCKER** | 3 | L1-01 (`getDeviceId` JSDoc lie); L2-01 (iOS FF DTO shape); L2-02 (native CC DTO shape). |
| **MAJOR** | ~22 | The full pre-0.1.0 punch list. ~6 are bug-shaped, ~10 are docs-vs-code drift, ~6 are missing CI/test gates. |
| **MINOR** | ~40 | Mostly file:line drift in MDC worked examples, stale CHANGELOG cross-refs, mock-server naming churn, etc. |
| **NIT** | ~15 | Comments, grammar, optional polish. |

(Exact severity counts per layer are inside each `findings/L*.md`.)

---

## The Top-10 punch list

Ordered by ROI — what to fix first for biggest move on all three lenses:

| # | Layer | ID | Fix | Effort | Lens move |
|---|---|---|---|---|---|
| 1 | L4/L5 | L4-K01 + S01 + T01 / L5-01 | Reject signature-less `changeUser` when `enableSdkAuthentication: true` on all 3 platforms; add 1 test per platform. | 0.5 day | Senior + Completeness |
| 2 | L2 | L2-01 + L2-02 | Translate BrazeKit `flag.json()` → C02 tagged-union DTO on iOS. Translate ContentCard `forJsonPut()` / `card.json()` → discriminator-typed DTO on iOS + Android. | 1 day | Senior + Completeness |
| 3 | L4 | L4-S11 | Either wire `import BrazeUI` + IAM rendering on iOS, OR drop the BrazeUI dep from podspec until you do (don't ship 2MB you don't use). | 0.5 day | Completeness |
| 4 | L4 | L4-S02 + L4-K02 | iOS: reorder `getDouble` before `getInt` in `setCustomUserAttribute`. Kotlin: preserve `Long` instead of `.toInt()` at android:320. | 0.25 day | Production |
| 5 | L4 | L4-S03 | iOS: tear down old subscription handles on re-init, matching the Android pattern at android:166/179. | 0.25 day | Production |
| 6 | L1 + L9 | L1-01 + L9-MAJOR-1 | Remove "Init-independent" JSDoc from `getDeviceId`. Update CLAUDE.md SDK pin section (`34.x.x` → `42.2.0`, `12.x.x` → `14.1.0`). | 0.25 day | Senior |
| 7 | L9 | L9-MAJOR-4 | Rewrite C02's iOS feature-flag worked example to match what the code actually does (`JSONSerialization` on `flag.json()`), and disclose the known content-card divergence. | 0.5 day | Senior |
| 8 | L7 | L7-01 | Add `npm run swiftlint -- lint` step to `verify-ios` job so iOS code style is actually CI-enforced. | 0.1 day | Senior |
| 9 | L10 | L10-01 | Fix the `_options` ESLint warning (`argsIgnorePattern: '^_'` in eslint config). | 0.1 day | Production |
| 10 | L6 | L6-02 | Run web + iOS + Android Layer 4 smoke against a Braze trial, fill `docs/smoke-tests/<platform>-2026-MM-DD.md`. README's `❌ Not yet` becomes ✅. | 1 day | Senior + Production |

**Total budget for 0.1.0-ready:** ~4–5 focused days.
**Plus C11 Phase 1 native test harness** (recommended for Braze-endorse): another ~3–5 days.

---

## What's actually good (the strong base this builds on)

The audit found a real foundation under the gaps. Worth naming explicitly because it shapes what "fix to 0.1.0" means — it's a punch list, not a rewrite.

- **8-file lockstep is clean.** 35 methods present in `definitions.ts` / `web.ts` / `BrazePlugin.swift` / `BrazePlugin.kt` with matching param keys. Diff-verified. (L1)
- **Zero `!!`, zero Swift force-unwraps, zero `Any`/`unknown` in TS public returns, zero `@Suppress`.** This is a higher bar than most community plugins clear. (L4)
- **PII never leaves the bridge.** Grepped every native log family — bridges emit nothing user-identifying. Better than SECURITY.md §3 claims. (L5)
- **HTTPS enforcement with strict-equality (`=== true` / `getBool(..., false)`) on all 3 platforms.** Truthy strings can't disable. Matching error text. (L5)
- **Web test suite is genuinely review-grade.** 92/92 in 3.06s, 14 files, every one of 37 surface methods has at least one direct behavioral test, validation contract pinned by 18 dedicated tests, mock server captures wire-format POST bodies. (L6)
- **CI is well-structured.** 9 jobs incl. native `verify-ios` (xcodebuild against BrazeKit) and `verify-android` (gradle against android-sdk-ui) on every PR. Provenance + tag/version match on release. Dependabot grouped weekly. Branch protection applied via `gh`. (L7)
- **CHANGELOG is exemplary.** Keep-a-Changelog format, narrative per entry, rationale documented. Reads like release notes for humans. (L8, L9)
- **Disclaimers are prominent everywhere.** README header blockquote, badges, package.json description, PLAN/SECURITY/SDK_SURFACE all carry "not endorsed by Braze, Inc." This discipline matters. (L8)
- **Tarball discipline.** 26 files, 104.4KB packed, 522KB unpacked. No leak of test/example/demo/node_modules. `files` allowlist not denylist. `prepublishOnly` + new `prepare` script both run the full build. (L10)
- **Native SDKs exactly pinned.** BrazeKit/BrazeUI `14.1.0`, `com.braze:android-sdk-ui:42.2.0`. Web `@braze/web-sdk` `^6.0.0` per peer-dep policy. No ranges. (L4, L7)
- **`PrivacyInfo.xcprivacy` ships via podspec `resource_bundles`.** App Store gate cleared. Honest + minimal (doesn't duplicate BrazeKit's declarations). (L4, L5)
- **0 vulnerabilities** on `npm audit --audit-level=high --omit=dev`.

---

## Where to look next

- Each individual finding lives in `findings/L{N}-{name}.md` with file:line refs and proposed fixes.
- L4 (`findings/L4-native-code-quality.md`) is the longest at 31KB / 124 lines — read it next; it has the most actionable per-line fixes.
- L9 (`findings/L9-documentation.md`) is the cheapest to action — most fixes are 15-min cleanups.
- L1 + L2 (`findings/L1-contract-integrity.md`, `findings/L2-cross-platform.md`) define the contract violations that block 0.1.0.

---

## TL;DR for the person running this audit

> The repo is in much better shape than the CLAUDE.md status table suggests, and is roughly 4–5 focused days of work from a credible 0.1.0 tag. Three correctness bugs (native DTO shape, SDK-auth enforcement, iOS BrazeUI dead-link) need to ship inside the 0.1.0 PR. ~1 additional week of work (native test harness + Layer 4 smoke + a handful of doc fixes) takes this from "good community plugin" to "Braze-endorsable" by the REVIEW_READINESS §3 strict lens.
