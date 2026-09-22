# MDCs — Markdown Design Contracts

Per-subsystem design contracts that codify the load-bearing patterns this plugin commits to. Strategic / scope docs live at the repo root ([`PLAN.md`](../../PLAN.md), [`SDK_SURFACE.md`](../../SDK_SURFACE.md), [`SECURITY.md`](../../SECURITY.md), [`REVIEW_READINESS.md`](../../REVIEW_READINESS.md), [`CLAUDE.md`](../../CLAUDE.md)); past self-audits live in [`docs/audits/`](../audits/). MDCs are what stop us from re-litigating the same design choice on every new method.

| MDC | Subject | Read it when… |
|---|---|---|
| [C01](./C01-METHOD-ANATOMY.md) | **The canonical method lockstep**, init guards, error message convention | Adding any new plugin method |
| [C02](./C02-DTO-SHAPES.md) | DTO shape rule — Web SDK wire format is canonical, bridges convert | Returning any Braze model object from a plugin method |
| [C03](./C03-CROSS-PLATFORM-TRANSLATION.md) | Per-platform conversion conventions (months, currency, decimals, dates, enums, anonymous sentinels) | Adding a method whose argument or return type behaves differently on the three native SDKs |
| [C04](./C04-VALIDATION.md) | Input validation — TS validates at boundary, native bridges duplicate | Adding a method that takes user-provided input |
| [C05](./C05-LISTENERS.md) | Event-listener lifecycle — eager-on-initialize, shared, no replay, and teardown on **every** path that invalidates the SDK instance | Adding any `addListener('eventName', ...)` event |
| [C06](./C06-SECURITY-DEFAULTS.md) | Security defaults & PII discipline — default-deny toggles, HTTPS-required endpoint, never log values | Touching configuration toggles, the network layer, or any field that carries user data |
| [C07](./C07-INIT-INDEPENDENT-METHODS.md) | When a plugin method may legitimately skip the init guard | Adding a method that needs to work during consent revocation, GDPR erasure, or other pre-init lifecycle paths |
| [C08](./C08-NATIVE-SDK-PINNING.md) | Native SDK pin policy (exact on iOS/Android, caret on Web peer dep) and the bump protocol | Updating the version of BrazeKit, `com.braze:android-sdk-ui`, or `@braze/web-sdk` |
| [C09](./C09-TOOLING-QUALITY-GATES.md) | ESLint + Prettier + SwiftLint + `@capacitor/docgen` — Capacitor's official toolchain, locked-in | Touching `package.json` scripts, lint configs, or the README API section |
| [C10](./C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) | Consumer-side config the plugin's SDK pins force (Podfile linkage / deployment target, Android Gradle, Web peer dep) | Bumping a native SDK pin (per C08); adding a method that needs new permissions or entitlements |
| [C11](./C11-NATIVE-TEST-HARNESSES.md) | iOS XCTest + Android Robolectric harnesses. **Unit tier implemented** (74 Android + 26 iOS, both in CI); the HTTP-intercept integration tier is still design-only | Wiring or extending native tests; reviewing `ios/PluginTests/` or `android/src/test/` |

## How to use this set

When you add a method:

1. Open [C01](./C01-METHOD-ANATOMY.md) and walk [the lockstep checklist](./C01-METHOD-ANATOMY.md#the-lockstep-checklist). It is the canonical copy; `CLAUDE.md`, `CONTRIBUTING.md` and the PR template all point here.
2. If your method returns a Braze object, open [C02](./C02-DTO-SHAPES.md) and confirm the DTO matches the Web SDK wire format.
3. If your method has args whose semantics differ across SDKs, open [C03](./C03-CROSS-PLATFORM-TRANSLATION.md) and pick the canonical shape per the rules there.
4. If your method takes user input, open [C04](./C04-VALIDATION.md) and duplicate the validation across TS + Swift + Kotlin.
5. If your method is a listener, open [C05](./C05-LISTENERS.md) and follow the eager-on-init pattern.
6. If your method touches configuration, network, or user data, open [C06](./C06-SECURITY-DEFAULTS.md) and run its checklist.
7. If your method must work before `initialize` (consent revocation, GDPR erasure), open [C07](./C07-INIT-INDEPENDENT-METHODS.md) and confirm your method meets all five criteria for joining the init-independent set.

When you bump a native SDK:

- Open [C08](./C08-NATIVE-SDK-PINNING.md) and follow the bump protocol step by step.
- Audit [C10](./C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) — any new consumer-side requirement from the upstream changelog gets added here in the same PR.

If your method introduces a pattern none of these MDCs cover, add a new MDC in the **same commit as the code**. Don't ship a new pattern and a new MDC separately — the gap between is when contributors invent ad-hoc variants.

## Conventions

- **Numbering** mirrors the Aromo `K##` pattern but uses `C##` (Capacitor-Braze) to keep the namespaces distinct.
- **Each MDC** states a rule, the rationale, a worked example pinned to current code, and rules for extending the pattern.
- **Worked examples reference code by *symbol name*, never by line number.** Every `file:line` ref in this set was stale by the time anyone checked (2026-09 audit, A6-54: 29 of 29 wrong, several landing on blank lines). A symbol name plus a file path is greppable and cannot rot. If you add a reference, write `` `requireInitialized` in [`src/web.ts`](../../src/web.ts) ``.
- **Single-file** rather than the subdirectory style the larger Aromo project uses. This plugin is small enough that one file per MDC is easier to scan.
- **MDCs change** when code changes. Don't read an MDC and assume it's still accurate — grep for the symbol the worked example names and read the real code. These documents are the best writing in the repo and they have been wrong before; treat them as strong priors, not as ground truth.

## Adding a new MDC

Sequence:

1. Pick the next free `C##` number.
2. Copy an existing MDC's structure (one-line summary → rule → rationale → worked example → rules for extending → forbidden).
3. Link it from this index.
4. Add a one-line entry to the table at the top of [`CLAUDE.md`](../../CLAUDE.md) under the MDC Reference section.
5. Commit it alongside the code that motivated it, in the same commit.
