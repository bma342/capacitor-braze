# L7 — CI/CD & Release Hygiene

## Verdict
- **0.1.0 ready:** **PASS** with one minor gap
- **Senior-dev review:** **PASS**

## Summary
CI is genuinely good. Nine well-scoped jobs in `test.yml` (lint, build-plugin, build-example, build-demo, test-web, npm audit, verify-ios, verify-android), tag-triggered release with provenance attestation, dependabot grouped weekly, branch protection applied via `gh` CLI (8 required checks, signed commits, no force pushes). The one notable gap is SwiftLint: declared in the lint script but explicitly skipped on Ubuntu and not re-run inside `verify-ios`, so Swift code style is unenforced in CI.

## Findings

| ID | Severity | File:Line | Issue | Fix |
|----|----------|-----------|-------|-----|
| L7-01 | MAJOR | .github/workflows/test.yml:21–29 + verify-ios job | SwiftLint is in `npm run lint` but the Ubuntu lint job runs `eslint` and `prettier --check` separately, skipping swiftlint. `verify-ios` builds Xcode but does NOT run swiftlint either. Result: zero CI enforcement of Swift style. | Add `- name: SwiftLint\n  run: npm run swiftlint -- lint` to the verify-ios job (swiftlint binary available via `brew install swiftlint` on macos-latest, or install action). |
| L7-02 | MINOR | .github/workflows/test.yml | No bundle-size budget check. REVIEW_READINESS §2 specifies budgets (<50KB .aar, <100KB .framework, <5KB web gzipped) but nothing in CI enforces them. | Add `size-limit` for web bundle; `apkanalyzer dex packages` for Android (deferred to first .aar build pipeline). |
| L7-03 | MINOR | .github/workflows/test.yml | No spec-drift / daily real-Braze smoke job. PLAN.md/REVIEW_READINESS describe this as "daily job hits real Braze, diffs against mock fixtures." Not wired up. | Add a scheduled workflow (cron daily) gated by a `BRAZE_TRIAL_API_KEY` repo secret. Acceptable to defer until Layer 4 smoke is run manually first. |
| L7-04 | MINOR | .github/workflows/release.yml | Release pipeline does NOT run tests, lint, or audit before publishing. Relies on the fact that the tag-pushing commit already passed PR CI. This is brittle if someone tags a commit that wasn't on a passing PR. | Add `npm run lint && npm test` to release.yml before `npm publish`, or gate publish on `gh run --check-status` of the source commit. |
| L7-05 | MINOR | .github/dependabot.yml | Dependabot does NOT have a separate group for `/test/web` or `/test/mock-server`. Those dirs have their own package.json but aren't covered by the dependabot config. | Add `directory: '/test/web'` and `directory: '/test/mock-server'` entries; or document that they're intentionally manual. |
| L7-06 | MINOR | .github/workflows/release.yml | No CHANGELOG.md sync check — release.yml does not assert that an entry for the released version exists. Easy to ship and forget. | Add a step that greps CHANGELOG.md for `## [${GITHUB_REF_NAME#v}]` and fails the job otherwise. |
| L7-07 | NIT | test.yml audit job | `npm audit --audit-level=high --omit=dev` — fine, but the `--omit=dev` means dev-dep vulns don't surface even on Dependabot's radar. Recommend a separate weekly job at `--audit-level=moderate` (dev OK) so transient dev-dep CVEs surface. | Add a second non-blocking audit job. |

## What's good
- **Concurrency cancellation** on test.yml (cancels in-flight runs for same ref) — saves CI minutes, prevents racing-publishes.
- **Tag/version mismatch guard** in release.yml prevents the classic "tag v0.1.0 but package.json says 0.0.13" footgun.
- **Provenance attestation** (`--provenance --access public`) on publish — npm provenance + signed-commits + supply-chain hygiene. This already meets a higher bar than most community plugins.
- **`id-token: write` permission scoped to release.yml only.**
- **Native verification jobs** (`verify-ios`, `verify-android`) compile demo against real BrazeKit/SDK on every PR. This is the safety net that catches "TS bridge compiles but SDK API moved" — exactly the bug class CHANGELOG mentions getting fixed manually in Phase O.
- **Branch protection applied** (`docs/REPO-HYGIENE.md` documents it): 8 required CI checks, signed commits, no force pushes, no deletions, required conversation resolution.
- **Issue templates differentiated** (bug_report.yml, feature_request.yml, config.yml) — routes issues to the right intake.
- **PR template exists** (.github/PULL_REQUEST_TEMPLATE.md).
- **Dependabot config** groups updates weekly to avoid PR floods; Braze SDK pins explicitly excluded per C08 manual-bump policy.
- **Node 22 used consistently** across all jobs.

## What's risky
- SwiftLint gap means iOS bridge style is enforced only by reviewer eyeballs — easy fix, but unfixed it's a real review-finding.
- Release pipeline trusts tag-pushing as the gate. A direct `git tag v0.1.0 && git push --tags` from a clean local without going through a PR would publish without any CI check. Mitigated by branch protection on `main` but not by release.yml itself.
