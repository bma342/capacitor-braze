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
// `requireGroupId` in src/web.ts
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
// `validateDateOfBirth` in src/web.ts
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
// `validatePurchase` in src/web.ts
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
- **iOS `call.getBool` is unusable for type dispatch.** This entry used to prescribe `getBool` first "so JSON `true`/`false` isn't misread as integer `1`/`0`". It is the reverse: `getBool` succeeds for **any** `NSNumber` whose value is 0 or 1, so `{ value: 1 }` was written to Braze as `true` — silently, permanently, and only on iOS. Dispatch on the bridged object's real type instead:

  ```swift
  let raw = call.getValue("value")
  if let n = raw as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() { /* real Bool */ }
  else if let s = raw as? String { /* String */ }
  else if let n = raw as? NSNumber { /* Double iff CFNumberIsFloatType && fractional, else Int */ }
  ```

  See `classifyAttributeValue` in [`ios/Plugin/BrazePlugin.swift`](../../ios/Plugin/BrazePlugin.swift), which is unit-tested against the exact `NSNumber`s `JSTypes` produces.
- **iOS `call.getInt` truncates.** A JS `number` with a fractional part silently loses it. Where the contract says integer, *reject* rather than truncate — `quantity` and `sessionTimeoutInSeconds` both did the wrong thing until 0.2.0. Note that an integer helper must also reject booleans, because a JSON `true` bridges to `Int` 1.
- **Android: distinguish absent from present-but-invalid.** `call.getInt("x")` returns null for both. Use `call.data.has("x")` / `isNull("x")` to decide between "apply the default" and "reject".
- **Web `Number.isFinite` vs `isFinite`**: ALWAYS the `Number` static method. The global `isFinite('14.99')` coerces strings; `Number.isFinite('14.99')` returns false. The global form is footgun.
- **Web JSON parse**: when an example app or test parses consumer JSON, validate the parsed object the same way you'd validate a runtime JS object — don't trust `JSON.parse` output to match a TS type.

## Rules for adding a method

When you add a new method that takes input:

1. List every input field. Mark which are required, which optional, which have constrained sets.
2. Write a TS validator helper (`validate<MethodName>` or `require<FieldName>`) near the existing ones in `src/web.ts`. Use the same `throw new Error(...)` style.
3. Call the validator first thing in the web impl, before forwarding to the Web SDK.
4. Duplicate every check on iOS and Android, with **byte-identical** message text. Then pin it:
   `android/src/test/.../BrazePluginContractTest.kt` asserts every Android string against
   `src/web.ts`, and `ios/PluginTests/` does the same for iOS. Copy-pasting the string is not
   enough — two of them lost their second sentence at some point and nobody noticed for months.
5. Add a one-line entry to C04's "Worked examples" or "Type-coercion quirks" section if your method surfaces a new validation pattern.

## Sanctioned divergences

C04's byte-identical rule has exactly four exceptions. They are listed here so a reviewer can tell a
deliberate difference from drift — which was the actual problem: three strings differed and nobody
could tell which were intentional.

1. **Android's `requireUser` says `currentUser`, web says `getUser()`.**

   | | message |
   |---|---|
   | web | ``Braze: `getUser()` returned null. …`` |
   | Android | ``Braze: `currentUser` returned null. …`` |

   Both name the SDK accessor that returned null, and the accessors genuinely have different names.
   Naming web's accessor in an Android stack trace would send a developer looking for a method their
   SDK does not have. **This is the only sanctioned divergence in a message body.**

2. **Two validators exist only on web**, because the Web SDK is the only one whose `initialize`
   reports success and whose flush reports completion:

   ```
   Braze.initialize: the Braze Web SDK refused to initialize (check `apiKey` and `endpoint`; crawler user-agents are ignored by design).
   Braze.requestImmediateDataFlush: the Braze SDK reported the flush failed.
   ```

   Do **not** add these to the native bridges; there is nothing there to report them.

3. **iOS reports a different offending key when a property bag has more than one bad value.**
   `logCustomEvent` / `logPurchase` name the first offending key; web and Android walk in insertion
   order, iOS in sorted order, because Swift dictionaries have none. Same message format, possibly a
   different `<key>`. Documented on `BrazeEventProperties` in `src/definitions.ts`.

4. **iOS never emits the `getDeviceId` "not generated yet" error.** The string exists on all three
   platforms for parity, but BrazeKit's asynchronous `deviceId(_:)` accessor always yields a value,
   so the branch is unreachable on iOS. It is retained rather than deleted so the three bridges stay
   textually comparable.

Anything not on this list is drift. Add to the list in the same PR as the divergence, or don't
diverge.

## Forbidden

- **Skipping validation on a native bridge because "TS already validates."** TS doesn't validate at runtime in production; it only narrows. The bridges are the boundary.
- **Accumulating error arrays.** One error, one message, one bail point. Consumers can't act on `errors[]`.
- **Letting Braze reject the bad input.** By the time it reaches Braze, the consumer is too far from the bug to debug. Reject at the bridge with a clear message.
- **Validating against the inverse of an SDK accept-list.** Don't write "reject if not in our hardcoded allowed-currencies list" — Braze maintains the currency list, and ours will drift. Validate the SHAPE (non-empty string, ISO 4217 length), not the SET.
- **Different error messages across platforms**, unless the difference is on the sanctioned list above. The text after `Braze.<methodName>: ` must be byte-identical across web/iOS/Android. If you wrote `\`year\` must be...` on Web and `\`year\` should be...` on Android, that's a bug — and so is dropping a trailing sentence, which is how the HTTPS and card-not-found strings drifted.
- **Silently coercing an out-of-shape value into a valid one.** A fractional `quantity` rewritten to `1`, or a non-integer `sessionTimeoutInSeconds` falling back to the default, means the consumer's intent was discarded without a word. Reject.
- **Silently dropping a value the SDK can't take.** Android dropped non-scalar event properties for months; the event was logged, minus the data. Reject, naming the key.
