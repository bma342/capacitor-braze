# L3 — Validation & error surface (C04)

## Verdict
**GAP** for 0.1.0
**GAP** for senior-dev review

## Summary
Required-presence validation is uniformly enforced across all three platforms for the 30+ methods that take input. Range validation, enum validation, and finite-number checks are mirrored on Web + native with the C01-compliant `Braze.<methodName>: \`<field>\` is required (<type>).` format. Three concrete gaps: (1) Web `setCustomUserAttribute` skips runtime type validation that both natives perform; (2) `setDateOfBirth` error message text diverges between Web (three field-specific) and native (one combined) — a C04 forbidden item; (3) Android `logCustomEvent`/`logPurchase` properties handling silently drops unsupported value types (line android:929-936). The C04 "TS at boundary + native duplication" pattern is otherwise sound. No hex-error format is documented in C01 — the audit prompt's reference to it doesn't match the MDC.

## Sample of 10 methods — validation coverage check

For each, I verified the method's required-presence + type + range/enum checks on iOS, Android, and Web bridges. "Match" means all three bridges run equivalent checks with byte-identical C01-formatted error text (after stripping locale-specific punctuation).

| Method | Web validation | iOS validation | Android validation | Match? |
|---|---|---|---|---|
| `echo` | n/a (input passthrough) | required-presence (`ios:76`) | required-presence (`android:101`) | Native-only, fine |
| `changeUser` | required `userId` (`web.ts:147`) | required `userId` (`ios:142`) | required `userId` (`android:196-200`) | PASS |
| `setSdkAuthenticationSignature` | required `signature` (`web.ts:163`) | required `signature` (`ios:165`) | required `signature` (`android:238-242`) | PASS |
| `setEmail` | no validation (`web.ts:176-179`); SDK accepts null | no validation (`ios:179-184`); SDK accepts nil | no validation (`android:255-260`); SDK accepts null | PASS (intentional — `null` clears) |
| `addToSubscriptionGroup` | required `groupId` via `requireGroupId` (`web.ts:222-225`, `503-507`) | required `groupId` (`ios:253`) | required `groupId` (`android:341-345`) | PASS |
| `addAlias` | required `alias` + `label` (`web.ts:240-245`) | required `alias` + `label` (`ios:275-281`) | required `alias` + `label` (`android:369-378`) | PASS |
| `setDateOfBirth` | year 1900-2100, month 1-12, day 1-31, Number.isInteger (`web.ts:513-524`) | same ranges (`ios:305-314`) | same ranges (`android:417-430`) | **FAIL** on message text (see L3-02) |
| `setGender` | enum lookup via `WEB_GENDER_MAP` (`web.ts:277-281`) | switch + reject unknown (`ios:340-350`) | when expression + reject unknown (`android:451-465`) | PASS |
| `logCustomEvent` | required `name` (`web.ts:300`) | required `name` (`ios:367`) | required `name` (`android:484-488`) — but properties silently dropped (see L3-03) | PASS on `name`, drop-warn on props |
| `logPurchase` | productId + currency + price (finite, >=0) + quantity (1-100) (`web.ts:727-740`) | same checks (`ios:384-400`) | same checks (`android:516-534`) | PASS |
| `getFeatureFlag` | required `id` (`web.ts:318`) | required `id` (`ios:429`) | required `id` (`android:565-569`) | PASS |
| `logContentCardClick` | required `cardId` + cache-lookup (`web.ts:707-720`) | required `cardId` + cache-lookup (`ios:528, 532-535`) | required `cardId` + cache-lookup (`android:837-853`) | PASS |
| `registerPushToken` | throws (Web unsupported) (`web.ts:437-444`) | required `token` + hex-format (`ios:606-613`) | required `token` (`android:705-709`) | PASS (iOS adds hex validation appropriately) |

Random-sample takeaway: 11/12 pass cleanly on shape + presence + range validation. The one fail is the DOB error message text divergence already flagged in L2-07.

## Findings

