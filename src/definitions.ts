/**
 * Capacitor plugin interface for the Braze SDK.
 *
 * See https://github.com/bma342/capacitor-braze for full docs.
 *
 * Scope discipline: this interface only grows per the version roadmap in
 * `SDK_SURFACE.md`. New methods are scope decisions, not casual additions.
 */

import type { PluginListenerHandle } from '@capacitor/core';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Options passed to {@link BrazePlugin.initialize}.
 *
 * `apiKey` is a **public Braze SDK API key** (the kind embedded in your app).
 * Never pass a REST API key here — they are different things. See `SECURITY.md` §1.
 */
export interface BrazeInitializeOptions {
  /** Braze SDK API key (public). */
  apiKey: string;
  /**
   * Braze SDK endpoint, e.g. `sdk.iad-03.braze.com`. Must be HTTPS in production.
   * For mock-server testing, set {@link BrazeInitializeOptions.allowInsecureEndpoint}.
   */
  endpoint: string;
  /**
   * Enable verbose SDK logging. Defaults to `false`. Never enable in production
   * builds — Braze SDK logs include event payloads which may contain PII.
   * See `SECURITY.md` §8.
   */
  enableLogging?: boolean;
  /**
   * Enable SDK Authentication (signed JWT validation). **Strongly recommended for
   * production.** Without it, anyone with the public SDK API key can spoof events
   * for arbitrary user IDs. See `SECURITY.md` §2 for the full design.
   */
  enableSdkAuthentication?: boolean;
  /**
   * Allow non-HTTPS `endpoint`. Defaults to `false` and should remain so in
   * production. Only set `true` for local mock-server testing per `SECURITY.md` §4.
   */
  allowInsecureEndpoint?: boolean;
  /**
   * Session timeout in seconds. After this much inactivity, the SDK
   * opens a new session on the next event. Braze's default across all
   * three SDKs is 30 minutes (1800 seconds); supply a value here to
   * override. Must be a positive integer; values ≤ 0 are rejected.
   *
   * Cross-platform note: the plugin contract uses seconds across all
   * three platforms. iOS's underlying setter takes a `TimeInterval`
   * (a `Double` of seconds); the iOS bridge casts. Android and Web
   * take seconds directly with no conversion.
   */
  sessionTimeoutInSeconds?: number;
  /**
   * Whether the plugin installs Braze's own in-app message UI so triggered
   * messages render without any consumer code. Defaults to `true`.
   *
   * Set `false` when your app presents in-app messages itself — the
   * `'inAppMessageReceived'` listener still fires with the full message DTO,
   * but nothing is drawn on screen by the plugin.
   *
   * **Listeners are observational and cannot block or veto display.** With
   * `enableInAppMessageUI: true` the SDK's presenter shows the message
   * regardless of what a listener does; the event is for analytics,
   * control-variant tracking, or mirroring the message into your own UI.
   *
   * Platform behavior:
   *   - **iOS:** skips Braze's `BrazeInAppMessageUI` renderer and installs a
   *     non-rendering presenter that only emits the listener event. To render
   *     the message yourself from native code instead, assign your own
   *     presenter to `BrazePlugin.braze?.inAppMessagePresenter` after
   *     `initialize` resolves; that replaces the plugin's observer, and
   *     `inAppMessageReceived` stops firing (your `present(message:)` is the
   *     equivalent hook).
   *   - **Android:** skips `BrazeInAppMessageManager` registration, so a
   *     host app owns registration for its own Activities.
   *   - **Web:** the plugin subscribes but does not call the SDK's
   *     `showInAppMessage`.
   *
   * @example
   * // Render in-app messages yourself:
   * await Braze.initialize({
   *   apiKey: 'YOUR-SDK-KEY',
   *   endpoint: 'sdk.iad-03.braze.com',
   *   enableInAppMessageUI: false,
   * });
   * await Braze.addListener('inAppMessageReceived', ({ message }) => {
   *   myOwnPresenter.show(message);
   * });
   */
  enableInAppMessageUI?: boolean;
  /**
   * Hands push handling (notification opens, deep links, rich push payloads,
   * and background push) to BrazeKit's push automation. Defaults to `false`.
   *
   * **iOS only.** Android and Web ignore this option: on Android the Braze
   * SDK's manifest-declared receiver already performs the equivalent work,
   * and Web Push has no comparable concept.
   *
   * When `true`, the iOS bridge sets `configuration.push.automation = true`
   * and registers Braze's notification categories with
   * `UNUserNotificationCenter`. When `false` (the default) the plugin never
   * touches the notification center, so an app with its own delegate keeps
   * full control.
   *
   * **Attribution caveat:** `initialize` necessarily runs after app launch,
   * so a push that *launched* the app may already have been delivered to the
   * system before Braze is configured and may not be attributed. Call
   * `initialize` as early as possible in your startup path.
   *
   * @example
   * await Braze.initialize({
   *   apiKey: 'YOUR-SDK-KEY',
   *   endpoint: 'sdk.iad-03.braze.com',
   *   enablePushAutomation: true, // iOS only
   * });
   */
  enablePushAutomation?: boolean;
  /**
   * Lets Braze dashboard users supply JavaScript that runs on your page.
   * Defaults to `false`, and you should leave it there unless you have a
   * specific reason not to. See `SECURITY.md` §6.
   *
   * **Web only.** The option maps 1:1 onto the Braze Web SDK's
   * `InitializationOptions.allowUserSuppliedJavascript`, which the SDK
   * documents as: *"By default, the Braze Web SDK does not allow
   * user-supplied Javascript click actions, or enable HTML in-app messages
   * and Banners"*. Turning it on therefore does two things at once: it
   * permits `javascript:` / `data:` click-action URIs authored in the Braze
   * dashboard, **and** it is what makes HTML in-app messages render on web
   * at all (see {@link BrazeHtmlInAppMessage}).
   *
   * **iOS and Android ignore it**, and not because the plugin chose to drop
   * it — neither native SDK has an equivalent switch. On iOS,
   * `Braze.Configuration` at BrazeKit 18.2.1 exposes no such property
   * (verified against the shipped `.swiftinterface`); HTML in-app messages
   * are rendered by `BrazeInAppMessageUI` in a native `WKWebView` whose
   * script bridge is BrazeKit's own, not arbitrary dashboard JavaScript
   * injected into your app's WebView. On Android, `BrazeConfig.Builder` at
   * `com.braze:android-sdk-ui` 43.2.0 likewise has no counterpart; HTML
   * messages render in the SDK's own in-app-message HTML view. On both
   * platforms the campaign HTML runs in a WebView the Braze SDK owns rather
   * than in your Capacitor WebView, so the Web SDK's page-scope concern —
   * dashboard JavaScript executing against your application's DOM and
   * origin — has no native analogue to gate.
   *
   * The plugin passes the value straight through on web and never defaults
   * it to `true` on your behalf.
   *
   * @example
   * // Opt in ONLY if your Braze workspace has SSO + campaign approval and
   * // you need HTML in-app messages on web:
   * await Braze.initialize({
   *   apiKey: 'YOUR-SDK-KEY',
   *   endpoint: 'sdk.iad-03.braze.com',
   *   allowUserSuppliedJavascript: true,
   * });
   */
  allowUserSuppliedJavascript?: boolean;
  /**
   * Who opens URLs that Braze content (in-app messages, push, content cards)
   * points at. Defaults to `'sdk'`.
   *
   * - `'sdk'` — today's behaviour and the Braze default: the SDK opens the
   *   URL itself, in your WebView or the system browser depending on how the
   *   campaign was authored.
   * - `'app'` — the plugin **suppresses** the SDK's own URL opening and
   *   emits {@link BrazeDeepLinkReceivedEvent} on the `'deepLinkReceived'`
   *   listener instead. Nothing navigates until your code navigates, so you
   *   can vet the URL against an allow-list and route it through your own
   *   router, `@capacitor/browser`, or `@capacitor/app`.
   *
   * This is an **init-time** switch rather than a per-URL veto because
   * Capacitor listeners are fire-and-forget: a JS listener has no return
   * channel back to native, so it cannot answer "allow" or "deny" while the
   * native SDK waits. Choosing the mode up front is the only shape that can
   * actually gate navigation.
   *
   * Per-platform and per-channel coverage differs — see `SECURITY.md` §7 for
   * the full matrix, and {@link BrazeDeepLinkSource} for what `source` can
   * be. In particular, web `'app'` mode covers slideup / modal / full in-app
   * message clicks (message-level and button-level) and **cannot** intercept
   * navigation from inside an HTML in-app message's iframe.
   *
   * @example
   * await Braze.initialize({
   *   apiKey: 'YOUR-SDK-KEY',
   *   endpoint: 'sdk.iad-03.braze.com',
   *   deepLinkHandling: 'app',
   * });
   * await Braze.addListener('deepLinkReceived', ({ url, source, useWebView }) => {
   *   if (!isAllowed(url)) return; // nothing opened it; dropping is enough
   *   if (useWebView) myRouter.navigate(url);
   *   else window.open(url, '_blank');
   *   console.log(`vetted a ${source} deep link`);
   * });
   */
  deepLinkHandling?: BrazeDeepLinkHandling;
}

