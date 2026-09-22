# C01 — Method anatomy

**Every plugin method has the same shape across the same set of files. Every native bridge method guards its preconditions through a shared helper. Every rejection message follows one format.** No improvising — drift here is the largest source of platform bugs.

---

## The lockstep checklist

> **This is the canonical list.** `CLAUDE.md`, `CONTRIBUTING.md` and
> `.github/PULL_REQUEST_TEMPLATE.md` all reference this section rather than restating it. If you
> find a fifth copy anywhere, delete it and link here — four divergent copies of this list is a real
> bug this project has already shipped once (2026-09 audit, finding A6-22).

A new public plugin method MUST touch all ten artifacts in a single commit, in the same shape every
other method follows:

1. `src/definitions.ts` — TS signature + JSDoc with `@example`. The interface is the contract.
2. `src/web.ts` — web impl.
3. `ios/Sources/BrazePlugin/BrazePlugin.swift` — Swift bridge under the correct `MARK:` section.
4. The **same file's `pluginMethods` array** — a `CAPPluginMethod(name:returnType:)` entry under the matching category comment. This is the `CAPBridgedPlugin` conformance that replaced `ios/Plugin/BrazePlugin.m` in 0.3.0, because a Swift Package Manager target cannot mix Swift and Objective-C sources. Still ten artifacts; two of them now live in one file.
5. `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — Kotlin bridge.
6. `test/web/src/<area>.test.ts` — vitest behavioral test asserting the **wire output**, plus the validation rejections.
7. `android/src/test/java/com/bma342/braze/BrazePluginContractTest.kt` — Robolectric test asserting every validation branch byte-exact against `src/web.ts`.
8. `ios/Tests/BrazePluginTests/BrazePluginContractTests.swift` — the XCTest equivalent. Re-run `ruby scripts/ios-add-test-target.rb` and commit the regenerated Xcode project if you added a *file*.
9. `example/index.html` + `example/src/main.ts` — UI row + button under the matching category card, and the handler in the `runMethods` map.
10. `CHANGELOG.md` — entry under `[Unreleased]`. If the method is new to the roadmap, also update `SDK_SURFACE.md`.

Skipping any one of these is platform drift waiting to happen. Note what CI does and does not catch:
a build error is caught, but **an entirely missing native implementation is not** — the web tests
pass without it and the native jobs compile fine. The lockstep, and the PR checklist that mirrors
it, are the control. Functional drift that CI misses surfaces in real-Braze smoke testing, which is
the most expensive place to find it — and this project has not run one yet.

## Rationale

The plugin is a bridge over three SDKs (Web, iOS, Android) plus a TS contract. Each method exists
in four runtime forms (TS interface, Web impl, Swift impl, Kotlin impl) plus the `pluginMethods`
registration, a test on each platform, the example UI, and the CHANGELOG. The lockstep is the
smallest set that:

- keeps the TS interface as the authoritative contract;
- registers the method with the Capacitor bridge (it won't see an `@objc` Swift method that has no `CAPPluginMethod` entry — before 0.3.0 the same job was done by a `CAP_PLUGIN_METHOD` macro in `BrazePlugin.m`);
- pins the behaviour on every platform where it runs, so a subtly wrong bridge fails a test rather than a consumer;
- gives the example app coverage so any change is exercised by hand before publish;
- creates a paper trail in the CHANGELOG that survives a `git log` migration.

The test entries (6–8) were added after the 2026-09 audit: until then the checklist let a
contributor add a method with **zero** tests while the repo advertised a required `test-web` gate.

## Init guards

Every method that needs a live Braze instance MUST guard via a helper, not a re-implemented check. The helper exists once per platform and matches the SDK's instance model:

References below are by **symbol name**, not line number. Line numbers in this MDC set rotted
silently for four months (2026-09 audit, A6-54: all 29 were wrong); a symbol name plus a file is
greppable and cannot drift.

| Platform | Helper | Returns | Source |
|---|---|---|---|
| Web | `this.requireInitialized()` | `BrazeWebSdk` | `private requireInitialized()` in [`src/web.ts`](../../src/web.ts) |
| Web | `this.requireUser()` | `NonNullable<ReturnType<BrazeWebSdk['getUser']>>` | `private requireUser()` in [`src/web.ts`](../../src/web.ts) |
| iOS | `Self.requireInitialized(call)` | `Braze?` (rejects + returns nil on miss) | `private static func requireInitialized` in [`ios/Sources/BrazePlugin/BrazePlugin.swift`](../../ios/Sources/BrazePlugin/BrazePlugin.swift) |
| Android | `requireInitialized(call)` | `Boolean` (rejects + returns false on miss) | `private fun requireInitialized` in [`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |
| Android | `requireUser(call)` | `BrazeUser?` (combines init + non-null `currentUser`) | `private fun requireUser` in [`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |

**On iOS the guard runs *inside* the main-actor hop, before argument validation.** Validating first
would flip the error precedence — a pre-`initialize` call with a bad argument would report the
argument error rather than the init error — and the Android contract suite asserts init-guard-first
ordering across all 29 guarded methods.

**Init-independent methods** (the privacy/lifecycle quartet: `wipeData`, `disableSDK`, `enableSDK`,
`isDisabled`) intentionally skip the guard, so a consent revocation during app launch is not
dependent on the SDK having booted. See [C07](./C07-INIT-INDEPENDENT-METHODS.md) for the five
criteria and the per-platform behaviour, and [`SECURITY.md` §10](../../SECURITY.md#10-data-privacy-methods--exposing-gdpr--ccpa-tools)
for the consent-flow rationale.

If you find yourself adding a new init-independent method, document the reason in its JSDoc and add an entry to the privacy/lifecycle section here.

## Error message convention

Format:

```
Braze.<methodName>: `<fieldName>` is required (<type>).
```

Or for range / value-shape errors:

```
Braze.<methodName>: <fieldName> must be <constraint>.
```

Worked examples (extract from current code):

```
Braze.changeUser: `userId` is required (string).
Braze.setDateOfBirth: `month` must be an integer between 1 and 12.
Braze.logPurchase: `price` must be a non-negative finite number.
Braze.logPurchase: `quantity` must be an integer between 1 and 100.
Braze.setGender: unknown gender "<value>". Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.
```

Rules:

- **Prefix is `Braze.<methodName>: `** — a uniform prefix lets consumer-side error handlers route by message prefix or regex.
- **Field names are backtick-fenced**, matching the JSDoc convention so the error message text aligns with the type signature documentation. The same field shows up as `\`fieldName\`` in JSDoc, in the error, and (typically) in TS interface JSDoc — three places, one casing.
- **Type annotation goes in parens** (`(string)`, `(ISO 4217 string)`, `(integer)`) so the consumer immediately knows what they should have sent.
- **Enum / value mismatches list allowed values** verbatim, so the consumer doesn't need to grep the TS type to find the legal set.
- **The `setGender` example above echoes the supplied value**, which looks like it contradicts [C06 §4](./C06-SECURITY-DEFAULTS.md)'s "errors name the field, never the value". It does not: C06 carries an explicit **closed-enum exemption**. A value drawn from a fixed, documented, non-secret set is not user data, and naming it is the only way to make the error actionable. The exemption does **not** extend to `setEmail`, `setPhoneNumber`, `setCustomUserAttribute` or anything else carrying consumer-supplied content.

## Rules for adding a method

1. Check [`SDK_SURFACE.md §2`](../../SDK_SURFACE.md) — is this method in the current version's scope? If not, the addition is a roadmap change first, code change second.
2. Add the type to `src/definitions.ts` with full JSDoc + `@example`. The signature is the contract; downstream files implement against it.
3. Implement on web first (fastest iteration loop; cheapest to throw away if you change your mind on the shape).
4. Implement on iOS and Android. Use the matching `MARK:` / KDoc category comment so the bridge file stays browseable.
5. Add the `CAPPluginMethod` entry to `BrazePlugin.swift`'s `pluginMethods` array, under the matching category comment. Forgetting this surfaces as a runtime "method not implemented" error in the example app — easy to miss in code review, and neither `verify-ios` leg catches it (both compile and test the Swift, neither drives the JS bridge).
6. Add the example UI row + handler. The example serves as the integration test before real-Braze smoke testing.
7. Write the tests — web, Android, iOS. Assert the wire output, not just that the call resolved.
8. Build clean: `npm run build` from repo root AND `npm run build` in `example/`. Run `npm test`, the Robolectric suite, and the XCTest suite. CI runs all of them.
9. Add the CHANGELOG entry. Versioning is decided at release time, not per commit.
10. Update the relevant MDC if your method introduces a new pattern. **Same commit as the code.**

## Forbidden

- `any` types in TS — plugin consumers depend on the type safety.
- `!!` force-unwraps in Swift — bail with `call.reject()` instead.
- Throwing exceptions from native bridges instead of `call.reject()` — Capacitor expects rejected promises, not crashes.
- `TODO` comments — file a GitHub issue.
- `@Suppress` annotations without a documented Braze SDK reason inline.
- Adding to `CAP_PLUGIN(BrazePlugin, "Braze", ...)` without an accompanying `@objc` Swift method (or vice versa). The two registrations must move in lockstep.
- Reimplementing the init guard inline. Use the helper.

## Anti-pattern

Don't write a "quick scaffold" method that only implements TS + one platform. That commit goes into `main`, the user-facing surface lies about cross-platform support, and the gap takes weeks to close. Either ship a method on all three platforms in one commit, or don't ship it.
