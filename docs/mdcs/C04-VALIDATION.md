# C04 — Validation

**Validate inputs at the TS boundary AND at every native bridge. Don't trust the TS type system to enforce shape at runtime, and don't push validation into the Braze SDK.**

The plugin is a bridge; the bridge is the boundary at which we have ground truth about the user's intent. Once a malformed value reaches the SDK, the failure mode is opaque (silent drop, dashboard inconsistency, retry storm).

---

## Rule

For every method that takes user-provided input:

1. **The TS interface declares the precise type** (string union, number ranges via JSDoc, required vs optional). This is documentation and IDE assistance, not runtime enforcement.
2. **`src/web.ts` validates at the boundary** before forwarding to the Web SDK. Same shape checks the native bridges run.
3. **Each native bridge duplicates the validation** in its own language. This is intentional duplication, not "DRY violation" — see Rationale below.
4. **Validation order is fixed:** required-presence → type → enumerated set → range/format. Bail on the first failure; don't accumulate errors.
5. **Reject with the C01 error message format.** Single sentence, backtick-fenced field name, type hint in parens.

## Rationale

Why duplicate the validation across four files?

- **The TS type system is erased at runtime.** Consumers can pass `as any`, JS objects from `any`-typed code, or values from JSON.parse — none of which TS narrows. Without runtime validation, malformed input reaches the SDK and we lose the call site context for debugging.
- **Each bridge runs in a different runtime** (V8, Swift, JVM). Capacitor's argument coercion is not uniform across them — `call.getInt("x")` on Android may coerce a JS number to int differently than Swift's `call.getInt`, and certain JSON shapes round-trip lossily. Validating at each bridge ensures that whatever the runtime delivered is what the SDK gets.
- **Errors must surface in the consumer's call site, not at the Braze backend.** If we let an empty currency string through and Braze drops the event silently, the consumer's revenue report is wrong and debugging starts six steps removed from the offending call. A `call.reject()` at the bridge gives a stack trace pointing at the consumer's invocation.
- **The TS validation is a UX layer.** It gives faster errors during browser-mode iteration, before the call leaves the bridge. The native validation is the safety net.

## Validation order

Each validator runs in this fixed order and bails on the first failure:

1. **Required-presence**: is the field present and a non-empty string / non-undefined number?
2. **Type**: is it the right primitive type? (string, number, boolean, integer.)
3. **Enumerated set**: if the field has a fixed set of values (gender, currency code), does it match?
4. **Range / format**: ranges (month 1-12, quantity 1-100) and shape (HTTPS endpoint, finite non-negative price).

Stop on first failure. Don't return an `errors[]` list — there's no UX benefit, and the consumer's call path can't act on an array of errors anyway.

## Worked examples

### Required-presence with type hint

```ts
// src/web.ts:439 — requireGroupId
private requireGroupId(groupId: string, method: string): void {
  if (!groupId || typeof groupId !== 'string') {
    throw new Error(`Braze.${method}: \`groupId\` is required (string).`);
  }
}
```

Both the empty-string check (`!groupId`) and the type check are required — `!''` and `typeof '' === 'string'` both pass independently; the consumer might pass `0` or `null` or `undefined`. The combined check rejects all of them with one message.

Mirror on iOS ([`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift)):

```swift
guard let groupId = call.getString("groupId"), !groupId.isEmpty else {
    call.reject("Braze.addToSubscriptionGroup: `groupId` is required (string).")
    return
}
```

