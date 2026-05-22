# L6 — Test Rigor

## Verdict
- **0.1.0 ready:** **GAP** (web is excellent; native + Layer 4 explicitly deferred and acknowledged in docs)
- **Senior-dev review:** **GAP** (web rigor is review-grade; native bridges have ZERO automated tests)

## Summary
The web bridge is the best-tested layer in the entire project — 92/92 tests pass in 3.06s, every one of the 37 surface methods has a direct behavioral test, validation contract is pinned by 18 dedicated tests, mock-server architecture lets tests assert wire format rather than just return values. The gap is on the OTHER two platforms: native iOS/Android bridges currently rely entirely on "it compiles against the real SDK" as their automated quality signal. C11 acknowledges this; impl is genuinely pending. No real-Braze smoke pass has been recorded yet.

## Findings

| ID | Severity | File:Line | Issue | Fix |
|----|----------|-----------|-------|-----|
| L6-01 | MAJOR | (whole repo) | No native test harness on iOS or Android. C11 designs the harness (XCTest + JUnit/Robolectric with mock server) but `ios/PluginTests/` and `android/src/test/` directories don't exist. Bridge bugs caught only by compile + manual smoke. | Implement C11 Phase 1: smoke-level XCTest + JUnit covering happy path of every method, mock server reused across all 3 platforms. ~3–5 days of work. |
| L6-02 | MAJOR | docs/smoke-tests/ | Layer 4 real-Braze smoke templates pre-staged but never executed. README explicitly says "❌ Not yet — the next milestone." | Run web + iOS + Android smoke against a free Braze trial, capture findings into `docs/smoke-tests/<platform>-2026-MM-DD.md` per the templates. Required pre-0.1.0 per PLAN.md. |
| L6-03 | MINOR | test/web/package.json | No coverage reporting wired up. `vitest run` doesn't emit coverage by default. README claims "37/37 methods directly covered" but that's manually maintained in `docs/TEST-COVERAGE-AUDIT.md`. | Add `--coverage` to test:cov script + `@vitest/coverage-v8` dep. Auto-fail under threshold (e.g. 85%). Saves the manual audit doc from rotting. |
| L6-04 | MINOR | test/web/src/*.test.ts (stderr noise) | Several tests intentionally trigger `ECONNREFUSED` from mock server teardown. They log loud red errors to stderr even though tests PASS. Confusing to readers. | Suppress expected errors via `vi.spyOn(console, 'error').mockImplementation(...)` in negative-path tests; or filter stderr in the mock client. |
| L6-05 | MINOR | test/mock-server | Mock server is a JS module (`test/mock-server/src/`), not the Ktor server originally specced in CLAUDE.md/PLAN.md. Works fine but the docs are stale. | Either update PLAN.md + CLAUDE.md to reflect JS mock server, or build the Ktor variant for native test harnesses (since C11 calls for one). Recommend updating docs — JS server is doing the job. |
| L6-06 | NIT | test/web/src/test-utils.ts | Tests use `freshPluginWithConfig` pattern to navigate the module-singleton constraint. Works but is non-obvious; new contributors will trip over it. | Add a comment in `test-utils.ts` explaining WHY (singleton + per-test config needs). |

## What's good
- 92/92 passing in 3.06s — fast feedback loop, will stay green
- Mock server captures wire-format POST bodies (per stderr/CHANGELOG: "wire-level POST capture for impression methods") — tests assert on what hits the network, not just what the bridge returns. This is the right primitive.
- Defensive validation pass added 18 tests pinning every input-validation branch (a726357). Future refactors that drop a guard fail CI immediately — exactly what C04 asks for.
- Test files mirror module boundaries (events.test, attributes.test, content-cards.test, etc.) — easy to find the test for a given method.
- Listener end-to-end coverage including `removeAllListeners` (41ba0e23) — the bug-prone unsubscribe path is tested.
- Populated-cache tests for content cards + feature flags via initialize-time config (804e7a6) — covers the realistic shape, not just empty-cache paths.

## What's risky
- **Native bridges are 1,671 lines of code with zero unit tests.** Every change to BrazePlugin.swift or BrazePlugin.kt ships on the strength of "it still compiles" + manual smoke. For a production-grade plugin this is the single biggest gap.
- A bug in a native bridge that compiles but misbehaves (wrong threading, missed null check, swapped argument order) will only be caught when a consumer files an issue — exactly the kind of "would specifically annoy a Braze senior" reviewer finding.
- The web mock server can drift from real Braze. There's no daily/weekly job comparing mock fixtures to real-trial responses (PLAN.md mentions "daily spec-drift CI" — not wired up).
