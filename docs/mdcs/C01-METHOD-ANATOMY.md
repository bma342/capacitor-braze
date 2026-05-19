# C01 — Method anatomy

**Every plugin method has the same shape across eight files. Every native bridge method guards its preconditions through a shared helper. Every rejection message follows one format.** No improvising — drift here is the largest source of platform bugs.

---

## Rule

A new public plugin method MUST touch all eight files in a single commit, in the same shape every other method follows:

1. `src/definitions.ts` — TS signature + JSDoc with `@example`. The interface is the contract.
2. `src/web.ts` — web impl.
3. `ios/Plugin/BrazePlugin.swift` — Swift bridge under the correct `MARK:` section.
4. `ios/Plugin/BrazePlugin.m` — `CAP_PLUGIN_METHOD` registration.
5. `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — Kotlin bridge.
6. `example/index.html` — UI row + button under the matching category card.
7. `example/src/main.ts` — handler in the `runMethods` map.
8. `CHANGELOG.md` — entry under `[Unreleased]` or the active patch version.

Skipping any one of these is platform drift waiting to happen. CI catches build-time drift; functional drift (a TS method that does nothing on Android) only surfaces in real-Braze smoke tests, which is the most expensive place to find it.

## Rationale

The plugin is a bridge over three SDKs (Web, iOS, Android) plus a TS contract. Each method exists in four runtime forms (TS interface, Web impl, Swift impl, Kotlin impl) plus three integration artifacts (`.m` registration, example UI, CHANGELOG). The 8-file lockstep is the smallest set that:

- keeps the TS interface as the authoritative contract;
- registers the Obj-C method (the linker won't find an `@objc` Swift method without an explicit `CAP_PLUGIN_METHOD`);
- gives the example app coverage so any change is exercised end-to-end before publish;
- creates a paper trail in the CHANGELOG that survives a `git log` migration.

## Init guards

Every method that needs a live Braze instance MUST guard via a helper, not a re-implemented check. The helper exists once per platform and matches the SDK's instance model:

| Platform | Helper | Returns | Source |
|---|---|---|---|
| Web | `this.requireInitialized()` | `BrazeWebSdk` | [`src/web.ts:388`](../../src/web.ts) |
| Web | `this.requireUser()` | `NonNullable<ReturnType<BrazeWebSdk['getUser']>>` | [`src/web.ts:404`](../../src/web.ts) |
| iOS | `Self.requireInitialized(call)` | `Braze?` (rejects + returns nil on miss) | [`ios/Plugin/BrazePlugin.swift:524`](../../ios/Plugin/BrazePlugin.swift) |
| Android | `requireInitialized(call)` | `Boolean` (rejects + returns false on miss) | [`android/.../BrazePlugin.kt:637`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |
| Android | `requireUser(call)` | `BrazeUser?` (combines init + non-null currentUser) | [`android/.../BrazePlugin.kt:651`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) |

**Init-independent methods** (the privacy/lifecycle quartet: `wipeData`, `disableSDK`, `enableSDK`, `isDisabled`) intentionally skip the guard. They invoke class-level SDK statics that operate on global state and need to be callable during consent-revocation flows that may run before `initialize`. See [`SECURITY.md` §10](../../SECURITY.md) for the consent-flow rationale.

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

## Rules for adding a method

1. Check [`SDK_SURFACE.md §2`](../../SDK_SURFACE.md) — is this method in the current version's scope? If not, the addition is a roadmap change first, code change second.
2. Add the type to `src/definitions.ts` with full JSDoc + `@example`. The signature is the contract; downstream files implement against it.
3. Implement on web first (fastest iteration loop; cheapest to throw away if you change your mind on the shape).
4. Implement on iOS and Android. Use the matching `MARK:` / KDoc category comment so the bridge file stays browseable.
5. Register the Obj-C method in `BrazePlugin.m` under the matching category comment. Forgetting this surfaces as a runtime "method not implemented" error in the example app — easy to miss in code review.
6. Add the example UI row + handler. The example serves as the integration test before real-Braze smoke testing.
7. Build clean: `npm run build` from repo root AND `npm run build` in `example/`. CI runs both.
8. Bump the patch version per the pre-1.0 convention (every plugin source change = patch bump; document in CHANGELOG).
9. Update the relevant MDC if your method introduces a new pattern. **Same commit as the code.**

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