Mirror on Android ([`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)):

```kotlin
val groupId = call.getString("groupId")
if (groupId.isNullOrEmpty()) {
    call.reject("Braze.addToSubscriptionGroup: `groupId` is required (string).")
    return
}
```

Same field name in backticks, same error text. Identical UX across platforms.

### Range validation — DOB

```ts
// src/web.ts:449 — validateDateOfBirth
private validateDateOfBirth(options: BrazeSetDateOfBirthOptions): void {
  const { year, month, day } = options;
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Braze.setDateOfBirth: `month` must be an integer between 1 and 12.');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Braze.setDateOfBirth: `day` must be an integer between 1 and 31.');
  }
}
```

`Number.isInteger` is non-negotiable for fields the consumer typed as `number` but might pass as `12.5` or `NaN`. Range check happens AFTER integer check — `NaN > 0` evaluates to false, so the range check would mis-pass `NaN` if integer check came second.

iOS and Android duplicate the same ranges (1900-2100, 1-12, 1-31) in their native validators. See C03 for the 1-indexed month decision.

### Composite validation — purchase

```ts
// src/web.ts:504 — validatePurchase
private validatePurchase(options: BrazeLogPurchaseOptions): void {
  if (!options.productId || typeof options.productId !== 'string') {
    throw new Error('Braze.logPurchase: `productId` is required (string).');
  }
  if (!options.currency || typeof options.currency !== 'string') {
    throw new Error('Braze.logPurchase: `currency` is required (ISO 4217 string).');
  }
  if (
    typeof options.price !== 'number' ||
    !Number.isFinite(options.price) ||
    options.price < 0
  ) {
    throw new Error('Braze.logPurchase: `price` must be a non-negative finite number.');
  }
  if (options.quantity !== undefined) {
    if (!Number.isInteger(options.quantity) || options.quantity < 1 || options.quantity > 100) {
      throw new Error('Braze.logPurchase: `quantity` must be an integer between 1 and 100.');
    }
  }
}
```

Notes:

- The `Number.isFinite(price)` check is REQUIRED. Without it, `Infinity` and `NaN` pass the number-and-`>= 0` check (since `NaN >= 0` is false but `Infinity >= 0` is true), and either would land in Braze's revenue analytics as a corrupt event.
- Quantity is `if (quantity !== undefined)` because the TS contract makes it optional. We don't validate a value the consumer didn't send.

iOS / Android bridges duplicate each check verbatim. They are independent code paths; the duplication is what keeps them in sync.

## Type-coercion quirks worth knowing

- **Android `call.data.opt("value")`**: returns the raw `JSONObject` value, preserving Boolean / Integer / Double type. The wrapper methods (`call.getBool`, `call.getInt`, `call.getDouble`) silently coerce. Use `call.data.opt(...)` when you need to dispatch on the original JSON type (see `setCustomUserAttribute` in [`android/.../BrazePlugin.kt`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt) for the canonical case).
- **iOS `call.getBool` → `call.getString` → `call.getInt` → `call.getDouble`**: the order matters when you dispatch on inferred type. `getBool` first means JSON `true`/`false` isn't misread as integer `1`/`0`.
- **Web `Number.isFinite` vs `isFinite`**: ALWAYS the `Number` static method. The global `isFinite('14.99')` coerces strings; `Number.isFinite('14.99')` returns false. The global form is footgun.
- **Web JSON parse**: when an example app or test parses consumer JSON, validate the parsed object the same way you'd validate a runtime JS object — don't trust `JSON.parse` output to match a TS type.

## Rules for adding a method

When you add a new method that takes input:

1. List every input field. Mark which are required, which optional, which have constrained sets.
2. Write a TS validator helper (`validate<MethodName>` or `require<FieldName>`) near the existing ones in `src/web.ts`. Use the same `throw new Error(...)` style.
3. Call the validator first thing in the web impl, before forwarding to the Web SDK.
4. Duplicate every check on iOS and Android, with the same error message text. Tests for "did I get the order right" exist in the example app — exercise every invalid path manually before shipping.
5. Add a one-line entry to C04's "Worked examples" or "Type-coercion quirks" section if your method surfaces a new validation pattern.

## Forbidden

- **Skipping validation on a native bridge because "TS already validates."** TS doesn't validate at runtime in production; it only narrows. The bridges are the boundary.
- **Accumulating error arrays.** One error, one message, one bail point. Consumers can't act on `errors[]`.
- **Letting Braze reject the bad input.** By the time it reaches Braze, the consumer is too far from the bug to debug. Reject at the bridge with a clear message.
- **Validating against the inverse of an SDK accept-list.** Don't write "reject if not in our hardcoded allowed-currencies list" — Braze maintains the currency list, and ours will drift. Validate the SHAPE (non-empty string, ISO 4217 length), not the SET.
- **Different error messages across platforms.** The text after `Braze.<methodName>: ` must be byte-identical across web/iOS/Android. If you wrote `\`year\` must be...` on Web and `\`year\` should be...` on Android, that's a bug.