| ID | Severity | File:Line | Issue | Fix |
|----|----------|-----------|-------|-----|
| L3-01 | MAJOR | src/web.ts:210-216 | `BrazeWeb.setCustomUserAttribute` validates `key` non-empty but does NOT validate `value` type. Both natives reject `value` if it isn't string/number/boolean (`ios:243`, `android:324-329`). Web forwards `options.value` directly to the Web SDK. Consumer code using `JSON.parse` or `any`-typed inputs gets divergent behavior — web accepts arrays/objects/null, natives reject. C04 forbidden: "Skipping validation on a native bridge because TS already validates" applies symmetrically — same logic for skipping it on Web. | Add type check: `if (typeof options.value !== 'string' && typeof options.value !== 'number' && typeof options.value !== 'boolean') throw new Error('Braze.setCustomUserAttribute: \`value\` must be string, number, or boolean.');` |
| L3-02 | MAJOR | src/web.ts:515-523 vs ios:308, 312 vs android:421, 425 | `setDateOfBirth` error messages diverge. Web emits per-field: ``Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100.`` Native emits combined: `Braze.setDateOfBirth: out of range. Expected year 1900-2100, month 1-12, day 1-31.` Per C04 line 153, the text after `Braze.<methodName>: ` MUST be byte-identical. Consumer error-handlers parsing for `\`year\`` regex match on Web but not iOS/Android. | Pick one shape (per-field is more useful for consumer error handling) and propagate. Same applies to the iOS-only "invalid date components" message at ios:323 — Web has no equivalent. |
| L3-03 | MAJOR | android/.../BrazePlugin.kt:921-939 (`jsObjectToBrazeProperties`) | Silently drops property values of unsupported types. If a consumer passes `properties: { items: ['a','b'] }` (an array, not yet supported in v0.1 per SDK_SURFACE), the `when` branch falls through with no else clause — the entry is dropped without any rejection. iOS does the same (`ios:371`/`401` cast to `[String: Any]` accepts any JSON type silently). C04 §forbidden: "Letting Braze reject the bad input. By the time it reaches Braze, the consumer is too far from the bug to debug." | Either reject the call with a clear "unsupported property value type" error, or add a logged warning (per SECURITY.md §8 — never log values, but key names are fine). Web bridge has the same gap (forwards `options.properties` unchecked at `web.ts:303`). |
| L3-04 | MAJOR | All four bridges, methods that take `properties: Record<string, …>` | Neither Web nor native validate that property keys aren't empty strings or absurdly long. The TS contract says "Max length enforced by the Braze backend (~255 chars)" — pushing length-check responsibility to Braze violates C04's "reject at the bridge with a clear message" rule. | Add a per-key length sanity check (`key.length > 0 && key.length <= 255`) in `validateProperties` helpers on each bridge. Treat it the same as event-name validation. |
| L3-05 | MINOR | test/web/src/validation.test.ts | The validation test file covers TS-side rejection paths only. It does NOT exercise the native bridges, because no native test harness exists (C11 "impl pending"). A future refactor of `BrazePlugin.kt` or `BrazePlugin.swift` could silently relax a check (e.g. delete an `isNullOrEmpty` guard) and CI would not catch it. | C11 native harnesses are the blocker. Until then, every validation rule change should require a manual cross-platform smoke test documented in the PR. |
| L3-06 | MINOR | ios:312, 425, etc. (combined-range messages) | When iOS/Android emit the combined `setDateOfBirth: out of range.` message, the consumer doesn't know which field failed. A user-facing UI that maps Braze errors to form-field highlights can't disambiguate. Web's per-field shape is strictly more useful. | Tie this fix to L3-02 (pick the per-field shape and propagate). |
| L3-07 | MINOR | ios:323 | iOS has an extra "invalid date components" reject path that Web/Android don't have. It would only fire on calendar arithmetic that produces nil (e.g. impossible date combos that the range check accepted). It's a defensive belt-and-suspenders but the message format differs slightly — no backtick-fenced field name. | Either drop the extra check (the upstream range validation should make it unreachable) or rewrite to C01 format. |
| L3-08 | NIT | ios:333-354 (`setGender`) | Comment on iOS line 348: error message says `Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.` (hard-coded list). Android (android:459-462) has the same hard-coded list. Web (`web.ts:280`) derives the list from `Object.keys(WEB_GENDER_MAP).join(', ')`. If `BrazeGender` adds a value, Web auto-updates; native bridges drift until manually edited. | Either accept the drift (rare event, easy to catch in code review) or generate the list from a compile-time constant. Low priority. |
| L3-09 | NIT | ios:243 | iOS error: `Braze.setCustomUserAttribute: \`value\` must be string, number, or boolean.` Android (android:324-327): `Braze.setCustomUserAttribute: \`value\` must be string, number, or boolean. Got: ${value?.javaClass?.simpleName ?: "null"}`. Android adds a `Got: <type>` suffix; iOS doesn't. Text after `Braze.<methodName>:` should match (C04 line 153). | Either add the `Got: <type>` suffix to iOS for symmetry (info is valuable for debugging) or drop it from Android. |
| L3-10 | NIT | n/a | The audit prompt mentions a "hex-error format on iOS for SDK errors" specified by C01. `docs/mdcs/C01-METHOD-ANATOMY.md` does NOT specify or reference any hex format anywhere in the file. Either (a) C01 was meant to specify this and the doc is incomplete, or (b) the prompt is hypothetical. Currently, no iOS SDK error is propagated via `call.reject` at all — every reject is a validation reject. SDK-side errors (BrazeKit returning failure) are silently ignored (e.g. `requestRefresh` is fire-and-forget at ios:453). | Document the SDK-error error format in C01 if it's intended, or note its absence. Either way, the audit assumption needs reconciling. |

## What's good
- C01 error message format is uniformly applied: `Braze.<methodName>: \`<field>\` is required (<type>).` Every required-presence reject I read matches this template.
- No bare/unhelpful messages like `"invalid"` or `"error"` or `"failed"` — every reject names the field and the constraint.
- Validation order follows C04: required-presence → type → enumerated-set → range. Bail-on-first-failure with one message, no error arrays.
- `Number.isFinite` is correctly used on Web (web.ts:733); native equivalents (`price.isFinite()` on Android, `price.isFinite` on iOS) match.
- The shared helpers (`requireGroupId` on web.ts:503, `requireContentCardById` on web.ts:707, `requireInitialized` on both natives) are exactly the C04 pattern.
- DTO lookup-by-id (logContentCardClick / logContentCardImpression) handles cache-miss with a clear consumer-actionable message: `Call getContentCards() to verify the id, or wait for the next refresh.`

## What's risky
- Web's missing type-validation on `setCustomUserAttribute` is the most asymmetric gap. It's the kind of thing that produces silent dashboard drift in production.
- DOB error message text divergence is a small bug but a senior reviewer reads C04 and flags it instantly.
- Properties-map type validation is uniformly weak across all three platforms — values get silently dropped. This is the wrong default for an analytics SDK where lost properties directly impact reporting accuracy.
- No native test harness means CI cannot catch validation regressions on iOS or Android until smoke testing. C11's "impl pending" status is the gating dependency.
