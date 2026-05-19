# C02 — DTO shapes

**Every Braze model surfaced through the plugin matches the Web SDK wire format. The Web bridge is zero-conversion. iOS and Android bridges convert their native model shapes into the Web SDK shape on the way out.**

This MDC is the load-bearing decision behind every `Braze*` DTO this plugin exposes: feature flags today, in-app messages and content cards tomorrow.

---

## Rule

When you surface a Braze model object (FeatureFlag, InAppMessage, ContentCard, Banner, etc.) through a plugin method, the DTO shape MUST match the `@braze/web-sdk` type declarations exactly. Native bridges convert their typed enums and value-classes into this shape; the Web bridge passes through with minimal wrapping.

Property maps follow the Web SDK's `PropertiesJson` shape:

```ts
{ key: { type: 'string' | 'number' | 'boolean' | 'image' | 'datetime' | 'jsonobject', value: ... } }
```

## Rationale

Three reasons:

1. **The Web SDK is the only one of the three with public TypeScript types.** Mirroring it means our TS interface stays grep-able against the SDK's actual published shape, and a contributor reading [`@braze/web-sdk/index.d.ts`](../../node_modules/@braze/web-sdk/index.d.ts) can see exactly how our DTO maps.
2. **One canonical shape means the Web bridge is trivially correct.** The web path runs in the developer's browser during iteration; if it's also the cheapest path to reason about, debugging is faster.
3. **Conversion lives in one place per platform.** When BrazeKit adds a new property type, the change is a single switch case in the iOS serializer — not a coordinated rewrite of TS + iOS + Android + every consumer's runtime checks.

If we'd picked iOS or Android as canonical, the Web bridge would have to invert the SDK's already-correct objects on every call. Picking Web as canonical means N-1 of the three platforms pay zero conversion cost.

## Worked example — `BrazeFeatureFlag`

**TS contract** ([`src/definitions.ts:252`](../../src/definitions.ts)):

```ts
export type BrazeFeatureFlagPropertyValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'image'; value: string }
  | { type: 'datetime'; value: number }
  | { type: 'jsonobject'; value: Record<string, unknown> };

export interface BrazeFeatureFlag {
  id: string;
  enabled: boolean;
  properties: Record<string, BrazeFeatureFlagPropertyValue>;
}
```

This matches the Web SDK's `PropertiesJson` ([`node_modules/@braze/web-sdk/index.d.ts:1576`](../../node_modules/@braze/web-sdk/index.d.ts)) one-for-one:

```ts
export type PropertiesJson = Partial<
  Record<string, StringProperty | NumberProperty | BooleanProperty | ImageProperty | JsonProperty | TimestampProperty>
>;
```

**Web bridge** ([`src/web.ts:478`](../../src/web.ts)): walks `featureFlag.properties` and re-emits only entries with one of the six known type tags. Future SDK additions are dropped rather than guessed — see "Forbidden" below.

**iOS bridge** ([`ios/Plugin/BrazePlugin.swift:436`](../../ios/Plugin/BrazePlugin.swift)): pattern-matches `Braze.FeatureFlag.Property` enum cases (`.string(let v)`, `.number(let v)`, `.boolean(let v)`, `.timestamp(let v)`, `.image(let v)`, `.json(let v)`) and emits `[String: Any]` records matching the wire format. `.timestamp` → `type: 'datetime'` and `.json` → `type: 'jsonobject'` — these two name-mappings are required because BrazeKit's case names don't match the wire format vocabulary.

**Android bridge** ([`android/.../BrazePlugin.kt:572`](../../android/src/main/java/com/bma342/braze/BrazePlugin.kt)): `featureFlag.properties` is a `JSONObject` that Braze stores in the same wire format Braze ships, so the bridge uses `JSObject(jsonObject.toString())` to round-trip. This is the only platform where we use a string round-trip; on the other two platforms direct construction is type-safe.

## Rules for extending

When you add a new Braze model DTO (e.g. `BrazeContentCard`, `BrazeInAppMessage`):

1. Read the Web SDK's `index.d.ts` first. Whatever shape it declares for that model IS the contract.
2. Declare the TS interface in `src/definitions.ts` matching the Web SDK shape exactly. Use the same field names, same union tags, same nullable boundaries.
3. Add the `serialize<ModelName>` helper to each native bridge. Place it next to the model's accessor methods in the same file.
4. The native bridges may have to flatten enum cases (iOS) or round-trip JSONObjects (Android) — see C02 for tactic. The TS contract doesn't change.
5. If the Web SDK uses a tag name your domain knowledge says is wrong (e.g. you'd prefer `'json'` over `'jsonobject'`), do NOT rename it. The cost of divergence from the canonical wire format is paid every time a contributor cross-references our DTO against Braze docs.

## When `null` vs missing matters

A property absent from `properties` and a property explicitly serialized as `null` are NOT the same thing across the three platforms. The plugin's convention:

- **Missing**: the SDK didn't return a value for this key. Native bridges should NOT emit the key at all.
- **`null`**: an explicit cleared / nulled value. Reserved for top-level scalar fields like `BrazeGetUserIdResult.userId`, never for nested property maps.

The featureFlag.properties map only contains keys with values; absent keys mean the SDK didn't see them.

## Forbidden

- **Inventing tag names not in the Web SDK.** If BrazeKit's iOS enum has a case the Web SDK doesn't enumerate, drop it (or open an issue against `@braze/web-sdk` asking them to add it).
- **Returning the raw native object** from a plugin method. Capacitor will JSON-serialize it via reflection, the shape will diverge across platforms, and we'll have shipped three different DTOs for the same model. Always go through a `serialize<ModelName>` helper.
- **Coupling consumer types to BrazeKit / Android SDK types.** A consumer should be able to `import type { BrazeFeatureFlag } from 'capacitor-braze'` and not need any Braze SDK installed. The TS interface is the contract; everything below is implementation detail.
- **String-round-tripping when typed conversion is available.** Android uses `JSONObject.toString()` round-trip ONLY because the underlying storage is already the wire format; on iOS and Web we have typed values, so we do typed conversion. Don't reach for `JSON.stringify`/`JSON.parse` when a typed path exists.
