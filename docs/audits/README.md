# Audits

Point-in-time self-audits of this repository. **Both are archives, not open punch lists** — each
directory's `README.md` records what happened to every finding, and the reports themselves are
unmodified snapshots of what was true on the day they were written.

| Audit | Snapshot of | Scope | Verdict then | State now |
|---|---|---|---|---|
| [`2026-05/`](./2026-05/) | `a726357`, version `0.0.12` | 10 lenses: contract integrity, cross-platform translation, validation, native code quality, security, test rigor, CI/release, consumer surface, documentation, pre-publish | *"Tag `0.1.0` today? **NO**"* — 3 BLOCKERs, ~22 MAJORs | **All BLOCKERs and MAJORs closed**, in `0.1.0` or `0.2.0`. See its [resolution table](./2026-05/README.md) — including the two findings `0.1.0` claimed to have closed but had not |
| [`2026-09/`](./2026-09/) | `0ab8e19`, version `0.1.0` | 7 areas: TS/web contract, iOS bridge, Android bridge, security & supply chain, tests & CI, documentation, upstream SDK drift | ~180 findings; 1 BLOCKER, many MAJORs | Closed in `0.2.0`, with the exceptions each report names explicitly under "deliberately not changed" / "maintainer action — not done" |

## Why these are kept

A self-audit that found real bugs and drove real fixes is a credibility asset, and deleting it loses
the provenance. It is also a useful record of *how* this codebase failed: the recurring shapes are
worth knowing before writing the next feature.

Four patterns showed up in both audits:

1. **Gates that could not fail.** SwiftLint with a `parent_config` pointing at a nonexistent file;
   `node-swiftlint` exiting 0 with no binary installed; Android Lint with `abortOnError false`; a
   Snyk step whose `if:` condition could never evaluate true. All four read as green for months.
   The response is in [C09](../mdcs/C09-TOOLING-QUALITY-GATES.md): break a new gate on purpose and
   confirm it goes red — which is how the `0.2.0` bundle-size gate was validated, and why the Snyk
   step was deleted rather than repaired once it was clear its token was never going to exist.
2. **Tests that could not fail.** Eleven web tests would have survived their implementation being
   replaced with `return;`; an Android test asserted only that a message started with `"Braze."`.
   The response is in [C01](../mdcs/C01-METHOD-ANATOMY.md) and the PR template: assert the wire
   output or the exact string.
3. **Docs describing code that was never written.** `BrazeUnsupportedError`, `BrazeAuthRequiredError`,
   a `deepLinkReceived` listener, a PII-masking scheme, a daily spec-drift CI job, a Ktor mock
   server, Maestro e2e tests, a core/UI Web SDK split. Each was stated in the present indicative in
   at least one document. This is what the 2026-09 doc pass was mostly about. Note the one that went
   the other way: `deepLinkReceived` **was** built later in `0.2.0`, and `SECURITY.md` §7 now
   describes the shipped hook — including the two channels it cannot cover — rather than an
   interception contract Capacitor could not support.
4. **Claims that drift silently because nothing checks them.** Every one of the 29 `file:line`
   references in the MDC set was stale, several landing on blank lines — in a document set that
   explicitly told readers to verify against them. They are now symbol-anchored.

## Reading a report

Each report opens with a **Resolution status** table mapping every finding ID to one of: fixed in
`0.2.0`, partly fixed (with what remains), deliberately not changed (with the reason), or
*maintainer action — not done* for the GitHub and npm account settings that no code change can
perform. The last category is real and is not glossed: see
[CONTRIBUTING's pre-tag checklist](../../CONTRIBUTING.md#maintainer-pre-tag-checklist-for-020).

Where a report's body contradicts the current code, the code wins.