/**
 * Who opens Braze-authored URLs: the Braze SDK (`'sdk'`, the default) or
 * your app via the `'deepLinkReceived'` listener (`'app'`). See
 * {@link BrazeInitializeOptions.deepLinkHandling}.
 */
export type BrazeDeepLinkHandling = 'sdk' | 'app';

export interface BrazeSetSdkAuthenticationSignatureOptions {
  /**
   * New SDK Authentication signature (signed JWT) to push into the SDK.
   * Used to rotate the signature when the previous one expires or when
   * an `sdkAuthError` event has fired indicating the backend rejected
   * the previous token. See `SECURITY.md` §2.
   */
  signature: string;
}

// =============================================================================
// Bridge sanity check
// =============================================================================

export interface BrazeEchoOptions {
  /** Arbitrary string round-tripped through the native bridge. */
  value: string;
}

export interface BrazeEchoResult {
  /** The same `value` passed in, returned by the native bridge unchanged. */
  value: string;
}

// =============================================================================
// User identity
// =============================================================================

/**
 * Options for {@link BrazePlugin.changeUser}. Identifies the current user to
 * Braze; subsequent events and attributes are attributed to this user.
 */
export interface BrazeChangeUserOptions {
  /**
   * Your application's unique identifier for this user. Often an internal
   * user ID; treat as PII even if it isn't directly readable as one.
   */
  userId: string;
  /**
   * JWT signature generated by your backend, signed with your private key.
   * Required when SDK Authentication is enabled. See `SECURITY.md` §2.
   */
  sdkAuthSignature?: string;
}

export interface BrazeGetUserIdResult {
  /**
   * The current external user ID, or `null` if the user is still anonymous
   * (i.e. {@link BrazePlugin.changeUser} has not been called).
   */
  userId: string | null;
}

// =============================================================================
// User attributes (standard)
//
// Every standard setter accepts `string | null`. Passing null clears the
// attribute (matches native SDK semantics). All work against the current user,
// which defaults to an anonymous profile until `changeUser` is called.
// =============================================================================

export interface BrazeSetEmailOptions {
  /** Email address. Pass `null` to clear. */
  email: string | null;
}

export interface BrazeSetPhoneNumberOptions {
  /** Phone number, ideally E.164 format. Pass `null` to clear. */
  phoneNumber: string | null;
}

export interface BrazeSetFirstNameOptions {
  /** First name. Pass `null` to clear. */
  firstName: string | null;
}

export interface BrazeSetLastNameOptions {
  /** Last name. Pass `null` to clear. */
  lastName: string | null;
}

export interface BrazeSetLanguageOptions {
  /** ISO 639-1 language code, e.g. `"en"`. Pass `null` to clear. */
  language: string | null;
}

export interface BrazeSetCountryOptions {
  /** ISO 3166-1 alpha-2 country code, e.g. `"US"`. Pass `null` to clear. */
  country: string | null;
}

// =============================================================================
// User attributes (custom)
// =============================================================================

/**
 * Value types accepted by {@link BrazePlugin.setCustomUserAttribute} in v0.1.
 * Date and array support land in a later version per `SDK_SURFACE.md` §2.
 *
 * Note: JavaScript has a single `number` type, so the plugin cannot
 * distinguish integer-typed `42` from float-typed `42.0` at the bridge
 * boundary — they JSON-serialize identically. The native bridges
 * dispatch to whichever SDK overload preserves the value's runtime
 * shape: a fractional value (e.g. `42.5`) lands on the Double overload,
 * a whole-number value lands on the Int / Long overload. Braze's
 * dashboard treats both the same way for analytics aggregation, so
 * this normally doesn't matter for consumer code.
 *
 * `null` and `undefined` are not accepted — the plugin rejects them
 * on all three platforms (use a wipe / clear flow if you need to
 * remove an attribute).
 */
export type BrazeAttributeValue = string | number | boolean;

export interface BrazeSetCustomUserAttributeOptions {
  /** Attribute key. Max length / character constraints enforced by Braze backend. */
  key: string;
  /**
   * Attribute value. Must be a string, number, or boolean — `null` and
   * `undefined` are rejected on all three platforms. There is no
   * "clear one attribute" call in v0.1; use {@link BrazePlugin.wipeData}
   * (or a server-side profile update) to remove stored attributes.
   */
  value: BrazeAttributeValue;
}

// =============================================================================
// Subscription groups
// =============================================================================

export interface BrazeSubscriptionGroupOptions {
  /**
   * The Braze-issued UUID of the subscription group. Find it in the Braze
   * dashboard under Subscription Group → API ID.
   */
  groupId: string;
}

// =============================================================================
// Aliases
// =============================================================================

export interface BrazeAddAliasOptions {
  /** Alias value. (alias, label) pairs are unique across users. */
  alias: string;
  /** Label / namespace for this alias, e.g. `"internal_id"`. */
  label: string;
}

// =============================================================================
// Device ID
// =============================================================================

export interface BrazeGetDeviceIdResult {
  /** The Braze SDK-assigned device identifier for the current install. */
  deviceId: string;
}

// =============================================================================
// Demographics
// =============================================================================

export interface BrazeSetDateOfBirthOptions {
  /** Four-digit year. */
  year: number;
  /** Month as 1-12 (January = 1). */
  month: number;
  /** Day of month, 1-31. */
  day: number;
}

/**
 * Gender values mirrored from the Braze SDK enums (Web `User.Genders`,
 * Android `com.braze.enums.Gender`, iOS `Braze.User.Gender`).
 */
export type BrazeGender = 'male' | 'female' | 'other' | 'unknown' | 'not_applicable' | 'prefer_not_to_say';

export interface BrazeSetGenderOptions {
  /** Gender value; see {@link BrazeGender}. */
  gender: BrazeGender;
}

export interface BrazeSetHomeCityOptions {
  /** Home city. Pass `null` to clear. */
  homeCity: string | null;
}

// =============================================================================
// Custom events
// =============================================================================

/**
 * Property value types accepted by Braze custom events. v0.1 supports primitive
 * scalars (string / number / boolean). Date and array support land in a later
 * version per `SDK_SURFACE.md` §2.
 */
export type BrazeEventPropertyValue = string | number | boolean;

/**
 * Map of event property names to primitive values.
 *
 * All three bridges validate every value at the boundary and reject
 * non-scalars (nested objects, arrays, `null`) with
 * ``Braze.<method>: `properties.<key>` must be string, number, or boolean.``
 * The check exists because TypeScript's narrowing is erased at runtime: a
 * property map that came from `JSON.parse` or `any`-typed code would
 * otherwise reach Braze intact on web/iOS and silently lose the offending
 * key on Android.
 *
 * When more than one value is invalid, validation stops at the first one
 * (C04: one error, one message). *Which* key that is can differ by
 * platform — web and Android report the first in key order, iOS reports the
 * first in sorted key order because Swift dictionaries are unordered — so
 * treat the named key as "an" offender, not necessarily "the first one you
 * wrote".
 */
export type BrazeEventProperties = Record<string, BrazeEventPropertyValue>;

export interface BrazeLogCustomEventOptions {
  /** Event name. Max length enforced by the Braze backend (~255 chars). */
  name: string;
  /** Optional event properties. Braze accepts up to ~100 keys per event. */
  properties?: BrazeEventProperties;
}

// =============================================================================
// Feature flags
// =============================================================================

/**
 * Wire-format shape of a single Braze feature flag property. Matches the
 * Web SDK's `PropertiesJson` entry type so the web path is zero-conversion;
 * native bridges serialize their typed property values into this shape.
 *
 * `'image'` is a URL string; `'datetime'` is a Unix timestamp in
 * milliseconds; `'jsonobject'` is a nested JSON object.
 */
export type BrazeFeatureFlagPropertyValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'image'; value: string }
  | { type: 'datetime'; value: number }
  | { type: 'jsonobject'; value: Record<string, unknown> };

export interface BrazeFeatureFlag {
  /** Feature flag identifier as configured in the Braze dashboard. */
  id: string;
  /** Whether the flag is enabled for the current user. */
  enabled: boolean;
  /**
   * Map of property keys to typed property values. Empty for flags with no
   * configured properties.
   *
   * Cross-platform note: on Android and Web the properties are the raw
   * Braze wire format and arrive zero-conversion. On iOS the bridge
   * serializes BrazeKit's typed property enum into the same shape; if you
   * find an iOS-specific gap please file an issue.
   */
  properties: Record<string, BrazeFeatureFlagPropertyValue>;
}

export interface BrazeGetFeatureFlagOptions {
  /** Feature flag identifier. */
  id: string;
}

export interface BrazeGetFeatureFlagResult {
  /** The flag, or `null` if no flag with this `id` is configured. */
  flag: BrazeFeatureFlag | null;
}

export interface BrazeGetAllFeatureFlagsResult {
  /** All feature flags configured for the current user. */
  flags: BrazeFeatureFlag[];
}

export interface BrazeLogFeatureFlagImpressionOptions {
  /** Feature flag identifier whose impression should be logged. */
  id: string;
}

/**
 * Payload delivered to `'featureFlagsUpdated'` listeners. The full current
 * set of feature flags is included on every update; consumers should
 * treat this as a replacement, not a delta.
 */
export interface BrazeFeatureFlagsUpdatedEvent {
  flags: BrazeFeatureFlag[];
}

// =============================================================================
// Content cards
// =============================================================================

/**
 * Discriminator for the four content card variants. Mirrors the Web SDK
 * `Card` class hierarchy (`ClassicCard`, `CaptionedImage`, `ImageOnly`,
 * `ControlCard`) flattened to a string tag so the plugin's DTO survives
 * JSON serialization across the Capacitor bridge.
 */
export type BrazeContentCardType = 'classic' | 'captionedImage' | 'imageOnly' | 'control';

/**
 * Fields present on every content card regardless of type. Cross-platform
 * note: `updated` and `expiresAt` are Unix epoch milliseconds because the
 * Capacitor bridge can't JSON-serialize JS `Date` objects faithfully.
 * Web bridge converts via `.getTime()`; iOS / Android convert via the
 * SDK's millisecond accessors.
 */
export interface BrazeContentCardBase {
  /**
   * Braze-issued card identifier. Used by impression / click logging.
   *
   * Empty string when the SDK supplied a card with no id at all (rare;
   * the Web SDK types `Card.id` as optional). Such a card cannot be
   * click- or impression-logged, so `''` is deliberately kept as the
   * "unusable id" sentinel rather than `null` — it keeps
   * `logContentCardClick({ cardId: card.id })` type-clean and makes the
   * failure surface as the standard `cardId` is required rejection.
   */
  id: string;
  /** Discriminator; narrow to a concrete card type with this field. */
  type: BrazeContentCardType;
  /** Whether the card has been shown to the user. */
  viewed: boolean;
  /** Whether the card is pinned to the top of the feed. */
  pinned: boolean;
  /** Custom key/value metadata configured in the Braze dashboard. */
  extras: Record<string, string>;
  /** Last modification time as Unix epoch ms; `null` if never modified. */
  updated: number | null;
  /** Expiry time as Unix epoch ms; `null` if no expiry. */
  expiresAt: number | null;
  /**
   * The SDK's hint for how the card's click URL should open: `true` means
   * the campaign asked for an in-app WebView, `false` for the system
   * browser. Same meaning as the `useWebView` field on
   * {@link BrazeInAppMessageClickAction}, which is why the field exists —
   * both native SDKs carry the hint on content cards too, and dropping it
   * here while keeping it on in-app messages was an arbitrary asymmetry
   * (2026-09 audit, A2-15 item 2).
   *
   * **Absent on web**, and on any card with no click URL. The Braze Web
   * SDK's `Card` class has no `useWebView` / `openTarget` member at
   * `@braze/web-sdk` 6.13.0 — content cards are rendered by the consumer on
   * web, so the SDK never needs an open-target hint — and C03 forbids
   * fabricating a value the platform does not have. Treat `undefined` as
   * "no preference" and pick your own default.
   *
   * iOS reads it from `Braze.ContentCard.ClickAction.url(_, useWebView:)`;
   * Android from `Card.openUriInWebView`.
   *
   * @example
   * for (const card of cards) {
   *   if (card.type === 'control' || !card.url) continue;
   *   if (card.useWebView === false) window.open(card.url, '_blank');
   *   else myInAppBrowser.open(card.url);
   * }
   */
  useWebView?: boolean;
}

/**
 * Classic content card: title + description + optional image and click URL.
 * The most common card type.
 */
export interface BrazeClassicContentCard extends BrazeContentCardBase {
  type: 'classic';
  title: string;
  description: string;
  imageUrl?: string;
  url?: string;
  linkText?: string;
  /**
   * Aspect ratio hint for the card's optional small image. `null` when the
   * backend didn't supply one — which is the common case for classic cards,
   * since the hint only matters before image load completes.
   */
  aspectRatio: number | null;
  clicked: boolean;
  dismissed: boolean;
  dismissible: boolean;
  language?: string;
  altImageText?: string;
}

/**
 * Card with a large image, title, and description text.
 */
export interface BrazeCaptionedImageContentCard extends BrazeContentCardBase {
  type: 'captionedImage';
  title: string;
  description: string;
  imageUrl: string;
  url?: string;
  linkText?: string;
  /** Aspect ratio hint for image loading. `null` when not provided. */
  aspectRatio: number | null;
  clicked: boolean;
  dismissed: boolean;
  dismissible: boolean;
  language?: string;
  altImageText?: string;
}

/**
 * Image-only card; no title or description.
 */
export interface BrazeImageOnlyContentCard extends BrazeContentCardBase {
  type: 'imageOnly';
  imageUrl: string;
  url?: string;
  aspectRatio: number | null;
  clicked: boolean;
  dismissed: boolean;
  dismissible: boolean;
  language?: string;
  altImageText?: string;
}

/**
 * Control card: represents a user enrolled in the control arm of a
 * content card multivariate test. Should be impression-logged but not
 * rendered as visible content.
 */
export interface BrazeControlContentCard extends BrazeContentCardBase {
  type: 'control';
}

/**
 * Tagged union over the four content card variants. Use the `type`
 * discriminator to narrow.
 *
 * **Unknown-variant policy:** a card the bridge cannot classify into one of
 * these four variants (a card class added by a future Braze SDK, for
 * instance) is **dropped** rather than coerced into the closest-looking
 * variant, and the bridge emits a single non-PII
 * `console.warn('Braze: dropped an unrecognized content card variant')`.
 * Dropping keeps this union honest — narrowing on `type` never hands you a
 * fabricated card — at the cost of the card being invisible to the
 * consumer. The same policy applies to {@link BrazeInAppMessage}.
 *
 * @example
 * if (card.type === 'classic') console.log(card.title);
 */
export type BrazeContentCard =
  BrazeClassicContentCard | BrazeCaptionedImageContentCard | BrazeImageOnlyContentCard | BrazeControlContentCard;

export interface BrazeGetContentCardsResult {
  /** All cards currently cached for the user. Empty if not yet fetched. */
  cards: BrazeContentCard[];
  /** Last-refresh time as Unix epoch ms; `null` if never fetched. */
  lastUpdated: number | null;
}

export interface BrazeLogContentCardClickOptions {
  /** Identifier of the card the user clicked. */
  cardId: string;
}

export interface BrazeLogContentCardImpressionOptions {
  /** Identifier of the card that was shown to the user. */
  cardId: string;
}

/**
 * Payload delivered to `'contentCardsUpdated'` listeners. Same shape as
 * {@link BrazeGetContentCardsResult}; the full current card set is
 * included on every update, not a delta.
 */
export interface BrazeContentCardsUpdatedEvent {
  cards: BrazeContentCard[];
  lastUpdated: number | null;
}

// =============================================================================
// In-app messages
// =============================================================================

/**
 * Click action variants for an in-app message or button. A click action of
 * `none` means no target; `url` means the SDK should open the given URI
 * (the SDK's `useWebView` hint indicates whether the consumer app's
 * embedded browser is preferred over the system browser).
 */
export type BrazeInAppMessageClickAction = { type: 'none' } | { type: 'url'; uri: string; useWebView: boolean };

/**
 * A single button on a modal / full in-app message. Up to two per message.
 * Index 0 is conventionally the dismiss button; index 1 is the call-to-
 * action. Consumers reading the wire format should treat the order as
 * authoritative — the SDK doesn't expose dedicated `primary` / `secondary`
 * roles.
 */
export interface BrazeInAppMessageButton {
  /** Stable button identifier the SDK uses for click analytics. */
  id: number;
  /** Display text of the button. */
  text: string;
  /** Action to perform when the button is tapped. */
  clickAction: BrazeInAppMessageClickAction;
}

/**
 * The five canonical in-app message variants. Mirrors the Web SDK's
 * `SlideUpMessage` / `ModalMessage` / `FullScreenMessage` / `HtmlMessage` /
 * `ControlMessage` hierarchy. BrazeKit iOS's `ModalImage` / `FullImage`
 * variants (image-only forms of modal / full) collapse into `modal` /
 * `full` here with an empty `message` and a populated `imageUrl` —
 * consumers narrow on the image presence, not on a separate type.
 */
export type BrazeInAppMessageType = 'slideup' | 'modal' | 'full' | 'html' | 'control';

/** Fields present on every in-app message regardless of variant. */
export interface BrazeInAppMessageBase {
  type: BrazeInAppMessageType;
  /** Braze-issued trigger / analytics id; null when the SDK didn't provide one. */
  id: string | null;
  /** Click action attached to the message body (variants may add per-button actions). */
  clickAction: BrazeInAppMessageClickAction;
  /** Custom key/value metadata configured in the Braze dashboard. */
  extras: Record<string, string>;
}

/** Sliding banner; auto-dismisses by default. No buttons. */
export interface BrazeSlideupInAppMessage extends BrazeInAppMessageBase {
  type: 'slideup';
  message: string;
  imageUrl?: string;
  imageAltText?: string;
  language?: string;
  /**
   * Font Awesome glyph configured on the campaign, as the raw unicode
   * string the Braze dashboard stores (the code point U+F042 for
   * `fa-adjust`, for example — not the `"fa-adjust"` class name).
   * Absent when the campaign has no icon.
   *
   * Braze renders either an image or an icon and prefers the image, so
   * treat `icon` as a fallback for when `imageUrl` is absent.
   *
   * Cross-platform note: all three bridges emit this field when the SDK
   * supplies it. iOS's `Braze.InAppMessage.Slideup` and Android's
   * `IInAppMessage` both expose the same dashboard-configured value.
   */
  icon?: string;
  /** Direction the banner slides from. */
  slideFrom: 'top' | 'bottom';
}

/**
 * Centered modal. `imageUrl` is optional; when present without `message`
 * text, treat as an image-only modal.
 */
export interface BrazeModalInAppMessage extends BrazeInAppMessageBase {
  type: 'modal';
  header: string;
  message: string;
  imageUrl?: string;
  imageAltText?: string;
  language?: string;
  buttons: BrazeInAppMessageButton[];
}

/**
 * Full-screen message. `imageUrl` is optional; when present without
 * `message` text, treat as an image-only full-screen.
 */
export interface BrazeFullInAppMessage extends BrazeInAppMessageBase {
  type: 'full';
  header: string;
  message: string;
  imageUrl?: string;
  imageAltText?: string;
  language?: string;
  buttons: BrazeInAppMessageButton[];
}

/**
 * Custom HTML rendered inside a WebView. `message` is the raw HTML; the
 * Braze SDK already sandboxes the WebView (no JS bridge unless the host
 * app opts in — see SECURITY.md §6).
 *
 * **Platform note:** on web this variant only occurs when you opted in. The
 * Braze Web SDK gates HTML in-app messages behind its
 * `allowUserSuppliedJavascript` initialization option, which also lets Braze
 * dashboard users execute JavaScript on your page. The plugin exposes that
 * option as {@link BrazeInitializeOptions.allowUserSuppliedJavascript} and
 * defaults it to `false` (C06: secure-by-default), so unless you pass
 * `allowUserSuppliedJavascript: true` an HTML campaign never renders on web
 * and never reaches the `'inAppMessageReceived'` listener. iOS and Android
 * render HTML campaigns unconditionally — neither native SDK has an
 * equivalent switch. See `SECURITY.md` §6.
 *
 * **Deep links:** navigation originating *inside* the HTML message's
 * WebView / iframe is not covered by
 * {@link BrazeInitializeOptions.deepLinkHandling} `'app'` mode on web,
 * because it never passes through the SDK's click-action path. It **is**
 * covered on iOS and Android, where the SDK routes it through the same
 * URL-opening hook as every other channel.
 */
export interface BrazeHtmlInAppMessage extends BrazeInAppMessageBase {
  type: 'html';
  message: string;
}

/**
 * Control variant of an in-app message A/B test. Should be impression-
 * logged but not visually displayed (Braze's default presenter handles
 * this automatically).
 */
export interface BrazeControlInAppMessage extends BrazeInAppMessageBase {
  type: 'control';
}

/**
 * Tagged union over the five in-app message variants. Use the `type`
 * discriminator to narrow.
 *
 * **Unknown-variant policy:** a message the bridge cannot classify into one
 * of these five variants is **dropped** — the `'inAppMessageReceived'` event
 * does not fire for it — and the bridge emits a single non-PII
 * `console.warn('Braze: dropped an unrecognized in-app message variant')`.
 * Earlier versions fabricated an empty `slideup`; that made
 * `message.type === 'slideup'` untrustworthy, so the policy now matches
 * {@link BrazeContentCard}. Display is unaffected: the SDK still renders the
 * message when `enableInAppMessageUI` is on.
 *
 * @example
 * if (message.type === 'modal' && message.imageUrl) {
 *   console.log(`Image modal: ${message.header}`);
 * }
 */
export type BrazeInAppMessage =
  | BrazeSlideupInAppMessage
  | BrazeModalInAppMessage
  | BrazeFullInAppMessage
  | BrazeHtmlInAppMessage
  | BrazeControlInAppMessage;

/**
 * Payload delivered to `'inAppMessageReceived'` listeners. Fires once
 * per IAM trigger, immediately before the SDK's presenter would display
 * the message. Listeners cannot block display — the plugin always
 * returns `DISPLAY_NOW` to the SDK after notifying — but they can read
 * the message contents for analytics, conditional UI changes, or
 * custom presentation overrides.
 */
export interface BrazeInAppMessageReceivedEvent {
  message: BrazeInAppMessage;
}

// =============================================================================
// SDK Authentication errors
// =============================================================================

/**
 * Payload delivered to `'sdkAuthError'` listeners. Fires when Braze's
 * backend rejects an SDK Authentication signature (expired, signed with
 * a rotated-out key, or signed for a different user). See
 * [`SECURITY.md` §2](./SECURITY.md) for the full design.
 *
 * The standard response to an `sdkAuthError` event is for the consumer's
 * app to fetch a fresh signature from their backend and push it back
 * to the SDK via {@link BrazePlugin.setSdkAuthenticationSignature}.
 */
export interface BrazeSdkAuthErrorEvent {
  /**
   * External user id the failed request was authenticated for, or `null`
   * when the request was made for an anonymous user (C03 forbids
   * empty-string sentinels; `null` is the canonical "absent").
   */
  userId: string | null;
  /** Backend-supplied error code (Braze documents the value set). */
  errorCode: number;
  /** Human-readable description of why the signature was rejected. */
  errorReason: string;
  /** The signature that was rejected (truncate before logging). */
  signature: string | null;
  /**
   * Reserved for a future support-correlation id. **Currently always `null`
   * on every platform** — none of the three Braze SDKs surfaces such an id
   * on their SDK-authentication error payloads. Declared now so populating
   * it later isn't a breaking change.
   */
  errorEventId: string | null;
}

// =============================================================================
// Deep links
// =============================================================================

/**
 * Which Braze channel a deep link came from.
 *
 * The set is the union of the two native SDKs' own channel enums —
 * BrazeKit's `Braze.Channel` (`notification` / `inAppMessage` /
 * `contentCard` / `banner`) and Braze Android's `com.braze.enums.Channel`
 * (`PUSH` / `INAPP_MESSAGE` / `CONTENT_CARD` / `BANNER` / `UNKNOWN`). The
 * plugin normalizes `notification` and `PUSH` to the same `'push'` value.
 *
 * `'banner'` is reachable even though the plugin does not expose banners as
 * a DTO: if a host app renders a Braze banner through the native SDK, its
 * click still routes through the same URL hook, and reporting the real
 * channel beats coercing it into a wrong one. `'other'` covers Android's
 * `UNKNOWN` and any channel a future SDK adds.
 */
export type BrazeDeepLinkSource = 'inAppMessage' | 'push' | 'contentCard' | 'banner' | 'other';

/**
 * Payload delivered to `'deepLinkReceived'` listeners. Fires **only** when
 * `initialize` ran with `deepLinkHandling: 'app'`; in the default `'sdk'`
 * mode the SDK opens the URL itself and no event is emitted.
 *
 * By the time this fires the plugin has already told the SDK not to open the
 * URL, so nothing will navigate unless your handler navigates. Dropping the
 * event is a complete, safe "deny" — there is no second call to make.
 *
 * @example
 * await Braze.addListener('deepLinkReceived', ({ url, source, useWebView }) => {
 *   const target = new URL(url);
 *   if (target.protocol !== 'https:' || target.host !== 'example.com') return;
 *   if (useWebView) router.push(target.pathname);
 *   else window.open(url, '_blank');
 *   console.log(`opened a ${source} deep link`);
 * });
 */
export interface BrazeDeepLinkReceivedEvent {
  /** The URL the Braze SDK would have opened, verbatim. */
  url: string;
  /** Which Braze channel the click came from. */
  source: BrazeDeepLinkSource;
  /**
   * The SDK's in-app-WebView-vs-system-browser hint: `true` for an in-app
   * WebView, `false` for the system browser.
   *
   * Non-nullable because every platform genuinely supplies it — this is not
   * a default the plugin invented. iOS reads `Braze.URLContext.useWebView`
   * (a non-optional `Bool`); Android reads `UriAction.useWebView` (a
   * non-null `Boolean`); web derives it from the message's `openTarget`,
   * which `@braze/web-sdk` 6.13.0 defaults to `'NONE'` in the `InAppMessage`
   * constructor rather than leaving undefined, so `'BLANK'` → `false` and
   * everything else → `true`. The mapping matches
   * {@link BrazeInAppMessageClickAction}'s `useWebView`.
   */
  useWebView: boolean;
}

// =============================================================================
// Push token registration
// =============================================================================

export interface BrazeRegisterPushTokenOptions {
  /**
   * The platform-specific push token. On iOS this is the hex-encoded
   * APNs device token (the same string that `@capacitor/push-notifications`
   * emits in its `registration` event). On Android this is the FCM
   * registration token. Web does not have a comparable concept (Web Push
   * uses VAPID via the Push API + Service Worker, with no token to
   * register manually); calling on web throws.
   */
  token: string;
}

// =============================================================================
// Purchases
// =============================================================================

export interface BrazeLogPurchaseOptions {
  /**
   * Product identifier. Max ~255 chars, alphanumeric + punctuation. Cannot
   * begin with `$`. Enforced by the Braze backend.
   */
  productId: string;
  /**
   * ISO 4217 currency code, e.g. `"USD"`. Required by the plugin even where
   * the underlying Web SDK treats it as optional — having currency on every
   * purchase keeps revenue analytics consistent across platforms.
   */
  currency: string;
  /**
   * Per-unit price as a non-negative number in the currency's major units
   * (dollars, not cents). The Android bridge wraps to `BigDecimal`
   * internally.
   */
  price: number;
  /**
   * Number of units purchased. Defaults to `1`. Per Braze: integer in 1-100.
   */
  quantity?: number;
  /** Optional purchase properties (same shape as event properties). */
  properties?: BrazeEventProperties;
}

// =============================================================================
// Privacy / lifecycle
// =============================================================================

export interface BrazeIsDisabledResult {
  /** `true` if {@link BrazePlugin.disableSDK} has been called and not re-enabled. */
  disabled: boolean;
}

// =============================================================================
// Plugin interface
// =============================================================================

export interface BrazePlugin {
  // ---------------------------------------------------------------------------
  // Bridge sanity check
  // ---------------------------------------------------------------------------

  /**
   * Round-trips a value through the native bridge. Useful as a sanity check
   * that the plugin installed correctly on the current platform. Not a Braze
   * SDK method.
   *
   * @example
   * const { value } = await Braze.echo({ value: 'hello' });
   * // value === 'hello'
   */
  echo(options: BrazeEchoOptions): Promise<BrazeEchoResult>;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Initialize the Braze SDK. **Must be called before any other Braze method**
   * except {@link BrazePlugin.echo} and the init-independent privacy/lifecycle
   * methods ({@link BrazePlugin.wipeData}, {@link BrazePlugin.disableSDK},
   * {@link BrazePlugin.enableSDK}, {@link BrazePlugin.isDisabled}).
   *
   * Resolving means the native SDK accepted the configuration. On web the
   * plugin checks the Web SDK's own success flag and rejects with
   * ``Braze.initialize: the Braze Web SDK refused to initialize …`` when it
   * returns `false` (bad key, bad base URL, previously opted-out user, or a
   * crawler user-agent — which the SDK ignores by design). Note that
   * "previously opted out" includes a browser where {@link BrazePlugin.disableSDK}
   * was called and {@link BrazePlugin.enableSDK} has not been: on web the
   * opt-out marker persists across page loads, so re-enable before
   * initializing or the call rejects.
   *
   * Calling `initialize` a **second time in the same process** behaves
   * differently per platform, because the underlying SDKs do:
   *   - **Web:** the plugin tears down and re-wires its event subscriptions
   *     exactly once, and rebuilds the underlying SDK (`destroy()` then
   *     initialize) only when an option the Web SDK fixes at construction —
   *     `apiKey`, `endpoint`, `enableLogging`, `enableSdkAuthentication`,
   *     `allowUserSuppliedJavascript`, `sessionTimeoutInSeconds` — actually
   *     changed, so switching workspace / API key at runtime still works.
   *     Keeping the instance when nothing changed preserves the server
   *     config the SDK only reads once per instance; rebuilding used to
   *     discard it mid-flight and silently gate every later
   *     {@link BrazePlugin.requestContentCardsRefresh} and
   *     {@link BrazePlugin.refreshFeatureFlags} until the next data round
   *     trip.
   *   - **iOS:** the bridge tears down subscriptions, presenters and
   *     delegates and constructs a fresh `Braze` instance with the new
   *     configuration.
   *   - **Android:** the Braze SDK keeps the configuration it was given
   *     first for the lifetime of the process. The call **resolves** (it is
   *     not an error — Activity recreation legitimately re-runs your web
   *     app's `initialize`), plugin-level state such as
   *     `enableSdkAuthentication` is updated, and the SDK logs a warning
   *     that the original configuration is retained. Changing API key or
   *     endpoint on Android requires a process restart.
   *
   * @example
   * await Braze.initialize({
   *   apiKey: 'YOUR-SDK-KEY',
   *   endpoint: 'sdk.iad-03.braze.com',
   *   enableSdkAuthentication: true,
   *   enableInAppMessageUI: true,  // default; false = you render IAMs
   *   enablePushAutomation: true,  // iOS only; ignored elsewhere
   * });
   */
  initialize(options: BrazeInitializeOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // User identity
  // ---------------------------------------------------------------------------

  /**
   * Identifies the current user. Pass an `sdkAuthSignature` if SDK
   * Authentication is enabled (see `SECURITY.md` §2).
   *
   * @example
   * await Braze.changeUser({
   *   userId: 'user_123',
   *   sdkAuthSignature: '<jwt-from-your-backend>',
   * });
   */
  changeUser(options: BrazeChangeUserOptions): Promise<void>;

  /**
   * Returns the current external user ID, or `null` if the user is anonymous.
   *
   * @example
   * const { userId } = await Braze.getUserId();
   * if (!userId) await Braze.changeUser({ userId: 'user_123' });
   */
  getUserId(): Promise<BrazeGetUserIdResult>;

  /**
   * Rotates the SDK Authentication signature without re-running
   * `changeUser`. Use after the previous signature expires (typically
   * every 12-24h depending on your backend's JWT lifetime) or after
   * receiving an SDK Auth error from the Braze backend.
   *
   * Calling this without `enableSdkAuthentication: true` at init time
   * is a no-op in the SDK — the signature is stored but never sent.
   *
   * @example
   * // On a 401-style SDK auth failure or before expiry:
   * const signature = await myBackend.signBrazeSdkAuth(userId);
   * await Braze.setSdkAuthenticationSignature({ signature });
   */
  setSdkAuthenticationSignature(options: BrazeSetSdkAuthenticationSignatureOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // User attributes (standard)
  //
  // All setters work on the current user (anonymous or identified). Pass
  // `null` to clear an attribute. Email/phone are treated as PII per
  // SECURITY.md §3 — the plugin never logs them, even at debug level.
  // ---------------------------------------------------------------------------

  /**
   * Sets the current user's email.
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setEmail({ email: 'jane@example.com' });
   * await Braze.setEmail({ email: null }); // clear
   */
  setEmail(options: BrazeSetEmailOptions): Promise<void>;

  /**
   * Sets the current user's phone number. E.164 format recommended.
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setPhoneNumber({ phoneNumber: '+14155552671' });
   */
  setPhoneNumber(options: BrazeSetPhoneNumberOptions): Promise<void>;

  /**
   * Sets the current user's first name.
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setFirstName({ firstName: 'Jane' });
   */
  setFirstName(options: BrazeSetFirstNameOptions): Promise<void>;

  /**
   * Sets the current user's last name.
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setLastName({ lastName: 'Doe' });
   */
  setLastName(options: BrazeSetLastNameOptions): Promise<void>;

  /**
   * Sets the current user's language. Use ISO 639-1 codes.
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setLanguage({ language: 'en' });
   */
  setLanguage(options: BrazeSetLanguageOptions): Promise<void>;

  /**
   * Sets the current user's country. Use ISO 3166-1 alpha-2 codes.
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setCountry({ country: 'US' });
   */
  setCountry(options: BrazeSetCountryOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // User attributes (custom)
  // ---------------------------------------------------------------------------

  /**
   * Sets a custom user attribute. The native bridge dispatches based on the
   * inferred type of `value` (string / number / boolean → matching Braze SDK
   * overload).
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setCustomUserAttribute({ key: 'loyalty_tier', value: 'gold' });
   * await Braze.setCustomUserAttribute({ key: 'lifetime_orders', value: 12 });
   * await Braze.setCustomUserAttribute({ key: 'has_subscription', value: true });
   */
  setCustomUserAttribute(options: BrazeSetCustomUserAttributeOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Subscription groups
  // ---------------------------------------------------------------------------

  /**
   * Adds the current user to an email or SMS subscription group.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.addToSubscriptionGroup({ groupId: 'group-uuid-from-dashboard' });
   */
  addToSubscriptionGroup(options: BrazeSubscriptionGroupOptions): Promise<void>;

  /**
   * Removes the current user from a subscription group.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.removeFromSubscriptionGroup({ groupId: 'group-uuid' });
   */
  removeFromSubscriptionGroup(options: BrazeSubscriptionGroupOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  /**
   * Adds an alias for the current user. (alias, label) pairs are unique across
   * users — if another user already owns the pair, the alias is rejected by
   * the Braze backend.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.addAlias({ alias: 'cust_1234', label: 'internal_id' });
   */
  addAlias(options: BrazeAddAliasOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Device ID
  // ---------------------------------------------------------------------------

  /**
   * Returns the Braze SDK device identifier for the current install. Useful
   * for debugging and for sending the device ID to your backend for targeted
   * server-side messaging.
   *
   * Requires {@link BrazePlugin.initialize} to have been called. The accessor
   * is instance-bound on iOS (`braze.deviceId`) and Android
   * (`Braze.getInstance(context).deviceId`); only Web exposes a true static.
   * To keep the contract uniform across platforms (see C03 / C07) the plugin
   * gates this method behind the init guard on all three.
   *
   * @example
   * const { deviceId } = await Braze.getDeviceId();
   */
  getDeviceId(): Promise<BrazeGetDeviceIdResult>;

  // ---------------------------------------------------------------------------
  // Demographics
  // ---------------------------------------------------------------------------

  /**
   * Sets the current user's date of birth. `month` is 1-indexed (January = 1)
   * to match the Web SDK contract and to avoid the Java `Calendar.MONTH`
   * 0-indexed surprise. The Android bridge maps `month` to the Braze
   * `Month` enum internally.
   *
   * Unlike the standard string setters, date of birth **cannot be cleared**
   * in v0.1 — the three components are required. The underlying SDKs accept
   * a null-out form; exposing it is a deliberate v0.2+ scope decision, not
   * an oversight.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setDateOfBirth({ year: 1992, month: 7, day: 15 });
   */
  setDateOfBirth(options: BrazeSetDateOfBirthOptions): Promise<void>;

  /**
   * Sets the current user's gender. Accepts the string values listed in
   * {@link BrazeGender}; bridges map them to the matching native enum value.
   *
   * Like {@link BrazePlugin.setDateOfBirth} and unlike the standard string
   * setters, gender **cannot be cleared** in v0.1 — `null` is not accepted.
   * Use `'prefer_not_to_say'` or `'unknown'` to express absence.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setGender({ gender: 'female' });
   */
  setGender(options: BrazeSetGenderOptions): Promise<void>;

  /**
   * Sets the current user's home city. Pass `null` to clear.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.setHomeCity({ homeCity: 'San Francisco' });
   */
  setHomeCity(options: BrazeSetHomeCityOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Custom events
  // ---------------------------------------------------------------------------

  /**
   * Logs a custom event for the current user.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.logCustomEvent({
   *   name: 'cart_viewed',
   *   properties: { items: 3, value: 42.99 },
   * });
   */
  logCustomEvent(options: BrazeLogCustomEventOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  /**
   * Logs a purchase. Required for Braze's revenue analytics. `currency` is
   * required on this contract even though the Web SDK accepts it optionally,
   * because revenue rolls up incorrectly when some events lack currency.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.logPurchase({
   *   productId: 'sku_42',
   *   currency: 'USD',
   *   price: 14.99,
   *   quantity: 1,
   *   properties: { coupon: 'WELCOME10' },
   * });
   */
  logPurchase(options: BrazeLogPurchaseOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------

  /**
   * Returns a single feature flag by identifier, or `null` if no flag with
   * that `id` exists for the current user. Reads from the SDK's local
   * cache; call {@link BrazePlugin.refreshFeatureFlags} to force a fetch.
   *
   * @example
   * const { flag } = await Braze.getFeatureFlag({ id: 'checkout_v2' });
   * if (flag?.enabled) showNewCheckout();
   */
  getFeatureFlag(options: BrazeGetFeatureFlagOptions): Promise<BrazeGetFeatureFlagResult>;

  /**
   * Returns all feature flags currently cached for the user.
   *
   * @example
   * const { flags } = await Braze.getAllFeatureFlags();
   */
  getAllFeatureFlags(): Promise<BrazeGetAllFeatureFlagsResult>;

  /**
   * Requests an immediate refresh of feature flags from the Braze backend.
   * Fire-and-forget: the returned promise resolves once the refresh has
   * been dispatched, **not** once new flags arrive. React to fresh flags
   * with the `'featureFlagsUpdated'` listener, or re-read via
   * {@link BrazePlugin.getAllFeatureFlags} after a short delay. A refresh
   * that fails does not reject; the bridge logs a non-PII warning.
   *
   * @example
   * await Braze.addListener('featureFlagsUpdated', ({ flags }) => {
   *   applyFlags(flags);
   * });
   * await Braze.refreshFeatureFlags();
   */
  refreshFeatureFlags(): Promise<void>;

  /**
   * Logs an impression for a feature flag. Per Braze, limited to one
   * impression per session per flag id.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.logFeatureFlagImpression({ id: 'checkout_v2' });
   */
  logFeatureFlagImpression(options: BrazeLogFeatureFlagImpressionOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Content cards
  // ---------------------------------------------------------------------------

  /**
   * Returns the content cards currently cached for the user. Reads from
   * the SDK's local cache; call {@link BrazePlugin.requestContentCardsRefresh}
   * to force a fetch. Cards the bridge cannot classify are dropped with a
   * console warning — see {@link BrazeContentCard}'s unknown-variant policy.
   *
   * @example
   * const { cards } = await Braze.getContentCards();
   * for (const card of cards) {
   *   if (card.type === 'classic') console.log(card.title);
   * }
   */
  getContentCards(): Promise<BrazeGetContentCardsResult>;

  /**
   * Requests an immediate refresh of content cards from the Braze backend.
   * Fire-and-forget: the returned promise resolves once the refresh has
   * been dispatched, **not** once new cards arrive. Use the
   * `'contentCardsUpdated'` listener to react to fresh cards, or re-read
   * via {@link BrazePlugin.getContentCards} after a short delay. A refresh
   * that fails does not reject; the bridge logs a non-PII warning.
   *
   * @example
   * await Braze.requestContentCardsRefresh();
   */
  requestContentCardsRefresh(): Promise<void>;

  /**
   * Logs a click event for a content card. Call when the user taps a card
   * in your UI. Per Braze: only call when bypassing Braze's built-in
   * display module; the SDK's built-in renderer logs clicks automatically.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.logContentCardClick({ cardId: card.id });
   */
  logContentCardClick(options: BrazeLogContentCardClickOptions): Promise<void>;

  /**
   * Logs an impression for a content card. Call when a card scrolls into
   * view in your UI. Per Braze: only call when bypassing Braze's built-in
   * display module.
   *
   *
   * Resolves once the call has been handed to the Braze SDK — not once the
   * SDK accepted it. Braze validates server-side rules of its own (RFC-5322
   * emails, `$`-prefixed attribute keys, length caps, ISO-4217 currencies)
   * and silently drops what fails them. Where the SDK reports that, the web
   * and Android bridges emit a single non-PII `Braze.<method>: the Braze SDK
   * rejected the value (see SDK logs)` warning and still resolve; a rejected
   * value is logged, not thrown. Enable `enableLogging` at `initialize` to
   * see the SDK's own reason. iOS reports nothing at all — BrazeKit 18.2.1's
   * setters return `Void`.
   * @example
   * await Braze.logContentCardImpression({ cardId: card.id });
   */
  logContentCardImpression(options: BrazeLogContentCardImpressionOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Push token registration
  // ---------------------------------------------------------------------------

  /**
   * Hands a push registration token to the Braze SDK so the user can
   * receive Braze-orchestrated push notifications. **Native-only** —
   * the canonical wiring is:
   *
   *   1. Consumer installs `@capacitor/push-notifications` alongside this
   *      plugin.
   *   2. Consumer calls `PushNotifications.requestPermissions()` and
   *      then `PushNotifications.register()`.
   *   3. In the `registration` listener, consumer forwards the token
   *      here via `Braze.registerPushToken({ token: event.value })`.
   *
   * Platform behavior:
   *   - **iOS:** hex-decodes the APNs token and hands it to
   *     `braze.notifications.register(deviceToken:)`.
   *   - **Android:** assigns to `Braze.getInstance(context).registeredPushToken`
   *     (the SDK's setter for manual FCM token handoff).
   *   - **Web:** throws — Web Push uses VAPID + Service Worker
   *     subscriptions, with no token to register manually. See plugin
   *     MDC C03 for the divergence policy.
   *
   * @example
   * import { PushNotifications } from '@capacitor/push-notifications';
   * import { Braze } from 'capacitor-braze';
   *
   * PushNotifications.addListener('registration', async ({ value }) => {
   *   await Braze.registerPushToken({ token: value });
   * });
   */
  registerPushToken(options: BrazeRegisterPushTokenOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  /**
   * Subscribes to feature flag updates. Fires whenever the Braze SDK
   * refreshes its feature flag cache — either automatically on session
   * open, manually via {@link BrazePlugin.refreshFeatureFlags}, or after
   * a server-driven sync. Initial state is not replayed when the
   * listener attaches; if you need the current snapshot, call
   * {@link BrazePlugin.getAllFeatureFlags} once after `addListener`.
   *
   * @example
   * const handle = await Braze.addListener(
   *   'featureFlagsUpdated',
   *   ({ flags }) => {
   *     console.log(`${flags.length} flags`);
   *   },
   * );
   * // Later:
   * await handle.remove();
   */
  addListener(
    eventName: 'featureFlagsUpdated',
    listenerFunc: (event: BrazeFeatureFlagsUpdatedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to content card updates. Fires whenever the Braze SDK
   * refreshes its content card cache — either on session open, after
   * {@link BrazePlugin.requestContentCardsRefresh}, or after a
   * server-driven sync. Initial state is not replayed when the listener
   * attaches; call {@link BrazePlugin.getContentCards} once after
   * `addListener` if you need the current snapshot.
   *
   * @example
   * const handle = await Braze.addListener(
   *   'contentCardsUpdated',
   *   ({ cards }) => console.log(`${cards.length} cards`),
   * );
   */
  addListener(
    eventName: 'contentCardsUpdated',
    listenerFunc: (event: BrazeContentCardsUpdatedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to in-app message trigger events. Fires once per IAM
   * immediately before the SDK's presenter would display it.
   *
   * **Observational only.** Listeners cannot block, delay, or veto display
   * — the plugin never withholds the message from the SDK's presenter. Use
   * the event for analytics, control-variant tracking, or to mirror the
   * message into your own UI. To take over presentation entirely, pass
   * `enableInAppMessageUI: false` to {@link BrazePlugin.initialize}; the
   * event still fires and nothing is drawn by the plugin.
   *
   * The underlying native subscription is created by `initialize`, so a
   * listener added before `initialize` is silently inert until then (C05).
   * Messages the bridge cannot classify are dropped rather than reshaped —
   * see {@link BrazeInAppMessage}'s unknown-variant policy.
   *
   * @example
   * const handle = await Braze.addListener(
   *   'inAppMessageReceived',
   *   ({ message }) => {
   *     if (message.type === 'control') {
   *       trackControlImpression(message.id);
   *     }
   *   },
   * );
   */
  addListener(
    eventName: 'inAppMessageReceived',
    listenerFunc: (event: BrazeInAppMessageReceivedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to SDK Authentication error events. Fires when Braze's
   * backend rejects a request signed with the consumer's
   * `sdkAuthSignature` (expired JWT, rotated-out signing key, mismatched
   * user id). The standard response is to fetch a fresh signature from
   * the consumer's backend and push it back into the SDK via
   * {@link BrazePlugin.setSdkAuthenticationSignature}.
   *
   * `userId` is `null` when the rejected request was for an anonymous user.
   *
   * @example
   * await Braze.addListener('sdkAuthError', async ({ userId }) => {
   *   if (!userId) return; // anonymous request; nothing to re-sign
   *   const fresh = await myBackend.mintBrazeSignature(userId);
   *   await Braze.setSdkAuthenticationSignature({ signature: fresh });
   * });
   */
  addListener(
    eventName: 'sdkAuthError',
    listenerFunc: (event: BrazeSdkAuthErrorEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to deep links the Braze SDK was about to open.
   *
   * **Only fires when `initialize` ran with `deepLinkHandling: 'app'`.** In
   * that mode the plugin suppresses the SDK's own URL opening first and
   * emits this event instead, so nothing navigates unless your handler
   * navigates. In the default `'sdk'` mode this listener never fires — the
   * SDK opens the URL directly and the plugin is not in the path.
   *
   * Like every Capacitor listener this one is fire-and-forget: it cannot
   * return a decision to native. The decision is the init-time mode, and
   * "deny" is simply not acting on the event. See `SECURITY.md` §7 for the
   * per-platform, per-channel coverage matrix — notably, HTML in-app
   * message iframes on web are not covered.
   *
   * @example
   * await Braze.initialize({ apiKey, endpoint, deepLinkHandling: 'app' });
   * await Braze.addListener('deepLinkReceived', ({ url, source, useWebView }) => {
   *   if (!url.startsWith('https://example.com/')) {
   *     console.warn(`blocked a ${source} deep link`);
   *     return; // nothing opened it
   *   }
   *   if (useWebView) router.push(new URL(url).pathname);
   *   else window.open(url, '_blank');
   * });
   */
  addListener(
    eventName: 'deepLinkReceived',
    listenerFunc: (event: BrazeDeepLinkReceivedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Removes all listeners registered via {@link BrazePlugin.addListener}.
   * The plugin's own SDK subscriptions stay alive, so adding a listener
   * again afterwards works without an `initialize` cycle.
   *
   * The SDK subscriptions are torn down only by the lifecycle methods that
   * invalidate the SDK instance ({@link BrazePlugin.wipeData},
   * {@link BrazePlugin.disableSDK}, {@link BrazePlugin.enableSDK}); the next
   * `initialize` re-creates them. `removeAllListeners` is a JS-side
   * operation and never touches them (C05).
   *
   * @example
   * await Braze.removeAllListeners();
   */
  removeAllListeners(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Privacy / lifecycle
  // ---------------------------------------------------------------------------

  /**
   * **Destructive.** Removes all locally stored Braze SDK data on the device,
   * including the device ID and any queued unsent events.
   *
   * Typical use: GDPR Article 17 right-to-be-forgotten flow, or on user
   * logout. After wiping, you almost always also want to:
   * 1. Call your backend's Braze REST `/users/delete` to remove server-side
   *    profile data.
   * 2. Revoke the user's SDK Authentication signature.
   *
   * See `SECURITY.md` §10 for the complete privacy flow.
   *
   * Init-independent: safe to call before {@link BrazePlugin.initialize} on
   * all three platforms — but what a *pre-init* wipe actually does differs,
   * and both divergences are SDK constraints the plugin cannot paper over:
   *   - **iOS:** falls back to `Braze.wipeDataAndDisableForAppRun()`, which
   *     wipes **and disables the SDK for the rest of this app run**. A
   *     subsequent `initialize` no-ops until the app is relaunched. Call
   *     `initialize` first if you need the SDK alive afterwards.
   *   - **Web:** the Braze Web SDK's storage manager does not exist before
   *     `initialize`, so a pre-init `wipeData()` **wipes nothing**; the SDK
   *     logs a warning and the promise resolves. Initialize first, then wipe.
   *   - **Android:** wipes normally; a later `initialize` works as usual.
   *
   * Post-init on every platform the wipe is complete and the plugin resets
   * its own state, so the next call to any guarded method rejects with the
   * standard init-required error until you `initialize` again.
   *
   * @example
   * // On logout:
   * await Braze.wipeData();
   *
   * @example
   * // Right-to-be-forgotten:
   * await Braze.wipeData();              // local
   * await myBackend.brazeDelete(userId); // server
   */
  wipeData(): Promise<void>;

  /**
   * Halts all data collection by the Braze SDK. No further events or
   * attributes are sent to Braze until {@link BrazePlugin.enableSDK} is called.
   *
   * Typical use: user revokes marketing consent under GDPR/CCPA without
   * fully wiping their data.
   *
   * Init-independent: safe to call before {@link BrazePlugin.initialize} on
   * all three platforms.
   *
   * **Web:** the Braze Web SDK destroys its instance as part of disabling,
   * so the plugin also drops its event subscriptions and clears its
   * initialized state. You must call {@link BrazePlugin.initialize} again
   * after {@link BrazePlugin.enableSDK} before any other method works.
   *
   * @example
   * // User opts out of marketing tracking
   * await Braze.disableSDK();
   */
  disableSDK(): Promise<void>;

  /**
   * Re-enables the Braze SDK after a {@link BrazePlugin.disableSDK} call.
   * No-op on native if the SDK was not previously disabled.
   *
   * Init-independent on all three platforms. On iOS the plugin tracks a
   * pre-init disable locally and applies it when the `Braze` instance is
   * created, so enabling before `initialize` simply clears that flag.
   *
   * **Web:** never a true no-op — the SDK's `enableSDK` destroys its
   * instance, so the plugin drops its subscriptions and clears its
   * initialized state. Call {@link BrazePlugin.initialize} again afterwards
   * (this is the Braze Web SDK's own documented requirement).
   * See `docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md`.
   *
   * @example
   * // User restores consent
   * await Braze.enableSDK();
   * await Braze.initialize({ apiKey, endpoint }); // required on web
   */
  enableSDK(): Promise<void>;

  /**
   * Returns whether the SDK is currently disabled.
   *
   * Init-independent on all three platforms. On iOS, where BrazeKit has no
   * class-level `isDisabled`, the plugin returns the locally tracked
   * pre-init flag (`false` unless {@link BrazePlugin.disableSDK} was called)
   * and reads `!braze.enabled` post-init. Uninitialized != disabled, by
   * convention. See `docs/mdcs/C07-INIT-INDEPENDENT-METHODS.md`.
   *
   * @example
   * const { disabled } = await Braze.isDisabled();
   * if (disabled) console.log('Tracking is paused');
   */
  isDisabled(): Promise<BrazeIsDisabledResult>;

  /**
   * Forces an immediate flush of any queued events to Braze. Normally Braze
   * batches network requests; this bypasses batching.
   *
   * Useful for: (1) Layer 4 smoke testing where you want events to appear in
   * the dashboard immediately, (2) edge cases where app may be killed before
   * the next batch.
   *
   * Requires {@link BrazePlugin.initialize} to have been called.
   *
   * Platform behavior: on **web** the promise resolves when the SDK reports
   * the flush completed and **rejects** if the SDK reports it failed (the
   * queued data is retried on the next successful flush either way). On
   * **iOS** and **Android** the underlying SDK call is fire-and-forget, so
   * the promise resolves once the flush has been requested.
   *
   * @example
   * await Braze.logCustomEvent({ name: 'critical_event' });
   * await Braze.requestImmediateDataFlush(); // don't wait for batch
   */
  requestImmediateDataFlush(): Promise<void>;
}
